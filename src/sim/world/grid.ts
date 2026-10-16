/**
 * The tile grid. Every field is a typed array indexed by the flat index
 * `y * width + x`. Fields that other systems hot-loop over are exposed as
 * readonly array references; writes go through the typed setters so changes
 * are tracked.
 *
 * Change tracking: setters mark the tile dirty (only when the value actually
 * changes). Consumers either call `drainDirty()` to take the batch of changed
 * indices, or `emitDirty()` to publish one 'tile:changed' per dirty tile on
 * the optional events hook. There is deliberately no event per write.
 *
 * Regions: connected components of walkable tiles (4-connectivity), labelled
 * lazily. Anything that changes a tile's walkability invalidates the labels.
 */
import type { SimEvents } from '../core/events';
import { resourceKinds, tileTypes, topLayers, type TileType } from './tiles';

export const TileFlag = {
  Liquid: 1,
  Walkable: 2,
  OnFire: 4,
  Road: 8,
} as const;

const ORTHOGONAL: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DIAGONAL: ReadonlyArray<readonly [number, number]> = [[1, -1], [1, 1], [-1, 1], [-1, -1]];

export class WorldGrid {
  readonly size: number;

  readonly heights: Float32Array;
  readonly moistures: Float32Array;
  readonly fertilities: Float32Array;
  readonly temperatures: Float32Array;
  /** Index into `tileTypes`. */
  readonly typeIds: Uint16Array;
  /** Index into `topLayers`; 0 = none. */
  readonly topLayerIds: Uint8Array;
  /** Bitset of `TileFlag`. */
  readonly flags: Uint8Array;
  readonly fireIntensity: Uint8Array;
  readonly fuel: Uint8Array;
  readonly heat: Float32Array;
  /** Owning city id; 0 = unowned. */
  readonly cityIds: Int32Array;
  /** Building id; 0 = none. */
  readonly buildingIds: Int32Array;
  /** Index into `resourceKinds`; 0 = none. */
  readonly resourceIds: Uint8Array;
  readonly resourceAmounts: Uint8Array;

  private readonly dirtyMark: Uint8Array;
  private dirtyList: number[] = [];

