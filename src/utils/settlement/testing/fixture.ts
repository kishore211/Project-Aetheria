// A hand-built SettlementHost for the subsystem tests: a flat grassland grid,
// a real EntityManager and BoatSystem, and plain Maps for villages and kingdoms.
// Each test seats only the towns and people it needs, so a failure points at
// one rule rather than at the whole world.

import * as THREE from 'three';
import { BoatSystem } from '../../boats';
import { EntityManager } from '../../entityManagerMinimal';
import { DEFAULT_WORLD_LAWS, type WorldLaws } from '../../../store/gameStore';
import type { Entity, Race, Tile } from '../../../types/world';
import type { SettlementHost } from '../host';
import { MIN_VILLAGE_SPACING } from '../constants';
import type { Building, BuildingKind, Kingdom, Village } from '../types';

export interface World {
  host: SettlementHost;
  tiles: Tile[][];
  entities: EntityManager;
  boats: BoatSystem;
  villages: Map<string, Village>;
  kingdoms: Map<string, Kingdom>;
  laws: WorldLaws;
  /** Craft tier per village, read by the armoury. Defaults to 1. */
  tiers: Map<string, number>;
  /** Every village the host has founded through createVillage. */
  founded: Array<{ village: Village; founders: Entity[] }>;
  /** Messages reported through the events hook. */
  events: string[];
}

export interface WorldOptions {
  size?: number;
  colonyLimit?: number;
}

export const flatTiles = (size: number): Tile[][] => {
  const columns: Tile[][] = [];
  for (let x = 0; x < size; x++) {
    const column: Tile[] = [];
    for (let y = 0; y < size; y++) {
      column.push({
        x, y,
        height: 0.45,
        scaledHeight: 0.45,
        moisture: 0.5,
        temperature: 0.5,
        fertility: 0.8,
        type: 'grassland',
        population: 0,
        resources: [],
        structure: null,
        entities: [],
        isOnFire: false,
        walkable: true,
        ownerId: null,
        villageId: null,
      });
    }
    columns.push(column);
  }
  return columns;
};

export const makeWorld = (options: WorldOptions = {}): World => {
  const size = options.size ?? 80;
  const tiles = flatTiles(size);
  const entities = new EntityManager(tiles, new THREE.Scene());
  const boats = new BoatSystem(tiles);
  const villages = new Map<string, Village>();
  const kingdoms = new Map<string, Kingdom>();
  const laws: WorldLaws = { ...DEFAULT_WORLD_LAWS };
  const tiers = new Map<string, number>();
  const founded: World['founded'] = [];
  const events: string[] = [];
  const colonyLimit = options.colonyLimit ?? 5;

  const residentsOf = (village: Village): Entity[] =>
    entities.getEntitiesByVillage().get(village.id) ?? [];

  const host: SettlementHost = {
    tiles,
    entities,
    events: { onEvent: (message) => { events.push(message); }, onKingdomsChanged: () => undefined },
    boats,
    villages,
    kingdoms,
    laws,
    craftTiers: () => tiers,
    residentsOf,
    harbourOf: () => null,
    tileAt: (x, y) => (x >= 0 && y >= 0 && x < size && y < size ? tiles[x][y] : null),
    tooCloseToVillage: (x, y) => Array.from(villages.values())
      .some(v => Math.hypot(v.centerX - x, v.centerY - y) < MIN_VILLAGE_SPACING),
    createVillage: (kingdom, tile, people) => {
      const village = makeVillage({
        id: `village-founded-${villages.size + 1}`,
        kingdomId: kingdom.id,
        race: kingdom.race,
        centerX: tile.x,
        centerY: tile.y,
      });
      villages.set(village.id, village);
      kingdom.villageIds.push(village.id);
      founded.push({ village, founders: people });
      return village;
    },
    clearOffices: (entity) => {
      entity.status = entity.status.filter(s => s !== 'king' && s !== 'leader' && s !== 'captain' && s !== 'priest');
    },
    homesIn: () => 12,
    colonyLimit: () => colonyLimit,
    // The war and construction side of the host. These subsystem tests do not
    // exercise it, so it is stubbed to quiet, harmless answers.
    tileFromInstanceId: () => null,
    claimTerritory: () => undefined,
    placeBuilding: (village, kind, x, y) => { village.buildings.push(building(kind, x, y)); },
    syncTerrain: () => undefined,
    paintBuilding: () => undefined,
    removeBuilding: (village, gone) => { village.buildings = village.buildings.filter(b => b !== gone); },
    releaseVillage: (village) => { villages.delete(village.id); },
    publishSummaries: () => undefined,
    kingCivilStats: () => null,
    landOf: (kingdom) => kingdom.villageIds.length,
    tradePartners: () => false,
    forgetLeadership: () => undefined,
  };

  return { host, tiles, entities, boats, villages, kingdoms, laws, tiers, founded, events };
};

export const building = (kind: BuildingKind, x: number, y: number): Building => ({
  id: `${kind}-${x}-${y}`, kind, x, y, health: 100, maxHealth: 100, villageId: '', slot: 0,
});

export const makeVillage = (
  overrides: Partial<Village> & Pick<Village, 'id' | 'kingdomId' | 'race' | 'centerX' | 'centerY'>,
): Village => ({
  name: `Town ${overrides.id}`,
  buildings: [],
  store: { food: 0, wood: 0, stone: 0, gold: 0 },
  territory: new Set(),
  founded: { year: 0, season: 'spring' },
  capital: false,
  claimBonus: 0,
  age: 30,
  emptyFor: 0,
  restless: 0,
  ...overrides,
});

export const addKingdom = (world: World, id: string, atWar: string[] = []): Kingdom => {
  const kingdom: Kingdom = {
    id, name: `Realm ${id}`, ruler: 'Ruler', race: 'human', colorHex: '#4f7fd6',
    color: new THREE.Color('#4f7fd6'), villageIds: [], atWar: new Set(atWar),
    tension: new Map(), age: 100, allies: new Set(),
  };
  world.kingdoms.set(id, kingdom);
  return kingdom;
};

export const addVillage = (
  world: World,
  village: Partial<Village> & Pick<Village, 'id' | 'kingdomId' | 'centerX' | 'centerY'>,
): Village => {
  const made = makeVillage({ race: 'human', ...village });
  world.villages.set(made.id, made);
  world.kingdoms.get(made.kingdomId)?.villageIds.push(made.id);
  return made;
};

/** An adult of the village: old enough not to be a child, housed there. */
export const addResident = (
  world: World, village: Village, race: Race = village.race, x = village.centerX, y = village.centerY,
): Entity => {
  const entity = world.entities.spawnEntity(race, x, y);
  if (!entity) throw new Error(`could not spawn a ${race} at ${x},${y}`);
  entity.age = entity.maxAge * 0.5;
  entity.villageId = village.id;
  entity.kingdomId = village.kingdomId;
  return entity;
};

/** Stand a unit on a tile without any village, e.g. a stranger or an enemy. */
export const addStranger = (world: World, race: Race, x: number, y: number, kingdomId: string | null = null): Entity => {
  const entity = world.entities.spawnEntity(race, x, y);
  if (!entity) throw new Error(`could not spawn a ${race} at ${x},${y}`);
  entity.age = entity.maxAge * 0.5;
  entity.kingdomId = kingdomId;
  return entity;
};
