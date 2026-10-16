// Shapes shared across the civilization layer: buildings, villages, kingdoms,
// settler parties and the events the system reports. Types only.
import type * as THREE from 'three';
import type { Race } from '../../types/world';
import type {
  IdentityRow, KingdomSummary, OpinionRow, PlotSummary, VillageSummary,
} from '../../store/gameStore';
import type { LoyaltyResult } from '../politics';

export type BuildingKind =
  | 'bonfire'
  | 'tent'
  | 'house'
  | 'hall'
  | 'farm'
  | 'tower'
  | 'temple'
  | 'statue'
  | 'mine'
  | 'windmill'
  | 'barracks'
  | 'smithy'
  | 'library'
  | 'well'
  | 'market'
  | 'dock'
  | 'stockpile'
  | 'dummy';

export interface Building {
  id: string;
  kind: BuildingKind;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  villageId: string;
  /** Slot in the building sprite cloud. */
  slot: number;
  /** 1-3 for houses: hut, stone house, manor. Everything else stays at 1. */
  level?: number;
  /**
   * How far its builders have got, 0-1, while it is still a construction
   * site. Absent once it stands. A site houses nobody and earns nothing.
   */
  progress?: number;
}

export interface VillageStore {
  food: number;
  wood: number;
  stone: number;
  /** The village treasury. Taxes flow in; the ledger and thieves flow out. */
  gold: number;
  /** Worked metal from the mines: iron, copper, silver. The smith's stock. */
  metal?: number;
  /** Cut gems and crystal, for the market and the crown. */
  gems?: number;
  /** The rare metals, one ingot at a time. */
  mithril?: number;
  adamantine?: number;
}

export interface Village {
  id: string;
  name: string;
  kingdomId: string;
  race: Race;
  centerX: number;
  centerY: number;
  buildings: Building[];
  store: VillageStore;
  /** Tile instance ids currently claimed. */
  territory: Set<number>;
  /** Tiles the player's border brush gave it, held whatever its buildings reach. */
  painted?: Set<number>;
  /** Tiles the border eraser took away, never reclaimed by its buildings. */
  erased?: Set<number>;
  founded: { year: number; season: string };
  /** The kingdom's first settlement. Capitals never send the last settlers. */
  capital: boolean;
  /**
   * Extra claim radius the village has worked up over time — WorldBox's
   * claim_land task, which is what makes borders visibly creep outward rather
   * than only jumping when a building goes up.
   */
  claimBonus: number;
  /** Seconds this village has existed, for expansion and settling gates. */
  age: number;
  /** Seconds it has stood with nobody living in it. */
  emptyFor: number;
  /**
   * Last computed loyalty, with its breakdown. Cached rather than recomputed on
   * read because the inspector, the register and the rebellion check all want
   * it and the formula walks the whole kingdom.
   */
  loyalty?: LoyaltyResult;
  /** Seconds this village has sat below the rebellion threshold. */
  restless: number;
}

/** A trader walking goods from one town to another and back. */
export interface Caravan {
  from: string;
  to: string;
  leg: 'out' | 'home';
  /** Seconds before an errand that never arrives is given up. */
  timeout: number;
}

/** A group walking out to found a new village. */
export interface SettlerParty {
  id: string;
  kingdomId: string;
  sourceVillageId: string;
  target: { x: number; y: number };
  memberIds: Set<string>;
  /** Seconds left before the attempt is abandoned. */
  timeout: number;
}

export interface Kingdom {
  id: string;
  name: string;
  /** Generated title used until a real unit takes the crown. */
  ruler: string;
  /** The unit currently ruling, once one has been appointed. */
  kingId?: string | null;
  race: Race;
  colorHex: string;
  color: THREE.Color;
  villageIds: string[];
  atWar: Set<string>;
  /** Rising friction with each neighbouring kingdom (0-1, war at 1). */
  tension: Map<string, number>;
  /** Seconds this kingdom has existed, for the new-kingdom loyalty bonus. */
  age: number;
  /** Kingdoms bound by an alliance plot. Allies do not build tension. */
  allies: Set<string>;
}

export interface BuildingRecipe {
  kind: BuildingKind;
  wood: number;
  stone: number;
  /** Minimum number of existing buildings before this unlocks. */
  requires: number;
  /** A building that has to stand first. */
  needs?: BuildingKind;
  /** How many of this building one village may hold. */
  limit: number;
  size: number;
  /**
   * What a village wants most. Without this, cheap buildings always win the
   * budget and a settlement never saves up for anything impressive.
   */
  priority: number;
}

/**
 * The three siting classes, straight from their design.
 *
 * `cluster` needs a neighbouring zone already built in; `solitary` needs its
 * neighbours empty; `border` needs an adjacent zone that is not ours. Between
 * them they produce a dense core, a green belt and frontier towers with no
 * authoring at all — which is the whole trick.
 */
export type Siting = 'cluster' | 'solitary' | 'border' | 'anchor' | 'shore';

export interface BuildingTier {
  tier: 1 | 2 | 3;
  /** Tiles on a side. Tier 3 is the only thing that outgrows its tile. */
  footprint: number;
}

/** The six things the player can do to the diplomatic map. */
export type DiplomacyAct = 'spite' | 'friendship' | 'whisper' | 'unity' | 'discord' | 'inspiration';

export interface SettlementEvents {
  onEvent: (message: string, kind: 'kingdom' | 'war' | 'info', position?: { x: number; y: number }) => void;
  onKingdomsChanged: (summaries: KingdomSummary[]) => void;
  onVillagesChanged?: (summaries: VillageSummary[]) => void;
  onPlotsChanged?: (summaries: PlotSummary[]) => void;
  onIdentitiesChanged?: (rows: IdentityRow[]) => void;
  onOpinionsChanged?: (rows: OpinionRow[]) => void;
}
