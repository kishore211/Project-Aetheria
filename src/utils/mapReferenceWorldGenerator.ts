// src/utils/mapReferenceWorldGenerator.ts
import * as THREE from 'three';
import { ReferenceMapGenerator } from './referenceMapGenerator';
import { BiomeType, MAP_SIZES, Tile } from '../types/world';
import { getBiomeColor, determineBiome } from './worldGenerator';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a world based on a reference map image
 * @param referenceMapUrl URL of the image to use as reference
 * @param seed Random seed for consistent generation
 * @param worldSize Size name ('small', 'medium', 'large') or 'custom'
 * @param customSize Custom map size (only used if worldSize is 'custom')
 * @param timeOfDay Time of day ('dawn', 'day', 'dusk', 'night')
 * @param season Season ('spring', 'summer', 'autumn', 'winter')
 */
export const generateTerrainFromReferenceMap = async (
  referenceMapUrl: string,
  seed: string | number,
  worldSize: string = 'medium',
  customSize?: number,
  timeOfDay: string = 'day',
  season: string = 'summer'
) => {
  console.log(`[MapRefWorldGen] Generating terrain from reference map: ${referenceMapUrl}`);
  console.log(`[MapRefWorldGen] Parameters: seed=${seed}, size=${worldSize}, custom=${customSize}, time=${timeOfDay}, season=${season}`);

  // Determine map size
  const mapSize = worldSize === 'custom' && customSize ? customSize : MAP_SIZES[worldSize as keyof typeof MAP_SIZES];
  if (!mapSize) {
    console.error(`[MapRefWorldGen] Invalid world size '${worldSize}' or custom size '${customSize}'. Using default medium.`);
    const defaultSize = MAP_SIZES['medium'];
    return { 
      worldGroup: new THREE.Group(), 
      tilesData: Array.from({ length: defaultSize }, () => Array(defaultSize)) 
    };
  }

  // Create a world group to hold all terrain objects
  const worldGroup = new THREE.Group();
  worldGroup.name = 'world';

  try {
    // Create and configure the reference map generator
    const mapGenerator = new ReferenceMapGenerator();
    
    // Generate tiles from the reference map
    const tilesData = await mapGenerator.generateTilesFromImage(
      referenceMapUrl,
      mapSize,
      seed.toString(),
      true // Use height variation
    );

    // Process tiles to add additional data and create meshes
    enhanceTilesData(tilesData, seed.toString(), timeOfDay, season);
    createWorldMeshes(tilesData, worldGroup, timeOfDay, season);

    return { worldGroup, tilesData };
  } catch (error) {
    console.error('[MapRefWorldGen] Error generating terrain from reference map:', error);
    // Return empty world on error
    return { 
      worldGroup: new THREE.Group(), 
      tilesData: Array.from({ length: mapSize }, () => Array(mapSize)) 
    };
  }
};

/**
 * Enhance tile data with additional information
 */
function enhanceTilesData(
  tilesData: Tile[][],
  seed: string,
  timeOfDay: string,
  season: string
) {
  // Create a seeded random generator
  const seededRandom = new Math.seedrandom(seed);
  
  // Process each tile to add additional data
  for (let x = 0; x < tilesData.length; x++) {
    for (let y = 0; y < tilesData[0].length; y++) {
      const tile = tilesData[x][y];
      
      // Set walkability based on biome type
      tile.walkable = !tile.type.includes('water') && 
                      !tile.type.includes('ocean') &&
                      tile.type !== 'glacier' &&
                      tile.type !== 'lava' &&
                      tile.type !== 'mountains' &&
                      tile.type !== 'volcano';
      
      // Generate resources for the tile
      tile.resources = generateResources(tile, seededRandom);
      
      // Determine if the tile should have a natural structure
      tile.structure = determineNaturalStructure(tile, seededRandom);
      
      // Set default tile properties
      tile.population = 0;
      tile.entities = [];
      tile.isOnFire = false;
      tile.mesh = null;
      tile.color = null;
    }
  }
}

/**
 * Create world meshes from tile data
 */
function createWorldMeshes(
  tilesData: Tile[][],
  worldGroup: THREE.Group,
  timeOfDay: string,
  season: string
) {
  const tileSize = 1; // Size of each tile mesh
  const heightMultiplier = 2; // Height scaling factor
  
  // Create a mesh for each tile
  for (let x = 0; x < tilesData.length; x++) {
    for (let y = 0; y < tilesData[0].length; y++) {
      const tile = tilesData[x][y];
      
      // Get color based on biome type and time/season
      const color = getBiomeColor(tile.type, timeOfDay, season) as THREE.Color;
      
      // Create geometry for the tile
      const geometry = new THREE.BoxGeometry(tileSize, tile.baseHeight * heightMultiplier, tileSize);
      const material = new THREE.MeshStandardMaterial({ color });
      const tileMesh = new THREE.Mesh(geometry, material);
      
      // Position the mesh
      tileMesh.position.set(
        x * tileSize, 
        (tile.baseHeight * heightMultiplier) / 2, 
        y * tileSize
      );
      
      // Store color for later use
      tile.color = color.clone();
      
      // Add the tile mesh to the world group
      worldGroup.add(tileMesh);
      
      // Store a reference to the mesh in the tile data
      tile.mesh = tileMesh;
    }
  }
}

