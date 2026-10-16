import { beforeEach, describe, expect, it } from 'vitest';
import { FaithService } from './faith';
import { foundFaith, resetFaiths, type FaithTraitId } from '../religion';
import { registerMeta, resetIdentity, setGroupMetas } from '../identity';
import {
  addKingdom, addResident, addStranger, addVillage, building, makeWorld, type World,
} from './testing/fixture';
import type { Entity } from '../../types/world';
import type { Village } from './types';

const FAITH = 'faith-light';
const ROUND = 4;

/** Found a faith and give it exactly these traits, as faith.ts reads them. */
const seedFaith = (id: string, traits: FaithTraitId[]): void => {
  const meta = registerMeta({ id, kind: 'religion', name: `Faith ${id}`, colorHex: '#ffffff', traits: [] });
  const record = foundFaith(meta, null, null);
  record.traits = traits;
};

/** A temple town of the faith, with a temple south of its centre. */
const templeTown = (world: World, atWar: string[] = [], religion: string | null = FAITH): Village => {
  addKingdom(world, 'kingdom-a', atWar);
  const town = addVillage(world, {
    id: 'village-a', kingdomId: 'kingdom-a', centerX: 20, centerY: 20,
    buildings: [building('temple', 20, 22)],
  });
  if (religion) setGroupMetas(town.id, { culture: null, language: null, religion });
  return town;
};

const believer = (world: World, town: Village, intelligence: number, religion: string | null = FAITH, x = 20, y = 20): Entity => {
  const entity = addResident(world, town, 'human', x, y);
  entity.religionId = religion;
  entity.attributes.intelligence = intelligence;
  return entity;
};

const priestsIn = (entities: Entity[]) => entities.filter(e => e.status.includes('priest'));

describe('faith: priests', () => {
  beforeEach(() => {
    resetFaiths();
    resetIdentity();
  });

  it('a temple town appoints its sharpest believer who holds no other office as priest', () => {
    const world = makeWorld();
    seedFaith(FAITH, []);
    const town = templeTown(world);
    const low = believer(world, town, 4);
    const warrior = believer(world, town, 12);
    warrior.job = 'warrior';
    const sharp = believer(world, town, 9);
    const stranger = believer(world, town, 15, 'faith-other');

    new FaithService(world.host).update(ROUND);

    expect(priestsIn([low, warrior, sharp, stranger])).toEqual([sharp]);
  });

  it('the same priest keeps the office in later rounds', () => {
    const world = makeWorld();
    seedFaith(FAITH, []);
    const town = templeTown(world);
    const first = believer(world, town, 4);
    const second = believer(world, town, 9);
    const faith = new FaithService(world.host);

    faith.update(ROUND);
    faith.update(ROUND);

    expect(priestsIn([first, second])).toEqual([second]);
  });

  it('a town that has lost its temple unseats its priest', () => {
    const world = makeWorld();
    seedFaith(FAITH, []);
    addKingdom(world, 'kingdom-a');
    const town = addVillage(world, { id: 'village-a', kingdomId: 'kingdom-a', centerX: 20, centerY: 20 });
    const old = believer(world, town, 9);
    old.status.push('priest');

    new FaithService(world.host).update(ROUND);

    expect(old.status).not.toContain('priest');
  });

  it('a town whose people follow no faith appoints no priest', () => {
    const world = makeWorld();
    seedFaith(FAITH, []);
    const town = templeTown(world, [], null);
    const people = [believer(world, town, 9, null), believer(world, town, 12, null)];

    new FaithService(world.host).update(ROUND);

    expect(priestsIn(people)).toEqual([]);
  });
});

