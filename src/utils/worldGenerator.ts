// Seeded procedural world generation: heightmap, climate, rivers, biomes,
// resources and decoration. Produces pure tile data — rendering lives in
// terrainRenderer.ts.
import * as THREE from 'three';
import SimplexNoise from './simplexNoise';
import seedrandom from 'seedrandom';
import {
  MIN_TILE_HEIGHT,
  TILE_SIZE,
  computeScaledHeight,
  isWaterBiome,
  type BiomeType,
  type Resource,
  type ResourceType as ResourceTypeName,
  type Season as SeasonName,
  type Structure,
  type Tile,
  type TimeOfDay as TimeOfDayName,
} from '../types/world';

export { MIN_TILE_HEIGHT, TILE_SIZE };

export const MAP_SIZES = {
  small: 64,
  medium: 128,
  large: 256,
  custom: 128,
};

/** World generation presets, in the spirit of WorldBox's map templates. */
export type WorldTemplate =
  | 'continents'
  | 'pangaea'
  | 'islands'
  | 'archipelago'
  | 'highlands'
  | 'plains';

interface TemplateConfig {
  label: string;
  /** Cycles of the continent-scale noise across the map. */
  continentScale: number;
  /** Height curve exponent — higher means more ocean and sharper peaks. */
  contrast: number;
  /** Added to every land height before clamping. */
  lift: number;
  /** How wide the water margin around the map is (0 disables). */
  edgeFalloff: number;
  /** Compresses relief toward mid elevations. */
  flatten: number;
  /** Rivers per 64 tiles of map width. */
  riverDensity: number;
}

export const WORLD_TEMPLATES: Record<WorldTemplate, TemplateConfig> = {
  continents: { label: 'Continents', continentScale: 3, contrast: 1.3, lift: 0, edgeFalloff: 0.12, flatten: 0, riverDensity: 3 },
  pangaea: { label: 'Pangaea', continentScale: 1.6, contrast: 1.05, lift: 0.06, edgeFalloff: 0.16, flatten: 0, riverDensity: 4 },
  islands: { label: 'Islands', continentScale: 6, contrast: 1.55, lift: 0, edgeFalloff: 0.1, flatten: 0, riverDensity: 1 },
  archipelago: { label: 'Archipelago', continentScale: 9.5, contrast: 1.7, lift: 0, edgeFalloff: 0.08, flatten: 0, riverDensity: 1 },
  highlands: { label: 'Highlands', continentScale: 3, contrast: 0.95, lift: 0.12, edgeFalloff: 0.14, flatten: 0, riverDensity: 5 },
  plains: { label: 'Great Plains', continentScale: 3.5, contrast: 1.1, lift: 0.08, edgeFalloff: 0.13, flatten: 0.6, riverDensity: 3 },
};

const createDefaultTile = (x: number, y: number): Tile => ({
  x,
  y,
  height: 0,
  scaledHeight: 0,
  moisture: 0,
  temperature: 0,
  fertility: 0,
  type: 'ocean',
  population: 0,
  resources: [],
  structure: null,
  entities: [],
  isOnFire: false,
  walkable: false,
  variant: 0.5,
  ownerId: null,
  villageId: null,
});

/**
 * Determines the biome type from height, moisture and temperature.
 * All inputs are normalised 0-1.
 */
export const determineBiome = (height: number, moisture: number, temperature: number): BiomeType => {
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
    if (temperature < 0.2) return 'snow';
    if (temperature > 0.7) return 'volcanic';
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
    if (temperature < 0.2) return 'taiga';
    if (temperature > 0.7) return 'mesa';
    if (moisture > 0.7) return 'hills';
    if (moisture < 0.3) return 'badlands';
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

  return 'grassland';
};

/**
 * Biome palette. Deliberately desaturated and earthy: the map should read as a
 * painted chart, not a set of primary-coloured blocks.
 */
