/**
 * Content libraries.
 *
 * All game content (creatures, traits, buildings, powers, decisions…) is data
 * registered in a library, not a code path. A library is populated once at
 * start-up, then frozen; lookups are by string id.
 */

export interface Asset {
  readonly id: string;
}

export class Library<T extends Asset> {
  private readonly byId = new Map<string, T>();
  private readonly ordered: T[] = [];
  private frozen = false;

  constructor(readonly name: string) {}

  /** Register an asset. Ids are unique; re-adding is a bug. */
  add<A extends T>(asset: A): A {
    if (this.frozen) throw new Error(`${this.name}: library is frozen, cannot add "${asset.id}"`);
    if (this.byId.has(asset.id)) throw new Error(`${this.name}: duplicate id "${asset.id}"`);
    this.byId.set(asset.id, asset);
    this.ordered.push(asset);
    return asset;
  }

  /** Derive a new asset from an existing one, overriding some fields. */
  clone(id: string, fromId: string, overrides: Partial<T> = {}): T {
    const base = this.get(fromId);
    return this.add({ ...base, ...overrides, id } as T);
  }

  get(id: string): T {
    const asset = this.byId.get(id);
    if (!asset) throw new Error(`${this.name}: unknown id "${id}"`);
    return asset;
  }

  find(id: string | null | undefined): T | undefined {
    return id == null ? undefined : this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  all(): readonly T[] {
    return this.ordered;
  }

  filter(predicate: (asset: T) => boolean): T[] {
    return this.ordered.filter(predicate);
  }

  get size(): number {
    return this.ordered.length;
  }

  freeze(): this {
    this.frozen = true;
    return this;
  }
}
