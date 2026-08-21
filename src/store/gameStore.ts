import { create } from 'zustand';
import type { Entity, Race, Season, Tile, TimeOfDay } from '../types/world';

export type Weather = 'clear' | 'rain' | 'storm';

export interface GameEvent {
  id: number;
  message: string;
  kind: 'info' | 'life' | 'death' | 'disaster' | 'divine';
  time: number;
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

// Main game state
interface GameState {
  // World parameters
  worldSeed: number;
  worldSize: 'small' | 'medium' | 'large' | 'custom';
  customWorldSize: number;
  timeOfDay: TimeOfDay;
  season: Season;
  year: number;
  day: number;
  weather: Weather;
  
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
  population: number;
  events: GameEvent[];
  showHelp: boolean;
  
  // Actions
  setSelectedTool: (tool: Tool) => void;
  setSelectedRace: (race: Race | null) => void;
  setWorldSeed: (seed: number) => void;
  setWorldSize: (size: 'small' | 'medium' | 'large' | 'custom') => void;
  setCustomWorldSize: (size: number) => void;
  setTimeOfDay: (time: TimeOfDay) => void;
  toggleDayNight: () => void;
  setSeason: (season: Season) => void;
  advanceSeason: () => void;
  advanceYear: () => void;
  advanceDay: () => void;
  setWeather: (weather: Weather) => void;
  setPopulation: (population: number) => void;
  addEvent: (message: string, kind?: GameEvent['kind']) => void;
  setShowHelp: (show: boolean) => void;
  
  setSelectedTile: (tile: Tile | null) => void;
  setSelectedEntity: (entity: Entity | null) => void;
  setEntityPopulationDensity: (density: 'low' | 'medium' | 'high') => void;
  togglePause: () => void;
  setGameSpeed: (speed: number) => void;
  toggleDebugInfo: () => void;
  resetWorld: () => void;
}

let nextEventId = 1;

export const useGameStore = create<GameState>((set) => ({
  // Initial world parameters
  worldSeed: Math.floor(Math.random() * 1000000),
  worldSize: 'medium',
  customWorldSize: 128,
  timeOfDay: 'day',
  season: 'spring',
  year: 1,
  day: 1,
  weather: 'clear',
  
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
  population: 0,
  events: [],
  showHelp: true,
  
  // Actions
  setSelectedTool: (tool: Tool) => set({ selectedTool: tool }),
  setSelectedRace: (race: Race | null) => set({ selectedRace: race }),
  
  setWorldSeed: (seed: number) => {
    console.log('New world seed set:', seed);
    set({ worldSeed: seed, selectedTile: null }); // Reset selection on new world
  },
  
  setWorldSize: (size: 'small' | 'medium' | 'large' | 'custom') => set({ worldSize: size }),
  setCustomWorldSize: (size: number) => set({ customWorldSize: size }),
  
  setTimeOfDay: (time: TimeOfDay) => set({ timeOfDay: time }),
  toggleDayNight: () => set((state) => ({ 
    timeOfDay: state.timeOfDay === 'day' ? 'night' : 'day' 
  })),
  
  setSeason: (season: Season) => set({ season }),
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

  advanceDay: () => set((state) => {
    const nextDay = state.day + 1;
    if (nextDay > 4) {
      const seasons = ['spring', 'summer', 'autumn', 'winter'] as const;
      const nextSeasonIndex = (seasons.indexOf(state.season) + 1) % seasons.length;
      return {
        day: 1,
        season: seasons[nextSeasonIndex],
        year: nextSeasonIndex === 0 ? state.year + 1 : state.year,
      };
    }
    return { day: nextDay };
  }),

  setWeather: (weather: Weather) => set({ weather }),

  setPopulation: (population: number) => set({ population }),

  addEvent: (message: string, kind: GameEvent['kind'] = 'info') => set((state) => ({
    events: [
      { id: nextEventId++, message, kind, time: Date.now() },
      ...state.events,
    ].slice(0, 50),
  })),

  setShowHelp: (show: boolean) => set({ showHelp: show }),
  
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
    day: 1,
    weather: 'clear',
    events: [],
    timeOfDay: 'day',
  }),
}));
