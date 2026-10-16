// Economy: who works where, who governs, who is fed and born, and what each
// treasury holds.
//
// The core's work clock, birth clock and ledger clock used to share one
// five-thousand-line class. They live here now, with the jobs, the leaders
// and captains, and the rules that move coin between a town and its people.
// The subsystem sees the rest of the world only through `SettlementHost`.
//
// The core calls `update` at its work step (before trade) and `settle` at its
// ledger step (after trade), so the rounds run in the order they always did.

import { isOre, ORE_VALUE } from '../oreVeins';
import type { Entity, ResourceType } from '../../types/world';
import { emitFloater } from '../floatBridge';
import { applyScenario } from '../scenarios';
import { applyStatus, clearStatus } from '../statusEffects';
import { civilStats, leadership } from '../politics';
import { speak } from '../dialogue';
import { isChild } from '../size';
import { formationSlots } from '../army';
import { groupHasCultureTrait } from '../identity';
import { random } from '../random';
import { nudgeMood } from '../mood';
import {
  BIRTH_CHANCE_PER_ADULT, BIRTH_FOOD, BIRTH_INTERVAL, BUILDING_YIELD, BUY_BELOW_FOOD,
  BUY_BELOW_STONE, BUY_BELOW_WOOD, BUY_LOT, BUY_PRICE_FOOD, BUY_PRICE_STONE, BUY_PRICE_WOOD,
  BUY_RESERVE, CHRONICLE_ROUNDS, FEEDING_RADIUS, FESTIVAL_MAX_COST, FESTIVAL_MOOD,
  FESTIVAL_ROUNDS, FESTIVAL_SHARE, FESTIVAL_TREASURY, HOUSING_SLACK, MAX_BUILDERS,
  MAX_MINERS, MAX_WOODCUTTERS, MEAL_PRICE, TAX_RATE, UNPAID_WARRIOR_MOOD, WARRIOR_WAGE,
} from './constants';
import { groundBonus } from './helpers';
import type { SettlementHost } from './host';
import type { Village } from './types';

/** The goods a market sells a town when it is short of them. */
const MARKET_GOODS: ReadonlyArray<{ resource: 'wood' | 'stone' | 'food'; below: number; price: number }> = [
  { resource: 'wood', below: BUY_BELOW_WOOD, price: BUY_PRICE_WOOD },
  { resource: 'stone', below: BUY_BELOW_STONE, price: BUY_PRICE_STONE },
  { resource: 'food', below: BUY_BELOW_FOOD, price: BUY_PRICE_FOOD },
];

export class Economy {
  private workTimer = 0;
  private birthTimer = 0;
  private ledgerTimer = 0;
  /** Finds already announced, so a rich vein is news once, not every load. */
  private announcedFinds = new Set<string>();
  /** Village id -> the warrior currently carrying its banner. */
  private captains = new Map<string, string>();
  /** Village id -> its governing leader (the capital's leader is the king). */
  private leaders = new Map<string, string>();
  /** Economy rounds run so far, the court's clock. */
  private rounds = 0;
  /** Round on which each realm's court was last chronicled. */
  private lastCourtChronicle = new Map<string, number>();

  constructor(private readonly host: SettlementHost) {}

  private get entities(): SettlementHost['entities'] { return this.host.entities; }
  private get villages(): SettlementHost['villages'] { return this.host.villages; }
  private get kingdoms(): SettlementHost['kingdoms'] { return this.host.kingdoms; }
  private get laws(): SettlementHost['laws'] { return this.host.laws; }

  /** Work, feeding and families, on their own clocks. Called at the core's work step. */
  update(delta: number): void {
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
  }

  /** The village ledger, every five seconds. Called after trade, as it always was. */
  settle(delta: number): void {
    this.ledgerTimer += delta;
    if (this.ledgerTimer >= 5) {
      this.ledgerTimer = 0;
      this.economyRound();
    }
  }

  /** Who a village has appointed as its leader, if anybody. */
  leaderIdOf(villageId: string): string | undefined {
    return this.leaders.get(villageId);
  }

  /** Who a village has appointed as its captain, if anybody. */
  captainIdOf(villageId: string): string | undefined {
    return this.captains.get(villageId);
  }

  /** A village changing hands drops its captain and its leader. */
  forgetLeadership(villageId: string): void {
    this.captains.delete(villageId);
    this.leaders.delete(villageId);
  }

  // -- work --------------------------------------------------------------

