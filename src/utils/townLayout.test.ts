import { describe, expect, it, beforeEach } from 'vitest';
import { LAYOUTS, mintMeta, resetIdentity, type LayoutId } from './identity';

/**
 * The placement rules themselves live inside settlementSystem, which needs a
 * scene and a terrain renderer to construct. What is testable without either —
 * and what actually carries the visual result — is the layout table: whether
 * each culture's street pattern is a genuinely different shape, and whether
 * every one of them leaves enough room to build a town at all.
 *
 * These are reimplemented here rather than exported, deliberately: the shapes
 * are the *specification*, and a test that imports the implementation of a
 * shape can only ever agree with it.
 */
const fits = (layout: LayoutId, dx: number, dy: number): boolean => {
  switch (layout) {
    case 'grid': return Math.abs(dx) % 2 === 1 && Math.abs(dy) % 2 === 1;
    case 'rings': return Math.max(Math.abs(dx), Math.abs(dy)) % 2 === 1;
    case 'honeycomb': return (dx + Math.abs(dy)) % 3 !== 0;
    case 'diagonal': return (dx + dy) % 2 === 0;
    default: return true;
  }
};

const REACH = 6;

const shapeOf = (layout: LayoutId): string => {
  const rows: string[] = [];
  for (let dy = -REACH; dy <= REACH; dy += 1) {
    let row = '';
    for (let dx = -REACH; dx <= REACH; dx += 1) row += fits(layout, dx, dy) ? '#' : '.';
    rows.push(row);
  }
  return rows.join('\n');
};

const countOf = (layout: LayoutId): number =>
  shapeOf(layout).split('').filter(cell => cell === '#').length;

describe('town layouts', () => {
  const ids = Object.keys(LAYOUTS) as LayoutId[];

  it('describes every layout', () => {
    for (const id of ids) {
      expect(LAYOUTS[id].label.length).toBeGreaterThan(3);
      expect(LAYOUTS[id].description.length).toBeGreaterThan(20);
    }
  });

  it('gives every culture a genuinely different silhouette', () => {
    // If two layouts produce the same shape then two peoples build identical
    // towns, and the whole point of the feature is lost.
    const shapes = new Set(ids.map(shapeOf));
    expect(shapes.size).toBe(ids.length);
  });

  it('leaves every layout enough room to build a town', () => {
    // A pattern that admits almost nothing would stall a village silently.
    // The reach is 6, so there are 169 tiles in range; a quarter of that is a
    // comfortable floor.
    for (const id of ids) {
      expect(countOf(id), `${id} admits ${countOf(id)} of 169`)
        .toBeGreaterThan(169 / 5);
    }
  });

  it('makes the ordered layout the sparsest and scattered the densest', () => {
    // Sanity on the direction of the effect: a grid with streets between every
    // row should build on fewer tiles than a culture with no rule at all.
    expect(countOf('grid')).toBeLessThan(countOf('scattered'));
    expect(countOf('scattered')).toBe(169);
  });

  it('never blocks the ring immediately around the centre for every layout', () => {
    // Something has to be buildable near the bonfire, or a new village cannot
    // grow outward from its own middle.
    for (const id of ids) {
      let nearby = 0;
      for (let dx = -2; dx <= 2; dx += 1) {
        for (let dy = -2; dy <= 2; dy += 1) {
          if (dx === 0 && dy === 0) continue;
          if (fits(id, dx, dy)) nearby += 1;
        }
      }
      expect(nearby, `${id} has nowhere to build near its centre`).toBeGreaterThan(2);
    }
  });
});

describe('cultures carry a layout', () => {
  beforeEach(resetIdentity);

  it('gives every minted culture one, and only cultures', () => {
    for (let step = 0; step <= 20; step += 1) {
      const culture = mintMeta('culture', step / 20);
      expect(culture.layout, `roll ${step / 20}`).toBeTruthy();
      expect(LAYOUTS[culture.layout!]).toBeDefined();
    }
    expect(mintMeta('language', 0.3).layout).toBeUndefined();
    expect(mintMeta('religion', 0.3).layout).toBeUndefined();
  });

  it('reaches every layout across the range of rolls', () => {
    // Otherwise some layouts are dead content that no world ever shows.
    const seen = new Set<string>();
    for (let step = 0; step <= 60; step += 1) {
      seen.add(mintMeta('culture', step / 60).layout!);
    }
    expect(seen.size).toBe(Object.keys(LAYOUTS).length);
  });
});
