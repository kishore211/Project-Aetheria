// The registry is content, so these tests check that it is *coherent*, not
// that it holds any particular numbers: change a biome on purpose and they
// still pass; break the shape of the world by accident and they do not.
import { describe, expect, it } from 'vitest';
import { BIOMES, PaintMaterial } from './biomes';
import { CREATURES } from './creatures';
import { ORE_TYPES } from '../utils/oreVeins';
import { isWaterBiome, type BiomeType, type EntityType } from '../types/world';

const biomes = Object.keys(BIOMES) as BiomeType[];
const creatureKinds = Object.keys(CREATURES) as EntityType[];

describe('biome registry', () => {
  it('gives every biome a paint material the painter knows', () => {
    for (const type of biomes) {
      const paint = BIOMES[type].paint;
      expect(PaintMaterial[paint], type).toBeTypeOf('string');
    }
  });

  it('only lists natives that are real creature kinds, and never an empty herd list', () => {
    for (const type of biomes) {
      const natives = BIOMES[type].natives;
      if (natives === undefined) continue;
      expect(natives.length, type).toBeGreaterThan(0);
      for (const kind of natives) {
        expect(creatureKinds, `${type} natives ${kind}`).toContain(kind);
      }
    }
  });

  it('gives every ore table positive weights over real ore types', () => {
    for (const type of biomes) {
      const ore = BIOMES[type].ore;
      if (ore === undefined) continue;
      expect(ore.length, type).toBeGreaterThan(0);
      for (const [kind, weight] of ore) {
        expect(ORE_TYPES, `${type} ore ${kind}`).toContain(kind);
        expect(Number.isFinite(weight) && weight > 0, `${type} ${kind} weight`).toBe(true);
      }
    }
  });

  it('keeps every terrain row sane: speed in (0, 1], hazard in [0, 1), damage never negative', () => {
    for (const type of biomes) {
      const step = BIOMES[type].terrain;
      if (step === undefined) continue;
      expect(step.speed, type).toBeGreaterThan(0);
      expect(step.speed, type).toBeLessThanOrEqual(1);
      expect(step.hazard, type).toBeGreaterThanOrEqual(0);
      expect(step.hazard, type).toBeLessThan(1);
      if (step.damage !== undefined) expect(step.damage, type).toBeGreaterThanOrEqual(0);
      expect(step.note.length, type).toBeGreaterThan(0);
    }
  });

  it('keeps shallow water on water biomes', () => {
    for (const type of biomes) {
      if (BIOMES[type].shallowWater) expect(isWaterBiome(type), type).toBe(true);
    }
  });

  it('keeps the subsets nested where the simulation relies on it', () => {
    for (const type of biomes) {
      const def = BIOMES[type];
      // Frozen ground is always among the ground a cold creature will not freeze.
      if (def.frozen) expect(def.frostbound, type).toBe(true);
      // Only forests can spread.
      if (def.spreadsForest) expect(def.forest, type).toBe(true);
    }
  });
});
