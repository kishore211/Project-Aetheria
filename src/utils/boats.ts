// Boats.
//
// Without them a kingdom is a prisoner of its island: colonists walk, so the
// first sea they meet is the edge of their world. WorldBox's coastal towns put
// boats on the water — fishing boats that bring food home, and transports that
// carry settlers across to found a colony somewhere they could never have
// walked (06-WORLDBOX-COMPLETE-REFERENCE.md §7, Colonisation).
//
// This module is the sailing: water geometry, routes, and the boats moving
// along them. It knows nothing about villages or rendering. The settlement
// system decides when a boat is launched and what happens when it arrives,
// through two hooks, so the whole thing can be tested on a bare grid.
import { isWaterBiome, type Tile } from '../types/world';

export interface Point {
  x: number;
  y: number;
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const inBounds = (tiles: Tile[][], x: number, y: number) =>
  x >= 0 && y >= 0 && x < tiles.length && y < tiles.length;

export const isSailable = (tile: Tile | undefined): boolean => Boolean(tile && isWaterBiome(tile.type));

/**
 * The nearest water tile to a point, searching outward ring by ring.
 *
 * Rings rather than a flood so that "nearest" means nearest as the crow flies
 * — a village on a headland should launch from the beach below it, not from
 * whichever cove a flood happened to reach first.
 */
export const nearestWater = (tiles: Tile[][], from: Point, maxRadius: number): Point | null => {
  const cx = Math.round(from.x);
  const cy = Math.round(from.y);
  for (let r = 0; r <= maxRadius; r++) {
    let best: Point | null = null;
    let bestDistance = Infinity;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!inBounds(tiles, x, y) || !isSailable(tiles[x][y])) continue;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) { bestDistance = distance; best = { x, y }; }
      }
    }
    if (best) return best;
  }
  return null;
};

/** The nearest dry, standable tile to a point — where passengers step ashore. */
export const nearestShore = (tiles: Tile[][], from: Point, maxRadius: number): Point | null => {
  const cx = Math.round(from.x);
  const cy = Math.round(from.y);
  for (let r = 0; r <= maxRadius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!inBounds(tiles, x, y)) continue;
        const tile = tiles[x][y];
        if (!isSailable(tile) && tile.height > 0.25 && tile.walkable !== false) return { x, y };
      }
    }
  }
  return null;
};

/**
 * A route across water, or null if the two points do not share a sea.
 *
 * Breadth-first over the eight neighbours. Diagonal steps between two land
 * corners are refused, or a boat would slip through a one-tile isthmus that
 * is plainly land on the map.
 */
export const waterPath = (tiles: Tile[][], from: Point, to: Point): Point[] | null => {
  const n = tiles.length;
  if (!inBounds(tiles, from.x, from.y) || !inBounds(tiles, to.x, to.y)) return null;
  if (!isSailable(tiles[from.x][from.y]) || !isSailable(tiles[to.x][to.y])) return null;
  const came = new Int32Array(n * n).fill(-1);
  const start = from.y * n + from.x;
  const goal = to.y * n + to.x;
  const queue = new Int32Array(n * n);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  came[start] = start;
  while (head < tail) {
    const index = queue[head++];
    if (index === goal) break;
    const x = index % n;
    const y = (index - x) / n;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const next = ny * n + nx;
      if (came[next] !== -1 || !isSailable(tiles[nx][ny])) continue;
      if (dx !== 0 && dy !== 0 && (!isSailable(tiles[x + dx][y]) || !isSailable(tiles[x][y + dy]))) continue;
      came[next] = index;
      queue[tail++] = next;
    }
  }
  if (came[goal] === -1) return null;
  const path: Point[] = [];
  for (let at = goal; at !== start; at = came[at]) path.push({ x: at % n, y: Math.floor(at / n) });
  path.push({ x: from.x, y: from.y });
  return path.reverse();
};

/**
 * Label every connected landmass, and say how big each one is.
 *
 * What "another island" means. Recomputed when a colony is being planned
 * rather than cached, because the player can raise and drown land at will
 * and a stale map of islands would send boats to places that are not there.
 */
