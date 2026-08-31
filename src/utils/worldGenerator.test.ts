import * as THREE from 'three';
import { computeScaledHeight, type Tile } from '../types/world';
import { describe, expect, it } from 'vitest';
import {
  WORLD_TEMPLATES,
  determineBiome,
  generateWorld,
  getBiomeColor,
  type WorldTemplate,
  shapeCoastlines,
} from './worldGenerator';
import { isWaterBiome, type BiomeType } from '../types/world';

const colorChannels = (biome: Parameters<typeof getBiomeColor>[0], time: Parameters<typeof getBiomeColor>[1]) => {
  const color = getBiomeColor(biome, time, 'summer');
  return color.r + color.g + color.b;
};

describe('determineBiome', () => {
  it.each([
    [0.1, 0.5, 0.5, 'deep_ocean'],
    [0.2, 0.5, 0.5, 'ocean'],
    [0.26, 0.5, 0.8, 'beach'],
    [0.9, 0.5, 0.1, 'snow'],
    [0.9, 0.5, 0.8, 'volcanic'],
    [0.5, 0.1, 0.8, 'desert'],
    [0.5, 0.8, 0.8, 'rainforest'],
    [0.5, 0.7, 0.5, 'deciduous_forest'],
  ] as const)(
    'maps height %s, moisture %s, and temperature %s to %s',
    (height, moisture, temperature, expectedBiome) => {
      expect(determineBiome(height, moisture, temperature)).toBe(expectedBiome);
    },
  );
});

describe('getBiomeColor', () => {
  it('keeps daytime brighter than nighttime for the same biome', () => {
    expect(colorChannels('grassland', 'day')).toBeGreaterThan(
      colorChannels('grassland', 'night'),
    );
  });

  it('returns independent color objects', () => {
    const first = getBiomeColor('grassland');
    const second = getBiomeColor('grassland');

    first.set(0x000000);

    expect(second.getHex()).not.toBe(first.getHex());
  });
});

const fractionOf = (mapSize: number, template: WorldTemplate, predicate: (type: BiomeType) => boolean) => {
  const { tilesData } = generateWorld({ seed: 1234, mapSize, template });
  let matches = 0;
  for (const column of tilesData) {
    for (const tile of column) if (predicate(tile.type)) matches++;
  }
  return matches / (mapSize * mapSize);
};

describe('generateWorld', () => {
  it('is deterministic for a given seed', () => {
    const first = generateWorld({ seed: 99, mapSize: 24 }).tilesData;
    const second = generateWorld({ seed: 99, mapSize: 24 }).tilesData;

    for (let x = 0; x < 24; x++) {
      for (let y = 0; y < 24; y++) {
        expect(second[x][y].height).toBe(first[x][y].height);
        expect(second[x][y].type).toBe(first[x][y].type);
        expect(second[x][y].variant).toBe(first[x][y].variant);
      }
    }
  });

  it('produces different worlds for different seeds', () => {
    const a = generateWorld({ seed: 1, mapSize: 24 }).tilesData;
    const b = generateWorld({ seed: 2, mapSize: 24 }).tilesData;
    let differences = 0;
    for (let x = 0; x < 24; x++) {
      for (let y = 0; y < 24; y++) if (a[x][y].type !== b[x][y].type) differences++;
    }
    expect(differences).toBeGreaterThan(50);
  });

  it('always leaves both land and sea', () => {
    for (const template of Object.keys(WORLD_TEMPLATES) as WorldTemplate[]) {
      const water = fractionOf(48, template, isWaterBiome);
      expect(water, template).toBeGreaterThan(0.05);
      expect(water, template).toBeLessThan(0.95);
    }
  });

  it('makes archipelagos wetter than pangaea', () => {
    const archipelago = fractionOf(64, 'archipelago', isWaterBiome);
    const pangaea = fractionOf(64, 'pangaea', isWaterBiome);
    expect(archipelago).toBeGreaterThan(pangaea);
  });

  it('carves fresh water inland', () => {
    const { tilesData } = generateWorld({ seed: 7, mapSize: 96, template: 'highlands' });
    let fresh = 0;
    for (const column of tilesData) {
      for (const tile of column) {
        if (tile.type === 'river' || tile.type === 'lake') fresh++;
      }
    }
    expect(fresh).toBeGreaterThan(0);
  });

  it('marks open ocean unwalkable and rivers crossable', () => {
    const { tilesData } = generateWorld({ seed: 11, mapSize: 64, template: 'highlands' });
    for (const column of tilesData) {
      for (const tile of column) {
        if (tile.type === 'deep_ocean' || tile.type === 'ocean') {
          expect(tile.walkable).toBe(false);
        }
        if (tile.type === 'river' || tile.type === 'lake') {
          expect(tile.walkable).toBe(true);
        }
      }
    }
  });

  it('gives every tile a shade variant so biomes are not flat', () => {
    const { tilesData } = generateWorld({ seed: 5, mapSize: 16 });
    const variants = new Set<number>();
    for (const column of tilesData) {
      for (const tile of column) variants.add(tile.variant ?? -1);
    }
    expect(variants.size).toBeGreaterThan(200);
  });
});

