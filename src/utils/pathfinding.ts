// src/utils/pathfinding.ts
import { biomesWhere } from '../content/biomes';
import { Tile, BiomeType, EntityType, isWaterBiome } from '../types/world';

/** Creatures that live in water and cannot leave it. */
const AQUATIC: EntityType[] = ['fish', 'piranha'];
/** Creatures that ignore terrain entirely. */
const AIRBORNE: EntityType[] = ['bird', 'dragon', 'fairy', 'ghost', 'bee', 'butterfly', 'fire_skull', 'ufo', 'angel'];
/**
 * Creatures that will wade or swim across fresh water and shallows. Everything
 * else keeps its feet dry — a land animal standing in the sea is the bug that
 * strands whole populations.
 */
const SWIMMERS: EntityType[] = ['bear', 'wolf', 'deer', 'orc', 'human', 'elemental', 'crocodile', 'turtle', 'frog', 'penguin', 'dog', 'buffalo', 'seal', 'polar_bear', 'flamingo', 'crabzilla'];
/** Water a swimmer will cross, as opposed to open sea nobody crosses. */
const SHALLOW: BiomeType[] = biomesWhere(def => def.shallowWater);

export const isAquatic = (type: EntityType): boolean => AQUATIC.includes(type);
export const isAirborne = (type: EntityType): boolean => AIRBORNE.includes(type);
export const canSwim = (type: EntityType): boolean => SWIMMERS.includes(type);

/** Bumped once per search so tile costs can be invalidated lazily. */
let searchGeneration = 0;

/** One entry in the A* open set. Stale entries are skipped when popped. */
interface OpenEntry {
  tile: Tile;
  /** gCost when queued; an entry is live only while the tile still has this g. */
  g: number;
  f: number;
  h: number;
  /** Order in which the tile first joined the open set (the tie-break). */
  seq: number;
}

/** Lowest F, then lowest H, then earliest to join: the order the search expands in. */
function openBefore(a: OpenEntry, b: OpenEntry): boolean {
  // `|| Infinity` mirrors the scalar costs, where an unset or zero cost ranks last.
  const fa = a.f || Infinity;
  const fb = b.f || Infinity;
  if (fa !== fb) return fa < fb;
  const ha = a.h || Infinity;
  const hb = b.h || Infinity;
  if (ha !== hb) return ha < hb;
  return a.seq < b.seq;
}

/** Swap two heap slots in place (destructuring would allocate on every swap). */
function swapEntries(heap: OpenEntry[], a: number, b: number): void {
  const held = heap[a];
  heap[a] = heap[b];
  heap[b] = held;
}

function heapPush(heap: OpenEntry[], entry: OpenEntry): void {
  heap.push(entry);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (!openBefore(heap[i], heap[parent])) break;
    swapEntries(heap, i, parent);
    i = parent;
  }
}

function heapPop(heap: OpenEntry[]): OpenEntry | undefined {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length > 0 && last) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let best = i;
      if (left < heap.length && openBefore(heap[left], heap[best])) best = left;
      if (right < heap.length && openBefore(heap[right], heap[best])) best = right;
      if (best === i) break;
      swapEntries(heap, i, best);
      i = best;
    }
  }
  return top;
}

/**
 * A* Pathfinding algorithm for entities to navigate the world
 */
