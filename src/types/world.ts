import * as THREE from 'three';

// World constants
export const MAP_SIZES = {
  small: 64,
  medium: 128,
  large: 256,
};

export const TILE_SIZE = 0.5;
export const MIN_TILE_HEIGHT = 0.05;

/**
 * Visual relief of the map.
 *
 * This was 0.6 on a 0.5-unit tile, which made an ordinary field 0.44 units tall
 * — very nearly a cube. That is the whole of the "when you zoom in it looks
 * like square boxes" problem: a grid of cubes is a voxel diorama, and WorldBox
 * is a flat map.
 *
 * Applied through a power curve rather than linearly (see RELIEF_CURVE), so
 * plains are properly flat while mountains still rise. A uniform reduction
 * would have flattened the mountains too and lost the one place relief earns
 * its keep.
 *
 * The raw `height` field (0-1) is untouched and drives all simulation.
 */
export const BASE_TILE_SCALED_HEIGHT_MULTIPLIER = 0.55;
/**
 * Exponent on height before it becomes relief. Above 1 this pushes low ground
 * flat and leaves high ground tall.
 */
export const RELIEF_CURVE = 1.9;
/** Land sits on a small plinth above the sea so coastlines read clearly. */
export const LAND_BASE_HEIGHT = 0.05;
/** Water is nearly flat and slightly sunken. */
export const WATER_DEPTH_SCALE = 0.18;

/** Every biome that counts as water for movement, drinking and rendering. */
export const WATER_BIOMES = [
  'deep_ocean',
  'ocean',
  'shallow_water',
  'river',
  'lake',
] as const;

/** Water an entity can stand in and drink from (not open sea). */
export const DRINKABLE_BIOMES = ['shallow_water', 'river', 'lake'] as const;

// Time definitions
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

// Biome types
export type BiomeType = 
  // Water biomes
  | 'deep_ocean' 
  | 'ocean' 
  | 'shallow_water' 
  | 'river' 
  | 'lake'
  // Beach biomes
  | 'beach' 
  | 'rocky_shore'
  // Temperate biomes
  | 'grassland' 
  | 'deciduous_forest' 
  | 'coniferous_forest' 
  | 'hills' 
  | 'mountains'
  // Cold biomes
  | 'taiga' 
  | 'tundra' 
  | 'snow' 
  | 'ice' 
  | 'glacier'
  // Dry biomes
  | 'desert' 
  | 'savanna' 
  | 'mesa' 
  | 'badlands'
  // Wet biomes
  | 'swamp' 
  | 'marsh' 
  | 'rainforest' 
  | 'tropical_forest'
  // Biomes the world makes rather than generates. Every one of these exists
  // because a system produces it: fire strips ground to ash, enough heat boils
  // a lake to salt, a blessing-cloud leaves a bloom behind. A biome with no
  // provenance is a colour on a palette; a biome you can point at and say what
  // happened is a story the map is telling.
  | 'ashland'
  | 'salt_flat'
  | 'bloom'
  // Special biomes
  | 'volcanic' 
  | 'corrupted' 
  | 'enchanted_forest'
  | 'sky_island';

/** True for oceans, lakes and rivers. */
export const isWaterBiome = (type: BiomeType): boolean =>
  (WATER_BIOMES as readonly string[]).includes(type);

/** True for water a creature can wade into and drink from. */
export const isDrinkableBiome = (type: BiomeType): boolean =>
  (DRINKABLE_BIOMES as readonly string[]).includes(type);

/**
 * Visual (rendered) height of a tile. Water is sunken and almost flat, land
 * rests on a low plinth so shorelines are legible from a top-down camera.
 */
export const computeScaledHeight = (height: number, type: BiomeType): number => {
  if (isWaterBiome(type)) return MIN_TILE_HEIGHT + height * WATER_DEPTH_SCALE;
  const relief = Math.pow(Math.max(0, height), RELIEF_CURVE);
  return MIN_TILE_HEIGHT + LAND_BASE_HEIGHT + relief * BASE_TILE_SCALED_HEIGHT_MULTIPLIER;
};

