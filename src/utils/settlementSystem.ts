// The civilization layer: villages, kingdoms, borders, work and war.
//
// This is the system that turns a wildlife simulation into a world with a
// history. Sentient units that cluster on good land found a village; villages
// claim territory outward from their buildings; villages of one race form a
// kingdom; neighbouring kingdoms build tension and eventually raid each other.
//
// Everything here is driven by the same units the player can inspect — there is
// no separate "civ AI" acting at a distance.
import * as THREE from 'three';
import {
  isWaterBiome,
  type Entity,
  type Race,
  type ResourceType,
  type Tile,
} from '../types/world';
import type {
  IdentityRow, KingdomSummary, PlotSummary, VillageSummary, WorldLaws,
} from '../store/gameStore';
import type { EntityManager } from './entityManagerMinimal';
import { getBuildingAtlas } from './pixelAtlas';
import { SpriteCloud } from './spriteCloud';
import type { TerrainRenderer } from './terrainRenderer';
import { registerOrderHandler, simulation } from './simulation';
import { emitFloater } from './floatBridge';
import { applyScenario } from './scenarios';
import { isIdentityLayer, type MapLayer } from './mapLayers';
import {
  allMetas,
  forgetGroup,
  groupMetas,
  groupHasCultureTrait,
  metaById,
  mintMeta,
  setGroupMetas,
  setMetaOf,
  writeBook,
  type MetaKind,
} from './identity';
import {
  PLOTS,
  createPlot,
  plotRate,
  plotReady,
  type Plot,
  type PlotKind,
} from './plots';
import { requestFlash } from './impactBridge';
import { chronicle } from './chronicle';
import { applyStatus, clearStatus, type StatusId } from './statusEffects';
import {
  civilStats,
  governableVillages,
  leadership,
  loyaltyFor,
  REBELLION_THRESHOLD,
  type CivilStats,
  type LoyaltyResult,
} from './politics';
import { speak } from './dialogue';
import {
  generateKingdomName,
  generateRulerName,
  generateVillageName,
  pickKingdomColor,
  resetKingdomColors,
} from './nameGenerator';
import type { AIOrder } from './entitySystemMinimal';
import type { SavedKingdom, SavedVillage } from './saveSystem';

export type BuildingKind =
  | 'bonfire'
  | 'tent'
  | 'house'
  | 'hall'
  | 'farm'
  | 'tower'
  | 'temple'
  | 'statue'
  | 'mine';

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
}

export interface VillageStore {
  food: number;
  wood: number;
  stone: number;
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

interface BuildingRecipe {
  kind: BuildingKind;
  wood: number;
  stone: number;
  /** Minimum number of existing buildings before this unlocks. */
  requires: number;
  /** How many of this building one village may hold. */
  limit: number;
  size: number;
  /**
   * What a village wants most. Without this, cheap buildings always win the
   * budget and a settlement never saves up for anything impressive.
   */
  priority: number;
}

const RECIPES: BuildingRecipe[] = [
  { kind: 'hall', wood: 14, stone: 6, requires: 5, limit: 1, size: 0.85, priority: 100 },
  { kind: 'temple', wood: 10, stone: 12, requires: 9, limit: 1, size: 0.8, priority: 80 },
  { kind: 'tower', wood: 4, stone: 10, requires: 6, limit: 3, size: 0.78, priority: 70 },
  { kind: 'mine', wood: 4, stone: 6, requires: 7, limit: 2, size: 0.6, priority: 60 },
  { kind: 'house', wood: 7, stone: 1, requires: 2, limit: 10, size: 0.62, priority: 50 },
  { kind: 'farm', wood: 5, stone: 0, requires: 3, limit: 4, size: 0.55, priority: 45 },
  { kind: 'statue', wood: 2, stone: 12, requires: 11, limit: 2, size: 0.7, priority: 30 },
  { kind: 'tent', wood: 3, stone: 0, requires: 0, limit: 3, size: 0.5, priority: 20 },
];

const BUILDING_HEALTH: Record<BuildingKind, number> = {
  bonfire: 120, tent: 60, house: 140, hall: 260,
  farm: 90, tower: 240, temple: 220, statue: 180, mine: 160,
};

/**
 * How many tiles a single building projects its kingdom's claim.
 * Scaled up from the first pass: a WorldBox village claims 3x3 zones of 8x8
 * tiles — 576 tiles — at founding, on a map the size of our 'medium'. Ours
 * claimed about 50, which is why the world looked like a few specks on a big
 * empty continent (research doc section 1).
 */
const CLAIM_RADIUS: Record<BuildingKind, number> = {
  bonfire: 7, tent: 3, house: 4, hall: 9,
  farm: 3, tower: 7, temple: 7, statue: 5, mine: 3,
};

/**
 * How keen each race is to expand, as an offset on what its ruler can govern.
 *
 * This used to be a hard ceiling — a kingdom simply stopped founding villages
 * at the limit. That was a placeholder standing in for politics: real empires
 * do not stop growing when governing gets hard, they grow anyway and start
 * losing provinces. The number now shifts where loyalty begins to suffer
 * (see `governableVillages`), and a kingdom is free to overreach and pay for
 * it (docs/project-tracker/08-MASTER-PLAN.md 14.1).
 */
const EXPANSION_APPETITE: Record<Race, number> = {
  human: 2,
  orc: 2,
  elf: 0,
  dwarf: 0,
};

/**
 * How long a province must sit below zero loyalty before it goes.
 *
 * A single bad harvest should not cost you a city, and the delay is the whole
 * reason a rebellion is something the player can see coming and head off —
 * which is what makes the loyalty breakdown worth opening.
 */
const REBELLION_PATIENCE = 45;

/**
 * How much each building breathes, 0-1.
 *
 * A settlement that is perfectly still reads as a set of props. WorldBox syncs
 * these little scale animations to the game-speed setting, which is why a
 * paused world still looks alive and a fast one looks frantic — ours ride the
 * same clock the wind does, which the engine advances every frame.
 */
const PULSE_BY_BUILDING: Record<string, number> = {
  bonfire: 1,
  farm: 0.7,
  house: 0.45,
  hall: 0.3,
  temple: 0.35,
  statue: 0.2,
  tower: 0.25,
  mine: 0.4,
};

/** Claimed land whose village has no identity yet, on an identity layer. */
const UNKNOWN_IDENTITY_COLOR = new THREE.Color('#64748b');

/**
 * Villages beyond the governable count that a kingdom will still *try* for.
 * Past this even the keenest race stops, because a realm with six seceding
 * provinces is noise rather than drama.
 */
const OVERREACH_ALLOWANCE = 2;

/** Adults a village needs before it can spare anyone to settle elsewhere. */
const SETTLER_SOURCE_POPULATION = 9;
/** How many leave together. */
const SETTLER_PARTY_MIN = 3;
const SETTLER_PARTY_MAX = 5;
/** How far a settler party will walk to found a new home. */
const SETTLE_RANGE = 34;
/** Give up on a party that never arrives. */
const SETTLE_TIMEOUT = 180;

/**
 * Ids are minted from a module-level counter, not a per-instance one. Two
 * settlement systems each numbering their villages from 1 produce colliding
 * ids, and anything that looks a village up by id — order completion, saves —
 * can then match the wrong world's village.
 */
let nextIdentifier = 1;
const mintId = (prefix: string): string => `${prefix}-${nextIdentifier++}`;

/** Stable key for a pair of kingdoms, order-independent. */
const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

const SENTIENT_RACES: Race[] = ['human', 'elf', 'dwarf', 'orc'];
const isRace = (value: string): value is Race => SENTIENT_RACES.includes(value as Race);

/** Minimum unaffiliated adults of one race in one place to found a village. */
const FOUNDING_CLUSTER = 3;
const FOUNDING_RADIUS = 5;
const MIN_VILLAGE_SPACING = 16;
const BUILDING_CLOUD_CAPACITY = 2048;

export interface SettlementEvents {
  onEvent: (message: string, kind: 'kingdom' | 'war' | 'info', position?: { x: number; y: number }) => void;
  onKingdomsChanged: (summaries: KingdomSummary[]) => void;
  onVillagesChanged?: (summaries: VillageSummary[]) => void;
  onPlotsChanged?: (summaries: PlotSummary[]) => void;
  onIdentitiesChanged?: (rows: IdentityRow[]) => void;
}

export class SettlementSystem {
  private tiles: Tile[][];
  private terrain: TerrainRenderer;
  private entities: EntityManager;
  private events: SettlementEvents;
  private buildingCloud: SpriteCloud;
  private freeSlots: number[] = [];
  private nextSlot = 0;

  villages = new Map<string, Village>();
  kingdoms = new Map<string, Kingdom>();
  parties = new Map<string, SettlerParty>();

  private foundTimer = 0;
  private workTimer = 0;
  private buildTimer = 0;
  private diplomacyTimer = 0;
  private expansionTimer = 0;
  private colonyTimer = 0;
  private publishTimer = 0;
  private loyaltyTimer = 0;
  private plotTimer = 0;
  /** Live schemes, keyed by id. */
  private plots = new Map<string, Plot>();
  private plotterIds = new Set<string>();
  private laws: WorldLaws = simulation.laws;
  /** Diplomacy rounds each active war has lasted, keyed by kingdom pair. */
  private warTimers = new Map<string, number>();
  private unsubscribeOrders: () => void;
  /** Village id -> the warrior currently carrying its banner. */
  private captains = new Map<string, string>();
  /** Village id -> its governing leader (the capital's leader is the king). */
  private leaders = new Map<string, string>();

  constructor(
    tiles: Tile[][],
    terrain: TerrainRenderer,
    entities: EntityManager,
    scene: THREE.Scene,
    events: SettlementEvents,
  ) {
    this.tiles = tiles;
    this.terrain = terrain;
    this.entities = entities;
    this.events = events;
    resetKingdomColors();

    this.buildingCloud = new SpriteCloud(getBuildingAtlas(), BUILDING_CLOUD_CAPACITY);
    scene.add(this.buildingCloud.points);

    // Own the wiring rather than relying on a caller to remember it
    this.unsubscribeOrders = registerOrderHandler((entity, order) => {
      if (order.purpose === 'herd') return;
      this.handleOrderComplete(entity, order);
    });
    simulation.homePositionFor = (entity) => this.homePositionFor(entity);
    simulation.gatheringPointFor = (entity) => this.gatheringPointFor(entity);
  }

  setWorldLaws(laws: WorldLaws): void {
    this.laws = laws;
  }

  setViewportScale(scale: number): void {
    this.buildingCloud.setViewportScale(scale);
  }

  /**
   * Advance the building pulse. Driven from the engine's frame loop alongside
   * the water and the wind, so all three share one clock and cannot drift.
   */
  advancePulse(delta: number): void {
    this.buildingCloud.advanceWind(delta);
  }

  // -- main loop ---------------------------------------------------------

