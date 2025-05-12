// worldGenerator.js - (This is your exact code from the prompt)

import * as THREE from 'three';
import SimplexNoise from './simplexNoise'; // Or import from 'simplex-noise' if installed
import seedrandom from 'seedrandom'; // Or import from 'seedrandom' if installed

// Assuming these constants are defined elsewhere or here
// Example definitions (replace with your actual values if different)
export const MAP_SIZES = {
    small: 64,
    medium: 128,
    large: 256, // Keep this for a large map
    custom: 128 // Custom placeholder, overwritten by input
};
export const TILE_SIZE = 10;
export const MIN_TILE_HEIGHT = 0.5;
export const BASE_TILE_SCALED_HEIGHT_MULTIPLIER = 20; // How much height variation affects scale

export const TimeOfDay = ['dawn', 'day', 'dusk', 'night']; // Make this an array or union type if needed elsewhere
export const Season = ['spring', 'summer', 'autumn', 'winter']; // Same

export const ResourceType = ['wood', 'stone', 'food', 'water', 'iron', 'gold', 'silver', 'coal', 'crystal', 'gem', 'mana', 'ancient_artifact'];
// Define types if not already done in types/world.ts
// import { Tile, BiomeType, TimeOfDay, Season, ResourceType, Resource, Structure } from '../types/world';


/**
 * Determines the biome type based on height, moisture, temperature
 * Using a more sophisticated biome distribution system
 */
export const determineBiome = (height, moisture, temperature) => {
  // All values normalized between 0-1

  // Deep ocean and ocean
  if (height < 0.15) return 'deep_ocean';
  if (height < 0.25) return 'ocean';

  // Shallow water (coast)
  if (height < 0.28) {
    if (temperature > 0.7) return 'beach'; // Warm coast = beach
    return 'shallow_water';
  }

  // Very high elevation
  if (height > 0.85) {
    if (temperature < 0.2) return 'snow'; // Cold high areas
    if (temperature > 0.7) return 'volcanic'; // Hot high areas
    return 'mountains';
  }

  // High elevation
  if (height > 0.75) {
    if (temperature < 0.15) return 'snow';
    if (temperature < 0.3) return 'tundra';
    return 'mountains';
  }

  // Hills
  if (height > 0.6) {
    if (temperature < 0.2) return 'taiga'; // Cold hills
    if (temperature > 0.7) return 'mesa'; // Hot hills
    if (moisture > 0.7) return 'hills'; // Wet hills
    if (moisture < 0.3) return 'badlands'; // Dry hills
    return 'hills';
  }

  // Hot climates
  if (temperature > 0.7) {
    if (moisture < 0.15) return 'desert';
    if (moisture < 0.30) return 'savanna';
    if (moisture > 0.65) return 'rainforest';
    return 'tropical_forest';
  }

  // Cold climates
  if (temperature < 0.25) {
    if (moisture > 0.7) return 'taiga';
    if (moisture < 0.3) return 'tundra';
    return 'coniferous_forest';
  }

  // Temperate climates
  if (moisture > 0.8) {
    if (height < 0.4) return 'swamp';
    return 'marsh';
  }

  if (moisture > 0.6) return 'deciduous_forest';
  if (moisture > 0.3) return 'grassland';

  // Default for dry temperate
  return 'grassland';
};

/**
 * Returns a color for the biome based on the time of day and season
 */