export const BIOME_BASE_COLORS: Record<BiomeType, number> = {
  deep_ocean: 0x1b4a72,
  ocean: 0x246189,
  shallow_water: 0x3a86ab,
  river: 0x4c9ec4,
  lake: 0x4794bb,
  beach: 0xe6d5a4,
  rocky_shore: 0x9a958c,
  grassland: 0x86a752,
  deciduous_forest: 0x4e7f42,
  coniferous_forest: 0x35603c,
  hills: 0x789a4c,
  mountains: 0x8b8880,
  taiga: 0x5b7d4a,
  tundra: 0x9aa08e,
  snow: 0xe8ecef,
  ice: 0xc7dced,
  glacier: 0xbdd7e6,
  desert: 0xdfc98a,
  savanna: 0xbdb268,
  mesa: 0xb1774f,
  badlands: 0xa9754f,
  swamp: 0x4f6b3a,
  marsh: 0x638049,
  rainforest: 0x3c7340,
  tropical_forest: 0x4a8c4a,
  ashland: 0x555056,
  salt_flat: 0xe4e1d6,
  bloom: 0x9fc25a,
  volcanic: 0x5c4a4a,
  corrupted: 0x51356b,
  enchanted_forest: 0x3f8a8a,
  sky_island: 0x8ed6e0,
};

/** Colour each biome lerps toward in winter. */
const WINTER_TARGET = new THREE.Color(0xdfe6ea);
/** Colour deciduous growth lerps toward in autumn. */
const AUTUMN_TARGET = new THREE.Color(0xc07a33);

const WINTER_BLEND: Partial<Record<BiomeType, number>> = {
  grassland: 0.4,
  hills: 0.38,
  deciduous_forest: 0.3,
  coniferous_forest: 0.18,
  taiga: 0.3,
  tundra: 0.55,
  marsh: 0.3,
  swamp: 0.22,
  savanna: 0.25,
  mountains: 0.35,
  mesa: 0.12,
  badlands: 0.12,
  ashland: 0.18,
  bloom: 0.4,
};

const AUTUMN_BLEND: Partial<Record<BiomeType, number>> = {
  deciduous_forest: 0.45,
  grassland: 0.22,
  hills: 0.25,
  taiga: 0.12,
  marsh: 0.2,
  savanna: 0.2,
  bloom: 0.3,
};

const SPRING_BOOST: Partial<Record<BiomeType, number>> = {
  grassland: 1.07,
  hills: 1.06,
  deciduous_forest: 1.07,
  tropical_forest: 1.04,
  marsh: 1.05,
};

/**
 * How much each phase dims the land. Night was 0.46, which made the map barely
 * legible for a quarter of every day — the point of night is atmosphere, not
 * hiding the world you are meant to be watching.
 */
const TIME_FACTORS: Record<TimeOfDayName, number> = {
  dawn: 0.88,
  day: 1.0,
  dusk: 0.8,
  night: 0.62,
};

/** Slight colour cast per phase so the map feels lit, not just dimmed. */
const TIME_TINTS: Record<TimeOfDayName, { color: THREE.Color; amount: number }> = {
  dawn: { color: new THREE.Color(0xffb877), amount: 0.14 },
  day: { color: new THREE.Color(0xffffff), amount: 0 },
  dusk: { color: new THREE.Color(0xff8f6b), amount: 0.16 },
  night: { color: new THREE.Color(0x5878c0), amount: 0.24 },
};

/**
 * Returns the colour for a biome under the given time of day and season.
 * `variant` (0-1) applies a small deterministic shade jitter so large areas of
 * one biome do not look flat.
 */
export const getBiomeColor = (
  type: BiomeType,
  timeOfDay: TimeOfDayName = 'day',
  season: SeasonName = 'summer',
  /**
   * Kept in the signature, unused, and deliberately so: several callers pass a
   * tile's shade and it costs them nothing, while removing the parameter would
   * silently shift `elevation` into its place at every call site. It is a
   * no-op, not an oversight.
   */
  _shade?: number,
  elevation?: number,
): THREE.Color => {
  const color = new THREE.Color(BIOME_BASE_COLORS[type] ?? 0x9e9e9e);

  // Seasonal repaint
  if (season === 'winter') {
    const blend = WINTER_BLEND[type];
    if (blend) color.lerp(WINTER_TARGET, blend);
  } else if (season === 'autumn') {
    const blend = AUTUMN_BLEND[type];
    if (blend) color.lerp(AUTUMN_TARGET, blend);
  } else if (season === 'spring') {
    const boost = SPRING_BOOST[type];
    if (boost) color.multiplyScalar(boost);
  }

  // No per-tile colour offset at all. This is the correction that finally made
  // fields read as continuous.
  //
  // Decoding their art showed all three grass variants share an *identical*
  // palette — #589038 / #558733 / #527e33 — and differ only in which pixel gets
  // which shade. WorldBox never tints one grass tile differently from the next.
  // Giving each tile its own hue and saturation offset, as this did, is
  // precisely what turned a field into a patchwork of hard-edged squares: no
  // amount of smoothing the offset helps, because the offset itself is the
  // artefact. All the variation belongs *inside* the tile, where the shader's
  // 8x8 grain puts it, using the same three shades everywhere.

  // Elevation reads as a colour change, not only as geometry — and it is
  // legitimately per-tile because height is a smooth field, so it produces
  // broad relief rather than a grid. WorldBox gives high and low ground
  // genuinely different hex values (grass 5F833C vs 7EAF46) for the same
  // reason: from straight above, relief is invisible without it.
  if (elevation !== undefined && !isWaterBiome(type)) {
    const band = Math.max(0, Math.min(1, (elevation - 0.28) / 0.5));
    color.offsetHSL(0, -band * 0.05, -band * 0.055);
  }

  // Time of day
  const tint = TIME_TINTS[timeOfDay];
  if (tint && tint.amount > 0) color.lerp(tint.color, tint.amount);
  color.multiplyScalar(TIME_FACTORS[timeOfDay] ?? 1);

  return color;
};

