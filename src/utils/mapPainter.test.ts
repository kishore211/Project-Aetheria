import { describe, expect, it } from 'vitest';
import { MapPainter, PX, SURFACE } from './mapPainter';
import type { BiomeType, Tile } from '../types/world';

const GREEN: [number, number, number] = [100, 160, 70];
const BLUE: [number, number, number] = [40, 90, 140];

const makeTiles = (size: number, typeAt: (x: number, y: number) => BiomeType): Tile[][] =>
  Array.from({ length: size }, (_, x) => Array.from({ length: size }, (_, y) => ({
    x, y, type: typeAt(x, y), height: 0.5, temperature: 0.5, moisture: 0.5, fertility: 0.5,
    variant: 0.5, structure: null, resources: [], entities: [], population: 0,
  }) as unknown as Tile));

const painted = (size: number, typeAt: (x: number, y: number) => BiomeType) => {
  const tiles = makeTiles(size, typeAt);
  const painter = new MapPainter(size);
  for (const column of tiles) {
    for (const tile of column) {
      painter.setTile(tile, tile.type.includes('ocean') || tile.type === 'river' ? BLUE : GREEN);
    }
  }
  painter.recomputeDepth();
  painter.paintAll();
  return { painter, tiles };
};

const isLandPixel = (painter: MapPainter, X: number, Y: number) =>
  painter.data[(Y * painter.width + X) * 4 + 3] === SURFACE.land;

describe('the painted map', () => {
  it('turns a lone land tile into a round islet, not a square', () => {
    const { painter } = painted(9, (x, y) => (x === 4 && y === 4 ? 'grassland' : 'deep_ocean'));
    // The corners of the tile's own 8x8 block must be sea: a square would
    // fill them.
    const left = 4 * PX;
    const top = 4 * PX;
    const corners = [[left, top], [left + PX - 1, top], [left, top + PX - 1], [left + PX - 1, top + PX - 1]];
    for (const [X, Y] of corners) expect(isLandPixel(painter, X, Y)).toBe(false);
    // ...and its middle must be land.
    expect(isLandPixel(painter, left + 4, top + 4)).toBe(true);
  });

  it('keeps a diagonal river joined up instead of a string of beads', () => {
    const { painter } = painted(12, (x, y) => (x === y ? 'river' : 'grassland'));
    // Walk the diagonal in pixels; every step through the shared corners
    // between consecutive river tiles must be water.
    for (let t = 2; t < 9; t++) {
      const corner = (t + 1) * PX; // the pixel where tile t meets tile t+1
      expect(isLandPixel(painter, corner, corner), `break at ${t}`).toBe(false);
    }
  });

  it('shades the sea in bands that deepen away from the coast', () => {
    const { painter } = painted(24, (x) => (x < 4 ? 'grassland' : 'deep_ocean'));
    const brightness = (X: number) => {
      const o = (12 * PX * painter.width + X) * 4;
      return painter.data[o] + painter.data[o + 1] + painter.data[o + 2];
    };
    // Near the coast the water is lighter than far out.
    expect(brightness(6 * PX)).toBeGreaterThan(brightness(20 * PX));
  });

  it('paints a patch exactly as a full repaint would', () => {
    // A tile repaint only touches its neighbourhood. If that ever disagrees
    // with painting the whole map, edits would leave visible seams.
    const typeAt = (x: number, y: number): BiomeType =>
      (x + y * 3) % 7 === 0 ? 'deep_ocean' : (x * y) % 5 === 0 ? 'deciduous_forest' : 'grassland';
    const { painter, tiles } = painted(16, typeAt);
    for (const column of tiles) {
      for (const tile of column) {
        if (tile.type === 'deciduous_forest') tile.structure = { type: 'mature_tree', health: 100 };
        painter.setTile(tile, GREEN);
      }
    }
    painter.paintAll();
    const full = painter.data.slice();
    painter.data.fill(0);
    for (let y = 0; y < 16; y += 3) {
      for (let x = 0; x < 16; x += 3) painter.paintRegion(x - 1, y - 1, x + 1, y + 1);
    }
    expect(Buffer.from(painter.data).equals(Buffer.from(full))).toBe(true);
  });

  it('paints a whole 128 map fast enough to rebuild on a season change', () => {
    const size = 128;
    const tiles = makeTiles(size, (x, y) => ((x * 7 + y * 13) % 11 < 3 ? 'ocean' : 'grassland'));
    const painter = new MapPainter(size);
    for (const column of tiles) for (const tile of column) painter.setTile(tile, GREEN);
    painter.recomputeDepth();
    const started = performance.now();
    painter.paintAll();
    // Generous for a loaded CI box; locally it is a few hundred ms at most.
    expect(performance.now() - started).toBeLessThan(4000);
  });
});
