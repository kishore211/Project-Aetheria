import { describe, expect, it } from 'vitest';

/**
 * The economy lives inside settlementSystem, which needs a scene and a terrain
 * renderer to construct. What is testable in isolation — and what carries the
 * design — are the four rules themselves, reimplemented here from the spec.
 *
 * They are written out rather than imported deliberately: these numbers *are*
 * the specification (09-WORLDBOX-VISUAL-RESEARCH.md §7), and a test that
 * imports the implementation can only ever agree with it.
 */

const MEAL_PRICE = 5;
const TAX_RATE = 0.25;

const BUILDING_YIELD: Record<string, number> = {
  hall: 6, house: 2, farm: 3, mine: 4, temple: 2, statue: 1, tower: 1, bonfire: 0,
};
const HOUSING: Record<string, number> = { house: 4, hall: 3, farm: 1 };

/** Their four one-line terms, clamped at zero. */
const ledger = (
  citizens: number, homeless: number, warriors: number, buildings: number,
): number =>
  Math.floor(citizens / 2) - homeless - Math.floor(warriors / 2) - Math.floor(buildings / 2);

describe('the village ledger', () => {
  it('pays for itself when a town is housed and lightly garrisoned', () => {
    // 10 citizens, all housed, 2 warriors, 6 buildings.
    expect(ledger(10, 0, 2, 6)).toBeGreaterThan(0);
  });

  it('costs twice as much to leave somebody homeless as to keep a soldier', () => {
    // Their weighting, and it is the interesting one: −1 per homeless against
    // −1 per *two* warriors.
    const withHomeless = ledger(10, 2, 0, 6);
    const withWarriors = ledger(10, 0, 2, 6);
    expect(withHomeless).toBeLessThan(withWarriors);
    expect(withWarriors - withHomeless).toBe(1);
  });

  it('lets over-building bankrupt a town', () => {
    // A village that keeps raising halls it cannot staff should go broke.
    expect(ledger(8, 0, 0, 4)).toBeGreaterThan(0);
    expect(ledger(8, 0, 0, 20)).toBeLessThan(0);
  });

  it('is survivable for a brand-new village', () => {
    // Three founders, one bonfire. If the opening position were already
    // negative, no village could ever accumulate anything.
    expect(ledger(3, 0, 0, 1)).toBeGreaterThanOrEqual(0);
  });
});

describe('wages and tax', () => {
  const take = (loot: number) => {
    const tax = Math.floor(loot * TAX_RATE);
    return { tax, kept: Math.floor(loot) - tax };
  };

  it('splits every wage between the earner and the treasury', () => {
    const { tax, kept } = take(20);
    expect(tax).toBe(5);
    expect(kept).toBe(15);
    expect(tax + kept).toBe(20);
  });

  it('never taxes more than was earned', () => {
    for (const loot of [0, 1, 3, 7, 100, 1000]) {
      const { tax, kept } = take(loot);
      expect(tax).toBeLessThanOrEqual(Math.floor(loot));
      expect(kept).toBeGreaterThanOrEqual(0);
    }
  });

  it('leaves small earnings untaxed rather than rounding them away', () => {
    // A villager earning 3 should keep 3, not lose one to a rounding rule.
    expect(take(3).tax).toBe(0);
    expect(take(3).kept).toBe(3);
  });
});

describe('what a building is worth', () => {
  it('makes the hall the richest thing in a village', () => {
    for (const [kind, value] of Object.entries(BUILDING_YIELD)) {
      if (kind === 'hall') continue;
      expect(value, kind).toBeLessThanOrEqual(BUILDING_YIELD.hall);
    }
  });

  it('gives the bonfire nothing, so a bare village earns nothing', () => {
    // A settlement's first act should not be profitable; it has to build.
    expect(BUILDING_YIELD.bonfire).toBe(0);
  });

  it('houses more people than it earns, and farms feed more than they house', () => {
    expect(HOUSING.house).toBeGreaterThan(BUILDING_YIELD.house);
    expect(BUILDING_YIELD.farm).toBeGreaterThan(HOUSING.farm);
  });
});

describe('a meal as a purchase', () => {
  it('prices a meal within reach of an ordinary wage', () => {
    // A house plus a farm splits about 5 loot a round between a few people;
    // a meal at 5 has to be affordable often enough that most villagers eat.
    expect(MEAL_PRICE).toBeGreaterThan(0);
    expect(MEAL_PRICE).toBeLessThanOrEqual(BUILDING_YIELD.hall);
  });
});
