import { describe, expect, it } from 'vitest';
import {
  findPath,
  isWalkableForEntity,
  provablyUnreachable,
  setTileBiome,
  standableNear,
  setTileWalkable,
} from './pathfinding';
import type { BiomeType, EntityType, Tile } from '../types/world';

const makeTile = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({
  x,
  y,
  height: 0.5,
  scaledHeight: 1,
  moisture: 0.5,
  temperature: 0.5,
  fertility: 0.5,
  type: 'grassland',
  population: 0,
  resources: [],
  structure: null,
  entities: [],
  isOnFire: false,
  walkable: true,
  ...overrides,
});

const makeGrid = (size: number): Tile[][] =>
  Array.from({ length: size }, (_, x) =>
    Array.from({ length: size }, (_, y) => makeTile(x, y)),
  );

describe('isWalkableForEntity', () => {
  it('lets fish swim but not walk', () => {
    expect(isWalkableForEntity(makeTile(0, 0, { type: 'ocean' }), 'fish')).toBe(true);
    expect(isWalkableForEntity(makeTile(0, 0, { type: 'grassland' }), 'fish')).toBe(false);
  });

  it('blocks land creatures from deep water', () => {
    expect(isWalkableForEntity(makeTile(0, 0, { type: 'deep_ocean' }), 'human')).toBe(false);
    expect(isWalkableForEntity(makeTile(0, 0, { type: 'grassland' }), 'human')).toBe(true);
  });

  it('lets birds and dragons go anywhere walkable', () => {
    expect(isWalkableForEntity(makeTile(0, 0, { type: 'deep_ocean' }), 'bird')).toBe(true);
    expect(isWalkableForEntity(makeTile(0, 0, { type: 'mountains' }), 'dragon')).toBe(true);
  });
});

describe('findPath', () => {
  it('finds a direct path on open ground', () => {
    const grid = makeGrid(8);
    const path = findPath(grid[0][0], grid[5][5], grid, 'human');

    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toBe(grid[5][5]);
  });

  it('routes around an ocean wall', () => {
    const grid = makeGrid(8);
    // Vertical ocean wall at x=3 with a gap at y=7
    for (let y = 0; y < 7; y++) {
      grid[3][y].type = 'deep_ocean';
      grid[3][y].walkable = false;
    }
    const path = findPath(grid[0][0], grid[6][0], grid, 'human');

    expect(path.length).toBeGreaterThan(0);
    expect(path.some((tile) => tile.x === 3 && tile.y >= 6)).toBe(true);
    expect(path.every((tile) => tile.type !== 'deep_ocean')).toBe(true);
  });

  it('returns an empty path when the target is unreachable', () => {
    const grid = makeGrid(6);
    // Fully enclose the target
    for (const [dx, dy] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
      const tile = grid[4 + dx][4 + dy];
      tile.walkable = false;
      tile.type = 'deep_ocean';
    }
    const path = findPath(grid[0][0], grid[4][4], grid, 'human');

    expect(path).toEqual([]);
  });
});

