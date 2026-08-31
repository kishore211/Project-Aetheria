// Save and load.
//
// Terrain is deterministic from (seed, size, template), so a save only needs to
// record what diverged from a fresh generation: reshaped tiles, claimed land,
// living creatures and standing settlements. That keeps a 128x128 world well
// inside a localStorage slot instead of the ~5 MB a full tile dump would cost.
//
// Tile resources (berries, timber, ore) are intentionally regenerated rather
// than stored: the ecology re-seeds them within seconds and they would dominate
// the payload.
import type {
  BiomeType,
  Entity,
  EntityType,
  Race,
  StructureType,
  Tile,
  TraitId,
} from '../types/world';
import type { Weather, WorldLaws } from '../store/gameStore';
import type { Season, TimeOfDay } from '../types/world';
import type { WorldTemplate } from './worldGenerator';
import type { BuildingKind, Kingdom, Village } from './settlementSystem';

export const SAVE_VERSION = 1;
export const SAVE_SLOTS = ['slot-1', 'slot-2', 'slot-3', 'autosave'] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];

const STORAGE_PREFIX = 'aetheria.save.';

export interface SavedTileDelta {
  /** x * mapSize + y */
  i: number;
  h: number;
  t: BiomeType;
  s: StructureType | null;
  /** Kingdom id owning the tile, if any. */
  o?: string;
}

export interface SavedEntity {
  id: string;
  type: EntityType;
  name: string;
  age: number;
  maxAge: number;
  health: number;
  maxHealth: number;
  x: number;
  y: number;
  attributes: Entity['attributes'];
  needs: Entity['needs'];
  traits: TraitId[];
  kills: number;
  kingdomId: string | null;
  villageId: string | null;
  job: Entity['job'];
}

export interface SavedBuilding {
  id: string;
  kind: BuildingKind;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
}

export interface SavedVillage {
  id: string;
  name: string;
  kingdomId: string;
  race: Race;
  centerX: number;
  centerY: number;
  /**
   * The granary. `gold` is optional so a save written before the treasury
   * existed still loads — an old world simply starts broke, which is the right
   * answer and needs no migration.
   */
  store: Omit<Village['store'], 'gold'> & { gold?: number };
  buildings: SavedBuilding[];
  /** The kingdom's founding settlement. */
  capital?: boolean;
  /** Territory the village has worked up beyond its buildings' base claim. */
  claimBonus?: number;
}

export interface SavedKingdom {
  id: string;
  name: string;
  ruler: string;
  race: Race;
  colorHex: string;
  villageIds: string[];
  atWar: string[];
  tension: Array<[string, number]>;
}

export interface SaveGame {
  version: number;
  savedAt: number;
  label: string;
  world: {
    seed: number;
    size: 'small' | 'medium' | 'large' | 'custom';
    customSize: number;
    template: WorldTemplate;
    timeOfDay: TimeOfDay;
    season: Season;
    year: number;
    day: number;
    weather: Weather;
    laws: WorldLaws;
  };
  population: number;
  tiles: SavedTileDelta[];
  entities: SavedEntity[];
  villages: SavedVillage[];
  kingdoms: SavedKingdom[];
}

export interface SaveMeta {
  slot: SaveSlot;
  label: string;
  savedAt: number;
  population: number;
  year: number;
  season: Season;
}