/**
 * Calculate resource probabilities for a given biome and elevation
 */
const calculateResourceProbabilities = (
  biome: BiomeType,
  elevation: number,
): Record<ResourceTypeName, number> => {
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
    ancient_artifact: 0.001,
  };

  switch (biome) {
    case 'mountains':
      baseProbabilities.stone = 0.7;
      baseProbabilities.iron = 0.3;
      baseProbabilities.gold = 0.15;
      baseProbabilities.coal = 0.25;
      baseProbabilities.gem = 0.1;
      break;
    case 'hills':
      baseProbabilities.stone = 0.4;
      baseProbabilities.iron = 0.15;
      baseProbabilities.coal = 0.12;
      break;
    case 'deciduous_forest':
    case 'coniferous_forest':
    case 'taiga':
    case 'rainforest':
    case 'tropical_forest':
      baseProbabilities.wood = 0.8;
      baseProbabilities.food = 0.3;
      break;
    case 'grassland':
    case 'savanna':
      baseProbabilities.food = 0.35;
      break;
    case 'marsh':
    case 'swamp':
      baseProbabilities.food = 0.25;
      baseProbabilities.wood = 0.2;
      break;
    case 'enchanted_forest':
      baseProbabilities.mana = 0.25;
      baseProbabilities.crystal = 0.15;
      baseProbabilities.wood = 0.5;
      break;
    case 'desert':
      baseProbabilities.stone = 0.5;
      baseProbabilities.iron = 0.1;
      baseProbabilities.gold = 0.1;
      baseProbabilities.food = 0.02;
      break;
    case 'volcanic':
      baseProbabilities.gem = 0.2;
      baseProbabilities.iron = 0.25;
      baseProbabilities.stone = 0.5;
      break;
  }

  if (elevation > 0.7) {
    baseProbabilities.stone *= 1.5;
    baseProbabilities.iron *= 1.3;
    baseProbabilities.gold *= 1.4;
  }

  return baseProbabilities;
};

type RandomSource = () => number;

const generateResources = (tile: Tile, random: RandomSource): Resource[] => {
  const resources: Resource[] = [];
  const probabilities = calculateResourceProbabilities(tile.type, tile.height);

  Object.entries(probabilities).forEach(([type, probability]) => {
    if (random() < probability) {
      resources.push({
        type: type as ResourceTypeName,
        quantity: Math.floor(random() * 10) + 1,
        discovered: false,
      });
    }
  });

  return resources;
};

const FOREST_BIOMES: BiomeType[] = [
  'deciduous_forest',
  'coniferous_forest',
  'taiga',
  'rainforest',
  'tropical_forest',
  'enchanted_forest',
];

const ROCKY_BIOMES: BiomeType[] = ['mountains', 'hills', 'rocky_shore', 'badlands', 'mesa'];

const determineNaturalStructure = (tile: Tile, random: RandomSource): Structure | null => {
  if (FOREST_BIOMES.includes(tile.type)) {
    const roll = random();
    const treeType = roll < 0.7 ? 'mature_tree' : roll < 0.9 ? 'young_tree' : 'ancient_tree';
    return {
      type: treeType,
      health: 100,
      level: treeType === 'ancient_tree' ? 3 : treeType === 'mature_tree' ? 2 : 1,
    };
  }

  if (ROCKY_BIOMES.includes(tile.type)) {
    if (random() < 0.4) {
      return { type: random() < 0.7 ? 'rock_outcrop' : 'boulder', health: 150 };
    }
  }

  if (['grassland', 'savanna', 'tundra'].includes(tile.type)) {
    if (random() < 0.2) return { type: 'bush', health: 50 };
  }

  if (tile.height > 0.3 && random() < 0.003) {
    return { type: 'ruins', health: 200 };
  }

  return null;
};

