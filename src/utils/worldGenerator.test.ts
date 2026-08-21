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

  it('applies the tile variant as a small shade shift only', () => {
    const dark = getBiomeColor('grassland', 'day', 'summer', 0);
    const light = getBiomeColor('grassland', 'day', 'summer', 1);
    expect(light.g).toBeGreaterThan(dark.g);
    expect(light.g - dark.g).toBeLessThan(0.12);
  });
});