// Resource types
export type ResourceType = 
  // Basic resources
  | 'wood' 
  | 'stone' 
  | 'food' 
  | 'water'
  // Minerals
  | 'iron' 
  | 'gold' 
  | 'silver' 
  | 'coal' 
  | 'crystal' 
  | 'gem'
  // Special resources
  | 'mana' 
  | 'ancient_artifact';

export interface Resource {
  type: ResourceType;
  quantity: number;
  discovered: boolean;
}

// Structure types
export type StructureType = 
  // Natural structures
  | 'sapling' 
  | 'young_tree' 
  | 'mature_tree' 
  | 'ancient_tree' 
  | 'rock_outcrop' 
  | 'bush' 
  | 'boulder'
  // Civilization structures (basic)
  | 'hut' 
  | 'house' 
  | 'farm' 
  | 'mine' 
  | 'tower' 
  | 'wall' 
  | 'workshop'
  // Special structures
  | 'ruins' 
  | 'shrine' 
  | 'portal';

export interface Structure {
  type: StructureType;
  level?: number;
  health: number;
  owner?: string; // ID of the civilization or entity that owns this
}

// Entity types (living beings in the world)
export type EntityType = 
  // Sentient races
  | 'human' 
  | 'elf' 
  | 'dwarf' 
  | 'orc'
  // Animals
  | 'wolf' 
  | 'bear' 
  | 'deer' 
  | 'rabbit' 
  | 'bird' 
  | 'fish'
  | 'sheep'
  | 'chicken'
  | 'fox'
  | 'snake'
  // Monsters
  | 'dragon' 
  | 'demon' 
  | 'zombie' 
  | 'skeleton' 
  | 'elemental' 
  | 'bandit';

/** Heritable unit traits. Rolled at spawn, passed to children. */
export type TraitId =
  | 'swift'
  | 'strong'
  | 'tough'
  | 'genius'
  | 'longevity'
  | 'fertile'
  | 'immortal'
  | 'regeneration'
  | 'pyromaniac'
  | 'coward'
  | 'bloodthirsty';

// Race types for civilizations
export type Race = 'human' | 'elf' | 'dwarf' | 'orc';

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  age: number;
  maxAge: number;
  health: number;
  maxHealth: number;
  position: {
    x: number;
    y: number;
  };
  lastPosition?: {
    x: number;
    y: number;
  };
  attributes: {
    strength: number;
    intelligence: number;
    speed: number;
    resilience: number;
    [key: string]: number;
  };
  needs: {
    hunger: number;
    thirst: number;
    rest: number;
    social: number;
    [key: string]: number;
  };
  inventory: Resource[];
  faction?: string;
  status: string[];
  mesh?: THREE.Object3D | null;
  // Animation state for sprite-based entities
  animationFrame?: number;
  currentAnimation?: string;

  // Civilization membership (sentient races only)
  /** Kingdom this unit belongs to. */
  kingdomId?: string | null;
  /** Village this unit calls home. */
  villageId?: string | null;
  /** Herd or pack this animal travels with. */
  herdId?: string | null;
  /** What the unit is hauling back to its village store. */
  carrying?: { type: ResourceType; quantity: number } | null;
  /** Assigned village role. */
  job?: 'gatherer' | 'builder' | 'warrior' | null;
  /**
   * What the creature is doing right now, mirrored out of its AI so the HUD,
   * the icon layer and tooltips can all read it without reaching into the AI.
   */
  activity?: string;
  /**
   * Mood, -100..+100. Chases a baseline derived from needs, health and
   * belonging; pushed by statuses and one-off events. See utils/mood.ts.
   */
  happiness?: number;
  /**
   * 0-1 position in the walk cycle. Advanced by distance travelled rather than
   * by wall time, so a creature's feet match the ground at any game speed.
   */
  walkPhase?: number;
  /**
   * Seconds of white flash left. Set when a status is gained; counted down by
   * the render pass. See utils/statusEffects.ts.
   */
  flashFor?: number;
  /** -1 or 1: which way the sprite is mirrored. */
  facing?: number;
  /**
   * Woken into a person, or born one.
   *
   * The uplifted keep their own body and gain everyone else's inner life —
   * they talk, make friends, fall in love and grieve. One flag, and the whole
   * bestiary doubles. See the `uplift` power.
   */
  uplifted?: boolean;
  /**
   * How big this individual is, in world units. Rolled at birth from its kind
   * and its traits and then carried — see `size.ts`. A creature that changes
   * size between frames is a rendering fault.
   */
  size?: number;
  /**
   * Which colour ramp this creature was born with. See `subspecies.ts`.
   *
   * A plain id rather than the ramp itself, so a save carries four bytes and
   * the palette stays the one place that decides what those colours are.
   */
  subspecies?: string | null;
  /** Closest companion, if it has found one. */
  friendId?: string | null;
  /** Partner. Reproduction goes through this when the world has pairs in it. */
  loverId?: string | null;

  // Identity. All three spread by the same pot mechanic; see utils/identity.ts.
  /**
   * Money, in three fields rather than one.
   *
   * `loot` is what a creature has earned and not yet been taxed on; `coins` is
   * what it may actually spend. Separating them means every wage visibly
   * passes through a lord's hands, which is the whole reason WorldBox's economy
   * reads as a class system rather than a resource counter
   * (09-WORLDBOX-VISUAL-RESEARCH.md §7).
   */
  loot?: number;
  coins?: number;

  cultureId?: string | null;
  languageId?: string | null;
  religionId?: string | null;

  // Progression
  /** Heritable traits. */
  traits?: TraitId[];
  /** Confirmed kills, shown in the inspector. */
  kills?: number;
}

