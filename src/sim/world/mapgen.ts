/**
 * Seeded procedural map generation, ported from Aetheria's original
 * generator (heightmap, climate, rivers and lakes, biomes, resources, natural
 * cover, graded coastlines) onto the tile grid. Pure data: nothing here knows
 * about rendering. The same seed, template and grid size always produce the
 * same map; all randomness comes from named `RngStreams`.
 */
import { RngStreams, type Rng } from '../core/rng';
import type { WorldGrid } from './grid';
import { SimplexNoise } from './noise';
import { tileTypes, topLayers } from './tiles';

export type WorldTemplate = 'continents' | 'pangaea' | 'islands' | 'archipelago' | 'highlands' | 'plains';

export interface TemplateConfig {
  label: string;
  /** Cycles of the continent-scale noise across the map. */
  continentScale: number;
  /** Height curve exponent: higher means more ocean and sharper peaks. */
  contrast: number;
  /** Added to every land height before clamping. */
  lift: number;
  /** Width of the water margin around the map (0 disables). */
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

export interface GenerateMapOptions {
  seed: number;
  template?: WorldTemplate;
  /** Share the world's streams so generation draws from `world.rng`. */
  rng?: RngStreams;
}

/** Biome id from normalised height, moisture and temperature. */
export function determineBiome(height: number, moisture: number, temperature: number): string {
  if (height < 0.15) return 'deep_ocean';
  if (height < 0.25) return 'ocean';
  if (height < 0.28) return temperature > 0.7 ? 'beach' : 'shallow_water';

  if (height > 0.85) {
    if (temperature < 0.2) return 'snow';
    if (temperature > 0.7) return 'volcanic';
    return 'mountains';
  }
  if (height > 0.75) {
    if (temperature < 0.15) return 'snow';
    if (temperature < 0.3) return 'tundra';
    return 'mountains';
  }
  if (height > 0.6) {
    if (temperature < 0.2) return 'taiga';
    // Only the driest, hottest high ground goes to rock desert.
    if (temperature > 0.8 && moisture < 0.3) return 'mesa';
    if (moisture > 0.7) return 'hills';
    if (moisture < 0.12) return 'badlands';
    return 'hills';
  }
  if (temperature > 0.7) {
    if (moisture < 0.15) return 'desert';
    if (moisture < 0.3) return 'savanna';
    if (moisture > 0.65) return 'rainforest';
    return 'tropical_forest';
  }
  if (temperature < 0.25) {
    if (moisture > 0.7) return 'taiga';
    if (moisture < 0.3) return 'tundra';
    return 'coniferous_forest';
  }
  if (moisture > 0.8) return height < 0.4 ? 'swamp' : 'marsh';
  if (moisture > 0.6) return 'deciduous_forest';
  return 'grassland';
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Fill `grid` with a fresh map. Resets all terrain fields and clears pending dirty tiles. */
export function generateMap(grid: WorldGrid, options: GenerateMapOptions): void {
  const { seed } = options;
  const config = WORLD_TEMPLATES[options.template ?? 'continents'] ?? WORLD_TEMPLATES.continents;
  const rng = options.rng ?? new RngStreams(seed);
  const noise = new SimplexNoise(seed);

  resetTerrain(grid);
  generateHeightAndClimate(grid, noise, config);

  const riverCount = Math.max(0, Math.round((grid.width / 64) * config.riverDensity));
  carveRivers(grid, rng.get('mapgen.rivers'), riverCount);

  const variants = new Float32Array(grid.size);
  const variantRng = rng.get('mapgen.variant');
  for (let i = 0; i < grid.size; i++) variants[i] = variantRng.next();

  const decor = rng.get('mapgen.decor');
  for (let i = 0; i < grid.size; i++) {
    const current = grid.typeIdOf(i);
    if (current !== 'river' && current !== 'lake') {
      grid.setType(i, determineBiome(grid.heights[i], grid.moistures[i], grid.temperatures[i]));
    }
    if (grid.typeOf(i).liquid) continue;
    placeResource(grid, i, decor);
    placeNaturalCover(grid, i, decor);
  }

  shapeCoastlines(grid, variants);

  // Generation is a bulk write, not a delta: the view reads the whole grid.
  grid.refreshFlags();
  grid.resetDirty();
}

function resetTerrain(grid: WorldGrid): void {
  grid.typeIds.fill(0);
  grid.topLayerIds.fill(0);
  grid.fireIntensity.fill(0);
  grid.fuel.fill(0);
  grid.heat.fill(0);
  grid.cityIds.fill(0);
  grid.buildingIds.fill(0);
  grid.resourceIds.fill(0);
  grid.resourceAmounts.fill(0);
  grid.refreshFlags();
}

function generateHeightAndClimate(grid: WorldGrid, noise: SimplexNoise, config: TemplateConfig): void {
  // Noise frequencies are cycles across the whole map, not per tile.
  const landformScale = 8;
  const detailScale = 20;
  const moistureFreq = 5;
  const tempDetailFreq = 7;
  const fertilityFreq = 9;
  const { width, height: rows } = grid;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const i = grid.index(x, y);
      const nx = x / width;
      const ny = y / rows;

      const continent = noise.noise2D(nx * config.continentScale, ny * config.continentScale);
      const landform = noise.noise2D(nx * landformScale, ny * landformScale) * 0.5;
      const detail = noise.noise2D(nx * detailScale, ny * detailScale) * 0.25;

      let h = (continent * 0.6 + landform * 0.3 + detail * 0.1 + 1) / 2;
      h = Math.pow(h, config.contrast) + config.lift;
      if (config.flatten > 0) h = h * (1 - config.flatten) + 0.45 * config.flatten;
      if (config.edgeFalloff > 0) {
        const edgeX = Math.min(nx, 1 - nx) / config.edgeFalloff;
        const edgeY = Math.min(ny, 1 - ny) / config.edgeFalloff;
        h *= Math.min(edgeX, edgeY, 1);
      }
      h = clamp01(h);
      grid.heights[i] = h;
      const hq = grid.heights[i];

      let moisture = (noise.noise2D(nx * moistureFreq, ny * moistureFreq) + 1) / 2;
      if (hq < 0.3) moisture = Math.min(1, moisture + (0.3 - hq) * 0.5);
      moisture = clamp01(moisture);
      grid.moistures[i] = moisture;

      // Latitude drives base temperature; elevation cools it.
      const latitude = Math.abs(ny - 0.5) * 2;
      const baseTemp = 1 - Math.pow(latitude, 1.2) * 0.85;
      const tempVariation = ((noise.noise2D(nx * tempDetailFreq, ny * tempDetailFreq) + 1) / 2) * 0.2 - 0.1;
      const temperature = clamp01(baseTemp + tempVariation - hq * 0.35);
      grid.temperatures[i] = temperature;

      let fertility = (noise.noise2D(nx * fertilityFreq, ny * fertilityFreq) + 1) / 2;
      if (hq < 0.25) fertility *= 0.1;
      else if (hq > 0.75) fertility *= 0.3;
      else if (moisture > 0.7 && temperature > 0.6) fertility *= 1.5;
      else if (moisture < 0.2) fertility *= 0.4;
      grid.fertilities[i] = clamp01(fertility);
    }
  }
}

