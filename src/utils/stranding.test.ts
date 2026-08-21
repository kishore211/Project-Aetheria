// Regression tests for creatures getting stranded — walking into water,
// standing in a flooded tile, or trapped in a pit they cannot climb out of.
//
// These were the "people are falling into the holes and not coming back" bugs.
import { beforeEach, describe, expect, it } from 'vitest';
import { EntityAI, createEntity } from './entitySystemMinimal';
import {
  canSwim,
  findNearestStandable,
  isShoreTile,
  isWalkableForEntity,
} from './pathfinding';
import { DEFAULT_WORLD_LAWS } from '../store/gameStore';
import { publishSimulationContext, simulation } from './simulation';
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
    walkable: !['deep_ocean', 'ocean'].includes(type),
    variant: 0.5,
    ownerId: null,
    villageId: null,
    ...overrides,
  };
};

const makeGrid = (size: number): Tile[][] =>
  Array.from({ length: size }, (_, x) => Array.from({ length: size }, (_, y) => makeTile(x, y)));

/** Turn a rectangle of the grid into water. */
const flood = (grid: Tile[][], x0: number, y0: number, x1: number, y1: number, type: BiomeType = 'ocean') => {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      grid[x][y] = makeTile(x, y, { type, height: type === 'ocean' ? 0.18 : 0.26 });
    }
  }
};

const run = (ai: EntityAI, grid: Tile[][], seconds: number, step = 0.1) => {
  for (let elapsed = 0; elapsed < seconds; elapsed += step) ai.update(grid, step);
};

beforeEach(() => {
  publishSimulationContext({ ...DEFAULT_WORLD_LAWS }, 'summer', 'day');
  simulation.homePositionFor = undefined;
});

describe('who can be where', () => {
  it('keeps land animals out of the open sea', () => {
    for (const type of ['human', 'rabbit', 'sheep', 'wolf', 'bear'] as const) {
      expect(isWalkableForEntity(makeTile(0, 0, { type: 'ocean' }), type), type).toBe(false);
      expect(isWalkableForEntity(makeTile(0, 0, { type: 'deep_ocean' }), type), type).toBe(false);
    }
  });

  it('keeps weak swimmers out of lakes and rivers too', () => {
    for (const type of ['rabbit', 'sheep', 'chicken', 'fox', 'snake'] as const) {
      expect(canSwim(type), type).toBe(false);
      expect(isWalkableForEntity(makeTile(0, 0, { type: 'lake' }), type), type).toBe(false);
      expect(isWalkableForEntity(makeTile(0, 0, { type: 'river' }), type), type).toBe(false);
    }
  });

  it('lets strong swimmers ford a river but not cross the ocean', () => {
    expect(isWalkableForEntity(makeTile(0, 0, { type: 'river' }), 'bear')).toBe(true);
    expect(isWalkableForEntity(makeTile(0, 0, { type: 'ocean' }), 'bear')).toBe(false);
  });

  it('still lets fish swim and birds fly anywhere', () => {
    expect(isWalkableForEntity(makeTile(0, 0, { type: 'deep_ocean' }), 'fish')).toBe(true);
    expect(isWalkableForEntity(makeTile(0, 0, { type: 'grassland' }), 'fish')).toBe(false);
    expect(isWalkableForEntity(makeTile(0, 0, { type: 'deep_ocean' }), 'bird')).toBe(true);
  });
});

describe('shores', () => {
  it('finds the bank of a lake, and does not call open ground a shore', () => {
    const grid = makeGrid(10);
    flood(grid, 5, 5, 6, 6, 'lake');
    expect(isShoreTile(grid[4][5], grid)).toBe(true);
    expect(isShoreTile(grid[0][0], grid)).toBe(false);
    // The water itself is not a shore
    expect(isShoreTile(grid[5][5], grid)).toBe(false);
  });
});

