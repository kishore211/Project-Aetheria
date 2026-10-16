import { describe, expect, it } from 'vitest';
import { Colonisation } from './colonisation';
import {
  MIN_VILLAGE_SPACING, SETTLER_PARTY_MAX, SETTLER_PARTY_MIN, SETTLE_RANGE, SETTLE_TIMEOUT,
} from './constants';
import {
  addKingdom, addResident, addVillage, building, makeWorld, type World,
} from './testing/fixture';
import type { Entity } from '../../types/world';
import type { SettlerParty, Village } from './types';

const HOME = { x: 40, y: 40 };

/** One established town in the realm, with `residents` grown-ups living in it. */
const homeTown = (world: World, residents = 12, age = 40) => {
  addKingdom(world, 'kingdom-a');
  const town = addVillage(world, {
    id: 'village-a', kingdomId: 'kingdom-a', centerX: HOME.x, centerY: HOME.y, age,
    buildings: [building('hall', HOME.x, HOME.y + 1)],
  });
  const people = Array.from({ length: residents }, () => addResident(world, town));
  return { town, people };
};

const partiesOf = (colony: Colonisation): SettlerParty[] => Array.from(colony.parties.values());

describe('settler parties', () => {
  it('a full town sends a party of three or four to a site it can walk to', () => {
    const world = makeWorld();
    const { town } = homeTown(world);
    const colony = new Colonisation(world.host);

    colony.update(8);

    const [party] = partiesOf(colony);
    expect(colony.parties.size).toBe(1);
    expect(party.sourceVillageId).toBe(town.id);
    expect(party.memberIds.size).toBeGreaterThanOrEqual(SETTLER_PARTY_MIN);
    expect(party.memberIds.size).toBeLessThanOrEqual(SETTLER_PARTY_MAX);
    const distance = Math.hypot(party.target.x - HOME.x, party.target.y - HOME.y);
    expect(distance).toBeGreaterThanOrEqual(MIN_VILLAGE_SPACING - 1);
    expect(distance).toBeLessThanOrEqual(SETTLE_RANGE + 1);
    expect(world.tiles[party.target.x][party.target.y].type).toBe('grassland');
    for (const id of party.memberIds) {
      const settler = world.entities.getEntityById(id) as Entity;
      expect(settler.villageId).toBeNull();
      expect(world.entities.hasOrder(settler)).toBe(true);
    }
  });

  it('a town one short of the settler population keeps its people at home', () => {
    const world = makeWorld();
    homeTown(world, 8);
    const colony = new Colonisation(world.host);
    colony.update(8);
    expect(colony.parties.size).toBe(0);
  });

  it('a realm with a struggling old town anywhere in it sends no settlers', () => {
    const world = makeWorld();
    homeTown(world);
    const weak: Village = addVillage(world, {
      id: 'village-weak', kingdomId: 'kingdom-a', centerX: 50, centerY: 40, age: 40,
    });
    for (let i = 0; i < 4; i++) addResident(world, weak);
    const colony = new Colonisation(world.host);
    colony.update(8);
    expect(colony.parties.size).toBe(0);
  });

  it('a realm at war sends no settlers', () => {
    const world = makeWorld();
    homeTown(world);
    world.kingdoms.get('kingdom-a')!.atWar.add('kingdom-x');
    const colony = new Colonisation(world.host);
    colony.update(8);
    expect(colony.parties.size).toBe(0);
  });

  it('one expedition at a time: no second party leaves while the first is out', () => {
    const world = makeWorld();
    const { town, people } = homeTown(world);
    const colony = new Colonisation(world.host);
    colony.update(8);
    expect(colony.parties.size).toBe(1);

    // Hand everyone back to the town, so only the pending party can stop a second one.
    for (const person of people) person.villageId = town.id;
    colony.update(8);

    expect(colony.parties.size).toBe(1);
  });

  it('a kingdom at its town limit stops settling', () => {
    const world = makeWorld({ colonyLimit: 1 });
    homeTown(world);
    const colony = new Colonisation(world.host);
    colony.update(8);
    expect(colony.parties.size).toBe(0);
  });

  it('a realm with colonisation switched off by the world laws stays home', () => {
    const world = makeWorld();
    homeTown(world);
    world.laws.colonisation = false;
    const colony = new Colonisation(world.host);
    colony.update(8);
    expect(colony.parties.size).toBe(0);
  });
});