  private regionIds: Int32Array;
  private regionSizes: number[] = [0];
  private regionsStale = true;

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly events?: SimEvents,
  ) {
    this.size = width * height;
    const n = this.size;
    this.heights = new Float32Array(n);
    this.moistures = new Float32Array(n);
    this.fertilities = new Float32Array(n);
    this.temperatures = new Float32Array(n);
    this.typeIds = new Uint16Array(n);
    this.topLayerIds = new Uint8Array(n);
    this.flags = new Uint8Array(n);
    this.fireIntensity = new Uint8Array(n);
    this.fuel = new Uint8Array(n);
    this.heat = new Float32Array(n);
    this.cityIds = new Int32Array(n);
    this.buildingIds = new Int32Array(n);
    this.resourceIds = new Uint8Array(n);
    this.resourceAmounts = new Uint8Array(n);
    this.dirtyMark = new Uint8Array(n);
    this.regionIds = new Int32Array(n);
    this.applyTypeFlags(0, 0);
    this.flags.fill(this.flags[0]);
    this.resetDirty();
  }

  // --- coordinates ---------------------------------------------------------

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Flat index of (x, y). */
  index(x: number, y: number): number {
    return y * this.width + x;
  }

  xOf(index: number): number {
    return index % this.width;
  }

  yOf(index: number): number {
    return Math.floor(index / this.width);
  }

  /**
   * Neighbour indices of a tile, clipped to the map. Orthogonal neighbours
   * come first (N, E, S, W), then diagonals when requested.
   */
  neighbors(index: number, diagonal = false, out: number[] = []): number[] {
    out.length = 0;
    const x = index % this.width;
    const y = (index - x) / this.width;
    for (const [dx, dy] of ORTHOGONAL) {
      if (this.inBounds(x + dx, y + dy)) out.push(index + dy * this.width + dx);
    }
    if (diagonal) {
      for (const [dx, dy] of DIAGONAL) {
        if (this.inBounds(x + dx, y + dy)) out.push(index + dy * this.width + dx);
      }
    }
    return out;
  }

  // --- change tracking -----------------------------------------------------

  markDirty(index: number): void {
    if (this.dirtyMark[index]) return;
    this.dirtyMark[index] = 1;
    this.dirtyList.push(index);
  }

  get dirtyCount(): number {
    return this.dirtyList.length;
  }

  /** Take the batch of changed indices (ascending order of first change) and clear it. */
  drainDirty(): number[] {
    const out = this.dirtyList;
    this.dirtyList = [];
    for (const i of out) this.dirtyMark[i] = 0;
    return out;
  }

  /** Drop pending changes without reporting them (bulk generation, loads). */
  resetDirty(): void {
    this.drainDirty();
  }

  /** Publish one 'tile:changed' per dirty tile on the events hook, then clear. */
  emitDirty(): number {
    const dirty = this.drainDirty();
    if (this.events) {
      for (const i of dirty) this.events.emit('tile:changed', { x: i % this.width, y: Math.floor(i / this.width) });
    }
    return dirty.length;
  }

  // --- terrain type --------------------------------------------------------

  typeOf(index: number): TileType {
    return tileTypes.all()[this.typeIds[index]];
  }

  typeIdOf(index: number): string {
    return this.typeOf(index).id;
  }

  setType(index: number, typeId: string): void {
    const type = tileTypes.get(typeId);
    if (this.typeIds[index] === type.index) return;
    this.typeIds[index] = type.index;
    this.applyTypeFlags(index, type.index);
    this.markDirty(index);
  }

  /** Re-derive liquid/walkable from the type; leaves fire and road bits alone. */
  private applyTypeFlags(index: number, typeIndex: number): void {
    const type = tileTypes.all()[typeIndex];
    const before = this.flags[index];
    let f = before & ~(TileFlag.Liquid | TileFlag.Walkable);
    if (type.liquid) f |= TileFlag.Liquid;
    if (type.walkable) f |= TileFlag.Walkable;
    this.flags[index] = f;
    if ((before ^ f) & TileFlag.Walkable) this.regionsStale = true;
  }

  /**
   * Recompute flags from types for the whole grid and invalidate regions.
   * Use after writing `typeIds` directly in bulk.
   */
  refreshFlags(): void {
    for (let i = 0; i < this.size; i++) this.applyTypeFlags(i, this.typeIds[i]);
    this.regionsStale = true;
  }

  // --- scalar fields -------------------------------------------------------

  setHeight(index: number, value: number): void {
    if (this.heights[index] === Math.fround(value)) return;
    this.heights[index] = value;
    this.markDirty(index);
  }

  setMoisture(index: number, value: number): void {
    if (this.moistures[index] === Math.fround(value)) return;
    this.moistures[index] = value;
    this.markDirty(index);
  }

  setFertility(index: number, value: number): void {
    if (this.fertilities[index] === Math.fround(value)) return;
    this.fertilities[index] = value;
    this.markDirty(index);
  }

  setTemperature(index: number, value: number): void {
    if (this.temperatures[index] === Math.fround(value)) return;
    this.temperatures[index] = value;
    this.markDirty(index);
  }

  setHeat(index: number, value: number): void {
    this.heat[index] = value;
  }

  setFuel(index: number, value: number): void {
    this.fuel[index] = Math.max(0, Math.min(255, value));
  }

  // --- top layer -----------------------------------------------------------

  topLayerOf(index: number): string {
    return topLayers.all()[this.topLayerIds[index]].id;
  }

  setTopLayer(index: number, layerId: string): void {
    const layer = topLayers.get(layerId);
    if (this.topLayerIds[index] === layer.index) return;
    this.topLayerIds[index] = layer.index;
    this.markDirty(index);
  }

  // --- flags ---------------------------------------------------------------

  hasFlag(index: number, flag: number): boolean {
    return (this.flags[index] & flag) !== 0;
  }

  setFlag(index: number, flag: number, on: boolean): void {
    const before = this.flags[index];
    const after = on ? before | flag : before & ~flag;
    if (before === after) return;
    this.flags[index] = after;
    if (flag & TileFlag.Walkable) this.regionsStale = true;
    this.markDirty(index);
  }

  isLiquid(index: number): boolean {
    return (this.flags[index] & TileFlag.Liquid) !== 0;
  }

  isWalkable(index: number): boolean {
    return (this.flags[index] & TileFlag.Walkable) !== 0;
  }

  isOnFire(index: number): boolean {
    return (this.flags[index] & TileFlag.OnFire) !== 0;
  }

  hasRoad(index: number): boolean {
    return (this.flags[index] & TileFlag.Road) !== 0;
  }

  /** Block or unblock walking on a tile independent of its type (e.g. walls). */
  setWalkable(index: number, walkable: boolean): void {
    this.setFlag(index, TileFlag.Walkable, walkable);
  }

  setRoad(index: number, road: boolean): void {
    this.setFlag(index, TileFlag.Road, road);
  }

  // --- fire ----------------------------------------------------------------

  setFire(index: number, intensity: number): void {
    const v = Math.max(0, Math.min(255, Math.round(intensity)));
    this.fireIntensity[index] = v;
    this.setFlag(index, TileFlag.OnFire, v > 0);
    this.markDirty(index);
  }

  // --- ownership -----------------------------------------------------------

  setCity(index: number, cityId: number): void {
    if (this.cityIds[index] === cityId) return;
    this.cityIds[index] = cityId;
    this.events?.emit('tile:owner', { x: index % this.width, y: Math.floor(index / this.width), cityId });
    this.markDirty(index);
  }

  setBuilding(index: number, buildingId: number): void {
    if (this.buildingIds[index] === buildingId) return;
    this.buildingIds[index] = buildingId;
    this.markDirty(index);
  }

  // --- resources -----------------------------------------------------------

  resourceOf(index: number): string {
    return resourceKinds.all()[this.resourceIds[index]].id;
  }

  setResource(index: number, resourceId: string, amount: number): void {
    const kind = resourceKinds.get(resourceId);
    const a = kind.index === 0 ? 0 : Math.max(0, Math.min(255, Math.round(amount)));
    if (this.resourceIds[index] === kind.index && this.resourceAmounts[index] === a) return;
    this.resourceIds[index] = kind.index;
    this.resourceAmounts[index] = a;
    this.markDirty(index);
  }

  // --- regions -------------------------------------------------------------

  /** Force the next region query to relabel (call after bulk edits). */
  invalidateRegions(): void {
    this.regionsStale = true;
  }

  /** Region id of a tile; 0 for non-walkable tiles. Labels are 1-based. */
  regionOf(index: number): number {
    this.ensureRegions();
    return this.regionIds[index];
  }

  regionSize(regionId: number): number {
    this.ensureRegions();
    return this.regionSizes[regionId] ?? 0;
  }

  /** Number of walkable regions (islands). */
  get regionCount(): number {
    this.ensureRegions();
    return this.regionSizes.length - 1;
  }

  /** True when both tiles are walkable and in the same connected land region. */
  sameRegion(a: number, b: number): boolean {
    this.ensureRegions();
    const r = this.regionIds[a];
    return r !== 0 && r === this.regionIds[b];
  }

  private ensureRegions(): void {
    if (!this.regionsStale) return;
    this.regionsStale = false;
    const ids = this.regionIds;
    ids.fill(0);
    const sizes = [0];
    const stack: number[] = [];
    const w = this.width;
    for (let start = 0; start < this.size; start++) {
      if (ids[start] !== 0 || !this.isWalkable(start)) continue;
      const label = sizes.length;
      let count = 0;
      ids[start] = label;
      stack.push(start);
      while (stack.length) {
        const i = stack.pop()!;
        count++;
        const x = i % w;
        const y = (i - x) / w;
        if (y > 0) this.visit(i - w, label, stack);
        if (x < w - 1) this.visit(i + 1, label, stack);
        if (y < this.height - 1) this.visit(i + w, label, stack);
        if (x > 0) this.visit(i - 1, label, stack);
      }
      sizes.push(count);
    }
    this.regionSizes = sizes;
  }

  private visit(i: number, label: number, stack: number[]): void {
    if (this.regionIds[i] !== 0 || !this.isWalkable(i)) return;
    this.regionIds[i] = label;
    stack.push(i);
  }
}