describe('faith: the traits a priest works', () => {
  beforeEach(() => {
    resetFaiths();
    resetIdentity();
  });

  it('a blessed harvest adds food to the granary every round', () => {
    const world = makeWorld();
    seedFaith(FAITH, ['harvest_blessing']);
    const town = templeTown(world);
    believer(world, town, 9);

    const faith = new FaithService(world.host);
    faith.update(ROUND);
    faith.update(ROUND);

    expect(town.store.food).toBe(6);
  });

  it('ascetic believers go hungry more slowly, and strangers are untouched', () => {
    const world = makeWorld();
    seedFaith(FAITH, ['ascetic']);
    const town = templeTown(world);
    const faithful = believer(world, town, 9);
    const other = believer(world, town, 5, 'faith-other');
    faithful.needs.hunger = 0.5;
    other.needs.hunger = 0.5;

    new FaithService(world.host).update(ROUND);

    expect(faithful.needs.hunger).toBeCloseTo(0.53);
    expect(other.needs.hunger).toBe(0.5);
  });

  it('a divine shield covers the faithful who are fighting, and no one else', () => {
    const world = makeWorld();
    seedFaith(FAITH, ['divine_shield']);
    const town = templeTown(world);
    const fighter = believer(world, town, 9);
    fighter.status.push('fighting');
    const idle = believer(world, town, 5);

    new FaithService(world.host).update(ROUND);

    expect(fighter.status).toContain('shielded');
    expect(idle.status).not.toContain('shielded');
  });

  it('a priest heals faithful nearby by up to eight health a round', () => {
    const world = makeWorld();
    seedFaith(FAITH, ['mending_prayer']);
    const town = templeTown(world);
    const priest = believer(world, town, 10);
    const badlyHurt = believer(world, town, 1);
    const scratched = believer(world, town, 1);
    badlyHurt.health = badlyHurt.maxHealth - 20;
    scratched.health = scratched.maxHealth - 3;

    new FaithService(world.host).update(ROUND);

    expect(priest.status).toContain('priest');
    expect(badlyHurt.health).toBe(badlyHurt.maxHealth - 12);
    expect(scratched.health).toBe(scratched.maxHealth);
  });

  it('a priest burns an enemy of the realm that comes within six tiles', () => {
    const world = makeWorld();
    addKingdom(world, 'kingdom-b');
    seedFaith(FAITH, ['holy_fire']);
    const town = templeTown(world, ['kingdom-b']);
    believer(world, town, 10);
    const foe = addStranger(world, 'human', 23, 20, 'kingdom-b');
    foe.health = 100;

    new FaithService(world.host).update(ROUND);

    expect(foe.health).toBe(82);
    expect(foe.status).toContain('wounded');
  });

  it('holy fire leaves enemies beyond six tiles alone', () => {
    const world = makeWorld();
    addKingdom(world, 'kingdom-b');
    seedFaith(FAITH, ['holy_fire']);
    const town = templeTown(world, ['kingdom-b']);
    believer(world, town, 10);
    const distant = addStranger(world, 'human', 30, 20, 'kingdom-b');
    distant.health = 100;

    new FaithService(world.host).update(ROUND);

    expect(distant.health).toBe(100);
  });

  it('missionaries convert some strangers near the temple, but not all of them', () => {
    const world = makeWorld();
    seedFaith(FAITH, ['missionaries']);
    const town = templeTown(world);
    believer(world, town, 10);
    const strangers: Entity[] = [];
    for (let i = 0; i < 40; i++) {
      strangers.push(addStranger(world, 'human', 21 + (i % 3), 19 + (Math.floor(i / 3) % 3)));
    }

    new FaithService(world.host).update(ROUND);

    const converted = strangers.filter(s => s.religionId === FAITH).length;
    expect(converted).toBeGreaterThan(0);
    expect(converted).toBeLessThan(strangers.length);
  });

  it('without a believer to be priest, missionaries convert no one', () => {
    const world = makeWorld();
    seedFaith(FAITH, ['missionaries']);
    templeTown(world);
    const stranger = addStranger(world, 'human', 21, 20);

    new FaithService(world.host).update(ROUND);

    expect(stranger.religionId).toBeFalsy();
  });
});
