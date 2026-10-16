// Trade: caravans on the roads and merchants on the sea.
//
// The reference subsystem for the settlement split: it owns its own state
// (caravans on the road, which realms have traded) and its own timer, and
// reaches the rest of the world only through `SettlementHost`. The core calls
// `update` once a step and asks it two questions — is this unit a trader on
// the road, and are these two realms trade partners.

import type { Entity } from '../../types/world';
import { landmasses, type Boat, type Point } from '../boats';
import { emitFloater } from '../floatBridge';
import { isChild } from '../size';
import {
  CARAVAN_INTERVAL, CARAVAN_PROFIT, CARAVAN_RANGE, CARAVAN_TIMEOUT,
  TRADE_MIN_POPULATION, TRADE_PROFIT, TRADE_TIE_MEMORY,
} from './constants';
import { pairKey } from './helpers';
import type { SettlementHost } from './host';
import type { Caravan, Village } from './types';

export class TradeNetwork {
  private timer = 0;
  /** Traders on the road, keyed by the trader's id. */
  private caravans = new Map<string, Caravan>();
  /** Kingdom pairs that have traded, and on which caravan round they last did. */
  private ties = new Map<string, number>();
  private rounds = 0;

  constructor(private readonly host: SettlementHost) {}

  /** Advance the caravan clock; sends traders out every few seconds. */
  update(delta: number): void {
    this.timer += delta;
    if (this.timer >= CARAVAN_INTERVAL) {
      const elapsed = this.timer;
      this.timer = 0;
      this.caravanRound(elapsed);
    }
  }

  /** Is this unit a trader somewhere on a caravan route? */
  isOnRoad(entityId: string): boolean {
    return this.caravans.has(entityId);
  }

  /** True while two realms' caravans have been on the road lately. */
  partners(a: string, b: string): boolean {
    const last = this.ties.get(pairKey(a, b));
    return last !== undefined && this.rounds - last <= TRADE_TIE_MEMORY;
  }

  /**
   * Caravans, WorldBox's land trade. A town with something to sell sends a
   * trader walking to a neighbour it is at peace with; both ends earn, the
   * trader walks home with the takings, and realms that trade come to like
   * each other. It is the peaceful counterweight to land hunger.
   */
  private caravanRound(elapsed: number): void {
    const { entities, villages, kingdoms, tiles, events } = this.host;
    this.rounds++;
    for (const [id, caravan] of Array.from(this.caravans)) {
      const trader = entities.getEntityById(id);
      caravan.timeout -= elapsed;
      if (!trader || trader.health <= 0 || caravan.timeout <= 0
        || !villages.has(caravan.from) || !villages.has(caravan.to)) {
        this.caravans.delete(id);
        if (trader?.job === 'trader') trader.job = null;
      }
    }

    const members = entities.getEntitiesByVillage();
    const busy = new Set(Array.from(this.caravans.values()).map(c => c.from));
    let masses: { label: Int32Array; sizes: number[] } | null = null;
    const size = tiles.length;
    for (const village of villages.values()) {
      if (busy.has(village.id)) continue;
      const people = members.get(village.id) ?? [];
      if (people.length < TRADE_MIN_POPULATION) continue;
      const kingdom = kingdoms.get(village.kingdomId);
      if (!kingdom) continue;
      masses ??= landmasses(tiles);
      const home = masses.label[village.centerY * size + village.centerX];

      const partners = Array.from(villages.values())
        .filter(other => other.id !== village.id
          && !kingdom.atWar.has(other.kingdomId)
          && masses!.label[other.centerY * size + other.centerX] === home)
        .map(other => ({ other, distance: Math.hypot(other.centerX - village.centerX, other.centerY - village.centerY) }))
        .filter(({ distance }) => distance <= CARAVAN_RANGE)
        // A foreign market pays better than a sister town.
        .sort((a, b) => (a.distance + (a.other.kingdomId === village.kingdomId ? 20 : 0))
          - (b.distance + (b.other.kingdomId === village.kingdomId ? 20 : 0)));
      if (partners.length === 0) continue;
      const { other } = partners[Math.floor(Math.random() * Math.min(3, partners.length))];

      const trader = people.find(p => !isChild(p)
        && p.job !== 'warrior'
        && !p.carrying
        && p.health > p.maxHealth * 0.6
        && !p.status.some(s => s === 'king' || s === 'leader' || s === 'captain' || s === 'priest'));
      if (!trader) continue;
      trader.job = 'trader';
      this.caravans.set(trader.id, { from: village.id, to: other.id, leg: 'out', timeout: CARAVAN_TIMEOUT });
      entities.giveOrder(trader, { kind: 'goto', x: other.centerX, y: other.centerY, purpose: 'trade' });

      if (other.kingdomId !== village.kingdomId) {
        const key = pairKey(village.kingdomId, other.kingdomId);
        if (!this.ties.has(key)) {
          const theirs = kingdoms.get(other.kingdomId);
          events.onEvent(
            `A trade road opens between ${kingdom.name} and ${theirs?.name ?? 'a neighbour'}`,
            'kingdom',
            { x: village.centerX, y: village.centerY },
          );
        }
        this.ties.set(key, this.rounds);
      }
    }
  }

