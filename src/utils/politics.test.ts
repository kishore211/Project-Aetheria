import { describe, expect, it } from 'vitest';
import type { Entity } from '../types/world';
import {
  LOYALTY_MAX,
  LOYALTY_MIN,
  REBELLION_THRESHOLD,
  civilStats,
  governableVillages,
  leadership,
  loyaltyFor,
  type LoyaltyInput,
} from './politics';

const makeEntity = (id: string, over: Partial<Entity> = {}): Entity => ({
  id,
  type: 'human',
  name: 'Test',
  age: 30,
  maxAge: 70,
  health: 100,
  maxHealth: 100,
  position: { x: 0, y: 0 },
  attributes: { strength: 5, intelligence: 5, speed: 5, resilience: 5 },
  needs: { hunger: 1, thirst: 1, rest: 1, social: 1 },
  inventory: [],
  status: [],
  ...over,
});

/** A settled, unremarkable province: every factor near neutral. */
const baseline = (over: Partial<LoyaltyInput> = {}): LoyaltyInput => ({
  isCapital: false,
  king: null,
  leader: null,
  leaderTraits: [],
  population: 10,
  capitalPopulation: 10,
  territory: 100,
  capitalTerritory: 100,
  distanceToCapital: 0,
  bordersCapital: false,
  villageAge: 1000,
  kingdomAge: 1000,
  villagesOverLimit: 0,
  losingWar: false,
  sameSpeciesAsKing: true,
  averageMood: 0,
  // Null by default: an unremarkable province shares its realm's identity, and
  // the formula skips the factor rather than reading it as a mismatch.
  sameCulture: null,
  sameLanguage: null,
  sameReligion: null,
  xenophobic: false,
  ...over,
});

describe('civil stats', () => {
  it('are stable for a given creature', () => {
    // Derived from the id and attributes, so they never need saving and never
    // change between one inspection and the next.
    const entity = makeEntity('abc');
    expect(civilStats(entity)).toEqual(civilStats(entity));
  });

  it('differ between two equally able creatures', () => {
    const a = civilStats(makeEntity('one'));
    const b = civilStats(makeEntity('two'));
    expect(a).not.toEqual(b);
  });

  it('stay inside the range for extreme attributes', () => {
    const brilliant = makeEntity('x', {
      attributes: { strength: 100, intelligence: 100, speed: 100, resilience: 100 },
    });
    const feeble = makeEntity('y', {
      attributes: { strength: 0, intelligence: 0, speed: 0, resilience: 0 },
    });
    for (const stats of [civilStats(brilliant), civilStats(feeble)]) {
      for (const value of Object.values(stats)) {
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(10);
      }
    }
  });

  it('lets intelligence show up in diplomacy and strength in warfare', () => {
    // Averaged over many ids so the per-creature hash cannot swamp the signal.
    let cleverDiplomacy = 0;
    let dullDiplomacy = 0;
    let strongWarfare = 0;
    let weakWarfare = 0;
    for (let index = 0; index < 60; index += 1) {
      const clever = makeEntity(`c${index}`, {
        attributes: { strength: 5, intelligence: 10, speed: 5, resilience: 5 },
      });
      const dull = makeEntity(`c${index}`, {
        attributes: { strength: 5, intelligence: 1, speed: 5, resilience: 5 },
      });
      const strong = makeEntity(`s${index}`, {
        attributes: { strength: 10, intelligence: 5, speed: 5, resilience: 5 },
      });
      const weak = makeEntity(`s${index}`, {
        attributes: { strength: 1, intelligence: 5, speed: 5, resilience: 5 },
      });
      cleverDiplomacy += civilStats(clever).diplomacy;
      dullDiplomacy += civilStats(dull).diplomacy;
      strongWarfare += civilStats(strong).warfare;
      weakWarfare += civilStats(weak).warfare;
    }
    expect(cleverDiplomacy).toBeGreaterThan(dullDiplomacy);
    expect(strongWarfare).toBeGreaterThan(weakWarfare);
  });

  it('weights stewardship double in leadership', () => {
    const steady = { diplomacy: 2, warfare: 1, stewardship: 8, intrigue: 1 };
    const charming = { diplomacy: 8, warfare: 1, stewardship: 2, intrigue: 1 };
    expect(leadership(steady)).toBeGreaterThan(leadership(charming));
  });
});

