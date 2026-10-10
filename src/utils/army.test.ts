import { describe, expect, it } from 'vitest';
import { conquestOutcome, formationSlots, RANK_WIDTH } from './army';

describe('marching formation', () => {
  it('puts every soldier behind the captain, in ranks across the heading', () => {
    // Marching east: everyone is west of the captain.
    const slots = formationSlots(10, 1, 0);
    expect(slots).toHaveLength(10);
    for (const slot of slots) expect(slot.x).toBeLessThan(0);
    // The first rank shares one depth, and spreads across the line of march.
    const first = slots.slice(0, RANK_WIDTH);
    expect(new Set(first.map(s => s.x.toFixed(3))).size).toBe(1);
    expect(new Set(first.map(s => s.y.toFixed(3))).size).toBe(RANK_WIDTH);
    // A later rank is further back.
    expect(slots[RANK_WIDTH].x).toBeLessThan(slots[0].x);
  });

  it('centres a short last rank on the line of march', () => {
    const slots = formationSlots(5, 0, 1);
    const last = slots[4];
    expect(Math.abs(last.x)).toBeLessThan(1e-9);
  });

  it('never stacks two soldiers on one spot', () => {
    const slots = formationSlots(17, 0.3, -0.8);
    const keys = new Set(slots.map(s => `${s.x.toFixed(2)},${s.y.toFixed(2)}`));
    expect(keys.size).toBe(17);
  });

  it('copes with no heading at all', () => {
    expect(formationSlots(3, 0, 0).every(s => Number.isFinite(s.x) && Number.isFinite(s.y))).toBe(true);
  });
});

describe('the fate of a fallen town', () => {
  it('is taken by most, burned by orcs, and burned when empty', () => {
    expect(conquestOutcome('human', 6)).toBe('capture');
    expect(conquestOutcome('elf', 1)).toBe('capture');
    expect(conquestOutcome('orc', 6)).toBe('raze');
    expect(conquestOutcome('dwarf', 0)).toBe('raze');
  });
});
