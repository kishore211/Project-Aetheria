import { describe, expect, it } from 'vitest';
import { Armoury } from './armoury';
import { addKingdom, addResident, addVillage, building, makeWorld, type World } from './testing/fixture';
import type { Entity } from '../../types/world';
import type { Item } from '../equipment';
import type { Building, Village, VillageStore } from './types';

/** The same generator the setup seeds with, so a test can sweep its own seeds. */
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const townWith = (
  world: World, store: Partial<VillageStore>, tier = 1, buildings: Building[] = [],
): Village => {
  addKingdom(world, 'kingdom-a');
  const village = addVillage(world, {
    id: 'village-a', kingdomId: 'kingdom-a', centerX: 20, centerY: 20, buildings,
    store: { food: 0, wood: 0, stone: 0, gold: 0, ...store },
  });
  world.tiers.set(village.id, tier);
  return village;
};

const soldier = (world: World, village: Village, job: Entity['job'] = 'warrior'): Entity => {
  const entity = addResident(world, village);
  entity.job = job;
  return entity;
};

const gearOf = (entity: Entity): Array<Item | null | undefined> => [entity.equipment?.weapon, entity.equipment?.armor];

describe('the smith', () => {
  it('arms a warrior, and leaves a civilian with no office with no gear at all', () => {
    const world = makeWorld();
    const village = townWith(world, { wood: 20, stone: 20, gold: 20, metal: 20 });
    const warrior = soldier(world, village);
    const civilian = soldier(world, village, 'gatherer');

    new Armoury(world.host).forge();

    expect(warrior.equipment?.weapon).toBeTruthy();
    expect(civilian.equipment).toBeUndefined();
  });

  it('arms the king first, then the captain, then the warrior', () => {
    const world = makeWorld();
    const village = townWith(world, { wood: 50, stone: 50, gold: 50, metal: 50 });
    const king = soldier(world, village, null);
    king.status.push('king');
    const captain = soldier(world, village, null);
    captain.status.push('captain');
    const warrior = soldier(world, village);
    const armoury = new Armoury(world.host);

    armoury.forge();
    expect(king.equipment?.weapon).toBeTruthy();
    expect(captain.equipment).toBeUndefined();

    armoury.forge();
    expect(captain.equipment?.weapon).toBeTruthy();
    expect(warrior.equipment).toBeUndefined();

    armoury.forge();
    expect(warrior.equipment?.weapon).toBeTruthy();
  });

  it('gives every warrior a weapon before any of them is given armour', () => {
    const world = makeWorld();
    const village = townWith(world, { wood: 50, stone: 50, gold: 50, metal: 50 });
    const first = soldier(world, village);
    const second = soldier(world, village);
    const armoury = new Armoury(world.host);

    armoury.forge();
    armoury.forge();
    expect(first.equipment?.weapon).toBeTruthy();
    expect(second.equipment?.weapon).toBeTruthy();
    expect(gearOf(first)[1]).toBeFalsy();
    expect(gearOf(second)[1]).toBeFalsy();

    armoury.forge();
    expect([first, second].some(s => s.equipment?.armor)).toBe(true);
  });

  it('a smithy doubles the pieces made in a round', () => {
    const world = makeWorld();
    const village = townWith(world, { wood: 50, stone: 50, gold: 50, metal: 50 }, 1, [building('smithy', 20, 22)]);
    const first = soldier(world, village);
    const second = soldier(world, village);

    new Armoury(world.host).forge();

    expect(first.equipment?.weapon).toBeTruthy();
    expect(second.equipment?.weapon).toBeTruthy();
  });

  it('a copper blade is paid for in wood, stone, gold and metal', () => {
    const world = makeWorld();
    const village = townWith(world, { wood: 5, stone: 5, gold: 5, metal: 3 }, 1);
    const warrior = soldier(world, village);

    new Armoury(world.host).forge();

    expect(warrior.equipment?.weapon?.material).toBe('copper');
    expect(village.store).toMatchObject({ wood: 4, stone: 3, gold: 4, metal: 2 });
  });

  it('a store with no metal still arms its warriors in wood', () => {
    const world = makeWorld();
    const village = townWith(world, { wood: 10 }, 3);
    const warrior = soldier(world, village);

    new Armoury(world.host).forge();

    expect(warrior.equipment?.weapon?.material).toBe('wood');
    expect(village.store.wood).toBe(8);
  });

  it('a store with no metal arms its warriors in leather once they carry a weapon', () => {
    const world = makeWorld();
    const village = townWith(world, { wood: 10, gold: 5 }, 3);
    const warrior = soldier(world, village);
    const armoury = new Armoury(world.host);

    armoury.forge();
    armoury.forge();

    expect(warrior.equipment?.weapon?.material).toBe('wood');
    expect(warrior.equipment?.armor?.material).toBe('leather');
  });

  it('a town with the forge switched off by the world laws makes nothing', () => {
    const world = makeWorld();
    world.laws.forging = false;
    const village = townWith(world, { wood: 50, stone: 50, gold: 50, metal: 50 });
    const warrior = soldier(world, village);

    new Armoury(world.host).forge();

    expect(warrior.equipment).toBeUndefined();
  });

  it('the smith uses a mithril ingot only when one is in the store', () => {
    const made = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const probe = Math.random;
      Math.random = mulberry32(seed);
      try {
        const world = makeWorld();
        const village = townWith(world, { wood: 200, stone: 400, gold: 400, metal: 200, mithril: 0 }, 4);
        const people = Array.from({ length: 8 }, () => soldier(world, village));
        for (let round = 0; round < 8; round++) new Armoury(world.host).forge();
        for (const item of people.flatMap(gearOf)) if (item) made.add(item.material);
      } finally {
        Math.random = probe;
      }
    }
    expect(made.has('mithril')).toBe(false);
    expect(made.has('adamantine')).toBe(false);
  });

  it('with one mithril ingot in the store, at most one mithril piece is made and the ingot is spent', () => {
    let sawMithril = false;
    for (let seed = 1; seed <= 80; seed++) {
      const probe = Math.random;
      Math.random = mulberry32(seed);
      try {
        const world = makeWorld();
        const village = townWith(world, { wood: 200, stone: 400, gold: 400, metal: 200, mithril: 1 }, 4);
        const people = Array.from({ length: 8 }, () => soldier(world, village));
        for (let round = 0; round < 8; round++) new Armoury(world.host).forge();
        const mithril = people.flatMap(gearOf).filter(item => item?.material === 'mithril');
        expect(mithril.length).toBeLessThanOrEqual(1);
        if (mithril.length === 1) {
          sawMithril = true;
          expect(village.store.mithril).toBe(0);
        }
      } finally {
        Math.random = probe;
      }
    }
    expect(sawMithril).toBe(true);
  });
});

