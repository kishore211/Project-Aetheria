import { describe, expect, it } from 'vitest';
import { buildingSprite, getBuildingAtlas, roofSprite } from './pixelAtlas';

describe('building art', () => {
  it('has the hall tiers, stockpile and training dummy, styled per race', () => {
    const atlas = getBuildingAtlas();
    for (const name of ['hall2', 'hall3', 'stockpile', 'dummy']) expect(atlas.slots[name]).toBeDefined();
    expect(atlas.slots[buildingSprite('hall3', 'dwarf')]).toBeDefined();
  });

  it('gives roofed buildings a kingdom-coloured roof and leaves the rest bare', () => {
    expect(roofSprite('house')).toBe('house^roof');
    expect(roofSprite('hall3')).toBe('hall3^roof');
    expect(roofSprite('stockpile')).toBeNull();
    expect(getBuildingAtlas().slots['hall2^roof']).toBeDefined();
  });
});