describe('seasonal palette', () => {
  it('pales grassland in winter and warms forest in autumn', () => {
    const summerGrass = getBiomeColor('grassland', 'day', 'summer');
    const winterGrass = getBiomeColor('grassland', 'day', 'winter');
    expect(winterGrass.r + winterGrass.g + winterGrass.b)
      .toBeGreaterThan(summerGrass.r + summerGrass.g + summerGrass.b);

    const summerForest = getBiomeColor('deciduous_forest', 'day', 'summer');
    const autumnForest = getBiomeColor('deciduous_forest', 'day', 'autumn');
    expect(autumnForest.r).toBeGreaterThan(summerForest.r);
  });

  it('keeps every variant within touching distance of the biome colour', () => {
    // Superseded the old assertion that variant was a monotonic brightness
    // ramp (`light.g > dark.g`). Variants are three distinct *materials* now,
    // not three exposures of one — see "tile material variants" below for why.
    // What still has to hold is that no variant wanders far enough to be
    // mistaken for a different biome.
    const base = getBiomeColor('grassland', 'day', 'summer');
    for (const variant of [0, 0.34, 0.67, 1]) {
      const shade = getBiomeColor('grassland', 'day', 'summer', variant);
      const distance = Math.hypot(
        shade.r - base.r, shade.g - base.g, shade.b - base.b,
      );
      expect(distance, `variant ${variant}`).toBeLessThan(0.14);
    }
  });
});

describe('tile colour', () => {
  /**
   * These replace a set of tests that asserted each tile got its own hue and
   * saturation offset. That design was wrong, and the tests were faithfully
   * pinning it: decoding WorldBox's art showed all three grass variants share
   * an identical palette and differ only in which *pixel* gets which shade.
   * A per-tile colour offset is exactly what turns a field into a patchwork of
   * hard-edged squares.
   */
  it('gives every tile of a biome the same colour, whatever its shade roll', () => {
    // The variation belongs inside the tile, not between tiles.
    const shades = [0, 0.2, 0.4, 0.6, 0.8, 1];
    const hexes = new Set(
      shades.map(shade => getBiomeColor('grassland', 'day', 'summer', shade).getHex()),
    );
    expect(hexes.size).toBe(1);
  });

  it('darkens and desaturates with elevation, so height reads from straight above', () => {
    // The one legitimately per-tile term, because height is a smooth field and
    // so produces broad relief rather than a grid — and from a top-down camera
    // there is no other cue that ground is high.
    const low = getBiomeColor('grassland', 'day', 'summer', 0.5, 0.3);
    const high = getBiomeColor('grassland', 'day', 'summer', 0.5, 0.75);
    const hsl = (color: THREE.Color) => color.getHSL({ h: 0, s: 0, l: 0 });
    expect(hsl(high).l).toBeLessThan(hsl(low).l);
    expect(hsl(high).s).toBeLessThan(hsl(low).s);
  });

  it('leaves water out of the elevation shading', () => {
    // Depth is already carried by the biome — shallow, ocean, deep — and
    // shading it again would fight that.
    const shallow = getBiomeColor('ocean', 'day', 'summer', 0.5, 0.1).getHex();
    const deeper = getBiomeColor('ocean', 'day', 'summer', 0.5, 0.9).getHex();
    expect(shallow).toBe(deeper);
  });

  it('keeps elevation shading gentle enough not to read as a different biome', () => {
    const flat = getBiomeColor('grassland', 'day', 'summer', 0.5, 0.28);
    const steep = getBiomeColor('grassland', 'day', 'summer', 0.5, 1);
    const distance = Math.hypot(
      steep.r - flat.r, steep.g - flat.g, steep.b - flat.b,
    );
    expect(distance).toBeLessThan(0.14);
  });
});

