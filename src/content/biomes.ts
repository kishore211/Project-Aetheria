// src/content/biomes.ts
//
// The biome registry: one record per biome, holding everything the simulation
// knows about a kind of ground as data. How it is painted, what burns, what
// freezes, what counts as forest, what lives there, what ore it grows, and
// what walking on it does.
//
// The per-biome tables the simulation indexes (thermal's FROZEN, BURNABLE,
// SOIL, SAND and SHALLOW; worldBehaviour's FORESTS, SPREADING_FORESTS and
// NATIVES; extraPowers' BURNABLE; creatureAbilities' FROZEN; pathfinding's
// SHALLOW; worldGenerator's FOREST_BIOMES and ROCKY_BIOMES; biomeEffects'
// WOODS and BIOME_STEPS; oreVeins' VEIN_TABLE; mapPainter's MATERIAL) are
// derived from this file with the helpers at the bottom. To change a biome,
// change one record here.
//
// Some flags look alike but are not the same set, so they stay separate
// fields: `frozen` and `frostbound`, `burnsThermal` and `burnsByPower`. The
// colour tables in worldGenerator.ts (BIOME_BASE_COLORS, the blends) are
// palette, not behaviour, and are not in this registry.
//
// This module imports types only, apart from the paint enum and the helpers,
// so the simulation modules can import it without a cycle.
import type { BiomeType, EntityType } from '../types/world';
import type { OreType } from '../utils/oreVeins';
import type { BiomeStep } from '../utils/biomeEffects';

/**
 * The surface a biome is painted with. The map painter maps each biome to one
 * of these and shades it from there. Values are the enum order, and the order
 * is what the painter's tables were written against, so do not reorder.
 */
export enum PaintMaterial {
  Grass, Forest, Sand, Desert, Rock, Hills, Snow, Ice, Swamp, Volcanic,
  Corrupt, Enchanted, Savanna, Tundra, Strata, Ash, Salt, Bloom, Water,
  Candy, Crystal, Mushroom, Infernal, Waste,
}

/** Everything the registry records about one kind of biome. */
export interface BiomeDef {
  /** The surface the map painter draws this ground with. Every biome has one. */
  paint: PaintMaterial;
  /**
   * Thermal ladder: ground that is already frozen, so heat thaws it back to
   * its base biome (thermal.ts FROZEN). Snow, ice and glacier only.
   */
  frozen?: boolean;
  /**
   * Frost ladder: ground a cold creature will not freeze, because it is
   * already frozen or it is not ground at all (creatureAbilities.ts FROZEN).
   * Differs from `frozen`: tundra is in here, not there.
   */
  frostbound?: boolean;
  /**
   * Deep freeze: ground that counts as cold for the world's deep-freeze
   * process (worldBehaviour.ts COLD_GROUND). Differs from both of the above.
   */
  coldGround?: boolean;
  /**
   * Thermal ladder: vegetation that catches fire when it gets hot enough
   * (thermal.ts BURNABLE). Includes swamp, which the power list does not.
   */
  burnsThermal?: boolean;
  /**
   * Fire powers: ground a fire power sets alight (extraPowers.ts BURNABLE).
   * Includes hills, which the thermal list does not.
   */
  burnsByPower?: boolean;
  /** Thermal ladder: soil that scorches to ash at the scorch threshold (thermal.ts SOIL). */
  soil?: boolean;
  /** Thermal ladder: sand that melts at the melt threshold (thermal.ts SAND). */
  sand?: boolean;
  /**
   * Water shallow enough to boil off, and water a swimmer will cross
   * (thermal.ts SHALLOW and pathfinding.ts SHALLOW, which are the same set).
   */
  shallowWater?: boolean;
  /**
   * Forest: grows and burns as woodland, and slows walkers in the Entanglewood
   * (worldBehaviour.ts FORESTS, worldGenerator.ts FOREST_BIOMES and
   * biomeEffects.ts WOODS, which are the same set).
   */
  forest?: boolean;
  /**
   * Forest that spreads on its own. The enchanted one does not: it is placed,
   * not grown (worldBehaviour.ts SPREADING_FORESTS).
   */
  spreadsForest?: boolean;
  /** Rocky ground where natural structures appear (worldGenerator.ts ROCKY_BIOMES). */
  rocky?: boolean;
  /**
   * The animals that live here, in the order the wildlife row draws from them.
   * Order matters: populateWildlife picks by index.
   */
  natives?: EntityType[];
  /**
   * Ore that grows here, as weighted choices, in the order the vein picker
   * rolls against. Absent biomes grow no ore.
   */
  ore?: Array<[OreType, number]>;
  /** What walking on this ground does. Absent means full speed and harmless. */
  terrain?: BiomeStep;
}

