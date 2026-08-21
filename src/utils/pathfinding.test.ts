import { describe, expect, it } from 'vitest';
import { findPath, isWalkableForEntity } from './pathfinding';
import type { Tile } from '../types/world';

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
