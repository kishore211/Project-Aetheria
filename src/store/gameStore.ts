import { create } from 'zustand';
import type { Entity, EntityType, Race, Season, Tile, TimeOfDay } from '../types/world';
import type { WorldTemplate } from '../utils/worldGenerator';
import type { SaveGame } from '../utils/saveSystem';
// Type-only both ways: powers.ts imports `Tool` from here. Erased at compile
// time, so there is no runtime cycle.
import type { PowerTabId } from '../utils/powers';
import type { MapLayer } from '../utils/mapLayers';
import type { AgeId } from '../utils/ages';
import { loadUnlocked, persistUnlocked } from '../utils/achievements';
import { loadHotkeys, persistHotkeys } from '../utils/hotkeyBindings';
import { possess } from '../utils/possession';

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
      /** -100..+100, so the tooltip can show a face without a lookup. */
      happiness: number;
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
/**
 * A browsable row for the list windows. Flat and pre-computed because the
 * panel must never reach into the settlement system — it re-renders on a React
 * schedule and the simulation does not.
 */
export interface VillageSummary {
  /** -100..+100, or null before the first political pass. */
  loyalty: number | null;
  /** Seconds until secession, or null when the province is settled. */
  secedesIn: number | null;
  id: string;
  name: string;
  kingdomName: string;
  color: string;
  capital: boolean;
  population: number;
  buildings: number;
  territory: number;
  /** Where to fly the camera. */
  x: number;
  y: number;
}

/** What two neighbouring realms think of each other, with the reasons. */
export interface OpinionRow {
  a: string;
  b: string;
  colorA: string;
  colorB: string;
  /** -100..+100. */
  score: number;
  factors: Array<{ label: string; value: number }>;
  atWar: boolean;
  allied: boolean;
}

/** One identity in the world, for the map-layer key. */
export interface IdentityRow {
  id: string;
  kind: 'culture' | 'language' | 'religion';
  name: string;
  colorHex: string;
  /** How many creatures carry it. */
  holders: number;
}

/** A live scheme, flattened for the register. */
export interface PlotSummary {
  id: string;
  kind: string;
  label: string;
  description: string;
  glyph: string;
  plotterName: string;
  subjectName: string;
  targetName: string | null;
  /** 0-1. */
  share: number;
  /** Simulated seconds since it began. */
  age: number;
  conspirators: number;
  hostile: boolean;
  x: number;
  y: number;
}

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
  /** The world moves through eras that change its rules. */
  ages: boolean;
  /** Unhappy provinces may break away into kingdoms of their own. */
  rebellions: boolean;
  /** Kingdoms send settlers out to found new towns. */
  colonisation: boolean;
  /** Kings may form alliances. */
  diplomacy: boolean;
  /** No town grows past a hundred people. */
  populationCap: boolean;
  /** Small towns attract the odd stranger. */
  migrants: boolean;
  /** Forests slow everyone who walks through them. */
  entanglewood: boolean;
  /** The sea slowly eats soft, low coast. */
  erosion: boolean;
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
  ages: true,
  rebellions: true,
  colonisation: true,
  diplomacy: true,
  populationCap: false,
  migrants: true,
  entanglewood: false,
  erosion: false,
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
  | 'uplift'
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
  | 'poke'
  // Erasers — the inverses of the powers above
  | 'erase-forest'
  | 'erase-life'
  | 'erase-buildings'
  | 'douse'
  // Everything in utils/extraPowers.ts
  | ExtraTool
  | `spawn-${EntityType}`
  | null;

/** The powers implemented in utils/extraPowers.ts. */
export type ExtraTool =
  | 'paint-deep' | 'paint-ocean' | 'paint-shallow' | 'paint-sand' | 'paint-soil' | 'paint-hills' | 'paint-summit'
  | 'sponge' | 'stamp-island' | 'stamp-lake' | 'stamp-atoll'
  | 'seed-desert' | 'seed-savanna' | 'seed-jungle' | 'seed-swamp' | 'seed-tundra' | 'seed-snow'
  | 'seed-enchanted' | 'seed-bloom' | 'seed-grass' | 'seed-corrupt'
  | 'seed-candy' | 'seed-crystal' | 'seed-mushroom' | 'seed-infernal' | 'seed-wasteland'
  | 'rain-cloud' | 'snow-cloud' | 'seed-cloud' | 'heat' | 'cold'
  | 'tornado' | 'volcano' | 'geyser' | 'lava' | 'acid'
  | 'grenade' | 'bomb' | 'napalm' | 'atomic' | 'void-bomb'
  | 'plague' | 'madness' | 'confusion'
  | 'divine-light' | 'shield' | 'coffee' | 'inspire' | 'sleep' | 'clone'
  | 'dust-culture' | 'dust-language' | 'dust-religion' | 'dust-everything'
  | 'diplo-spite' | 'diplo-friendship' | 'diplo-whisper' | 'diplo-unity' | 'diplo-discord' | 'diplo-inspiration'
  | 'gift-strong' | 'gift-swift' | 'gift-tough' | 'gift-genius' | 'gift-immortal' | 'gift-regeneration'
  | 'gift-lucky' | 'gift-giant' | 'gift-tiny' | 'gift-fireproof' | 'gift-bloodthirsty' | 'gift-peaceful'
  | 'trait-eraser' | 'gift-arms' | 'gold-rain' | 'youth' | 'love-potion' | 'swarm' | 'cluster-bomb'
  | 'magnet';

