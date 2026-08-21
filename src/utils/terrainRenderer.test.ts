import { describe, expect, it } from 'vitest';
import { TerrainRenderer } from './terrainRenderer';
import { generateWorld } from './worldGenerator';
import { computeScaledHeight, isWaterBiome } from '../types/world';

const buildWorld = (mapSize = 32) => generateWorld({ seed: 4242, mapSize }).tilesData;

describe('TerrainRenderer instance mapping', () => {
  it('round-trips every tile between coordinates and instance ids', () => {
    const tiles = buildWorld(24);
    const renderer = new TerrainRenderer(tiles, 'day', 'summer');

    for (let x = 0; x < tiles.length; x++) {
      for (let y = 0; y < tiles.length; y++) {
        const id = renderer.instanceIdFor(x, y);
        expect(renderer.tileCoordsFromInstanceId(id)).toEqual({ x, y });
        // The renderer must also have stamped the id onto the tile itself,
        // which is what the click handler relies on.
        expect(tiles[x][y].instanceId).toBe(id);
      }
    }
    renderer.dispose();
  });

  it('keeps terrain to three draw calls regardless of map size', () => {
    const tiles = buildWorld(48);
    const renderer = new TerrainRenderer(tiles, 'day', 'summer');
    // terrain boxes + territory fill + territory border + decoration cloud
    expect(renderer.group.children.length).toBeLessThanOrEqual(4);
    renderer.dispose();
  });

  it('reflects a terraformed tile in the instance matrix', () => {
    const tiles = buildWorld(16);
    const renderer = new TerrainRenderer(tiles, 'day', 'summer');
    const tile = tiles[8][8];

    tile.height = 0.9;
    tile.type = 'mountains';
    renderer.syncTile(tile, 'day', 'summer');

    expect(tile.scaledHeight).toBeCloseTo(computeScaledHeight(0.9, 'mountains'), 5);
    renderer.dispose();
  });
});

describe('visual height profile', () => {
  it('keeps the map flat — nothing rises above half a tile of relief', () => {
    const tiles = buildWorld(32);
    let tallest = 0;
    for (const column of tiles) {
      for (const tile of column) {
        tallest = Math.max(tallest, tile.scaledHeight);
      }
    }
    // TILE_SIZE is 0.5, so this keeps peaks under ~1.5 tiles tall.
    expect(tallest).toBeLessThan(0.8);
  });

  it('sinks water below the land it borders', () => {
    const water = computeScaledHeight(0.2, 'ocean');
    const land = computeScaledHeight(0.4, 'grassland');
    expect(water).toBeLessThan(land);
    expect(isWaterBiome('ocean')).toBe(true);
    expect(isWaterBiome('grassland')).toBe(false);
  });
});
