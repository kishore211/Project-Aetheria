// Heat, as one number per tile, with a ladder of thresholds hanging off it.
//
// Phase 18.2. WorldBox gets an enormous amount out of a single per-tile
// temperature: pass one threshold and snow thaws, pass the next and the tile
// catches, then the biome strips, then the soil turns to sand, then the sand
// turns to lava. Melting a continent stops being a bespoke god-power with its
// own code path and becomes *what happens* when you put enough heat into the
// ground — and so does an ice age, running the same ladder downward.
//
// The thresholds keep the shape of theirs (each rung roughly two to three
// times the last) but not the numbers, which are on a scale where 0 is
// temperate and a desert sits near +18. Their ignition point of 10 would put
// half our map permanently on fire, and pasting a number off a wiki without
// rescaling it is how the herd cooldowns and the age lengths went wrong.
//
// `tile.heat` is an absolute temperature, not an excess, and it relaxes toward
// whatever the tile's climate says it should be. That is what makes the whole
// thing self-undoing: stop pouring heat in and the ground comes back, slowly,
// on its own. A cascade you cannot reverse is a cascade nobody dares trigger.
import { isWaterBiome, type BiomeType, type Tile } from '../types/world';

/** Snow and ice give up. */
export const THAW = 2;
/** Anything that burns, catches. */
export const IGNITE = 60;
/** The biome is cooked off entirely, leaving bare ground. */
export const STRIP = 90;
/** Soil bakes to sand. */
export const SCORCH = 120;
/** Sand goes to lava. The end of the ladder. */
export const MELT = 300;

/** The same ladder downward. */
export const FREEZE = -40;
export const DEEP_FREEZE = -70;

/** How fast a tile forgets, in simulated seconds to close most of the gap. */
const RELAX_SECONDS = 25;

/**
 * What a burning tile puts into the ground each simulated second.
 *
 * Chosen from where it *settles*, not from how hot a fire feels. A tile
 * loses roughly a twenty-fifth of its excess per second, so a sustained
 * source levels off at about twenty-five times its rate — and the first
 * figure here, picked by eye, levelled off at 850 and quietly turned every
 * ordinary forest fire into a lava field. A fire should strip the biome and
 * stop there. Melting the ground needs something that arrives all at once,
 * which is what the meteor is for.
 */
export const FIRE_HEAT_PER_SECOND = 4.2;

/** How much of the difference a tile shares with a neighbour per second. */
const CONDUCTION = 0.35;

/**
 * What this tile's climate says it should be, in degrees on our scale.
 *
 * Read off the existing 0-1 `temperature` field rather than stored, so a
 * terraformed tile gets the right ambient the moment its climate changes and
 * there is no second source of truth to drift.
 */
export const ambientOf = (tile: Tile): number => {
  const climate = (tile.temperature - 0.5) * 60;
  // Standing water is a heat sink with an enormous mass behind it: a lake does
  // not warm because the air did. Without this, a hot day boils the sea.
  if (isWaterBiome(tile.type)) return Math.min(climate, 12);
  // Lava is not weather. A volcanic tile sits just under ignition, which is
  // what makes the ground around a volcano genuinely dangerous rather than
  // merely orange.
  if (tile.type === 'volcanic') return Math.max(climate, IGNITE - 8);
  return climate;
};

/** Current temperature, defaulting to whatever the climate says. */
export const heatOf = (tile: Tile): number => tile.heat ?? ambientOf(tile);

/** Put heat into a tile. Negative cools it. */
export const addHeat = (tile: Tile, degrees: number): void => {
  tile.heat = heatOf(tile) + degrees;
};

/** Let a tile drift back toward its climate. */
export const relax = (tile: Tile, delta: number): void => {
  const ambient = ambientOf(tile);
  const current = heatOf(tile);
  const share = Math.min(1, delta / RELAX_SECONDS);
  const next = current + (ambient - current) * share;
  // Snapped when it is close enough, so a tile that has cooled stops carrying
  // a number at all and `heatOf` goes back to reading the climate directly.
  tile.heat = Math.abs(next - ambient) < 0.5 ? undefined : next;
};

