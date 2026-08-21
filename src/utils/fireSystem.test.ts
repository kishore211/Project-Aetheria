// The regression test that matters here is the cascade: fire that spreads a
// little faster than it burns out will always consume the whole world from a
// single spark, and it is not obvious from reading the code that it does.
import { describe, expect, it } from 'vitest';
import { FLAMMABLE_BIOMES, FireSystem } from './fireSystem';
import { computeScaledHeight, type BiomeType, type Tile } from '../types/world';

const makeTile = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => {
  const type = (overrides.type ?? 'grassland') as BiomeType;
  const height = overrides.height ?? 0.45;
  return {
    x, y,
    height,
    scaledHeight: computeScaledHeight(height, type),
    moisture: 0.5,
    temperature: 0.5,
    fertility: 0.6,
    type,
    population: 0,
    resources: [],
    structure: null,
    entities: [],
    isOnFire: false,
    walkable: true,
    variant: 0.5,
    ownerId: null,
    villageId: null,
    ...overrides,
  };
};

const makeGrid = (size: number, overrides: Partial<Tile> = {}): Tile[][] =>
  Array.from({ length: size }, (_, x) =>
    Array.from({ length: size }, (_, y) => makeTile(x, y, overrides)));

const burn = (fire: FireSystem, seconds: number, raining = false) => {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.25) {
    fire.update(0.25, { raining, spreadEnabled: true });
  }
};

const scorched = (grid: Tile[][]): number => {
  let count = 0;
  for (const column of grid) {
    for (const tile of column) if (tile.type === 'badlands' || tile.isOnFire) count++;
  }
  return count;
};

describe('igniting', () => {
  it('lights dry land and refuses water', () => {
    const grid = makeGrid(8);
    const fire = new FireSystem(grid);

    expect(fire.ignite(grid[3][3])).toBe(true);
    expect(grid[3][3].isOnFire).toBe(true);

    const lake = makeTile(1, 1, { type: 'lake', height: 0.26 });
    expect(fire.ignite(lake)).toBe(false);
  });

  it('will not light the same tile twice', () => {
    const grid = makeGrid(8);
    const fire = new FireSystem(grid);
    expect(fire.ignite(grid[3][3])).toBe(true);
    expect(fire.ignite(grid[3][3])).toBe(false);
    expect(fire.burningCount).toBe(1);
  });

  it('burns out on its own and scorches the ground', () => {
    const grid = makeGrid(6, { type: 'desert' }); // not flammable, so no spread
    const fire = new FireSystem(grid);
    fire.ignite(grid[3][3]);

    burn(fire, 12);

    expect(fire.burningCount).toBe(0);
    expect(grid[3][3].type).toBe('badlands');
  });
});

describe('the cascade', () => {
  it('does not burn the whole world down from one spark', () => {
    const size = 48;
    const grid = makeGrid(size); // every tile flammable grassland
    const fire = new FireSystem(grid);
    fire.ignite(grid[24][24]);

    // Two full minutes — far longer than any fire should need
    burn(fire, 120);

    const total = size * size;
    const damaged = scorched(grid);
    // A fire should leave a scar, not a dead planet
    expect(damaged).toBeGreaterThan(0);
    expect(damaged / total).toBeLessThan(0.35);
    expect(fire.burningCount).toBe(0);
  });

  it('spreads further across dry ground than damp', () => {
    const size = 40;
    const runOne = (moisture: number) => {
      const grid = makeGrid(size, { moisture });
      const fire = new FireSystem(grid);
      fire.ignite(grid[20][20]);
      burn(fire, 90);
      return scorched(grid);
    };

    const dry = runOne(0.05);
    const damp = runOne(0.95);
    expect(dry).toBeGreaterThan(damp);
  });

  it('stops spreading when the world law is off', () => {
    const grid = makeGrid(24);
    const fire = new FireSystem(grid);
    fire.ignite(grid[12][12]);

    for (let elapsed = 0; elapsed < 60; elapsed += 0.25) {
      fire.update(0.25, { raining: false, spreadEnabled: false });
    }

    expect(scorched(grid)).toBe(1);
  });
});

describe('rain', () => {
  it('puts fires out quickly and leaves the ground unscorched', () => {
    const grid = makeGrid(16);
    const fire = new FireSystem(grid);
    fire.ignite(grid[8][8]);

    burn(fire, 6, true);

    expect(fire.burningCount).toBe(0);
    expect(grid[8][8].type).toBe('grassland');
  });
});

describe('effects', () => {
  it('reports ignition, extinguishing and damage to its owner', () => {
    const grid = makeGrid(10);
    const ignited: number[] = [];
    const quenched: number[] = [];
    let damageCalls = 0;
    const fire = new FireSystem(grid, {
      onIgnite: (tile) => ignited.push(tile.x),
      onExtinguish: (tile) => quenched.push(tile.x),
      onDamage: () => { damageCalls++; },
    });

    fire.ignite(grid[5][5]);
    burn(fire, 12);

    expect(ignited.length).toBeGreaterThan(0);
    expect(quenched.length).toBeGreaterThan(0);
    expect(damageCalls).toBeGreaterThan(0);
  });

  it('only treats the documented biomes as flammable', () => {
    expect(FLAMMABLE_BIOMES).toContain('grassland');
    expect(FLAMMABLE_BIOMES).not.toContain('desert');
    expect(FLAMMABLE_BIOMES).not.toContain('mountains');
  });
});
