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
import { simulation } from './simulation';
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
}

export interface Kingdom {
  id: string;
  name: string;
  ruler: string;
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

/** How many tiles a single building projects its kingdom's claim. */
const CLAIM_RADIUS: Record<BuildingKind, number> = {
  bonfire: 4, tent: 2, house: 3, hall: 6,
  farm: 2, tower: 5, temple: 5, statue: 4, mine: 2,
};

/** Stable key for a pair of kingdoms, order-independent. */
const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

const SENTIENT_RACES: Race[] = ['human', 'elf', 'dwarf', 'orc'];
const isRace = (value: string): value is Race => SENTIENT_RACES.includes(value as Race);

/** Minimum unaffiliated adults of one race in one place to found a village. */
const FOUNDING_CLUSTER = 3;
const FOUNDING_RADIUS = 5;
const MIN_VILLAGE_SPACING = 11;
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
  private nextId = 1;

  villages = new Map<string, Village>();
  kingdoms = new Map<string, Kingdom>();

  private foundTimer = 0;
  private workTimer = 0;
  private buildTimer = 0;
  private diplomacyTimer = 0;
  private publishTimer = 0;
  private laws: WorldLaws = simulation.laws;
  /** Diplomacy rounds each active war has lasted, keyed by kingdom pair. */
  private warTimers = new Map<string, number>();

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

    const village: Village = {
      id: `village-${this.nextId++}`,
      name: generateVillageName(race),
      kingdomId: kingdom.id,
      race,
      centerX: tile.x,
      centerY: tile.y,
      buildings: [],
      store: { food: 4, wood: 4, stone: 2 },
      territory: new Set(),
      founded: { year: 0, season: simulation.season },
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
      id: `kingdom-${this.nextId++}`,
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
      const radius = CLAIM_RADIUS[building.kind];
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.hypot(dx, dy) > radius) continue;
          const tile = this.tileAt(building.x + dx, building.y + dy);
          if (!tile || isWaterBiome(tile.type)) continue;
          // Never take a tile another kingdom already owns; borders only
          // change through war.
          if (tile.ownerId && tile.ownerId !== kingdom.id) continue;
          claimed.add(this.instanceId(tile));
          tile.ownerId = kingdom.id;
        }
      }
    }

    // Release tiles this village no longer reaches
    for (const id of village.territory) {
      if (claimed.has(id)) continue;
      const tile = this.tileFromInstanceId(id);
      if (tile && tile.ownerId === kingdom.id) tile.ownerId = null;
    }

    const previous = village.territory;
    village.territory = claimed;

    // Repaint the union of old and new plus a one-tile skirt, because border
    // highlighting depends on neighbours.
    const dirty = new Set<number>([...previous, ...claimed]);
    for (const id of dirty) {
      const tile = this.tileFromInstanceId(id);
      if (!tile) continue;
      this.refreshOwnershipAround(tile);
    }
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
        }
        continue;
      }

      const kingdom = this.kingdoms.get(village.kingdomId);
      const atWar = (kingdom?.atWar.size ?? 0) > 0;
      // A quarter of a village fights when at war, one in eight otherwise.
      const warriorTarget = Math.max(1, Math.floor(members.length * (atWar ? 0.35 : 0.12)));
      let warriors = members.filter(m => m.job === 'warrior').length;

      for (const member of members) {
        if (!member.job) member.job = 'gatherer';
        if (member.job !== 'warrior' && warriors < warriorTarget) {
          member.job = 'warrior';
          warriors++;
        } else if (member.job === 'warrior' && warriors > warriorTarget) {
          member.job = 'gatherer';
          warriors--;
        }

        // Loaded gatherers walk their haul back to the village centre
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
        .query(village.centerX, village.centerY, 7)
        .filter(entity => entity.type === village.race && !entity.villageId);
      for (const recruit of recruits) {
        recruit.villageId = village.id;
        recruit.kingdomId = village.kingdomId;
        recruit.job = 'gatherer';
      }
    }
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
      id: `building-${this.nextId++}`,
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

    for (const warrior of warriors) {
      // Fight whatever is already in reach before marching
      const nearbyEnemy = this.entities
        .query(warrior.position.x, warrior.position.y, 6)
        .find(other => other.kingdomId === defender.id);
      if (nearbyEnemy) {
        this.entities.engage(warrior, nearbyEnemy);
        continue;
      }

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
    }

    const kingdom = this.kingdoms.get(village.kingdomId);
    if (kingdom) {
      const index = kingdom.villageIds.indexOf(village.id);
      if (index !== -1) kingdom.villageIds.splice(index, 1);
    }
    this.villages.delete(village.id);

    const conqueror = conquerorId ? this.kingdoms.get(conquerorId) : null;
    this.events.onEvent(
      conqueror
        ? `${village.name} is razed by ${conqueror.name}`
        : `${village.name} is razed`,
      'war',
      { x: village.centerX, y: village.centerY },
    );
  }

  // -- save / restore ----------------------------------------------------

  /** Rebuild settlements and kingdoms from a save (see saveSystem.ts). */
  restore(savedKingdoms: SavedKingdom[], savedVillages: SavedVillage[]): void {
    let highestId = this.nextId;
    const trackId = (id: string) => {
      const numeric = Number(id.split('-').pop());
      if (Number.isFinite(numeric) && numeric >= highestId) highestId = numeric + 1;
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

    this.nextId = highestId;
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

  kingdomColorFor(id: string): string | undefined {
    return this.kingdoms.get(id)?.colorHex;
  }

  villageAt(x: number, y: number): Village | null {
    const tile = this.tileAt(x, y);
    if (!tile?.villageId) return null;
    return this.villages.get(tile.villageId) ?? null;
  }

  dispose(): void {
    this.buildingCloud.points.removeFromParent();
    this.buildingCloud.dispose();
    this.villages.clear();
    this.kingdoms.clear();
  }
}
