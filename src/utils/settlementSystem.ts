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
import type { KingdomSummary, WorldLaws } from '../store/gameStore';
import type { EntityManager } from './entityManagerMinimal';
import { getBuildingAtlas } from './pixelAtlas';
import { SpriteCloud } from './spriteCloud';
import type { TerrainRenderer } from './terrainRenderer';
import { registerOrderHandler, simulation } from './simulation';
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

/** Villages a kingdom of each race will grow to before it stops expanding. */
const VILLAGE_LIMIT: Record<Race, number> = {
  human: 5,
  orc: 4,
  elf: 3,
  dwarf: 3,
};

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
        `${kingdom.name} is founded at ${village.name}, led by ${kingdom.ruler}`,
        'kingdom',
        { x: tile.x, y: tile.y },
      );
    } else {
      this.events.onEvent(
        `${village.name} is settled under ${kingdom.name}`,
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
    };
    this.villages.set(village.id, village);
    kingdom.villageIds.push(village.id);

    this.placeBuilding(village, 'bonfire', tile.x, tile.y);

    for (const founder of founders) {
      founder.villageId = village.id;
      founder.kingdomId = kingdom.id;
      founder.job = 'gatherer';
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
        const owner = neighbour.ownerId ? this.kingdoms.get(neighbour.ownerId) : null;
        this.terrain.syncOwnership(neighbour, owner?.color ?? null);
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
      const warriorTarget = members.length >= 8
        ? Math.max(1, Math.round(members.length * (atWar ? 0.4 : 0.15)))
        : 0;
      const foragingNeed = village.store.food > 100 ? 1
        : village.store.food > 60 ? 3
        : village.store.food > 40 ? 5
        : village.store.food > 20 ? 7
        : members.length;
      // Leave room for the warband: without this clamp, everyone is already a
      // gatherer by the time warriors are considered and a village never arms
      // itself at all.
      const gathererTarget = Math.max(0, Math.min(foragingNeed, members.length - warriorTarget));

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
        .query(village.centerX, village.centerY, 8)
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
      leader = eligible.reduce((best, member) => (
        member.attributes.intelligence > best.attributes.intelligence ? member : best
      ), eligible[0]);
      for (const member of members) {
        this.stripStatus(member, 'leader');
        this.stripStatus(member, 'king');
      }
      this.leaders.set(village.id, leader.id);
    }

    const crown = village.capital ? 'king' : 'leader';
    const other = village.capital ? 'leader' : 'king';
    this.stripStatus(leader, other);
    if (!leader.status.includes(crown)) leader.status.push(crown);

    // A kingdom's ruler is now a person, not just a generated name
    if (village.capital) {
      const kingdom = this.kingdoms.get(village.kingdomId);
      if (kingdom) kingdom.kingId = leader.id;
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

    if (!captain.status.includes('captain')) captain.status.push('captain');

    for (const warrior of warriors) {
      if (warrior.id === captain.id) continue;
      this.entities.setHerdAnchor(warrior, captain, 2.5);
    }
  }

  private stripStatus(entity: Entity, status: string): void {
    const index = entity.status.indexOf(status);
    if (index !== -1) entity.status.splice(index, 1);
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
          `${village.name} raises a great hall`,
          'kingdom',
          { x: spot.x, y: spot.y },
        );
      } else if (recipe.kind === 'temple' || recipe.kind === 'statue') {
        this.events.onEvent(
          `${village.name} completes a ${recipe.kind}`,
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

    for (let radius = 1; radius <= maxRadius; radius++) {
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
      `${village.name} stands empty and falls to ruin`,
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
      const limit = VILLAGE_LIMIT[kingdom.race] ?? 3;
      const pending = Array.from(this.parties.values())
        .filter(party => party.kingdomId === kingdom.id).length;
      // One expedition at a time: three parties leaving at once empties the
      // capital and none of the colonies gets enough people to survive.
      if (pending > 0) continue;
      if (kingdom.villageIds.length + pending >= limit) continue;

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
      `Settlers leave ${source.name} to found a new home`,
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
        ? `${village.name} is founded by settlers from ${source.name}`
        : `${village.name} is founded`,
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
      `${a.name} declares war on ${b.name}`,
      'war',
      capital ? { x: capital.centerX, y: capital.centerY } : undefined,
    );
  }

  private makePeace(a: Kingdom, b: Kingdom): void {
    a.atWar.delete(b.id);
    b.atWar.delete(a.id);
    a.tension.set(b.id, 0.25);
    b.tension.set(a.id, 0.25);
    this.warTimers.delete(pairKey(a.id, b.id));
    this.events.onEvent(`${a.name} and ${b.name} agree to peace`, 'war');
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
      this.events.onEvent(`${kingdom.name} has fallen`, 'war');
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
        age: 0,
        emptyFor: 0,
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
