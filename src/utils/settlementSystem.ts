// The civilization layer: villages, kingdoms, borders, work and war.
//
// This is the system that turns a wildlife simulation into a world with a
// history. Sentient units that cluster on good land found a village; villages
// claim territory outward from their buildings; villages of one race form a
// kingdom; neighbouring kingdoms build tension and eventually raid each other.
//
// Everything here is driven by the same units the player can inspect — there is
// no separate "civ AI" acting at a distance.
import { isOre, ORE_VALUE } from './oreVeins';
import * as THREE from 'three';
import {
  TILE_SIZE,
  isWaterBiome,
  type Entity,
  type Race,
  type ResourceType,
  type Tile,
} from '../types/world';
import type {
  IdentityRow, KingdomSummary, OpinionRow, VillageSummary, WorldLaws,
} from '../store/gameStore';
import type { EntityManager } from './entityManagerMinimal';
import { getBuildingAtlas } from './pixelAtlas';
import { SpriteCloud } from './spriteCloud';
import { BoatSystem, nearestWater, type Boat, type Point } from './boats';
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
  type MetaKind,
} from './identity';
import type { Plot } from './plots';
import { chronicle } from './chronicle';
import { applyStatus, clearStatus, type StatusId } from './statusEffects';
import {
  civilStats,
  governableVillages,
  leadership,
  type CivilStats,
} from './politics';
import { speak } from './dialogue';
import { emitShot } from './shotBridge';
import { emitDamage } from './floatBridge';
import { MONSTERS } from './entitySystemMinimal';
import { isChild } from './size';
import { buildingSprite, roofSprite } from './pixelAtlas';
import { formationSlots } from './army';
import { foundFaith } from './religion';
import {
  generateKingdomName,
  generateRulerName,
  generateVillageName,
  pickKingdomColor,
  resetKingdomColors,
} from './nameGenerator';
import type { AIOrder } from './entitySystemMinimal';
import type { SavedKingdom, SavedVillage } from './saveSystem';

export type {
  Building, BuildingKind, DiplomacyAct, Kingdom, SettlementEvents, SettlerParty, Village, VillageStore,
} from './settlement/types';
export { footprintOf, tierOf } from './settlement/helpers';
import type { SettlementHost } from './settlement/host';
import { TradeNetwork } from './settlement/trade';
import { FaithService } from './settlement/faith';
import { Armoury } from './settlement/armoury';
import { Colonisation } from './settlement/colonisation';
import { Warfare } from './settlement/warfare';
import { Construction } from './settlement/construction';
import { Politics, type ActivePlot } from './settlement/politics';
import type {
  Building, BuildingKind, DiplomacyAct, Kingdom, SettlementEvents,
  SettlerParty, Village
} from './settlement/types';
import {
  BIRTH_CHANCE_PER_ADULT, BIRTH_FOOD, BIRTH_INTERVAL, BOAT_CAPACITY, BUILDER_STROKE,
  BUILDING_CLOUD_CAPACITY, BUILDING_DRAW_SCALE, BUILDING_HEALTH, BUILDING_YIELD, BUILD_EASE,
  CLAIM_RADIUS,
  EXPANSION_APPETITE, FARM_HARVEST, FEEDING_RADIUS, FISHING_MIN_POPULATION, FOUNDING_CLUSTER,
  FOUNDING_RADIUS, HOUSING, HOUSING_SLACK, MAX_BUILDERS, MAX_MINERS,
  MAX_WOODCUTTERS, MEAL_PRICE, MIN_VILLAGE_SPACING,
  OVERREACH_ALLOWANCE, PULSE_BY_BUILDING, REBELLION_PATIENCE, RECIPES, ROOF_LIGHT,
  TAX_RATE, TOWER_DAMAGE, TOWER_RANGE,
  UNKNOWN_IDENTITY_COLOR
} from './settlement/constants';
import {
  footprintOf, groundBonus, isRace, keepIdentifierAhead, mintId,
  tierOf, townColour
} from './settlement/helpers';

export class SettlementSystem implements SettlementHost {
  readonly tiles: Tile[][];
  private terrain: TerrainRenderer;
  readonly entities: EntityManager;
  readonly events: SettlementEvents;
  private buildingCloud: SpriteCloud;
  /** Kingdom-coloured roofs, drawn over the buildings slot for slot. */
  private roofCloud: SpriteCloud;
  /** Fishing boats and settler transports, and the sprites that draw them. */
  readonly boats: BoatSystem;
  private boatCloud: SpriteCloud;
  private boatSlots = new Map<string, number>();
  private freeBoatSlots: number[] = Array.from({ length: BOAT_CAPACITY }, (_, i) => BOAT_CAPACITY - 1 - i);
  private fleetTimer = 0;
  private forgeTimer = 0;
  private towerTimer = 0;
  private paintedSeason: string = simulation.season;
  private boatPosition = new THREE.Vector3();
  private freeSlots: number[] = [];
  private nextSlot = 0;

  villages = new Map<string, Village>();
  kingdoms = new Map<string, Kingdom>();
  /** The settler parties on the road or at sea, shared with the colonisation subsystem. */
  get parties(): Map<string, SettlerParty> {
    return this.colonisation.parties;
  }

  private foundTimer = 0;
  private birthTimer = 0;
  /** Caravans and merchant ships (see settlement/trade.ts). */
  private trade = new TradeNetwork(this);
  /** Priests, temples and the religions they keep (see settlement/faith.ts). */
  private faith = new FaithService(this);
  /** Smiths and the drill yard (see settlement/armoury.ts). */
  private armoury = new Armoury(this);
  /** Settler parties, sea voyages, new colonies and migrants (see settlement/colonisation.ts). */
  private colonisation = new Colonisation(this);
  /** Diplomacy, opinions and war: raids, sieges and peace (see settlement/warfare.ts). */
  private warfare = new Warfare(this);
  /** Building sites, roads, and the upgrades that grow a town (see settlement/construction.ts). */
  private construction = new Construction(this);
  /** Succession, loyalty, secession and plots (see settlement/politics.ts). */
  private politics = new Politics(this);
  /** Finds already announced, so a rich vein is news once, not every load. */
  private announcedFinds = new Set<string>();
  private workTimer = 0;
  private expansionTimer = 0;
  private publishTimer = 0;
  private economyTimer = 0;
  laws: WorldLaws = simulation.laws;
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

    this.buildingCloud = new SpriteCloud(getBuildingAtlas(), BUILDING_CLOUD_CAPACITY, true);
    scene.add(this.buildingCloud.points);
    // Same slots, same atlas: each building's roof again, in its realm's colour.
    this.roofCloud = new SpriteCloud(getBuildingAtlas(), BUILDING_CLOUD_CAPACITY, true);
    scene.add(this.roofCloud.points);
    this.boatCloud = new SpriteCloud(getBuildingAtlas(), BOAT_CAPACITY, true);
    scene.add(this.boatCloud.points);
    this.boats = new BoatSystem(tiles, {
      onCatch: (boat, food) => this.landCatch(boat, food),
      onLand: (boat, shore) => (boat.payload?.startsWith('invasion:')
        ? this.warfare.landInvasion(boat, shore)
        : this.colonisation.landSettlers(boat, shore)),
      onTrade: (boat) => this.trade.landBoat(boat),
    });

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