export const getBiomeColor = (
  type,
  timeOfDay = 'day',
  season = 'summer'
) => {
  // Base colors for biomes
  const baseColors = {
    deep_ocean: new THREE.Color(0x0D47A1),
    ocean: new THREE.Color(0x1565C0),
    shallow_water: new THREE.Color(0x1976D2),
    river: new THREE.Color(0x2196F3),
    lake: new THREE.Color(0x42A5F5),
    beach: new THREE.Color(0xFFD54F),
    rocky_shore: new THREE.Color(0x9E9E9E),
    grassland: new THREE.Color(0x7CB342),
    deciduous_forest: new THREE.Color(0x388E3C),
    coniferous_forest: new THREE.Color(0x1B5E20),
    hills: new THREE.Color(0x689F38),
    mountains: new THREE.Color(0x757575),
    taiga: new THREE.Color(0x558B2F),
    tundra: new THREE.Color(0x9E9E9E),
    snow: new THREE.Color(0xEEEEEE),
    ice: new THREE.Color(0xBBDEFB),
    glacier: new THREE.Color(0xB3E5FC),
    desert: new THREE.Color(0xFFD54F),
    savanna: new THREE.Color(0xCDDC39),
    mesa: new THREE.Color(0xD84315),
    badlands: new THREE.Color(0xE65100),
    swamp: new THREE.Color(0x33691E),
    marsh: new THREE.Color(0x558B2F),
    rainforest: new THREE.Color(0x2E7D32),
    tropical_forest: new THREE.Color(0x43A047),
    volcanic: new THREE.Color(0x6A1B9A),
    corrupted: new THREE.Color(0x4A148C),
    enchanted_forest: new THREE.Color(0x26A69A),
    sky_island: new THREE.Color(0x80DEEA)
  };

  // Default to a gray if biome is not found
  const baseColor = (baseColors[type] || new THREE.Color(0x9E9E9E)).clone();

  // Apply time of day modifications
  const timeFactors = {
    dawn: 0.85,
    day: 1.0,
    dusk: 0.7,
    night: 0.4
  };

  // Apply seasonal modifications
  const seasonFactors = {
    spring: {
      grassland: 1.1,
      deciduous_forest: 1.1,
      brightness: 1.05
    },
    autumn: {
      deciduous_forest: 0.9, // More orange/red in autumn
      grassland: 0.9,
      brightness: 0.95
    },
    winter: {
      deciduous_forest: 0.7, // Duller in winter
      grassland: 0.7,
      coniferous_forest: 0.9,
      brightness: 0.85
    }
  };

  // Apply season-specific biome color adjustments
  const currentSeasonFactors = seasonFactors[season];
  if (currentSeasonFactors) {
    const biomeFactor = currentSeasonFactors[type];
    if (biomeFactor) {
      baseColor.multiplyScalar(biomeFactor);
    }

    // Apply global season brightness
    const brightnessAdjustment = currentSeasonFactors.brightness || 1.0;
    baseColor.multiplyScalar(brightnessAdjustment);
  }

  // Apply time of day lighting
  const timeFactor = timeFactors[timeOfDay] || 1.0;
  baseColor.multiplyScalar(timeFactor);

  return baseColor;
};

/**
 * Calculate resource probabilities for a given biome and elevation
 */
const calculateResourceProbabilities = (biome, elevation) => {
  // Default probabilities
  const baseProbabilities = {
    wood: 0.1,
    stone: 0.1,
    food: 0.1,
    water: 0.1,
    iron: 0.05,
    gold: 0.02,
    silver: 0.03,
    coal: 0.05,
    crystal: 0.01,
    gem: 0.01,
    mana: 0.005,
    ancient_artifact: 0.001
  };

  // Adjust based on biome
  switch (biome) {
    case 'mountains':
      baseProbabilities.stone = 0.7;
      baseProbabilities.iron = 0.3;
      baseProbabilities.gold = 0.15;
      baseProbabilities.coal = 0.25;
      baseProbabilities.gem = 0.1;
      break;
    case 'forest': // Assuming 'forest' might be a generic type or covered by others
    case 'deciduous_forest':
    case 'coniferous_forest':
      baseProbabilities.wood = 0.8;
      baseProbabilities.food = 0.3;
      break;
    case 'desert':
      baseProbabilities.stone = 0.5;
      baseProbabilities.iron = 0.1;
      baseProbabilities.gold = 0.1;
      break;
    // Add more biome-specific resource adjustments
  }

  // Adjust based on elevation
  if (elevation > 0.7) {
    baseProbabilities.stone *= 1.5;
    baseProbabilities.iron *= 1.3;
    baseProbabilities.gold *= 1.4;
  }

  return baseProbabilities;
};

/**
 * Generates random resources for a tile based on its biome and elevation
 */
const generateResources = (tile, random) => {
  const resources = [];
  const probabilities = calculateResourceProbabilities(tile.type, tile.height);

  Object.entries(probabilities).forEach(([type, probability]) => {
    if (random() < probability) {
      const quantity = Math.floor(random() * 10) + 1; // 1-10 quantity
      resources.push({
        type: type, // type as ResourceType, // Cast if using TypeScript
        quantity,
        discovered: false
      });
    }
  });

  return resources;
};

/**
 * Determine if a tile should have a natural structure (tree, rock, etc.)
 */
