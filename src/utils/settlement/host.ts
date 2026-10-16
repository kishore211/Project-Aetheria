// What a settlement subsystem may see of the settlement core.
//
// The core used to be one five-thousand-line class in which every round
// reached into every other round's private state. Each subsystem (trade,
// construction, war, ...) now lives in its own module, owns its own state and
// timers, and sees the rest of the world only through this interface. If a
// subsystem needs something that is not here, add it here deliberately rather
// than reaching round it: this list *is* the coupling between the parts.

import type { Entity, Race, Tile } from '../../types/world';
import type { EntityManager } from '../entityManagerMinimal';
import type { BoatSystem, Point } from '../boats';
import type { WorldLaws } from '../../store/gameStore';
import type { CivilStats } from '../politics';
import type { Building, BuildingKind, Kingdom, SettlementEvents, Village } from './types';

export interface SettlementHost {
  readonly tiles: Tile[][];
  readonly entities: EntityManager;
  readonly events: SettlementEvents;
  readonly boats: BoatSystem;
  readonly villages: Map<string, Village>;
  readonly kingdoms: Map<string, Kingdom>;
  /** The world's rule switches (warfare, forging, reproduction, ...). */
  readonly laws: WorldLaws;
  /** How advanced each village's craft is, 1-4, read off what it has built. */
  craftTiers(): ReadonlyMap<string, number>;
  /** Everyone who lives in a village, wherever they are standing. */
  residentsOf(village: Village): Entity[];
  /** A water tile a village's boats can use, within `reach` of its centre. */
  harbourOf(village: Village, reach: number): Point | null;
  /** The tile at these coordinates, or null when they are off the map. */
  tileAt(x: number, y: number): Tile | null;
  /** True when a village already stands within the minimum spacing of this point. */
  tooCloseToVillage(x: number, y: number): boolean;
  /** Put a village on the map for these founders and return it. */
  createVillage(kingdom: Kingdom, tile: Tile, founders: Entity[]): Village;
  /** A unit that leaves a village gives up any office it held. */
  clearOffices(entity: Entity): void;
  /** How many residents a village's houses can hold. */
  homesIn(village: Village): number;
  /** How many towns a kingdom will try to hold before it stops settling. */
  colonyLimit(kingdom: Kingdom): number;
  /** The tile a terrain instance id names, or null when it is off the map. */
  tileFromInstanceId(id: number): Tile | null;
  /** Claim the land a village's buildings reach, and paint it in the realm's colour. */
  claimTerritory(village: Village): void;
  /** Lay a building down on a village's land, whole or as a site for builders to finish. */
  placeBuilding(village: Village, kind: BuildingKind, x: number, y: number, site?: boolean): void;
  /** Redraw a tile's terrain after its road or claim has changed. */
  syncTerrain(tile: Tile): void;
  /** Put a building's sprite in the cloud, or refresh it after an upgrade. */
  paintBuilding(village: Village, building: Building): void;
  /** Take a building off the map and out of its village. */
  removeBuilding(village: Village, building: Building): void;
  /** Common teardown of a village: buildings gone, land unclaimed, residents freed. */
  releaseVillage(village: Village): void;
  /** Push fresh village, kingdom and army summaries to the UI. */
  publishSummaries(): void;
  /** Civil stats of whoever wears a kingdom's crown, if anybody does. */
  kingCivilStats(kingdom: Kingdom): CivilStats | null;
  /** Total claimed tiles of a kingdom, for judging who is winning a war. */
  landOf(kingdom: Kingdom): number;
  /** True while two realms' caravans have been on the road lately. */
  tradePartners(a: string, b: string): boolean;
  /** A village changing hands drops its captain and its leader. */
  forgetLeadership(villageId: string): void;
  /** The leader a village has appointed, if it has one. */
  leaderIdOf(villageId: string): string | undefined;
  /** Found a new realm of this race, register it, and return it. */
  createKingdom(race: Race): Kingdom;
  /** Repaint every claimed tile in the colours of the current map layer. */
  repaintAllTerritory(): void;
  /** Open a war between two realms, as a secession or a disputed crown leaves them. */
  beginWar(a: Kingdom, b: Kingdom): void;
  /** One realm declares war on another. */
  declareWar(a: Kingdom, b: Kingdom): void;
  /** Two realms at war make peace. */
  makePeace(a: Kingdom, b: Kingdom): void;
}