// Weather and environmental effects
export type WeatherType = 
  | 'clear' 
  | 'cloudy' 
  | 'rain' 
  | 'heavy_rain' 
  | 'thunderstorm' 
  | 'snow' 
  | 'blizzard' 
  | 'fog' 
  | 'heatwave' 
  | 'sandstorm';

// Main tile definition
export interface Tile {
  // Position
  x: number;
  y: number;
  
  // Physical properties
  height: number; // Raw height value (0-1)
  scaledHeight: number; // Visual display height
  moisture: number; // 0-1 value
  temperature: number; // 0-1 value
  fertility: number; // 0-1 value
  type: BiomeType;
  
  // Content
  population: number;
  resources: Resource[];
  structure: Structure | null;
  entities: Entity[];
  
  // Environmental effects
  isOnFire: boolean;
  fireIntensity?: number; // 0-1
  fireFuel?: number; // How long it can burn
  rainfall?: number; // Current rainfall amount
  snowCover?: number; // Snow depth
  
  // Rendering
  /** Index into the terrain InstancedMesh (x * mapSize + y). */
  instanceId?: number;
  color?: THREE.Color;
  /** Deterministic 0-1 shade jitter so large biomes are not flat. */
  variant?: number;

  // Civilization
  /** Id of the kingdom claiming this tile, if any. */
  ownerId?: string | null;
  /** Id of the village whose buildings occupy this tile, if any. */
  villageId?: string | null;
  /**
   * A village has laid a path across this tile. Purely visual and purely
   * additive — it does not change the biome, so a road through a forest is
   * still forest underneath and comes back if the village goes.
   */
  road?: boolean;
  /**
   * Absolute temperature on the thermal scale, where 0 is temperate.
   *
   * Left undefined whenever the tile sits at whatever its climate says, which
   * is almost always — see `thermal.ts`. Deliberately not saved: heat is a
   * transient the world regenerates, and a save that restored it would restore
   * a fire's aftermath without the fire.
   */
  heat?: number;
  /**
   * Which material shade this tile wears, 0-1. A *smooth* field, unlike
   * `variant` — see the note where it is generated.
   */
  shade?: number;
  
  // For pathfinding. `searchStamp` marks which A* run last touched these
  // scratch fields, so a search never has to clear the whole grid first.
  walkable?: boolean;
  searchStamp?: number;
  closed?: boolean;
  fCost?: number;
  gCost?: number;
  hCost?: number;
  parent?: Tile;
}