/**
 * Carve rivers from highland sources down to the sea, pooling into lakes when
 * they get stuck in a basin. Rivers wet the land around them, which the biome
 * pass then turns into greener ground.
 */
function carveRivers(grid: WorldGrid, rng: Rng, count: number): void {
  const { width, height: rows } = grid;
  const h = grid.heights;

  for (let river = 0; river < count; river++) {
    // Best of a few random samples for a high starting point.
    let start = -1;
    let best = -1;
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = Math.floor(rng.next() * width);
      const y = Math.floor(rng.next() * rows);
      const i = grid.index(x, y);
      if (h[i] > best && h[i] > 0.55 && h[i] < 0.95) {
        best = h[i];
        start = i;
      }
    }
    if (start < 0) continue;

    let x = grid.xOf(start);
    let y = grid.yOf(start);
    const walked: number[] = [];
    const maxSteps = Math.max(width, rows) * 3;

    for (let step = 0; step < maxSteps; step++) {
      const here = grid.index(x, y);
      if (h[here] < 0.26) break; // reached the sea
      walked.push(here);

      let nextX = x;
      let nextY = y;
      let lowest = h[here];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          if (!grid.inBounds(x + dx, y + dy)) continue;
          // Small jitter keeps rivers from running dead straight.
          const hh = h[grid.index(x + dx, y + dy)] + (rng.next() - 0.5) * 0.01;
          if (hh < lowest) {
            lowest = hh;
            nextX = x + dx;
            nextY = y + dy;
          }
        }
      }

      if (nextX === x && nextY === y) {
        // Local basin: pool into a lake and stop.
        const radius = 1 + Math.floor(rng.next() * 2);
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dy = -radius; dy <= radius; dy++) {
            if (!grid.inBounds(x + dx, y + dy)) continue;
            if (Math.hypot(dx, dy) > radius) continue;
            const pool = grid.index(x + dx, y + dy);
            if (h[pool] < 0.26) continue;
            h[pool] = 0.255;
            grid.setType(pool, 'lake');
          }
        }
        break;
      }
      x = nextX;
      y = nextY;
    }

    // Only keep rivers that actually went somewhere.
    if (walked.length < 5) continue;
    for (const i of walked) {
      if (grid.typeIdOf(i) === 'lake') continue;
      h[i] = Math.min(h[i], 0.265);
      grid.setType(i, 'river');
      const tx = grid.xOf(i);
      const ty = grid.yOf(i);
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          if (!grid.inBounds(tx + dx, ty + dy)) continue;
          const bank = grid.index(tx + dx, ty + dy);
          grid.moistures[bank] = Math.min(1, grid.moistures[bank] + 0.28 / (1 + Math.hypot(dx, dy)));
        }
      }
    }
  }
}

