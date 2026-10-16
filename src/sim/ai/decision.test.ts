import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { DecisionMind, DecisionSystem, defineDecision, type DecisionAsset } from './decision';

interface Toy {
  mind: DecisionMind<Toy>;
  adult: boolean;
  hungry: boolean;
  ok: boolean;
}
const toy = (o: Partial<Toy> = {}): Toy => ({ mind: new DecisionMind<Toy>(), adult: true, hungry: false, ok: true, ...o });

function system(list: DecisionAsset<Toy>[]): DecisionSystem<Toy> {
  return new DecisionSystem<Toy>((a) => a.mind)
    .registerPredicate('onlyAdult', (a) => a.adult)
    .registerPredicate('onlyHungry', (a) => a.hungry)
    .addList(() => list);
}

describe('DecisionSystem', () => {
  it('respects cooldowns in world seconds', () => {
    const s = system([defineDecision<Toy>({ id: 'a', cooldown: 10 })]);
    const t = toy();
    const rng = new Rng(1);
    expect(s.choose(t, 0, rng)?.id).toBe('a');
    expect(s.choose(t, 5, rng)).toBeNull();
    expect(s.choose(t, 10, rng)?.id).toBe('a');
  });

  it('never chooses disabled decisions', () => {
    const s = system([defineDecision<Toy>({ id: 'a' }), defineDecision<Toy>({ id: 'b' })]);
    const t = toy();
    t.mind.setEnabled('a', false);
    const rng = new Rng(2);
    for (let i = 0; i < 200; i++) expect(s.choose(t, i, rng)?.id).toBe('b');
    t.mind.setEnabled('b', false);
    expect(s.choose(t, 0, rng)).toBeNull();
  });

  it('applies requires filters and launch checks, with cooldown on launch fail', () => {
    const s = system([
      defineDecision<Toy>({ id: 'eat', requires: ['onlyHungry'] }),
      defineDecision<Toy>({ id: 'launch', launchCheck: (a) => a.ok, cooldown: 10, cooldownOnLaunchFail: true, weight: 5 }),
      defineDecision<Toy>({ id: 'plain', weight: -50 }),
    ]);
    const t = toy({ ok: false });
    const rng = new Rng(3);
    expect(s.choose(t, 0, rng)?.id).toBe('plain');
    expect(t.mind.onCooldown('launch', 1)).toBe(true);
    t.hungry = true;
    expect(s.preview(t, 20).map((o) => o.decision.id)).toContain('eat');
  });

  it('priority mode picks only the top layer; critical forces it', () => {
    const list = [
      defineDecision<Toy>({ id: 'lo', priority: 'low', weight: 10 }),
      defineDecision<Toy>({ id: 'hi', priority: 'high', weight: 0 }),
    ];
    const s = system(list);
    const rng = new Rng(4);
    let lo = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) if (s.choose(toy(), 0, rng)?.id === 'lo') lo++;
    // lo only possible in the 20% all-compete branch, where it wins ~1.
    expect(lo / n).toBeGreaterThan(0.15);
    expect(lo / n).toBeLessThan(0.25);

    const forced = system([...list, defineDecision<Toy>({ id: 'crit', priority: 'critical', weight: -20 })]);
    for (let i = 0; i < 500; i++) expect(forced.choose(toy(), 0, rng)?.id).toBe('crit');
  });

  it('softmax frequencies match e^w ratios', () => {
    const s = system([
      defineDecision<Toy>({ id: 'a', weight: 0 }),
      defineDecision<Toy>({ id: 'b', weight: 1 }),
      defineDecision<Toy>({ id: 'c', weight: 2 }),
    ]);
    const rng = new Rng(5);
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const n = 30000;
    for (let i = 0; i < n; i++) counts[s.choose(toy(), 0, rng)!.id]++;
    const z = 1 + Math.E + Math.E ** 2;
    expect(counts.a / n).toBeCloseTo(1 / z, 1);
    expect(counts.b / n).toBeCloseTo(Math.E / z, 1);
    expect(counts.c / n).toBeCloseTo(Math.E ** 2 / z, 1);
    expect(Math.abs(counts.c / counts.b - Math.E)).toBeLessThan(0.15);
  });

  it('preview probabilities sum to 1 and match sampling', () => {
    const s = system([
      defineDecision<Toy>({ id: 'a', priority: 'low', weight: 1 }),
      defineDecision<Toy>({ id: 'b', priority: 'high', weight: 0.5 }),
      defineDecision<Toy>({ id: 'c', priority: 'high', weight: 1.5, weightFn: () => 1.5 }),
    ]);
    const t = toy();
    const prev = s.preview(t, 0);
    expect(prev.reduce((a, o) => a + o.probability, 0)).toBeCloseTo(1, 10);
    const rng = new Rng(6);
    const counts: Record<string, number> = {};
    const n = 30000;
    for (let i = 0; i < n; i++) {
      const id = s.choose(toy(), 0, rng)!.id;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    for (const o of prev) expect(counts[o.decision.id] / n).toBeCloseTo(o.probability, 1);
  });

  it('merges per-agent extra decisions and is deterministic by seed', () => {
    const s = system([defineDecision<Toy>({ id: 'a' })]);
    const run = (seed: number) => {
      const rng = new Rng(seed);
      const t = toy();
      t.mind.extra.push(defineDecision<Toy>({ id: 'x', weight: 0.3 }));
      return Array.from({ length: 50 }, () => s.choose(t, 0, rng)!.id).join('');
    };
    expect(run(9)).toBe(run(9));
    expect(run(9)).toContain('x');
  });
});