describe('a creature never walks into water it cannot cross', () => {
  it('refuses an unreachable target across the sea instead of marching in', () => {
    const grid = makeGrid(20);
    // A channel of ocean splitting the map at x = 9..11
    flood(grid, 9, 0, 11, 19);

    const rabbit = createEntity('rabbit', 4.5, 10.5, ['swift']);
    const ai = new EntityAI(rabbit);
    ai.setOrder({ kind: 'goto', x: 17, y: 10, purpose: 'return' });

    run(ai, grid, 30);

    // It may wander, but it must still be on dry land on its own side
    const tile = grid[Math.floor(rabbit.position.x)][Math.floor(rabbit.position.y)];
    expect(isWalkableForEntity(tile, 'rabbit')).toBe(true);
    expect(rabbit.position.x).toBeLessThan(9);
  });

  it('drinks from the bank without standing in the lake', () => {
    const grid = makeGrid(16);
    flood(grid, 8, 6, 11, 9, 'lake');

    const sheep = createEntity('sheep', 2.5, 7.5, []);
    sheep.needs.thirst = 0.1;
    const ai = new EntityAI(sheep);

    // Track the peak: thirst starts draining again the moment it finishes
    // drinking, so the end-of-run value says nothing about whether it drank.
    let peakThirst = sheep.needs.thirst;
    let everInLake = false;
    for (let elapsed = 0; elapsed < 60; elapsed += 0.1) {
      ai.update(grid, 0.1);
      peakThirst = Math.max(peakThirst, sheep.needs.thirst);
      if (grid[Math.floor(sheep.position.x)][Math.floor(sheep.position.y)].type === 'lake') {
        everInLake = true;
      }
    }

    expect(peakThirst).toBeGreaterThan(0.9);
    expect(everInLake).toBe(false);
  });
});

describe('rescue', () => {
  it('finds the nearest ground a creature can stand on', () => {
    const grid = makeGrid(12);
    flood(grid, 3, 3, 7, 7);
    const refuge = findNearestStandable(grid, 5, 5, 'human');
    expect(refuge).not.toBeNull();
    expect(isWalkableForEntity(refuge!, 'human')).toBe(true);
  });

  it('moves a creature off ground that was flooded under its feet', () => {
    const grid = makeGrid(14);
    const rabbit = createEntity('rabbit', 6.5, 6.5, []);
    const ai = new EntityAI(rabbit);

    // The player floods the tile it is standing on
    flood(grid, 5, 5, 7, 7);

    run(ai, grid, 20);

    const tile = grid[Math.floor(rabbit.position.x)][Math.floor(rabbit.position.y)];
    expect(isWalkableForEntity(tile, 'rabbit')).toBe(true);
  });

  it('lifts a creature out of a pit it is completely walled into', () => {
    const grid = makeGrid(16);
    // Ring of ocean around a single dry tile — a crater with water walls
    flood(grid, 6, 6, 10, 10);
    grid[8][8] = makeTile(8, 8, { type: 'grassland' });

    const human = createEntity('human', 8.5, 8.5, []);
    human.needs.thirst = 0.1; // it will try to leave, and fail
    const ai = new EntityAI(human);

    run(ai, grid, 40);

    const tile = grid[Math.floor(human.position.x)][Math.floor(human.position.y)];
    expect(isWalkableForEntity(tile, 'human')).toBe(true);
    // Escaped the crater entirely rather than starving on its one tile
    const escaped = tile.x < 6 || tile.x > 10 || tile.y < 6 || tile.y > 10;
    expect(escaped).toBe(true);
  });

  it('sends a stranded villager home when one exists', () => {
    const grid = makeGrid(30);
    simulation.homePositionFor = () => ({ x: 24, y: 24 });

    flood(grid, 2, 2, 6, 6);
    grid[4][4] = makeTile(4, 4, { type: 'grassland' });

    const human = createEntity('human', 4.5, 4.5, []);
    human.villageId = 'village-1';
    human.needs.thirst = 0.1;
    const ai = new EntityAI(human);

    // Track the closest it ever got to home: once rescued it is free to wander
    // again, so its position 40 seconds later says nothing about the rescue.
    let closestToHome = Infinity;
    for (let elapsed = 0; elapsed < 40; elapsed += 0.1) {
      ai.update(grid, 0.1);
      closestToHome = Math.min(
        closestToHome,
        Math.hypot(human.position.x - 24, human.position.y - 24),
      );
    }

    // Rescued toward home rather than dumped on the nearest rock
    expect(closestToHome).toBeLessThan(6);
  });
});
