import type { SimSystem, World } from '../world';
import type { SimObject, SimObjectInit } from './sim-object';

export interface ObjectCodec<T extends SimObject, S> {
  serialize(obj: T): S;
  /** Rebuild an object; `init` carries the saved id/kind/created. */
  deserialize(data: S): T;
}

export interface ManagerSnapshot<S> {
  objects: S[];
}

/**
 * Owns all live objects of one kind. Registered on the World as a SimSystem.
 *
 * Removal is deferred-safe: `remove` flags the object dead and fires hooks at
 * once, but the object leaves the table at the start of the next `update`, so
 * removing during iteration is fine. Dead objects are invisible to get,
 * iteration and count.
 */
export class ObjectManager<T extends SimObject, S = unknown> implements SimSystem {
  private readonly table = new Map<number, T>();
  private readonly dirty: T[] = [];
  private readonly removedHooks: Array<(obj: T, world: World) => void> = [];
  private live = 0;
  private sorted = true;
  private maxId = 0;

  constructor(
    readonly id: string,
    readonly kind: string,
    private readonly codec?: ObjectCodec<T, S>,
  ) {}

  /** Mint an id and build the object. */
  create(world: World, build: (init: SimObjectInit) => T): T {
    const obj = build({ id: world.ids.mint(this.kind), kind: this.kind, created: world.clock.time });
    this.insert(obj);
    return obj;
  }

  get(id: number): T | undefined {
    const o = this.table.get(id);
    return o && o.alive ? o : undefined;
  }

  has(id: number): boolean {
    return this.get(id) !== undefined;
  }

  get count(): number {
    return this.live;
  }

  /** Register a hook run when an object is removed. Returns an unsubscribe. */
  onRemoved(hook: (obj: T, world: World) => void): () => void {
    this.removedHooks.push(hook);
    return () => {
      const i = this.removedHooks.indexOf(hook);
      if (i >= 0) this.removedHooks.splice(i, 1);
    };
  }

  remove(world: World, obj: T): boolean {
    if (!obj.alive || this.table.get(obj.id) !== obj) return false;
    obj.alive = false;
    this.live--;
    this.dirty.push(obj);
    for (const hook of [...this.removedHooks]) hook(obj, world);
    return true;
  }

  /** Live objects in ascending id order. */
  *[Symbol.iterator](): IterableIterator<T> {
    this.ensureSorted();
    for (const o of this.table.values()) if (o.alive) yield o;
  }

  toArray(): T[] {
    return [...this];
  }

  /** Drop removed objects from the table. */
  cleanup(): void {
    if (this.dirty.length === 0) return;
    for (const o of this.dirty) if (this.table.get(o.id) === o) this.table.delete(o.id);
    this.dirty.length = 0;
  }

  update(world: World, dt: number): void {
    this.cleanup();
    this.onUpdate(world, dt);
  }

  /** Per-tick behaviour for subclasses. */
  protected onUpdate(_world: World, _dt: number): void {}

  snapshot(): ManagerSnapshot<S> {
    if (!this.codec) throw new Error(`${this.id}: no codec, cannot snapshot`);
    return { objects: this.toArray().map((o) => this.codec!.serialize(o)) };
  }

  restore(state: ManagerSnapshot<S>): void {
    if (!this.codec) throw new Error(`${this.id}: no codec, cannot restore`);
    this.table.clear();
    this.dirty.length = 0;
    this.live = 0;
    this.sorted = true;
    this.maxId = 0;
    for (const data of state.objects) this.insert(this.codec.deserialize(data));
  }

  private insert(obj: T): void {
    if (this.table.has(obj.id)) throw new Error(`${this.id}: duplicate object id ${obj.id}`);
    if (obj.id < this.maxId) this.sorted = false;
    else this.maxId = obj.id;
    this.table.set(obj.id, obj);
    this.live++;
  }

  private ensureSorted(): void {
    if (this.sorted) return;
    const entries = [...this.table.entries()].sort((a, b) => a[0] - b[0]);
    this.table.clear();
    for (const [k, v] of entries) this.table.set(k, v);
    this.sorted = true;
  }
}
