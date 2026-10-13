import { describe, expect, it } from 'vitest';
import { FOOD_CHAIN } from './entitySystemMinimal';
import {
  SIZE_TIERS, TIER_LABELS, baseSizeOf, canPreyOn, describeSize, rollSize, sizeOf, sizeTier,
} from './size';
import type { Entity, EntityType } from '../types/world';

const at = (type: EntityType, size?: number) =>
  ({ type, size }) as Pick<Entity, 'type' | 'size'>;

describe('size as a number', () => {
  it('bands the bestiary the way the sizes say', () => {
    expect(sizeTier(baseSizeOf('rabbit'))).toBeLessThan(sizeTier(baseSizeOf('wolf')));
    expect(sizeTier(baseSizeOf('wolf'))).toBeLessThan(sizeTier(baseSizeOf('bear')));
    expect(sizeTier(baseSizeOf('bear'))).toBeLessThan(sizeTier(baseSizeOf('dragon')));
    // Every band is reachable, or one of the labels is decoration.
    const reached = new Set((Object.keys(FOOD_CHAIN) as EntityType[])
      .map(type => sizeTier(baseSizeOf(type))));
    expect(reached.size).toBe(TIER_LABELS.length);
  });

  it('rises with the boundaries and never runs off the labels', () => {
    expect(sizeTier(0)).toBe(0);
    expect(sizeTier(999)).toBe(SIZE_TIERS.length);
    expect(describeSize(999)).toBe(TIER_LABELS[TIER_LABELS.length - 1]);
    for (const boundary of SIZE_TIERS) {
      // The boundary itself belongs to the band above, and a hair under it
      // does not — an off-by-one here silently reassigns a whole species.
      expect(sizeTier(boundary)).toBeGreaterThan(sizeTier(boundary - 0.0001));
    }
  });

  it('makes a strong creature bigger and a swift one smaller', () => {
    const fixed = () => 0.5;
    expect(rollSize('wolf', ['strong'], fixed)).toBeGreaterThan(rollSize('wolf', [], fixed));
    expect(rollSize('wolf', ['swift'], fixed)).toBeLessThan(rollSize('wolf', [], fixed));
  });

  it('keeps a trait inside its own band rather than promoting it out', () => {
    // If `strong` could lift a creature a whole band it would quietly read as
    // "can now eat bears", which is a trait doing something nobody asked it to.
    const fixed = () => 0.5;
    for (const type of ['wolf', 'deer', 'human', 'rabbit'] as EntityType[]) {
      const plain = sizeTier(rollSize(type, [], fixed));
      const strong = sizeTier(rollSize(type, ['strong'], fixed));
      expect(strong - plain).toBeLessThanOrEqual(1);
    }
  });

  it('varies a crowd without producing giants', () => {
    const sizes = Array.from({ length: 400 }, () => rollSize('wolf', []));
    const base = baseSizeOf('wolf');
    for (const size of sizes) {
      expect(size).toBeGreaterThan(base * 0.8);
      expect(size).toBeLessThan(base * 1.2);
    }
    // ...and it is actually varying, rather than returning the base every time.
    expect(new Set(sizes).size).toBeGreaterThan(300);
  });

  it('falls back to the kind for anything born before sizes existed', () => {
    expect(sizeOf(at('bear'))).toBe(baseSizeOf('bear'));
    expect(sizeOf(at('bear', 0.5))).toBe(0.5);
  });
});

describe('who can eat whom', () => {
  it('lets every pair in the food chain actually happen at base size', () => {
    // The rule has to be checked against the bestiary rather than reasoned
    // about: the obvious "strictly bigger" rule passes every intuition and
    // then forbids wolves from hunting deer.
    for (const [predator, prey] of Object.entries(FOOD_CHAIN) as [EntityType, EntityType[]][]) {
      for (const quarry of prey) {
        expect(
          canPreyOn(at(predator, baseSizeOf(predator)), at(quarry, baseSizeOf(quarry))),
          `${predator} should be able to hunt ${quarry}`,
        ).toBe(true);
      }
    }
  });

  it('puts prey two bands up out of reach', () => {
    expect(canPreyOn(at('rabbit', 0.08), at('bear', 0.2))).toBe(false);
    expect(canPreyOn(at('wolf', 0.12), at('dragon', 0.35))).toBe(false);
  });

  it('changes the answer for two animals of the same kind', () => {
    // The whole reason individual size exists. A runt wolf is left with sheep
    // and rabbits; a normal one can take a deer.
    const deer = at('deer', baseSizeOf('deer'));
    expect(canPreyOn(at('wolf', 0.12), deer)).toBe(true);
    expect(canPreyOn(at('wolf', 0.09), deer)).toBe(false);
    // ...and an oversized deer puts itself beyond an ordinary wolf.
    expect(canPreyOn(at('wolf', 0.12), at('deer', 0.2))).toBe(false);
  });
});

describe('childhood', () => {
  it('draws a newborn small and grows it to full size', async () => {
    const { growthOf, isChild } = await import('./size');
    const baby = { age: 0, maxAge: 100 };
    const teen = { age: 9, maxAge: 100 };
    const adult = { age: 30, maxAge: 100 };
    expect(isChild(baby)).toBe(true);
    expect(isChild(adult)).toBe(false);
    expect(growthOf(baby)).toBeCloseTo(0.55);
    expect(growthOf(teen)).toBeGreaterThan(growthOf(baby));
    expect(growthOf(adult)).toBe(1);
  });
});
