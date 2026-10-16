import { describe, expect, it } from 'vitest';
import { WorldGrid } from './grid';
import { generateMap } from './mapgen';
import { findNearestPassable, findPath, pathCost } from './pathfinding';

/** Build a grid from rows: '.' grass, '~' ocean, 'r' river, 'm' mountains. */
function parse(rows: string[]): WorldGrid {
  const g = new WorldGrid(rows[0].length, rows.length);
  const ids: Record<string, string> = { '.': 'grassland', '~': 'ocean', r: 'river', m: 'mountains', s: 'shallow_water' };
  rows.forEach((row, y) => [...row].forEach((c, x) => g.setType(g.index(x, y), ids[c])));
  return g;
}

describe('findPath', () => {
  it('walks a straight line and includes both ends', () => {
    const g = parse(['.....']);
    expect(findPath(g, 0, 4)).toEqual([0, 1, 2, 3, 4]);
    expect(findPath(g, 2, 2)).toEqual([2]);
  });

  it('routes around water', () => {
    const g = parse([
      '..~..',
      '..~..',
      '..~..',
      '.....',
    ]);
    const path = findPath(g, g.index(0, 0), g.index(4, 0))!;
    expect(path).not.toBeNull();
    for (const i of path) expect(g.isLiquid(i)).toBe(false);
    expect(path.length).toBeGreaterThan(5);
  });

  it('returns null across separate islands without searching, and for blocked ends', () => {
    const g = parse(['..~..']);
    expect(findPath(g, 0, 4)).toBeNull();
    expect(findPath(g, 0, 2)).toBeNull();
    expect(findPath(g, 2, 0)).toBeNull();
    expect(findPath(g, 0, 99)).toBeNull();
  });

  it('fords shallow water only when wading', () => {
    const g = parse(['..r..']);
    expect(findPath(g, 0, 4)).toBeNull();
    expect(findPath(g, 0, 4, { wade: true })).toEqual([0, 1, 2, 3, 4]);
    const sea = parse(['..~..']);
    expect(findPath(sea, 0, 4, { wade: true })).toBeNull();
  });

  it('prefers a longer easy route over slow terrain', () => {
    const g = parse([
      'mmmmm',
      '.mmm.',
      '.....',
    ]);
    // Straight across the top row costs far more than going around via row 2.
    const path = findPath(g, g.index(0, 1), g.index(4, 1))!;
    expect(path.some((i) => g.yOf(i) === 2)).toBe(true);
    expect(path.every((i) => g.typeIdOf(i) !== 'mountains')).toBe(true);
  });

  it('never cuts a corner around water', () => {
    const g = parse([
      '.~',
      '~.',
    ]);
    // Both sides of the diagonal are water, so the two tiles are not connected.
    expect(findPath(g, 0, 3)).toBeNull();
    const h = parse([
      '..',
      '.~',
    ]);
    // (1,0) -> (0,1) would clip the water tile at (1,1); go via (0,0).
    expect(findPath(h, 1, 2)).toEqual([1, 0, 2]);
  });

  it('respects the expansion budget', () => {
    const g = parse(['.'.repeat(40)]);
    expect(findPath(g, 0, 39, { maxExpansions: 5 })).toBeNull();
    expect(findPath(g, 0, 39)).not.toBeNull();
  });

  it('follows terrain changes after relabeling', () => {
    const g = parse(['..~..']);
    expect(findPath(g, 0, 4)).toBeNull();
    g.setType(2, 'grassland');
    expect(findPath(g, 0, 4)).toHaveLength(5);
  });

  it('finds optimal-cost paths on a generated map', () => {
    const g = new WorldGrid(64, 64);
    generateMap(g, { seed: 8, template: 'pangaea' });
    // Largest region, farthest pair among a few samples.
    let best = 1;
    for (let r = 1; r <= g.regionCount; r++) if (g.regionSize(r) > g.regionSize(best)) best = r;
    const tiles: number[] = [];
    for (let i = 0; i < g.size; i++) if (g.regionOf(i) === best) tiles.push(i);
    const a = tiles[0];
    const b = tiles[tiles.length - 1];
    const path = findPath(g, a, b)!;
    expect(path[0]).toBe(a);
    expect(path[path.length - 1]).toBe(b);
    for (const i of path) expect(g.isWalkable(i)).toBe(true);
    expect(pathCost(g, path)).toBeGreaterThan(0);
    // Different region: fast fail.
    for (let i = 0; i < g.size; i++) {
      if (g.isWalkable(i) && g.regionOf(i) !== best) {
        expect(findPath(g, a, i)).toBeNull();
        break;
      }
    }
  });
});

describe('findNearestPassable', () => {
  it('finds the closest standable tile', () => {
    const g = parse(['~~~~~', '~~~~~', '~~~.~']);
    expect(findNearestPassable(g, 0, 0)).toBe(g.index(3, 2));
    expect(findNearestPassable(g, 0, 0, {}, 1)).toBeNull();
  });
});