/** Move heat between two tiles. Conduction is what lets a fire front travel. */
export const conduct = (from: Tile, to: Tile, delta: number): void => {
  const difference = heatOf(from) - heatOf(to);
  if (Math.abs(difference) < 1) return;
  const moved = difference * Math.min(0.5, CONDUCTION * delta);
  addHeat(from, -moved);
  addHeat(to, moved);
};

/** What the ladder did to a tile, for the caller to act on and report. */
export interface Cascade {
  /** The rung that fired. */
  step: 'thaw' | 'ignite' | 'strip' | 'scorch' | 'melt' | 'freeze' | 'deep_freeze';
  /** The biome it became, if it changed. */
  became?: BiomeType;
  /** Whether the tile should now be burning. */
  ignites?: boolean;
  /** One line for the chronicle, or null if it is not worth announcing. */
  note: string | null;
}

const FROZEN: BiomeType[] = ['snow', 'ice', 'glacier'];
const BURNABLE: BiomeType[] = [
  'grassland', 'savanna', 'deciduous_forest', 'coniferous_forest',
  'rainforest', 'tropical_forest', 'taiga', 'enchanted_forest',
  'swamp', 'marsh', 'bloom',
];
const SOIL: BiomeType[] = [
  'grassland', 'savanna', 'hills', 'deciduous_forest', 'coniferous_forest',
  'rainforest', 'tropical_forest', 'taiga', 'badlands', 'tundra', 'marsh',
  'swamp', 'ashland', 'bloom',
];
const SAND: BiomeType[] = ['desert', 'beach', 'mesa', 'salt_flat'];
/** Water shallow enough to boil off entirely. */
const SHALLOW: BiomeType[] = ['shallow_water', 'river', 'lake'];

/**
 * Run the ladder on a tile and report what it did.
 *
 * Highest rung first and one rung per call: a tile that has just been hit hard
 * enough to melt should not also be reported as thawing, and stepping one rung
 * at a time is what makes a continent go over in a visible wave rather than
 * all at once. Returns null on the overwhelming majority of calls, which is
 * why nothing here draws from the random stream.
 */
export const cascade = (tile: Tile): Cascade | null => {
  const heat = heatOf(tile);

  if (heat >= MELT && (SAND.includes(tile.type) || tile.type === 'badlands')) {
    return { step: 'melt', became: 'volcanic', note: 'The ground gives up and runs' };
  }
  if (heat >= SCORCH && SOIL.includes(tile.type)) {
    return { step: 'scorch', became: 'desert', note: null };
  }
  if (heat >= STRIP && (BURNABLE.includes(tile.type) || tile.type === 'hills')) {
    // Ash, not badlands. Badlands is land that was always poor; ash is land
    // that was rich this morning, and the map should be able to tell you which
    // of those you are looking at.
    return { step: 'strip', became: 'ashland', note: null };
  }
  // Shallow water boiled off. Deep ocean is exempt: there is too much of it,
  // and a sea that evaporates because one meteor landed in it is a sea nobody
  // believes in.
  if (heat >= STRIP && SHALLOW.includes(tile.type)) {
    return { step: 'strip', became: 'salt_flat', note: 'A lake boils away and leaves its salt' };
  }
  if (heat >= IGNITE && BURNABLE.includes(tile.type) && !tile.isOnFire) {
    return { step: 'ignite', ignites: true, note: null };
  }
  if (heat >= THAW && FROZEN.includes(tile.type)) {
    return { step: 'thaw', became: 'tundra', note: null };
  }
  if (heat <= DEEP_FREEZE && !isWaterBiome(tile.type)) {
    return { step: 'deep_freeze', became: 'glacier', note: 'Ice closes over the land' };
  }
  if (heat <= FREEZE && tile.type !== 'snow' && !FROZEN.includes(tile.type)) {
    return { step: 'freeze', became: 'snow', note: null };
  }
  return null;
};