const determineNaturalStructure = (tile, random) => {
  // Forests and similar biomes have trees
  if (['deciduous_forest', 'coniferous_forest', 'taiga', 'rainforest', 'tropical_forest', 'enchanted_forest'].includes(tile.type)) {
    const treeType = random() < 0.7 ? 'mature_tree' : random() < 0.9 ? 'young_tree' : 'ancient_tree';
    return {
      type: treeType,
      health: 100,
      level: treeType === 'ancient_tree' ? 3 : treeType === 'mature_tree' ? 2 : 1
    };
  }

  // Rocky areas have boulders
  if (['mountains', 'hills', 'rocky_shore', 'badlands', 'mesa'].includes(tile.type)) {
    if (random() < 0.4) {
      return {
        type: random() < 0.7 ? 'rock_outcrop' : 'boulder',
        health: 150
      };
    }
  }

  // Some biomes have bushes
  if (['grassland', 'savanna', 'tundra'].includes(tile.type)) {
    if (random() < 0.2) {
      return {
        type: 'bush',
        health: 50
      };
    }
  }

  // Rare chance for ruins in any land biome
  if (tile.height > 0.3 && random() < 0.003) {
    return {
      type: 'ruins',
      health: 200
    };
  }

  return null;
};


/**
 * Generate the terrain for the game world
 */