/**
 * Carve rivers from highland sources down to the sea, pooling into lakes when
 * they get stuck in a basin. Rivers raise moisture around them, which the biome
 * pass then turns into greener land.
 */
const carveRivers = (tiles: Tile[][], mapSize: number, random: RandomSource, count: number): void => {
  const inBounds = (x: number, y: number) => x >= 0 && x < mapSize && y >= 0 && y < mapSize;

  for (let river = 0; river < count; river++) {
    // Find a high starting point (best of a few random samples)
    let sx = 0;
    let sy = 0;
    let best = -1;
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = Math.floor(random() * mapSize);
      const y = Math.floor(random() * mapSize);
      const h = tiles[x][y].height;
      if (h > best && h > 0.55 && h < 0.95) {
        best = h;
        sx = x;
        sy = y;
      }
    }
    if (best < 0) continue;

    let x = sx;
    let y = sy;
    const walked: Tile[] = [];
    const maxSteps = mapSize * 3;

    for (let step = 0; step < maxSteps; step++) {
      const tile = tiles[x][y];
      if (tile.height < 0.26) break; // reached the sea
      walked.push(tile);

      let nextX = x;
      let nextY = y;
      let lowest = tile.height;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(nx, ny)) continue;
          // Small jitter keeps rivers from running dead straight
          const h = tiles[nx][ny].height + (random() - 0.5) * 0.01;
          if (h < lowest) {
            lowest = h;
            nextX = nx;
            nextY = ny;
          }
        }
      }

      if (nextX === x && nextY === y) {
        // Local basin — pool into a lake and stop
        const radius = 1 + Math.floor(random() * 2);
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dy = -radius; dy <= radius; dy++) {
            const nx = x + dx;
            const ny = y + dy;
            if (!inBounds(nx, ny)) continue;
            if (Math.hypot(dx, dy) > radius) continue;
            const pool = tiles[nx][ny];
            if (pool.height < 0.26) continue;
            pool.height = 0.255;
            pool.type = 'lake';
            pool.walkable = true;
          }
        }
        break;
      }

      x = nextX;
      y = nextY;
    }

    // Only keep rivers that actually went somewhere
    if (walked.length < 5) continue;
    for (const tile of walked) {
      if (tile.type === 'lake') continue;
      tile.height = Math.min(tile.height, 0.265);
      tile.type = 'river';
      tile.walkable = true;
      // Wet the banks
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          const nx = tile.x + dx;
          const ny = tile.y + dy;
          if (!inBounds(nx, ny)) continue;
          const bank = tiles[nx][ny];
          const distance = Math.hypot(dx, dy);
          bank.moisture = Math.min(1, bank.moisture + 0.28 / (1 + distance));
        }
      }
    }
  }
};

export interface GenerateWorldOptions {
  seed: number;
  mapSize: number;
  template?: WorldTemplate;
  timeOfDay?: TimeOfDayName;
  season?: SeasonName;
}

/**
 * Generate a complete world. Returns tile data only — the renderer builds the
 * instanced meshes from it.
 */