  setViewportScale(scale: number, orthographic = false): void {
    this.buildingCloud.setViewportScale(scale, orthographic);
    this.roofCloud.setViewportScale(scale, orthographic);
    this.boatCloud.setViewportScale(scale, orthographic);
  }

  /**
   * Advance the building pulse. Driven from the engine's frame loop alongside
   * the water and the wind, so all three share one clock and cannot drift.
   */
  advancePulse(delta: number): void {
    this.buildingCloud.advanceWind(delta);
    this.roofCloud.advanceWind(delta);
    this.boatCloud.advanceWind(delta);
  }

  // -- main loop ---------------------------------------------------------

  update(delta: number): void {
    if (!this.laws.settlements) return;

    // A new season repaints the fields.
    if (simulation.season !== this.paintedSeason) {
      this.paintedSeason = simulation.season;
      for (const village of this.villages.values()) {
        for (const building of village.buildings) if (building.kind === 'farm') this.paintBuilding(village, building);
      }
    }

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

    this.birthTimer += delta;
    if (this.birthTimer >= BIRTH_INTERVAL) {
      this.birthTimer = 0;
      if (this.laws.reproduction !== false) this.birthRound();
    }

    this.trade.update(delta);

    this.economyTimer += delta;
    if (this.economyTimer >= 5) {
      this.economyTimer = 0;
      this.economyRound();
    }

    this.construction.update(delta);

    for (const village of this.villages.values()) village.age += delta;
    for (const kingdom of this.kingdoms.values()) kingdom.age += delta;

    this.expansionTimer += delta;
    if (this.expansionTimer >= 10) {
      this.expansionTimer = 0;
      this.expansionRound();
    }

    this.colonisation.update(delta);

    this.towerTimer += delta;
    if (this.towerTimer >= 1.4) {
      this.towerTimer = 0;
      this.towerVolley();
    }

    this.faith.update(delta);

    this.forgeTimer += delta;
    if (this.forgeTimer >= 12) {
      this.forgeTimer = 0;
      this.armoury.forge();
      this.upgradeRound();
      this.armoury.drill();
    }

    this.fleetTimer += delta;
    if (this.fleetTimer >= 6) {
      this.fleetTimer = 0;
      this.fleetRound();
    }
    if (this.boats.boats.size > 0 || this.boatSlots.size > 0) {
      this.boats.update(delta);
      this.drawBoats();
    }

    this.politics.update(delta);

    this.warfare.update(delta);

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

  tooCloseToVillage(x: number, y: number): boolean {
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
  createVillage(kingdom: Kingdom, tile: Tile, founders: Entity[]): Village {
    const village: Village = {
      id: mintId('village'),
      name: generateVillageName(kingdom.race),
      kingdomId: kingdom.id,
      race: kingdom.race,
      centerX: tile.x,
      centerY: tile.y,
      buildings: [],
      store: { food: 4, wood: 4, stone: 2, gold: 0 },
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
      const faith = mintMeta('religion');
      foundFaith(faith, founders[0]?.name ?? null, village.name);
      const minted = {
        culture: mintMeta('culture').id,
        language: mintMeta('language').id,
        religion: faith.id,
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

  createKingdom(race: Race): Kingdom {
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

  claimTerritory(village: Village): void {
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
          const id = this.instanceId(tile);
          if (village.erased?.has(id)) continue;
          claimed.add(id);
        }
      }
    }
    // What the god painted in stays painted.
    for (const id of village.painted ?? []) claimed.add(id);

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

  /**
   * The border brush and eraser. Painting hands a tile to the nearest town
   * (taking it from whoever held it); erasing frees it, and the town's own
   * buildings will not take it back. Returns whether anything changed.
   */
  paintBorder(x: number, y: number, erase: boolean): boolean {
    const tile = this.tileAt(x, y);
    if (!tile || isWaterBiome(tile.type)) return false;
    const id = this.instanceId(tile);
    const holder = this.villageHolding(tile);
    if (erase) {
      if (!holder) return false;
      holder.territory.delete(id);
      holder.painted?.delete(id);
      (holder.erased ??= new Set()).add(id);
      tile.ownerId = null;
      this.refreshOwnershipAround(tile);
      return true;
    }
    let best: Village | null = null;
    let bestDistance = 24 * 24;
    for (const village of this.villages.values()) {
      const d = (village.centerX - x) ** 2 + (village.centerY - y) ** 2;
      if (d < bestDistance) { bestDistance = d; best = village; }
    }
    if (!best || holder === best) return false;
    if (holder) {
      holder.territory.delete(id);
      holder.painted?.delete(id);
      (holder.erased ??= new Set()).add(id);
    }
    best.erased?.delete(id);
    (best.painted ??= new Set()).add(id);
    best.territory.add(id);
    tile.ownerId = best.kingdomId;
    this.refreshOwnershipAround(tile);
    return true;
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

    if (layer === 'alliance') return this.allianceColor(tile.ownerId);
    if (layer === 'village') {
      const village = this.villageHolding(tile);
      return village ? this.identityColor(`town:${village.id}`, townColour(village.id)) : null;
    }
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

  /**
   * One colour per alliance: every realm in a web of alliances wears the
   * colour of its eldest member, so a bloc reads as one shape. A realm with
   * no allies keeps its own.
   */
  private allianceColor(kingdomId: string): THREE.Color | null {
    const start = this.kingdoms.get(kingdomId);
    if (!start) return null;
    const seen = new Set<string>([start.id]);
    const queue = [start];
    let eldest = start;
    while (queue.length > 0) {
      const kingdom = queue.pop()!;
      if (kingdom.age > eldest.age) eldest = kingdom;
      for (const id of kingdom.allies) {
        const ally = this.kingdoms.get(id);
        if (ally && !seen.has(id)) { seen.add(id); queue.push(ally); }
      }
    }
    return eldest.color;
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
      // A barracks is somewhere to keep soldiers, so a town with one keeps more.
      const drilled = village.buildings.some(b => b.kind === 'barracks') ? 1.5 : 1;
      const warriorTarget = members.length >= 8
        ? Math.max(1, Math.round(members.length * (atWar ? 0.4 : 0.15) * martial * drilled))
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

      // Everyone else has a trade, as in WorldBox: farmers on the fields,
      // woodcutters in the trees, miners up at the ore, and whoever is left
      // hauling stone and timber. A town of idlers standing round the
      // bonfire was the single biggest reason nothing seemed to happen.
      const adults = members.filter(m => !isChild(m)).length;
      const farms = village.buildings.filter(b => b.kind === 'farm').length;
      const openSites = village.buildings.filter(b => b.progress !== undefined).length;
      const targets: Record<'warrior' | 'gatherer' | 'builder' | 'farmer' | 'miner' | 'woodcutter', number> = {
        warrior: warriorTarget,
        gatherer: gathererTarget,
        // Somebody always has a hammer while there is a site to put up.
        builder: openSites > 0 ? Math.min(MAX_BUILDERS, Math.max(1, Math.round(adults * 0.15))) : 0,
        farmer: Math.min(farms, Math.ceil(adults * 0.3)),
        miner: Math.min(MAX_MINERS, Math.max(1, Math.round(adults * 0.14))),
        woodcutter: Math.min(MAX_WOODCUTTERS, Math.max(1, Math.round(adults * 0.16))),
      };
      // Foragers take what is left after the soldiers and the builders: a
      // hungry town still keeps a hammer going, or it never gets a roof up.
      targets.gatherer = Math.max(0, Math.min(targets.gatherer, adults - targets.warrior - targets.builder));
      const counts = { warrior: 0, gatherer: 0, builder: 0, farmer: 0, miner: 0, woodcutter: 0, trader: 0 };
      const ORDER = ['warrior', 'builder', 'gatherer', 'farmer', 'miner', 'woodcutter'] as const;

      // Whoever already holds a blade is first in line for a soldier's post:
      // the smith armed them for it, and a town should not hand its swords to
      // its farmers the moment the quotas shift.
      members.sort((a, b) => Number(Boolean(b.equipment?.weapon)) - Number(Boolean(a.equipment?.weapon)));

      // Existing holders keep their posts where the village still needs them.
      // Children have no post: they play until they are grown. A trader on
      // the road keeps its post until the caravan comes home.
      for (const member of members) {
        if (isChild(member)) { member.job = null; continue; }
        const job = member.job;
        if (job === 'trader' && this.trade.isOnRoad(member.id)) { counts.trader++; continue; }
        if (job && job !== 'trader' && counts[job] < targets[job]) counts[job]++;
        else member.job = null;
      }

      for (const member of members) {
        if (member.job || isChild(member)) continue;
        // The armed are soldiers or nothing: they wait for a post under arms
        // rather than being sent to the fields with a sword on their back.
        const job = member.equipment?.weapon && counts.warrior < targets.warrior
          ? 'warrior'
          : ORDER.find(kind => counts[kind] < targets[kind]);
        // Past every quota, a spare pair of hands hauls for the builders.
        member.job = job ?? 'builder';
        if (job) counts[job]++;
      }

      // Builders walk to the nearest site and put it up.
      const sites = village.buildings.filter(b => b.progress !== undefined);
      if (sites.length > 0) {
        for (const member of members) {
          if (member.job !== 'builder' || member.carrying || this.entities.hasOrder(member)) continue;
          const site = sites[Math.floor(Math.random() * sites.length)];
          this.entities.giveOrder(member, { kind: 'goto', x: site.x, y: site.y, purpose: 'build' });
        }
      }

      // Farmers walk out to a field and work it.
      if (farms > 0) {
        const fields = village.buildings.filter(b => b.kind === 'farm');
        for (const member of members) {
          if (member.job !== 'farmer' || member.carrying || this.entities.hasOrder(member)) continue;
          const field = fields[Math.floor(Math.random() * fields.length)];
          this.entities.giveOrder(member, { kind: 'goto', x: field.x, y: field.y, purpose: 'farm' });
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

    // At peace the warband loafs about its captain. At war it falls in: ranks
    // of four behind the banner, facing the nearest enemy town.
    const front = this.warFront(village.kingdomId, captain);
    const soldiers = warriors.filter(w => w.id !== captain!.id);
    const slots = front ? formationSlots(soldiers.length, front.x - captain.position.x, front.y - captain.position.y) : null;
    soldiers.forEach((warrior, i) => {
      if (slots) this.entities.setHerdAnchor(warrior, captain!, 0.6, slots[i]);
      else this.entities.setHerdAnchor(warrior, captain!, 2.5);
    });
  }

  /**
   * Watchtowers defend. Each tower looses an arrow at the nearest enemy
   * soldier or monster within range — WorldBox's towers shoot, and a town
   * with towers is visibly harder to walk into than one without.
   */
  private towerVolley(): void {
    for (const village of this.villages.values()) {
      const kingdom = this.kingdoms.get(village.kingdomId);
      if (!kingdom) continue;
      for (const tower of village.buildings) {
        if (tower.kind !== 'tower' && !(tower.kind === 'hall' && (tower.level ?? 1) >= 3)) continue;
        let target: Entity | null = null;
        let best = TOWER_RANGE * TOWER_RANGE;
        for (const other of this.entities.query(tower.x + 0.5, tower.y + 0.5, TOWER_RANGE)) {
          if (other.health <= 0) continue;
          const hostile = MONSTERS.has(other.type)
            || (other.kingdomId != null && other.kingdomId !== kingdom.id && kingdom.atWar.has(other.kingdomId));
          if (!hostile) continue;
          const d = (other.position.x - tower.x - 0.5) ** 2 + (other.position.y - tower.y - 0.5) ** 2;
          if (d < best) { best = d; target = other; }
        }
        if (!target) continue;
        emitShot({ position: { x: tower.x + 0.5, y: tower.y + 0.2 } }, target);
        target.health -= TOWER_DAMAGE;
        emitDamage(target.position.x, target.position.y, TOWER_DAMAGE, target.id);
        if (!target.status.includes('wounded')) target.status.push('wounded');
        if (target.health <= 0 && !target.status.includes('slain')) target.status.push('slain');
      }
    }
  }

  /** Where a unit's village keeps its well, if it has one. */
  wellFor(entity: Entity): { x: number; y: number } | null {
    const village = entity.villageId ? this.villages.get(entity.villageId) : null;
    const well = village?.buildings.find(b => b.kind === 'well');
    return well ? { x: well.x, y: well.y } : null;
  }

  isWell(x: number, y: number): boolean {
    const tile = this.tileAt(x, y);
    const village = tile?.villageId ? this.villages.get(tile.villageId) : null;
    return Boolean(village?.buildings.some(b => b.kind === 'well' && b.x === x && b.y === y));
  }

  /** The nearest enemy town to a unit, if its kingdom is at war. */
  private warFront(kingdomId: string, from: Entity): { x: number; y: number } | null {
    const kingdom = this.kingdoms.get(kingdomId);
    if (!kingdom || kingdom.atWar.size === 0) return null;
    let best: Village | null = null;
    let bestDistance = Infinity;
    for (const enemyId of kingdom.atWar) {
      const enemy = this.kingdoms.get(enemyId);
      const town = enemy ? this.warfare.nearestVillage(enemy, from.position.x, from.position.y) : null;
      if (!town) continue;
      const d = Math.hypot(town.centerX - from.position.x, town.centerY - from.position.y);
      if (d < bestDistance) { bestDistance = d; best = town; }
    }
    return best ? { x: best.centerX, y: best.centerY } : null;
  }

  private stripStatus(entity: Entity, status: StatusId): void {
    clearStatus(entity, status);
  }

  /** A unit that leaves a village leaves its office behind with it. */
  clearOffices(entity: Entity): void {
    this.stripStatus(entity, 'king');
    this.stripStatus(entity, 'leader');
    this.stripStatus(entity, 'captain');
    this.stripStatus(entity, 'priest');
  }

  /** Villages feed their residents from the granary. */
  /**
   * Feeding the village, as a transaction.
   *
   * A meal costs coins. Rulers, children and the genuinely starving eat free,
   * and anyone who cannot pay and is desperate enough steals from the treasury
   * — and is unhappy about having had to.
   *
   * One rule, and food stops being a progress bar and becomes a class system:
   * you can watch a village where the warriors eat and the gatherers do not
   * (09-WORLDBOX-VISUAL-RESEARCH.md §7).
   */
  /**
   * Families, the WorldBox way: a town grows while it has roofs to spare and
   * food in the granary, and stops when it runs out of either. The houses
   * the builders put up are what let it keep growing, and a full town is
   * what sends settlers out to found the next one.
   */
  private birthRound(): void {
    const members = this.entities.getEntitiesByVillage();
    for (const village of this.villages.values()) {
      const people = members.get(village.id);
      if (!people || people.length === 0) continue;
      if (this.laws.populationCap && people.length >= 100) continue;
      if (people.length >= this.homesIn(village) + HOUSING_SLACK) continue;
      if (village.store.food < BIRTH_FOOD * 2) continue;
      const adults = people.filter(p => !isChild(p) && p.health > p.maxHealth * 0.4
        && p.age <= p.maxAge * 0.8 && !p.status.includes('aboard'));
      if (adults.length < 2) continue;
      const chance = Math.min(0.6, adults.length * BIRTH_CHANCE_PER_ADULT);
      if (Math.random() >= chance) continue;
      // A couple when there is one together at home; otherwise any grown-up.
      const coupled = adults.filter(p => p.loverId && adults.some(a => a.id === p.loverId));
      const pool = coupled.length > 0 ? coupled : adults;
      const parent = pool[Math.floor(Math.random() * pool.length)];
      const partner = parent.loverId ? adults.find(a => a.id === parent.loverId) ?? null : null;
      const child = this.entities.bearChild(parent, partner);
      if (!child) continue;
      village.store.food -= BIRTH_FOOD;
      // The granary paid for it, not the parent's own stomach.
      parent.needs.hunger = Math.min(1, parent.needs.hunger + 0.35);
    }
  }

  private feedVillagers(): void {
    for (const village of this.villages.values()) {
      const nearby = this.entities
        .query(village.centerX, village.centerY, FEEDING_RADIUS)
        .filter(entity => entity.villageId === village.id);

      // Water is carried in from the well and the river: a town's people do
      // not die of thirst at their own front door.
      for (const resident of nearby) {
        if (resident.needs.thirst < 0.4) resident.needs.thirst = 1;
      }

      if (village.store.food <= 0) continue;
      const residents = nearby.filter(entity => entity.needs.hunger < 0.6);

      for (const resident of residents) {
        if (village.store.food <= 0) break;

        const exempt = resident.status.includes('king')
          || resident.status.includes('leader')
          || resident.age < resident.maxAge * 0.18;
        const desperate = resident.needs.hunger < 0.3;

        if (!exempt && !desperate) {
          if ((resident.coins ?? 0) < MEAL_PRICE) continue;
          resident.coins = (resident.coins ?? 0) - MEAL_PRICE;
          village.store.gold += MEAL_PRICE;
        } else if (!exempt && desperate && (resident.coins ?? 0) < MEAL_PRICE) {
          // Starving and broke: takes what it needs and feels it.
          village.store.gold = Math.max(0, village.store.gold - MEAL_PRICE);
          applyScenario(resident, 'turnedOut');
        }

        village.store.food -= 1;
        resident.needs.hunger = Math.min(1, resident.needs.hunger + 0.4);
      }
    }
  }

  /**
   * Wages, tax, and the village ledger.
   *
   * Three steps, in this order, because the order *is* the politics:
   *
   * 1. Buildings yield loot, scaled by tier and modified by the ground they
   *    stand on. The architecture is the income graph.
   * 2. Loot is taxed on its way to becoming spendable coin, and the tax lands
   *    in the treasury. Every wage passes visibly through a lord's hands.
   * 3. The village pays its bills — their four one-line terms, where
   *    homelessness costs twice a soldier and over-building bankrupts you.
   */
  private economyRound(): void {
    const members = this.entities.getEntitiesByVillage();

    for (const village of this.villages.values()) {
      const residents = members.get(village.id) ?? [];
      if (residents.length === 0) continue;

      // A stockpile keeps what the gatherers bring in from spoiling or
      // walking off: a little wood and stone saved every round.
      if (village.buildings.some(b => b.kind === 'stockpile')) {
        village.store.wood += 1;
        village.store.stone += 1;
      }
      // A mine shaft brings up a little ore of its own, between the miners'
      // trips out to the veins.
      const shafts = village.buildings.filter(b => b.kind === 'mine').length;
      if (shafts > 0) village.store.metal = (village.store.metal ?? 0) + shafts;

      // -- 1. buildings earn --------------------------------------------
      let yield_ = 0;
      for (const building of village.buildings) {
        if (building.progress !== undefined) continue;
        const base = (BUILDING_YIELD[building.kind] ?? 1) + ((building.level ?? 1) - 1);
        const tile = this.tileAt(building.x, building.y);
        yield_ += base * (tile ? groundBonus(tile) : 1);
      }
      // Split across whoever is working, so a big town with few people does
      // not make each of them rich.
      const share = yield_ / Math.max(1, residents.length);
      for (const resident of residents) {
        resident.loot = (resident.loot ?? 0) + share;
      }

      // -- 2. the lord takes a cut ---------------------------------------
      for (const resident of residents) {
        const loot = resident.loot ?? 0;
        if (loot < 1) continue;
        const tax = Math.floor(loot * TAX_RATE);
        resident.loot = loot - Math.floor(loot);
        resident.coins = (resident.coins ?? 0) + (Math.floor(loot) - tax);
        village.store.gold += tax;
        // Being taxed is a small, frequent grievance — which is exactly the
        // sort of thing that shows up later as loyalty.
        if (tax > 0 && Math.random() < 0.04) applyScenario(resident, 'sleptRough');
      }

      // A windmill grinds what the farms grow: each one turns a little of
      // the harvest into extra bread.
      const mills = village.buildings.filter(b => b.kind === 'windmill').length;
      if (mills > 0) {
        const farms = village.buildings.filter(b => b.kind === 'farm').length;
        village.store.food += mills * Math.min(4, 1 + farms);
      }

      // -- 3. the ledger --------------------------------------------------
      const homeless = Math.max(0, residents.length - this.homesIn(village));
      const warriors = residents.filter(r => r.job === 'warrior').length;
      const ledger = Math.floor(residents.length / 2)
        - homeless
        - Math.floor(warriors / 2)
        - Math.floor(village.buildings.length / 2);
      village.store.gold = Math.max(0, village.store.gold + ledger);
    }
  }

  /** How many residents this village can actually house. */
  homesIn(village: Village): number {
    let capacity = 0;
    for (const building of village.buildings) {
      if (building.progress !== undefined) continue;
      // A stone house holds two more than a hut, a manor two more again.
      capacity += (HOUSING[building.kind] ?? 0) + (building.kind === 'house' ? ((building.level ?? 1) - 1) * 2 : 0);
    }
    return capacity;
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

    if (order.purpose === 'build') {
      const village = entity.villageId ? this.villages.get(entity.villageId) : null;
      const site = village?.buildings.find(b => b.x === order.x && b.y === order.y && b.progress !== undefined);
      if (!village || !site) return;
      site.progress = (site.progress ?? 0) + BUILDER_STROKE * (BUILD_EASE[site.kind] ?? 1);
      emitFloater({ kind: 'emote', text: '\u{1F528}', x: entity.position.x, y: entity.position.y, entityId: entity.id });
      if (site.progress >= 1) this.construction.finishBuilding(village, site);
      return;
    }

    if (order.purpose === 'farm') {
      const village = entity.villageId ? this.villages.get(entity.villageId) : null;
      if (!village || entity.job !== 'farmer') return;
      const mills = village.buildings.some(b => b.kind === 'windmill') ? 1 : 0;
      const harvest = FARM_HARVEST + mills + (simulation.season === 'autumn' ? 1 : simulation.season === 'winter' ? -1 : 0);
      if (harvest > 0) {
        village.store.food += harvest;
        emitFloater({ kind: 'gain', text: `+${harvest} food`, x: entity.position.x, y: entity.position.y });
      }
      return;
    }

    if (order.purpose === 'trade') {
      this.trade.arrived(entity);
      return;
    }

    if (order.purpose === 'settle') {
      const party = Array.from(this.parties.values())
        .find(candidate => candidate.memberIds.has(entity.id));
      if (party) this.colonisation.foundColony(entity, party);
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
    else if (isOre(type)) {
      const value = ORE_VALUE[type];
      const store = village.store;
      store.metal = (store.metal ?? 0) + (value.metal ?? 0) * quantity;
      store.gold += (value.gold ?? 0) * quantity;
      store.gems = (store.gems ?? 0) + (value.gems ?? 0) * quantity;
      store.mithril = (store.mithril ?? 0) + (value.mithril ?? 0) * quantity;
      store.adamantine = (store.adamantine ?? 0) + (value.adamantine ?? 0) * quantity;
      // A rare find is news.
      const find = `${village.id}:${type}`;
      if ((type === 'mithril' || type === 'adamantine' || type === 'gem') && !this.announcedFinds.has(find)) {
        this.announcedFinds.add(find);
        this.events.onEvent(`Miners of ${village.name} bring ${type === 'gem' ? 'gems' : type} up out of the hills`, 'info', { x: village.centerX, y: village.centerY });
      }
    }
  }

  // -- construction ------------------------------------------------------

  /**
   * Where a town's boats put out from: the water beside its dock if it has
   * one, otherwise whatever water is nearest its centre.
   */
  harbourOf(village: Village, reach: number): Point | null {
    const dock = village.buildings.find(b => b.kind === 'dock');
    if (dock) {
      const water = nearestWater(this.tiles, { x: dock.x, y: dock.y }, 2);
      if (water) return water;
    }
    return nearestWater(this.tiles, { x: village.centerX, y: village.centerY }, reach + village.claimBonus);
  }

  /** Run a callback over every tile a building stands on. */
  private forEachFootprintTile(building: Building, fn: (tile: Tile) => void): void {
    const span = footprintOf(building.kind);
    for (let dx = 0; dx < span; dx += 1) {
      for (let dy = 0; dy < span; dy += 1) {
        const tile = this.tileAt(building.x + dx, building.y + dy);
        if (tile) fn(tile);
      }
    }
  }

  /** Hall and house upgrades, run on the forge clock (see settlement/construction.ts). */
  private upgradeRound(): void {
    this.construction.upgradeRound();
  }

  /** Land with sea beside it, where a dock goes (see settlement/construction.ts). */
  findShoreSpot(village: Village): { x: number; y: number } | null {
    return this.construction.findShoreSpot(village);
  }

  placeBuilding(village: Village, kind: BuildingKind, x: number, y: number, site = false): void {
    const tile = this.tileAt(x, y);
    if (!tile) return;

    const slot = this.freeSlots.pop() ?? this.nextSlot++;
    if (slot >= BUILDING_CLOUD_CAPACITY) return;

    const building: Building = {
      id: mintId('building'),
      kind,
      x,
      y,
      health: BUILDING_HEALTH[kind],
      maxHealth: BUILDING_HEALTH[kind],
      villageId: village.id,
      slot,
      level: 1,
    };
    if (site) {
      building.progress = 0;
      building.health = Math.round(building.maxHealth * 0.3);
    }
    village.buildings.push(building);

    // Buildings clear all the land they stand on and replace natural decoration
    this.forEachFootprintTile(building, (footprintTile) => {
      footprintTile.villageId = village.id;
      footprintTile.structure = null;
      this.terrain.clearDetail(footprintTile);
    });

    this.paintBuilding(village, building);
  }

  /** Redraw a tile's terrain after its road or claim has changed. */
  syncTerrain(tile: Tile): void {
    this.terrain.syncTile(tile, simulation.timeOfDay, simulation.season);
  }

  /** Put a building's sprite in the cloud, or refresh it after an upgrade. */
  paintBuilding(village: Village, building: Building): void {
    const tile = this.tileAt(building.x, building.y);
    if (!tile) return;
    const { kind, slot } = building;
    const kingdom = this.kingdoms.get(village.kingdomId);
    const recipe = RECIPES.find(r => r.kind === kind);
    const span = footprintOf(kind);
    // A building that stands on four tiles has to be drawn across four tiles.
    // Scaled a little under the full span so the neighbouring streets do not
    // disappear under the eaves.
    // Drawn at WorldBox's proportions: a house stands well over the heads of
    // the people who live in it. At the old scale a tent came out half the
    // height of a villager and a town read as a scattering of pebbles.
    // A house that has been built up is drawn a little taller each time.
    const grown = 1 + ((building.level ?? 1) - 1) * 0.12;
    const size = (kind === 'bonfire' ? 0.55 : recipe?.size ?? 0.5) * (span > 1 ? span * 0.92 : 1) * BUILDING_DRAW_SCALE * grown;

    const position = this.terrain.worldPosition(tile).clone();
    // Anchored at its corner tile, so the sprite has to shift to the middle of
    // the block it covers or a hall sits a tile up and to the left of its own
    // foundations.
    const offset = (span - 1) * 0.5 * TILE_SIZE;
    position.x += offset;
    position.z += offset;
    position.y += size * 0.5 + 0.02;
    // Fields follow the year: green while growing, gold at harvest, bare and
    // frosted in winter.
    const underConstruction = building.progress !== undefined;
    const art = underConstruction ? 'site'
      : (kind === 'house' || kind === 'hall') && (building.level ?? 1) > 1 ? `${kind}${building.level}`
      : kind === 'farm' && simulation.season === 'autumn' ? 'farm_autumn'
        : kind === 'farm' && simulation.season === 'winter' ? 'farm_winter'
          : kind;
    const sway = -(PULSE_BY_BUILDING[kind] ?? 0.5);
    this.buildingCloud.set(slot, {
      position,
      sprite: underConstruction ? 'site' : buildingSprite(art, village.race),
      size: underConstruction ? Math.min(size, 0.62 * BUILDING_DRAW_SCALE * Math.max(1, span * 0.8)) : size,
      // Negative sway means "pulse in scale" rather than "lean". A bonfire
      // breathes hardest because it is literally a fire; a hall barely moves
      // because a building that wobbles looks broken.
      sway,
    });
    // The roof in the realm's colour, a hair above so it wins the depth test,
    // pulsing on the same beat (the phase comes from x and z only).
    const roof = roofSprite(art);
    if (roof && kingdom) {
      this.roofCloud.set(slot, {
        position: position.clone().setY(position.y + 0.003),
        sprite: roof,
        size,
        tint: kingdom.color.clone().lerp(ROOF_LIGHT, 0.12),
        sway,
      });
    } else {
      this.roofCloud.clear(slot);
    }
  }

  removeBuilding(village: Village, building: Building): void {
    this.buildingCloud.clear(building.slot);
    this.roofCloud.clear(building.slot);
    this.freeSlots.push(building.slot);
    const index = village.buildings.indexOf(building);
    if (index !== -1) village.buildings.splice(index, 1);

    this.forEachFootprintTile(building, (tile) => {
      if (tile.villageId !== village.id) return;
      tile.villageId = null;
      this.terrain.syncTile(tile, simulation.timeOfDay, simulation.season);
    });
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
      // Matched against the whole footprint: knocking down the far corner of a
      // hall has to knock down the hall, not miss it.
      const building = village.buildings.find((candidate) => {
        const span = footprintOf(candidate.kind);
        return x >= candidate.x && x < candidate.x + span
          && y >= candidate.y && y < candidate.y + span;
      });
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

  /** Civil stats of whoever actually wears the crown, if anybody does. */
  kingCivilStats(kingdom: Kingdom): CivilStats | null {
    if (!kingdom.kingId) return null;
    const king = this.entities.getEntityById(kingdom.kingId);
    return king ? civilStats(king) : null;
  }

  /** Total claimed tiles, for judging who is winning a war. */
  landOf(kingdom: Kingdom): number {
    let total = 0;
    for (const id of kingdom.villageIds) total += this.villages.get(id)?.territory.size ?? 0;
    return total;
  }

  // -- plots -------------------------------------------------------------

  /** Every live scheme, for the interface. */
  activePlots(): ActivePlot[] {
    return this.politics.activePlots();
  }

  /** Plots this creature is running, for the inspector. */
  plotsBy(entityId: string): Plot[] {
    return this.politics.plotsBy(entityId);
  }

  /**
   * Every standing building, flattened, for whatever wants to pick one.
   *
   * The disaster table is the caller: a disaster that needs a mine to collapse
   * has to be able to find out whether anyone has built one. That is the whole
   * mechanism — the player's own works become the attack surface, and a world
   * with nothing in it is a world with nothing to lose.
   */
  standingBuildings(): Array<{
    id: string; kind: string; x: number; y: number; villageId: string; villageName: string;
  }> {
    const all: Array<{
      id: string; kind: string; x: number; y: number; villageId: string; villageName: string;
    }> = [];
    for (const village of this.villages.values()) {
      for (const building of village.buildings) {
        all.push({
          id: building.id,
          kind: building.kind,
          x: building.x,
          y: building.y,
          villageId: village.id,
          villageName: village.name,
        });
      }
    }
    return all;
  }

  /**
   * Take one building down from outside, by id.
   *
   * Public because the engine must not clear a village tile behind this
   * system's back — the same reason `demolishAt` is. Returns whether anything
   * was there, so a caller that raced a collapse can tell.
   */
  destroyBuilding(id: string): boolean {
    for (const village of this.villages.values()) {
      const building = village.buildings.find(candidate => candidate.id === id);
      if (!building) continue;
      this.removeBuilding(village, building);
      this.claimTerritory(village);
      this.publishSummaries();
      return true;
    }
    return false;
  }

  /**
   * How advanced each village's craft is, 1-4, for the tool its people carry.
   *
   * Read off what it has actually built rather than tracked as a research
   * score, so the tech ladder is a *consequence* of the town and not a second
   * system running beside it: raise a hall and the axes go from stone to iron,
   * lose the hall to a raid and they go back. A mine is worth a rung on its own
   * because metalwork is the thing a mine is for.
   *
   * Rebuilt on each call rather than cached: a handful of villages holding a
   * dozen buildings each is a few hundred operations a few times a second, and
   * a cache here would need invalidating from six places that destroy
   * buildings.
   */
  craftTiers(): ReadonlyMap<string, number> {
    const tiers = new Map<string, number>();
    for (const village of this.villages.values()) {
      let best = 1;
      let mines = false;
      let smithy = false;
      for (const building of village.buildings) {
        best = Math.max(best, tierOf(building.kind));
        if (building.kind === 'mine') mines = true;
        if (building.kind === 'smithy') smithy = true;
      }
      tiers.set(village.id, Math.min(4, best + (mines ? 1 : 0) + (smithy ? 1 : 0)));
    }
    return tiers;
  }

  /** Everyone currently scheming, mapped to how far along they are. */
  plottingIds(): ReadonlyMap<string, number> {
    return this.politics.plottingIds();
  }

  /** Break up a creature's schemes: the player's blessing or death stops them. */
  cancelPlotsBy(entityId: string, reason: 'dead' | 'blessed'): number {
    return this.politics.cancelPlotsBy(entityId, reason);
  }

  /** Drop the schemes of a creature that has died. */
  forgetPlotter(entityId: string): void {
    this.politics.forgetPlotter(entityId);
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

  /** How many towns this kingdom will try to hold before it stops settling. */
  colonyLimit(kingdom: Kingdom): number {
    return governableVillages(this.kingCivilStats(kingdom))
      + (EXPANSION_APPETITE[kingdom.race] ?? 0)
      + OVERREACH_ALLOWANCE
      + (groupHasCultureTrait(kingdom.id, 'expansionist') ? 2 : 0);
  }

  /** What every pair of neighbouring realms thinks of each other. */
  opinionRows(): OpinionRow[] {
    return this.warfare.opinionRows();
  }

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

  residentsOf(village: Village): Entity[] {
    return this.entities.getAllEntities()
      .filter(entity => entity.villageId === village.id);
  }

  /** A fishing boat came home: the catch goes in the village store. */
  private landCatch(boat: Boat, food: number): void {
    const village = boat.villageId ? this.villages.get(boat.villageId) : undefined;
    if (!village) return;
    village.store.food += food;
    emitFloater({ kind: 'gain', text: `+${food} fish`, x: boat.x, y: boat.y });
  }

  /**
   * Keep coastal villages' boats on the water.
   *
   * One boat for a village that can spare a crew, two once it is a town.
   * Also the safety net for anybody still marked as aboard with no boat
   * under them — a save loaded mid-voyage — who simply steps ashore.
   */
  private fleetRound(): void {
    const atSea = this.boats.passengersAtSea();
    for (const entity of this.entities.getAllEntities()) {
      if (entity.status.includes('aboard') && !atSea.has(entity.id)) clearStatus(entity, 'aboard');
    }
    for (const village of this.villages.values()) {
      if (!village.kingdomId) continue;
      const residents = this.residentsOf(village).length;
      if (residents < FISHING_MIN_POPULATION) continue;
      const wanted = residents >= 14 ? 2 : 1;
      if (this.boats.fishingBoatsOf(village.id) >= wanted) continue;
      const dock = this.harbourOf(village, 6);
      if (dock) this.boats.launchFishing(village.id, village.kingdomId, dock);
    }
    this.trade.seaRound();
  }

  /** Move every boat's sprite, and its passengers with it. */
  private drawBoats(): void {
    const size = this.tiles.length;
    const live = new Set<string>();
    for (const boat of this.boats.boats.values()) {
      live.add(boat.id);
      let slot = this.boatSlots.get(boat.id);
      if (slot === undefined) {
        slot = this.freeBoatSlots.pop();
        if (slot === undefined) continue;
        this.boatSlots.set(boat.id, slot);
      }
      const kingdom = this.kingdoms.get(boat.kingdomId);
      this.boatPosition.set((boat.x - size / 2) * TILE_SIZE, 0.2, (boat.y - size / 2) * TILE_SIZE);
      const scale = boat.kind === 'transport' ? 0.66 : boat.kind === 'trade' ? 0.58 : 0.48;
      this.boatCloud.set(slot, {
        position: this.boatPosition,
        sprite: boat.kind === 'transport' ? 'transport' : boat.kind === 'trade' ? 'merchant' : 'boat',
        size: scale * BUILDING_DRAW_SCALE * 1.15,
        // The sail carries the flag.
        tint: kingdom ? new THREE.Color(0xffffff).lerp(kingdom.color, 0.45) : undefined,
        sway: 0.4,
      });
      for (const id of boat.passengers) {
        const passenger = this.entities.getEntityById(id);
        if (passenger) passenger.position = { x: boat.x, y: boat.y };
      }
    }
    for (const [id, slot] of this.boatSlots) {
      if (live.has(id)) continue;
      this.boatCloud.clear(slot);
      this.boatSlots.delete(id);
      this.freeBoatSlots.push(slot);
    }
  }

  /**
   * Common teardown: buildings gone, land unclaimed, residents freed, village
   * struck from its kingdom. Used by conquest and by abandonment alike.
   */
  releaseVillage(village: Village): void {
    this.boats.removeVillage(village.id);
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
    // Boats are not saved: a loaded world starts with an empty sea, and the
    // fleet round puts the fishing boats back within a few seconds.
    this.boats.clear();
    for (const slot of this.boatSlots.values()) {
      this.boatCloud.clear(slot);
      this.freeBoatSlots.push(slot);
    }
    this.boatSlots.clear();
    // Keep the shared counter ahead of every id the save mentions, so newly
    // founded villages can never collide with restored ones.
    const trackId = (id: string) => {
      const numeric = Number(id.split('-').pop());
      if (Number.isFinite(numeric)) keepIdentifierAhead(numeric);
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
        store: { ...saved.store, gold: saved.store.gold ?? 0 },
        territory: new Set(),
        founded: { year: 0, season: simulation.season },
        capital: saved.capital ?? false,
        claimBonus: saved.claimBonus ?? 0,
        painted: saved.painted ? new Set(saved.painted) : undefined,
        erased: saved.erased ? new Set(saved.erased) : undefined,
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
          if (building.level && building.level > 1) {
            restored.level = building.level;
            this.paintBuilding(village, restored);
          }
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

  /**
   * Every standing army: a town's captain and the warriors anchored to it,
   * where it is, and where it is going. What the Armies list and the army
   * banners on the map are drawn from.
   */
  armySummaries(): Array<{
    id: string; captainId: string; captain: string; kingdomId: string; kingdom: string; color: string;
    race: string; home: string; soldiers: number; armed: number; x: number; y: number;
    marchingOn: string | null;
  }> {
    const rows = [];
    const byVillage = this.entities.getEntitiesByVillage();
    for (const village of this.villages.values()) {
      const captain = this.entities.getEntityById(this.captains.get(village.id) ?? '');
      if (!captain || captain.health <= 0) continue;
      const kingdom = this.kingdoms.get(village.kingdomId);
      if (!kingdom) continue;
      const warriors = (byVillage.get(village.id) ?? []).filter(e => e.job === 'warrior' && e.health > 0);
      const front = kingdom.atWar.size > 0 ? this.warFrontVillage(kingdom.id, captain) : null;
      rows.push({
        id: `army:${village.id}`,
        captainId: captain.id,
        captain: captain.name,
        kingdomId: kingdom.id,
        kingdom: kingdom.name,
        color: kingdom.colorHex,
        race: village.race,
        home: village.name,
        soldiers: warriors.length,
        armed: warriors.filter(w => w.equipment?.weapon).length,
        x: captain.position.x,
        y: captain.position.y,
        marchingOn: front?.name ?? null,
      });
    }
    return rows.sort((a, b) => b.soldiers - a.soldiers);
  }

  /** The enemy town an army would march on. */
  private warFrontVillage(kingdomId: string, from: Entity): Village | null {
    const kingdom = this.kingdoms.get(kingdomId);
    if (!kingdom) return null;
    let best: Village | null = null;
    let bestDistance = Infinity;
    for (const enemyId of kingdom.atWar) {
      const enemy = this.kingdoms.get(enemyId);
      const town = enemy ? this.warfare.nearestVillage(enemy, from.position.x, from.position.y) : null;
      if (!town) continue;
      const d = Math.hypot(town.centerX - from.position.x, town.centerY - from.position.y);
      if (d < bestDistance) { bestDistance = d; best = town; }
    }
    return best;
  }

  /** Human-readable village details for the inspector. */
  describeVillage(x: number, y: number) {
    const village = this.villageAt(x, y) ?? this.villageNear(x, y);
    if (!village) return null;
    const kingdom = this.kingdoms.get(village.kingdomId);
    return {
      name: village.name,
      kingdomId: village.kingdomId,
      kingdomName: kingdom?.name ?? 'No kingdom',
      kingdomColor: kingdom?.colorHex ?? '#888888',
      race: village.race,
      store: { ...village.store },
      ...(() => {
        const people = this.residentsOf(village);
        const jobs: Record<string, number> = {};
        for (const person of people) {
          const trade = isChild(person) ? 'young' : person.job ?? 'idle';
          jobs[trade] = (jobs[trade] ?? 0) + 1;
        }
        return { jobs, population: people.length };
      })(),
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

  /** The alliance web as a string, so the alliance layer knows when to repaint. */
  private allianceSignature = '';

  publishSummaries(): void {
    if (simulation.mapLayer === 'alliance') {
      const signature = Array.from(this.kingdoms.values())
        .map(k => `${k.id}:${Array.from(k.allies).sort().join(',')}`).join('|');
      if (signature !== this.allianceSignature) {
        this.allianceSignature = signature;
        this.repaintAllTerritory('alliance');
      }
    }
    const populations = this.entities.getEntitiesByKingdom();
    const summaries: KingdomSummary[] = [];

    for (const kingdom of this.kingdoms.values()) {
      let territory = 0;
      for (const villageId of kingdom.villageIds) {
        territory += this.villages.get(villageId)?.territory.size ?? 0;
      }
      const people = populations.get(kingdom.id) ?? [];
      const soldiers = people.filter(p => p.job === 'warrior');
      const king = kingdom.kingId ? this.entities.getEntityById(kingdom.kingId) : null;
      const capital = kingdom.villageIds.map(id => this.villages.get(id)).find(v => v?.capital) ?? null;
      const relic = people
        .flatMap(p => [p.equipment?.weapon, p.equipment?.armor])
        .find(item => item?.name);
      summaries.push({
        ruler: king?.name ?? kingdom.ruler,
        capital: capital ? { name: capital.name, x: capital.centerX, y: capital.centerY } : null,
        army: soldiers.length,
        armed: soldiers.filter(s => s.equipment?.weapon).length,
        allies: Array.from(kingdom.allies).map(id => this.kingdoms.get(id)?.name ?? '').filter(Boolean),
        relic: relic?.name ?? null,
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
    this.events.onPlotsChanged?.(this.politics.plotSummaries());
    this.events.onIdentitiesChanged?.(this.identityRows());
    this.events.onOpinionsChanged?.(this.opinionRows());

    villageRows.sort((a, b) => {
      if ((a.secedesIn === null) !== (b.secedesIn === null)) return a.secedesIn === null ? 1 : -1;
      if (a.secedesIn !== null && b.secedesIn !== null) return a.secedesIn - b.secedesIn;
      return b.population - a.population || b.territory - a.territory;
    });
    this.events.onVillagesChanged?.(villageRows);
  }

  atWar(a?: string | null, b?: string | null): boolean {
    return this.warfare.atWar(a, b);
  }

  /** Who a village has appointed as its leader, if anybody. */
  leaderIdOf(villageId: string): string | undefined {
    return this.leaders.get(villageId);
  }

  /** Open a war between two realms, as a secession or a disputed crown leaves them. */
  beginWar(a: Kingdom, b: Kingdom): void {
    this.warfare.beginWar(a, b);
  }

  /** One realm declares war on another. */
  declareWar(a: Kingdom, b: Kingdom): void {
    this.warfare.declareWar(a, b);
  }

  /** Two realms at war make peace. */
  makePeace(a: Kingdom, b: Kingdom): void {
    this.warfare.makePeace(a, b);
  }

  /** Two realms' caravans have been on the road lately. */
  tradePartners(a: string, b: string): boolean {
    return this.trade.partners(a, b);
  }

  /** A village changing hands drops its captain and its leader. */
  forgetLeadership(villageId: string): void {
    this.captains.delete(villageId);
    this.leaders.delete(villageId);
  }

  // -- helpers -----------------------------------------------------------

  tileAt(x: number, y: number): Tile | null {
    if (x < 0 || x >= this.tiles.length || y < 0 || y >= this.tiles[0].length) return null;
    return this.tiles[x][y];
  }

  private instanceId(tile: Tile): number {
    return tile.instanceId ?? this.terrain.instanceIdFor(tile.x, tile.y);
  }

  tileFromInstanceId(id: number): Tile | null {
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
    kingdomId: string | null;
    race: string;
  }> {
    const targets: Array<{
      id: string;
      kind: 'kingdom' | 'village';
      text: string;
      color: string;
      tileX: number;
      tileY: number;
      capital: boolean;
      kingdomId: string | null;
      race: string;
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
        kingdomId: kingdom?.id ?? null,
        race: kingdom?.race ?? village.race,
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
        kingdomId: kingdom.id,
        race: kingdom.race,
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

  /**
   * The player's hand on the diplomatic map.
   *
   * WorldBox's six diplomacy powers, aimed by clicking a kingdom's ground.
   * Each goes through the same war and peace doors the simulation itself uses,
   * so a war the player whispered into being is fought, timed out and
   * chronicled exactly like one the kings arrived at on their own.
   *
   * Returns the line to put in the history, or null when it had nothing to
   * act on — no kingdom under the cursor, or nobody to quarrel with.
   */
  intervene(act: DiplomacyAct, x: number, y: number): string | null {
    const village = this.villageNear(x, y) ?? this.villageAt(x, y);
    if (!village?.kingdomId) return null;
    const kingdom = this.kingdoms.get(village.kingdomId);
    if (!kingdom) return null;
    const others = [...this.kingdoms.values()].filter(k => k.id !== kingdom.id && k.villageIds.length > 0);
    const at = { x: village.centerX, y: village.centerY };
    let line: string | null = null;

    switch (act) {
      case 'spite': {
        if (others.length === 0) return null;
        for (const other of others) {
          kingdom.allies.delete(other.id);
          other.allies.delete(kingdom.id);
          const tension = Math.max(0.95, kingdom.tension.get(other.id) ?? 0);
          kingdom.tension.set(other.id, tension);
          other.tension.set(kingdom.id, tension);
        }
        line = `Every realm wakes up certain that ${kingdom.name} is the problem`;
        break;
      }
      case 'friendship': {
        for (const otherId of [...kingdom.atWar]) {
          const other = this.kingdoms.get(otherId);
          if (other) this.warfare.makePeace(kingdom, other);
        }
        for (const other of others) {
          kingdom.tension.set(other.id, 0);
          other.tension.set(kingdom.id, 0);
        }
        line = `A warmth settles over ${kingdom.name}, and nobody can remember what the quarrel was`;
        break;
      }
      case 'whisper': {
        if (!this.laws.warfare) return null;
        const candidates = others.filter(o => !kingdom.atWar.has(o.id));
        if (candidates.length === 0) return null;
        // The neighbour it already resents most. A whisper works on what is
        // there; it does not invent a grudge from nothing.
        candidates.sort((a, b) => (kingdom.tension.get(b.id) ?? 0) - (kingdom.tension.get(a.id) ?? 0));
        const target = candidates[0];
        kingdom.allies.delete(target.id);
        target.allies.delete(kingdom.id);
        this.warfare.declareWar(kingdom, target);
        line = `A voice in the ruler of ${kingdom.name}'s ear says ${target.name} is weak`;
        break;
      }
      case 'unity': {
        const candidates = others.filter(o => !kingdom.atWar.has(o.id) && !kingdom.allies.has(o.id));
        if (candidates.length === 0) return null;
        const capital = (k: Kingdom) => this.villages.get(k.villageIds[0]);
        const here = capital(kingdom) ?? village;
        candidates.sort((a, b) => {
          const ca = capital(a); const cb = capital(b);
          const da = ca ? (ca.centerX - here.centerX) ** 2 + (ca.centerY - here.centerY) ** 2 : Infinity;
          const db = cb ? (cb.centerX - here.centerX) ** 2 + (cb.centerY - here.centerY) ** 2 : Infinity;
          return da - db;
        });
        const partner = candidates[0];
        kingdom.allies.add(partner.id);
        partner.allies.add(kingdom.id);
        kingdom.tension.set(partner.id, 0);
        partner.tension.set(kingdom.id, 0);
        line = chronicle('alliance', { a: kingdom.name, b: partner.name });
        break;
      }
      case 'discord': {
        if (kingdom.allies.size === 0) return null;
        for (const allyId of kingdom.allies) this.kingdoms.get(allyId)?.allies.delete(kingdom.id);
        kingdom.allies.clear();
        line = `Old friends of ${kingdom.name} find they never really liked it`;
        break;
      }
      case 'inspiration': {
        if (village.capital) return null;
        this.politics.secede(village, kingdom, true);
        return `${village.name} is struck by the idea that it could rule itself`;
      }
    }

    if (line) this.events.onEvent(line, 'kingdom', at);
    this.publishSummaries();
    return line;
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
    this.roofCloud.points.removeFromParent();
    this.roofCloud.dispose();
    this.boatCloud.points.removeFromParent();
    this.boatCloud.dispose();
    this.boats.clear();
    this.villages.clear();
    this.kingdoms.clear();
  }
}
