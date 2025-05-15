import { create } from 'zustand';
import * as THREE from 'three';
// Define types locally to avoid circular imports
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

// Entity types 
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

// Define Tile and Entity interfaces locally
interface Tile {
  x: number;
  y: number;
  height: number;
  scaledHeight: number;
  type: string;
  entities: Entity[];
  walkable?: boolean;
  mesh?: THREE.Mesh;
  [key: string]: any;
}

interface Entity {
  id: string;
  type: EntityType;
  name: string;
  position: { x: number; y: number };
  health: number;
  maxHealth: number;
  age: number;
  maxAge: number;
  attributes: { [key: string]: number };
  needs: { [key: string]: number };
  status: string[];
  inventory: any[];
  mesh?: THREE.Object3D | null;
  [key: string]: any;
}

// Tools available to the player
export type Tool =
  // Selection tool
  | 'select'
  // Terraforming tools
  | 'raise-terrain'
  | 'lower-terrain'
  | 'place-water'
  | 'place-mountain'
  | 'place-forest'
  // Entity tools
  | 'spawn-human'
  | 'spawn-elf'
  | 'spawn-dwarf'
  | 'spawn-orc'
  | 'spawn-animal' // For spawning various animals
  | 'spawn-monster' // For spawning various monsters
  // Environment tools
  | 'plant-trees'
  | 'unearth-minerals'
  | 'summon-rain'
  // Divine powers
  | 'earthquake'
  | 'meteor'
  | 'lightning'
  | 'fire'
  | 'blessing'
  | 'curse'
  | null;

export type Race = 'human' | 'elf' | 'dwarf' | 'orc';

// Main game state
interface GameState {
  // World parameters
  worldSeed: number;
  worldSize: 'small' | 'medium' | 'large' | 'custom';
  customWorldSize: number;
  timeOfDay: TimeOfDay;
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  year: number;
  
  // Game state
  isGamePaused: boolean;
  gameSpeed: number; // 0 = paused, 1 = normal, 2 = fast, 3 = ultra fast
  
  // UI state
  selectedTool: Tool;
  selectedRace: Race | null;
  selectedTile: Tile | null;
  selectedEntity: Entity | null;
  showDebugInfo: boolean;
  entityPopulationDensity: 'low' | 'medium' | 'high';
  
  // Actions
  setSelectedTool: (tool: Tool) => void;
  setSelectedRace: (race: Race | null) => void;
  setWorldSeed: (seed: number) => void;
  setWorldSize: (size: 'small' | 'medium' | 'large' | 'custom') => void;
  setCustomWorldSize: (size: number) => void;
  setTimeOfDay: (time: TimeOfDay) => void;
  toggleDayNight: () => void;
  setSeason: (season: 'spring' | 'summer' | 'autumn' | 'winter') => void;
  advanceSeason: () => void;
  advanceYear: () => void;
  
  setSelectedTile: (tile: Tile | null) => void;
  setSelectedEntity: (entity: Entity | null) => void;
  setEntityPopulationDensity: (density: 'low' | 'medium' | 'high') => void;
  togglePause: () => void;
}

// Extend GameState with reference map properties
interface GameState extends BaseGameState {
  useReferenceMap: boolean;
  referenceMapUrl: string | null;
  setUseReferenceMap: (useReferenceMap: boolean) => void;
  setReferenceMapUrl: (url: string | null) => void;
  regenerateWorld: () => Promise<void>;
}

export const useGameStore = create<GameState>((set) => ({
  // Initial world parameters
  worldSeed: Math.floor(Math.random() * 1000000),
  worldSize: 'medium',
  customWorldSize: 128,
  timeOfDay: 'day',
  season: 'spring',
  year: 1,
  
  // Reference map options
  useReferenceMap: false,
  referenceMapUrl: null,
  
  // Initial game state
  isGamePaused: false,
  gameSpeed: 1,
  
  // Initial UI state
  selectedTool: 'select',
  selectedRace: null,
  selectedTile: null,
  selectedEntity: null,
  showDebugInfo: false,
  entityPopulationDensity: 'medium',
  
  // Actions
  setSelectedTool: (tool: Tool) => set({ selectedTool: tool }),
  setSelectedRace: (race: Race | null) => set({ selectedRace: race }),
  
  setWorldSeed: (seed: number) => {
    console.log('New world seed set:', seed);
    set({ worldSeed: seed, selectedTile: null }); // Reset selection on new world
  },
  
  setWorldSize: (size: 'small' | 'medium' | 'large' | 'custom') => set({ worldSize: size }),

  // Reference map methods
  setUseReferenceMap: (useReferenceMap: boolean) => set({ useReferenceMap }),
  
  setReferenceMapUrl: (url: string | null) => set({ 
    referenceMapUrl: url,
    useReferenceMap: url !== null
  }),
  
  regenerateWorld: async () => {
    console.log('Regenerating world...');
    // This is just a placeholder - the actual regeneration happens in useGameEngine
    // We're setting a dummy value to trigger the useEffect in useGameEngine
    set(state => ({ 
      worldSeed: state.useReferenceMap ? state.worldSeed : Math.floor(Math.random() * 1000000) 
    }));
  },
  setCustomWorldSize: (size: number) => set({ customWorldSize: size }),
  
  setTimeOfDay: (time: TimeOfDay) => set({ timeOfDay: time }),
  toggleDayNight: () => set((state) => ({ 
    timeOfDay: state.timeOfDay === 'day' ? 'night' : 'day' 
  })),
  
  setSeason: (season: 'spring' | 'summer' | 'autumn' | 'winter') => set({ season }),
  advanceSeason: () => set((state) => {
    const seasons = ['spring', 'summer', 'autumn', 'winter'] as const;
    const currentIndex = seasons.indexOf(state.season);
    const nextIndex = (currentIndex + 1) % seasons.length;
    
    // If we complete a full cycle (back to spring), advance the year
    if (nextIndex === 0) {
      return { season: seasons[nextIndex], year: state.year + 1 };
    }
    
    return { season: seasons[nextIndex] };
  }),
  
  advanceYear: () => set((state) => ({ year: state.year + 1 })),
  
  setSelectedTile: (tile: Tile | null) => set({ selectedTile: tile }),
  
  setSelectedEntity: (entity: Entity | null) => set({ selectedEntity: entity }),
  
  setEntityPopulationDensity: (density: 'low' | 'medium' | 'high') => set({ entityPopulationDensity: density }),
  
  togglePause: () => set((state) => ({ 
    isGamePaused: !state.isGamePaused,
    gameSpeed: state.isGamePaused ? 1 : 0
  })),
  
  setGameSpeed: (speed: number) => {
    const validSpeeds = [0, 1, 2, 3];
    if (validSpeeds.includes(speed)) {
      set({ 
        gameSpeed: speed,
        isGamePaused: speed === 0 
      });
    }
  },
  
  toggleDebugInfo: () => set((state) => ({ showDebugInfo: !state.showDebugInfo })),
  
  resetWorld: () => set({
    worldSeed: Math.floor(Math.random() * 1000000),
    selectedTile: null,
    selectedEntity: null,
    isGamePaused: false,
    gameSpeed: 1,
    season: 'spring',
    year: 1,
    timeOfDay: 'day',
  }),
}));