/** Collect everything that diverged from a freshly generated world. */
export const buildSave = (options: {
  label: string;
  world: SaveGame['world'];
  liveTiles: Tile[][];
  pristineTiles: Tile[][];
  entities: Entity[];
  villages: Village[];
  kingdoms: Kingdom[];
}): SaveGame => {
  const { liveTiles, pristineTiles } = options;
  const mapSize = liveTiles.length;
  const tiles: SavedTileDelta[] = [];

  for (let x = 0; x < mapSize; x++) {
    for (let y = 0; y < mapSize; y++) {
      const live = liveTiles[x][y];
      const pristine = pristineTiles[x][y];
      const structure = live.structure?.type ?? null;
      const pristineStructure = pristine.structure?.type ?? null;
      const changed = Math.abs(live.height - pristine.height) > 1e-4
        || live.type !== pristine.type
        || structure !== pristineStructure
        || Boolean(live.ownerId);
      if (!changed) continue;

      const delta: SavedTileDelta = {
        i: x * mapSize + y,
        h: Number(live.height.toFixed(4)),
        t: live.type,
        s: structure,
      };
      if (live.ownerId) delta.o = live.ownerId;
      tiles.push(delta);
    }
  }

  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    label: options.label,
    world: options.world,
    population: options.entities.length,
    tiles,
    entities: options.entities.map(entity => ({
      id: entity.id,
      type: entity.type,
      name: entity.name,
      age: entity.age,
      maxAge: entity.maxAge,
      health: entity.health,
      maxHealth: entity.maxHealth,
      x: entity.position.x,
      y: entity.position.y,
      attributes: { ...entity.attributes },
      needs: { ...entity.needs },
      traits: entity.traits ?? [],
      kills: entity.kills ?? 0,
      kingdomId: entity.kingdomId ?? null,
      villageId: entity.villageId ?? null,
      job: entity.job ?? null,
    })),
    villages: options.villages.map(village => ({
      id: village.id,
      name: village.name,
      kingdomId: village.kingdomId,
      race: village.race,
      centerX: village.centerX,
      centerY: village.centerY,
      store: { ...village.store },
      capital: village.capital,
      claimBonus: village.claimBonus,
      buildings: village.buildings.map(building => ({
        id: building.id,
        kind: building.kind,
        x: building.x,
        y: building.y,
        health: building.health,
        maxHealth: building.maxHealth,
      })),
    })),
    kingdoms: options.kingdoms.map(kingdom => ({
      id: kingdom.id,
      name: kingdom.name,
      ruler: kingdom.ruler,
      race: kingdom.race,
      colorHex: kingdom.colorHex,
      villageIds: [...kingdom.villageIds],
      atWar: Array.from(kingdom.atWar),
      tension: Array.from(kingdom.tension.entries()),
    })),
  };
};

const storageKey = (slot: SaveSlot): string => `${STORAGE_PREFIX}${slot}`;

/** Persist a save. Returns an error message on failure (usually quota). */
export const writeSave = (slot: SaveSlot, save: SaveGame): string | null => {
  try {
    localStorage.setItem(storageKey(slot), JSON.stringify(save));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Could not write the save';
  }
};

export const readSave = (slot: SaveSlot): SaveGame | null => {
  try {
    const raw = localStorage.getItem(storageKey(slot));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveGame;
    if (parsed.version !== SAVE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const deleteSave = (slot: SaveSlot): void => {
  try {
    localStorage.removeItem(storageKey(slot));
  } catch {
    /* storage unavailable; nothing to delete */
  }
};

/** Slot summaries for the save/load UI. */
export const listSaves = (): SaveMeta[] => {
  const metas: SaveMeta[] = [];
  for (const slot of SAVE_SLOTS) {
    const save = readSave(slot);
    if (!save) continue;
    metas.push({
      slot,
      label: save.label,
      savedAt: save.savedAt,
      population: save.population,
      year: save.world.year,
      season: save.world.season,
    });
  }
  return metas;
};

/** Validate an imported file before handing it to the engine. */
export const parseSaveFile = (text: string): SaveGame | null => {
  try {
    const parsed = JSON.parse(text) as SaveGame;
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (parsed.version !== SAVE_VERSION) return null;
    if (!parsed.world || !Array.isArray(parsed.tiles) || !Array.isArray(parsed.entities)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const saveToFileName = (save: SaveGame): string => {
  const stamp = new Date(save.savedAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `aetheria-${save.world.seed}-${stamp}.json`;
};
