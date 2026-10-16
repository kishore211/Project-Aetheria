import { describe, expect, it } from 'vitest';
import type { Boat } from '../boats';
import {
  CARAVAN_INTERVAL, CARAVAN_PROFIT, TRADE_MIN_POPULATION, TRADE_PROFIT, TRADE_TIE_MEMORY,
} from './constants';
import { TradeNetwork } from './trade';
import {
  addKingdom, addResident, addVillage, building, makeWorld,
} from './testing/fixture';

/** Two realms with a town each, the first of which holds `people` residents. */
const twoRealms = (people = TRADE_MIN_POPULATION) => {
  const world = makeWorld();
  addKingdom(world, 'kingdom-a');
  addKingdom(world, 'kingdom-b');
  const home = addVillage(world, { id: 'village-a', kingdomId: 'kingdom-a', centerX: 20, centerY: 20 });
  const far = addVillage(world, { id: 'village-b', kingdomId: 'kingdom-b', centerX: 30, centerY: 20 });
  const residents = Array.from({ length: people }, () => addResident(world, home));
  const trade = new TradeNetwork(world.host);
  return { world, trade, home, far, residents };
};

const tradersIn = (residents: ReturnType<typeof addResident>[]) =>
  residents.filter(r => r.job === 'trader');

describe('caravans sent by land', () => {
  it('a town with enough people at peace sends exactly one trader down the road', () => {
    const { trade, residents } = twoRealms();
    trade.update(CARAVAN_INTERVAL);

    const traders = tradersIn(residents);
    expect(traders).toHaveLength(1);
    expect(trade.isOnRoad(traders[0].id)).toBe(true);
    expect(traders[0].job).toBe('trader');
  });

  it('a town one short of the population floor keeps everyone at home', () => {
    const { trade, residents } = twoRealms(TRADE_MIN_POPULATION - 1);
    trade.update(CARAVAN_INTERVAL);
    expect(tradersIn(residents)).toHaveLength(0);
  });

  it('a town with a caravan already out does not send a second trader', () => {
    const { trade, residents } = twoRealms();
    trade.update(CARAVAN_INTERVAL);
    trade.update(CARAVAN_INTERVAL);
    expect(tradersIn(residents)).toHaveLength(1);
  });

  it('a town at war with its only neighbour sends no caravan', () => {
    const { world, trade, residents } = twoRealms();
    world.kingdoms.get('kingdom-a')!.atWar.add('kingdom-b');
    trade.update(CARAVAN_INTERVAL);
    expect(tradersIn(residents)).toHaveLength(0);
  });

  it('only a civilian walks the road, never a warrior', () => {
    const { trade, residents } = twoRealms();
    residents.slice(0, -1).forEach(r => { r.job = 'warrior'; });
    trade.update(CARAVAN_INTERVAL);

    const traders = tradersIn(residents);
    expect(traders).toEqual([residents[residents.length - 1]]);
  });

  it('a trader whose partner town vanishes is dropped and freed', () => {
    const { world, trade, far, residents } = twoRealms();
    trade.update(CARAVAN_INTERVAL);
    const [trader] = tradersIn(residents);

    world.villages.delete(far.id);
    trade.update(CARAVAN_INTERVAL);

    expect(trade.isOnRoad(trader.id)).toBe(false);
    expect(trader.job).toBeNull();
  });

  it('a trader who dies on the road is dropped from the caravans', () => {
    const { trade, residents } = twoRealms();
    trade.update(CARAVAN_INTERVAL);
    const [trader] = tradersIn(residents);

    trader.health = 0;
    trade.update(CARAVAN_INTERVAL);

    expect(trade.isOnRoad(trader.id)).toBe(false);
    expect(trader.job).toBeNull();
  });
});

describe('what a caravan pays', () => {
  it('arrival pays the destination, and a market there doubles it', () => {
    const { trade, far, residents } = twoRealms();
    far.buildings.push(building('market', 30, 21));
    trade.update(CARAVAN_INTERVAL);
    const [trader] = tradersIn(residents);

    trade.arrived(trader);

    expect(far.store.gold).toBe(CARAVAN_PROFIT * 2);
    expect(trade.isOnRoad(trader.id)).toBe(true);
  });

  it('arrival without a market pays the destination once', () => {
    const { trade, far, residents } = twoRealms();
    trade.update(CARAVAN_INTERVAL);
    trade.arrived(tradersIn(residents)[0]);
    expect(far.store.gold).toBe(CARAVAN_PROFIT);
  });

  it('the trader walks home with the takings, paying the origin and freeing the trader', () => {
    const { trade, home, residents } = twoRealms();
    trade.update(CARAVAN_INTERVAL);
    const [trader] = tradersIn(residents);

    trade.arrived(trader);
    trade.arrived(trader);

    expect(home.store.gold).toBe(CARAVAN_PROFIT);
    expect(trade.isOnRoad(trader.id)).toBe(false);
    expect(trader.job).toBeNull();
  });

  it('a merchant ship pays its port by a market and its home town half as much', () => {
    const { trade, home, far } = twoRealms();
    far.buildings.push(building('market', 30, 21));
    const boat: Boat = {
      id: 'boat-1', kind: 'trade', kingdomId: 'kingdom-a', villageId: home.id, x: 25, y: 20,
      facing: 1, path: [], step: 0, state: 'voyage', timer: 0, dock: { x: 25, y: 20 },
      destination: { x: 30, y: 20 }, passengers: [], payload: far.id,
    };
    trade.landBoat(boat);
    expect(far.store.gold).toBe(TRADE_PROFIT * 2);
    expect(home.store.gold).toBe(Math.ceil(TRADE_PROFIT / 2));
  });
});

describe('trade partners', () => {
  it('a caravan between two realms makes them partners, in either order', () => {
    const { trade, residents } = twoRealms();
    trade.update(CARAVAN_INTERVAL);
    expect(residents.some(r => r.job === 'trader')).toBe(true);
    expect(trade.partners('kingdom-a', 'kingdom-b')).toBe(true);
    expect(trade.partners('kingdom-b', 'kingdom-a')).toBe(true);
  });

  it('a caravan between two towns of one realm does not make a foreign partner', () => {
    const world = makeWorld();
    addKingdom(world, 'kingdom-a');
    const home = addVillage(world, { id: 'village-a', kingdomId: 'kingdom-a', centerX: 20, centerY: 20 });
    addVillage(world, { id: 'village-a2', kingdomId: 'kingdom-a', centerX: 30, centerY: 20 });
    for (let i = 0; i < TRADE_MIN_POPULATION; i++) addResident(world, home);
    const trade = new TradeNetwork(world.host);
    trade.update(CARAVAN_INTERVAL);
    expect(trade.partners('kingdom-a', 'kingdom-b')).toBe(false);
  });

  it('a tie lapses once the memory window of caravan rounds has passed without a new caravan', () => {
    const { trade, residents } = twoRealms();
    trade.update(CARAVAN_INTERVAL);
    // Empty the town so nothing else is ever sent, and the only tie is the old one.
    for (const r of residents) r.villageId = null;

    for (let i = 0; i < TRADE_TIE_MEMORY; i++) trade.update(CARAVAN_INTERVAL);
    expect(trade.partners('kingdom-a', 'kingdom-b')).toBe(true);

    trade.update(CARAVAN_INTERVAL);
    expect(trade.partners('kingdom-a', 'kingdom-b')).toBe(false);
  });
});