export const generateTerrain = (
  seed,
  worldSize = 'medium',
  customSize,
  timeOfDay = 'day',
  season = 'summer'
) => {
  console.log(`[WorldGen] Generating terrain with seed: ${seed}, size: ${worldSize}, custom: ${customSize}, time: ${timeOfDay}, season: ${season}`);

  // Determine map size
  const mapSize = worldSize === 'custom' && customSize ? customSize : MAP_SIZES[worldSize];
    if (!mapSize) {
        console.error(`[WorldGen] Invalid world size '${worldSize}' or custom size '${customSize}'. Using default medium.`);
        const defaultSize = MAP_SIZES['medium'];
        return { worldGroup: new THREE.Group(), tilesData: Array(defaultSize).fill(0).map(() => Array(defaultSize)) };
    }


  const worldGroup = new THREE.Group();
  const simplex = new SimplexNoise(seed);
  const tilesData = [];

  // Create a seeded random function
  const seededRandom = seedrandom(seed.toString());
  const random = () => seededRandom();

  // Noise parameters for world generation
  const continentScale = 0.08; // Large scale landmasses
  const landformScale = 0.2;   // Medium scale terrain features
  const detailScale = 0.6;     // Small scale terrain details

  const moistureFreq = 0.15;   // Moisture map frequency
  const tempBaseFreq = 0.05;   // Base temperature frequency (latitude-based)
  const tempDetailFreq = 0.2;  // Local temperature variations
  const fertilityFreq = 0.25;  // Soil fertility variations

  // Initialize the tiles array
  for (let x = 0; x < mapSize; x++) {
    tilesData[x] = [];
    for (let y = 0; y < mapSize; y++) {
      // Initial tile with default values
      tilesData[x][y] = {
        x, y,
        height: 0,
        scaledHeight: 0,
        moisture: 0,
        temperature: 0,
        fertility: 0,
        type: 'ocean', // Default, will be calculated later
        population: 0,
        resources: [],
        structure: null,
        entities: [],
        isOnFire: false,
        mesh: null, // Will store the THREE.Mesh reference
        color: null, // Will store the THREE.Color instance
        walkable: false // Default, will be calculated
      };
    }
  }

  // Generate the height map using multi-octave noise
  for (let x = 0; x < mapSize; x++) {
    for (let y = 0; y < mapSize; y++) {
      const nx = x / mapSize;
      const ny = y / mapSize;

      // Combine multiple noise layers for realistic terrain
      // Continent layer (large scale features)
      const continentNoise = simplex.noise2D(nx * continentScale, ny * continentScale);

      // Landform layer (medium scale features)
      const landformNoise = simplex.noise2D(nx * landformScale, ny * landformScale) * 0.5;

      // Detail layer (small scale features)
      const detailNoise = simplex.noise2D(nx * detailScale, ny * detailScale) * 0.25;

      // Combine the layers with proper weighting
      let height = (continentNoise * 0.6 + landformNoise * 0.3 + detailNoise * 0.1 + 1) / 2;

      // Adjust height distribution for more interesting terrain
      height = Math.pow(height, 1.3); // More water, sharper mountains

      // Make the edges of the map water
      const edgeFactor = 0.03;
      const edgeX = Math.min(nx, 1 - nx) / edgeFactor;
      const edgeY = Math.min(ny, 1 - ny) / edgeFactor;
      const edgeValue = Math.min(Math.min(edgeX, edgeY), 1);
      height *= edgeValue;

      // Store the height value
      tilesData[x][y].height = Math.max(0, Math.min(1, height));

      // Calculate moisture (separate noise function)
      let moisture = (simplex.noise2D(nx * moistureFreq, ny * moistureFreq) + 1) / 2;

      // Moisture is higher near water
      if (tilesData[x][y].height < 0.3) {
        moisture = Math.min(1, moisture + (0.3 - tilesData[x][y].height) * 0.5);
      }

      tilesData[x][y].moisture = Math.max(0, Math.min(1, moisture));

      // Calculate temperature (based on height and "latitude")
      // Base temperature decreases from equator to poles
      const latitudeFactor = Math.abs(ny - 0.5) * 2; // 0 at equator, 1 at poles
      let baseTemp = 1 - Math.pow(latitudeFactor, 1.2) * 0.8; // Weighted curve

      // Local temperature variations
      const tempVariation = (simplex.noise2D(nx * tempDetailFreq, ny * tempDetailFreq) + 1) / 2 * 0.2;

      // Height decreases temperature
      const heightTemp = Math.max(0, 1 - tilesData[x][y].height * 1.5);

      let temperature = (baseTemp * 0.6 + tempVariation + heightTemp * 0.3) / 1.9;
      tilesData[x][y].temperature = Math.max(0, Math.min(1, temperature));

      // Calculate fertility
      let fertility = (simplex.noise2D(nx * fertilityFreq, ny * fertilityFreq) + 1) / 2;

      // Adjust fertility based on biome suitability
      if (tilesData[x][y].height < 0.25) { // Water is not fertile for land plants
        fertility *= 0.1;
      } else if (tilesData[x][y].height > 0.75) { // High mountains are less fertile
        fertility *= 0.3;
      } else if (tilesData[x][y].moisture > 0.7 && tilesData[x][y].temperature > 0.6) {
        // Warm and wet areas are more fertile
        fertility *= 1.5;
      } else if (tilesData[x][y].moisture < 0.2) { // Dry areas are less fertile
        fertility *= 0.4;
      }

      tilesData[x][y].fertility = Math.max(0, Math.min(1, fertility));

      // Determine biome based on height, moisture, and temperature
      tilesData[x][y].type = determineBiome(
        tilesData[x][y].height,
        tilesData[x][y].moisture,
        tilesData[x][y].temperature
      );

      // Generate resources
      tilesData[x][y].resources = generateResources(tilesData[x][y], random);

      // Determine natural structures (trees, rocks, etc.)
      tilesData[x][y].structure = determineNaturalStructure(tilesData[x][y], random);

      // Calculate visual height
      const minHeight = MIN_TILE_HEIGHT;
      const heightRange = BASE_TILE_SCALED_HEIGHT_MULTIPLIER;
      tilesData[x][y].scaledHeight = minHeight + tilesData[x][y].height * heightRange;

      // Create the mesh for this tile
      // Using BoxGeometry for now as per original code output
      const geometry = new THREE.BoxGeometry(TILE_SIZE, tilesData[x][y].scaledHeight, TILE_SIZE);

      // Position the mesh at the correct location and adjust Y to align the bottom face with y=0
      const posX = (x - mapSize / 2) * TILE_SIZE;
      const posZ = (y - mapSize / 2) * TILE_SIZE;
      const posY = tilesData[x][y].scaledHeight / 2; // Half height to align bottom with ground

      // Get appropriate color based on biome, time of day, and season
      const color = getBiomeColor(tilesData[x][y].type, timeOfDay, season);
      const material = new THREE.MeshStandardMaterial({ color });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(posX, posY, posZ);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Store reference to the mesh and add to world
      tilesData[x][y].mesh = mesh;
      tilesData[x][y].color = color.clone(); // Store a clone to avoid modifying the material directly later

      // Add the mesh to the world group
      worldGroup.add(mesh);

      // Store whether the tile is walkable (for pathfinding)
      tilesData[x][y].walkable = tilesData[x][y].height >= 0.25; // Not walkable if underwater
    }
  }

  console.log("[WorldGen] Terrain generation complete.");
  return { worldGroup, tilesData };
};