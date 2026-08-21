import { beforeEach, describe, expect, it } from 'vitest';
import { EntityAI, createEntity } from './entitySystemMinimal';
import { DEFAULT_WORLD_LAWS } from '../store/gameStore';
import { publishSimulationContext } from './simulation';
import { computeScaledHeight, type Entity, type Tile } from '../types/world';
import { applyStatus, clearAllStatusTimers, hasStatus } from './statusEffects';
import { seedMood } from './mood';
import { clearFloaters } from './floatBridge';

const makeTile = (x: number, y: number): Tile => ({
  x, y,
  height: 0.45,
  scaledHeight: computeScaledHeight(0.45, 'grassland'),
  moisture: 0.5,
  temperature: 0.5,
  fertility: 0.6,
  type: 'grassland',
  population: 0,
  resources: [{ type: 'food', quantity: 40, discovered: true }],
  structure: null,
  entities: [],
  isOnFire: false,
  walkable: true,
  variant: 0.5,
  ownerId: null,
  villageId: null,
});

const makeGrid = (size: number): Tile[][] =>
  Array.from({ length: size }, (_, x) => Array.from({ length: size }, (_, y) => makeTile(x, y)));

/** A crowd standing on the same few tiles, all in one village. */
const makeCrowd = (count: number, village: string | null, happiness: number) => {
  const people: Entity[] = [];
  for (let index = 0; index < count; index += 1) {
    const person = createEntity('human', 10.5 + (index % 3) * 0.4, 10.5 + Math.floor(index / 3) * 0.4, []);
    person.villageId = village;
    person.age = person.maxAge * 0.5;
    person.needs = { hunger: 0.9, thirst: 0.9, rest: 0.9, social: 0.5 };
    person.happiness = happiness;
    people.push(person);
  }
  const index = { query: (x: number, y: number, radius: number) => people.filter(
    other => (other.position.x - x) ** 2 + (other.position.y - y) ** 2 <= radius * radius) };
  const ais = people.map(person => new EntityAI(person, index));
  return { people, ais };
};

const runCrowd = (
  ais: EntityAI[], grid: Tile[][], seconds: number, step = 0.5,
): void => {
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    for (const ai of ais) ai.update(grid, step);
  }
};

beforeEach(() => {
  publishSimulationContext({ ...DEFAULT_WORLD_LAWS }, 'summer', 'day');
  clearAllStatusTimers();
  clearFloaters();
});

describe('contagious moods', () => {
  it('spreads laughter through a village', () => {
    // This is the mechanic that makes a crowd behave like a crowd rather than
    // like a set of individuals who happen to be adjacent.
    const grid = makeGrid(24);
    const { people, ais } = makeCrowd(9, 'v1', 60);
    applyStatus(people[0], 'laughing');

    runCrowd(ais, grid, 40);

    const cheerful = people.filter(
      person => hasStatus(person, 'laughing') || hasStatus(person, 'singing'));
    expect(cheerful.length).toBeGreaterThan(1);
  });

  it('does not spread between strangers', () => {
    // A stranger walking past should not set the square laughing.
    const grid = makeGrid(24);
    const { people, ais } = makeCrowd(8, null, 60);
    // Give everyone a different village so nobody shares a home.
    people.forEach((person, index) => { person.villageId = `v${index}`; });
    applyStatus(people[0], 'crying');
    // Pin the source's status so it cannot expire mid-run and be re-caught.
    const others = people.slice(1);

    runCrowd(ais, grid, 20);

    expect(others.filter(person => hasStatus(person, 'crying'))).toHaveLength(0);
  });

  it('starts crying in a village that is having a bad time', () => {
    const grid = makeGrid(24);
    const { people, ais } = makeCrowd(9, 'v1', -70);

    runCrowd(ais, grid, 60);

    expect(people.some(person => hasStatus(person, 'crying'))).toBe(true);
    expect(people.some(person => hasStatus(person, 'laughing'))).toBe(false);
  });
});

describe('friends and lovers', () => {
  it('pairs villagers who are in a similar mood', () => {
    const grid = makeGrid(24);
    const { people, ais } = makeCrowd(8, 'v1', 55);

    runCrowd(ais, grid, 60);

    expect(people.filter(person => person.friendId)).not.toHaveLength(0);
  });

  it('keeps friendships mutual', () => {
    const grid = makeGrid(24);
    const { people, ais } = makeCrowd(8, 'v1', 55);
    runCrowd(ais, grid, 60);

    for (const person of people) {
      if (!person.friendId) continue;
      const friend = people.find(other => other.id === person.friendId);
      expect(friend).toBeDefined();
      // Either they chose each other, or the friend had already chosen
      // somebody else first — never a dangling reference.
      expect(friend!.friendId).toBeTruthy();
    }
  });

  it('will not pair creatures whose moods are far apart', () => {
    const grid = makeGrid(24);
    const cheerful = makeCrowd(4, 'v1', 80);
    const wretched = makeCrowd(4, 'v1', -80);
    // One shared index so they can all see each other.
    const everyone = [...cheerful.people, ...wretched.people];
    everyone.forEach((person, index) => {
      person.position = { x: 10.5 + (index % 4) * 0.3, y: 10.5 };
      seedMood(person);
    });
    cheerful.people.forEach(person => { person.happiness = 80; });
    wretched.people.forEach(person => { person.happiness = -80; });

    const index = { query: (x: number, y: number, radius: number) => everyone.filter(
      other => (other.position.x - x) ** 2 + (other.position.y - y) ** 2 <= radius * radius) };
    const ais = everyone.map(person => new EntityAI(person, index));
    // Hold the moods apart so drift cannot close the gap during the run.
    for (let elapsed = 0; elapsed < 40; elapsed += 0.5) {
      cheerful.people.forEach(person => { person.happiness = 80; });
      wretched.people.forEach(person => { person.happiness = -80; });
      for (const ai of ais) ai.update(grid, 0.5);
    }

    // Nobody should have befriended across the gap.
    for (const person of cheerful.people) {
      if (!person.friendId) continue;
      expect(wretched.people.some(other => other.id === person.friendId)).toBe(false);
    }
  });

  it('leaves animals out of it entirely', () => {
    // Animals have herds, not friendships.
    const grid = makeGrid(24);
    const sheep = Array.from({ length: 6 }, (_, index) =>
      createEntity('sheep', 10.5 + index * 0.3, 10.5, []));
    const index = { query: () => sheep };
    const ais = sheep.map(animal => new EntityAI(animal, index));

    runCrowd(ais, grid, 60);

    expect(sheep.every(animal => !animal.friendId && !animal.loverId)).toBe(true);
    expect(sheep.every(animal => !hasStatus(animal, 'laughing'))).toBe(true);
  });
});
