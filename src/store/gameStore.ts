import { create } from 'zustand';
import type { Entity, Race, Season, Tile, TimeOfDay } from '../types/world';
import type { WorldTemplate } from '../utils/worldGenerator';
import type { SaveGame } from '../utils/saveSystem';
import { loadUnlocked, persistUnlocked } from '../utils/achievements';

export type Weather = 'clear' | 'rain' | 'storm';

export interface GameEvent {
  id: number;
  message: string;
  kind: 'info' | 'life' | 'death' | 'disaster' | 'divine' | 'kingdom' | 'war';
  time: number;
  /** Where it happened — clicking the entry flies the camera here. */
  position?: { x: number; y: number };
}

/**
 * What the cursor is currently over. Published by the engine so the tooltip can
 * render it without the rest of the HUD re-rendering: WorldBox lets you read the
 * world by hovering, and clicking to find anything out is most of what makes an
 * interface feel heavy.
 */
export type HoverTarget =
  | {
      kind: 'unit';
      id: string;
      name: string;
      species: string;
      activity: string;
      office: string | null;
      health: number;
      maxHealth: number;
      traits: string[];
      village: string | null;
      kingdom: string | null;
      kingdomColor: string | null;
      herd: number | null;
    }
  | {
      kind: 'tile';
      x: number;
      y: number;
      biome: string;
      elevation: number;
      fertility: number;
      resources: Array<{ type: string; quantity: number }>;
      village: string | null;
      kingdom: string | null;
      kingdomColor: string | null;
      onFire: boolean;
      occupants: number;
    };

/** Summary of a kingdom, published by the settlement system for the HUD. */
export interface KingdomSummary {
  id: string;
  name: string;
  race: Race;
  color: string;
  population: number;
  villages: number;
  territory: number;
  atWarWith: string[];
}

/** Global simulation switches, the sandbox "world laws" panel. */
export interface WorldLaws {
  aging: boolean;
  hunger: boolean;
  reproduction: boolean;
  disasters: boolean;
  fireSpread: boolean;
  biomeGrowth: boolean;
  settlements: boolean;
  warfare: boolean;
}

export const DEFAULT_WORLD_LAWS: WorldLaws = {
  aging: true,
  hunger: true,
  reproduction: true,
  disasters: true,
  fireSpread: true,
  biomeGrowth: true,
  settlements: true,
  warfare: true,
};

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
  | 'spawn-animal'
  | 'spawn-monster'
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

/** Radius in tiles for area tools: 0 = single tile, 1 = 3x3, 2 = 5x5. */
export type BrushRadius = 0 | 1 | 2;

// Main game state
interface GameState {
  // World parameters
  worldSeed: number;
  worldSize: 'small' | 'medium' | 'large' | 'custom';
  customWorldSize: number;
  worldTemplate: WorldTemplate;
  timeOfDay: TimeOfDay;
  season: Season;
  year: number;
  day: number;
  weather: Weather;

  // Game state
  isGamePaused: boolean;
  gameSpeed: number; // 0 = paused, 1 = normal, 2 = fast, 3 = ultra fast
  worldLaws: WorldLaws;

  // UI state
  selectedTool: Tool;
  brushRadius: BrushRadius;
  selectedRace: Race | null;
  selectedTile: Tile | null;
  selectedEntity: Entity | null;
  showDebugInfo: boolean;
  entityPopulationDensity: 'low' | 'medium' | 'high';
  population: number;
  events: GameEvent[];
  showHelp: boolean;
  showLaws: boolean;
  showMinimap: boolean;
  /** Icons above creatures showing profession and current activity. */
  showUnitIcons: boolean;
  /** Kingdom and village names drawn on the map itself. */
  showMapLabels: boolean;
  kingdoms: KingdomSummary[];
  /** Entity the camera is following (spectate mode). */
  followEntityId: string | null;
  /** Set by the minimap and chronicle to fly the camera somewhere. */
  cameraTarget: { x: number; y: number; nonce: number } | null;
  /** What the cursor is over right now, for the hover tooltip. */
  hoverTarget: HoverTarget | null;
  /** Bumped to force a world rebuild without changing the seed. */
  worldRevision: number;
  /** A save waiting to be applied by the engine on the next world build. */
  pendingSave: SaveGame | null;
  /** Ids of unlocked achievements, persisted across sessions. */
  achievements: string[];
  /** The most recent unlock, so the HUD can pop a toast for it. */
  latestAchievement: { id: string; nonce: number } | null;