type ResourceChances = Record<string, number>;

function resourceChances(biome: string, elevation: number): ResourceChances {
  const p: ResourceChances = {
    wood: 0.1, stone: 0.1, food: 0.1, water: 0.1, iron: 0.05, gold: 0.02, silver: 0.03,
    coal: 0.05, crystal: 0.01, gem: 0.01, mana: 0.005, ancient_artifact: 0.001,
  };
  switch (biome) {
    case 'mountains': Object.assign(p, { stone: 0.7, iron: 0.3, gold: 0.15, coal: 0.25, gem: 0.1 }); break;
    case 'hills': Object.assign(p, { stone: 0.4, iron: 0.15, coal: 0.12 }); break;
    case 'deciduous_forest':
    case 'coniferous_forest':
    case 'taiga':
    case 'rainforest':
    case 'tropical_forest': Object.assign(p, { wood: 0.8, food: 0.3 }); break;
    case 'grassland':
    case 'savanna': p.food = 0.35; break;
    case 'marsh':
    case 'swamp': Object.assign(p, { food: 0.25, wood: 0.2 }); break;
    case 'enchanted_forest': Object.assign(p, { mana: 0.25, crystal: 0.15, wood: 0.5 }); break;
    case 'desert': Object.assign(p, { stone: 0.5, iron: 0.1, gold: 0.1, food: 0.02 }); break;
    case 'volcanic': Object.assign(p, { gem: 0.2, iron: 0.25, stone: 0.5 }); break;
  }
  if (elevation > 0.7) {
    p.stone *= 1.5;
    p.iron *= 1.3;
    p.gold *= 1.4;
  }
  return p;
}

