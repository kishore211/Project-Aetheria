// What a settlement subsystem may see of the settlement core.
//
// The core used to be one five-thousand-line class in which every round
// reached into every other round's private state. Each subsystem (trade,
// construction, war, ...) now lives in its own module, owns its own state and
// timers, and sees the rest of the world only through this interface. If a
// subsystem needs something that is not here, add it here deliberately rather
// than reaching round it: this list *is* the coupling between the parts.

import type { Entity, Tile } from '../../types/world';
import type { EntityManager } from '../entityManagerMinimal';
import type { BoatSystem, Point } from '../boats';
import type { WorldLaws } from '../../store/gameStore';
import type { Kingdom, SettlementEvents, Village } from './types';

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
}