export function findPath(
  startTile: Tile,
  targetTile: Tile,
  tiles: Tile[][],
  entityType: EntityType
): Tile[] {
  // The search could only end in failure, and would burn its whole budget finding that out
  if (provablyUnreachable(startTile, targetTile, tiles, entityType)) return [];

  // Every search gets its own stamp instead of wiping the whole grid first.
  // Clearing 16,384 tiles per call cost more than the search itself once a few
  // dozen creatures were routing at once.
  const search = ++searchGeneration;
  const visit = (tile: Tile) => {
    if (tile.searchStamp !== search) {
      tile.searchStamp = search;
      tile.gCost = undefined;
      tile.hCost = undefined;
      tile.fCost = undefined;
      tile.parent = undefined;
      tile.closed = false;
      tile.openSeq = undefined;
    }
    return tile;
  };

  // The open set is a heap ordered by openBefore. Costs only ever fall while a
  // tile is open, so a cheaper route is queued as a fresh entry and the old one
  // is ignored when it surfaces. Each tile joins the open set once (its seq).
  const openHeap: OpenEntry[] = [];
  let nextSeq = 0;

  visit(startTile);
  visit(targetTile);

  startTile.gCost = 0;
  startTile.hCost = calculateHeuristic(startTile, targetTile);
  startTile.fCost = startTile.hCost;
  startTile.openSeq = nextSeq++;
  heapPush(openHeap, { tile: startTile, g: 0, f: startTile.fCost, h: startTile.hCost, seq: startTile.openSeq });

  // A hard ceiling keeps one hopeless search from stalling a frame
  let expansions = 0;
  const maxExpansions = 4000;

  for (;;) {
    // Find the lowest-F open tile, discarding entries superseded by a cheaper route
    let entry = heapPop(openHeap);
    while (entry && (entry.tile.closed || entry.tile.gCost !== entry.g)) entry = heapPop(openHeap);
    if (!entry) break;

    if (++expansions > maxExpansions) return [];

    const currentTile = entry.tile;

    // Check if we reached the target
    if (currentTile === targetTile) {
      return reconstructPath(currentTile);
    }

    // Move current tile from open set to closed set
    currentTile.closed = true;

    const neighbors = getNeighbors(currentTile, tiles);

    for (const raw of neighbors) {
      const neighbor = visit(raw);
      if (neighbor.closed) continue;

      // Skip if tile is not walkable for this entity type
      if (!isWalkableForEntity(neighbor, entityType)) continue;

      // Never cut a corner: a diagonal step needs both orthogonal tiles to be
      // passable too. Without this, movement between two diagonal tile centres
      // clips the corner of the tile between them — which is how creatures end
      // up briefly standing in the sea while walking around a bay.
      if (neighbor.x !== currentTile.x && neighbor.y !== currentTile.y) {
        const sideA = tiles[neighbor.x]?.[currentTile.y];
        const sideB = tiles[currentTile.x]?.[neighbor.y];
        if (!sideA || !isWalkableForEntity(sideA, entityType)) continue;
        if (!sideB || !isWalkableForEntity(sideB, entityType)) continue;
      }

      // Calculate tentative G cost (distance from start)
      const tentativeGCost = (currentTile.gCost || 0) + getMovementCost(currentTile, neighbor, entityType);

      // Not yet open, or a cheaper route to an open tile
      const isNewPath = neighbor.openSeq === undefined;
      if (isNewPath || tentativeGCost < (neighbor.gCost || Infinity)) {
        // Update neighbor's costs and parent
        neighbor.gCost = tentativeGCost;
        neighbor.hCost = calculateHeuristic(neighbor, targetTile);
        neighbor.fCost = (neighbor.gCost || 0) + (neighbor.hCost || 0);
        neighbor.parent = currentTile;

        if (isNewPath) neighbor.openSeq = nextSeq++;
        heapPush(openHeap, {
          tile: neighbor,
          g: neighbor.gCost,
          f: neighbor.fCost,
          h: neighbor.hCost,
          seq: neighbor.openSeq as number,
        });
      }
    }
  }

  // No path found
  return [];
}

/**
 * Calculate heuristic (estimated distance to target)
 */
function calculateHeuristic(a: Tile, b: Tile): number {
  // Manhattan distance
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Get all valid neighboring tiles
 */
function getNeighbors(tile: Tile, tiles: Tile[][]): Tile[] {
  const neighbors: Tile[] = [];
  const { x, y } = tile;
  
  // Check 8 surrounding tiles
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue; // Skip the center tile
      
      const nx = x + dx;
      const ny = y + dy;
      
      if (nx >= 0 && nx < tiles.length && ny >= 0 && ny < tiles[0].length) {
        neighbors.push(tiles[nx][ny]);
      }
    }
  }
  
  return neighbors;
}

/**
 * Calculate movement cost from one tile to another
 */
function getMovementCost(a: Tile, b: Tile, entityType: EntityType): number {
  // Base cost for orthogonal movement is 1, diagonal is 1.4
  let cost = a.x !== b.x && a.y !== b.y ? 1.4 : 1;
  
  // Additional cost based on terrain type for the entity
  cost *= getTerrainModifier(b.type, entityType);
  
  // Height difference affects cost
  const heightDifference = Math.abs(b.height - a.height);
  cost += heightDifference * 2;
  
  return cost;
}

/**
 * Get terrain movement modifier for entity type
 */
