import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CloudSystem, DROPS, type CloudWorld, type DropKind } from './clouds';
import { IGNITE, addHeat, heatOf } from './thermal';
import type { BiomeType, Entity, Tile } from '../types/world';

const SIZE = 24;

const makeTile = (x: number, y: number, type: BiomeType = 'grassland'): Tile => ({
  x, y, type,
  height: 0.5, moisture: 0.6, temperature: 0.5, fertility: 0.6,
  walkable: true, resources: [], structure: null,
  ownerId: null, villageId: null, isOnFire: false,
} as unknown as Tile);

const makeWorld = (creatures: Entity[] = []): CloudWorld & { synced: Tile[]; tiles: Tile[][] } => {
  const tiles: Tile[][] = [];
  for (let x = 0; x < SIZE; x += 1) {
    tiles[x] = [];
    for (let y = 0; y < SIZE; y += 1) tiles[x][y] = makeTile(x, y);
  }
  const synced: Tile[] = [];
  return {
    tiles,
    synced,
    creaturesNear: () => creatures,
    syncTile: (tile) => { synced.push(tile); },
    announce: () => undefined,
    // Everything lands, so these tests are about the effect and not the odds.
    random: () => 0,
  };
};

const makeCreature = (): Entity => ({
  id: 'c1', type: 'human',
  position: { x: 12, y: 12 },
  health: 50, maxHealth: 100,
  status: [],
} as unknown as Entity);

/** A system with one cloud sitting over the middle of the map. */
const makeSky = (count = 3) => {
  const sprites = Array.from({ length: count }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    sprite.position.set(0, 10, 0);
    return sprite;
  });
  const sky = new CloudSystem();
  sky.adopt(sprites, SIZE * 0.5);
  return { sky, sprites };
};

describe('what falls out of a cloud', () => {
  it('gives every drop a distinct tint, so the sky says what is coming', () => {
    const tints = (Object.keys(DROPS) as DropKind[]).map(kind => DROPS[kind].tint);
    expect(new Set(tints).size).toBe(tints.length);
  });

  it('carries nothing until it is given something', () => {
    const { sky } = makeSky();
    const world = makeWorld();
    sky.update(2, world);
    expect(world.synced).toHaveLength(0);
    expect(sky.laden).toBe(0);
  });

  it('puts out a fire and cools the ground it passes over', () => {
    const { sky } = makeSky(1);
    const world = makeWorld();
    const burning = world.tiles[12][12];
    burning.isOnFire = true;
    addHeat(burning, IGNITE + 40);

    sky.setWeather('rain');
    sky.update(2, world);

    expect(burning.isOnFire).toBe(false);
    expect(heatOf(burning)).toBeLessThan(IGNITE);
    expect(world.synced).toContain(burning);
  });

  it('sows forest only where a forest would have grown anyway', () => {
    const { sky } = makeSky(1);
    const world = makeWorld();
    // A tile that qualifies, and three that must not: too dry, under a
    // village, and out at sea. A seeding cloud that can plant a wood on a
    // glacier is a paintbrush, not weather.
    world.tiles[11][12].moisture = 0.1;
    world.tiles[13][12].villageId = 'v1';
    world.tiles[12][13].type = 'ocean';

    sky.summon('seed', 12, 12, SIZE);
    sky.update(2, world);

    expect(world.tiles[12][12].type).toBe('deciduous_forest');
    expect(world.tiles[11][12].type).toBe('grassland');
    expect(world.tiles[13][12].type).toBe('grassland');
    expect(world.tiles[12][13].type).toBe('ocean');
  });

  it('leaves a bloom where it has blessed the same ground long enough', () => {
    const { sky } = makeSky(1);
    const world = makeWorld();
    world.tiles[12][12].fertility = 0.84;
    // A forest must not be erased in order to improve it, and a bloom that can
    // appear anywhere means nothing.
    world.tiles[11][12].type = 'deciduous_forest';
    world.tiles[11][12].fertility = 0.99;

    sky.summon('blessing', 12, 12, SIZE);
    for (let i = 0; i < 4; i += 1) sky.update(2, world);

    expect(world.tiles[12][12].type).toBe('bloom');
    expect(world.tiles[11][12].type).toBe('deciduous_forest');
  });

  it('sickens whoever is standing under a plague, and leaves the fields alone', () => {
    const victim = makeCreature();
    const { sky } = makeSky(1);
    const world = makeWorld([victim]);

    sky.summon('plague', 12, 12, SIZE);
    sky.update(2, world);

    expect(victim.health).toBeLessThan(50);
    expect(victim.status).toContain('wounded');
    // The whole point of a plague is that the fields are still there
    // afterwards and there is nobody left to work them.
    expect(world.synced).toHaveLength(0);
  });

  it('expires, and goes back to being weather', () => {
    const { sky } = makeSky(1);
    const world = makeWorld();
    sky.summon('blessing', 12, 12, SIZE, 10);
    expect(sky.laden).toBe(1);

    sky.update(6, world);
    expect(sky.laden).toBe(1);
    sky.update(6, world);
    expect(sky.laden).toBe(0);
  });

  it('lets a summoned cloud keep its errand through a change in the weather', () => {
    const { sky } = makeSky(2);
    sky.summon('plague', 12, 12, SIZE);
    sky.setWeather('rain');
    // One on its errand, one raining: weather must not overwrite an order.
    expect(sky.laden).toBe(2);
    sky.setWeather('clear');
    expect(sky.laden).toBe(1);
  });

  it('says so when the sky is full rather than quietly doing nothing', () => {
    const { sky } = makeSky(1);
    expect(sky.summon('plague', 12, 12, SIZE)).toBe(true);
    expect(sky.summon('blessing', 12, 12, SIZE)).toBe(false);
  });

  it('drops on simulated seconds, not on frames', () => {
    // A per-frame roll means the sky is kinder on a slow machine, which is the
    // same class of bug as timing an animation off the wall clock.
    const { sky } = makeSky(1);
    const world = makeWorld();
    sky.setWeather('rain');
    for (let frame = 0; frame < 30; frame += 1) sky.update(1 / 60, world);
    expect(world.tiles[12][12].moisture).toBeCloseTo(0.6, 5);

    sky.update(1, world);
    expect(world.tiles[12][12].moisture).toBeGreaterThan(0.6);
  });
});
