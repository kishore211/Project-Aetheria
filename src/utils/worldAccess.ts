// A narrow, read-only window onto the live world for HUD components.
//
// The engine owns the tile array and the entity manager inside a React ref, but
// panels like the minimap need to read them on their own schedule. Rather than
// pushing 16k tiles through React state every frame, the engine publishes this
// handle once per world and the panels poll it.
import type { Entity, Tile } from '../types/world';
import type { SaveGame } from './saveSystem';

export interface WorldAccess {
  tiles: Tile[][];
  entities: () => Entity[];
  /** Hex colour for a kingdom id, if it still exists. */
  kingdomColor: (id: string) => string | undefined;
  /** Where the camera is looking, in tile coordinates. */
  cameraFocus: () => { x: number; y: number; span: number };
  /** Snapshot the world for a save slot or a file export. */
  captureSave: (label: string) => SaveGame;
  /** Herd this creature travels with, for the inspector. */
  herdInfo: (entity: Entity) => { size: number; isAlpha: boolean } | null;
  /** Village occupying a tile, for the inspector. */
  villageInfo: (x: number, y: number) => {
    name: string;
    kingdomName: string;
    kingdomColor: string;
    race: string;
    store: { food: number; wood: number; stone: number };
    buildings: number;
    territory: number;
    capital: boolean;
    identity: {
      culture: string | null;
      cultureColor: string | null;
      cultureTraits: string[];
      language: string | null;
      religion: string | null;
    };
    /** -100..+100, or null before the first political pass. */
    loyalty: number | null;
    /** Why it is that number, largest contribution first. */
    loyaltyFactors: Array<{ label: string; value: number }>;
    restless: number;
    /** Seconds until secession, or null when the province is settled. */
    secedesIn: number | null;
    ruler: string | null;
    rulerStats: {
      diplomacy: number;
      warfare: number;
      stewardship: number;
      intrigue: number;
    } | null;
  } | null;
}

export const worldAccess: { current: WorldAccess | null; revision: number } = {
  current: null,
  revision: 0,
};

export const publishWorldAccess = (access: WorldAccess | null): void => {
  worldAccess.current = access;
  worldAccess.revision += 1;
};
