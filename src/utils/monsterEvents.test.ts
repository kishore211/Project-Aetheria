import { describe, expect, it } from 'vitest';
import { MONSTER_EVENTS, sendMonster, type MonsterWorld } from './monsterEvents';
import type { BiomeType, EntityType, Tile } from '../types/world';

const makeWorld = (typeAt: (x: number, y: number) => BiomeType, season: MonsterWorld['season'] = 'summer') => {
  const size = 40;
  const tiles = Array.from({ length: size }, (_, x) => Array.from({ length: size }, (_, y) => ({
    x, y, type: typeAt(x, y), walkable: !['ocean', 'deep_ocean', 'shallow_water'].includes(typeAt(x, y)),
  }) as unknown as Tile));
  const spawned: EntityType[] = [];
  const lines: string[] = [];
  let seed = 7;
  const world: MonsterWorld = {
    tiles, size, season,
    buildings: () => [{ id: 'b', kind: 'bonfire', x: 20, y: 20, villageId: 'v', villageName: 'Ashby' }],
    spawn: (type) => { spawned.push(type); return true; },
    announce: (m) => { lines.push(m); },
    random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; },
  };
  return { world, spawned, lines };
};

describe('monsters that come to the towns', () => {
  it('needs a town to visit', () => {
    const { world, spawned } = makeWorld(() => 'grassland');
    world.buildings = () => [];
    expect(sendMonster(world)).toBeNull();
    expect(spawned).toEqual([]);
  });

  it('sends something, and says where', () => {
    const { world, spawned, lines } = makeWorld(() => 'grassland');
    const sent = sendMonster(world);
    expect(sent).not.toBeNull();
    expect(spawned.length).toBeGreaterThan(0);
    expect(lines[0]).toContain('Ashby');
  });

  it('only raises Crabzilla where there is sea, and the Cold Ones only in winter', () => {
    const crab = MONSTER_EVENTS.find(e => e.id === 'crabzilla')!;
    const cold = MONSTER_EVENTS.find(e => e.id === 'cold_ones')!;
    const town = { id: 'b', kind: 'bonfire', x: 20, y: 20, villageId: 'v', villageName: 'Ashby' };
    expect(crab.run(makeWorld(() => 'grassland').world, town)).toBe(false);
    const coastal = makeWorld((x) => (x > 28 ? 'ocean' : 'grassland'));
    expect(crab.run(coastal.world, town)).toBe(true);
    expect(coastal.spawned).toEqual(['crabzilla']);
    expect(cold.run(makeWorld(() => 'grassland', 'summer').world, town)).toBe(false);
    expect(cold.run(makeWorld(() => 'grassland', 'winter').world, town)).toBe(true);
  });
});

describe('the rest of the scripted events', () => {
  it('turns a third of a town mad, and needs people to do it', () => {
    const mad = MONSTER_EVENTS.find(e => e.id === 'mad_thoughts')!;
    const town = { id: 'b', kind: 'bonfire', x: 20, y: 20, villageId: 'v', villageName: 'Ashby' };
    const empty = makeWorld(() => 'grassland');
    expect(mad.run(empty.world, town)).toBe(false);
    const people = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, type: 'human', status: [] as string[] }));
    const busy = makeWorld(() => 'grassland');
    busy.world.near = () => people as never;
    expect(mad.run(busy.world, town)).toBe(true);
    expect(people.filter(p => p.status.includes('enraged')).length).toBe(3);
  });

  it('lands an alien invasion in force', () => {
    const invasion = MONSTER_EVENTS.find(e => e.id === 'alien_invasion')!;
    const { world, spawned } = makeWorld(() => 'grassland');
    const town = { id: 'b', kind: 'bonfire', x: 20, y: 20, villageId: 'v', villageName: 'Ashby' };
    expect(invasion.run(world, town)).toBe(true);
    expect(spawned.filter(t => t === 'alien').length).toBe(4);
    expect(spawned).toContain('ufo');
  });
});

describe('plague', () => {
  it('infects three in a town big enough to catch it', () => {
    const plague = MONSTER_EVENTS.find(e => e.id === 'plague')!;
    const town = { id: 'b', kind: 'bonfire', x: 20, y: 20, villageId: 'v', villageName: 'Ashby' };
    const people = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, type: 'elf', status: [] as string[] }));
    const { world } = makeWorld(() => 'grassland');
    world.near = () => people as never;
    expect(plague.run(world, town)).toBe(true);
    expect(people.filter(p => p.status.includes('infected')).length).toBe(3);
  });
});