  // Actions
  setSelectedTool: (tool: Tool) => void;
  setBrushRadius: (radius: BrushRadius) => void;
  setSelectedRace: (race: Race | null) => void;
  setWorldSeed: (seed: number) => void;
  setWorldSize: (size: 'small' | 'medium' | 'large' | 'custom') => void;
  setCustomWorldSize: (size: number) => void;
  setWorldTemplate: (template: WorldTemplate) => void;
  setTimeOfDay: (time: TimeOfDay) => void;
  toggleDayNight: () => void;
  setSeason: (season: Season) => void;
  advanceSeason: () => void;
  advanceYear: () => void;
  advanceDay: () => void;
  setWeather: (weather: Weather) => void;
  setPopulation: (population: number) => void;
  addEvent: (message: string, kind?: GameEvent['kind'], position?: { x: number; y: number }) => void;
  setShowHelp: (show: boolean) => void;
  setShowLaws: (show: boolean) => void;
  toggleMinimap: () => void;
  toggleUnitIcons: () => void;
  toggleMapLabels: () => void;
  toggleWorldLaw: (law: keyof WorldLaws) => void;
  setKingdoms: (kingdoms: KingdomSummary[]) => void;
  setFollowEntity: (id: string | null) => void;
  focusTile: (x: number, y: number) => void;
  setHoverTarget: (target: HoverTarget | null) => void;
  bumpWorldRevision: () => void;
  /** Load a save: sets world parameters and queues the snapshot. */
  requestLoad: (save: SaveGame) => void;
  clearPendingSave: () => void;
  unlockAchievement: (id: string) => void;
  dismissAchievementToast: () => void;

  setSelectedTile: (tile: Tile | null) => void;
  setSelectedEntity: (entity: Entity | null) => void;
  setEntityPopulationDensity: (density: 'low' | 'medium' | 'high') => void;
  togglePause: () => void;
  setGameSpeed: (speed: number) => void;
  toggleDebugInfo: () => void;
  resetWorld: () => void;
  /** Apply a loaded save's world metadata in one shot. */
  applyLoadedWorld: (state: {
    worldSeed: number;
    worldSize: 'small' | 'medium' | 'large' | 'custom';
    customWorldSize: number;
    worldTemplate: WorldTemplate;
    timeOfDay: TimeOfDay;
    season: Season;
    year: number;
    day: number;
    weather: Weather;
    worldLaws: WorldLaws;
  }) => void;
}

let nextEventId = 1;
let nextCameraNonce = 1;

/** Phones have no room for a minimap next to the chronicle. */
const wantsMinimap = typeof window === 'undefined' ? true : window.innerWidth >= 700;