describe('reachability pre-check', () => {
  /** Two islands separated by a band of the given water, in columns 3 and 4. */
  const islands = (band: BiomeType, size = 8): Tile[][] => {
    const grid = makeGrid(size);
    for (let y = 0; y < size; y++) {
      setTileBiome(grid[3][y], band);
      setTileBiome(grid[4][y], band);
    }
    return grid;
  };

  it('fails at once when start and goal are on different islands', () => {
    const grid = islands('deep_ocean');
    const start = grid[0][0];
    const goal = grid[7][7];

    expect(provablyUnreachable(start, goal, grid, 'human')).toBe(true);
    expect(findPath(start, goal, grid, 'human')).toEqual([]);
    // The search never ran: it would have stamped the start tile
    expect(start.searchStamp).toBeUndefined();
  });

  it('searches normally when start and goal share an island', () => {
    const grid = islands('deep_ocean');
    const path = findPath(grid[0][0], grid[2][6], grid, 'human');

    expect(provablyUnreachable(grid[0][0], grid[2][6], grid, 'human')).toBe(false);
    expect(path[path.length - 1]).toBe(grid[2][6]);
  });

  it('keeps land walkers out of shallows that swimmers wade through', () => {
    const grid = islands('shallow_water');
    const start = grid[0][0];
    const goal = grid[7][7];

    expect(findPath(start, goal, grid, 'rhino')).toEqual([]);
    expect(provablyUnreachable(start, goal, grid, 'rhino')).toBe(true);
    expect(findPath(start, goal, grid, 'human').length).toBeGreaterThan(0);
  });

  it('invalidates when terraforming a land bridge across the channel', () => {
    const grid = islands('deep_ocean');
    const start = grid[0][0];
    const goal = grid[7][7];
    // Prime the component cache while the islands are still separate
    expect(findPath(start, goal, grid, 'human')).toEqual([]);

    for (let y = 0; y < 8; y++) setTileBiome(grid[3][y], 'grassland');
    setTileBiome(grid[4][3], 'grassland');
    // Keep the bridge a single crossing by re-closing the rest of column 4
    for (let y = 0; y < 8; y++) if (y !== 3) setTileBiome(grid[4][y], 'deep_ocean');

    expect(provablyUnreachable(start, goal, grid, 'human')).toBe(false);
    expect(findPath(start, goal, grid, 'human').length).toBeGreaterThan(0);
  });

  it('invalidates when a wall of unwalkable tiles is opened', () => {
    const grid = makeGrid(8);
    for (let y = 0; y < 8; y++) setTileWalkable(grid[3][y], false);
    const start = grid[0][0];
    const goal = grid[7][0];

    expect(findPath(start, goal, grid, 'human')).toEqual([]);
    setTileWalkable(grid[3][5], true);
    expect(findPath(start, goal, grid, 'human').length).toBeGreaterThan(0);
  });

  it('agrees with a real search across random terrain and mutations', () => {
    const biomes: BiomeType[] = ['grassland', 'deep_ocean', 'shallow_water', 'ocean', 'beach', 'mountains', 'river'];
    const kinds: EntityType[] = ['fish', 'bird', 'bear', 'rhino', 'human'];
    let seed = 20261016;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)];

    for (let round = 0; round < 6; round++) {
      const size = 10;
      const grid = makeGrid(size);
      for (const row of grid) for (const tile of row) setTileBiome(tile, pick(biomes));

      for (let step = 0; step < 150; step++) {
        // Mutate through the helpers, the way the simulation does
        const tile = grid[Math.floor(random() * size)][Math.floor(random() * size)];
        if (random() < 0.5) setTileBiome(tile, pick(biomes));
        else setTileWalkable(tile, random() < 0.7);

        const a = grid[Math.floor(random() * size)][Math.floor(random() * size)];
        const b = grid[Math.floor(random() * size)][Math.floor(random() * size)];
        const kind = pick(kinds);
        // A* only promises a path from a tile the walker can stand on
        if (a === b || !isWalkableForEntity(a, kind)) continue;

        const reachable = findPath(a, b, grid, kind).length > 0;
        expect(reachable).toBe(!provablyUnreachable(a, b, grid, kind));
      }
    }
  });
});

describe('standableNear', () => {
  it('returns the tile itself when the walker can stand on it', () => {
    const grid = makeGrid(6);
    expect(standableNear(grid[2][2], grid, 'human')).toBe(grid[2][2]);
  });

  it('returns the nearest bank for a land walker and the water itself for a swimmer', () => {
    const grid = makeGrid(8);
    for (let y = 0; y < 8; y++) setTileBiome(grid[4][y], 'lake');

    const bank = standableNear(grid[4][3], grid, 'elf');
    expect(bank).not.toBeNull();
    expect(Math.abs(bank!.x - 4)).toBe(1);
    expect(isWalkableForEntity(bank!, 'elf')).toBe(true);
    expect(standableNear(grid[4][3], grid, 'bear')).toBe(grid[4][3]);
  });
});
