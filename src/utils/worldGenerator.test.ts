import { describe, expect, it } from 'vitest';
import { determineBiome, getBiomeColor } from './worldGenerator';

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
