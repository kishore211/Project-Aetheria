import * as THREE from 'three';

// World constants
export const MAP_SIZES = {
  small: 64,
  medium: 128,
  large: 256,
};

export const TILE_SIZE = 0.5;
export const MIN_TILE_HEIGHT = 0.05;
export const BASE_TILE_SCALED_HEIGHT_MULTIPLIER = 2.0;

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
  // Special biomes
  | 'volcanic' 
  | 'corrupted' 
  | 'enchanted_forest'
  | 'sky_island';

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
  // Monsters
  | 'dragon' 
  | 'demon' 
  | 'zombie' 
  | 'skeleton' 
  | 'elemental' 
  | 'bandit';

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
  
  // Visual elements
  mesh?: THREE.Mesh;
  color?: THREE.Color;
  dynamicEntities?: THREE.Object3D[]; // Visual meshes
  
  // For pathfinding
  walkable?: boolean;
  fCost?: number;
  gCost?: number;
  hCost?: number;
  parent?: Tile;
}