  /** A trader reached the end of a leg: sell, or bring the takings home. */
  arrived(trader: Entity): void {
    const caravan = this.caravans.get(trader.id);
    if (!caravan) return;
    const from = this.host.villages.get(caravan.from);
    const to = this.host.villages.get(caravan.to);
    if (!from || !to) {
      this.caravans.delete(trader.id);
      trader.job = null;
      return;
    }
    const market = (village: Village) => (village.buildings.some(b => b.kind === 'market') ? 2 : 1);
    if (caravan.leg === 'out') {
      const profit = CARAVAN_PROFIT * market(to);
      to.store.gold += profit;
      // Goods change hands: food goes where it is short, and metal too.
      if (from.store.food > to.store.food + 20) {
        from.store.food -= 10;
        to.store.food += 10;
      }
      if ((from.store.metal ?? 0) > (to.store.metal ?? 0) + 4) {
        from.store.metal = (from.store.metal ?? 0) - 2;
        to.store.metal = (to.store.metal ?? 0) + 2;
      }
      emitFloater({ kind: 'gain', text: `+${profit} gold`, x: trader.position.x, y: trader.position.y });
      caravan.leg = 'home';
      caravan.timeout = CARAVAN_TIMEOUT;
      this.host.entities.giveOrder(trader, { kind: 'goto', x: from.centerX, y: from.centerY, purpose: 'trade' });
      return;
    }
    const takings = CARAVAN_PROFIT * market(from);
    from.store.gold += takings;
    emitFloater({ kind: 'gain', text: `+${takings} gold`, x: trader.position.x, y: trader.position.y });
    this.caravans.delete(trader.id);
    trader.job = null;
  }

  /**
   * Open a trade route between two coastal towns at peace. One route per
   * town: a harbour full of merchants is a traffic jam, not an economy.
   */
  seaRound(): void {
    const { villages, kingdoms, boats } = this.host;
    const ports: Array<{ village: Village; dock: Point }> = [];
    for (const village of villages.values()) {
      if (!village.kingdomId) continue;
      if (this.host.residentsOf(village).length < TRADE_MIN_POPULATION) continue;
      if (boats.tradersOf(village.id) > 0) continue;
      const dock = this.host.harbourOf(village, 6);
      if (dock) ports.push({ village, dock });
    }
    for (let i = 0; i < ports.length; i++) {
      const a = ports[i];
      if (boats.tradersOf(a.village.id) > 0) continue;
      for (let j = i + 1; j < ports.length; j++) {
        const b = ports[j];
        if (boats.tradersOf(b.village.id) > 0) continue;
        const ka = kingdoms.get(a.village.kingdomId!);
        // Any two ports at peace trade by sea, as caravans do by land.
        if (ka?.atWar.has(b.village.kingdomId!)) continue;
        if (boats.launchTrade(a.village.kingdomId!, a.village.id, a.dock, b.village.id, b.dock)) break;
      }
    }
  }

  /**
   * A merchant made port. Both ends profit — that is the whole case for
   * trade — and the arriving town gets a coin floater so you can see why the
   * boat was worth building.
   */
  landBoat(boat: Boat): void {
    const port = boat.payload ? this.host.villages.get(boat.payload) : undefined;
    const origin = boat.villageId ? this.host.villages.get(boat.villageId) : undefined;
    if (port) port.store.gold += TRADE_PROFIT * (port.buildings.some(b => b.kind === 'market') ? 2 : 1);
    if (origin) origin.store.gold += Math.ceil(TRADE_PROFIT / 2);
    emitFloater({ kind: 'gain', text: `+${TRADE_PROFIT} gold`, x: boat.x, y: boat.y });
  }
}