/** One resource slot per tile: the rarest kind that rolled in, in table order. */
function placeResource(grid: WorldGrid, i: number, rng: Rng): void {
  const chances = resourceChances(grid.typeIdOf(i), grid.heights[i]);
  let pick: string | null = null;
  let amount = 0;
  for (const [kind, chance] of Object.entries(chances)) {
    if (rng.next() < chance) {
      pick = kind;
      amount = Math.floor(rng.next() * 10) + 1;
    }
  }
  if (pick) grid.setResource(i, pick, amount);
}

const FOREST = new Set(['deciduous_forest', 'coniferous_forest', 'taiga', 'rainforest', 'tropical_forest', 'enchanted_forest']);
const ROCKY = new Set(['mountains', 'hills', 'rocky_shore', 'badlands', 'mesa']);
const SCRUBBY = new Set(['grassland', 'savanna', 'tundra']);

function placeNaturalCover(grid: WorldGrid, i: number, rng: Rng): void {
  const biome = grid.typeIdOf(i);
  let layer: string | null = null;
  if (FOREST.has(biome)) {
    const roll = rng.next();
    layer = roll < 0.7 ? 'mature_tree' : roll < 0.9 ? 'young_tree' : 'ancient_tree';
  } else if (ROCKY.has(biome) && rng.next() < 0.4) {
    layer = rng.next() < 0.7 ? 'rock_outcrop' : 'boulder';
  } else if (SCRUBBY.has(biome) && rng.next() < 0.2) {
    layer = 'bush';
  } else if (grid.heights[i] > 0.3 && rng.next() < 0.003) {
    layer = 'ruins';
  }
  if (!layer) return;
  grid.setTopLayer(i, layer);
  grid.setFuel(i, topLayers.get(layer).fuel);
}

/** Ground above this is too steep to hold sand and stays rock at the shore. */
const COAST_SAND_MAX_HEIGHT = 0.4;
/** Fraction of eligible coast that stays un-sanded, so sand is about half the waterline. */
const COAST_SAND_SPARSITY = 0.34;

/**
 * Turn a height-banded shoreline into a graded one: land -> sand -> shallow ->
 * ocean -> deep. Each pass reads the previous pass's result.
 */
export function shapeCoastlines(grid: WorldGrid, variants: Float32Array): void {
  const SEA = new Set([tileTypes.get('deep_ocean').index, tileTypes.get('ocean').index, tileTypes.get('shallow_water').index]);
  const deep = tileTypes.get('deep_ocean').index;
  const ocean = tileTypes.get('ocean').index;
  const shallow = tileTypes.get('shallow_water').index;
  const n: number[] = [];
  const touches = (i: number, kinds: ReadonlySet<number>): boolean => {
    for (const j of grid.neighbors(i, false, n)) if (kinds.has(grid.typeIds[j])) return true;
    return false;
  };

  // Pass 1: sand at the waterline, on gentle ground, broken up by variant.
  for (let i = 0; i < grid.size; i++) {
    if (grid.typeOf(i).liquid) continue;
    if (grid.heights[i] > COAST_SAND_MAX_HEIGHT) continue;
    if (!touches(i, SEA)) continue;
    if (variants[i] < COAST_SAND_SPARSITY) continue;
    grid.setType(i, 'beach');
  }

  // Pass 2: any open-sea tile touching land becomes shallow.
  const toShallow: number[] = [];
  for (let i = 0; i < grid.size; i++) {
    const t = grid.typeIds[i];
    if (t !== deep && t !== ocean) continue;
    for (const j of grid.neighbors(i, false, n)) {
      if (!grid.typeOf(j).liquid) {
        toShallow.push(i);
        break;
      }
    }
  }
  for (const i of toShallow) grid.setType(i, 'shallow_water');

  // Pass 3: deep water may not touch shallow.
  const SHALLOW = new Set([shallow]);
  for (let sweep = 0; sweep < 2; sweep++) {
    for (let i = 0; i < grid.size; i++) {
      if (grid.typeIds[i] === deep && touches(i, SHALLOW)) grid.setType(i, 'ocean');
    }
  }
}
