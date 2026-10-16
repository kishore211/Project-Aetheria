import { describe, expect, it } from 'vitest';
import { civilStats } from './politics';
import type { Entity } from '../types/world';

/** Rulers with identical attributes, told apart only by their ids. */
const ruler = (id: string): Entity => ({
  id, attributes: { intelligence: 10, strength: 10, resilience: 10 },
} as unknown as Entity);

describe('civil stats from short counter ids', () => {
  it('spread evenly, so neighbouring ids are not near-identical rulers', () => {
    const stats = Array.from({ length: 1000 }, (_, i) => civilStats(ruler(`e-${i + 1}`)));
    for (const key of ['diplomacy', 'warfare', 'stewardship', 'intrigue'] as const) {
      const values = stats.map(s => s[key]);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      // Attributes put the centre at 2 + 4 + 2.5 (or the stat's own mix); the
      // id share should average out near its midpoint, not pile at one end.
      expect(new Set(values).size, key).toBeGreaterThanOrEqual(4);
      const neighbours = stats.slice(1).filter((s, i) => s[key] === stats[i][key]).length;
      expect(neighbours / values.length, `${key} repeats between neighbours`).toBeLessThan(0.5);
      expect(mean, key).toBeGreaterThan(5);
      expect(mean, key).toBeLessThan(10);
    }
  });
});
