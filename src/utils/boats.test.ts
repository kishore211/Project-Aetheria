import { describe, expect, it } from 'vitest';
import { BoatSystem, CATCH, landmasses, nearestShore, nearestWater, waterPath } from './boats';
import type { BiomeType, Tile } from '../types/world';

/** A grid from rows of text: `.` sea, `#` land. */
const grid = (rows: string[]): Tile[][] => {
  const n = rows.length;
  return Array.from({ length: n }, (_, x) => Array.from({ length: n }, (_, y) => {
    const land = rows[y][x] === '#';
    return {
      x, y, type: (land ? 'grassland' : 'ocean') as BiomeType, height: land ? 0.4 : 0.15,
      walkable: land, temperature: 0.5, moisture: 0.5, fertility: 0.5,
      structure: null, resources: [], entities: [], population: 0,
    } as unknown as Tile;
  }));
};

const TWO_ISLANDS = [
  '............',
  '.###........',
  '.###........',
  '.###........',
  '............',
  '............',
  '............',
  '........###.',
  '........###.',
  '........###.',
  '............',
  '............',
];

describe('water geometry', () => {
  it('tells two islands apart', () => {
    const tiles = grid(TWO_ISLANDS);
    const { label, sizes } = landmasses(tiles);
    const n = tiles.length;
    expect(sizes).toHaveLength(2);
    expect(label[2 * n + 2]).not.toBe(label[8 * n + 9]);
    expect(sizes.every(size => size === 9)).toBe(true);
  });

  it('finds the nearest sea from a village and the nearest shore from the sea', () => {
    const tiles = grid(TWO_ISLANDS);
    const water = nearestWater(tiles, { x: 2, y: 2 }, 5)!;
    expect(tiles[water.x][water.y].type).toBe('ocean');
    expect(Math.max(Math.abs(water.x - 2), Math.abs(water.y - 2))).toBe(2);
    const shore = nearestShore(tiles, { x: 6, y: 8 }, 5)!;
    expect(tiles[shore.x][shore.y].type).toBe('grassland');
  });

  it('routes across open sea and refuses to cross land', () => {
    const tiles = grid(TWO_ISLANDS);
    const path = waterPath(tiles, { x: 0, y: 0 }, { x: 11, y: 11 })!;
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path.at(-1)).toEqual({ x: 11, y: 11 });
    for (const step of path) expect(tiles[step.x][step.y].type).toBe('ocean');

    const lake = grid([
      '#####',
      '#.###',
      '#####',
      '###.#',
      '#####',
    ]);
    expect(waterPath(lake, { x: 1, y: 1 }, { x: 3, y: 3 })).toBeNull();
  });

  it('will not squeeze diagonally between two land corners', () => {
    const tiles = grid([
      '.#',
      '#.',
    ]);
    expect(waterPath(tiles, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });
});

describe('the fleet', () => {
  it('sends a fishing boat out, lets it fish, and brings the catch home', () => {
    const tiles = grid(TWO_ISLANDS);
    let caught = 0;
    const fleet = new BoatSystem(tiles, { onCatch: (_boat, food) => { caught += food; } });
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const boat = fleet.launchFishing('village-1', 'kingdom-1', { x: 4, y: 2 }, random)!;
    expect(boat).toBeTruthy();
    expect(fleet.fishingBoatsOf('village-1')).toBe(1);
    for (let i = 0; i < 400 && caught === 0; i++) fleet.update(0.1, random);
    expect(caught).toBe(CATCH);
    // ...and it never once left the water.
    expect(tiles[Math.floor(boat.x)][Math.floor(boat.y)].type).toBe('ocean');
  });

  it('carries passengers to the far shore and puts them on land', () => {
    const tiles = grid(TWO_ISLANDS);
    let landedAt: { x: number; y: number } | null = null;
    let carried: string[] = [];
    const fleet = new BoatSystem(tiles, {
      onLand: (boat, shore) => { landedAt = shore; carried = boat.passengers; },
    });
    const boat = fleet.launchTransport('kingdom-1', { x: 4, y: 2 }, { x: 7, y: 8 }, ['a', 'b'], 'party-1');
    expect(boat).toBeTruthy();
    expect(fleet.passengersAtSea()).toEqual(new Set(['a', 'b']));
    for (let i = 0; i < 200 && !landedAt; i++) fleet.update(0.1);
    expect(landedAt).not.toBeNull();
    expect(tiles[landedAt!.x][landedAt!.y].type).toBe('grassland');
    expect(carried).toEqual(['a', 'b']);
    expect(fleet.boats.size).toBe(0);
  });

  it('refuses a voyage with no sea route', () => {
    const tiles = grid([
      '#####',
      '#.###',
      '#####',
      '###.#',
      '#####',
    ]);
    const fleet = new BoatSystem(tiles);
    expect(fleet.launchTransport('k', { x: 1, y: 1 }, { x: 3, y: 3 }, ['a'], null)).toBeNull();
  });

  it('runs a transport aground rather than through land raised in its way', () => {
    const tiles = grid(TWO_ISLANDS);
    let landed = false;
    const fleet = new BoatSystem(tiles, { onLand: () => { landed = true; } });
    fleet.launchTransport('k', { x: 0, y: 6 }, { x: 11, y: 6 }, ['a'], null);
    // Wall the whole row off: there is no way round now.
    for (let y = 0; y < 12; y++) {
      tiles[6][y].type = 'grassland';
      tiles[6][y].walkable = true;
      tiles[6][y].height = 0.4;
    }
    for (let i = 0; i < 200 && !landed; i++) fleet.update(0.1);
    expect(landed).toBe(true);
  });
});