  update(delta: number): void {
    if (!this.laws.settlements) return;

    this.foundTimer += delta;
    if (this.foundTimer >= 4) {
      this.foundTimer = 0;
      this.tryFoundVillages();
    }

    this.workTimer += delta;
    if (this.workTimer >= 1.5) {
      this.workTimer = 0;
      this.manageWorkforce();
      this.feedVillagers();
    }

    this.buildTimer += delta;
    if (this.buildTimer >= 3) {
      this.buildTimer = 0;
      this.buildRound();
    }

    for (const village of this.villages.values()) village.age += delta;
    for (const kingdom of this.kingdoms.values()) kingdom.age += delta;

    this.expansionTimer += delta;
    if (this.expansionTimer >= 10) {
      this.expansionTimer = 0;
      this.expansionRound();
    }

    this.colonyTimer += delta;
    if (this.colonyTimer >= 8) {
      this.colonyTimer = 0;
      this.colonyRound(this.colonyTimer);
    }
    this.ageParties(delta);

    this.loyaltyTimer += delta;
    if (this.loyaltyTimer >= 5) {
      // The pass is handed the *elapsed* time rather than its own interval, so
      // a province's patience runs down in simulated seconds no matter how
      // often this happens to be called.
      const elapsed = this.loyaltyTimer;
      this.loyaltyTimer = 0;
      this.succession();
      this.loyaltyRound(elapsed);
    }

    this.plotTimer += delta;
    if (this.plotTimer >= 2) {
      const elapsed = this.plotTimer;
      this.plotTimer = 0;
      this.plotRound(elapsed);
    }

    this.diplomacyTimer += delta;
    if (this.diplomacyTimer >= 6) {
      this.diplomacyTimer = 0;
      if (this.laws.warfare) this.diplomacyRound();
      this.resolveSieges();
    }

    this.publishTimer += delta;
    if (this.publishTimer >= 2) {
      this.publishTimer = 0;
      this.publishSummaries();
    }
  }

  // -- founding ----------------------------------------------------------

  private tryFoundVillages(): void {
    const candidates = this.entities.getAllEntities().filter(entity =>
      isRace(entity.type)
      && !entity.villageId
      && entity.health > entity.maxHealth * 0.4
      && entity.age > entity.maxAge * 0.15,
    );
    if (candidates.length < FOUNDING_CLUSTER) return;

    for (const founder of candidates) {
      if (founder.villageId) continue;
      const tile = this.tileAt(Math.floor(founder.position.x), Math.floor(founder.position.y));
      if (!tile || isWaterBiome(tile.type) || tile.height < 0.28) continue;
      if (tile.fertility < 0.15) continue;
      if (this.tooCloseToVillage(tile.x, tile.y)) continue;

      const neighbours = this.entities
        .query(founder.position.x, founder.position.y, FOUNDING_RADIUS)
        .filter(other => other.type === founder.type && !other.villageId);
      if (neighbours.length < FOUNDING_CLUSTER) continue;

      this.foundVillage(founder.type as Race, tile, neighbours);
    }
  }

  private tooCloseToVillage(x: number, y: number): boolean {
    for (const village of this.villages.values()) {
      if (Math.hypot(village.centerX - x, village.centerY - y) < MIN_VILLAGE_SPACING) return true;
    }
    return false;
  }

  private foundVillage(race: Race, tile: Tile, founders: Entity[]): void {
    // Join an existing kingdom of the same race if one is close enough,
    // otherwise a brand new kingdom is born.
    let kingdom = this.findNearbyKingdom(race, tile.x, tile.y);
    let newKingdom = false;
    if (!kingdom) {
      kingdom = this.createKingdom(race);
      newKingdom = true;
    }

    const village = this.createVillage(kingdom, tile, founders);

    if (newKingdom) {
      this.events.onEvent(
        chronicle('kingdom_founded', { a: kingdom.name, name: village.name, b: kingdom.ruler }),
        'kingdom',
        { x: tile.x, y: tile.y },
      );
    } else {
      this.events.onEvent(
        chronicle('village_settled', { name: village.name, a: kingdom.name }),
        'kingdom',
        { x: tile.x, y: tile.y },
      );
    }
  }

  /**
   * Put a settlement on the map. Shared by spontaneous founding and by settler
   * parties arriving at a colony site.
   */
  private createVillage(kingdom: Kingdom, tile: Tile, founders: Entity[]): Village {
    const village: Village = {
      id: mintId('village'),
      name: generateVillageName(kingdom.race),
      kingdomId: kingdom.id,
      race: kingdom.race,
      centerX: tile.x,
      centerY: tile.y,
      buildings: [],
      store: { food: 4, wood: 4, stone: 2 },
      territory: new Set(),
      founded: { year: 0, season: simulation.season },
      capital: kingdom.villageIds.length === 0,
      claimBonus: 0,
      age: 0,
      emptyFor: 0,
      restless: 0,
    };
    this.villages.set(village.id, village);
    kingdom.villageIds.push(village.id);

    // Identity. A brand-new kingdom invents its own culture, language and
    // faith; a village founded under an existing one inherits them. That is
    // what makes two towns of the same race able to drift apart later — they
    // start identical and the pot mechanic does the rest.
    const inherited = groupMetas(kingdom.id);
    if (inherited) {
      setGroupMetas(village.id, inherited);
    } else {
      const minted = {
        culture: mintMeta('culture').id,
        language: mintMeta('language').id,
        religion: mintMeta('religion').id,
      };
      setGroupMetas(kingdom.id, minted);
      setGroupMetas(village.id, minted);
    }
    const identity = groupMetas(village.id)!;

    this.placeBuilding(village, 'bonfire', tile.x, tile.y);

    for (const founder of founders) {
      founder.villageId = village.id;
      founder.kingdomId = kingdom.id;
      founder.job = 'gatherer';
      // Founders adopt the town's identity outright. Anyone who wanders in
      // later has to be talked into it.
      setMetaOf(founder, 'culture', identity.culture);
      setMetaOf(founder, 'language', identity.language);
      setMetaOf(founder, 'religion', identity.religion);
    }

    // Founding a village is one of the few moments worth interrupting for.
    if (founders[0]) {
      emitFloater({
        kind: 'speech',
        text: speak('newVillage', Math.random()),
        x: founders[0].position.x,
        y: founders[0].position.y,
        entityId: founders[0].id,
      });
    }

    this.claimTerritory(village);
    return village;
  }

  private findNearbyKingdom(race: Race, x: number, y: number): Kingdom | null {
    let best: Kingdom | null = null;
    let bestDistance = Infinity;
    for (const kingdom of this.kingdoms.values()) {
      if (kingdom.race !== race) continue;
      for (const villageId of kingdom.villageIds) {
        const village = this.villages.get(villageId);
        if (!village) continue;
        const distance = Math.hypot(village.centerX - x, village.centerY - y);
        if (distance < 34 && distance < bestDistance) {
          bestDistance = distance;
          best = kingdom;
        }
      }
    }
    return best;
  }

  private createKingdom(race: Race): Kingdom {
    const colorHex = pickKingdomColor(race);
    const kingdom: Kingdom = {
      id: mintId('kingdom'),
      name: generateKingdomName(race),
      ruler: generateRulerName(race),
      race,
      colorHex,
      color: new THREE.Color(colorHex),
      villageIds: [],
      atWar: new Set(),
      tension: new Map(),
      age: 0,
      allies: new Set(),
    };
    this.kingdoms.set(kingdom.id, kingdom);
    return kingdom;
  }

  // -- territory ---------------------------------------------------------

  private claimTerritory(village: Village): void {
    const kingdom = this.kingdoms.get(village.kingdomId);
    if (!kingdom) return;

    const claimed = new Set<number>();
    for (const building of village.buildings) {
      const radius = CLAIM_RADIUS[building.kind] + village.claimBonus;
      const radiusSq = radius * radius;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (dx * dx + dy * dy > radiusSq) continue;
          const tile = this.tileAt(building.x + dx, building.y + dy);
          if (!tile || isWaterBiome(tile.type)) continue;
          // Never take a tile another kingdom already owns; borders only
          // change through war.
          if (tile.ownerId && tile.ownerId !== kingdom.id) continue;
          claimed.add(this.instanceId(tile));
        }
      }
    }

    // Only the difference needs repainting. Claims are recomputed every time a
    // building goes up or a border creeps outward, and a mature village holds
    // hundreds of tiles — repainting all of them each time was most of the cost.
    const gained: Tile[] = [];
    const lost: Tile[] = [];

    for (const id of claimed) {
      if (village.territory.has(id)) continue;
      const tile = this.tileFromInstanceId(id);
      if (!tile) continue;
      tile.ownerId = kingdom.id;
      gained.push(tile);
    }
    for (const id of village.territory) {
      if (claimed.has(id)) continue;
      const tile = this.tileFromInstanceId(id);
      if (!tile) continue;
      if (tile.ownerId === kingdom.id) tile.ownerId = null;
      lost.push(tile);
    }

    village.territory = claimed;