function getTerrainModifier(biomeType: BiomeType, entityType: EntityType): number {
  // Water creatures
  if (isAquatic(entityType)) {
    if (['deep_ocean', 'ocean', 'shallow_water', 'river', 'lake'].includes(biomeType)) {
      return 1.0; // Normal movement in water
    }
    return 20.0; // Very hard to move on land
  }
  
  // Birds can fly everywhere
  if (entityType === 'bird') {
    return 1.0;
  }
  
  // Default terrain modifiers
  switch (biomeType) {
    case 'deep_ocean':
    case 'ocean':
      return 20.0; // Most entities can't swim well
      
    case 'shallow_water':
    case 'river':
    case 'lake':
      return 8.0; // Swimmers only, and slow — paths route around water
      
    case 'beach':
    case 'rocky_shore':
      return 1.5; // Slightly slower on beaches
      
    case 'mountains':
    case 'snow':
    case 'glacier':
      return 3.0; // Difficult terrain
      
    case 'hills':
    case 'volcanic':
      return 2.0; // Moderately difficult terrain
      
    case 'desert':
    case 'badlands':
      return 1.5; // Somewhat difficult
      
    case 'swamp':
    case 'marsh':
      return 2.5; // Wet, muddy terrain
      
    case 'grassland':
    case 'savanna':
      return 1.0; // Ideal terrain
      
    case 'deciduous_forest':
    case 'coniferous_forest':
    case 'taiga':
    case 'rainforest':
    case 'tropical_forest':
    case 'enchanted_forest':
      return 1.3; // Slightly slower in forests
      
    default:
      return 1.0;
  }
}

/**
 * Check if a tile is walkable for a specific entity type
 */
export function isWalkableForEntity(tile: Tile, entityType: EntityType): boolean {
  // Fish need water and cannot leave it
  if (isAquatic(entityType)) return isWaterBiome(tile.type);

  // Birds and dragons ignore the ground
  if (isAirborne(entityType)) return true;

  // The explicit flag blocks everything that walks
  if (tile.walkable === false) return false;

  if (isWaterBiome(tile.type)) {
    // Nothing that walks crosses open sea; strong swimmers ford the shallows
    return canSwim(entityType) && SHALLOW.includes(tile.type);
  }

  return true;
}

/*
 * Reachability. A* can only ever enter tiles that isWalkableForEntity accepts,
 * over the same 8-neighbour edges (diagonals need both orthogonal sides open).
 * So a goal outside the start's component of that graph can never be reached,
 * and the search would only burn its whole expansion budget finding that out.
 * Walkers share a component labelling by kind: every entity of one kind obeys
 * the same passability rule, so one labelling per kind serves them all.
 */
const KIND_AQUATIC = 0;
const KIND_AIRBORNE = 1;
const KIND_SWIMMER = 2;
const KIND_LAND = 3;
/** One entity of each kind; isWalkableForEntity gives the same answer for every entity of that kind. */
const KIND_REPRESENTATIVE: EntityType[] = ['fish', 'bird', 'bear', 'rhino'];

function walkKindOf(entityType: EntityType): number {
  if (isAquatic(entityType)) return KIND_AQUATIC;
  if (isAirborne(entityType)) return KIND_AIRBORNE;
  return canSwim(entityType) ? KIND_SWIMMER : KIND_LAND;
}

/**
 * Every tile property isWalkableForEntity reads. Passability can only change
 * when this key does, so writes that leave it unchanged need no invalidation.
 */
function passabilityKey(tile: Tile): number {
  return (tile.walkable === false ? 1 : 0)
    | (isWaterBiome(tile.type) ? 2 : 0)
    | (SHALLOW.includes(tile.type) ? 4 : 0);
}

/** Bumped whenever a tile's passability changes. Every cached labelling is stale once it moves. */
let passabilityVersion = 0;

/** Change a tile's biome, invalidating reachability labels if its passability changes. */
export function setTileBiome(tile: Tile, type: BiomeType): void {
  const before = passabilityKey(tile);
  tile.type = type;
  if (passabilityKey(tile) !== before) passabilityVersion++;
}

/** Change a tile's walkable flag, invalidating reachability labels if its passability changes. */
export function setTileWalkable(tile: Tile, walkable: boolean): void {
  const before = passabilityKey(tile);
  tile.walkable = walkable;
  if (passabilityKey(tile) !== before) passabilityVersion++;
}

interface ComponentCache {
  version: number;
  byKind: (Int32Array | undefined)[];
}
const componentCache = new WeakMap<Tile[][], ComponentCache>();

/** Component label per tile (index x * height + y), -1 for tiles this kind cannot stand on. */
function componentLabels(tiles: Tile[][], kind: number): Int32Array {
  let cache = componentCache.get(tiles);
  if (!cache || cache.version !== passabilityVersion) {
    cache = { version: passabilityVersion, byKind: [] };
    componentCache.set(tiles, cache);
  }
  let labels = cache.byKind[kind];
  if (!labels) {
    labels = labelComponents(tiles, KIND_REPRESENTATIVE[kind]);
    cache.byKind[kind] = labels;
  }
  return labels;
}

