/**
 * A* over the tile grid, ported from Aetheria's original pathfinder.
 *
 * Paths are arrays of flat tile indices, start and goal included. Per-tile
 * cost is `1 / moveSpeed` of the destination tile type (diagonals x1.4), plus
 * a height-difference term and a penalty for damaging tiles. Diagonal steps
 * never cut corners. Land walkers use the grid's walkable flag; `wade` lets
 * them also cross shallow liquid (rivers, lakes, shallows) at its slow speed.
 *
 * Without `wade`, connected land regions are used to fail fast: a goal on a
 * different island returns null without searching.
 */
import type { WorldGrid } from './grid';

export interface PathOptions {
  /** Also cross shallow liquid. Open deep water is never crossable. */
  wade?: boolean;
  /** Give up after this many node expansions (returns null). Default: grid size. */
  maxExpansions?: number;
}

const DIAGONAL_COST = 1.4;
const HEIGHT_COST = 2;
const DAMAGE_COST = 5;

/** Can an actor with these options stand on / pass through this tile? */
export function isPassable(grid: WorldGrid, index: number, options: PathOptions = {}): boolean {
  if (grid.isWalkable(index)) return true;
  return !!options.wade && grid.isLiquid(index) && grid.typeOf(index).depth === 'shallow';
}

/** Cost of stepping from one tile onto an adjacent one. */
export function stepCost(grid: WorldGrid, from: number, to: number): number {
  const type = grid.typeOf(to);
  const diagonal = grid.xOf(from) !== grid.xOf(to) && grid.yOf(from) !== grid.yOf(to);
  let cost = (diagonal ? DIAGONAL_COST : 1) / Math.max(type.moveSpeed, 0.01);
  cost += Math.abs(grid.heights[to] - grid.heights[from]) * HEIGHT_COST;
  cost += type.damageOnStep * DAMAGE_COST;
  return cost;
}

interface Scratch {
  generation: number;
  /** Equals `generation` when the tile has been touched this search. */
  stamp: Uint32Array;
  closed: Uint8Array;
  g: Float32Array;
  f: Float32Array;
  parent: Int32Array;
}

const scratchByGrid = new WeakMap<WorldGrid, Scratch>();

function scratchFor(grid: WorldGrid): Scratch {
  let s = scratchByGrid.get(grid);
  if (!s) {
    s = {
      generation: 0,
      stamp: new Uint32Array(grid.size),
      closed: new Uint8Array(grid.size),
      g: new Float32Array(grid.size),
      f: new Float32Array(grid.size),
      parent: new Int32Array(grid.size),
    };
    scratchByGrid.set(grid, s);
  }
  return s;
}

/** Binary min-heap of tile indices ordered by `f`; stale entries are skipped by the caller. */
class Heap {
  private readonly items: number[] = [];
  private readonly keys: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, key: number): void {
    const { items, keys } = this;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      items[i] = items[p];
      keys[i] = keys[p];
      i = p;
    }
    items[i] = item;
    keys[i] = key;
  }
  pop(): number {
    const { items, keys } = this;
    const top = items[0];
    const item = items.pop()!;
    const key = keys.pop()!;
    const n = items.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= key) break;
        items[i] = items[c];
        keys[i] = keys[c];
        i = c;
      }
      items[i] = item;
      keys[i] = key;
    }
    return top;
  }
}

/**
 * Cheapest path from `start` to `goal` (flat indices), or null when either end
 * is impassable, they lie in different land regions, the search budget runs
 * out, or no route exists. A path from a tile to itself is `[start]`.
 */
export function findPath(grid: WorldGrid, start: number, goal: number, options: PathOptions = {}): number[] | null {
  if (start < 0 || goal < 0 || start >= grid.size || goal >= grid.size) return null;
  if (!isPassable(grid, start, options) || !isPassable(grid, goal, options)) return null;
  if (start === goal) return [start];
  if (!options.wade && !grid.sameRegion(start, goal)) return null;

  const s = scratchFor(grid);
  const gen = ++s.generation;
  const maxExpansions = options.maxExpansions ?? grid.size;
  const w = grid.width;
  const gx = grid.xOf(goal);
  const gy = grid.yOf(goal);
  // Every tile costs at least 1 / maxMoveSpeed orthogonally; speeds are <= 1 by
  // convention, so the octile distance is an admissible estimate.
  const heuristic = (i: number): number => {
    const dx = Math.abs(grid.xOf(i) - gx);
    const dy = Math.abs(grid.yOf(i) - gy);
    return Math.max(dx, dy) + (DIAGONAL_COST - 1) * Math.min(dx, dy);
  };

  const open = new Heap();
  s.stamp[start] = gen;
  s.closed[start] = 0;
  s.g[start] = 0;
  s.f[start] = heuristic(start);
  s.parent[start] = -1;
  open.push(start, s.f[start]);

  let expansions = 0;
  while (open.size > 0) {
    const current = open.pop();
    if (s.closed[current] === 1) continue;
    if (current === goal) return reconstruct(s.parent, goal);
    if (++expansions > maxExpansions) return null;
    s.closed[current] = 1;

    const cx = current % w;
    const cy = (current - cx) / w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!grid.inBounds(nx, ny)) continue;
        const next = ny * w + nx;
        if (s.stamp[next] === gen && s.closed[next] === 1) continue;
        if (!isPassable(grid, next, options)) continue;
        // Never cut a corner: both orthogonal tiles must be passable too.
        if (dx !== 0 && dy !== 0) {
          if (!isPassable(grid, cy * w + nx, options) || !isPassable(grid, ny * w + cx, options)) continue;
        }
        const g = s.g[current] + stepCost(grid, current, next);
        if (s.stamp[next] !== gen) {
          s.stamp[next] = gen;
          s.closed[next] = 0;
        } else if (g >= s.g[next]) {
          continue;
        }
        s.g[next] = g;
        s.f[next] = g + heuristic(next);
        s.parent[next] = current;
        open.push(next, s.f[next]);
      }
    }
  }
  return null;
}

function reconstruct(parent: Int32Array, goal: number): number[] {
  const path: number[] = [];
  for (let i = goal; i !== -1; i = parent[i]) path.push(i);
  return path.reverse();
}

/** Total movement cost of a path, e.g. for comparing routes. */
export function pathCost(grid: WorldGrid, path: readonly number[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += stepCost(grid, path[i - 1], path[i]);
  return total;
}

/**
 * Closest passable tile to (x, y), searched outward in rings. Rescues
 * anything that ends up somewhere impossible (a flooded tile, a pit).
 */
export function findNearestPassable(
  grid: WorldGrid,
  x: number,
  y: number,
  options: PathOptions = {},
  maxRadius = 12,
): number | null {
  for (let radius = 0; radius <= maxRadius; radius++) {
    let best = -1;
    let bestDistance = Infinity;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        if (!grid.inBounds(x + dx, y + dy)) continue;
        const i = grid.index(x + dx, y + dy);
        if (!isPassable(grid, i, options)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      }
    }
    if (best >= 0) return best;
  }
  return null;
}
