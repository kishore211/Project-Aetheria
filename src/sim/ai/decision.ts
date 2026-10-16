/**
 * Utility-based decision system, generic over the agent type.
 *
 * Decisions are data (DecisionAsset). Choosing gathers candidates from
 * pluggable lists, drops anything on cooldown / disabled / filtered out /
 * failing its launch check, then samples by softmax (chance_i = e^weight_i).
 * Content-free: layers, filters and lists are supplied by the caller.
 */
import type { Asset } from '../core/library';
import type { Rng } from '../core/rng';

/** Priority layers, lowest to highest. */
export const PRIORITY_LAYERS = ['idle', 'low', 'normal', 'high', 'critical'] as const;
export type PriorityLayer = (typeof PRIORITY_LAYERS)[number];
/** Layers that force priority mode when any candidate sits in them. */
export const CRITICAL_LAYERS: ReadonlySet<PriorityLayer> = new Set<PriorityLayer>(['critical']);

export function layerRank(layer: PriorityLayer): number {
  return PRIORITY_LAYERS.indexOf(layer);
}

/** Probability that a choice uses priority mode when nothing is critical. */
export const PRIORITY_MODE_CHANCE = 0.8;

export interface DecisionAsset<A> extends Asset {
  /** Task started when chosen; defaults to the decision id. */
  readonly taskId?: string;
  readonly priority: PriorityLayer;
  readonly weight: number;
  readonly weightFn?: (agent: A) => number;
  /** World seconds before this decision may be chosen again by the same agent. */
  readonly cooldown: number;
  readonly launchCheck?: (agent: A) => boolean;
  /** Start the cooldown even when the launch check fails. */
  readonly cooldownOnLaunchFail?: boolean;
  /** Names of predicates in the registry that must all hold. */
  readonly requires?: readonly string[];
}

export function defineDecision<A>(
  d: Partial<DecisionAsset<A>> & Pick<DecisionAsset<A>, 'id'>,
): DecisionAsset<A> {
  return { priority: 'normal', weight: 0, cooldown: 0, ...d };
}

export function decisionTaskId<A>(d: DecisionAsset<A>): string {
  return d.taskId ?? d.id;
}

/** Per-agent decision state (cooldowns, the "mind editor" enable set, extras). */
export class DecisionMind<A> {
  /** decision id -> world time at which it becomes available again. */
  readonly cooldowns = new Map<string, number>();
  readonly disabled = new Set<string>();
  readonly extra: DecisionAsset<A>[] = [];

  isEnabled(id: string): boolean {
    return !this.disabled.has(id);
  }

  setEnabled(id: string, enabled: boolean): void {
    if (enabled) this.disabled.delete(id);
    else this.disabled.add(id);
  }

  onCooldown(id: string, now: number): boolean {
    const until = this.cooldowns.get(id);
    return until !== undefined && now < until;
  }

  startCooldown(d: DecisionAsset<A>, now: number): void {
    if (d.cooldown > 0) this.cooldowns.set(d.id, now + d.cooldown);
  }
}

export type DecisionPredicate<A> = (agent: A) => boolean;
export type DecisionList<A> = (agent: A) => readonly DecisionAsset<A>[];

export interface DecisionOption<A> {
  readonly decision: DecisionAsset<A>;
  readonly weight: number;
  readonly probability: number;
}

export class DecisionSystem<A> {
  private readonly predicates = new Map<string, DecisionPredicate<A>>();
  private readonly lists: DecisionList<A>[] = [];

  constructor(private readonly mindOf: (agent: A) => DecisionMind<A>) {}

  registerPredicate(name: string, predicate: DecisionPredicate<A>): this {
    this.predicates.set(name, predicate);
    return this;
  }

  /** Add a list provider (e.g. one per agent category). */
  addList(list: DecisionList<A>): this {
    this.lists.push(list);
    return this;
  }

  private candidates(agent: A, now: number, launch: 'check' | 'check-and-cool'): DecisionAsset<A>[] {
    const mind = this.mindOf(agent);
    const seen = new Set<string>();
    const out: DecisionAsset<A>[] = [];
    const sources: (readonly DecisionAsset<A>[])[] = [...this.lists.map((l) => l(agent)), mind.extra];
    for (const source of sources) {
      for (const d of source) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        if (!mind.isEnabled(d.id) || mind.onCooldown(d.id, now)) continue;
        if (d.requires && !d.requires.every((n) => this.predicate(n)(agent))) continue;
        if (d.launchCheck && !d.launchCheck(agent)) {
          if (launch === 'check-and-cool' && d.cooldownOnLaunchFail) mind.startCooldown(d, now);
          continue;
        }
        out.push(d);
      }
    }
    return out;
  }

  private predicate(name: string): DecisionPredicate<A> {
    const p = this.predicates.get(name);
    if (!p) throw new Error(`decision: unknown predicate "${name}"`);
    return p;
  }

  private static weightOf<A>(d: DecisionAsset<A>, agent: A): number {
    return d.weightFn ? d.weightFn(agent) : d.weight;
  }

  /** Softmax chances e^w (shifted by the max for stability; ratios are unchanged). */
  private static softmax(weights: readonly number[]): number[] {
    if (!weights.length) return [];
    const max = Math.max(...weights);
    const e = weights.map((w) => Math.exp(w - max));
    const total = e.reduce((a, b) => a + b, 0);
    return e.map((v) => v / total);
  }

  private static topLayer<A>(list: readonly DecisionAsset<A>[]): DecisionAsset<A>[] {
    let best = -1;
    for (const d of list) best = Math.max(best, layerRank(d.priority));
    return list.filter((d) => layerRank(d.priority) === best);
  }

  /** Gameplay choice: starts the chosen decision's cooldown. Null if nothing is possible. */
  choose(agent: A, now: number, rng: Rng): DecisionAsset<A> | null {
    const all = this.candidates(agent, now, 'check-and-cool');
    if (!all.length) return null;
    const forced = all.some((d) => CRITICAL_LAYERS.has(d.priority));
    const priorityRoll = rng.chance(PRIORITY_MODE_CHANCE);
    const pool = forced || priorityRoll ? DecisionSystem.topLayer(all) : all;
    const probs = DecisionSystem.softmax(pool.map((d) => DecisionSystem.weightOf(d, agent)));
    const chosen = pool[rng.weighted(probs)];
    this.mindOf(agent).startCooldown(chosen, now);
    return chosen;
  }

  /**
   * Non-gameplay preview for a UI mind panel: every possible decision with its
   * overall probability, mixing priority and all-compete modes. No side effects.
   */
  preview(agent: A, now: number): DecisionOption<A>[] {
    const all = this.candidates(agent, now, 'check');
    if (!all.length) return [];
    const forced = all.some((d) => CRITICAL_LAYERS.has(d.priority));
    const weights = all.map((d) => DecisionSystem.weightOf(d, agent));
    const allProbs = DecisionSystem.softmax(weights);
    const top = DecisionSystem.topLayer(all);
    const topProbs = DecisionSystem.softmax(top.map((d) => DecisionSystem.weightOf(d, agent)));
    const pPriority = forced ? 1 : PRIORITY_MODE_CHANCE;
    return all.map((d, i) => {
      const ti = top.indexOf(d);
      const p = pPriority * (ti >= 0 ? topProbs[ti] : 0) + (1 - pPriority) * allProbs[i];
      return { decision: d, weight: weights[i], probability: p };
    });
  }
}