/**
 * Generate resources for a tile based on its properties
 */
function generateResources(tile: Tile, random: () => number) {
  const resources = [];
  const probabilities = calculateResourceProbabilities(tile.type, tile.elevation);
  
  // Check each resource type against its probability
  for (const [resourceType, probability] of Object.entries(probabilities)) {
    if (random() < probability) {
      resources.push({
        id: uuidv4(),
        type: resourceType,
        amount: Math.floor(random() * 100) + 10, // 10-110 units
        discovered: false,
        exploited: false
      });
    }
  }
  
  return resources;
}

/**
 * Calculate the probability of different resources based on biome and elevation
 */
function calculateResourceProbabilities(biome: BiomeType, elevation: number) {
  // Base probabilities for different resources
  const base = {
    wood: 0,
    stone: 0,
    food: 0,
    iron: 0,
    gold: 0,
    mana: 0
  };
  
  // Adjust based on biome type
  switch (biome) {
    case 'grassland':
      base.wood = 0.3;
      base.stone = 0.1;
      base.food = 0.5;
      break;
    case 'deciduous_forest':
    case 'coniferous_forest':
    case 'taiga':
    case 'rainforest':
    case 'tropical_forest':
      base.wood = 0.8;
      base.stone = 0.2;
      base.food = 0.6;
      break;
    case 'hills':
      base.stone = 0.6;
      base.iron = 0.3;
      break;
    case 'mountains':
      base.stone = 0.8;
      base.iron = 0.5;
      base.gold = 0.2;
      break;
    case 'desert':
    case 'mesa':
      base.stone = 0.4;
      base.gold = 0.1;
      break;
    case 'enchanted_forest':
      base.wood = 0.6;
      base.food = 0.4;
      base.mana = 0.7;
      break;
    case 'volcanic':
      base.stone = 0.7;
      base.iron = 0.6;
      base.gold = 0.3;
      base.mana = 0.2;
      break;
  }
  
  // Elevation factor - higher elevations have more stone and metals
  if (elevation > 0.6) {
    base.stone = Math.min(1, base.stone * 1.5);
    base.iron = Math.min(1, (base.iron || 0) * 1.5);
    base.gold = Math.min(1, (base.gold || 0) * 1.5);
  }
  
  return base;
}

/**
 * Determine if a tile should have a natural structure
 */
function determineNaturalStructure(tile: Tile, random: () => number) {
  // Base chance for different structures based on biome
  let treeChance = 0;
  let rockChance = 0;
  let bushChance = 0;
  
  switch (tile.type) {
    case 'grassland':
      treeChance = 0.1;
      bushChance = 0.2;
      break;
    case 'deciduous_forest':
    case 'coniferous_forest':
    case 'taiga':
    case 'rainforest':
    case 'tropical_forest':
      treeChance = 0.7;
      bushChance = 0.3;
      break;
    case 'hills':
      treeChance = 0.1;
      rockChance = 0.4;
      break;
    case 'mountains':
      rockChance = 0.6;
      break;
    case 'desert':
      rockChance = 0.1;
      bushChance = 0.05;
      break;
    case 'savanna':
      treeChance = 0.15;
      bushChance = 0.2;
      break;
  }
  
  // Determine structure based on chances
  const roll = random();
  
  if (roll < treeChance) {
    // Determine tree age/size
    const treeTypeRoll = random();
    let treeType;
    
    if (treeTypeRoll < 0.1) {
      treeType = 'ancient_tree';
    } else if (treeTypeRoll < 0.3) {
      treeType = 'mature_tree';
    } else if (treeTypeRoll < 0.7) {
      treeType = 'young_tree';
    } else {
      treeType = 'sapling';
    }
    
    return {
      id: uuidv4(),
      type: treeType,
      health: 100,
      age: 0
    };
  } else if (roll < treeChance + rockChance) {
    return {
      id: uuidv4(),
      type: random() < 0.3 ? 'boulder' : 'rock_outcrop',
      health: 100,
      age: 0
    };
  } else if (roll < treeChance + rockChance + bushChance) {
    return {
      id: uuidv4(),
      type: 'bush',
      health: 100,
      age: 0
    };
  }
  
  return null;
}