export const generateWorld = ({
  seed,
  mapSize,
  template = 'continents',
}: GenerateWorldOptions): { tilesData: Tile[][] } => {
  const config = WORLD_TEMPLATES[template] ?? WORLD_TEMPLATES.continents;
  const simplex = new SimplexNoise(seed);
  const variantRandom = seedrandom(`${seed}-variant`);
  const seededRandom = seedrandom(seed.toString());
  const random = () => seededRandom();

  const tilesData: Tile[][] = [];

  // Noise frequencies are cycles across the whole map, not per tile.
  const landformScale = 8;
  const detailScale = 20;
  const moistureFreq = 5;
  const tempDetailFreq = 7;
  const fertilityFreq = 9;

  for (let x = 0; x < mapSize; x++) {
    tilesData[x] = [];
    for (let y = 0; y < mapSize; y++) {
      tilesData[x][y] = createDefaultTile(x, y);
    }
  }

  // --- Heightmap and climate -------------------------------------------
  for (let x = 0; x < mapSize; x++) {
    for (let y = 0; y < mapSize; y++) {
      const tile = tilesData[x][y];
      const nx = x / mapSize;
      const ny = y / mapSize;

      const continentNoise = simplex.noise2D(nx * config.continentScale, ny * config.continentScale);
      const landformNoise = simplex.noise2D(nx * landformScale, ny * landformScale) * 0.5;
      const detailNoise = simplex.noise2D(nx * detailScale, ny * detailScale) * 0.25;

      let height = (continentNoise * 0.6 + landformNoise * 0.3 + detailNoise * 0.1 + 1) / 2;
      height = Math.pow(height, config.contrast) + config.lift;

      if (config.flatten > 0) {
        height = height * (1 - config.flatten) + 0.45 * config.flatten;
      }

      // Water margin so continents do not run off the edge of the world
      if (config.edgeFalloff > 0) {
        const edgeX = Math.min(nx, 1 - nx) / config.edgeFalloff;
        const edgeY = Math.min(ny, 1 - ny) / config.edgeFalloff;
        height *= Math.min(Math.min(edgeX, edgeY), 1);
      }

      tile.height = Math.max(0, Math.min(1, height));

      let moisture = (simplex.noise2D(nx * moistureFreq, ny * moistureFreq) + 1) / 2;
      if (tile.height < 0.3) {
        moisture = Math.min(1, moisture + (0.3 - tile.height) * 0.5);
      }
      tile.moisture = Math.max(0, Math.min(1, moisture));

      // Latitude drives base temperature; elevation cools it.
      const latitudeFactor = Math.abs(ny - 0.5) * 2;
      const baseTemp = 1 - Math.pow(latitudeFactor, 1.2) * 0.85;
      const tempVariation = ((simplex.noise2D(nx * tempDetailFreq, ny * tempDetailFreq) + 1) / 2) * 0.2 - 0.1;
      tile.temperature = Math.max(0, Math.min(1, baseTemp + tempVariation - tile.height * 0.35));

      let fertility = (simplex.noise2D(nx * fertilityFreq, ny * fertilityFreq) + 1) / 2;
      if (tile.height < 0.25) fertility *= 0.1;
      else if (tile.height > 0.75) fertility *= 0.3;
      else if (tile.moisture > 0.7 && tile.temperature > 0.6) fertility *= 1.5;
      else if (tile.moisture < 0.2) fertility *= 0.4;
      tile.fertility = Math.max(0, Math.min(1, fertility));
    }
  }

  // --- Rivers and lakes -------------------------------------------------
  const riverCount = Math.max(0, Math.round((mapSize / 64) * config.riverDensity));
  carveRivers(tilesData, mapSize, random, riverCount);

  // --- Biomes, resources, decoration ------------------------------------
  for (let x = 0; x < mapSize; x++) {
    for (let y = 0; y < mapSize; y++) {
      const tile = tilesData[x][y];

      // Rivers and lakes were assigned during carving; keep them.
      if (tile.type !== 'river' && tile.type !== 'lake') {
        tile.type = determineBiome(tile.height, tile.moisture, tile.temperature);
      }

      // Two different kinds of randomness, deliberately kept apart.
      //
      // `variant` stays an independent per-tile roll, because the things that
      // read it want scatter: which tiles get a tree, which stretch of coast
      // turns to sand. A smooth field there would clump every forest into bands.
      //
      // `shade` picks which of three material shades the tile wears, and that
      // wants the opposite. Rolled per tile, neighbours never agreed and a
      // field of one biome came out as a patchwork of hard-edged squares —
      // the single biggest reason the map read as tiled rather than continuous.
      // Sampled from low-frequency noise, shade varies over a dozen tiles the
      // way real ground does, and the shader's 8x8 grain supplies the fine
      // texture on top.
      tile.variant = variantRandom();
      tile.shade = Math.max(0, Math.min(0.999,
        (simplex.noise2D(
          (x / mapSize) * VARIANT_SCALE + 41.7,
          (y / mapSize) * VARIANT_SCALE + 17.3,
        ) + 1) / 2,
      ));
      tile.resources = generateResources(tile, random);
      tile.structure = determineNaturalStructure(tile, random);
      tile.scaledHeight = computeScaledHeight(tile.height, tile.type);
      tile.walkable = !['deep_ocean', 'ocean'].includes(tile.type) && tile.height >= 0.25;

      // Fresh water is drinkable and supports life on its banks
      if (isWaterBiome(tile.type)) {
        tile.structure = null;
      }
    }
  }

  // --- Coastlines -------------------------------------------------------
  // Run after biomes, because it rewrites the types they assigned.
  shapeCoastlines(tilesData, mapSize);

  return { tilesData };
};

