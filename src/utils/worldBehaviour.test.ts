import { describe, expect, it } from 'vitest';
import { WORLD_PROCESSES, WorldBehaviour, type WorldContext, type WorldProcess } from './worldBehaviour';
import { generateWorld } from './worldGenerator';
import type { BiomeType, EntityType, Tile } from '../types/world';

const makeContext = (overrides: Partial<WorldContext> = {}): WorldContext & {
  synced: Tile[];
  spawned: Array<{ type: EntityType; x: number; y: number }>;
  events: string[];
} => {
  const { tilesData } = generateWorld({ seed: 4242, mapSize: 40 });
  const synced: Tile[] = [];
  const spawned: Array<{ type: EntityType; x: number; y: number }> = [];
  const events: string[] = [];
  return {
    tiles: tilesData,
    size: tilesData.length,
    season: 'summer',
    growth: 1,
    laws: { biomeGrowth: true, disasters: true },
    inBounds: (x, y) => x >= 0 && y >= 0 && x < tilesData.length && y < tilesData.length,
    syncTile: (tile) => { synced.push(tile); },
    spawn: (type, x, y) => { spawned.push({ type, x, y }); return true; },
    population: () => 0,
    announce: (message) => { events.push(message); },
    random: Math.random,
    synced,
    spawned,
    events,
    ...overrides,
  };
};

/** A row that just counts, for testing the scheduler without a world. */
const counter = (name: string, min: number, max: number, log: string[]): WorldProcess => ({
  name, minInterval: min, maxInterval: max, action: () => { log.push(name); },
});

describe('the world-behaviour scheduler', () => {
  it('fires nothing before a row is due, and the row once when it is', () => {
    const log: string[] = [];
    // A fixed random puts every gap at the top of its range, so "due" is exact.
    const clock = new WorldBehaviour([counter('slow', 10, 10, log)], () => 0);

    expect(clock.advance(9, makeContext())).toEqual([]);
    expect(log).toEqual([]);
    expect(clock.advance(1.5, makeContext())).toEqual(['slow']);
    expect(log).toEqual(['slow']);
  });

  it('does not fire a row twice for one long step', () => {
    // A tab returning from the background hands the engine a huge delta. A
    // scheduler that catches up would run a year of vegetation in one frame.
    const log: string[] = [];
    const clock = new WorldBehaviour([counter('fast', 1, 1, log)], () => 0);
    clock.advance(60, makeContext());
    expect(log).toEqual(['fast']);
  });

  it('keeps rows out of step with each other', () => {
    // Two rows with the same range must not lock into the same beat. With a
    // real random the gaps differ, so over many firings they drift apart.
    const log: string[] = [];
    const clock = new WorldBehaviour([
      counter('a', 1, 3, log),
      counter('b', 1, 3, log),
    ]);
    // One context, built once: these rows never look at it, and generating a
    // world per step is two hundred worlds.
    const ctx = makeContext();
    let together = 0;
    for (let step = 0; step < 200; step += 1) {
      if (clock.advance(0.5, ctx).length === 2) together += 1;
    }
    expect(together).toBeLessThan(40);
  });

  it('keeps running a row whose action throws', () => {
    // A row stuck at zero would fire every frame for the rest of the session,
    // which turns one bad process into a hung game.
    const log: string[] = [];
    const clock = new WorldBehaviour([
      { name: 'bad', minInterval: 1, maxInterval: 1, action: () => { throw new Error('boom'); } },
      counter('good', 1, 1, log),
    ], () => 0);

    expect(() => clock.advance(2, makeContext())).toThrow('boom');
    // The thrower reset its own countdown before running, so the next advance
    // is a normal one rather than an immediate re-fire.
    expect(() => clock.advance(0.1, makeContext())).not.toThrow();
  });
});

describe('the world-behaviour table', () => {
  it('names every row uniquely, and gives each a sane range', () => {
    const names = WORLD_PROCESSES.map(p => p.name);
    expect(new Set(names).size).toBe(names.length);
    for (const process of WORLD_PROCESSES) {
      expect(process.minInterval).toBeGreaterThan(0);
      expect(process.maxInterval).toBeGreaterThanOrEqual(process.minInterval);
    }
  });

  it('obeys the biome-growth law', () => {
    // Switching growth off has to stop everything that reshapes the map, or
    // the law is a lie the moment a forest creeps over a border.
    const frozen = makeContext({ laws: { biomeGrowth: false, disasters: true } });
    for (const process of WORLD_PROCESSES) {
      if (process.name !== 'vegetation' && process.name !== 'corruption') continue;
      for (let i = 0; i < 40; i += 1) process.action(frozen);
    }
    expect(frozen.synced).toHaveLength(0);
  });

  it('spreads forest into fertile open ground, and never into a village', () => {
    const ctx = makeContext();
    // Build a guaranteed case rather than hunting for one in the noise.
    for (let x = 10; x < 14; x += 1) {
      for (let y = 10; y < 14; y += 1) {
        const tile = ctx.tiles[x][y];
        tile.type = (x === 10 ? 'deciduous_forest' : 'grassland') as BiomeType;
        tile.moisture = 0.9;
        tile.fertility = 0.9;
        tile.height = 0.5;
        tile.isOnFire = false;
        tile.villageId = x === 13 ? 'v1' : null;
      }
    }
    const vegetation = WORLD_PROCESSES.find(p => p.name === 'vegetation')!;
    for (let i = 0; i < 400; i += 1) vegetation.action(ctx);

    expect(ctx.synced.length).toBeGreaterThan(0);
    for (const tile of ctx.synced) expect(tile.villageId).toBeNull();
  });

  it('stops adding wildlife once the world is full', () => {
    const wildlife = WORLD_PROCESSES.find(p => p.name === 'wildlife')!;
    const crowded = makeContext({ population: () => 100000 });
    for (let i = 0; i < 20; i += 1) wildlife.action(crowded);
    expect(crowded.spawned).toHaveLength(0);

    const empty = makeContext({ population: () => 0 });
    for (let i = 0; i < 60; i += 1) wildlife.action(empty);
    expect(empty.spawned.length).toBeGreaterThan(0);
  });

  it('only eats roads nobody owns any more', () => {
    const ctx = makeContext();
    for (let x = 0; x < ctx.size; x += 1) {
      for (let y = 0; y < ctx.size; y += 1) {
        ctx.tiles[x][y].road = true;
        ctx.tiles[x][y].villageId = y < 20 ? 'v1' : null;
      }
    }
    const roads = WORLD_PROCESSES.find(p => p.name === 'roads')!;
    for (let i = 0; i < 200; i += 1) roads.action(ctx);

    let ownedLost = 0;
    let abandonedLost = 0;
    for (let x = 0; x < ctx.size; x += 1) {
      for (let y = 0; y < ctx.size; y += 1) {
        if (ctx.tiles[x][y].road) continue;
        if (y < 20) ownedLost += 1; else abandonedLost += 1;
      }
    }
    expect(ownedLost).toBe(0);
    expect(abandonedLost).toBeGreaterThan(0);
  });
});