    // A tile's border highlight depends on its neighbours, so repaint a
    // one-tile skirt around everything that changed hands.
    for (const tile of gained) this.refreshOwnershipAround(tile);
    for (const tile of lost) this.refreshOwnershipAround(tile);
  }

  private refreshOwnershipAround(tile: Tile): void {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighbour = this.tileAt(tile.x + dx, tile.y + dy);
        if (!neighbour) continue;
        this.terrain.syncOwnership(neighbour, this.tintForTile(neighbour));
      }
    }
  }

  /**
   * What colour a claimed tile should wear.
   *
   * Kingdom colour normally; the colour of the owning village's culture,
   * language or faith on those layers. Resolved per tile rather than per
   * kingdom because the whole point of an identity layer is that it can cut
   * *across* a kingdom — a realm with two cultures in it should look like two
   * colours, which is exactly the thing the political layer cannot show you.
   */
  private tintForTile(tile: Tile, layer: MapLayer = simulation.mapLayer): THREE.Color | null {
    if (!tile.ownerId) return null;

    if (!isIdentityLayer(layer)) {
      return this.kingdoms.get(tile.ownerId)?.color ?? null;
    }

    const village = this.villageHolding(tile);
    const set = village ? groupMetas(village.id) : null;
    const metaId = set
      ? layer === 'culture' ? set.culture
        : layer === 'language' ? set.language
          : set.religion
      : null;
    const meta = metaById(metaId);
    if (!meta) return UNKNOWN_IDENTITY_COLOR;
    return this.identityColor(meta.id, meta.colorHex);
  }

  /** Cached THREE.Colors, so a repaint does not allocate one per tile. */
  private identityColors = new Map<string, THREE.Color>();

  private identityColor(id: string, hex: string): THREE.Color {
    let color = this.identityColors.get(id);
    if (!color) {
      color = new THREE.Color(hex);
      this.identityColors.set(id, color);
    }
    return color;
  }

  /** Which village's claim covers this tile. */
  private villageHolding(tile: Tile): Village | null {
    const id = this.instanceId(tile);
    for (const village of this.villages.values()) {
      if (village.territory.has(id)) return village;
    }
    return null;
  }

  /**
   * Repaint every claimed tile. Called when the map layer changes.
   *
   * Walks villages rather than the whole map, because territory is a small
   * fraction of a 128² world and sweeping 16,384 tiles to repaint a few hundred
   * is the kind of thing that makes switching layers feel heavy.
   */
  repaintAllTerritory(layer: MapLayer = simulation.mapLayer): void {
    for (const village of this.villages.values()) {
      for (const id of village.territory) {
        const tile = this.tileFromInstanceId(id);
        if (tile) this.terrain.syncOwnership(tile, this.tintForTile(tile, layer));
      }
    }
  }

  // -- work --------------------------------------------------------------

  /** Keep every village staffed and send loaded gatherers home. */
  private manageWorkforce(): void {
    const byVillage = new Map<string, Entity[]>();
    for (const entity of this.entities.getAllEntities()) {
      if (!entity.villageId) continue;
      const list = byVillage.get(entity.villageId);
      if (list) list.push(entity);
      else byVillage.set(entity.villageId, [entity]);
    }

    for (const [villageId, members] of byVillage) {
      const village = this.villages.get(villageId);
      if (!village) {
        for (const member of members) {
          member.villageId = null;
          member.job = null;
          this.clearOffices(member);
          this.entities.setHerdAnchor(member, null);
        }
        continue;
      }

      const kingdom = this.kingdoms.get(village.kingdomId);
      const atWar = (kingdom?.atWar.size ?? 0) > 0;

      // Jobs are staffed by what the village is short of, with caps — WorldBox
      // hires one berry gatherer when the granary is full and ten when it is
      // empty (research doc section 6).
      // Culture decides how much of a town is under arms. This is the first
      // place a culture trait becomes visible without opening a panel: a
      // warlike town simply has more soldiers standing around in it.
      const martial = groupHasCultureTrait(village.id, 'warlike') ? 1.6
        : groupHasCultureTrait(village.id, 'pacifist') ? 0.45
          : 1;
      const warriorTarget = members.length >= 8
        ? Math.max(1, Math.round(members.length * (atWar ? 0.4 : 0.15) * martial))
        : 0;
      const appetite = groupHasCultureTrait(village.id, 'frugal') ? 0.7 : 1;
      const foragingNeed = village.store.food > 100 ? 1
        : village.store.food > 60 ? 3
        : village.store.food > 40 ? 5
        : village.store.food > 20 ? 7
        : members.length;
      // Leave room for the warband: without this clamp, everyone is already a
      // gatherer by the time warriors are considered and a village never arms
      // itself at all.
      const gathererTarget = Math.max(
        0, Math.min(Math.ceil(foragingNeed * appetite), members.length - warriorTarget),
      );

      let warriors = 0;
      let gatherers = 0;

      // Existing holders keep their posts where the village still needs them
      for (const member of members) {
        if (member.job === 'warrior' && warriors < warriorTarget) warriors++;
        else if (member.job === 'gatherer' && gatherers < gathererTarget) gatherers++;
        else member.job = null;
      }

      for (const member of members) {
        if (member.job) continue;
        if (warriors < warriorTarget) {
          member.job = 'warrior';
          warriors++;
        } else if (gatherers < gathererTarget) {
          member.job = 'gatherer';
          gatherers++;
        }
      }

      this.appointOfficials(village, members);

      // Loaded gatherers walk their haul back to the village centre
      for (const member of members) {
        if (member.job === 'warrior') continue;
        if (member.carrying) {
          this.entities.giveOrder(member, {
            kind: 'goto',
            x: village.centerX,
            y: village.centerY,
            purpose: 'deliver',
          });
        }
      }

      // Recruit newcomers standing on village land
      const recruits = this.entities
        .query(village.centerX, village.centerY,
          groupHasCultureTrait(village.id, 'hospitable') ? 14 : 8)
        .filter(entity => entity.type === village.race && !entity.villageId);
      for (const recruit of recruits) {
        recruit.villageId = village.id;
        recruit.kingdomId = village.kingdomId;
        recruit.job = 'gatherer';
      }
    }
  }

  /**
   * Give a village its officials: a leader, a captain, and — if this is the
   * capital — the kingdom's king. These were names on a kingdom record before;
   * making them real units means the HUD can point at them and Phase 14 has
   * something to build succession on.
   */
  private appointOfficials(village: Village, members: Entity[]): void {
    this.appointLeader(village, members);
    this.appointCaptain(village, members);
  }

  /** The shrewdest resident governs; the capital's leader wears the crown. */
  private appointLeader(village: Village, members: Entity[]): void {
    const eligible = members.filter(member => member.age > member.maxAge * 0.2);
    if (eligible.length === 0) {
      this.leaders.delete(village.id);
      return;
    }

    let leader = this.entities.getEntityById(this.leaders.get(village.id) ?? '');
    if (!leader || leader.villageId !== village.id) {
      // Governors are chosen on stewardship rather than raw intelligence now
      // — it is the stat the job is actually measured by, and it is what
      // loyalty reads.
      leader = eligible.reduce((best, member) => (
        leadership(civilStats(member)) > leadership(civilStats(best)) ? member : best
      ), eligible[0]);
      for (const member of members) this.stripStatus(member, 'leader');
      this.leaders.set(village.id, leader.id);
    }

    // Only the governor's badge is set here. The crown belongs to `succession`
    // — when both places assigned it, the capital's governor and the realm's
    // ablest leader took turns claiming it every pass, and a kingdom whose
    // ruler changes every five seconds has no politics at all.
    if (!leader.status.includes('leader')) {
      applyStatus(leader, 'leader');
      emitFloater({
        kind: 'speech',
        text: speak('crowned', Math.random()),
        x: leader.position.x,
        y: leader.position.y,
        entityId: leader.id,
      });
    }
  }

  private appointCaptain(village: Village, members: Entity[]): void {
    const warriors = members.filter(member => member.job === 'warrior');
    if (warriors.length === 0) {
      this.captains.delete(village.id);
      for (const member of members) this.stripStatus(member, 'captain');
      return;
    }

    let captain = this.entities.getEntityById(this.captains.get(village.id) ?? '');
    if (!captain || captain.job !== 'warrior' || captain.villageId !== village.id) {
      // The toughest warrior takes the banner
      captain = warriors.reduce((best, warrior) => (
        warrior.attributes.strength > best.attributes.strength ? warrior : best
      ), warriors[0]);
      for (const warrior of warriors) this.stripStatus(warrior, 'captain');
      this.captains.set(village.id, captain.id);
    }

    applyStatus(captain, 'captain');

    for (const warrior of warriors) {
      if (warrior.id === captain.id) continue;
      this.entities.setHerdAnchor(warrior, captain, 2.5);
    }
  }

  private stripStatus(entity: Entity, status: StatusId): void {
    clearStatus(entity, status);
  }

  /** A unit that leaves a village leaves its office behind with it. */
  private clearOffices(entity: Entity): void {
    this.stripStatus(entity, 'king');
    this.stripStatus(entity, 'leader');
    this.stripStatus(entity, 'captain');
  }

  /** Villages feed their residents from the granary. */
  private feedVillagers(): void {
    for (const village of this.villages.values()) {
      if (village.store.food <= 0) continue;
      const residents = this.entities
        .query(village.centerX, village.centerY, 11)
        .filter(entity => entity.villageId === village.id && entity.needs.hunger < 0.6);

      for (const resident of residents) {
        if (village.store.food <= 0) break;
        village.store.food -= 1;
        resident.needs.hunger = Math.min(1, resident.needs.hunger + 0.4);
      }
    }
  }

  /** A unit reached the tile a village sent it to. */
  handleOrderComplete(entity: Entity, order: AIOrder): void {
    if (order.purpose === 'deliver') {
      const village = entity.villageId ? this.villages.get(entity.villageId) : null;
      if (village && entity.carrying) {
        this.deposit(village, entity.carrying.type, entity.carrying.quantity);
        // The granary filling up is the whole point of the errand, and until
        // now it happened entirely in a number nobody could see.
        emitFloater({
          kind: 'gain',
          text: `+${entity.carrying.quantity} ${entity.carrying.type}`,
          x: entity.position.x,
          y: entity.position.y,
        });
        entity.carrying = null;
      }
      return;
    }

    if (order.purpose === 'settle') {
      const party = Array.from(this.parties.values())
        .find(candidate => candidate.memberIds.has(entity.id));
      if (party) this.foundColony(entity, party);
      return;
    }

    if (order.purpose === 'raid') {
      const enemy = this.entities
        .query(entity.position.x, entity.position.y, 8)
        .find(other => other.kingdomId
          && other.kingdomId !== entity.kingdomId
          && this.atWar(entity.kingdomId, other.kingdomId));
      if (enemy) this.entities.engage(entity, enemy);
    }
  }

  private deposit(village: Village, type: ResourceType, quantity: number): void {
    if (type === 'food') village.store.food += quantity;
    else if (type === 'wood') village.store.wood += quantity;
    else if (type === 'stone') village.store.stone += quantity;
  }

  // -- construction ------------------------------------------------------

  private buildRound(): void {
    for (const village of this.villages.values()) {
      // Industrious towns get an extra attempt each round; everyone else
      // occasionally skips one. Expressed as a chance rather than a separate
      // timer so the two traits stay symmetrical and there is one place to
      // read the rule.
      if (!groupHasCultureTrait(village.id, 'industrious') && Math.random() < 0.25) continue;

      const recipe = this.nextRecipe(village);
      if (!recipe) continue;
      const spot = this.findBuildSpot(village, recipe.kind);
      if (!spot) continue;

      village.store.wood -= recipe.wood;
      village.store.stone -= recipe.stone;
      this.placeBuilding(village, recipe.kind, spot.x, spot.y);
      this.claimTerritory(village);

      if (recipe.kind === 'hall') {
        this.events.onEvent(
          chronicle('hall_raised', { name: village.name }),
          'kingdom',
          { x: spot.x, y: spot.y },
        );
        // A temple or a library is where a people writes itself down.
      } else if (recipe.kind === 'temple' || recipe.kind === 'statue') {
        const identity = groupMetas(village.id);
        if (identity) {
          const book = writeBook(spot.x, spot.y, identity);
          this.events.onEvent(
            chronicle('book_written', { name: book.title, a: village.name }),
            'kingdom',
            { x: spot.x, y: spot.y },
          );
        }
        this.events.onEvent(
          chronicle('monument_raised', { name: village.name, type: recipe.kind }),
          'kingdom',
          { x: spot.x, y: spot.y },
        );
      }
    }
  }

  /**
   * Pick what to build next: the highest-priority thing the village can afford
   * right now. RECIPES is kept in priority order, so a first match wins.
   */
  private nextRecipe(village: Village): BuildingRecipe | null {
    const count = village.buildings.length;
    for (const recipe of RECIPES) {
      if (count < recipe.requires) continue;
      const existing = village.buildings.filter(b => b.kind === recipe.kind).length;
      if (existing >= recipe.limit) continue;
      if (village.store.wood < recipe.wood || village.store.stone < recipe.stone) continue;
      // Mines only make sense on or beside stone
      if (recipe.kind === 'mine' && !this.hasRockNearby(village)) continue;
      return recipe;
    }
    return null;
  }

  private hasRockNearby(village: Village): boolean {
    for (let dx = -5; dx <= 5; dx++) {
      for (let dy = -5; dy <= 5; dy++) {
        const tile = this.tileAt(village.centerX + dx, village.centerY + dy);
        if (tile && (tile.type === 'mountains' || tile.type === 'hills')) return true;
      }
    }
    return false;
  }

  private findBuildSpot(village: Village, kind: BuildingKind): { x: number; y: number } | null {
    const maxRadius = kind === 'farm' ? 6 : 5;
    const occupied = new Set(village.buildings.map(b => `${b.x},${b.y}`));

    // House spacing is the most visible culture trait of all, because it is the
    // *shape* of the town rather than a number in a panel. A dense culture
    // starts filling from the centre; a spacious one leaves the first ring
    // empty and builds outward.
    const spacious = groupHasCultureTrait(village.id, 'spacious');
    const dense = groupHasCultureTrait(village.id, 'dense');
    const firstRing = spacious ? 2 : 1;
    const lastRing = dense ? Math.max(2, maxRadius - 2) : spacious ? maxRadius + 2 : maxRadius;

    for (let radius = firstRing; radius <= lastRing; radius++) {
      const ring: Array<{ x: number; y: number }> = [];
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = village.centerX + dx;
          const y = village.centerY + dy;
          if (occupied.has(`${x},${y}`)) continue;
          const tile = this.tileAt(x, y);
          if (!tile || tile.villageId) continue;
          if (isWaterBiome(tile.type) || tile.height < 0.28) continue;
          if (tile.type === 'mountains' && kind !== 'mine') continue;
          if (kind === 'farm' && tile.fertility < 0.3) continue;
          if (kind === 'mine' && tile.type !== 'mountains' && tile.type !== 'hills') continue;
          ring.push({ x, y });
        }
      }
      if (ring.length > 0) return ring[Math.floor(Math.random() * ring.length)];
    }
    return null;
  }

  private placeBuilding(village: Village, kind: BuildingKind, x: number, y: number): void {
    const tile = this.tileAt(x, y);
    if (!tile) return;

    const slot = this.freeSlots.pop() ?? this.nextSlot++;
    if (slot >= BUILDING_CLOUD_CAPACITY) return;

    const kingdom = this.kingdoms.get(village.kingdomId);
    const recipe = RECIPES.find(r => r.kind === kind);
    const size = kind === 'bonfire' ? 0.55 : recipe?.size ?? 0.5;

    const building: Building = {
      id: mintId('building'),
      kind,
      x,
      y,
      health: BUILDING_HEALTH[kind],
      maxHealth: BUILDING_HEALTH[kind],
      villageId: village.id,
      slot,
    };
    village.buildings.push(building);

    // Buildings clear the land they stand on and replace natural decoration
    tile.villageId = village.id;
    tile.structure = null;
    this.terrain.clearDetail(tile);

    const position = this.terrain.worldPosition(tile).clone();
    position.y += size * 0.5 + 0.02;
    this.buildingCloud.set(slot, {
      position,
      sprite: kind,
      size,
      // Tint toward the kingdom colour so borders and buildings agree
      tint: kingdom ? new THREE.Color(0xffffff).lerp(kingdom.color, 0.22) : undefined,
      // Negative sway means "pulse in scale" rather than "lean". A bonfire
      // breathes hardest because it is literally a fire; a hall barely moves
      // because a building that wobbles looks broken.
      sway: -(PULSE_BY_BUILDING[kind] ?? 0.5),
    });
  }

  private removeBuilding(village: Village, building: Building): void {
    this.buildingCloud.clear(building.slot);
    this.freeSlots.push(building.slot);
    const index = village.buildings.indexOf(building);
    if (index !== -1) village.buildings.splice(index, 1);

    const tile = this.tileAt(building.x, building.y);
    if (tile && tile.villageId === village.id) {
      tile.villageId = null;
      this.terrain.syncTile(tile, simulation.timeOfDay, simulation.season);
    }
  }

  /**
   * Tear down whatever stands on a tile, for the demolish power.
   *
   * Public because the engine must not clear a village tile behind this
   * system's back: doing so leaves the settlement holding a building it still
   * believes in, and the next claim pass paints territory around a hall that
   * is no longer there. Returns whether anything came down.
   */
  demolishAt(x: number, y: number): boolean {
    for (const village of this.villages.values()) {
      const building = village.buildings.find(candidate => candidate.x === x && candidate.y === y);
      if (!building) continue;
      this.removeBuilding(village, building);
      // Claims radiate from buildings, so the border has to be recomputed or
      // the village keeps land it can no longer reach.
      this.claimTerritory(village);
      this.publishSummaries();
      return true;
    }
    return false;
  }

  // -- politics ----------------------------------------------------------

  /**
   * Make sure every kingdom has somebody on the throne.
   *
   * When a king dies the crown goes to the ablest village leader in the realm,
   * which is a succession rule with a consequence: an heir with poor
   * stewardship immediately drags loyalty down across every province, so a
   * king dying can be the thing that starts a rebellion. That is the whole
   * point of tying loyalty to the ruler's stats.
   */
  private succession(): void {
    for (const kingdom of this.kingdoms.values()) {
      const sitting = kingdom.kingId ? this.entities.getEntityById(kingdom.kingId) : null;
      if (sitting && sitting.health > 0 && sitting.kingdomId === kingdom.id) continue;

      const candidates: Entity[] = [];
      for (const villageId of kingdom.villageIds) {
        const leader = this.villages.get(villageId) && this.villageLeader(this.villages.get(villageId)!);
        if (leader) candidates.push(leader);
      }

      if (candidates.length === 0) {
        if (kingdom.kingId) {
          kingdom.kingId = null;
          this.events.onEvent(chronicle('succession_none', { a: kingdom.name }), 'kingdom');
        }
        continue;
      }

      // The ablest governor, not the nearest — a realm choosing its worst
      // available heir makes for a funnier story but a duller simulation,
      // because loyalty would collapse every time anybody died.
      const heir = candidates.reduce((best, candidate) => (
        leadership(civilStats(candidate)) > leadership(civilStats(best)) ? candidate : best
      ), candidates[0]);

      kingdom.kingId = heir.id;
      kingdom.ruler = heir.name;
      applyStatus(heir, 'king');
      applyScenario(heir, 'crowned');
      this.events.onEvent(
        chronicle('crowned_king', { name: heir.name, a: kingdom.name }),
        'kingdom',
        { x: Math.floor(heir.position.x), y: Math.floor(heir.position.y) },
      );
    }
  }

  /** Civil stats of whoever actually wears the crown, if anybody does. */
  private kingCivilStats(kingdom: Kingdom): CivilStats | null {
    if (!kingdom.kingId) return null;
    const king = this.entities.getEntityById(kingdom.kingId);
    return king ? civilStats(king) : null;
  }

  private villageLeader(village: Village): Entity | null {
    const id = this.leaders.get(village.id);
    if (!id) return null;
    const leader = this.entities.getEntityById(id);
    return leader && leader.villageId === village.id ? leader : null;
  }

  /**
   * Recompute loyalty for every village, and let the unhappy ones go.
   *
   * Done in one pass per kingdom rather than per village, because every factor
   * is relative to the capital and looking that up once per village would walk
   * the same data N times.
   */
  private loyaltyRound(delta: number): void {
    const members = this.entities.getEntitiesByVillage();

    for (const kingdom of this.kingdoms.values()) {
      const king = this.kingCivilStats(kingdom);
      const kingEntity = kingdom.kingId
        ? this.entities.getEntityById(kingdom.kingId) : null;
      const governable = governableVillages(king) + (EXPANSION_APPETITE[kingdom.race] ?? 0);
      const over = Math.max(0, kingdom.villageIds.length - governable);

      const capital = kingdom.villageIds
        .map(id => this.villages.get(id))
        .find(village => village?.capital) ?? null;
      const capitalPopulation = capital ? (members.get(capital.id)?.length ?? 0) : 0;
      const capitalTerritory = capital?.territory.size ?? 0;

      // Losing a war is measured by held land rather than by casualties: it is
      // the thing a villager would actually notice.
      const losingWar = Array.from(kingdom.atWar).some(enemyId => {
        const enemy = this.kingdoms.get(enemyId);
        if (!enemy) return false;
        return this.landOf(enemy) > this.landOf(kingdom) * 1.25;
      });

      for (const villageId of [...kingdom.villageIds]) {
        const village = this.villages.get(villageId);
        if (!village) continue;

        const residents = members.get(village.id) ?? [];
        const leader = this.villageLeader(village);
        const mood = residents.length === 0
          ? 0
          : residents.reduce(
            (sum: number, resident: Entity) => sum + (resident.happiness ?? 0), 0,
          ) / residents.length;

        village.loyalty = loyaltyFor({
          isCapital: village.capital,
          king,
          leader: leader ? civilStats(leader) : null,
          leaderTraits: leader?.traits ?? [],
          population: residents.length,
          capitalPopulation,
          territory: village.territory.size,
          capitalTerritory,
          distanceToCapital: capital
            ? Math.hypot(village.centerX - capital.centerX, village.centerY - capital.centerY)
            : 0,
          bordersCapital: capital ? this.bordersCapital(village, capital) : false,
          villageAge: village.age,
          kingdomAge: kingdom.age,
          villagesOverLimit: over,
          losingWar,
          sameSpeciesAsKing: !kingEntity || kingEntity.type === village.race,
          averageMood: mood,
          ...this.identityFactorsFor(village, kingdom),
        });

        if (village.loyalty.score < REBELLION_THRESHOLD && !village.capital) {
          village.restless += delta;
          // A province has to stay unhappy for a while before it goes. A single
          // bad harvest should not cost you a city, and the delay is what makes
          // a rebellion something the player can see coming and prevent.
          if (village.restless >= REBELLION_PATIENCE) this.secede(village, kingdom);
        } else {
          village.restless = Math.max(0, village.restless - delta * 2);
        }
      }
    }
  }

  /**
   * How the province's identity compares with the realm's.
   *
   * A village's *institutional* identity is what counts here, not the shifting
   * opinions of whoever happens to live there — a town does not secede because
   * one resident converted, it secedes because the town itself has drifted.
   */
  private identityFactorsFor(village: Village, kingdom: Kingdom): {
    sameCulture: boolean | null;
    sameLanguage: boolean | null;
    sameReligion: boolean | null;
    xenophobic: boolean;
  } {
    const mine = groupMetas(village.id);
    const theirs = groupMetas(kingdom.id);
    const compare = (kind: MetaKind): boolean | null => {
      const a = mine ? mine[kind] : null;
      const b = theirs ? theirs[kind] : null;
      // Skipped rather than counted as a mismatch: a village with no culture
      // is not estranged, it simply has not been asked.
      if (!a || !b) return null;
      return a === b;
    };
    return {
      sameCulture: compare('culture'),
      sameLanguage: compare('language'),
      sameReligion: compare('religion'),
      xenophobic: metaById(mine?.culture)?.traits.includes('xenophobic') ?? false,
    };
  }

  /** Total claimed tiles, for judging who is winning a war. */
  private landOf(kingdom: Kingdom): number {
    let total = 0;
    for (const id of kingdom.villageIds) total += this.villages.get(id)?.territory.size ?? 0;
    return total;
  }

  /** Do these two villages' claims touch? */
  private bordersCapital(village: Village, capital: Village): boolean {
    if (village.id === capital.id) return false;
    const reach = 3;
    return Math.abs(village.centerX - capital.centerX) <= capital.claimBonus + reach + 6
      && Math.abs(village.centerY - capital.centerY) <= capital.claimBonus + reach + 6;
  }

  /**
   * A province declares itself a kingdom, and its former ruler declares war.
   *
   * The immediate war is WorldBox's rule and it is what turns a number going
   * negative into a story: the map splits, and then the two halves fight over
   * the seam.
   */
  private secede(village: Village, from: Kingdom): void {
    const residents = this.entities.getEntitiesByVillage().get(village.id) ?? [];
    if (residents.length === 0) return;

    // Leave the old kingdom.
    const index = from.villageIds.indexOf(village.id);
    if (index !== -1) from.villageIds.splice(index, 1);

    const kingdom = this.createKingdom(village.race);
    village.kingdomId = kingdom.id;
    village.capital = true;
    village.restless = 0;
    kingdom.villageIds.push(village.id);

    for (const resident of residents) {
      resident.kingdomId = kingdom.id;
      this.clearOffices(resident);
    }

    // Territory changes hands with the town that holds it. Cleared first so
    // claimTerritory sees the tiles as newly gained and repaints them in the
    // new colours — otherwise the border keeps the old kingdom's paint.
    for (const id of village.territory) {
      const tile = this.tileFromInstanceId(id);
      if (tile) tile.ownerId = null;
    }
    village.territory.clear();
    this.claimTerritory(village);

    if (this.laws.warfare) {
      from.atWar.add(kingdom.id);
      kingdom.atWar.add(from.id);
      from.tension.set(kingdom.id, 1);
      kingdom.tension.set(from.id, 1);
      this.warTimers.set(pairKey(from.id, kingdom.id), 0);
    }

    this.events.onEvent(
      chronicle('secession', { name: village.name, a: from.name, b: kingdom.name }),
      'war',
      { x: village.centerX, y: village.centerY },
    );
    for (const resident of residents.slice(0, 3)) applyScenario(resident, 'crowned');
    this.publishSummaries();
  }

  // -- plots -------------------------------------------------------------

  /** Every live scheme, for the interface. */
  activePlots(): Array<Plot & { plotterName: string; subjectName: string; targetName: string | null }> {
    const rows = [];
    for (const plot of this.plots.values()) {
      const plotter = this.entities.getEntityById(plot.plotterId);
      if (!plotter) continue;
      rows.push({
        ...plot,
        plotterName: plotter.name,
        subjectName: this.villages.get(plot.subjectId)?.name
          ?? this.kingdoms.get(plot.subjectId)?.name
          ?? 'somewhere',
        targetName: plot.targetKingdomId
          ? this.kingdoms.get(plot.targetKingdomId)?.name ?? null
          : null,
      });
    }
    return rows.sort((a, b) => b.progress / PLOTS[b.kind].target - a.progress / PLOTS[a.kind].target);
  }

  /** Plots this creature is running, for the inspector. */
  plotsBy(entityId: string): Plot[] {
    return Array.from(this.plots.values()).filter(plot => plot.plotterId === entityId);
  }

  /**
   * Ids of everyone currently scheming, refreshed once per plot round.
   *
   * The icon rail asks this every frame for every visible unit, so it must not
   * walk the plot map each time — a Set built when plots change is the whole
   * difference between "free" and "quadratic in the population".
   */
  plottingIds(): ReadonlySet<string> {
    return this.plotterIds;
  }

  /**
   * Break up a scheme.
   *
   * Public because the player is meant to be able to stop one — blessing the
   * plotter is the non-violent option, and killing them is the other. Without
   * a way to intervene, a plot is a countdown rather than a decision.
   */
  cancelPlotsBy(entityId: string, reason: 'dead' | 'blessed'): number {
    let cancelled = 0;
    for (const [id, plot] of this.plots) {
      if (plot.plotterId !== entityId) continue;
      this.plots.delete(id);
      cancelled += 1;
      if (reason === 'blessed') {
        const plotter = this.entities.getEntityById(entityId);
        this.events.onEvent(
          chronicle('plot_abandoned', {
            name: plotter?.name ?? 'Someone', type: PLOTS[plot.kind].label.toLowerCase(),
          }),
          'kingdom',
        );
      }
    }
    return cancelled;
  }

  /**
   * Drop the schemes of a creature that has died.
   *
   * `plotRound` already skips plots whose plotter is gone, but leaving them in
   * the map means the interface lists a conspiracy nobody is running — and the
   * player's most direct way of stopping a plot should visibly work.
   */
  forgetPlotter(entityId: string): void {
    this.cancelPlotsBy(entityId, 'dead');
  }

  /**
   * Every identity in the world with a count of who holds it.
   *
   * Published rather than read on demand, because the map-layer key is a React
   * component and the registry is mutated by the simulation — the first version
   * read it once per render and showed a stale key indefinitely, since nothing
   * re-rendered when a schism minted a new culture.
   */
  private identityRows(): IdentityRow[] {
    const holders = new Map<string, number>();
    const note = (id: string | null | undefined) => {
      if (id) holders.set(id, (holders.get(id) ?? 0) + 1);
    };
    for (const entity of this.entities.getAllEntities()) {
      note(entity.cultureId);
      note(entity.languageId);
      note(entity.religionId);
    }

    const rows: IdentityRow[] = [];
    for (const kind of ['culture', 'language', 'religion'] as MetaKind[]) {
      for (const meta of allMetas(kind)) {
        rows.push({
          id: meta.id,
          kind,
          name: meta.name,
          colorHex: meta.colorHex,
          holders: holders.get(meta.id) ?? 0,
        });
      }
    }
    // Most-held first, so the key opens with whoever actually dominates.
    return rows.sort((a, b) => b.holders - a.holders);
  }

  /** Live schemes, flattened for the register. */
  private plotSummaries(): PlotSummary[] {
    const rows: PlotSummary[] = [];
    for (const plot of this.plots.values()) {
      const plotter = this.entities.getEntityById(plot.plotterId);
      if (!plotter) continue;
      const def = PLOTS[plot.kind];
      rows.push({
        id: plot.id,
        kind: plot.kind,
        label: def.label,
        description: def.description,
        glyph: def.glyph,
        plotterName: plotter.name,
        subjectName: this.villages.get(plot.subjectId)?.name
          ?? this.kingdoms.get(plot.subjectId)?.name
          ?? 'somewhere',
        targetName: plot.targetKingdomId
          ? this.kingdoms.get(plot.targetKingdomId)?.name ?? null
          : null,
        share: Math.max(0, Math.min(1, plot.progress / def.target)),
        age: plot.age,
        conspirators: plot.conspirators,
        hostile: def.hostile,
        x: Math.floor(plotter.position.x),
        y: Math.floor(plotter.position.y),
      });
    }
    // Furthest along first: the one about to fire is the one worth acting on.
    return rows.sort((a, b) => b.share - a.share);
  }

  private plotRound(delta: number): void {
    // Advance and resolve what is already running, before starting anything
    // new — otherwise a plot could be created and fire in the same pass, which
    // defeats the entire purpose of a plot being visible in advance.
    for (const [id, plot] of [...this.plots]) {
      const plotter = this.entities.getEntityById(plot.plotterId);
      if (!plotter || plotter.health <= 0) {
        this.plots.delete(id);
        continue;
      }

      plot.age += delta;
      const learned = groupHasCultureTrait(plotter.villageId, 'scholarly') ? 1.4 : 1;
      plot.progress += plotRate(plot, civilStats(plotter)) * learned * delta;

      if (plotReady(plot)) {
        this.plots.delete(id);
        this.resolvePlot(plot, plotter);
      }
    }

    this.considerNewPlots();

    this.plotterIds.clear();
    for (const plot of this.plots.values()) this.plotterIds.add(plot.plotterId);
  }

  /** Who has a reason to be scheming, and about what. */
  private considerNewPlots(): void {
    const plotting = new Set(Array.from(this.plots.values()).map(plot => plot.plotterId));
    const members = this.entities.getEntitiesByVillage();

    for (const kingdom of this.kingdoms.values()) {
      // A governor with an unhappy province starts thinking about leaving.
      for (const villageId of kingdom.villageIds) {
        const village = this.villages.get(villageId);
        if (!village || village.capital) continue;
        const leader = this.villageLeader(village);
        if (!leader || plotting.has(leader.id)) continue;

        const loyalty = village.loyalty?.score ?? 100;
        // Started well above the rebellion threshold, so the icon appears
        // before the province is already lost. This is the whole point: a
        // warning, not an obituary.
        if (loyalty < 25 && Math.random() < 0.4) {
          this.startPlot('rebellion', leader, village.id, null);
          plotting.add(leader.id);
          continue;
        }

        // A town far from the capital, or one whose culture encourages thinking
        // for itself, may decide it is its own people. This is the only way a
        // *new* identity comes into the world after founding — the pot mechanic
        // can spread cultures but cannot invent them.
        const residents = members.get(village.id)?.length ?? 0;
        const inclined = groupHasCultureTrait(village.id, 'scholarly');
        if (
          residents >= 6
          && (loyalty < 55 || inclined)
          && Math.random() < (inclined ? 0.18 : 0.08)
        ) {
          this.startPlot('schism', leader, village.id, null);
          plotting.add(leader.id);
        }
      }

      const king = kingdom.kingId ? this.entities.getEntityById(kingdom.kingId) : null;
      if (!king || plotting.has(king.id)) continue;
      const stats = civilStats(king);

      // A king at war looks for a way out if he is not a fighter, and presses
      // on if he is.
      const enemies = Array.from(kingdom.atWar);
      if (enemies.length > 0) {
        if (stats.diplomacy > stats.warfare && Math.random() < 0.5) {
          this.startPlot('peace', king, kingdom.id, enemies[0]);
          plotting.add(king.id);
          continue;
        }
      } else if (this.laws.warfare) {
        // Otherwise a warlike king finds somebody to resent, and a diplomat
        // finds somebody to bind.
        const neighbour = this.mostTenseNeighbour(kingdom);
        if (neighbour) {
          if (stats.warfare >= 7 && Math.random() < 0.3) {
            this.startPlot('war', king, kingdom.id, neighbour.id);
            plotting.add(king.id);
            continue;
          }
          if (stats.diplomacy >= 7 && Math.random() < 0.3) {
            this.startPlot('alliance', king, kingdom.id, neighbour.id);
            plotting.add(king.id);
            continue;
          }
        }
      }

      // A capable steward with a miserable realm throws a party instead.
      const misery = this.averageMoodOf(kingdom);
      if (misery < -20 && stats.stewardship >= 6 && Math.random() < 0.35) {
        this.startPlot('festival', king, kingdom.id, null);
        plotting.add(king.id);
      }
    }
  }

  private startPlot(
    kind: PlotKind, plotter: Entity, subjectId: string, targetKingdomId: string | null,
  ): void {
    const plot = createPlot(kind, plotter, subjectId, targetKingdomId);
    // Anybody nearby who feels the same way joins in, which speeds it up. This
    // is why a village that is uniformly wretched rebels faster than one with
    // a single disgruntled governor.
    const mood = plotter.happiness ?? 0;
    plot.conspirators = 1 + this.entities
      .query(plotter.position.x, plotter.position.y, 6)
      .filter(other => other.id !== plotter.id
        && other.villageId === plotter.villageId
        && Math.abs((other.happiness ?? 0) - mood) < 30).length;

    this.plots.set(plot.id, plot);
  }

  private resolvePlot(plot: Plot, plotter: Entity): void {
    const def = PLOTS[plot.kind];
    switch (plot.kind) {
      case 'rebellion': {
        const village = this.villages.get(plot.subjectId);
        const kingdom = village ? this.kingdoms.get(village.kingdomId) : null;
        // A plot that comes off skips the patience timer entirely: the whole
        // point of scheming is that it is faster than waiting to be unhappy.
        if (village && kingdom && !village.capital) this.secede(village, kingdom);
        return;
      }
      case 'coup': {
        const kingdom = this.kingdoms.get(plot.subjectId);
        if (!kingdom) return;
        const deposed = kingdom.kingId ? this.entities.getEntityById(kingdom.kingId) : null;
        if (deposed) this.clearOffices(deposed);
        kingdom.kingId = plotter.id;
        kingdom.ruler = plotter.name;
        applyStatus(plotter, 'king');
        applyScenario(plotter, 'crowned');
        this.events.onEvent(
          chronicle('coup', { name: plotter.name, a: kingdom.name, b: deposed?.name ?? 'the throne' }),
          'kingdom',
          { x: Math.floor(plotter.position.x), y: Math.floor(plotter.position.y) },
        );
        return;
      }
      case 'war': {
        const a = this.kingdoms.get(plot.subjectId);
        const b = plot.targetKingdomId ? this.kingdoms.get(plot.targetKingdomId) : null;
        if (a && b && !a.atWar.has(b.id)) this.declareWar(a, b);
        return;
      }
      case 'peace': {
        const a = this.kingdoms.get(plot.subjectId);
        const b = plot.targetKingdomId ? this.kingdoms.get(plot.targetKingdomId) : null;
        if (a && b && a.atWar.has(b.id)) this.makePeace(a, b);
        return;
      }
      case 'alliance': {
        const a = this.kingdoms.get(plot.subjectId);
        const b = plot.targetKingdomId ? this.kingdoms.get(plot.targetKingdomId) : null;
        if (!a || !b) return;
        a.allies.add(b.id);
        b.allies.add(a.id);
        a.tension.set(b.id, 0);
        b.tension.set(a.id, 0);
        this.events.onEvent(chronicle('alliance', { a: a.name, b: b.name }), 'kingdom');
        return;
      }
      case 'schism': {
        const village = this.villages.get(plot.subjectId);
        if (!village) return;
        const before = groupMetas(village.id);
        if (!before) return;

        // A new culture always; a new faith only sometimes, because a people
        // splitting off usually keeps its gods for a while.
        const culture = mintMeta('culture');
        const religion = Math.random() < 0.45 ? mintMeta('religion') : null;
        const after = {
          culture: culture.id,
          language: before.language,
          religion: religion?.id ?? before.religion,
        };
        setGroupMetas(village.id, after);

        for (const resident of this.entities.getAllEntities()) {
          if (resident.villageId !== village.id) continue;
          setMetaOf(resident, 'culture', after.culture);
          if (religion) setMetaOf(resident, 'religion', after.religion);
        }

        this.events.onEvent(
          chronicle('schism', { name: village.name, a: culture.name }),
          'kingdom',
          { x: village.centerX, y: village.centerY },
        );
        // The map is now showing something different, if the player is looking
        // through an identity layer.
        this.repaintAllTerritory();
        this.publishSummaries();
        return;
      }

      case 'festival': {
        const kingdom = this.kingdoms.get(plot.subjectId);
        if (!kingdom) return;
        for (const resident of this.entities.getAllEntities()) {
          if (resident.kingdomId !== kingdom.id) continue;
          applyScenario(resident, 'healed');
        }
        this.events.onEvent(
          chronicle('festival', { a: kingdom.name, name: plotter.name }), 'kingdom',
        );
        return;
      }
      default: {
        // Exhaustive above; this keeps a new PlotKind from failing silently.
        void def;
        return;
      }
    }
  }

  private mostTenseNeighbour(kingdom: Kingdom): Kingdom | null {
    let best: Kingdom | null = null;
    let bestTension = 0.25;
    for (const [id, tension] of kingdom.tension) {
      if (kingdom.allies.has(id)) continue;
      if (tension <= bestTension) continue;
      const other = this.kingdoms.get(id);
      if (!other) continue;
      best = other;
      bestTension = tension;
    }
    return best;
  }

  private averageMoodOf(kingdom: Kingdom): number {
    let total = 0;
    let count = 0;
    for (const entity of this.entities.getAllEntities()) {
      if (entity.kingdomId !== kingdom.id) continue;
      total += entity.happiness ?? 0;
      count += 1;
    }
    return count === 0 ? 0 : total / count;
  }

  // -- diplomacy and war -------------------------------------------------

  // -- growth and colonisation -------------------------------------------

  /**
   * WorldBox's claim_land: leaders push their borders outward over time, so a
   * settlement's territory visibly creeps rather than only jumping when a
   * building appears. How far it can reach is capped by how built-up it is.
   */
  private expansionRound(): void {
    for (const village of Array.from(this.villages.values())) {
      // A settlement nobody lives in is not a settlement. Let it go rather
      // than leaving dead borders painted across the map.
      const residents = this.residentsOf(village).length;
      if (residents === 0) {
        village.emptyFor += 10;
        if (village.emptyFor >= 25) {
          this.abandonVillage(village);
          continue;
        }
      } else {
        village.emptyFor = 0;
      }

      const ceiling = Math.min(5, Math.floor(village.buildings.length / 3));
      if (village.claimBonus >= ceiling) continue;
      village.claimBonus += 1;
      this.claimTerritory(village);
    }
  }

  /** Tear down an empty village and give its land back to the wilderness. */
  private abandonVillage(village: Village): void {
    this.releaseVillage(village);
    this.events.onEvent(
      chronicle('village_abandoned', { name: village.name }),
      'kingdom',
      { x: village.centerX, y: village.centerY },
    );
  }

  /**
   * Kingdoms grow by sending people out, not by inflating one village. A
   * settled village with people to spare picks a site a good walk away and
   * sends a party; the new village is founded when they arrive, so the player
   * watches it happen (research doc section 3).
   */
  private colonyRound(_delta: number): void {
    for (const kingdom of this.kingdoms.values()) {
      if (kingdom.atWar.size > 0) continue; // nobody colonises mid-war
      const king = this.kingCivilStats(kingdom);
      const limit = governableVillages(king)
        + (EXPANSION_APPETITE[kingdom.race] ?? 0)
        + OVERREACH_ALLOWANCE
        + (groupHasCultureTrait(kingdom.id, 'expansionist') ? 2 : 0);
      const pending = Array.from(this.parties.values())
        .filter(party => party.kingdomId === kingdom.id).length;
      // One expedition at a time: three parties leaving at once empties the
      // capital and none of the colonies gets enough people to survive.
      if (pending > 0) continue;
      if (kingdom.villageIds.length + pending >= limit) continue;

      if (groupHasCultureTrait(kingdom.id, 'insular')) continue;

      const source = this.pickSettlerSource(kingdom);
      if (!source) continue;

      const site = this.findSettlementSite(source);
      if (!site) continue;

      this.sendSettlers(kingdom, source, site);
    }
  }

  /** A village old enough and populous enough to spare a few people. */
  private pickSettlerSource(kingdom: Kingdom): Village | null {
    let best: Village | null = null;
    let bestPopulation = 0;

    for (const villageId of kingdom.villageIds) {
      const village = this.villages.get(villageId);
      if (!village) continue;
      // Don't hollow out a village that is still finding its feet
      if (village.age < 25) continue;
      const residents = this.residentsOf(village);
      // Every reachable village has to be established before the kingdom
      // spreads further — WorldBox blocks expansion while any of them is small.
      if (residents.length < SETTLER_SOURCE_POPULATION) return null;
      // Deliberately no granary requirement: a busy village feeds its stores
      // to its people, so a food gate would mean only *poor* villages colonise.
      if (residents.length > bestPopulation) {
        bestPopulation = residents.length;
        best = village;
      }
    }
    return best;
  }

  private residentsOf(village: Village): Entity[] {
    return this.entities.getAllEntities()
      .filter(entity => entity.villageId === village.id);
  }

  /** Somewhere habitable, unclaimed, and far enough from every other village. */
  private findSettlementSite(source: Village): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestScore = -Infinity;

    for (let attempt = 0; attempt < 90; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = MIN_VILLAGE_SPACING + Math.random() * (SETTLE_RANGE - MIN_VILLAGE_SPACING);
      const x = Math.round(source.centerX + Math.cos(angle) * distance);
      const y = Math.round(source.centerY + Math.sin(angle) * distance);

      const tile = this.tileAt(x, y);
      if (!tile) continue;
      if (isWaterBiome(tile.type) || tile.height < 0.28) continue;
      if (tile.type === 'mountains' || tile.type === 'snow' || tile.type === 'volcanic') continue;
      if (tile.ownerId && tile.ownerId !== source.kingdomId) continue;
      if (tile.villageId) continue;
      if (this.tooCloseToVillage(x, y)) continue;

      // Prefer fertile, unclaimed ground reasonably near home
      const score = tile.fertility * 3
        + (tile.ownerId === source.kingdomId ? 0.5 : 0)
        - distance / SETTLE_RANGE;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
    return best;
  }

  private sendSettlers(kingdom: Kingdom, source: Village, site: { x: number; y: number }): void {
    const residents = this.residentsOf(source)
      .filter(entity => entity.age > entity.maxAge * 0.2 && entity.health > entity.maxHealth * 0.5);
    if (residents.length < SETTLER_SOURCE_POPULATION) return;

    // Never send so many that the source village cannot look after itself
    const spare = Math.max(0, residents.length - SETTLER_SOURCE_POPULATION + 1);
    const size = Math.min(
      spare,
      SETTLER_PARTY_MIN + Math.floor(Math.random() * (SETTLER_PARTY_MAX - SETTLER_PARTY_MIN + 1)),
    );
    if (size < SETTLER_PARTY_MIN) return;
    const party: SettlerParty = {
      id: mintId('party'),
      kingdomId: kingdom.id,
      sourceVillageId: source.id,
      target: site,
      memberIds: new Set(),
      timeout: SETTLE_TIMEOUT,
    };

    for (const settler of residents.slice(0, size)) {
      settler.villageId = null;
      settler.job = null;
      this.clearOffices(settler);
      party.memberIds.add(settler.id);
      this.entities.giveOrder(settler, {
        kind: 'goto',
        x: site.x,
        y: site.y,
        purpose: 'settle',
      });
    }

    if (party.memberIds.size === 0) return;
    this.parties.set(party.id, party);
    this.events.onEvent(
      chronicle('settlers_leave', { name: source.name }),
      'kingdom',
      { x: source.centerX, y: source.centerY },
    );
  }

  /** Abandon parties that never made it, and send their people home. */
  private ageParties(delta: number): void {
    for (const party of Array.from(this.parties.values())) {
      party.timeout -= delta;

      for (const id of Array.from(party.memberIds)) {
        if (!this.entities.getEntityById(id)) party.memberIds.delete(id);
      }

      if (party.memberIds.size > 0 && party.timeout > 0) continue;

      // Give up: survivors rejoin whichever settlement will take them
      for (const id of party.memberIds) {
        const settler = this.entities.getEntityById(id);
        if (settler) settler.kingdomId = party.kingdomId;
      }
      this.parties.delete(party.id);
    }
  }

  /** A settler reached the site. If it is still viable, the village is founded. */
  private foundColony(settler: Entity, party: SettlerParty): void {
    const tile = this.tileAt(party.target.x, party.target.y);
    const kingdom = this.kingdoms.get(party.kingdomId);

    if (!tile || !kingdom || tile.villageId || this.tooCloseToVillage(tile.x, tile.y)) {
      // Site spoiled while they walked — dissolve the party
      for (const id of party.memberIds) {
        const member = this.entities.getEntityById(id);
        if (member) member.kingdomId = party.kingdomId;
      }
      this.parties.delete(party.id);
      return;
    }

    const founders = Array.from(party.memberIds)
      .map(id => this.entities.getEntityById(id))
      .filter((member): member is Entity => Boolean(member));

    const village = this.createVillage(kingdom, tile, founders);
    this.parties.delete(party.id);

    const source = this.villages.get(party.sourceVillageId);
    this.events.onEvent(
      source
        ? chronicle('village_settled_from', { name: village.name, a: source.name })
        : chronicle('village_founded', { name: village.name }),
      'kingdom',
      { x: tile.x, y: tile.y },
    );
    void settler;
  }

  /**
   * Measure how much territory each pair of kingdoms shares a border with,
   * grow friction accordingly, and declare war when it boils over.
   */
  private diplomacyRound(): void {
    const contact = new Map<string, number>();

    for (const village of this.villages.values()) {
      for (const id of village.territory) {
        const tile = this.tileFromInstanceId(id);
        if (!tile?.ownerId) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const neighbour = this.tileAt(tile.x + dx, tile.y + dy);
          if (!neighbour?.ownerId || neighbour.ownerId === tile.ownerId) continue;
          const key = pairKey(tile.ownerId, neighbour.ownerId);
          contact.set(key, (contact.get(key) ?? 0) + 1);
        }
      }
    }

    for (const [key, borderTiles] of contact) {
      const [aId, bId] = key.split('|');
      const a = this.kingdoms.get(aId);
      const b = this.kingdoms.get(bId);
      if (!a || !b || a.atWar.has(bId)) continue;

      // Orcs pick fights sooner; a long shared border makes it worse.
      const aggression = a.race === 'orc' || b.race === 'orc' ? 0.11 : 0.055;
      const growth = aggression * Math.min(3, borderTiles / 10);
      const tension = Math.min(1.2, (a.tension.get(bId) ?? 0) + growth);
      a.tension.set(bId, tension);
      b.tension.set(aId, tension);

      if (tension >= 1) this.declareWar(a, b);
    }

    // Distance cools old grudges
    for (const kingdom of this.kingdoms.values()) {
      for (const [otherId, value] of kingdom.tension) {
        if (value <= 0) continue;
        if (contact.has(pairKey(kingdom.id, otherId))) continue;
        kingdom.tension.set(otherId, Math.max(0, value - 0.04));
      }
    }

    this.warRound();
  }

  private declareWar(a: Kingdom, b: Kingdom): void {
    a.atWar.add(b.id);
    b.atWar.add(a.id);
    a.tension.set(b.id, 1);
    b.tension.set(a.id, 1);
    this.warTimers.set(pairKey(a.id, b.id), 0);

    const capital = this.villages.get(a.villageIds[0]);
    this.events.onEvent(
      chronicle('war_declared', { a: a.name, b: b.name }),
      'war',
      capital ? { x: capital.centerX, y: capital.centerY } : undefined,
    );
    // A war starting is one of maybe four things in this simulation worth
    // interrupting the player for.
    requestFlash('blood', 0.8);
  }

  private makePeace(a: Kingdom, b: Kingdom): void {
    a.atWar.delete(b.id);
    b.atWar.delete(a.id);
    a.tension.set(b.id, 0.25);
    b.tension.set(a.id, 0.25);
    this.warTimers.delete(pairKey(a.id, b.id));
    this.events.onEvent(chronicle('peace', { a: a.name, b: b.name }), 'war');
  }

  /** Send warbands at the enemy, and time wars out into peace. */
  private warRound(): void {
    const warriorsByKingdom = new Map<string, Entity[]>();
    for (const entity of this.entities.getAllEntities()) {
      if (entity.job !== 'warrior' || !entity.kingdomId) continue;
      const list = warriorsByKingdom.get(entity.kingdomId);
      if (list) list.push(entity);
      else warriorsByKingdom.set(entity.kingdomId, [entity]);
    }

    for (const kingdom of this.kingdoms.values()) {
      for (const enemyId of kingdom.atWar) {
        const enemy = this.kingdoms.get(enemyId);
        if (!enemy) {
          kingdom.atWar.delete(enemyId);
          continue;
        }
        if (kingdom.id > enemy.id) continue; // handle each pair once

        const key = pairKey(kingdom.id, enemy.id);
        const rounds = (this.warTimers.get(key) ?? 0) + 1;
        this.warTimers.set(key, rounds);

        // Wars burn out, or end when one side has nothing left to lose
        if (rounds > 14 || enemy.villageIds.length === 0 || kingdom.villageIds.length === 0) {
          this.makePeace(kingdom, enemy);
          continue;
        }

        this.sendRaid(kingdom, enemy, warriorsByKingdom.get(kingdom.id) ?? []);
        this.sendRaid(enemy, kingdom, warriorsByKingdom.get(enemy.id) ?? []);
      }
    }
  }

  private sendRaid(_attacker: Kingdom, defender: Kingdom, warriors: Entity[]): void {
    if (warriors.length === 0) return;

    // Only captains are given marching orders; their warband is anchored to
    // them by appointCaptain, so the army moves as one body.
    for (const warrior of warriors) {
      const nearbyEnemy = this.entities
        .query(warrior.position.x, warrior.position.y, 6)
        .find(other => other.kingdomId === defender.id);
      if (nearbyEnemy) {
        this.entities.setHerdAnchor(warrior, null);
        this.entities.engage(warrior, nearbyEnemy);
        continue;
      }

      const leadsTheMarch = warrior.status.includes('captain');
      if (!leadsTheMarch) continue;

      const target = this.nearestVillage(defender, warrior.position.x, warrior.position.y);
      if (!target) continue;
      this.entities.giveOrder(warrior, {
        kind: 'goto',
        x: target.centerX,
        y: target.centerY,
        purpose: 'raid',
      });
    }
  }

  private nearestVillage(kingdom: Kingdom, x: number, y: number): Village | null {
    let best: Village | null = null;
    let bestDistance = Infinity;
    for (const villageId of kingdom.villageIds) {
      const village = this.villages.get(villageId);
      if (!village) continue;
      const distance = Math.hypot(village.centerX - x, village.centerY - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = village;
      }
    }
    return best;
  }

  /**
   * Enemy warriors standing on a village tear its buildings down. Losing the
   * bonfire ends the settlement; losing every settlement ends the kingdom.
   */
  private resolveSieges(): void {
    for (const village of Array.from(this.villages.values())) {
      const kingdom = this.kingdoms.get(village.kingdomId);
      if (!kingdom) continue;

      for (const building of Array.from(village.buildings)) {
        const attackers = this.entities
          .query(building.x + 0.5, building.y + 0.5, 1.6)
          .filter(entity => entity.kingdomId
            && entity.kingdomId !== kingdom.id
            && this.atWar(kingdom.id, entity.kingdomId));
        if (attackers.length === 0) continue;

        building.health -= 18 * attackers.length;
        if (building.health > 0) continue;

        this.removeBuilding(village, building);
        if (building.kind === 'bonfire') {
          this.destroyVillage(village, attackers[0]?.kingdomId ?? null);
          break;
        }
        // Raiders torch what they level
        if (Math.random() < 0.5) simulation.igniteTile?.(building.x, building.y);
      }
    }

    // Kingdoms with no settlements left pass into history
    for (const kingdom of Array.from(this.kingdoms.values())) {
      if (kingdom.villageIds.length > 0) continue;
      this.events.onEvent(chronicle('kingdom_fallen', { a: kingdom.name }), 'war');
      requestFlash('blood', 1);
      for (const entity of this.entities.getAllEntities()) {
        if (entity.kingdomId === kingdom.id) {
          entity.kingdomId = null;
          entity.villageId = null;
          entity.job = null;
        }
      }
      for (const other of this.kingdoms.values()) {
        other.atWar.delete(kingdom.id);
        other.tension.delete(kingdom.id);
      }
      this.kingdoms.delete(kingdom.id);
    }
  }

  private destroyVillage(village: Village, conquerorId: string | null): void {
    this.releaseVillage(village);

    const conqueror = conquerorId ? this.kingdoms.get(conquerorId) : null;
    this.events.onEvent(
      conqueror
        ? `${village.name} is razed by ${conqueror.name}`
        : `${village.name} is razed`,
      'war',
      { x: village.centerX, y: village.centerY },
    );
  }

  /**
   * Common teardown: buildings gone, land unclaimed, residents freed, village
   * struck from its kingdom. Used by conquest and by abandonment alike.
   */
  private releaseVillage(village: Village): void {
    // A village that no longer exists is not an institution any more, and
    // leaving its identity in the registry means the loyalty formula keeps
    // comparing live provinces against a ghost.
    forgetGroup(village.id);

    for (const building of Array.from(village.buildings)) {
      this.removeBuilding(village, building);
    }

    for (const id of village.territory) {
      const tile = this.tileFromInstanceId(id);
      if (!tile) continue;
      tile.ownerId = null;
      this.terrain.syncOwnership(tile, null);
    }
    village.territory.clear();

    for (const entity of this.entities.getAllEntities()) {
      if (entity.villageId !== village.id) continue;
      entity.villageId = null;
      entity.job = null;
      this.clearOffices(entity);
    }

    // Any expedition it had underway dies with it
    for (const party of Array.from(this.parties.values())) {
      if (party.sourceVillageId === village.id) this.parties.delete(party.id);
    }
    this.captains.delete(village.id);
    this.leaders.delete(village.id);

    const kingdom = this.kingdoms.get(village.kingdomId);
    if (kingdom) {
      const index = kingdom.villageIds.indexOf(village.id);
      if (index !== -1) kingdom.villageIds.splice(index, 1);
      // The crown passes to whatever settlement is left
      if (village.capital) {
        const heir = kingdom.villageIds
          .map(id => this.villages.get(id))
          .find((candidate): candidate is Village => Boolean(candidate));
        if (heir) heir.capital = true;
      }
    }
    this.villages.delete(village.id);
  }

  // -- save / restore ----------------------------------------------------

  /** Rebuild settlements and kingdoms from a save (see saveSystem.ts). */
  restore(savedKingdoms: SavedKingdom[], savedVillages: SavedVillage[]): void {
    // Keep the shared counter ahead of every id the save mentions, so newly
    // founded villages can never collide with restored ones.
    const trackId = (id: string) => {
      const numeric = Number(id.split('-').pop());
      if (Number.isFinite(numeric) && numeric >= nextIdentifier) nextIdentifier = numeric + 1;
    };

    for (const saved of savedKingdoms) {
      trackId(saved.id);
      this.kingdoms.set(saved.id, {
        id: saved.id,
        name: saved.name,
        ruler: saved.ruler,
        race: saved.race,
        colorHex: saved.colorHex,
        color: new THREE.Color(saved.colorHex),
        villageIds: [...saved.villageIds],
        atWar: new Set(saved.atWar),
        tension: new Map(saved.tension),
        allies: new Set(),
        // Restored kingdoms start past the new-kingdom loyalty honeymoon: a
        // loaded save is an established realm, not a freshly declared one.
        age: 600,
      });
    }

    for (const saved of savedVillages) {
      trackId(saved.id);
      const village: Village = {
        id: saved.id,
        name: saved.name,
        kingdomId: saved.kingdomId,
        race: saved.race,
        centerX: saved.centerX,
        centerY: saved.centerY,
        buildings: [],
        store: { ...saved.store },
        territory: new Set(),
        founded: { year: 0, season: simulation.season },
        capital: saved.capital ?? false,
        claimBonus: saved.claimBonus ?? 0,
        age: 600,
        emptyFor: 0,
        restless: 0,
      };
      this.villages.set(village.id, village);

      for (const building of saved.buildings) {
        trackId(building.id);
        this.placeBuilding(village, building.kind, building.x, building.y);
        const restored = village.buildings[village.buildings.length - 1];
        if (restored) {
          restored.id = building.id;
          restored.health = building.health;
          restored.maxHealth = building.maxHealth;
        }
      }
      this.claimTerritory(village);
    }

    // Identities are minted at founding, and a restored world was never
    // founded — so without this every loaded save comes back with no culture,
    // no language and no faith. The loyalty formula would skip its three
    // identity factors and the culture layer would be a grey map, which is a
    // quiet, confusing kind of broken.
    for (const kingdom of this.kingdoms.values()) {
      if (groupMetas(kingdom.id)) continue;
      const minted = {
        culture: mintMeta('culture').id,
        language: mintMeta('language').id,
        religion: mintMeta('religion').id,
      };
      setGroupMetas(kingdom.id, minted);
      for (const villageId of kingdom.villageIds) {
        setGroupMetas(villageId, minted);
      }
      for (const entity of this.entities.getAllEntities()) {
        if (entity.kingdomId !== kingdom.id) continue;
        setMetaOf(entity, 'culture', minted.culture);
        setMetaOf(entity, 'language', minted.language);
        setMetaOf(entity, 'religion', minted.religion);
      }
    }

    this.publishSummaries();
  }

  /** Snapshot for the save system. */
  snapshot(): { villages: Village[]; kingdoms: Kingdom[] } {
    return {
      villages: Array.from(this.villages.values()),
      kingdoms: Array.from(this.kingdoms.values()),
    };
  }

  /** Human-readable village details for the inspector. */
  describeVillage(x: number, y: number) {
    const village = this.villageAt(x, y) ?? this.villageNear(x, y);
    if (!village) return null;
    const kingdom = this.kingdoms.get(village.kingdomId);
    return {
      name: village.name,
      kingdomName: kingdom?.name ?? 'No kingdom',
      kingdomColor: kingdom?.colorHex ?? '#888888',
      race: village.race,
      store: { ...village.store },
      buildings: village.buildings.length,
      territory: village.territory.size,
      capital: village.capital,
      // The breakdown, not just the number. A rebellion the player cannot see
      // coming is indistinguishable from a bug.
      // Identity, resolved to names so the panel never touches the registry.
      identity: (() => {
        const set = groupMetas(village.id);
        const culture = metaById(set?.culture);
        return {
          culture: culture?.name ?? null,
          cultureColor: culture?.colorHex ?? null,
          cultureTraits: culture?.traits ?? [],
          language: metaById(set?.language)?.name ?? null,
          religion: metaById(set?.religion)?.name ?? null,
        };
      })(),
      loyalty: village.loyalty?.score ?? null,
      loyaltyFactors: village.loyalty?.factors ?? [],
      restless: village.restless,
      /** Seconds until this province secedes, or null if it is settled. */
      secedesIn: village.restless > 0
        ? Math.max(0, REBELLION_PATIENCE - village.restless)
        : null,
      ruler: kingdom?.ruler ?? null,
      rulerStats: kingdom ? this.kingCivilStats(kingdom) : null,
    };
  }

  /** The village whose claim covers this tile, if any. */
  villageNear(x: number, y: number): Village | null {
    const tile = this.tileAt(x, y);
    if (!tile?.ownerId) return null;
    const id = this.instanceId(tile);
    for (const village of this.villages.values()) {
      if (village.territory.has(id)) return village;
    }
    return null;
  }

  // -- reporting ---------------------------------------------------------

  private publishSummaries(): void {
    const populations = this.entities.getEntitiesByKingdom();
    const summaries: KingdomSummary[] = [];

    for (const kingdom of this.kingdoms.values()) {
      let territory = 0;
      for (const villageId of kingdom.villageIds) {
        territory += this.villages.get(villageId)?.territory.size ?? 0;
      }
      summaries.push({
        id: kingdom.id,
        name: kingdom.name,
        race: kingdom.race,
        color: kingdom.colorHex,
        population: populations.get(kingdom.id)?.length ?? 0,
        villages: kingdom.villageIds.length,
        territory,
        atWarWith: Array.from(kingdom.atWar)
          .map(id => this.kingdoms.get(id)?.name ?? '')
          .filter(Boolean),
      });
    }

    summaries.sort((a, b) => b.territory - a.territory);
    this.events.onKingdomsChanged(summaries);

    // Villages, flattened the same way. Pre-computed rather than exposing the
    // live Village objects: the panel re-renders on a React schedule and the
    // simulation does not, and handing React a mutable Set it will iterate on
    // its own timetable is how you get a torn read.
    const villageRows: VillageSummary[] = [];
    const memberCounts = new Map<string, number>();
    for (const entity of this.entities.getAllEntities()) {
      if (!entity.villageId) continue;
      memberCounts.set(entity.villageId, (memberCounts.get(entity.villageId) ?? 0) + 1);
    }

    for (const village of this.villages.values()) {
      const kingdom = this.kingdoms.get(village.kingdomId);
      villageRows.push({
        id: village.id,
        name: village.name,
        kingdomName: kingdom?.name ?? 'Unaffiliated',
        color: kingdom?.colorHex ?? '#94a3b8',
        capital: village.capital,
        population: memberCounts.get(village.id) ?? 0,
        buildings: village.buildings.length,
        territory: village.territory.size,
        x: village.centerX,
        y: village.centerY,
        loyalty: village.loyalty?.score ?? null,
        secedesIn: village.restless > 0
          ? Math.max(0, REBELLION_PATIENCE - village.restless)
          : null,
      });
    }
    // Restless provinces first: a town about to secede is the most interesting
    // row in the list, and burying it under the biggest towns hides the story.
    this.events.onPlotsChanged?.(this.plotSummaries());
    this.events.onIdentitiesChanged?.(this.identityRows());

    villageRows.sort((a, b) => {
      if ((a.secedesIn === null) !== (b.secedesIn === null)) return a.secedesIn === null ? 1 : -1;
      if (a.secedesIn !== null && b.secedesIn !== null) return a.secedesIn - b.secedesIn;
      return b.population - a.population || b.territory - a.territory;
    });
    this.events.onVillagesChanged?.(villageRows);
  }

  atWar(a?: string | null, b?: string | null): boolean {
    if (!a || !b || a === b) return false;
    return this.kingdoms.get(a)?.atWar.has(b) ?? false;
  }

  // -- helpers -----------------------------------------------------------

  private tileAt(x: number, y: number): Tile | null {
    if (x < 0 || x >= this.tiles.length || y < 0 || y >= this.tiles[0].length) return null;
    return this.tiles[x][y];
  }

  private instanceId(tile: Tile): number {
    return tile.instanceId ?? this.terrain.instanceIdFor(tile.x, tile.y);
  }

  private tileFromInstanceId(id: number): Tile | null {
    const { x, y } = this.terrain.tileCoordsFromInstanceId(id);
    return this.tileAt(x, y);
  }

  /** The bonfire of a unit's village — where its people gather to talk. */
  gatheringPointFor(entity: Entity): { x: number; y: number } | null {
    if (!entity.villageId) return null;
    const village = this.villages.get(entity.villageId);
    if (!village) return null;
    const bonfire = village.buildings.find(building => building.kind === 'bonfire');
    return bonfire
      ? { x: bonfire.x, y: bonfire.y }
      : { x: village.centerX, y: village.centerY };
  }

  /** Where a unit's village is, used to rescue units that get stranded. */
  homePositionFor(entity: Entity): { x: number; y: number } | null {
    if (!entity.villageId) return null;
    const village = this.villages.get(entity.villageId);
    if (!village) return null;
    return { x: village.centerX, y: village.centerY };
  }

  /**
   * Everything the map wants to label: one entry per village, plus one per
   * kingdom placed at the centroid of its settlements.
   */
  labelTargets(): Array<{
    id: string;
    kind: 'kingdom' | 'village';
    text: string;
    color: string;
    tileX: number;
    tileY: number;
    capital: boolean;
  }> {
    const targets: Array<{
      id: string;
      kind: 'kingdom' | 'village';
      text: string;
      color: string;
      tileX: number;
      tileY: number;
      capital: boolean;
    }> = [];

    for (const village of this.villages.values()) {
      const kingdom = this.kingdoms.get(village.kingdomId);
      targets.push({
        id: village.id,
        kind: 'village',
        text: village.name,
        color: kingdom?.colorHex ?? '#d8d2c4',
        tileX: village.centerX,
        tileY: village.centerY,
        capital: village.capital,
      });
    }

    for (const kingdom of this.kingdoms.values()) {
      const villages = kingdom.villageIds
        .map(id => this.villages.get(id))
        .filter((village): village is Village => Boolean(village));
      if (villages.length === 0) continue;

      const centreX = villages.reduce((sum, village) => sum + village.centerX, 0) / villages.length;
      const centreY = villages.reduce((sum, village) => sum + village.centerY, 0) / villages.length;
      targets.push({
        id: kingdom.id,
        kind: 'kingdom',
        text: kingdom.name,
        color: kingdom.colorHex,
        tileX: Math.round(centreX),
        tileY: Math.round(centreY),
        capital: false,
      });
    }

    return targets;
  }

  /** Village name by id, for tooltips and the inspector. */
  villageName(id: string): string | null {
    return this.villages.get(id)?.name ?? null;
  }

  /** Kingdom name by id, for tooltips and the inspector. */
  kingdomName(id: string): string | null {
    return this.kingdoms.get(id)?.name ?? null;
  }

  kingdomColorFor(id: string): string | undefined {
    return this.kingdoms.get(id)?.colorHex;
  }

  villageAt(x: number, y: number): Village | null {
    const tile = this.tileAt(x, y);
    if (!tile?.villageId) return null;
    return this.villages.get(tile.villageId) ?? null;
  }

  dispose(): void {
    this.unsubscribeOrders();
    if (simulation.homePositionFor) simulation.homePositionFor = undefined;
    if (simulation.gatheringPointFor) simulation.gatheringPointFor = undefined;
    this.buildingCloud.points.removeFromParent();
    this.buildingCloud.dispose();
    this.villages.clear();
    this.kingdoms.clear();
  }
}