export const landmasses = (tiles: Tile[][]): { label: Int32Array; sizes: number[] } => {
  const n = tiles.length;
  const label = new Int32Array(n * n).fill(-1);
  const sizes: number[] = [];
  const queue = new Int32Array(n * n);
  for (let sx = 0; sx < n; sx++) {
    for (let sy = 0; sy < n; sy++) {
      const seed = sy * n + sx;
      if (label[seed] !== -1 || isSailable(tiles[sx][sy])) continue;
      const id = sizes.length;
      let head = 0;
      let tail = 0;
      queue[tail++] = seed;
      label[seed] = id;
      while (head < tail) {
        const index = queue[head++];
        const x = index % n;
        const y = (index - x) / n;
        for (let k = 0; k < 4; k++) {
          const [dx, dy] = NEIGHBOURS[k];
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
          const next = ny * n + nx;
          if (label[next] !== -1 || isSailable(tiles[nx][ny])) continue;
          label[next] = id;
          queue[tail++] = next;
        }
      }
      sizes.push(tail);
    }
  }
  return { label, sizes };
};

// -- the fleet --------------------------------------------------------------

export type BoatKind = 'fishing' | 'transport';

export interface Boat {
  id: string;
  kind: BoatKind;
  kingdomId: string;
  /** Home village, for fishing boats. */
  villageId: string | null;
  /** Position in tile units, tile centres on .5. */
  x: number;
  y: number;
  /** -1 or 1, for which way the sprite faces. */
  facing: number;
  path: Point[];
  step: number;
  state: 'outbound' | 'fishing' | 'inbound' | 'voyage';
  timer: number;
  dock: Point;
  /** Where a transport is going, and who is on it. */
  destination: Point | null;
  passengers: string[];
  /** Opaque to this module: whatever the launcher needs back on landing. */
  payload: string | null;
}

export interface BoatHooks {
  /** A fishing boat came home with its catch. */
  onCatch?: (boat: Boat, food: number) => void;
  /** A transport reached the far shore (or ran aground trying). */
  onLand?: (boat: Boat, shore: Point) => void;
}

const SPEED: Record<BoatKind, number> = { fishing: 1.6, transport: 2.4 };
/** Seconds a fishing boat sits on the grounds before turning for home. */
const FISHING_TIME = 6;
/** Food one trip brings home. */
export const CATCH = 4;

let boatCounter = 0;

export class BoatSystem {
  readonly boats = new Map<string, Boat>();
  private tiles: Tile[][];
  private hooks: BoatHooks;

  constructor(tiles: Tile[][], hooks: BoatHooks = {}) {
    this.tiles = tiles;
    this.hooks = hooks;
  }

  fishingBoatsOf(villageId: string): number {
    let count = 0;
    for (const boat of this.boats.values()) if (boat.villageId === villageId) count++;
    return count;
  }

  /** Every passenger currently at sea, so the settlement can tell who is aboard. */
  passengersAtSea(): Set<string> {
    const aboard = new Set<string>();
    for (const boat of this.boats.values()) for (const id of boat.passengers) aboard.add(id);
    return aboard;
  }

  launchFishing(villageId: string, kingdomId: string, dock: Point, random: () => number = Math.random): Boat | null {
    if (!isSailable(this.tiles[dock.x]?.[dock.y])) return null;
    const boat = this.make('fishing', kingdomId, dock);
    boat.villageId = villageId;
    if (!this.sendFishing(boat, random)) return null;
    this.boats.set(boat.id, boat);
    return boat;
  }

  /**
   * Put a transport on the water. Returns null when there is no sea route,
   * which is the caller's cue to try somewhere else.
   */
  launchTransport(
    kingdomId: string, from: Point, to: Point, passengers: string[], payload: string | null,
  ): Boat | null {
    const path = waterPath(this.tiles, from, to);
    if (!path) return null;
    const boat = this.make('transport', kingdomId, from);
    boat.path = path;
    boat.state = 'voyage';
    boat.destination = to;
    boat.passengers = [...passengers];
    boat.payload = payload;
    this.boats.set(boat.id, boat);
    return boat;
  }

  /** A village is gone: its fishing boats go with it. */
  removeVillage(villageId: string): void {
    for (const [id, boat] of this.boats) if (boat.villageId === villageId) this.boats.delete(id);
  }

