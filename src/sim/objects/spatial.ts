export interface Spatial {
  readonly id: number;
  x: number;
  y: number;
}

/** Uniform-grid spatial hash for radius queries on objects with x/y. */
export class SpatialHash<T extends Spatial> {
  private readonly buckets = new Map<number, Set<T>>();
  private readonly cellOf = new Map<number, number>();

  constructor(readonly cellSize = 8) {
    if (!(cellSize > 0)) throw new Error('cellSize must be > 0');
  }

  get size(): number {
    return this.cellOf.size;
  }

  private cx(x: number): number {
    return Math.floor(x / this.cellSize);
  }

  private key(cx: number, cy: number): number {
    return (cx + 0x100000) * 0x200000 + (cy + 0x100000);
  }

  insert(item: T): void {
    if (this.cellOf.has(item.id)) this.remove(item);
    const k = this.key(this.cx(item.x), this.cx(item.y));
    let b = this.buckets.get(k);
    if (!b) this.buckets.set(k, (b = new Set()));
    b.add(item);
    this.cellOf.set(item.id, k);
  }

  remove(item: T): boolean {
    const k = this.cellOf.get(item.id);
    if (k === undefined) return false;
    this.cellOf.delete(item.id);
    const b = this.buckets.get(k);
    if (b) {
      b.delete(item);
      if (b.size === 0) this.buckets.delete(k);
    }
    return true;
  }

  /** Call after changing x/y; cheap when the item stays in its cell. */
  update(item: T): void {
    const old = this.cellOf.get(item.id);
    const k = this.key(this.cx(item.x), this.cx(item.y));
    if (old === k) return;
    if (old !== undefined) this.remove(item);
    this.insert(item);
  }

  /** Items within `radius` (inclusive) of a point, ascending id. */
  queryRadius(x: number, y: number, radius: number): T[] {
    const out: T[] = [];
    const r2 = radius * radius;
    const x0 = this.cx(x - radius);
    const x1 = this.cx(x + radius);
    const y0 = this.cx(y - radius);
    const y1 = this.cx(y + radius);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const b = this.buckets.get(this.key(cx, cy));
        if (!b) continue;
        for (const o of b) {
          const dx = o.x - x;
          const dy = o.y - y;
          if (dx * dx + dy * dy <= r2) out.push(o);
        }
      }
    }
    return out.sort((a, b) => a.id - b.id);
  }

  clear(): void {
    this.buckets.clear();
    this.cellOf.clear();
  }
}
