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
  IdentityRow, KingdomSummary, PlotSummary, VillageSummary, WorldLaws,
} from '../store/gameStore';
import type { EntityManager } from './entityManagerMinimal';
import { getBuildingAtlas } from './pixelAtlas';
import { SpriteCloud } from './spriteCloud';
import { BoatSystem, landmasses, nearestWater, type Boat, type Point } from './boats';
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
  groupLayout,
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
  plotShare,
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
  opinionBetween,
  tensionDrift,
  loyaltyFor,
  REBELLION_THRESHOLD,
  type CivilStats,
  type OpinionResult,
} from './politics';
import { speak } from './dialogue';
import { emitShot } from './shotBridge';
import { emitDamage } from './floatBridge';
import { MONSTERS } from './entitySystemMinimal';
import { isChild } from './size';
import { buildingSprite, roofSprite } from './pixelAtlas';
import { conquestOutcome, formationSlots } from './army';
import { foundFaith, holyWarTension } from './religion';
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
import type {
  Building, BuildingKind, BuildingRecipe, DiplomacyAct, Kingdom, SettlementEvents,
  SettlerParty, Village
} from './settlement/types';
import {
  BIRTH_CHANCE_PER_ADULT, BIRTH_FOOD, BIRTH_INTERVAL, BOAT_CAPACITY, BUILDER_STROKE,
  BUILDING_CLOUD_CAPACITY, BUILDING_DRAW_SCALE, BUILDING_HEALTH, BUILDING_YIELD, BUILD_EASE,
  CLAIM_RADIUS, CONTACT_RANGE,
  EXPANSION_APPETITE, FARM_HARVEST, FEEDING_RADIUS, FISHING_MIN_POPULATION, FOUNDING_CLUSTER,
  FOUNDING_RADIUS, HALL_UPGRADE, HOUSE_UPGRADE, HOUSING, HOUSING_SLACK, MAX_BUILDERS, MAX_MINERS,
  MAX_SITES, MAX_WOODCUTTERS, MEAL_PRICE, MIN_VILLAGE_SPACING,
  OVERREACH_ALLOWANCE, PULSE_BY_BUILDING, REBELLION_PATIENCE, RECIPES, ROOF_LIGHT,
  SITE_SELF_PROGRESS, SITING, TAX_RATE, TEMPERAMENT, TOWER_DAMAGE, TOWER_RANGE,
  UNKNOWN_IDENTITY_COLOR, WAR_MAX_ROUNDS,
  WAR_MIN_POPULATION, WAR_WEARY_PEACE_CHANCE, WAR_WEARY_ROUNDS, YOUNG_REALM_PEACE, ZONE_SIZE
} from './settlement/constants';
import {
  adjacentZonesFilled, fitsLayout, footprintOf, groundBonus, isRace, keepIdentifierAhead, mintId,
  pairKey, tierOf, townColour, zoneKey
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
  /** Finds already announced, so a rich vein is news once, not every load. */
  private announcedFinds = new Set<string>();
  private workTimer = 0;
  private buildTimer = 0;
  private diplomacyTimer = 0;
  private expansionTimer = 0;
  private publishTimer = 0;
  private loyaltyTimer = 0;
  private economyTimer = 0;
  private plotTimer = 0;
  /** Live schemes, keyed by id. */
  private plots = new Map<string, Plot>();
  private plotterIds = new Map<string, number>();
  /** Latest opinion per neighbouring pair, keyed by pairKey. */
  private opinions = new Map<string, OpinionResult>();
  laws: WorldLaws = simulation.laws;
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
        ? this.landInvasion(boat, shore)
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
      const town = enemy ? this.nearestVillage(enemy, from.position.x, from.position.y) : null;
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
      if (site.progress >= 1) this.finishBuilding(village, site);
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

  private buildRound(): void {
    for (const village of this.villages.values()) {
      // Industrious towns get an extra attempt each round; everyone else
      // occasionally skips one. Expressed as a chance rather than a separate
      // timer so the two traits stay symmetrical and there is one place to
      // read the rule.
      // Sites creep up on their own, slowly; builders are what make them fly.
      this.advanceSites(village, SITE_SELF_PROGRESS);
      if (!groupHasCultureTrait(village.id, 'industrious') && Math.random() < 0.25) continue;
      // A town works on a couple of things at once, not on every plot it owns.
      const sites = village.buildings.filter(b => b.progress !== undefined).length;
      if (sites >= MAX_SITES) continue;

      const recipe = this.nextRecipe(village);
      if (!recipe) continue;
      const spot = this.findBuildSpot(village, recipe.kind);
      if (!spot) continue;

      village.store.wood -= recipe.wood;
      village.store.stone -= recipe.stone;
      // Raised as a site: the builders walk over and put it up, and it only
      // counts once they have. The bonfire and a founding's first tents are
      // the exceptions, placed whole by createVillage.
      this.placeBuilding(village, recipe.kind, spot.x, spot.y, true);
      const raised = village.buildings[village.buildings.length - 1];
      if (raised) this.layRoads(village, raised);
      this.claimTerritory(village);
    }
  }

  /** Builders' work, and what the weather and the passers-by add on their own. */
  private advanceSites(village: Village, amount: number): void {
    for (const building of village.buildings) {
      if (building.progress === undefined) continue;
      building.progress += amount * (BUILD_EASE[building.kind] ?? 1);
      if (building.progress >= 1) this.finishBuilding(village, building);
    }
  }

  /** The scaffolding comes down. Monuments and halls are news. */
  private finishBuilding(village: Village, building: Building): void {
    delete building.progress;
    building.health = building.maxHealth;
    this.paintBuilding(village, building);
    const { kind, x, y } = building;
    if (kind === 'hall') {
      this.events.onEvent(chronicle('hall_raised', { name: village.name }), 'kingdom', { x, y });
    } else if (kind === 'temple' || kind === 'statue' || kind === 'library') {
      // A temple or a library is where a people writes itself down.
      const identity = groupMetas(village.id);
      if (identity) {
        const book = writeBook(x, y, identity);
        this.events.onEvent(chronicle('book_written', { name: book.title, a: village.name }), 'kingdom', { x, y });
      }
      this.events.onEvent(chronicle('monument_raised', { name: village.name, type: kind }), 'kingdom', { x, y });
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
      if (recipe.needs && !village.buildings.some(b => b.kind === recipe.needs)) continue;
      if (village.store.wood < recipe.wood || village.store.stone < recipe.stone) continue;
      // Mines only make sense on or beside stone
      if (recipe.kind === 'mine' && !this.hasRockNearby(village)) continue;
      // ...and docks beside the sea. Without this an inland town would pick a
      // dock every round, find nowhere for it, and never build anything else.
      if (recipe.kind === 'dock' && !this.findShoreSpot(village)) continue;
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

  /**
   * Where the next building goes.
   *
   * Two stages, which is how WorldBox gets towns that look designed without a
   * city planner (09-WORLDBOX-VISUAL-RESEARCH.md §6): choose a *zone*, then
   * choose a tile inside it by the culture's layout rule. Regular spacing falls
   * out of the zone grid for free, and the layout rule makes two towns of
   * different peoples distinguishable at a glance.
   *
   * Replaces a ring-walk that picked the first free tile outward from the
   * centre, which produced a solid blob with no streets and looked identical
   * for every culture.
   */
  private findBuildSpot(village: Village, kind: BuildingKind): { x: number; y: number } | null {
    if (SITING[kind] === 'shore') return this.findShoreSpot(village);
    const reach = kind === 'farm' ? 7 : 6;
    const occupied = this.occupiedTiles(village);
    const siting = SITING[kind] ?? 'cluster';
    const layout = groupLayout(village.id);

    // Which zones already hold something of ours, so the siting rules below
    // have neighbours to test against.
    const filledZones = new Set<string>();
    for (const building of village.buildings) {
      filledZones.add(zoneKey(building.x, building.y));
    }

    const candidates: Array<{ x: number; y: number; score: number }> = [];

    for (let dx = -reach; dx <= reach; dx += 1) {
      for (let dy = -reach; dy <= reach; dy += 1) {
        const x = village.centerX + dx;
        const y = village.centerY + dy;
        if (!this.footprintFits(x, y, kind, occupied)) continue;

        // Stage two: does this tile suit the culture's street pattern?
        if (!fitsLayout(layout, x, y, village)) continue;

        // Stage one, expressed as a filter on the tile's zone.
        const neighbours = adjacentZonesFilled(x, y, filledZones);
        if (siting === 'cluster' && filledZones.size > 0 && neighbours === 0) continue;
        if (siting === 'solitary' && neighbours > 0) continue;
        if (siting === 'border' && !this.zoneTouchesForeignLand(x, y, village)) continue;

        // Prefer close to the centre, so a town grows outward rather than
        // sprinkling itself across its whole claim.
        candidates.push({ x, y, score: Math.abs(dx) + Math.abs(dy) + Math.random() * 3 });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.score - b.score);
      return { x: candidates[0].x, y: candidates[0].y };
    }

    // Nothing satisfied the rules. Relax them rather than never building.
    //
    // A `solitary` temple in a town that has filled every zone would otherwise
    // find nowhere for ever, and the failure is silent — the village simply
    // stops progressing and nothing says why. A siting class is a preference
    // about where a building looks right, not a law about whether it may exist.
    if (siting !== 'cluster' || layout !== 'scattered') {
      return this.findBuildSpotRelaxed(village, kind, occupied);
    }
    return null;
  }

  /**
   * Land with sea beside it, nearest the centre: where a dock goes. Street
   * patterns do not apply — the coast decides where a harbour can be.
   */
  private findShoreSpot(village: Village): { x: number; y: number } | null {
    const occupied = this.occupiedTiles(village);
    let best: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    for (let dx = -7; dx <= 7; dx += 1) {
      for (let dy = -7; dy <= 7; dy += 1) {
        const x = village.centerX + dx;
        const y = village.centerY + dy;
        if (!this.footprintFits(x, y, 'dock', occupied)) continue;
        const wet = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => {
          const tile = this.tileAt(x + ox, y + oy);
          return tile ? isWaterBiome(tile.type) : false;
        });
        if (!wet) continue;
        const score = Math.abs(dx) + Math.abs(dy);
        if (score < bestScore) { bestScore = score; best = { x, y }; }
      }
    }
    return best;
  }

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

  /** Any legal tile at all, ignoring zone and layout rules. */
  private findBuildSpotRelaxed(
    village: Village, kind: BuildingKind, occupied: ReadonlySet<string>,
  ): { x: number; y: number } | null {
    const reach = kind === 'farm' ? 7 : 6;
    for (let radius = 1; radius <= reach; radius += 1) {
      const ring: Array<{ x: number; y: number }> = [];
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = village.centerX + dx;
          const y = village.centerY + dy;
          if (!this.footprintFits(x, y, kind, occupied)) continue;
          ring.push({ x, y });
        }
      }
      if (ring.length > 0) return ring[Math.floor(Math.random() * ring.length)];
    }
    return null;
  }

  /** Every tile a village's buildings already stand on, footprints included. */
  private occupiedTiles(village: Village): Set<string> {
    const taken = new Set<string>();
    for (const building of village.buildings) {
      const span = footprintOf(building.kind);
      for (let dx = 0; dx < span; dx += 1) {
        for (let dy = 0; dy < span; dy += 1) {
          taken.add(`${building.x + dx},${building.y + dy}`);
        }
      }
    }
    return taken;
  }

  /**
   * Could this kind of building stand with its corner here?
   *
   * Every tile of the footprint has to pass, not just the anchor — a hall whose
   * corner is on good ground and whose far side is in a lake is a hall in a
   * lake. The terrain rules were duplicated between the strict and the relaxed
   * search before this, which is exactly the sort of pair that drifts apart.
   */
  private footprintFits(
    x: number, y: number, kind: BuildingKind, occupied: ReadonlySet<string>,
  ): boolean {
    const span = footprintOf(kind);
    for (let dx = 0; dx < span; dx += 1) {
      for (let dy = 0; dy < span; dy += 1) {
        const tx = x + dx;
        const ty = y + dy;
        if (occupied.has(`${tx},${ty}`)) return false;
        const tile = this.tileAt(tx, ty);
        if (!tile || tile.villageId) return false;
        if (isWaterBiome(tile.type) || tile.height < 0.28) return false;
        if (tile.type === 'mountains' && kind !== 'mine') return false;
        if (kind === 'farm' && tile.fertility < 0.3) return false;
        if (kind === 'mine' && tile.type !== 'mountains' && tile.type !== 'hills') return false;
      }
    }
    return true;
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

  /**
   * Does this tile's zone border land that is not ours?
   *
   * Used by watchtowers, which is what makes them appear on the frontier rather
   * than in the middle of town — with no code that mentions frontiers.
   */
  private zoneTouchesForeignLand(x: number, y: number, village: Village): boolean {
    const kingdom = this.kingdoms.get(village.kingdomId);
    if (!kingdom) return false;
    for (let dx = -ZONE_SIZE; dx <= ZONE_SIZE; dx += ZONE_SIZE) {
      for (let dy = -ZONE_SIZE; dy <= ZONE_SIZE; dy += ZONE_SIZE) {
        if (dx === 0 && dy === 0) continue;
        const tile = this.tileAt(x + dx, y + dy);
        if (!tile) continue;
        if (tile.ownerId && tile.ownerId !== kingdom.id) return true;
        if (!tile.ownerId) return true;
      }
    }
    return false;
  }

  private placeBuilding(village: Village, kind: BuildingKind, x: number, y: number, site = false): void {
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

  /** Put a building's sprite in the cloud, or refresh it after an upgrade. */
  private paintBuilding(village: Village, building: Building): void {
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

  /**
   * A town grows up as well as out. Once it has a hall its houses can be
   * rebuilt in stone, and once it has a temple or a library, as manors —
   * WorldBox's building tiers, which are most of why an old capital looks
   * nothing like a new village. One house a round, cheapest first.
   */
  private upgradeRound(): void {
    for (const village of this.villages.values()) {
      const has = (kind: BuildingKind) => village.buildings.some(b => b.kind === kind);
      this.upgradeHall(village, has);
      const ceiling = !has('hall') ? 1 : has('temple') || has('library') ? 3 : 2;
      if (ceiling === 1) continue;
      const house = village.buildings
        .filter(b => b.kind === 'house' && b.progress === undefined && (b.level ?? 1) < ceiling)
        .sort((a, b) => (a.level ?? 1) - (b.level ?? 1))[0];
      if (!house) continue;
      const next = (house.level ?? 1) + 1;
      const cost = HOUSE_UPGRADE[next];
      if (!cost) continue;
      if (village.store.wood < cost.wood || village.store.stone < cost.stone || village.store.gold < cost.gold) continue;
      village.store.wood -= cost.wood;
      village.store.stone -= cost.stone;
      village.store.gold -= cost.gold;
      house.level = next;
      house.maxHealth = Math.round(BUILDING_HEALTH.house * (1 + (next - 1) * 0.5));
      house.health = house.maxHealth;
      this.paintBuilding(village, house);
    }
  }

  /**
   * The hall grows with the town: rebuilt in stone once there are houses to
   * govern, and raised into a castle once the town keeps a temple and a
   * barracks. A castle stands stronger, claims further and shoots.
   */
  private upgradeHall(village: Village, has: (kind: BuildingKind) => boolean): void {
    const hall = village.buildings.find(b => b.kind === 'hall');
    if (!hall) return;
    const level = hall.level ?? 1;
    const houses = village.buildings.filter(b => b.kind === 'house').length;
    const next = level === 1 && houses >= 5 ? 2
      : level === 2 && has('temple') && has('barracks') ? 3 : 0;
    if (!next) return;
    const cost = HALL_UPGRADE[next];
    if (village.store.wood < cost.wood || village.store.stone < cost.stone || village.store.gold < cost.gold) return;
    village.store.wood -= cost.wood;
    village.store.stone -= cost.stone;
    village.store.gold -= cost.gold;
    hall.level = next;
    hall.maxHealth = Math.round(BUILDING_HEALTH.hall * (1 + (next - 1) * 0.75));
    hall.health = hall.maxHealth;
    this.paintBuilding(village, hall);
    this.events.onEvent(
      next === 3 ? `${village.name} raises a castle` : `${village.name} rebuilds its hall in stone`,
      'kingdom',
      { x: hall.x, y: hall.y },
    );
  }

  /**
   * Lay a path from a new building to the two nearest ones already standing.
   *
   * Their trick, and it is almost free: connect each new building to its two
   * nearest neighbours as it is planned, at no resource cost. Two rather than
   * one, because one gives you a tree with no loops and a real village has
   * junctions. The result is a plausible organic street mesh that nobody
   * designed (09-WORLDBOX-VISUAL-RESEARCH.md §6).
   *
   * Roads are drawn as an L — along x, then along y. A* would be prettier and
   * would also make roads bend around ponds and pick their way uphill, which
   * costs a pathfind per building for a difference nobody would notice at this
   * tile size.
   */
  private layRoads(village: Village, from: Building): void {
    const others = village.buildings.filter(b => b.id !== from.id);
    if (others.length === 0) return;

    const nearest = others
      .map(b => ({ b, d: Math.abs(b.x - from.x) + Math.abs(b.y - from.y) }))
      .sort((p, q) => p.d - q.d)
      .slice(0, 2);

    for (const { b } of nearest) {
      const stepX = Math.sign(b.x - from.x);
      for (let x = from.x; x !== b.x; x += stepX) this.pave(x, from.y);
      const stepY = Math.sign(b.y - from.y);
      for (let y = from.y; y !== b.y; y += stepY) this.pave(b.x, y);
    }
  }

  /** Mark one tile as road, if it is somewhere a road could go. */
  private pave(x: number, y: number): void {
    const tile = this.tileAt(x, y);
    if (!tile || tile.road) return;
    // No roads across water or through a building's own tile — a bridge is a
    // different feature and a path under a house is invisible anyway.
    if (isWaterBiome(tile.type) || tile.villageId) return;
    tile.road = true;
    this.terrain.syncTile(tile, simulation.timeOfDay, simulation.season);
  }

  private removeBuilding(village: Village, building: Building): void {
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

      const contested = Boolean(kingdom.kingId) && candidates.length >= 3;
      kingdom.kingId = heir.id;
      kingdom.ruler = heir.name;
      applyStatus(heir, 'king');
      applyScenario(heir, 'crowned');
      this.events.onEvent(
        chronicle('crowned_king', { name: heir.name, a: kingdom.name }),
        'kingdom',
        { x: Math.floor(heir.position.x), y: Math.floor(heir.position.y) },
      );

      // A war of succession. When a crown passes in a big realm, the
      // runner-up does not always bend the knee: if its claim was nearly as
      // good, its town may go its own way, and WorldBox's great empires break
      // up exactly like this, on a death rather than a grievance.
      if (contested && this.laws.rebellions) {
        const heirClaim = leadership(civilStats(heir));
        const rival = candidates
          .filter(c => c.id !== heir.id && c.villageId)
          .sort((p, q) => leadership(civilStats(q)) - leadership(civilStats(p)))[0];
        const rivalTown = rival?.villageId ? this.villages.get(rival.villageId) : null;
        if (rival && rivalTown && !rivalTown.capital
          && leadership(civilStats(rival)) >= heirClaim * 0.85 && Math.random() < 0.35) {
          this.events.onEvent(
            `${rival.name} will not kneel to ${heir.name}. ${rivalTown.name} goes to war over the crown of ${kingdom.name}`,
            'war',
            { x: rivalTown.centerX, y: rivalTown.centerY },
          );
          this.secede(rivalTown, kingdom);
        }
      }
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
  private secede(village: Village, from: Kingdom, forced = false): void {
    // The player's Independence power overrides the law; nothing else does.
    if (!forced && !this.laws.rebellions) return;
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
    // New realm, new roofs.
    for (const building of village.buildings) this.paintBuilding(village, building);

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

  /**
   * Everyone currently scheming, mapped to how far along they are, refreshed
   * once per plot round.
   *
   * The icon rail asks this every frame for every visible unit, so it must not
   * walk the plot map each time — a map built when plots change is the whole
   * difference between "free" and "quadratic in the population". It carries
   * the progress share as well as the id so the rail can colour the icon by
   * it: "someone is plotting" and "someone is about to move" are very
   * different pieces of news, and only one of them is worth interrupting for.
   */
  plottingIds(): ReadonlyMap<string, number> {
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
    for (const plot of this.plots.values()) {
      // The furthest-along scheme wins when someone is running more than one:
      // the icon is a warning, and a warning should show the nearest threat.
      const share = plotShare(plot);
      const known = this.plotterIds.get(plot.plotterId);
      if (known === undefined || share > known) this.plotterIds.set(plot.plotterId, share);
    }
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
          if (stats.diplomacy >= 7 && this.laws.diplomacy && Math.random() < 0.3) {
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
        if (religion) {
          const prophet = this.entities.getAllEntities().find(e => e.villageId === village.id && e.status.includes('priest'));
          foundFaith(religion, prophet?.name ?? null, village.name);
        }
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

  /**
   * Gather everything the opinion formula needs about a pair.
   *
   * Symmetric on purpose: a single score per pair rather than one each way.
   * Two directed opinions would be more faithful to real diplomacy and would
   * double the state for no gain here, because nothing in the simulation acts
   * on the asymmetry — war and peace are both mutual.
   */
  private opinionFor(a: Kingdom, b: Kingdom, borderTiles: number): OpinionResult {
    const mine = groupMetas(a.id);
    const theirs = groupMetas(b.id);
    const compare = (
      pick: (set: ReturnType<typeof groupMetas>) => string | null | undefined,
    ): boolean | null => {
      const left = pick(mine);
      const right = pick(theirs);
      if (!left || !right) return null;
      return left === right;
    };

    return opinionBetween({
      ourKing: this.kingCivilStats(a),
      theirKing: this.kingCivilStats(b),
      borderTiles,
      ourLand: this.landOf(a),
      theirLand: this.landOf(b),
      sameRace: a.race === b.race,
      sameCulture: compare(set => set?.culture),
      sameLanguage: compare(set => set?.language),
      sameReligion: compare(set => set?.religion),
      holyWar: holyWarTension(mine?.religion ?? null, theirs?.religion ?? null),
      atWar: a.atWar.has(b.id),
      allied: a.allies.has(b.id),
      foughtBefore: this.warTimers.has(pairKey(a.id, b.id)),
      temperament: Math.max(TEMPERAMENT[a.race] ?? 0, TEMPERAMENT[b.race] ?? 0)
        + Math.min(TEMPERAMENT[a.race] ?? 0, TEMPERAMENT[b.race] ?? 0) / 2,
      landHungry: this.isLandHungry(a) || this.isLandHungry(b),
      tradePartners: this.trade.partners(a.id, b.id),
    });
  }

  /** Everyone living in a kingdom's towns. */
  private populationOf(kingdom: Kingdom): number {
    const members = this.entities.getEntitiesByVillage();
    return kingdom.villageIds.reduce((sum, id) => sum + (members.get(id)?.length ?? 0), 0);
  }

  /** How many towns this kingdom will try to hold before it stops settling. */
  colonyLimit(kingdom: Kingdom): number {
    return governableVillages(this.kingCivilStats(kingdom))
      + (EXPANSION_APPETITE[kingdom.race] ?? 0)
      + OVERREACH_ALLOWANCE
      + (groupHasCultureTrait(kingdom.id, 'expansionist') ? 2 : 0);
  }

  /**
   * A realm that has as many towns as it can hold, and towns that are full,
   * has nowhere to grow but into its neighbour. This is WorldBox's real war
   * engine: peace ends when the land runs out.
   */
  private isLandHungry(kingdom: Kingdom): boolean {
    if (kingdom.villageIds.length < this.colonyLimit(kingdom)) return false;
    const members = this.entities.getEntitiesByVillage();
    return kingdom.villageIds.some((id) => {
      const village = this.villages.get(id);
      return village ? (members.get(id)?.length ?? 0) >= this.homesIn(village) : false;
    });
  }

  /** What every pair of neighbouring realms thinks of each other. */
  opinionRows(): Array<{
    a: string; b: string; colorA: string; colorB: string;
    score: number; factors: Array<{ label: string; value: number }>;
    atWar: boolean; allied: boolean;
  }> {
    const rows = [];
    for (const [key, opinion] of this.opinions) {
      const [aId, bId] = key.split('|');
      const a = this.kingdoms.get(aId);
      const b = this.kingdoms.get(bId);
      if (!a || !b) continue;
      rows.push({
        a: a.name, b: b.name,
        colorA: a.colorHex, colorB: b.colorHex,
        score: opinion.score, factors: opinion.factors,
        atWar: a.atWar.has(bId), allied: a.allies.has(bId),
      });
    }
    // Worst first: the pair about to go to war is the interesting row.
    return rows.sort((x, y) => x.score - y.score);
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

    // Realms that do not touch still know of each other when their towns
    // are close, or face each other across a strait. Without this, two
    // kingdoms with a strip of wild land between them never fell out at all.
    const towns = Array.from(this.villages.values());
    for (let i = 0; i < towns.length; i++) {
      for (let j = i + 1; j < towns.length; j++) {
        const a = towns[i];
        const b = towns[j];
        if (a.kingdomId === b.kingdomId) continue;
        if (Math.hypot(a.centerX - b.centerX, a.centerY - b.centerY) > CONTACT_RANGE) continue;
        const key = pairKey(a.kingdomId, b.kingdomId);
        if ((contact.get(key) ?? 0) < 6) contact.set(key, 6);
      }
    }

    for (const [key, borderTiles] of contact) {
      const [aId, bId] = key.split('|');
      const a = this.kingdoms.get(aId);
      const b = this.kingdoms.get(bId);
      if (!a || !b || a.atWar.has(bId)) continue;
      if (a.allies.has(bId)) continue;
      // A newborn realm is left alone long enough to put down roots: WorldBox
      // gives young kingdoms a few years before anyone comes for them.
      if (a.age < YOUNG_REALM_PEACE || b.age < YOUNG_REALM_PEACE) continue;

      // Tension now follows opinion rather than a pair of magic constants.
      // It used to grow at 0.055 a round, or 0.11 if either side was an orc,
      // and nothing else entered into it — so two realms sharing a culture, a
      // language and a faith marched on each other exactly as fast as two
      // that shared nothing.
      const opinion = this.opinionFor(a, b, borderTiles);
      this.opinions.set(key, opinion);

      const drift = tensionDrift(opinion.score) * Math.min(3, borderTiles / 10);
      const tension = Math.max(0, Math.min(1.2, (a.tension.get(bId) ?? 0) + drift));
      a.tension.set(bId, tension);
      b.tension.set(aId, tension);

      // A realm of a dozen souls cannot start a war, however much it hates
      // its neighbour; the one that is big enough can.
      if (tension >= 1 && (this.populationOf(a) >= WAR_MIN_POPULATION || this.populationOf(b) >= WAR_MIN_POPULATION)) {
        this.declareWar(a, b);
      }
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

        // Wars burn out — late, and by exhaustion more often than on a clock —
        // or end when one side has nothing left to lose.
        const weary = rounds > WAR_WEARY_ROUNDS && Math.random() < WAR_WEARY_PEACE_CHANCE;
        if (rounds > WAR_MAX_ROUNDS || weary || enemy.villageIds.length === 0 || kingdom.villageIds.length === 0) {
          this.makePeace(kingdom, enemy);
          continue;
        }

        this.sendRaid(kingdom, enemy, warriorsByKingdom.get(kingdom.id) ?? []);
        this.sendRaid(enemy, kingdom, warriorsByKingdom.get(enemy.id) ?? []);
      }
    }
  }

  private sendRaid(attacker: Kingdom, defender: Kingdom, warriors: Entity[]): void {
    if (warriors.length === 0) return;
    let masses: { label: Int32Array; sizes: number[] } | null = null;
    const size = this.tiles.length;

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
      // Across the water: walking will never get there, so take ship.
      masses ??= landmasses(this.tiles);
      const here = masses.label[Math.floor(warrior.position.y) * size + Math.floor(warrior.position.x)];
      const there = masses.label[target.centerY * size + target.centerX];
      if (here >= 0 && there >= 0 && here !== there) {
        this.sendInvasion(attacker, warrior, warriors, target);
        continue;
      }
      this.entities.giveOrder(warrior, {
        kind: 'goto',
        x: target.centerX,
        y: target.centerY,
        purpose: 'raid',
      });
    }
  }

  /** Towns that recently launched an invasion, and when they may launch again. */
  private invasionCooldown = new Map<string, number>();

  /**
   * Put a captain and its warband in a transport bound for an enemy town on
   * another island. WorldBox's wars cross the sea; ours used to stop at the
   * shoreline and stand there, which made every island kingdom untouchable.
   */
  private sendInvasion(attacker: Kingdom, captain: Entity, warriors: Entity[], target: Village): void {
    const home = captain.villageId ? this.villages.get(captain.villageId) : null;
    if (!home) return;
    const now = home.age;
    if ((this.invasionCooldown.get(home.id) ?? -Infinity) > now) return;
    const departure = this.harbourOf(home, 8);
    const landing = nearestWater(this.tiles, { x: target.centerX, y: target.centerY }, 7);
    if (!departure || !landing) return;
    const crew = warriors
      .filter(w => w.villageId === home.id && w.health > 0 && !w.status.includes('aboard'))
      .slice(0, 8);
    if (crew.length < 2) return;
    const boat = this.boats.launchTransport(attacker.id, departure, landing, crew.map(c => c.id), `invasion:${target.id}`);
    if (!boat) {
      this.invasionCooldown.set(home.id, now + 60);
      return;
    }
    this.invasionCooldown.set(home.id, now + 120);
    emitFloater({ kind: 'speech', text: speak('sailing', Math.random()), x: captain.position.x, y: captain.position.y, entityId: captain.id });
    for (const soldier of crew) {
      this.entities.setHerdAnchor(soldier, null);
      applyStatus(soldier, 'aboard');
      soldier.position = { x: boat.x, y: boat.y };
    }
    this.events.onEvent(
      `The army of ${attacker.name} takes ship for ${target.name}`,
      'war',
      { x: home.centerX, y: home.centerY },
    );
  }

  /** An invasion fleet made landfall: everyone off, and up the beach at the town. */
  private landInvasion(boat: Boat, shore: Point): void {
    const target = this.villages.get(boat.payload!.slice('invasion:'.length));
    for (const id of boat.passengers) {
      const soldier = this.entities.getEntityById(id);
      if (!soldier) continue;
      clearStatus(soldier, 'aboard');
      soldier.position = { x: shore.x + 0.5, y: shore.y + 0.5 };
      if (target) this.entities.giveOrder(soldier, { kind: 'goto', x: target.centerX, y: target.centerY, purpose: 'raid' });
    }
    const kingdom = this.kingdoms.get(boat.kingdomId);
    this.events.onEvent(
      `The army of ${kingdom?.name ?? 'a fallen kingdom'} comes ashore below ${target?.name ?? 'an empty shore'}`,
      'war',
      shore,
    );
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

        if (building.kind === 'bonfire') {
          const conqueror = this.kingdoms.get(attackers[0]?.kingdomId ?? '');
          const residents = this.entities.getEntitiesByVillage().get(village.id)?.length ?? 0;
          if (conqueror && conquestOutcome(conqueror.race, residents) === 'capture') {
            building.health = building.maxHealth * 0.5;
            this.captureVillage(village, kingdom, conqueror);
          } else {
            this.removeBuilding(village, building);
            this.destroyVillage(village, conqueror?.id ?? null);
          }
          break;
        }
        this.removeBuilding(village, building);
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

  /**
   * A town taken rather than burned: it changes flag with its people and its
   * land, and the border on the map moves. The people stay — a conquered
   * town is still a town — but its headman and captain lose their offices.
   */
  private captureVillage(village: Village, from: Kingdom, to: Kingdom): void {
    const index = from.villageIds.indexOf(village.id);
    if (index !== -1) from.villageIds.splice(index, 1);
    if (village.capital) {
      const heir = from.villageIds.map(id => this.villages.get(id)).find((v): v is Village => Boolean(v));
      if (heir) heir.capital = true;
    }
    village.kingdomId = to.id;
    village.capital = false;
    village.restless = 0;
    to.villageIds.push(village.id);
    this.captains.delete(village.id);
    this.leaders.delete(village.id);

    const conquered = this.entities.getEntitiesByVillage().get(village.id) ?? [];
    for (const resident of conquered) {
      resident.kingdomId = to.id;
      this.clearOffices(resident);
      if (resident.job === 'warrior') resident.job = null;
    }
    if (conquered[0]) {
      emitFloater({ kind: 'speech', text: speak('captured', Math.random()), x: conquered[0].position.x, y: conquered[0].position.y, entityId: conquered[0].id });
    }

    for (const id of village.territory) {
      const tile = this.tileFromInstanceId(id);
      if (tile) tile.ownerId = null;
    }
    village.territory.clear();
    this.claimTerritory(village);
    // Roofs wear their kingdom's colour; repaint them.
    for (const building of village.buildings) this.paintBuilding(village, building);

    this.events.onEvent(
      `${village.name} falls to ${to.name}, and flies its banner now`,
      'war',
      { x: village.centerX, y: village.centerY },
    );
    requestFlash('blood', 0.5);
    this.publishSummaries();
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
      const town = enemy ? this.nearestVillage(enemy, from.position.x, from.position.y) : null;
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

  private publishSummaries(): void {
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
    this.events.onPlotsChanged?.(this.plotSummaries());
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
    if (!a || !b || a === b) return false;
    return this.kingdoms.get(a)?.atWar.has(b) ?? false;
  }

  // -- helpers -----------------------------------------------------------

  tileAt(x: number, y: number): Tile | null {
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
          if (other) this.makePeace(kingdom, other);
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
        this.declareWar(kingdom, target);
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
        this.secede(village, kingdom, true);
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