  clear(): void {
    this.boats.clear();
  }

  update(delta: number, random: () => number = Math.random): void {
    for (const boat of Array.from(this.boats.values())) {
      if (boat.state === 'fishing') {
        boat.timer -= delta;
        if (boat.timer <= 0) {
          const home = waterPath(this.tiles, { x: Math.floor(boat.x), y: Math.floor(boat.y) }, boat.dock);
          if (!home) { this.boats.delete(boat.id); continue; }
          boat.path = home;
          boat.step = 0;
          boat.state = 'inbound';
        }
        continue;
      }
      if (!this.sail(boat, delta)) continue;
      this.arrive(boat, random);
    }
  }

  // -- internals --------------------------------------------------------

  private make(kind: BoatKind, kingdomId: string, at: Point): Boat {
    boatCounter += 1;
    return {
      id: `boat-${boatCounter}`,
      kind,
      kingdomId,
      villageId: null,
      x: at.x + 0.5,
      y: at.y + 0.5,
      facing: 1,
      path: [],
      step: 0,
      state: 'outbound',
      timer: 0,
      dock: { ...at },
      destination: null,
      passengers: [],
      payload: null,
    };
  }

  /** Pick a fishing ground near the dock and head for it. */
  private sendFishing(boat: Boat, random: () => number): boolean {
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = random() * Math.PI * 2;
      const reach = 3 + random() * 6;
      const x = Math.round(boat.dock.x + Math.cos(angle) * reach);
      const y = Math.round(boat.dock.y + Math.sin(angle) * reach);
      if (!isSailable(this.tiles[x]?.[y])) continue;
      const path = waterPath(this.tiles, { x: Math.floor(boat.x), y: Math.floor(boat.y) }, { x, y });
      if (!path || path.length < 2) continue;
      boat.path = path;
      boat.step = 0;
      boat.state = 'outbound';
      return true;
    }
    return false;
  }

  /** Move along the path. Returns true on reaching its end. */
  private sail(boat: Boat, delta: number): boolean {
    let budget = SPEED[boat.kind] * delta;
    while (budget > 0) {
      const next = boat.path[boat.step + 1];
      if (!next) return true;
      // The player may have raised land across the route since it was
      // planned. A boat does not sail through a mountain.
      if (!isSailable(this.tiles[next.x]?.[next.y])) {
        return this.reroute(boat);
      }
      const tx = next.x + 0.5;
      const ty = next.y + 0.5;
      const dx = tx - boat.x;
      const dy = ty - boat.y;
      const distance = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.01) boat.facing = dx > 0 ? 1 : -1;
      if (distance <= budget) {
        boat.x = tx;
        boat.y = ty;
        boat.step += 1;
        budget -= distance;
      } else {
        boat.x += (dx / distance) * budget;
        boat.y += (dy / distance) * budget;
        budget = 0;
      }
    }
    return boat.step >= boat.path.length - 1;
  }

  private reroute(boat: Boat): boolean {
    const here = { x: Math.floor(boat.x), y: Math.floor(boat.y) };
    const goal = boat.path[boat.path.length - 1];
    const path = waterPath(this.tiles, here, goal);
    if (path) {
      boat.path = path;
      boat.step = 0;
      return false;
    }
    if (boat.kind === 'transport') {
      // Nowhere to go: run aground and put everyone ashore where it stands.
      return true;
    }
    this.boats.delete(boat.id);
    return false;
  }

  private arrive(boat: Boat, random: () => number): void {
    if (boat.kind === 'transport') {
      const shore = nearestShore(this.tiles, { x: boat.x, y: boat.y }, 6) ?? { x: Math.floor(boat.x), y: Math.floor(boat.y) };
      this.hooks.onLand?.(boat, shore);
      this.boats.delete(boat.id);
      return;
    }
    if (boat.state === 'outbound') {
      boat.state = 'fishing';
      boat.timer = FISHING_TIME;
      return;
    }
    // Home with the catch, and straight back out.
    this.hooks.onCatch?.(boat, CATCH);
    if (!this.sendFishing(boat, random)) this.boats.delete(boat.id);
  }
}
