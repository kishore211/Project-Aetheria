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

/**
 * A* Pathfinding algorithm for entities to navigate the world
 */
export function findPath(
  startTile: Tile,
  targetTile: Tile,
  tiles: Tile[][],
  entityType: EntityType
): Tile[] {
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
    }
    return tile;
  };

  const openSet: Tile[] = [];

  visit(startTile);
  visit(targetTile);
  openSet.push(startTile);

  startTile.gCost = 0;
  startTile.hCost = calculateHeuristic(startTile, targetTile);
  startTile.fCost = startTile.hCost;

  // A hard ceiling keeps one hopeless search from stalling a frame
  let expansions = 0;
  const maxExpansions = 4000;

  while (openSet.length > 0) {
    if (++expansions > maxExpansions) return [];
    // Find tile with lowest F cost
    let currentIndex = 0;
    for (let i = 1; i < openSet.length; i++) {
      if ((openSet[i].fCost || Infinity) < (openSet[currentIndex].fCost || Infinity)) {
        currentIndex = i;
      } else if ((openSet[i].fCost || Infinity) === (openSet[currentIndex].fCost || Infinity)) {
        // If F costs are equal, prefer the one with lower H cost
        if ((openSet[i].hCost || Infinity) < (openSet[currentIndex].hCost || Infinity)) {
          currentIndex = i;
        }
      }
    }
    
    const currentTile = openSet[currentIndex];
    
    // Check if we reached the target
    if (currentTile === targetTile) {
      return reconstructPath(currentTile);
    }
    
    // Move current tile from open set to closed set
    openSet.splice(currentIndex, 1);
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
      
      // Check if neighbor is not in open set or if we found a better path
      const isNewPath = !openSet.includes(neighbor);
      if (isNewPath || tentativeGCost < (neighbor.gCost || Infinity)) {
        // Update neighbor's costs and parent
        neighbor.gCost = tentativeGCost;
        neighbor.hCost = calculateHeuristic(neighbor, targetTile);
        neighbor.fCost = (neighbor.gCost || 0) + (neighbor.hCost || 0);
        neighbor.parent = currentTile;
        
        if (isNewPath) {
          openSet.push(neighbor);
        }
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