describe('the drill yard', () => {
  it('drilling adds one strength a round to a warrior, up to four per training dummy', () => {
    const world = makeWorld();
    const village = townWith(world, {}, 1, [building('dummy', 20, 23)]);
    const warrior = soldier(world, village);
    const start = warrior.attributes.strength;
    const armoury = new Armoury(world.host);

    for (let round = 0; round < 6; round++) armoury.drill();

    expect(warrior.attributes.strength).toBe(start + 4);
    expect(warrior.drilled).toBe(4);
  });

  it('two training dummies raise the cap to eight', () => {
    const world = makeWorld();
    const village = townWith(world, {}, 1, [building('dummy', 20, 23), building('dummy', 21, 23)]);
    const warrior = soldier(world, village);
    const start = warrior.attributes.strength;

    for (let round = 0; round < 10; round++) new Armoury(world.host).drill();

    expect(warrior.attributes.strength).toBe(start + 8);
  });

  it('a civilian is never drilled, even in a town with dummies', () => {
    const world = makeWorld();
    const village = townWith(world, {}, 1, [building('dummy', 20, 23)]);
    const civilian = soldier(world, village, 'gatherer');
    const start = civilian.attributes.strength;

    new Armoury(world.host).drill();

    expect(civilian.attributes.strength).toBe(start);
  });

  it('a warrior in a town with no training dummies is not drilled', () => {
    const world = makeWorld();
    addKingdom(world, 'kingdom-b');
    const bare = addVillage(world, { id: 'village-b', kingdomId: 'kingdom-b', centerX: 40, centerY: 40 });
    const idle = soldier(world, bare);
    const start = idle.attributes.strength;

    new Armoury(world.host).drill();

    expect(idle.attributes.strength).toBe(start);
  });
});