export const useGameStore = create<GameState>((set) => ({
  // Initial world parameters
  worldSeed: Math.floor(Math.random() * 1000000),
  worldSize: 'medium',
  customWorldSize: 128,
  worldTemplate: 'continents',
  timeOfDay: 'day',
  season: 'spring',
  year: 1,
  day: 1,
  weather: 'clear',

  // Initial game state
  isGamePaused: false,
  gameSpeed: 1,
  worldLaws: { ...DEFAULT_WORLD_LAWS },

  // Initial UI state
  selectedTool: 'select',
  brushRadius: 0,
  selectedRace: null,
  selectedTile: null,
  selectedEntity: null,
  showDebugInfo: false,
  entityPopulationDensity: 'medium',
  population: 0,
  events: [],
  showHelp: true,
  showLaws: false,
  showMinimap: wantsMinimap,
  showUnitIcons: true,
  showMapLabels: true,
  kingdoms: [],
  followEntityId: null,
  cameraTarget: null,
  hoverTarget: null,
  worldRevision: 0,
  pendingSave: null,
  achievements: loadUnlocked(),
  latestAchievement: null,

  // Actions
  setSelectedTool: (tool: Tool) => set({ selectedTool: tool }),
  setBrushRadius: (brushRadius: BrushRadius) => set({ brushRadius }),
  setSelectedRace: (race: Race | null) => set({ selectedRace: race }),

  setWorldSeed: (seed: number) => set({ worldSeed: seed, selectedTile: null, selectedEntity: null }),

  setWorldSize: (size: 'small' | 'medium' | 'large' | 'custom') => set({ worldSize: size }),
  setCustomWorldSize: (size: number) => set({ customWorldSize: size }),
  setWorldTemplate: (worldTemplate: WorldTemplate) => set({ worldTemplate }),

  setTimeOfDay: (time: TimeOfDay) => set({ timeOfDay: time }),
  toggleDayNight: () => set((state) => ({
    timeOfDay: state.timeOfDay === 'day' ? 'night' : 'day',
  })),

  setSeason: (season: Season) => set({ season }),
  advanceSeason: () => set((state) => {
    const seasons = ['spring', 'summer', 'autumn', 'winter'] as const;
    const nextIndex = (seasons.indexOf(state.season) + 1) % seasons.length;
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

  addEvent: (message, kind = 'info', position) => set((state) => ({
    events: [
      { id: nextEventId++, message, kind, time: Date.now(), position },
      ...state.events,
    ].slice(0, 80),
  })),

  setShowHelp: (show: boolean) => set({ showHelp: show }),
  setShowLaws: (show: boolean) => set({ showLaws: show }),
  toggleMinimap: () => set((state) => ({ showMinimap: !state.showMinimap })),
  toggleUnitIcons: () => set((state) => ({ showUnitIcons: !state.showUnitIcons })),
  toggleMapLabels: () => set((state) => ({ showMapLabels: !state.showMapLabels })),

  toggleWorldLaw: (law) => set((state) => ({
    worldLaws: { ...state.worldLaws, [law]: !state.worldLaws[law] },
  })),

  setKingdoms: (kingdoms: KingdomSummary[]) => set({ kingdoms }),

  setFollowEntity: (followEntityId: string | null) => set({ followEntityId }),

  focusTile: (x: number, y: number) => set({
    cameraTarget: { x, y, nonce: nextCameraNonce++ },
  }),

  setHoverTarget: (hoverTarget: HoverTarget | null) => set({ hoverTarget }),

  bumpWorldRevision: () => set((state) => ({ worldRevision: state.worldRevision + 1 })),

  requestLoad: (save: SaveGame) => set((state) => ({
    worldSeed: save.world.seed,
    worldSize: save.world.size,
    customWorldSize: save.world.customSize,
    worldTemplate: save.world.template,
    timeOfDay: save.world.timeOfDay,
    season: save.world.season,
    year: save.world.year,
    day: save.world.day,
    weather: save.world.weather,
    worldLaws: save.world.laws,
    pendingSave: save,
    worldRevision: state.worldRevision + 1,
    selectedTile: null,
    selectedEntity: null,
    followEntityId: null,
    events: [],
    kingdoms: [],
  })),

  clearPendingSave: () => set({ pendingSave: null }),

  unlockAchievement: (id: string) => set((state) => {
    if (state.achievements.includes(id)) return {};
    const achievements = [...state.achievements, id];
    persistUnlocked(achievements);
    return { achievements, latestAchievement: { id, nonce: nextCameraNonce++ } };
  }),

  dismissAchievementToast: () => set({ latestAchievement: null }),

  setSelectedTile: (tile: Tile | null) => set({ selectedTile: tile }),

  setSelectedEntity: (entity: Entity | null) => set({ selectedEntity: entity }),

  setEntityPopulationDensity: (density: 'low' | 'medium' | 'high') => set({ entityPopulationDensity: density }),

  togglePause: () => set((state) => ({
    isGamePaused: !state.isGamePaused,
    gameSpeed: state.isGamePaused ? 1 : 0,
  })),

  setGameSpeed: (speed: number) => {
    if ([0, 1, 2, 3].includes(speed)) {
      set({ gameSpeed: speed, isGamePaused: speed === 0 });
    }
  },

  toggleDebugInfo: () => set((state) => ({ showDebugInfo: !state.showDebugInfo })),

  resetWorld: () => set({
    worldSeed: Math.floor(Math.random() * 1000000),
    selectedTile: null,
    selectedEntity: null,
    followEntityId: null,
    isGamePaused: false,
    gameSpeed: 1,
    season: 'spring',
    year: 1,
    day: 1,
    weather: 'clear',
    events: [],
    kingdoms: [],
    timeOfDay: 'day',
  }),

  applyLoadedWorld: (loaded) => set({
    ...loaded,
    selectedTile: null,
    selectedEntity: null,
    followEntityId: null,
    events: [],
    kingdoms: [],
  }),
}));
