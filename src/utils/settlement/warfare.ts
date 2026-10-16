// Diplomacy and war: opinions between neighbours, the tension they build,
// the wars that follow, and what those wars do on the ground.
//
// The subsystem owns the pairwise opinion table, how long each war has run,
// and the invasion cooldowns. It sees the rest of the world only through
// `SettlementHost`. The core asks it whether two realms are at war, runs its
// clock once a step, declares or ends wars when a scheme or the player calls
// for it, and routes invasion fleets back here when they make landfall.

import type { Entity } from '../../types/world';
import { landmasses, nearestWater, type Boat, type Point } from '../boats';
import { emitFloater } from '../floatBridge';
import { requestFlash } from '../impactBridge';
import { chronicle } from '../chronicle';
import { applyStatus, clearStatus } from '../statusEffects';
import { speak } from '../dialogue';
import { conquestOutcome } from '../army';
import { holyWarTension } from '../religion';
import { groupMetas } from '../identity';
import { opinionBetween, tensionDrift, type OpinionResult } from '../politics';
import { simulation } from '../simulation';
import type { OpinionRow } from '../../store/gameStore';
import { TEMPERAMENT, CONTACT_RANGE, WAR_MAX_ROUNDS, WAR_MIN_POPULATION, WAR_WEARY_PEACE_CHANCE, WAR_WEARY_ROUNDS, YOUNG_REALM_PEACE } from './constants';
import { pairKey } from './helpers';
import type { SettlementHost } from './host';
import type { Kingdom, Village } from './types';
import { random } from '../random';

export class Warfare {
  /** Seconds since the last diplomacy round; a round runs every six. */
  private diplomacyTimer = 0;
  /** Latest opinion per neighbouring pair, keyed by pairKey. */
  private opinions = new Map<string, OpinionResult>();
  /** Diplomacy rounds each active war has lasted, keyed by kingdom pair. */
  private warTimers = new Map<string, number>();
  /** Towns that recently launched an invasion, and when they may launch again. */
  private invasionCooldown = new Map<string, number>();

  constructor(private readonly host: SettlementHost) {}

  /**
   * Advance the diplomacy clock. Every six seconds the realms weigh up their
   * neighbours (when warfare is allowed at all), and the sieges play out.
   */
  update(delta: number): void {
    this.diplomacyTimer += delta;
    if (this.diplomacyTimer >= 6) {
      this.diplomacyTimer = 0;
      if (this.host.laws.warfare) this.diplomacyRound();
      this.resolveSieges();
    }
  }

  /** Are these two realms at war with each other? */
  atWar(a?: string | null, b?: string | null): boolean {
    if (!a || !b || a === b) return false;
    return this.host.kingdoms.get(a)?.atWar.has(b) ?? false;
  }