/** Radius in tiles for area tools: 0 = single tile, 1 = 3x3, 2 = 5x5. */
export type BrushRadius = 0 | 1 | 2;

// Main game state
interface GameState {
  // World parameters
  worldSeed: number;
  worldSize: 'small' | 'medium' | 'large' | 'huge' | 'custom';
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
  /** The era the world is in. */
  age: AgeId;
  /** 0-1 through the current era, for the HUD. */
  ageProgress: number;

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
  /**
   * Ten user-bound power slots, keyed 0-9. Null means the digit falls back to
   * picking the nth power of the open tab, which is what it did before.
   */
  hotkeySlots: (Tool | null)[];
  /** Kingdom and village names drawn on the map itself. */
  showMapLabels: boolean;
  /** Which group of powers the bottom bar is showing. */
  activePowerTab: PowerTabId;
  /** Which question the map is painted to answer. */
  mapLayer: MapLayer;
  /**
   * Everything except the canvas is hidden. WorldBox binds this to a single
   * key because the world is the thing worth looking at, and screenshots of a
   * world covered in panels are nobody's screenshots.
   */
  uiHidden: boolean;
  kingdoms: KingdomSummary[];
  villages: VillageSummary[];
  plots: PlotSummary[];
  identities: IdentityRow[];
  opinions: OpinionRow[];
  /** Entity the camera is following (spectate mode). */
  followEntityId: string | null;
  /** Creature the player is controlling directly, if any. */
  possessedId: string | null;
  /** Set by the minimap and chronicle to fly the camera somewhere. */
  cameraTarget: { x: number; y: number; nonce: number } | null;
  /** What the cursor is over right now, for the hover tooltip. */
  hoverTarget: HoverTarget | null;
  /** Keyboard zoom, consumed by the engine's camera pass. */
  zoomRequest: { direction: number; nonce: number } | null;
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
  setWorldSize: (size: 'small' | 'medium' | 'large' | 'huge' | 'custom') => void;
  setCustomWorldSize: (size: number) => void;
  setWorldTemplate: (template: WorldTemplate) => void;
  setTimeOfDay: (time: TimeOfDay) => void;
  toggleDayNight: () => void;
  setSeason: (season: Season) => void;
  advanceSeason: () => void;
  advanceYear: () => void;
  advanceDay: () => void;
  setWeather: (weather: Weather) => void;
  setAge: (age: AgeId) => void;
  setAgeProgress: (progress: number) => void;
  setPopulation: (population: number) => void;
  addEvent: (message: string, kind?: GameEvent['kind'], position?: { x: number; y: number }) => void;
  setShowHelp: (show: boolean) => void;
  setShowLaws: (show: boolean) => void;
  toggleMinimap: () => void;
  toggleUnitIcons: () => void;
  /** Bind the current tool to a slot, or clear it if it is already there. */
  bindHotkey: (slot: number, tool: Tool | null) => void;
  toggleMapLabels: () => void;
  setActivePowerTab: (tab: PowerTabId) => void;
  setMapLayer: (layer: MapLayer) => void;
  toggleUiHidden: () => void;
  /** direction > 0 pulls the camera out, < 0 pushes it in. */
  requestZoom: (direction: number) => void;
  toggleWorldLaw: (law: keyof WorldLaws) => void;
  /** Apply a whole set at once, for the law presets. */
  setWorldLaws: (laws: WorldLaws) => void;
  setKingdoms: (kingdoms: KingdomSummary[]) => void;
  setVillages: (villages: VillageSummary[]) => void;
  setPlots: (plots: PlotSummary[]) => void;
  setIdentities: (identities: IdentityRow[]) => void;
  setOpinions: (opinions: OpinionRow[]) => void;
  setFollowEntity: (id: string | null) => void;
  setPossessed: (id: string | null) => void;
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
    worldSize: 'small' | 'medium' | 'large' | 'huge' | 'custom';
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
  age: 'hope',
  ageProgress: 0,

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
  hotkeySlots: loadHotkeys(),
  showMapLabels: true,
  activePowerTab: 'shape',
  mapLayer: 'natural',
  uiHidden: false,
  kingdoms: [],
  villages: [],
  plots: [],
  identities: [],
  opinions: [],
  followEntityId: null,
  possessedId: null,
  cameraTarget: null,
  hoverTarget: null,
  zoomRequest: null,
  worldRevision: 0,
  pendingSave: null,
  achievements: loadUnlocked(),
  latestAchievement: null,

