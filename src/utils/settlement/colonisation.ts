// Colonisation: the settler parties that found new towns, the boats that carry
// them across the water, and the migrants who turn up at struggling towns.
//
// A kingdom that has run out of land sends people out. A party walks to a site
// it can reach or sails to one across the water, and the village is founded
// when they arrive (see `foundColony`). The core calls `update` once a step,
// which keeps the colony and migrant clocks and ages the parties on the road.
// This subsystem sees the rest of the world only through `SettlementHost`.

import type { Entity } from '../../types/world';
import { isWaterBiome } from '../../types/world';
import { landmasses, nearestWater, waterPath, type Boat, type Point } from '../boats';
import { chronicle } from '../chronicle';
import { groupHasCultureTrait } from '../identity';
import { isChild } from '../size';
import { applyStatus, clearStatus } from '../statusEffects';
import {
  MIN_COLONY_ISLAND, MIN_VILLAGE_SPACING, OVERSEAS_RANGE, SETTLER_PARTY_MAX, SETTLER_PARTY_MIN,
  SETTLER_SOURCE_POPULATION, SETTLE_RANGE, SETTLE_TIMEOUT,
} from './constants';
import { mintId } from './helpers';
import type { SettlementHost } from './host';
import type { Kingdom, SettlerParty, Village } from './types';
import { random } from '../random';

export class Colonisation {
  private colonyTimer = 0;
  private migrantTimer = 0;
  /** Settler parties on the road or at sea, keyed by party id. */
  readonly parties = new Map<string, SettlerParty>();

  constructor(private readonly host: SettlementHost) {}

  /** Advance the colony and migrant clocks; parties on the road are aged each step. */
  update(delta: number): void {
    this.colonyTimer += delta;
    if (this.colonyTimer >= 8) {
      this.colonyTimer = 0;
      this.colonyRound();
    }
    this.ageParties(delta);

    this.migrantTimer += delta;
    if (this.migrantTimer >= 60) {
      this.migrantTimer = 0;
      if (this.host.laws.migrants) this.migrantRound();
    }
  }

  /**
   * Kingdoms grow by sending people out, not by inflating one village. A
   * settled village with people to spare picks a site a good walk away and
   * sends a party; the new village is founded when they arrive, so the player
   * watches it happen (research doc section 3).
   */
  private colonyRound(): void {
    if (!this.host.laws.colonisation) return;
    for (const kingdom of this.host.kingdoms.values()) {
      if (kingdom.atWar.size > 0) continue; // nobody colonises mid-war
      const limit = this.host.colonyLimit(kingdom);
      const pending = Array.from(this.parties.values())
        .filter(party => party.kingdomId === kingdom.id).length;
      // One expedition at a time: three parties leaving at once empties the
      // capital and none of the colonies gets enough people to survive.
      if (pending > 0) continue;
      if (kingdom.villageIds.length + pending >= limit) continue;

      const source = this.pickSettlerSource(kingdom);
      if (!source) continue;
      // An insular people stays home until home is full. It used to never
      // leave at all, which turned one culture roll into a realm frozen at a
      // single town for the rest of the world's life.
      if (groupHasCultureTrait(kingdom.id, 'insular')
        && this.host.residentsOf(source).length < this.host.homesIn(source)) continue;

      // Which landmass is which, so walkers only aim at ground they can
      // actually walk to and everything else is a job for a boat.
      const masses = landmasses(this.host.tiles);
      const site = this.findSettlementSite(source, masses.label);
      if (site) {
        this.sendSettlers(kingdom, source, site);
        continue;
      }
      const voyage = this.planVoyage(source, masses);
      if (voyage) this.sendSettlersBySea(kingdom, source, voyage);
    }
  }

