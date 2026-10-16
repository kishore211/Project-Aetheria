/**
 * Seeded randomness for the simulation.
 *
 * Every consumer draws from a *named stream*, so adding a draw in one system
 * never re-rolls another. A world is reproducible from its seed plus the
 * player's actions.
 */

/** Hash a string to a 32-bit seed (FNV-1a). */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** Uniform in [0, 1). mulberry32. */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return p > 0 && this.next() < p;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  pick<T>(items: readonly T[]): T | undefined {
    return items.length ? items[Math.floor(this.next() * items.length)] : undefined;
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /** Index chosen with probability proportional to weights[i] (non-negative). */
  weighted(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return -1;
    let roll = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      roll -= Math.max(0, weights[i]);
      if (roll < 0) return i;
    }
    return weights.length - 1;
  }

  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }
}

/** A family of independent named streams derived from one world seed. */
export class RngStreams {
  private readonly streams = new Map<string, Rng>();

  constructor(private readonly seed: number) {}

  get(name: string): Rng {
    let rng = this.streams.get(name);
    if (!rng) {
      rng = new Rng(hashSeed(`${this.seed}:${name}`));
      this.streams.set(name, rng);
    }
    return rng;
  }

  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [name, rng] of this.streams) out[name] = rng.getState();
    return out;
  }

  restore(states: Record<string, number>): void {
    for (const [name, state] of Object.entries(states)) this.get(name).setState(state);
  }
}