  // Actions
  setSelectedTool: (tool: Tool) => set({ selectedTool: tool }),
  setBrushRadius: (brushRadius: BrushRadius) => set({ brushRadius }),
  setSelectedRace: (race: Race | null) => set({ selectedRace: race }),

  setWorldSeed: (seed: number) => set({ worldSeed: seed, selectedTile: null, selectedEntity: null }),

  setWorldSize: (size: 'small' | 'medium' | 'large' | 'huge' | 'custom') => set({ worldSize: size }),
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

  setAge: (age: AgeId) => set({ age }),
  setAgeProgress: (ageProgress: number) => set({ ageProgress }),

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
  bindHotkey: (slot, tool) => set((state) => {
    if (slot < 0 || slot >= state.hotkeySlots.length) return {};
    const slots = [...state.hotkeySlots];
    // Binding the tool that is already there clears it, so one gesture both
    // sets and unsets and there is no second key to learn.
    slots[slot] = slots[slot] === tool ? null : tool;
    persistHotkeys(slots);
    return { hotkeySlots: slots };
  }),
  toggleMapLabels: () => set((state) => ({ showMapLabels: !state.showMapLabels })),
  setActivePowerTab: (activePowerTab: PowerTabId) => set({ activePowerTab }),
  setMapLayer: (mapLayer: MapLayer) => set({ mapLayer }),
  toggleUiHidden: () => set((state) => ({ uiHidden: !state.uiHidden })),
  requestZoom: (direction: number) =>
    set((state) => ({
      zoomRequest: { direction, nonce: (state.zoomRequest?.nonce ?? 0) + 1 },
    })),

  toggleWorldLaw: (law) => set((state) => ({
    worldLaws: { ...state.worldLaws, [law]: !state.worldLaws[law] },
  })),

  setWorldLaws: (worldLaws: WorldLaws) => set({ worldLaws: { ...worldLaws } }),

  setKingdoms: (kingdoms: KingdomSummary[]) => set({ kingdoms }),
  setVillages: (villages: VillageSummary[]) => set({ villages }),
  setPlots: (plots: PlotSummary[]) => set({ plots }),
  setIdentities: (identities: IdentityRow[]) => set({ identities }),
  setOpinions: (opinions: OpinionRow[]) => set({ opinions }),

  setFollowEntity: (followEntityId: string | null) => set({ followEntityId }),
  setPossessed: (possessedId: string | null) => {
    possess(possessedId);
    // Wearing a creature means riding along with it; letting go leaves the
    // camera where it is rather than snapping off somewhere.
    set(possessedId ? { possessedId, followEntityId: possessedId } : { possessedId: null, followEntityId: null });
  },

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
    // Merged over the defaults: a save from before a law existed has no
    // opinion about it, and reading that as "off" would switch it off.
    worldLaws: { ...DEFAULT_WORLD_LAWS, ...save.world.laws },
    pendingSave: save,
    worldRevision: state.worldRevision + 1,
    selectedTile: null,
    selectedEntity: null,
    followEntityId: null,
    events: [],
    kingdoms: [],
    villages: [],
    plots: [],
    identities: [],
    opinions: [],
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
    villages: [],
    plots: [],
    identities: [],
    opinions: [],
    timeOfDay: 'day',
    age: 'hope',
    ageProgress: 0,
  }),

  applyLoadedWorld: (loaded) => set({
    ...loaded,
    selectedTile: null,
    selectedEntity: null,
    followEntityId: null,
    events: [],
    kingdoms: [],
    villages: [],
    plots: [],
    identities: [],
    opinions: [],
  }),
}));