describe('settler parties that never arrive', () => {
  it('a party that runs out of patience is disbanded and its members released to the kingdom', () => {
    const world = makeWorld();
    homeTown(world);
    const colony = new Colonisation(world.host);
    colony.update(8);
    const [party] = partiesOf(colony);
    // Clear their realm first, so the release is visible rather than already true.
    for (const id of party.memberIds) {
      (world.entities.getEntityById(id) as Entity).kingdomId = null;
    }

    colony.update(SETTLE_TIMEOUT);

    expect(colony.parties.size).toBe(0);
    for (const id of party.memberIds) {
      expect((world.entities.getEntityById(id) as Entity).kingdomId).toBe('kingdom-a');
    }
  });

  it('survivors of an abandoned party go back to their village, with its order cancelled', () => {
    const world = makeWorld();
    const { town } = homeTown(world);
    const colony = new Colonisation(world.host);
    colony.update(8);
    const [party] = partiesOf(colony);

    colony.update(SETTLE_TIMEOUT);

    expect(colony.parties.size).toBe(0);
    expect(party.memberIds.size).toBeGreaterThan(0);
    for (const id of party.memberIds) {
      const settler = world.entities.getEntityById(id) as Entity;
      expect(settler.villageId).toBe(town.id);
      expect(settler.kingdomId).toBe('kingdom-a');
      expect(world.entities.hasOrder(settler)).toBe(false);
    }
  });

  it('survivors of a party whose village has gone become free wanderers of the realm, not homeless walkers', () => {
    const world = makeWorld();
    const { town } = homeTown(world);
    const colony = new Colonisation(world.host);
    colony.update(8);
    const [party] = partiesOf(colony);
    world.villages.delete(town.id);

    colony.update(SETTLE_TIMEOUT);

    expect(colony.parties.size).toBe(0);
    for (const id of party.memberIds) {
      const settler = world.entities.getEntityById(id) as Entity;
      expect(settler.villageId).toBeNull();
      expect(settler.kingdomId).toBe('kingdom-a');
      expect(world.entities.hasOrder(settler)).toBe(false);
    }
  });

  it('a settler who reaches a viable site founds a village with the party as its founders', () => {
    const world = makeWorld();
    homeTown(world);
    const colony = new Colonisation(world.host);
    colony.update(8);
    const [party] = partiesOf(colony);
    const settler = world.entities.getEntityById(Array.from(party.memberIds)[0]) as Entity;

    colony.foundColony(settler, party);

    expect(world.founded).toHaveLength(1);
    expect(world.founded[0].village.kingdomId).toBe('kingdom-a');
    expect(world.founded[0].founders.map(f => f.id).sort()).toEqual(Array.from(party.memberIds).sort());
    expect(colony.parties.size).toBe(0);
  });

  it('a party whose site was taken on the way is dissolved without founding a village', () => {
    const world = makeWorld();
    homeTown(world);
    const colony = new Colonisation(world.host);
    colony.update(8);
    const [party] = partiesOf(colony);
    world.tiles[party.target.x][party.target.y].villageId = 'village-someone-else';
    const settler = world.entities.getEntityById(Array.from(party.memberIds)[0]) as Entity;

    colony.foundColony(settler, party);

    expect(world.founded).toHaveLength(0);
    expect(colony.parties.size).toBe(0);
  });
});

describe('migrants', () => {
  /** Pin the dice for one stretch of the simulation, then restore them. */
  const withDice = (value: number, fn: () => void) => {
    const probe = Math.random;
    Math.random = () => value;
    try {
      fn();
    } finally {
      Math.random = probe;
    }
  };

  it('a struggling town gets one or two strangers, and it is the one with the fewest people', () => {
    const world = makeWorld();
    homeTown(world, 3);
    const big = addVillage(world, { id: 'village-big', kingdomId: 'kingdom-a', centerX: 50, centerY: 40, age: 40 });
    for (let i = 0; i < 6; i++) addResident(world, big);
    const colony = new Colonisation(world.host);
    const before = world.entities.getAllEntities().length;

    withDice(0.1, () => colony.update(60));

    expect(world.entities.getAllEntities().length - before).toBe(2);
    expect(world.events.length).toBe(1);
  });

  it('no stranger comes when the dice say no', () => {
    const world = makeWorld();
    homeTown(world, 3);
    const colony = new Colonisation(world.host);
    const before = world.entities.getAllEntities().length;

    withDice(0.9, () => colony.update(60));

    expect(world.entities.getAllEntities().length).toBe(before);
  });

  it('no stranger comes to a town of twelve or more people', () => {
    const world = makeWorld();
    homeTown(world, 12);
    // Sending settlers would empty the town below twelve, so keep the realm home.
    world.laws.colonisation = false;
    const colony = new Colonisation(world.host);
    const before = world.entities.getAllEntities().length;

    withDice(0.1, () => colony.update(60));

    expect(world.entities.getAllEntities().length).toBe(before);
  });
});
