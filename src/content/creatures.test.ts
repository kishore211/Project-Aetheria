// The registry is content, so these tests check that it is *coherent*, not
// that it holds any particular numbers: change a creature on purpose and they
// still pass; break the shape of the world by accident and they do not.
// (The refactor that created the registry was proven exact against the old
// tables and three seeded 20-minute worlds before this file replaced that
// snapshot.)
import { describe, expect, it } from 'vitest';
import { CREATURES } from './creatures';
import { FOOD_CHAIN, MONSTERS, STRUCTURES, profileOf } from '../utils/entitySystemMinimal';
import { baseSizeOf } from '../utils/size';
import type { EntityType } from '../types/world';

const kinds = Object.keys(CREATURES) as EntityType[];

describe('creature registry', () => {
  it('gives every kind sane stats, a size and a population cap', () => {
    for (const kind of kinds) {
      const { stats, size, maxPopulation } = CREATURES[kind];
      expect(stats.maxAge, kind).toBeGreaterThan(0);
      expect(stats.maxHealth, kind).toBeGreaterThan(0);
      expect(size, kind).toBeGreaterThan(0);
      expect(maxPopulation, kind).toBeGreaterThan(0);
    }
  });

  it('only lets a creature eat creatures that exist, and never itself', () => {
    for (const kind of kinds) {
      for (const prey of CREATURES[kind].eats) {
        expect(kinds, `${kind} eats ${prey}`).toContain(prey);
        expect(prey, kind).not.toBe(kind);
      }
    }
  });

  it('keeps herds and ranged attacks positive where they exist', () => {
    for (const kind of kinds) {
      const { herdSize, ranged } = CREATURES[kind];
      if (herdSize !== undefined) expect(herdSize, kind).toBeGreaterThanOrEqual(1);
      if (ranged) expect(ranged.reach, kind).toBeGreaterThan(0);
    }
  });

  it('is what the simulation actually reads', () => {
    for (const kind of kinds) {
      expect(FOOD_CHAIN[kind]).toBe(CREATURES[kind].eats);
      expect(profileOf(kind).maxAge).toBe(CREATURES[kind].stats.maxAge);
      expect(baseSizeOf(kind)).toBe(CREATURES[kind].size);
      expect(MONSTERS.has(kind)).toBe(CREATURES[kind].monster);
      expect(STRUCTURES.has(kind)).toBe(CREATURES[kind].structure);
    }
  });
});
