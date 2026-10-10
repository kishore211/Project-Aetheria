import { describe, expect, it } from 'vitest';
import { bannerFor, bannerPixels, CHARGES } from './heraldry';

describe('kingdom banners', () => {
  it('is the same flag every time for the same kingdom', () => {
    expect(bannerFor('kingdom-7', '#c8483f', 'orc')).toEqual(bannerFor('kingdom-7', '#c8483f', 'orc'));
  });

  it('gives a dozen kingdoms a spread of divisions and charges', () => {
    const banners = Array.from({ length: 12 }, (_, i) => bannerFor(`k-${i}-${i * 37}`, '#4f7fd6', 'human'));
    expect(new Set(banners.map(b => b.division)).size).toBeGreaterThan(3);
    expect(new Set(banners.map(b => b.charge)).size).toBeGreaterThan(2);
  });

  it('picks charges that suit the people', () => {
    for (let i = 0; i < 30; i++) {
      expect(['hammer', 'axe', 'tower', 'crown']).toContain(bannerFor(`d${i}`, '#888888', 'dwarf').charge);
    }
  });

  it('draws a 12 by 16 flag with the charge in the race metal', () => {
    const banner = bannerFor('x', '#2f7d4f', 'elf');
    const pixels = bannerPixels(banner);
    expect(pixels).toHaveLength(16);
    expect(pixels.every(row => row.length === 12)).toBe(true);
    const metal = pixels.flat().filter(c => c === banner.metal).length;
    const inked = CHARGES[banner.charge].join('').split('').filter(c => c === '#').length;
    // The charge plus the two finials on the crossbar.
    expect(metal).toBe(inked + 2);
    // The swallowtail is cut out of the bottom row.
    expect(pixels[15].some(c => c === null)).toBe(true);
  });
});