describe('coastlines', () => {
  /** A small world with a hill running into a sea, built by hand. */
  const makeCoast = (size = 24): Tile[][] => {
    const tiles: Tile[][] = [];
    for (let x = 0; x < size; x += 1) {
      tiles.push([]);
      for (let y = 0; y < size; y += 1) {
        // A steep ramp: deep water on the left, rising sharply to highland.
        const height = Math.max(0, Math.min(1, x / size * 1.6 - 0.15));
        tiles[x].push({
          x, y,
          height,
          scaledHeight: computeScaledHeight(height, 'grassland'),
          moisture: 0.5,
          temperature: 0.4,
          fertility: 0.5,
          type: determineBiome(height, 0.5, 0.4),
          population: 0,
          resources: [],
          structure: null,
          entities: [],
          isOnFire: false,
          walkable: true,
          variant: 0.5,
          ownerId: null,
          villageId: null,
        });
      }
    }
    return tiles;
  };

  const neighbours = (tiles: Tile[][], x: number, y: number): Tile[] => {
    const size = tiles.length;
    const out: Tile[] = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) out.push(tiles[nx][ny]);
    }
    return out;
  };

  it('never lets deep water touch land or shallows', () => {
    // Their coast is a monotonic ramp: measured 28 deep/shallow contacts
    // against 355 close/shallow. Height-banded water put deep ocean straight
    // against a cliff wherever the gradient was steep.
    const tiles = makeCoast();
    shapeCoastlines(tiles, tiles.length);

    for (let x = 0; x < tiles.length; x += 1) {
      for (let y = 0; y < tiles.length; y += 1) {
        if (tiles[x][y].type !== 'deep_ocean') continue;
        for (const neighbour of neighbours(tiles, x, y)) {
          expect(neighbour.type, `deep ocean touching ${neighbour.type}`)
            .not.toBe('shallow_water');
          expect(isWaterBiome(neighbour.type), 'deep ocean touching land').toBe(true);
        }
      }
    }
  });

  it('puts sand at a gentle waterline', () => {
    const tiles = makeCoast();
    shapeCoastlines(tiles, tiles.length);
    let beaches = 0;
    for (let x = 0; x < tiles.length; x += 1) {
      for (let y = 0; y < tiles.length; y += 1) {
        if (tiles[x][y].type === 'beach') beaches += 1;
      }
    }
    expect(beaches).toBeGreaterThan(0);
  });

  it('leaves a steep coast as rock rather than ringing every island in sand', () => {
    const tiles = makeCoast();
    // Force the whole shore to be high ground.
    for (const column of tiles) for (const tile of column) {
      if (!isWaterBiome(tile.type)) tile.height = 0.8;
    }
    shapeCoastlines(tiles, tiles.length);
    const beaches = tiles.flat().filter(tile => tile.type === 'beach').length;
    expect(beaches).toBe(0);
  });

  it('recomputes everything that depends on tile type', () => {
    // The pass rewrites types, so scaledHeight and walkable have to follow or
    // a tile that became sea would still be walkable at its old height.
    const tiles = makeCoast();
    shapeCoastlines(tiles, tiles.length);
    for (const column of tiles) {
      for (const tile of column) {
        expect(tile.scaledHeight).toBeCloseTo(computeScaledHeight(tile.height, tile.type));
        if (tile.type === 'deep_ocean' || tile.type === 'ocean') {
          expect(tile.walkable).toBe(false);
        }
        if (isWaterBiome(tile.type)) expect(tile.structure).toBeNull();
      }
    }
  });

  it('is idempotent — running it twice changes nothing', () => {
    const tiles = makeCoast();
    shapeCoastlines(tiles, tiles.length);
    const before = tiles.flat().map(tile => tile.type).join(',');
    shapeCoastlines(tiles, tiles.length);
    expect(tiles.flat().map(tile => tile.type).join(',')).toBe(before);
  });

  it('leaves an all-land world alone', () => {
    const tiles = makeCoast();
    for (const column of tiles) for (const tile of column) {
      tile.height = 0.6;
      tile.type = 'grassland';
    }
    shapeCoastlines(tiles, tiles.length);
    expect(tiles.flat().every(tile => tile.type === 'grassland')).toBe(true);
  });
});