  /**
   * Put two realms into a war: each lists the other as an enemy at full
   * tension, and the war clock starts. Says nothing to the chronicle, so the
   * caller decides how the war is announced.
   */
  beginWar(a: Kingdom, b: Kingdom): void {
    a.atWar.add(b.id);
    b.atWar.add(a.id);
    a.tension.set(b.id, 1);
    b.tension.set(a.id, 1);
    this.warTimers.set(pairKey(a.id, b.id), 0);
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
      ourKing: this.host.kingCivilStats(a),
      theirKing: this.host.kingCivilStats(b),
      borderTiles,
      ourLand: this.host.landOf(a),
      theirLand: this.host.landOf(b),
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
      tradePartners: this.host.tradePartners(a.id, b.id),
    });
  }

  /** Everyone living in a kingdom's towns. */
  private populationOf(kingdom: Kingdom): number {
    const members = this.host.entities.getEntitiesByVillage();
    return kingdom.villageIds.reduce((sum, id) => sum + (members.get(id)?.length ?? 0), 0);
  }

  /**
   * A realm that has as many towns as it can hold, and towns that are full,
   * has nowhere to grow but into its neighbour. This is WorldBox's real war
   * engine: peace ends when the land runs out.
   */
  private isLandHungry(kingdom: Kingdom): boolean {
    if (kingdom.villageIds.length < this.host.colonyLimit(kingdom)) return false;
    const members = this.host.entities.getEntitiesByVillage();
    return kingdom.villageIds.some((id) => {
      const village = this.host.villages.get(id);
      return village ? (members.get(id)?.length ?? 0) >= this.host.homesIn(village) : false;
    });
  }

  /** What every pair of neighbouring realms thinks of each other. */
  opinionRows(): OpinionRow[] {
    const rows = [];
    for (const [key, opinion] of this.opinions) {
      const [aId, bId] = key.split('|');
      const a = this.host.kingdoms.get(aId);
      const b = this.host.kingdoms.get(bId);
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

  /**
   * Measure how much territory each pair of kingdoms shares a border with,
   * grow friction accordingly, and declare war when it boils over.
   */
  private diplomacyRound(): void {
    const contact = new Map<string, number>();

    for (const village of this.host.villages.values()) {
      for (const id of village.territory) {
        const tile = this.host.tileFromInstanceId(id);
        if (!tile?.ownerId) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const neighbour = this.host.tileAt(tile.x + dx, tile.y + dy);
          if (!neighbour?.ownerId || neighbour.ownerId === tile.ownerId) continue;
          const key = pairKey(tile.ownerId, neighbour.ownerId);
          contact.set(key, (contact.get(key) ?? 0) + 1);
        }
      }
    }

    // Realms that do not touch still know of each other when their towns
    // are close, or face each other across a strait. Without this, two
    // kingdoms with a strip of wild land between them never fell out at all.
    const towns = Array.from(this.host.villages.values());
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
      const a = this.host.kingdoms.get(aId);
      const b = this.host.kingdoms.get(bId);
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
    for (const kingdom of this.host.kingdoms.values()) {
      for (const [otherId, value] of kingdom.tension) {
        if (value <= 0) continue;
        if (contact.has(pairKey(kingdom.id, otherId))) continue;
        kingdom.tension.set(otherId, Math.max(0, value - 0.04));
      }
    }

    this.warRound();
  }

  declareWar(a: Kingdom, b: Kingdom): void {
    this.beginWar(a, b);

    const capital = this.host.villages.get(a.villageIds[0]);
    this.host.events.onEvent(
      chronicle('war_declared', { a: a.name, b: b.name }),
      'war',
      capital ? { x: capital.centerX, y: capital.centerY } : undefined,
    );
    // A war starting is one of maybe four things in this simulation worth
    // interrupting the player for.
    requestFlash('blood', 0.8);
  }

  makePeace(a: Kingdom, b: Kingdom): void {
    a.atWar.delete(b.id);
    b.atWar.delete(a.id);
    a.tension.set(b.id, 0.25);
    b.tension.set(a.id, 0.25);
    this.warTimers.delete(pairKey(a.id, b.id));
    this.host.events.onEvent(chronicle('peace', { a: a.name, b: b.name }), 'war');
  }

  /** Send warbands at the enemy, and time wars out into peace. */
  private warRound(): void {
    const warriorsByKingdom = new Map<string, Entity[]>();
    for (const entity of this.host.entities.getAllEntities()) {
      if (entity.job !== 'warrior' || !entity.kingdomId) continue;
      const list = warriorsByKingdom.get(entity.kingdomId);
      if (list) list.push(entity);
      else warriorsByKingdom.set(entity.kingdomId, [entity]);
    }

    for (const kingdom of this.host.kingdoms.values()) {
      for (const enemyId of kingdom.atWar) {
        const enemy = this.host.kingdoms.get(enemyId);
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
        const weary = rounds > WAR_WEARY_ROUNDS && random() < WAR_WEARY_PEACE_CHANCE;
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
    const size = this.host.tiles.length;

    // Only captains are given marching orders; their warband is anchored to
    // them by appointCaptain, so the army moves as one body.
    for (const warrior of warriors) {
      const nearbyEnemy = this.host.entities
        .query(warrior.position.x, warrior.position.y, 6)
        .find(other => other.kingdomId === defender.id);
      if (nearbyEnemy) {
        this.host.entities.setHerdAnchor(warrior, null);
        this.host.entities.engage(warrior, nearbyEnemy);
        continue;
      }

      const leadsTheMarch = warrior.status.includes('captain');
      if (!leadsTheMarch) continue;

      const target = this.nearestVillage(defender, warrior.position.x, warrior.position.y);
      if (!target) continue;
      // Across the water: walking will never get there, so take ship.
      masses ??= landmasses(this.host.tiles);
      const here = masses.label[Math.floor(warrior.position.y) * size + Math.floor(warrior.position.x)];
      const there = masses.label[target.centerY * size + target.centerX];
      if (here >= 0 && there >= 0 && here !== there) {
        this.sendInvasion(attacker, warrior, warriors, target);
        continue;
      }
      this.host.entities.giveOrder(warrior, {
        kind: 'goto',
        x: target.centerX,
        y: target.centerY,
        purpose: 'raid',
      });
    }
  }

  /**
   * Put a captain and its warband in a transport bound for an enemy town on
   * another island. WorldBox's wars cross the sea; ours used to stop at the
   * shoreline and stand there, which made every island kingdom untouchable.
   */
  private sendInvasion(attacker: Kingdom, captain: Entity, warriors: Entity[], target: Village): void {
    const home = captain.villageId ? this.host.villages.get(captain.villageId) : null;
    if (!home) return;
    const now = home.age;
    if ((this.invasionCooldown.get(home.id) ?? -Infinity) > now) return;
    const departure = this.host.harbourOf(home, 8);
    const landing = nearestWater(this.host.tiles, { x: target.centerX, y: target.centerY }, 7);
    if (!departure || !landing) return;
    const crew = warriors
      .filter(w => w.villageId === home.id && w.health > 0 && !w.status.includes('aboard'))
      .slice(0, 8);
    if (crew.length < 2) return;
    const boat = this.host.boats.launchTransport(attacker.id, departure, landing, crew.map(c => c.id), `invasion:${target.id}`);
    if (!boat) {
      this.invasionCooldown.set(home.id, now + 60);
      return;
    }
    this.invasionCooldown.set(home.id, now + 120);
    emitFloater({ kind: 'speech', text: speak('sailing', random()), x: captain.position.x, y: captain.position.y, entityId: captain.id });
    for (const soldier of crew) {
      this.host.entities.setHerdAnchor(soldier, null);
      applyStatus(soldier, 'aboard');
      soldier.position = { x: boat.x, y: boat.y };
    }
    this.host.events.onEvent(
      `The army of ${attacker.name} takes ship for ${target.name}`,
      'war',
      { x: home.centerX, y: home.centerY },
    );
  }

  /** An invasion fleet made landfall: everyone off, and up the beach at the town. */
  landInvasion(boat: Boat, shore: Point): void {
    const target = this.host.villages.get(boat.payload!.slice('invasion:'.length));
    for (const id of boat.passengers) {
      const soldier = this.host.entities.getEntityById(id);
      if (!soldier) continue;
      clearStatus(soldier, 'aboard');
      soldier.position = { x: shore.x + 0.5, y: shore.y + 0.5 };
      if (target) this.host.entities.giveOrder(soldier, { kind: 'goto', x: target.centerX, y: target.centerY, purpose: 'raid' });
    }
    const kingdom = this.host.kingdoms.get(boat.kingdomId);
    this.host.events.onEvent(
      `The army of ${kingdom?.name ?? 'a fallen kingdom'} comes ashore below ${target?.name ?? 'an empty shore'}`,
      'war',
      shore,
    );
  }

  nearestVillage(kingdom: Kingdom, x: number, y: number): Village | null {
    let best: Village | null = null;
    let bestDistance = Infinity;
    for (const villageId of kingdom.villageIds) {
      const village = this.host.villages.get(villageId);
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
    for (const village of Array.from(this.host.villages.values())) {
      const kingdom = this.host.kingdoms.get(village.kingdomId);
      if (!kingdom) continue;

      for (const building of Array.from(village.buildings)) {
        const attackers = this.host.entities
          .query(building.x + 0.5, building.y + 0.5, 1.6)
          .filter(entity => entity.kingdomId
            && entity.kingdomId !== kingdom.id
            && this.atWar(kingdom.id, entity.kingdomId));
        if (attackers.length === 0) continue;

        building.health -= 18 * attackers.length;
        if (building.health > 0) continue;

        if (building.kind === 'bonfire') {
          const conqueror = this.host.kingdoms.get(attackers[0]?.kingdomId ?? '');
          const residents = this.host.entities.getEntitiesByVillage().get(village.id)?.length ?? 0;
          if (conqueror && conquestOutcome(conqueror.race, residents) === 'capture') {
            building.health = building.maxHealth * 0.5;
            this.captureVillage(village, kingdom, conqueror);
          } else {
            this.host.removeBuilding(village, building);
            this.destroyVillage(village, conqueror?.id ?? null);
          }
          break;
        }
        this.host.removeBuilding(village, building);
        // Raiders torch what they level
        if (random() < 0.5) simulation.igniteTile?.(building.x, building.y);
      }
    }

    // Kingdoms with no settlements left pass into history
    for (const kingdom of Array.from(this.host.kingdoms.values())) {
      if (kingdom.villageIds.length > 0) continue;
      this.host.events.onEvent(chronicle('kingdom_fallen', { a: kingdom.name }), 'war');
      requestFlash('blood', 1);
      for (const entity of this.host.entities.getAllEntities()) {
        if (entity.kingdomId === kingdom.id) {
          entity.kingdomId = null;
          entity.villageId = null;
          entity.job = null;
        }
      }
      for (const other of this.host.kingdoms.values()) {
        other.atWar.delete(kingdom.id);
        other.tension.delete(kingdom.id);
      }
      this.host.kingdoms.delete(kingdom.id);
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
      const heir = from.villageIds.map(id => this.host.villages.get(id)).find((v): v is Village => Boolean(v));
      if (heir) heir.capital = true;
    }
    village.kingdomId = to.id;
    village.capital = false;
    village.restless = 0;
    to.villageIds.push(village.id);
    this.host.forgetLeadership(village.id);

    const conquered = this.host.entities.getEntitiesByVillage().get(village.id) ?? [];
    for (const resident of conquered) {
      resident.kingdomId = to.id;
      this.host.clearOffices(resident);
      if (resident.job === 'warrior') resident.job = null;
    }
    if (conquered[0]) {
      emitFloater({ kind: 'speech', text: speak('captured', random()), x: conquered[0].position.x, y: conquered[0].position.y, entityId: conquered[0].id });
    }

    for (const id of village.territory) {
      const tile = this.host.tileFromInstanceId(id);
      if (tile) tile.ownerId = null;
    }
    village.territory.clear();
    this.host.claimTerritory(village);
    // Roofs wear their kingdom's colour; repaint them.
    for (const building of village.buildings) this.host.paintBuilding(village, building);

    this.host.events.onEvent(
      `${village.name} falls to ${to.name}, and flies its banner now`,
      'war',
      { x: village.centerX, y: village.centerY },
    );
    requestFlash('blood', 0.5);
    this.host.publishSummaries();
  }

  private destroyVillage(village: Village, conquerorId: string | null): void {
    this.host.releaseVillage(village);

    const conqueror = conquerorId ? this.host.kingdoms.get(conquerorId) : null;
    this.host.events.onEvent(
      conqueror
        ? `${village.name} is razed by ${conqueror.name}`
        : `${village.name} is razed`,
      'war',
      { x: village.centerX, y: village.centerY },
    );
  }
}