  /** A village old enough and populous enough to spare a few people. */
  private pickSettlerSource(kingdom: Kingdom): Village | null {
    let best: Village | null = null;
    let bestPopulation = 0;

    for (const villageId of kingdom.villageIds) {
      const village = this.host.villages.get(villageId);
      if (!village) continue;
      // Don't hollow out a village that is still finding its feet
      if (village.age < 25) continue;
      const residents = this.host.residentsOf(village);
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

  /** Somewhere habitable, unclaimed, and far enough from every other village. */
  private findSettlementSite(source: Village, islands?: Int32Array): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestScore = -Infinity;
    const size = this.host.tiles.length;
    const home = islands ? islands[source.centerY * size + source.centerX] : -1;

    for (let attempt = 0; attempt < 90; attempt++) {
      const angle = random() * Math.PI * 2;
      const distance = MIN_VILLAGE_SPACING + random() * (SETTLE_RANGE - MIN_VILLAGE_SPACING);
      const x = Math.round(source.centerX + Math.cos(angle) * distance);
      const y = Math.round(source.centerY + Math.sin(angle) * distance);

      const tile = this.host.tileAt(x, y);
      if (!tile) continue;
      if (isWaterBiome(tile.type) || tile.height < 0.28) continue;
      if (tile.type === 'mountains' || tile.type === 'snow' || tile.type === 'volcanic') continue;
      if (tile.ownerId && tile.ownerId !== source.kingdomId) continue;
      if (tile.villageId) continue;
      if (this.host.tooCloseToVillage(x, y)) continue;
      // Across the water is not a walk.
      if (islands && home >= 0 && islands[y * size + x] !== home) continue;

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
    const residents = this.host.residentsOf(source)
      .filter(entity => !isChild(entity) && entity.health > entity.maxHealth * 0.5);
    if (residents.length < SETTLER_SOURCE_POPULATION) return;

    // Never send so many that the source village cannot look after itself
    const spare = Math.max(0, residents.length - SETTLER_SOURCE_POPULATION + 1);
    const size = Math.min(
      spare,
      SETTLER_PARTY_MIN + Math.floor(random() * (SETTLER_PARTY_MAX - SETTLER_PARTY_MIN + 1)),
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
      this.host.clearOffices(settler);
      party.memberIds.add(settler.id);
      this.host.entities.giveOrder(settler, {
        kind: 'goto',
        x: site.x,
        y: site.y,
        purpose: 'settle',
      });
    }

    if (party.memberIds.size === 0) return;
    this.parties.set(party.id, party);
    this.host.events.onEvent(
      chronicle('settlers_leave', { name: source.name }),
      'kingdom',
      { x: source.centerX, y: source.centerY },
    );
  }

  /**
   * Somewhere across the sea worth sailing to, with a route that gets there.
   *
   * Only asked once the home island has nowhere left: a kingdom takes to the
   * water because it has run out of land, which is also what makes the first
   * boat leaving a moment worth noticing.
   */
  private planVoyage(
    source: Village,
    masses: { label: Int32Array; sizes: number[] },
  ): { site: Point; departure: Point; landing: Point } | null {
    const size = this.host.tiles.length;
    const home = masses.label[source.centerY * size + source.centerX];
    const departure = this.host.harbourOf(source, 10);
    if (!departure) return null;

    const candidates: Array<{ site: Point; score: number }> = [];
    for (let attempt = 0; attempt < 120; attempt++) {
      const angle = random() * Math.PI * 2;
      const distance = 12 + random() * (OVERSEAS_RANGE - 12);
      const x = Math.round(source.centerX + Math.cos(angle) * distance);
      const y = Math.round(source.centerY + Math.sin(angle) * distance);
      const tile = this.host.tileAt(x, y);
      if (!tile || isWaterBiome(tile.type) || tile.height < 0.28) continue;
      if (tile.type === 'mountains' || tile.type === 'snow' || tile.type === 'volcanic') continue;
      if (tile.villageId || (tile.ownerId && tile.ownerId !== source.kingdomId)) continue;
      const island = masses.label[y * size + x];
      if (island === home || island < 0 || masses.sizes[island] < MIN_COLONY_ISLAND) continue;
      if (this.host.tooCloseToVillage(x, y)) continue;
      candidates.push({ site: { x, y }, score: tile.fertility * 3 - distance / OVERSEAS_RANGE });
    }
    candidates.sort((a, b) => b.score - a.score);
    for (const { site } of candidates.slice(0, 3)) {
      const landing = nearestWater(this.host.tiles, site, 6);
      if (!landing) continue;
      if (waterPath(this.host.tiles, departure, landing)) return { site, departure, landing };
    }
    return null;
  }

  /** Put a party in a boat and send it across. */
  private sendSettlersBySea(
    kingdom: Kingdom,
    source: Village,
    voyage: { site: Point; departure: Point; landing: Point },
  ): void {
    const residents = this.host.residentsOf(source)
      .filter(entity => !isChild(entity) && entity.health > entity.maxHealth * 0.5);
    const spare = Math.max(0, residents.length - SETTLER_SOURCE_POPULATION + 1);
    const size = Math.min(
      spare,
      SETTLER_PARTY_MIN + Math.floor(random() * (SETTLER_PARTY_MAX - SETTLER_PARTY_MIN + 1)),
    );
    if (size < SETTLER_PARTY_MIN) return;
    const crew = residents.slice(0, size);
    const party: SettlerParty = {
      id: mintId('party'),
      kingdomId: kingdom.id,
      sourceVillageId: source.id,
      target: voyage.site,
      memberIds: new Set(crew.map(c => c.id)),
      // The crossing has to fit inside the patience, or a long voyage would
      // be abandoned while the boat is still at sea.
      timeout: SETTLE_TIMEOUT + 240,
    };
    const boat = this.host.boats.launchTransport(kingdom.id, voyage.departure, voyage.landing, [...party.memberIds], party.id);
    if (!boat) return;
    for (const settler of crew) {
      settler.villageId = null;
      settler.job = null;
      this.host.clearOffices(settler);
      applyStatus(settler, 'aboard');
      settler.position = { x: boat.x, y: boat.y };
    }
    this.parties.set(party.id, party);
    this.host.events.onEvent(
      `Settlers set sail from ${source.name}, looking for land across the water`,
      'kingdom',
      { x: source.centerX, y: source.centerY },
    );
  }

  /** A transport reached the far shore: everyone off, and on to the site. */
  landSettlers(boat: Boat, shore: Point): void {
    const party = boat.payload ? this.parties.get(boat.payload) : undefined;
    for (const id of boat.passengers) {
      const settler = this.host.entities.getEntityById(id);
      if (!settler) continue;
      clearStatus(settler, 'aboard');
      settler.position = { x: shore.x + 0.5, y: shore.y + 0.5 };
      if (party) {
        this.host.entities.giveOrder(settler, { kind: 'goto', x: party.target.x, y: party.target.y, purpose: 'settle' });
      }
    }
    if (party) party.timeout = SETTLE_TIMEOUT;
    const kingdom = this.host.kingdoms.get(boat.kingdomId);
    this.host.events.onEvent(
      `Settlers of ${kingdom?.name ?? 'a lost kingdom'} come ashore on new land`,
      'kingdom',
      shore,
    );
  }

  /**
   * WorldBox's Handsome Migrants: a struggling town now and then gets one or
   * two strangers turning up at the bonfire. It is what stops a village of
   * three from being a dead end, and nobody ever asks where they came from.
   */
  private migrantRound(): void {
    // One town a round — the one that needs it most. Every small town rolling
    // separately turned a quiet law into a stream of arrivals that was most
    // of the chronicle.
    const members = this.host.entities.getEntitiesByVillage();
    let neediest: Village | null = null;
    let fewest = 12;
    for (const village of this.host.villages.values()) {
      const residents = members.get(village.id)?.length ?? 0;
      if (residents === 0 || residents >= fewest || village.age < 30) continue;
      fewest = residents;
      neediest = village;
    }
    if (!neediest || random() >= 0.35) return;
    {
      const village = neediest;
      const count = 1 + (random() < 0.4 ? 1 : 0);
      let arrived = 0;
      for (let i = 0; i < count; i++) {
        if (this.host.entities.spawnEntity(village.race, village.centerX, village.centerY)) arrived++;
      }
      if (arrived === 0) return;
      this.host.events.onEvent(
        `${arrived === 1 ? 'A handsome stranger arrives' : 'Two handsome strangers arrive'} at ${village.name}. Nobody asks where from`,
        'kingdom',
        { x: village.centerX, y: village.centerY },
      );
    }
  }

  /**
   * Abandon parties that never made it, and send their people home. A party
   * still at sea is not abandoned: its boat has its own clock, and landing
   * resets the party's patience.
   */
  private ageParties(delta: number): void {
    for (const party of Array.from(this.parties.values())) {
      party.timeout -= delta;

      for (const id of Array.from(party.memberIds)) {
        if (!this.host.entities.getEntityById(id)) party.memberIds.delete(id);
      }

      if (party.memberIds.size > 0 && party.timeout > 0) continue;
      if (this.anyAfloat(party)) continue;

      this.sendHome(party);
      this.parties.delete(party.id);
    }
  }

  private anyAfloat(party: SettlerParty): boolean {
    if (party.memberIds.size === 0) return false;
    const aboard = this.host.boats.passengersAtSea();
    return Array.from(party.memberIds).some(id => aboard.has(id));
  }

  /**
   * Stop a party's survivors walking to the site and send them back: each
   * rejoins the village it left, with that village's realm, if the village still
   * stands. Otherwise they are free wanderers of the party's realm.
   */
  private sendHome(party: SettlerParty): void {
    const source = this.host.villages.get(party.sourceVillageId);
    for (const id of party.memberIds) {
      const settler = this.host.entities.getEntityById(id);
      if (!settler) continue;
      this.host.entities.cancelOrder(settler);
      clearStatus(settler, 'aboard');
      if (source) {
        settler.villageId = source.id;
        settler.kingdomId = source.kingdomId;
      } else {
        settler.villageId = null;
        settler.kingdomId = party.kingdomId;
      }
    }
  }

  /** A settler reached the site. If it is still viable, the village is founded. */
  foundColony(settler: Entity, party: SettlerParty): void {
    const tile = this.host.tileAt(party.target.x, party.target.y);
    const kingdom = this.host.kingdoms.get(party.kingdomId);

    if (!tile || !kingdom || tile.villageId || this.host.tooCloseToVillage(tile.x, tile.y)) {
      // Site spoiled while they walked: the party is dissolved and its people go home
      this.sendHome(party);
      this.parties.delete(party.id);
      return;
    }

    const founders = Array.from(party.memberIds)
      .map(id => this.host.entities.getEntityById(id))
      .filter((member): member is Entity => Boolean(member));

    const village = this.host.createVillage(kingdom, tile, founders);
    this.parties.delete(party.id);

    const source = this.host.villages.get(party.sourceVillageId);
    this.host.events.onEvent(
      source
        ? chronicle('village_settled_from', { name: village.name, a: source.name })
        : chronicle('village_founded', { name: village.name }),
      'kingdom',
      { x: tile.x, y: tile.y },
    );
    void settler;
  }
}
