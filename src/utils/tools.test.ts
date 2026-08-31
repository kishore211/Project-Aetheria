import { describe, expect, it } from 'vitest';
import { MATERIAL_TINT, TOOL_SPRITE, materialForTier, toolFor } from './tools';

describe('the tool in hand', () => {
  it('holds nothing for the activities that are not work', () => {
    for (const idle of ['idle', 'travelling', 'sleeping', 'eating', 'talking', 'drinking', undefined]) {
      expect(toolFor(idle)).toBeNull();
    }
  });

  it('tells a woodcutter from a quarryman by the load, not the job', () => {
    expect(toolFor('gathering', { type: 'wood' })).toBe('axe');
    expect(toolFor('gathering', { type: 'stone' })).toBe('pick');
    expect(toolFor('gathering', null)).toBe('axe');
    // Every mineral counts as quarried, not just the one named 'stone' — an
    // ore-carrier swinging an axe is the sort of detail that only reads wrong.
    for (const ore of ['iron', 'gold', 'silver', 'coal', 'crystal', 'gem']) {
      expect(toolFor('hauling', { type: ore })).toBe('pick');
    }
  });

  it('arms everyone who is fighting, hunting or marching to war', () => {
    expect(toolFor('fighting')).toBe('blade');
    expect(toolFor('hunting')).toBe('blade');
    expect(toolFor('marching')).toBe('blade');
    expect(toolFor('building')).toBe('hammer');
  });

  it('climbs the material ladder with the tier and clamps at both ends', () => {
    expect(materialForTier(1)).toBe('wood');
    expect(materialForTier(2)).toBe('stone');
    expect(materialForTier(3)).toBe('iron');
    expect(materialForTier(4)).toBe('gold');
    // A village with no buildings and a village that has somehow exceeded the
    // ladder both have to draw *something*.
    expect(materialForTier(0)).toBe('wood');
    expect(materialForTier(9)).toBe('gold');
  });

  it('gives every shape a sprite and every material a distinguishable colour', () => {
    for (const shape of ['axe', 'pick', 'hammer', 'blade'] as const) {
      expect(TOOL_SPRITE[shape]).toMatch(/^tool_/);
    }
    // The whole point of the ladder is that a glance separates the rungs, so
    // no two materials may sit close together in colour.
    const colours = Object.values(MATERIAL_TINT);
    for (let i = 0; i < colours.length; i += 1) {
      for (let j = i + 1; j < colours.length; j += 1) {
        const gap = Math.abs(colours[i].r - colours[j].r)
          + Math.abs(colours[i].g - colours[j].g)
          + Math.abs(colours[i].b - colours[j].b);
        expect(gap).toBeGreaterThan(0.2);
      }
    }
  });
});