  /** Keep every village staffed and send loaded gatherers home. */
  manageWorkforce(): void {
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
          this.host.clearOffices(member);
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
        if (job === 'trader' && this.host.isOnCaravan(member.id)) { counts.trader++; continue; }
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
          const site = sites[Math.floor(random() * sites.length)];
          this.entities.giveOrder(member, { kind: 'goto', x: site.x, y: site.y, purpose: 'build' });
        }
      }

      // Farmers walk out to a field and work it.
      if (farms > 0) {
        const fields = village.buildings.filter(b => b.kind === 'farm');
        for (const member of members) {
          if (member.job !== 'farmer' || member.carrying || this.entities.hasOrder(member)) continue;
          const field = fields[Math.floor(random() * fields.length)];
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
      for (const member of members) clearStatus(member, 'leader');
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
        text: speak('crowned', random()),
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
      for (const member of members) clearStatus(member, 'captain');
      return;
    }

    let captain = this.entities.getEntityById(this.captains.get(village.id) ?? '');
    if (!captain || captain.job !== 'warrior' || captain.villageId !== village.id) {
      // The toughest warrior takes the banner
      captain = warriors.reduce((best, warrior) => (
        warrior.attributes.strength > best.attributes.strength ? warrior : best
      ), warriors[0]);
      for (const warrior of warriors) clearStatus(warrior, 'captain');
      this.captains.set(village.id, captain.id);
    }

    applyStatus(captain, 'captain');

    // At peace the warband loafs about its captain. At war it falls in: ranks
    // of four behind the banner, facing the nearest enemy town.
    const front = this.host.warFront(village.kingdomId, captain);
    const soldiers = warriors.filter(w => w.id !== captain!.id);
    const slots = front ? formationSlots(soldiers.length, front.x - captain.position.x, front.y - captain.position.y) : null;
    soldiers.forEach((warrior, i) => {
      if (slots) this.entities.setHerdAnchor(warrior, captain!, 0.6, slots[i]);
      else this.entities.setHerdAnchor(warrior, captain!, 2.5);
    });
  }
  // -- families and feeding ----------------------------------------------

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
          this.host.treasury.income(village.id, MEAL_PRICE);
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
      if (people.length >= this.host.homesIn(village) + HOUSING_SLACK) continue;
      if (village.store.food < BIRTH_FOOD * 2) continue;
      const adults = people.filter(p => !isChild(p) && p.health > p.maxHealth * 0.4
        && p.age <= p.maxAge * 0.8 && !p.status.includes('aboard'));
      if (adults.length < 2) continue;
      const chance = Math.min(0.6, adults.length * BIRTH_CHANCE_PER_ADULT);
      if (random() >= chance) continue;
      // A couple when there is one together at home; otherwise any grown-up.
      const coupled = adults.filter(p => p.loverId && adults.some(a => a.id === p.loverId));
      const pool = coupled.length > 0 ? coupled : adults;
      const parent = pool[Math.floor(random() * pool.length)];
      const partner = parent.loverId ? adults.find(a => a.id === parent.loverId) ?? null : null;
      const child = this.entities.bearChild(parent, partner);
      if (!child) continue;
      village.store.food -= BIRTH_FOOD;
      // The granary paid for it, not the parent's own stomach.
      parent.needs.hunger = Math.min(1, parent.needs.hunger + 0.35);
    }
  }

  // -- the ledger ---------------------------------------------------------

  /**
   * Wages, tax, the village ledger, and the market.
   *
   * Four steps, in this order, because the order *is* the politics:
   *
   * 1. Buildings yield loot, scaled by tier and modified by the ground they
   *    stand on. The architecture is the income graph.
   * 2. Loot is taxed on its way to becoming spendable coin, and the tax lands
   *    in the treasury. Every wage passes visibly through a lord's hands.
   * 3. The village pays its bills: soldiers' wages first, then the ledger's
   *    four one-line terms, where homelessness costs twice a soldier and
   *    over-building bankrupts you.
   * 4. A market spends what is left on whatever the town is short of.
   *
   * Festivals, held by capitals, run after every town has had its round.
   */
  private economyRound(): void {
    this.rounds += 1;
    this.host.treasury.rotate(this.villages.keys());
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
        const tile = this.host.tileAt(building.x, building.y);
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
        this.host.treasury.income(village.id, tax);
        // Being taxed is a small, frequent grievance — which is exactly the
        // sort of thing that shows up later as loyalty.
        if (tax > 0 && random() < 0.04) applyScenario(resident, 'sleptRough');
      }

      // A windmill grinds what the farms grow: each one turns a little of
      // the harvest into extra bread.
      const mills = village.buildings.filter(b => b.kind === 'windmill').length;
      if (mills > 0) {
        const farms = village.buildings.filter(b => b.kind === 'farm').length;
        village.store.food += mills * Math.min(4, 1 + farms);
      }

      // -- 3. the bills: wages, then the ledger ---------------------------
      this.paySoldiers(village, residents);
      const homeless = Math.max(0, residents.length - this.host.homesIn(village));
      const warriors = residents.filter(r => r.job === 'warrior').length;
      const ledger = Math.floor(residents.length / 2)
        - homeless
        - Math.floor(warriors / 2)
        - Math.floor(village.buildings.length / 2);
      village.store.gold = Math.max(0, village.store.gold + ledger);

      // -- 4. the market: gold turns into what the town lacks -------------
      this.buyShortages(village);
    }

    // The court's festivals fall on their own clock, one capital at a time.
    if (this.rounds % FESTIVAL_ROUNDS === 0) {
      for (const village of this.villages.values()) {
        if (village.capital) this.courtFestival(village);
      }
    }
  }

  /**
   * Soldiers' pay. Each economy round a town pays every warrior a small wage
   * from its treasury, and the warrior keeps it as coin. A town that cannot
   * cover its payroll pays whoever it can, and the warriors it cannot pay
   * grow sour about it.
   */
  paySoldiers(village: Village, residents: Entity[]): void {
    let unpaid = 0;
    for (const soldier of residents) {
      if (soldier.job !== 'warrior') continue;
      if (village.store.gold >= WARRIOR_WAGE) {
        village.store.gold -= WARRIOR_WAGE;
        soldier.coins = (soldier.coins ?? 0) + WARRIOR_WAGE;
        this.host.treasury.wages(village.id, WARRIOR_WAGE);
      } else {
        nudgeMood(soldier, -UNPAID_WARRIOR_MOOD);
        unpaid++;
      }
    }
    this.host.treasury.setUnpaid(village.id, unpaid);
  }

  /**
   * Buying what a town lacks. A town with a market and a comfortable treasury
   * buys one lot of the first good it is short of, from its own market, at a
   * price. Timber and stone become roofs, so gold turns into growth instead
   * of sitting in a chest. Returns true when a lot was bought.
   */
  buyShortages(village: Village): boolean {
    if (!village.buildings.some(b => b.kind === 'market')) return false;
    for (const good of MARKET_GOODS) {
      if (village.store[good.resource] >= good.below) continue;
      const cost = good.price * BUY_LOT;
      if (village.store.gold - cost < BUY_RESERVE) continue;
      village.store.gold -= cost;
      village.store[good.resource] += BUY_LOT;
      this.host.treasury.purchase(village.id, cost, good.resource, BUY_LOT);
      return true;
    }
    return false;
  }

  /**
   * The king's court. A capital with a large treasury spends a share of it on
   * a festival that cheers every resident of the town. The realm is
   * chronicled when a festival is held, but no more often than
   * CHRONICLE_ROUNDS. Returns true when a festival was held.
   */
  courtFestival(village: Village): boolean {
    if (!village.capital || village.store.gold < FESTIVAL_TREASURY) return false;
    const cost = Math.min(FESTIVAL_MAX_COST, Math.floor(village.store.gold * FESTIVAL_SHARE));
    village.store.gold -= cost;
    this.host.treasury.festival(village.id, cost);
    for (const resident of this.entities.getEntitiesByVillage().get(village.id) ?? []) {
      nudgeMood(resident, FESTIVAL_MOOD);
    }
    const last = this.lastCourtChronicle.get(village.kingdomId);
    if (last === undefined || this.rounds - last >= CHRONICLE_ROUNDS) {
      this.lastCourtChronicle.set(village.kingdomId, this.rounds);
      this.host.events.onEvent(
        `${village.name} keeps a festival in the king's name`, 'kingdom', { x: village.centerX, y: village.centerY },
      );
    }
    return true;
  }

  deposit(village: Village, type: ResourceType, quantity: number): void {
    if (type === 'food') village.store.food += quantity;
    else if (type === 'wood') village.store.wood += quantity;
    else if (type === 'stone') village.store.stone += quantity;
    else if (isOre(type)) {
      const value = ORE_VALUE[type];
      const store = village.store;
      store.metal = (store.metal ?? 0) + (value.metal ?? 0) * quantity;
      store.gold += (value.gold ?? 0) * quantity;
      if (value.gold) this.host.treasury.income(village.id, value.gold * quantity);
      store.gems = (store.gems ?? 0) + (value.gems ?? 0) * quantity;
      store.mithril = (store.mithril ?? 0) + (value.mithril ?? 0) * quantity;
      store.adamantine = (store.adamantine ?? 0) + (value.adamantine ?? 0) * quantity;
      // A rare find is news.
      const find = `${village.id}:${type}`;
      if ((type === 'mithril' || type === 'adamantine' || type === 'gem') && !this.announcedFinds.has(find)) {
        this.announcedFinds.add(find);
        this.host.events.onEvent(`Miners of ${village.name} bring ${type === 'gem' ? 'gems' : type} up out of the hills`, 'info', { x: village.centerX, y: village.centerY });
      }
    }
  }
}