function labelComponents(tiles: Tile[][], representative: EntityType): Int32Array {
  const width = tiles.length;
  const height = tiles[0].length;
  const size = width * height;
  const open = new Uint8Array(size);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      open[x * height + y] = isWalkableForEntity(tiles[x][y], representative) ? 1 : 0;
    }
  }

  const labels = new Int32Array(size).fill(-1);
  const queue = new Int32Array(size);
  let count = 0;
  for (let start = 0; start < size; start++) {
    if (!open[start] || labels[start] !== -1) continue;
    labels[start] = count;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    while (head < tail) {
      const cell = queue[head++];
      const x = (cell / height) | 0;
      const y = cell - x * height;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = nx * height + ny;
          if (!open[next] || labels[next] !== -1) continue;
          // Same corner rule as findPath: a diagonal step needs both orthogonal tiles open
          if (dx !== 0 && dy !== 0 && (!open[nx * height + y] || !open[x * height + ny])) continue;
          labels[next] = count;
          queue[tail++] = next;
        }
      }
    }
    count++;
  }
  return labels;
}

/**
 * True only when findPath provably cannot succeed for this walker: the goal is
 * not in the start's walkable component, or the goal cannot be entered at all.
 * False means "search as usual", never "reachable".
 */
export function provablyUnreachable(
  startTile: Tile,
  targetTile: Tile,
  tiles: Tile[][],
  entityType: EntityType,
): boolean {
  if (startTile === targetTile) return false;
  const kind = walkKindOf(entityType);
  // Every tile is open to flyers, so there is nothing to prove
  if (kind === KIND_AIRBORNE) return false;
  // Only trust the labels for tiles that really are in this grid
  if (tiles[startTile.x]?.[startTile.y] !== startTile) return false;
  if (tiles[targetTile.x]?.[targetTile.y] !== targetTile) return false;

  const labels = componentLabels(tiles, kind);
  const height = tiles[0].length;
  const startLabel = labels[startTile.x * height + startTile.y];
  // A start the walker cannot stand on still expands into open neighbours, so leave it to the search
  if (startLabel < 0) return false;
  // A goal the walker cannot stand on (label -1) is never entered, so it is unreachable
  return labels[targetTile.x * height + targetTile.y] !== startLabel;
}

/**
 * A land tile touching fresh water — where a creature stands to drink.
 * Drinking from the bank rather than from inside the lake is what keeps land
 * animals out of the water in the first place.
 */
export function isShoreTile(tile: Tile, tiles: Tile[][]): boolean {
  if (isWaterBiome(tile.type)) return false;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = tile.x + dx;
      const ny = tile.y + dy;
      if (nx < 0 || nx >= tiles.length || ny < 0 || ny >= tiles[0].length) continue;
      const neighbour = tiles[nx][ny];
      if (SHALLOW.includes(neighbour.type)) return true;
    }
  }
  return false;
}

/**
 * The closest tile this creature can actually stand on, searched outward in
 * rings. Used to rescue anything that ends up somewhere impossible — a lowered
 * pit, a meteor crater, a flooded tile, a one-tile island.
 */
export function findNearestStandable(
  tiles: Tile[][],
  x: number,
  y: number,
  entityType: EntityType,
  maxRadius = 12,
): Tile | null {
  for (let radius = 1; radius <= maxRadius; radius++) {
    let best: Tile | null = null;
    let bestDistance = Infinity;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        // Only the newly added ring each time
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= tiles.length || ny < 0 || ny >= tiles[0].length) continue;
        const tile = tiles[nx][ny];
        if (!isWalkableForEntity(tile, entityType)) continue;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = tile;
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * The tile itself if this creature can stand on it, otherwise the nearest one
 * it can. A goal chosen from a tile the walker cannot enter is never reached,
 * so callers aim for this instead of the raw tile.
 */
export function standableNear(
  tile: Tile,
  tiles: Tile[][],
  entityType: EntityType,
  maxRadius = 3,
): Tile | null {
  if (isWalkableForEntity(tile, entityType)) return tile;
  return findNearestStandable(tiles, tile.x, tile.y, entityType, maxRadius);
}

/**
 * Reconstruct the path by following parent pointers
 */
function reconstructPath(endTile: Tile): Tile[] {
  const path: Tile[] = [];
  let currentTile: Tile | undefined = endTile;
  
  while (currentTile) {
    path.unshift(currentTile); // Add to front
    currentTile = currentTile.parent;
  }
  
  return path;
}
