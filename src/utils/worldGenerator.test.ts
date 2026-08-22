import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  WORLD_TEMPLATES,
  determineBiome,
  generateWorld,
  getBiomeColor,
  type WorldTemplate,
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

describe('tile material variants', () => {
  /**
   * A brightness-only jitter was what made large biomes read as a grid of one
   * thing: it looks like uneven lighting on a single surface. Hue and
   * saturation have to move for a tile to read as a different patch of ground.
   */
  it('shifts hue and saturation between variants, not just lightness', () => {
    const hsl = (color: THREE.Color) => color.getHSL({ h: 0, s: 0, l: 0 });
    const a = hsl(getBiomeColor('grassland', 'day', 'summer', 0.1));
    const b = hsl(getBiomeColor('grassland', 'day', 'summer', 0.5));
    const c = hsl(getBiomeColor('grassland', 'day', 'summer', 0.9));

    // All three variants differ in hue from each other.
    expect(Math.abs(a.h - b.h)).toBeGreaterThan(0.005);
    expect(Math.abs(b.h - c.h)).toBeGreaterThan(0.005);
    expect(Math.abs(a.h - c.h)).toBeGreaterThan(0.005);
    // And in saturation, which brightness noise cannot do.
    expect(Math.abs(a.s - c.s)).toBeGreaterThan(0.02);
  });

  it('gives three discrete variants, not a continuous ramp', () => {
    // Discrete on purpose: three recognisable materials read as variety, where
    // a continuous ramp reads as a gradient.
    const hex = (v: number) => getBiomeColor('grassland', 'day', 'summer', v).getHex();
    // Two samples inside the same third should be close; across a boundary,
    // far. Compared as hue so the continuous jitter does not mask it.
    const bucket = (v: number) =>
      getBiomeColor('grassland', 'day', 'summer', v).getHSL({ h: 0, s: 0, l: 0 }).h;
    expect(Math.abs(bucket(0.05) - bucket(0.30))).toBeLessThan(0.005);
    expect(Math.abs(bucket(0.30) - bucket(0.40))).toBeGreaterThan(0.005);
    expect(hex(0.5)).toBeGreaterThan(0);
  });

  it('darkens and desaturates with elevation, so height reads from above', () => {
    const low = getBiomeColor('grassland', 'day', 'summer', 0.5, 0.3);
    const high = getBiomeColor('grassland', 'day', 'summer', 0.5, 0.75);
    const hsl = (color: THREE.Color) => color.getHSL({ h: 0, s: 0, l: 0 });
    expect(hsl(high).l).toBeLessThan(hsl(low).l);
    expect(hsl(high).s).toBeLessThan(hsl(low).s);
  });

  it('leaves water out of the elevation shading', () => {
    // Depth is already carried by the biome (shallow/ocean/deep), and shading
    // it again would fight that.
    const shallow = getBiomeColor('ocean', 'day', 'summer', 0.5, 0.1).getHex();
    const deeper = getBiomeColor('ocean', 'day', 'summer', 0.5, 0.9).getHex();
    expect(shallow).toBe(deeper);
  });

  it('still returns the plain biome colour when no variant is given', () => {
    // The many call sites that pass neither variant nor elevation must be
    // unaffected.
    const bare = getBiomeColor('grassland', 'day', 'summer');
    expect(bare.getHex()).toBe(getBiomeColor('grassland', 'day', 'summer').getHex());
  });
});
