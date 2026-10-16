import type { Library } from '../core/library';
import type { StatAsset } from './stat-asset';

/** What one source contributes: per stat id, flat adds and multiplier adds. */
export interface StatContribution {
  readonly flat?: Readonly<Record<string, number>>;
  readonly mult?: Readonly<Record<string, number>>;
}

export interface StatBreakdownEntry {
  source: string;
  flat: number;
  mult: number;
}

export interface StatBreakdown {
  id: string;
  base: number;
  flat: number;
  mult: number;
  raw: number;
  value: number;
  min: number;
  max: number;
  clamped: boolean;
  entries: StatBreakdownEntry[];
}

/**
 * Aggregates named sources ('asset', 'trait:fast', 'item:12', 'status:burning',
 * 'culture', 'subspecies', 'age'…) into final stat values.
 * Recompute is lazy: edits mark dirty, the first read recomputes all stats.
 */
export class StatContainer {
  private readonly sources = new Map<string, StatContribution>();
  private final: Float64Array;
  private dirty = true;
  private readonly index: Map<string, number>;
  private readonly defs: readonly StatAsset[];
  /** Number of full recomputes, exposed for tests/diagnostics. */
  recomputes = 0;

  constructor(private readonly library: Library<StatAsset>) {
    this.defs = library.all();
    this.index = new Map(this.defs.map((d, i) => [d.id, i]));
    this.final = new Float64Array(this.defs.length);
  }

  /** Add or replace a source. */
  set(source: string, contribution: StatContribution): void {
    this.sources.set(source, contribution);
    this.dirty = true;
  }

  remove(source: string): boolean {
    const had = this.sources.delete(source);
    if (had) this.dirty = true;
    return had;
  }

  /** Remove every source whose name starts with the prefix (e.g. 'trait:'). */
  removeWhere(prefix: string): number {
    let n = 0;
    for (const key of [...this.sources.keys()]) {
      if (key.startsWith(prefix)) {
        this.sources.delete(key);
        n++;
      }
    }
    if (n) this.dirty = true;
    return n;
  }

  has(source: string): boolean {
    return this.sources.has(source);
  }

  sourceNames(): string[] {
    return [...this.sources.keys()];
  }

  /** Mark dirty without changing sources (e.g. if a contribution object was mutated). */
  invalidate(): void {
    this.dirty = true;
  }

  get(id: string): number {
    const i = this.index.get(id);
    if (i === undefined) throw new Error(`stats: unknown stat "${id}"`);
    if (this.dirty) this.recompute();
    return this.final[i];
  }

  snapshot(): Record<string, number> {
    if (this.dirty) this.recompute();
    const out: Record<string, number> = {};
    for (let i = 0; i < this.defs.length; i++) out[this.defs[i].id] = this.final[i];
    return out;
  }

  breakdown(id: string): StatBreakdown {
    const def = this.library.get(id);
    const entries: StatBreakdownEntry[] = [];
    let flat = 0;
    let mult = 0;
    for (const [source, c] of this.sources) {
      const f = c.flat?.[id] ?? 0;
      const m = c.mult?.[id] ?? 0;
      if (f === 0 && m === 0) continue;
      entries.push({ source, flat: f, mult: m });
      flat += f;
      mult += m;
    }
    const raw = (def.default + flat) * (1 + mult);
    const value = clamp(raw, def.min, def.max);
    return { id, base: def.default, flat, mult, raw, value, min: def.min, max: def.max, clamped: value !== raw, entries };
  }

  private recompute(): void {
    const n = this.defs.length;
    const flat = new Float64Array(n);
    const mult = new Float64Array(n);
    for (const c of this.sources.values()) {
      if (c.flat) for (const k in c.flat) this.accumulate(flat, k, c.flat[k]);
      if (c.mult) for (const k in c.mult) this.accumulate(mult, k, c.mult[k]);
    }
    for (let i = 0; i < n; i++) {
      const d = this.defs[i];
      this.final[i] = clamp((d.default + flat[i]) * (1 + mult[i]), d.min, d.max);
    }
    this.dirty = false;
    this.recomputes++;
  }

  private accumulate(arr: Float64Array, id: string, v: number): void {
    const i = this.index.get(id);
    if (i === undefined) throw new Error(`stats: unknown stat "${id}" in source`);
    arr[i] += v;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
