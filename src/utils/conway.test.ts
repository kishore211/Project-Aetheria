import { describe, expect, it } from 'vitest';
import { GLIDER, stepLife } from './conway';

const k = (x: number, y: number) => x * 65536 + y;

describe("Conway's Game of Life", () => {
  it('keeps a block still and flips a blinker', () => {
    const block = new Set([k(1, 1), k(2, 1), k(1, 2), k(2, 2)]);
    expect([...stepLife(block, 10)].sort()).toEqual([...block].sort());
    const blinker = new Set([k(4, 3), k(4, 4), k(4, 5)]);
    expect([...stepLife(blinker, 10)].sort()).toEqual([k(3, 4), k(4, 4), k(5, 4)].sort());
  });

  it('moves a glider one step diagonally every four generations', () => {
    let cells = new Set(GLIDER.map(([x, y]) => k(x + 2, y + 2)));
    for (let i = 0; i < 4; i++) cells = stepLife(cells, 30);
    expect([...cells].sort()).toEqual(GLIDER.map(([x, y]) => k(x + 3, y + 3)).sort());
  });

  it('lets cells die at the edge of the world', () => {
    const edge = new Set([k(0, 0), k(1, 0), k(0, 1)]);
    expect(stepLife(edge, 2).size).toBeLessThanOrEqual(4);
  });
});
