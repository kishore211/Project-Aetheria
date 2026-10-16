import { describe, expect, it } from 'vitest';
import { Economy } from './economy';
import {
  BUY_LOT, BUY_PRICE_STONE, BUY_PRICE_WOOD, BUY_RESERVE, CHRONICLE_ROUNDS, FESTIVAL_MAX_COST,
  FESTIVAL_MOOD, FESTIVAL_ROUNDS, UNPAID_WARRIOR_MOOD, WARRIOR_WAGE,
} from './constants';
import { addKingdom, addResident, addVillage, building, makeWorld, type World } from './testing/fixture';
import type { Entity } from '../../types/world';
import type { Village, VillageStore } from './types';

const town = (
  world: World, store: Partial<VillageStore>, options: Partial<Village> = {},
): Village => {
  addKingdom(world, 'kingdom-a');
  return addVillage(world, {
    id: 'village-a', kingdomId: 'kingdom-a', centerX: 20, centerY: 20,
    store: { food: 0, wood: 0, stone: 0, gold: 0, ...store },
    ...options,
  });
};

/** A grown resident with a known mood, doing the job given. */
const person = (world: World, village: Village, job: Entity['job'] = 'warrior'): Entity => {
  const entity = addResident(world, village);
  entity.job = job;
  entity.happiness = 50;
  return entity;
};

const festivals = (world: World): string[] => world.events.filter(message => message.includes('festival'));

describe('soldiers’ pay', () => {
  it('pays each warrior a wage from the treasury, and the warrior keeps it as coin', () => {
    const world = makeWorld();
    const village = town(world, { gold: 100 });
    const warriors = [person(world, village), person(world, village), person(world, village)];
    const gatherer = person(world, village, 'gatherer');

    new Economy(world.host).paySoldiers(village, [...warriors, gatherer]);

    expect(village.store.gold).toBe(100 - 3 * WARRIOR_WAGE);
    for (const warrior of warriors) expect(warrior.coins).toBe(WARRIOR_WAGE);
    expect(gatherer.coins ?? 0).toBe(0);
  });

  it('pays what the treasury has, and the warriors it cannot pay grow sour', () => {
    const world = makeWorld();
    const village = town(world, { gold: WARRIOR_WAGE });
    const paid = person(world, village);
    const unpaid = person(world, village);

    new Economy(world.host).paySoldiers(village, [paid, unpaid]);

    expect(village.store.gold).toBe(0);
    expect(paid.coins).toBe(WARRIOR_WAGE);
    expect(unpaid.coins ?? 0).toBe(0);
    expect(unpaid.happiness).toBe(50 - UNPAID_WARRIOR_MOOD);
    expect(paid.happiness).toBe(50);
  });
});

describe('buying what a town lacks', () => {
  it('buys a lot of the good it is short of from its market, at a price', () => {
    const world = makeWorld();
    const village = town(world, { gold: 1000, wood: 0, stone: 500, food: 500 }, {
      buildings: [building('market', 22, 22)],
    });

    expect(new Economy(world.host).buyShortages(village)).toBe(true);

    expect(village.store.wood).toBe(BUY_LOT);
    expect(village.store.gold).toBe(1000 - BUY_PRICE_WOOD * BUY_LOT);
  });

  it('buys only what is short, so a town with timber buys its stone', () => {
    const world = makeWorld();
    const village = town(world, { gold: 1000, wood: 500, stone: 0, food: 500 }, {
      buildings: [building('market', 22, 22)],
    });

    new Economy(world.host).buyShortages(village);

    expect(village.store.wood).toBe(500);
    expect(village.store.stone).toBe(BUY_LOT);
    expect(village.store.gold).toBe(1000 - BUY_PRICE_STONE * BUY_LOT);
  });

  it('needs a market to buy anything', () => {
    const world = makeWorld();
    const village = town(world, { gold: 1000, wood: 0, stone: 0, food: 0 });

    expect(new Economy(world.host).buyShortages(village)).toBe(false);
    expect(village.store.wood).toBe(0);
    expect(village.store.gold).toBe(1000);
  });

  it('keeps its reserve: a lot that would leave less than the reserve is not bought', () => {
    const world = makeWorld();
    const cost = BUY_PRICE_WOOD * BUY_LOT;
    const village = town(world, { gold: BUY_RESERVE + cost - 1, wood: 0, stone: 500, food: 500 }, {
      buildings: [building('market', 22, 22)],
    });

    expect(new Economy(world.host).buyShortages(village)).toBe(false);
    expect(village.store.wood).toBe(0);
    expect(village.store.gold).toBe(BUY_RESERVE + cost - 1);
  });
});

describe('the king’s court', () => {
  it('a capital with a large treasury holds a festival: its residents are cheered and the treasury pays', () => {
    const world = makeWorld();
    const capital = town(world, { gold: 2000 }, { capital: true });
    const residents = [person(world, capital, 'farmer'), person(world, capital, 'warrior')];
    for (const resident of residents) resident.happiness = 0;

    expect(new Economy(world.host).courtFestival(capital)).toBe(true);

    expect(capital.store.gold).toBe(2000 - Math.min(FESTIVAL_MAX_COST, Math.floor(2000 * 0.2)));
    for (const resident of residents) expect(resident.happiness).toBe(FESTIVAL_MOOD);
    expect(festivals(world)).toHaveLength(1);
  });

  it('holds no festival below the treasury threshold, or outside a capital', () => {
    const world = makeWorld();
    const poor = town(world, { gold: 1000 }, { capital: true });
    const province = addVillage(world, {
      id: 'village-b', kingdomId: 'kingdom-a', centerX: 30, centerY: 30, store: { food: 0, wood: 0, stone: 0, gold: 50000 },
    });
    const economy = new Economy(world.host);

    expect(economy.courtFestival(poor)).toBe(false);
    expect(economy.courtFestival(province)).toBe(false);
    expect(poor.store.gold).toBe(1000);
    expect(province.store.gold).toBe(50000);
    expect(festivals(world)).toHaveLength(0);
  });

  it('holds a festival once per interval and chronicles the realm at most once per long interval', () => {
    const world = makeWorld();
    const capital = town(world, { gold: 100000 }, { capital: true });
    const economy = new Economy(world.host);

    // Festivals fall on every FESTIVAL_ROUNDS-th round. The first is chronicled;
    // the next chronicle waits CHRONICLE_ROUNDS, so over this run there are two.
    const rounds = FESTIVAL_ROUNDS + CHRONICLE_ROUNDS;
    for (let round = 0; round < rounds; round++) economy.settle(5);

    const held = Math.floor(rounds / FESTIVAL_ROUNDS);
    expect(capital.store.gold).toBe(100000 - held * FESTIVAL_MAX_COST);
    expect(festivals(world)).toHaveLength(2);
  });
});