/** One row of terrain. The same shape as the BiomeStep it builds. */
const terrain = (
  speed: number, hazard: number, note: string,
  status?: BiomeStep['status'], damage?: number,
): BiomeStep => ({ speed, hazard, note, status, damage });

/**
 * One record per biome.
 *
 * The first 24 keys are the biomes that have natives, in the order the wildlife
 * row lists them. That order is observable: knowledge.ts walks
 * Object.keys(NATIVES), which is derived from this object, so it has to stay.
 * The rest follow.
 */
export const BIOMES: Record<BiomeType, BiomeDef> = {
  // -- the wildlife row, in its order --
  grassland: {
    paint: PaintMaterial.Grass,
    burnsThermal: true, burnsByPower: true, soil: true,
    natives: ['sheep', 'rabbit', 'chicken', 'cow', 'pig', 'grasshopper', 'butterfly', 'bee'],
  },
  savanna: {
    paint: PaintMaterial.Savanna,
    burnsThermal: true, burnsByPower: true, soil: true,
    natives: ['buffalo', 'hyena', 'rhino', 'snake', 'ostrich'],
  },
  hills: {
    paint: PaintMaterial.Hills,
    burnsByPower: true, soil: true, rocky: true,
    natives: ['sheep', 'rabbit', 'buffalo', 'goat'],
    ore: [['iron', 6], ['silver', 2], ['gold', 1.2], ['gem', 0.5]],
    terrain: terrain(0.85, 0, 'Never quite flat.'),
  },
  mountains: {
    paint: PaintMaterial.Rock,
    rocky: true,
    natives: ['goat'],
    ore: [['iron', 5], ['silver', 2.5], ['gold', 1.5], ['gem', 1], ['mithril', 0.6], ['adamantine', 0.25]],
    terrain: terrain(0.55, 0, 'Vertical, mostly.'),
  },
  deciduous_forest: {
    paint: PaintMaterial.Forest,
    burnsThermal: true, burnsByPower: true, soil: true, forest: true, spreadsForest: true,
    natives: ['deer', 'rabbit', 'fox', 'pig', 'beetle', 'bee'],
    terrain: terrain(0.9, 0, 'Roots, and a lot of them.'),
  },
  coniferous_forest: {
    paint: PaintMaterial.Forest,
    burnsThermal: true, burnsByPower: true, soil: true, forest: true, spreadsForest: true,
    natives: ['deer', 'wolf', 'bear'],
    terrain: terrain(0.9, 0, 'Needles, silence, and poor footing.'),
  },
  taiga: {
    paint: PaintMaterial.Forest,
    burnsThermal: true, burnsByPower: true, soil: true, forest: true, spreadsForest: true,
    coldGround: true,
    natives: ['wolf', 'bear'],
    ore: [['iron', 2], ['silver', 0.8]],
    terrain: terrain(0.85, 0, 'Cold ground that never fully thaws.'),
  },
  tundra: {
    paint: PaintMaterial.Tundra,
    frostbound: true, coldGround: true, soil: true,
    natives: ['wolf', 'penguin', 'seal', 'polar_bear'],
    ore: [['iron', 2], ['silver', 1.2], ['mithril', 0.5]],
    terrain: terrain(0.9, 0.015, 'Wind with nothing to stop it.', 'exhausted'),
  },
  snow: {
    paint: PaintMaterial.Snow,
    frozen: true, frostbound: true, coldGround: true,
    natives: ['wolf', 'penguin', 'polar_bear', 'yeti'],
    ore: [['silver', 2], ['mithril', 1.4], ['gem', 0.4]],
    terrain: terrain(0.7, 0.03, 'Knee-deep, and getting colder.', 'exhausted'),
  },
  ice: {
    paint: PaintMaterial.Ice,
    frozen: true, frostbound: true, coldGround: true,
    natives: ['penguin'],
    terrain: terrain(0.75, 0.035, 'No grip, and no shelter anywhere.', 'exhausted'),
  },
  glacier: {
    paint: PaintMaterial.Ice,
    frozen: true, frostbound: true, coldGround: true,
    natives: ['penguin'],
    terrain: terrain(0.65, 0.05, 'Nothing has ever lived here.', 'exhausted'),
  },
  rainforest: {
    paint: PaintMaterial.Forest,
    burnsThermal: true, burnsByPower: true, soil: true, forest: true, spreadsForest: true,
    natives: ['monkey', 'bird', 'snake', 'frog'],
    terrain: terrain(0.75, 0, 'You get through it, but not quickly.'),
  },
  tropical_forest: {
    paint: PaintMaterial.Forest,
    burnsThermal: true, burnsByPower: true, soil: true, forest: true, spreadsForest: true,
    natives: ['monkey', 'deer', 'bird'],
    terrain: terrain(0.8, 0, 'Thick underfoot.'),
  },
  swamp: {
    paint: PaintMaterial.Swamp,
    burnsThermal: true, soil: true,
    natives: ['snake', 'frog', 'crocodile'],
    terrain: terrain(0.6, 0, 'Every step comes back up slower than it went down.'),
  },
  marsh: {
    paint: PaintMaterial.Swamp,
    burnsThermal: true, burnsByPower: true, soil: true,
    natives: ['bird', 'frog', 'flamingo'],
    terrain: terrain(0.7, 0, 'Water where you expected ground.'),
  },
  beach: {
    paint: PaintMaterial.Sand,
    sand: true,
    natives: ['crab', 'turtle'],
    terrain: terrain(0.95, 0, 'Sand takes a little of every step.'),
  },
  desert: {
    paint: PaintMaterial.Desert,
    sand: true,
    natives: ['snake', 'camel', 'sand_spider', 'beetle', 'sandworm'],
    ore: [['gold', 2], ['gem', 0.5]],
    terrain: terrain(0.9, 0.035, 'The heat is the whole problem.', 'exhausted'),
  },
  enchanted_forest: {
    paint: PaintMaterial.Enchanted,
    burnsThermal: true, burnsByPower: true, forest: true,
    natives: ['unicorn', 'fairy', 'deer', 'treant'],
    ore: [['crystal', 2], ['mithril', 0.4]],
  },
  corrupted: {
    paint: PaintMaterial.Corrupt,
    natives: ['ghost'],
    terrain: terrain(0.9, 0.045, 'Something is wrong with the ground itself.', 'cursed'),
  },
  candy: {
    paint: PaintMaterial.Candy,
    natives: ['gummy_bear', 'lil_pumpkin', 'fairy', 'candy_man'],
    // The two kind ones: a god who plants candy wants people to enjoy it.
    terrain: terrain(1, 0, 'Sticky underfoot, and absolutely nobody minds.'),
  },
  crystal: {
    paint: PaintMaterial.Crystal,
    natives: ['unicorn'],
    ore: [['crystal', 5], ['gem', 1.5]],
    terrain: terrain(0.95, 0, 'Clear as glass and cold as it, and it hums.'),
  },
  mushroom: {
    paint: PaintMaterial.Mushroom,
    natives: ['frog', 'snake', 'acid_blob'],
    terrain: terrain(0.85, 0, 'Springy, damp, and it squeaks.'),
  },
  infernal: {
    paint: PaintMaterial.Infernal,
    natives: ['demon', 'fire_skull'],
    ore: [['adamantine', 1.5], ['gold', 1]],
    terrain: terrain(0.8, 0.07, 'The ground is on fire, in a manner of speaking and also literally.', undefined, 5),
  },
  wasteland: {
    paint: PaintMaterial.Waste,
    natives: ['rat', 'hyena'],
    terrain: terrain(0.9, 0.03, 'Nothing grows, and the air tastes of metal.', 'exhausted'),
  },

  // -- the rest: no natives --
  deep_ocean: { paint: PaintMaterial.Water },
  ocean: { paint: PaintMaterial.Water },
  shallow_water: {
    paint: PaintMaterial.Water,
    shallowWater: true,
    terrain: terrain(0.5, 0, 'Wading, with the bottom still under you.'),
  },
  river: {
    paint: PaintMaterial.Water,
    shallowWater: true,
    terrain: terrain(0.5, 0, 'The current does not care where you were going.'),
  },
  lake: {
    paint: PaintMaterial.Water,
    shallowWater: true,
    terrain: terrain(0.5, 0, 'Wading, and then swimming.'),
  },
  rocky_shore: {
    paint: PaintMaterial.Rock,
    rocky: true,
    ore: [['iron', 3], ['silver', 1]],
    terrain: terrain(0.8, 0, 'Loose stone, all of it moving.'),
  },
  mesa: {
    paint: PaintMaterial.Strata,
    sand: true, rocky: true,
    ore: [['gold', 3], ['iron', 2], ['gem', 0.8]],
    terrain: terrain(0.85, 0.03, 'Bare rock, and nothing that drinks.', 'exhausted'),
  },
  badlands: {
    paint: PaintMaterial.Strata,
    soil: true, rocky: true,
    ore: [['iron', 3], ['gold', 2], ['gem', 0.6]],
    terrain: terrain(0.85, 0.05, 'Poisoned ground, and it shows.', 'exhausted'),
  },
  ashland: {
    paint: PaintMaterial.Ash,
    soil: true,
    ore: [['iron', 2], ['adamantine', 0.6]],
    terrain: terrain(0.9, 0.02, 'Soft underfoot, and it gets everywhere.', 'exhausted'),
  },
  salt_flat: {
    paint: PaintMaterial.Salt,
    sand: true,
    terrain: terrain(0.95, 0.045, 'Flat, bright, and there is nothing to drink.', 'exhausted'),
  },
  bloom: {
    paint: PaintMaterial.Bloom,
    burnsThermal: true, burnsByPower: true, soil: true,
    // The one row on the table that is *good* to walk through, which is the
    // point of it: a map where every named ground is a penalty teaches the
    // player to avoid every named ground.
    terrain: terrain(1, 0, 'Easy going, and it smells extraordinary.'),
  },
  volcanic: {
    paint: PaintMaterial.Volcanic,
    ore: [['adamantine', 1.2], ['gold', 1.5], ['gem', 1], ['iron', 1]],
    terrain: terrain(0.8, 0.06, 'The rock is still warm, and in places it is not rock.', undefined, 4),
  },
  sky_island: {
    paint: PaintMaterial.Grass,
  },
};

/** The biome types whose def sets the given flag, in BIOMES order. */
export const biomesWhere = (pick: (def: BiomeDef) => boolean | undefined): BiomeType[] =>
  (Object.keys(BIOMES) as BiomeType[]).filter(type => !!pick(BIOMES[type]));

/** A table keyed by biome, holding the picked value for each biome that has one. */
export const biomeTable = <T>(pick: (def: BiomeDef) => T | undefined): Partial<Record<BiomeType, T>> => {
  const table: Partial<Record<BiomeType, T>> = {};
  for (const type of Object.keys(BIOMES) as BiomeType[]) {
    const value = pick(BIOMES[type]);
    if (value !== undefined) table[type] = value;
  }
  return table;
};

/** A complete table keyed by biome, for fields every biome must have. */
export const biomeRecord = <T>(pick: (def: BiomeDef) => T): Record<BiomeType, T> =>
  biomeTable(pick) as Record<BiomeType, T>;
