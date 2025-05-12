// src/utils/pathfinding.ts
import { Tile, BiomeType, EntityType } from '../types/world';

/**
 * A* Pathfinding algorithm for entities to navigate the world
 */
export function findPath(
  startTile: Tile,
  targetTile: Tile,
  tiles: Tile[][],
  entityType: EntityType
): Tile[] {
  // Reset pathfinding properties
  for (let x = 0; x < tiles.length; x++) {
    for (let y = 0; y < tiles[0].length; y++) {
      tiles[x][y].fCost = undefined;
      tiles[x][y].gCost = undefined;
      tiles[x][y].hCost = undefined;
      tiles[x][y].parent = undefined;
    }
  }
  
  // Lists for A* algorithm
  const openSet: Tile[] = [];
  const closedSet: Tile[] = [];
  
  // Add starting tile to open set
  openSet.push(startTile);
  
  // Set initial costs
  startTile.gCost = 0;
  startTile.hCost = calculateHeuristic(startTile, targetTile);
  startTile.fCost = startTile.hCost;
  
  while (openSet.length > 0) {
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
    closedSet.push(currentTile);
    
    // Process neighbors
    const neighbors = getNeighbors(currentTile, tiles);
    
    for (const neighbor of neighbors) {
      // Skip if neighbor is in closed set
      if (closedSet.includes(neighbor)) continue;
      
      // Skip if tile is not walkable for this entity type
      if (!isWalkableForEntity(neighbor, entityType)) continue;
      
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
  if (entityType === 'fish') {
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
      return 5.0; // Hard to move in water
      
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
function isWalkableForEntity(tile: Tile, entityType: EntityType): boolean {
  // Explicit walkable flag overrides everything
  if (tile.walkable === false) return false;
  
  // Water entities
  if (entityType === 'fish') {
    return ['deep_ocean', 'ocean', 'shallow_water', 'river', 'lake'].includes(tile.type);
  }
  
  // Flying entities
  if (entityType === 'bird') {
    return true; // Birds can go anywhere
  }
  
  // Dragons can go almost anywhere
  if (entityType === 'dragon') {
    return true;
  }
  
  // Most entities can't walk on water
  if (['deep_ocean', 'ocean'].includes(tile.type)) {
    return false;
  }
  
  return true;
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