/**
 * Turn a height-banded shoreline into a graded one.
 *
 * Water used to be assigned purely from height, so a steep gradient could drop
 * deep ocean straight against a cliff, and a beach only appeared where the
 * coast happened to be warm. Decoding a WorldBox map showed the opposite:
 * sand is 45% of all land/water contacts, and deep water touches shallow only
 * 28 times against 355 close/shallow contacts — their coast is a monotonic
 * ramp, land -> sand -> shallow -> ocean -> deep
 * (09-WORLDBOX-VISUAL-RESEARCH.md; measured from 256 decoded tiles).
 *
 * Three passes, each reading the *previous* pass's result, because a tile
 * cannot decide what it is until its neighbour has.
 */
export const shapeCoastlines = (tiles: Tile[][], size: number): void => {
  const at = (x: number, y: number): Tile | null =>
    (x < 0 || y < 0 || x >= size || y >= size) ? null : tiles[x][y];

  const touches = (x: number, y: number, kinds: ReadonlySet<string>): boolean => {
    for (const [dx, dy] of ORTHOGONAL) {
      const neighbour = at(x + dx, y + dy);
      if (neighbour && kinds.has(neighbour.type)) return true;
    }
    return false;
  };

  const SEA = new Set(['deep_ocean', 'ocean', 'shallow_water']);
  const SHORE_OR_LAND = new Set<string>();

  // Pass 1 — sand at the waterline, but only on ground gentle enough to hold
  // it. A cliff meeting the sea should stay rock; that is what keeps the
  // coastline from becoming a uniform sandy ring around every island.
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      const tile = tiles[x][y];
      if (isWaterBiome(tile.type)) continue;
      if (tile.height > COAST_SAND_MAX_HEIGHT) continue;
      if (!touches(x, y, SEA)) continue;
      // Broken up by the tile's own variant, not laid down everywhere.
      //
      // Height alone put sand on 87% of the waterline, which rings every island
      // in a uniform band — the exact look their 45% figure argues against, and
      // worse than no beaches at all. A coast that is partly sand and partly
      // grass reads as a coast; one that is entirely sand reads as a border.
      if ((tile.variant ?? 0.5) < COAST_SAND_SPARSITY) continue;
      tile.type = 'beach';
    }
  }

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (!isWaterBiome(tiles[x][y].type)) SHORE_OR_LAND.add(`${x},${y}`);
    }
  }

  // Pass 2 — any sea tile touching land becomes shallow.
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      const tile = tiles[x][y];
      if (tile.type !== 'deep_ocean' && tile.type !== 'ocean') continue;
      let coastal = false;
      for (const [dx, dy] of ORTHOGONAL) {
        if (SHORE_OR_LAND.has(`${x + dx},${y + dy}`)) { coastal = true; break; }
      }
      if (coastal) tile.type = 'shallow_water';
    }
  }

  // Pass 3 — deep water may not touch shallow. Repeated until it holds, so a
  // narrow channel grades properly instead of only its first rank.
  const SHALLOW = new Set(['shallow_water']);
  for (let sweep = 0; sweep < 2; sweep += 1) {
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        const tile = tiles[x][y];
        if (tile.type !== 'deep_ocean') continue;
        if (touches(x, y, SHALLOW)) tile.type = 'ocean';
      }
    }
  }

  // Types changed, so anything derived from them has to be recomputed.
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      const tile = tiles[x][y];
      tile.scaledHeight = computeScaledHeight(tile.height, tile.type);
      tile.walkable = !['deep_ocean', 'ocean'].includes(tile.type) && tile.height >= 0.25;
      if (isWaterBiome(tile.type)) tile.structure = null;
    }
  }
};

/**
 * How quickly the material-shade field varies, in cycles across the map.
 *
 * Low on purpose: at 9 cycles over a 128-tile world one patch spans roughly
 * fourteen tiles, which reads as ground changing underfoot rather than as
 * noise. Raise it and the patchwork comes back.
 */
const VARIANT_SCALE = 9;

/** Ground above this is too steep to hold sand, and stays rock at the shore. */
const COAST_SAND_MAX_HEIGHT = 0.40;
/**
 * Fraction of eligible coast that stays un-sanded. Tuned by measuring the
 * finished map: sand should be about half the waterline, matching the 45% they
 * measure, not the 87% a height rule alone produces.
 */
const COAST_SAND_SPARSITY = 0.34;

const ORTHOGONAL: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];