describe('loyalty', () => {
  it('always keeps the capital', () => {
    // A kingdom does not secede from its own seat.
    const result = loyaltyFor(baseline({ isCapital: true, averageMood: -100 }));
    expect(result.score).toBeGreaterThan(REBELLION_THRESHOLD);
    expect(result.factors.some(f => f.label.includes('Seat'))).toBe(true);
  });

  it('explains itself', () => {
    // The breakdown is the point: a number with no explanation is a number the
    // player learns to ignore.
    const result = loyaltyFor(baseline({
      distanceToCapital: 60,
      averageMood: -50,
      villagesOverLimit: 1,
    }));
    expect(result.factors.length).toBeGreaterThanOrEqual(3);
    for (const factor of result.factors) {
      expect(factor.label.length).toBeGreaterThan(3);
      expect(Number.isInteger(factor.value)).toBe(true);
    }
  });

  it('orders the breakdown by what is actually driving it', () => {
    const result = loyaltyFor(baseline({ averageMood: -90, distanceToCapital: 12 }));
    for (let index = 1; index < result.factors.length; index += 1) {
      expect(Math.abs(result.factors[index].value))
        .toBeLessThanOrEqual(Math.abs(result.factors[index - 1].value));
    }
  });

  it('drops factors that contribute nothing', () => {
    // Padding the list with zeroes makes it longer and less informative.
    const result = loyaltyFor(baseline());
    expect(result.factors.every(factor => factor.value !== 0)).toBe(true);
  });

  it('sums its own breakdown', () => {
    const result = loyaltyFor(baseline({
      distanceToCapital: 40, averageMood: -30, bordersCapital: true, villagesOverLimit: 1,
    }));
    const total = result.factors.reduce((sum, factor) => sum + factor.value, 0);
    expect(result.score).toBe(Math.max(LOYALTY_MIN, Math.min(LOYALTY_MAX, total)));
  });

  it('stays in range however bad things get', () => {
    const wretched = loyaltyFor(baseline({
      distanceToCapital: 400,
      averageMood: -100,
      villagesOverLimit: 6,
      population: 200,
      capitalPopulation: 1,
      territory: 900,
      capitalTerritory: 1,
      sameSpeciesAsKing: false,
      leaderTraits: ['pyromaniac', 'bloodthirsty', 'coward'],
    }));
    expect(wretched.score).toBe(LOYALTY_MIN);

    const blessed = loyaltyFor(baseline({
      isCapital: true, averageMood: 100, bordersCapital: true, losingWar: true,
      villageAge: 0, kingdomAge: 0,
    }));
    expect(blessed.score).toBe(LOYALTY_MAX);
  });

  it('punishes distance from the capital', () => {
    const near = loyaltyFor(baseline({ distanceToCapital: 5 })).score;
    const far = loyaltyFor(baseline({ distanceToCapital: 120 })).score;
    expect(far).toBeLessThan(near);
  });

  it('punishes outgrowing the capital', () => {
    const modest = loyaltyFor(baseline({ population: 8, capitalPopulation: 20 })).score;
    const swollen = loyaltyFor(baseline({ population: 60, capitalPopulation: 8 })).score;
    expect(swollen).toBeLessThan(modest);
  });

  it('punishes over-expansion, which replaced the old hard village cap', () => {
    const governable = loyaltyFor(baseline({ villagesOverLimit: 0 })).score;
    const overreached = loyaltyFor(baseline({ villagesOverLimit: 2 })).score;
    expect(overreached).toBeLessThan(governable - 40);
  });

  it('rallies a province when the kingdom is losing a war', () => {
    // WorldBox does this and it is right: an outside threat is the one thing
    // that reliably stops a province complaining about the capital.
    const peace = loyaltyFor(baseline({ losingWar: false })).score;
    const besieged = loyaltyFor(baseline({ losingWar: true })).score;
    expect(besieged).toBeGreaterThan(peace);
  });

  it('rewards a capable king and punishes a weak one under a strong governor', () => {
    const able = { diplomacy: 9, warfare: 5, stewardship: 9, intrigue: 5 };
    const hopeless = { diplomacy: 1, warfare: 5, stewardship: 1, intrigue: 5 };

    const wellRuled = loyaltyFor(baseline({ king: able, leader: hopeless })).score;
    const badlyRuled = loyaltyFor(baseline({ king: hopeless, leader: able })).score;
    expect(wellRuled).toBeGreaterThan(badlyRuled);
  });

  it('lets a province tire of being ruled by another people', () => {
    const kin = loyaltyFor(baseline({ sameSpeciesAsKing: true })).score;
    const foreign = loyaltyFor(baseline({ sameSpeciesAsKing: false })).score;
    expect(foreign).toBeLessThan(kin - 20);
    // And worse where the culture itself resents outsiders.
    const bigoted = loyaltyFor(baseline({
      sameSpeciesAsKing: false, xenophobic: true,
    })).score;
    expect(bigoted).toBeLessThan(foreign);
  });

  it('counts drifting apart in culture, language and faith', () => {
    const united = loyaltyFor(baseline({
      sameCulture: true, sameLanguage: true, sameReligion: true,
    })).score;
    const estranged = loyaltyFor(baseline({
      sameCulture: false, sameLanguage: false, sameReligion: false,
    })).score;
    // A province drifts culturally before it drifts politically, so this has
    // to be enough on its own to matter.
    expect(united - estranged).toBeGreaterThan(100);
  });

  it('skips an identity factor rather than counting a missing one as a mismatch', () => {
    // A village with no culture is not culturally estranged; it simply has not
    // been asked. Reading null as "different" would make every pre-identity
    // world quietly rebellious.
    const unknown = loyaltyFor(baseline({ sameCulture: null })).score;
    const shared = loyaltyFor(baseline({ sameCulture: true })).score;
    const split = loyaltyFor(baseline({ sameCulture: false })).score;
    expect(unknown).toBeGreaterThan(split);
    expect(unknown).toBeLessThan(shared);
  });

  it('lets the mood of the people drive it', () => {
    // Phase 10 gave every creature a mood; a province full of miserable people
    // is exactly where a rebellion should start.
    const content = loyaltyFor(baseline({ averageMood: 80 })).score;
    const wretched = loyaltyFor(baseline({ averageMood: -80 })).score;
    expect(content).toBeGreaterThan(wretched + 40);
  });

  it('gives new settlements and new kingdoms a honeymoon that fades', () => {
    const fresh = loyaltyFor(baseline({ villageAge: 0, kingdomAge: 0 })).score;
    const settled = loyaltyFor(baseline({ villageAge: 5000, kingdomAge: 5000 })).score;
    expect(fresh).toBeGreaterThan(settled);
  });

  it('can actually reach rebellion from plausible circumstances', () => {
    // If no realistic combination ever goes negative the whole system is
    // decoration. This is a large, distant, foreign-ruled, miserable province
    // in an overextended realm — every one of which the simulation produces.
    const doomed = loyaltyFor(baseline({
      distanceToCapital: 70,
      population: 24,
      capitalPopulation: 12,
      averageMood: -40,
      villagesOverLimit: 1,
      sameSpeciesAsKing: false,
      king: { diplomacy: 3, warfare: 5, stewardship: 3, intrigue: 4 },
      leader: { diplomacy: 7, warfare: 5, stewardship: 8, intrigue: 6 },
    }));
    expect(doomed.score).toBeLessThan(REBELLION_THRESHOLD);
  });

  it('leaves a well-run province comfortably loyal', () => {
    // And if every province rebels the system is also decoration.
    const content = loyaltyFor(baseline({
      distanceToCapital: 14,
      bordersCapital: true,
      averageMood: 45,
      king: { diplomacy: 7, warfare: 5, stewardship: 8, intrigue: 5 },
      leader: { diplomacy: 4, warfare: 4, stewardship: 4, intrigue: 4 },
    }));
    expect(content.score).toBeGreaterThan(30);
  });
});

describe('how much a king can govern', () => {
  it('scales with stewardship', () => {
    const poor = governableVillages({ diplomacy: 5, warfare: 5, stewardship: 1, intrigue: 5 });
    const great = governableVillages({ diplomacy: 5, warfare: 5, stewardship: 10, intrigue: 5 });
    expect(great).toBeGreaterThan(poor);
  });

  it('gives an uncrowned kingdom a workable default', () => {
    expect(governableVillages(null)).toBeGreaterThan(1);
  });
});
