import { describe, expect, it } from 'vitest';
import { abilityTick, ABILITIES, type AbilityWorld } from './creatureAbilities';
import type { BiomeType, Entity, EntityType, Tile } from '../types/world';

const tile = (x: number, y: number, type: BiomeType = 'grassland'): Tile => ({
  x, y, type, height: 0.4, temperature: 0.5, moisture: 0.5, fertility: 0.5,
  structure: null, resources: [], entities: [], population: 0, isOnFire: false,
}) as unknown as Tile;

const creature = (type: EntityType, x = 5.5, y = 5.5): Entity => ({
  id: `${type}-${x}-${y}`, type, name: type, age: 1, maxAge: 99, health: 100, maxHealth: 100,
  position: { x, y }, status: [], attributes: { strength: 5, intelligence: 5, speed: 5, resilience: 5 },
  needs: { hunger: 1, thirst: 1, rest: 1, social: 1 }, inventory: [],
}) as unknown as Entity;

const world = () => {
  const tiles = Array.from({ length: 12 }, (_, x) => Array.from({ length: 12 }, (_, y) => tile(x, y)));
  const spawned: EntityType[] = [];
  const burned: string[] = [];
  const demolished: string[] = [];
  const crowd: Entity[] = [];
  const w: AbilityWorld = {
    tiles,
    spawn: (type) => { spawned.push(type); return creature(type); },
    near: () => crowd,
    ignite: (x, y) => { burned.push(`${x},${y}`); },
    setBiome: (x, y, type) => { tiles[x][y].type = type; },
    demolishAt: (x, y) => { demolished.push(`${x},${y}`); return true; },
    random: () => 0.9,
  };
  return { w, tiles, spawned, burned, demolished, crowd };
};

/** Run long enough for any ability to have fired at least once. */
const live = (entity: Entity, w: AbilityWorld, seconds = 30) => {
  for (let t = 0; t < seconds; t += 0.5) abilityTick(entity, 0.5, w);
};

describe('creature auras', () => {
  it('raises skeletons around a necromancer', () => {
    const { w, spawned } = world();
    live(creature('necromancer'), w);
    expect(spawned.filter(t => t === 'skeleton').length).toBeGreaterThanOrEqual(2);
  });

  it('leaves a trail of snow behind a cold one, and of fire behind a fire skull', () => {
    const { w, tiles, burned } = world();
    const cold = creature('cold_one', 3.5, 3.5);
    live(cold, w, 4);
    expect(tiles[3][3].type).toBe('snow');
    live(creature('fire_skull', 7.5, 7.5), w, 10);
    expect(burned).toContain('7,7');
  });

  it('cures the plague around a plague doctor', () => {
    const { w, crowd } = world();
    const sick = creature('human');
    sick.status.push('infected');
    crowd.push(sick);
    live(creature('plague_doctor'), w, 5);
    expect(sick.status).not.toContain('infected');
  });

  it('flattens what crabzilla walks over', () => {
    const { w, demolished } = world();
    live(creature('crabzilla'), w, 2);
    expect(demolished).toContain('5,5');
  });

  it('does nothing at all for a creature without one', () => {
    const { w, spawned, burned } = world();
    expect(ABILITIES.sheep).toBeUndefined();
    live(creature('sheep'), w);
    expect(spawned).toEqual([]);
    expect(burned).toEqual([]);
  });

  it('keeps its own clock, so twice the time is twice the uses', () => {
    const { w, spawned } = world();
    const n = creature('necromancer');
    live(n, w, 28);
    const short = spawned.length;
    live(n, w, 28);
    expect(spawned.length).toBe(short * 2);
  });
});

describe('hostile towers', () => {
  it('shoot the nearest living thing, never each other, and the ice tower spreads frost', () => {
    const { w, tiles, crowd } = world();
    const victim = creature('human', 7.5, 5.5);
    const other = creature('ice_tower', 5.5, 6.5);
    crowd.push(victim, other);
    const tower = creature('ice_tower', 5.5, 5.5);
    live(tower, w, 12);
    expect(victim.health).toBeLessThan(100);
    expect(other.health).toBe(100);
    expect(tiles.flat().some(t => t.type === 'snow')).toBe(true);
  });
});

describe('the long tail', () => {
  it('heals people near a white mage', () => {
    const { w, crowd } = world();
    const hurt = creature('human', 6.5, 5.5);
    hurt.health = 40;
    crowd.push(hurt);
    live(creature('white_mage'), w, 9);
    expect(hurt.health).toBeGreaterThan(40);
  });

  it('lets Langton’s ant flip the ground it walks and keep walking', () => {
    const { w, tiles } = world();
    const ant = creature('langton_ant', 6.5, 6.5);
    const start = { ...ant.position };
    live(ant, w, 12);
    expect(tiles.flat().some(t => t.type === 'desert')).toBe(true);
    expect(ant.position).not.toEqual(start);
  });

  it('spreads corruption from a tumor, and plants forest around a treant', () => {
    const { w, tiles } = world();
    live(creature('tumor', 4.5, 4.5), w, 30);
    expect(tiles.flat().some(t => t.type === 'corrupted')).toBe(true);
    live(creature('treant', 8.5, 8.5), w, 40);
    expect(tiles.flat().some(t => t.type === 'deciduous_forest' || t.type === 'coniferous_forest')).toBe(true);
  });

  it('has Robot Santa hand an unarmed person a present', () => {
    const { w, crowd } = world();
    const person = creature('human', 6, 5.5);
    crowd.push(person);
    live(creature('robot_santa'), w, 20);
    expect(person.equipment?.weapon).toBeTruthy();
  });
});
