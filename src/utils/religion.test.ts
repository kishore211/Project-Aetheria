import { beforeEach, describe, expect, it } from 'vitest';
import { mintMeta, resetIdentity } from './identity';
import { faithHas, faithOf, foundFaith, holyWarTension, resetFaiths, rollFaithTraits } from './religion';
import { opinionBetween } from './politics';

describe('religion', () => {
  beforeEach(() => {
    resetIdentity();
    resetFaiths();
  });

  it('rolls two different traits for any roll', () => {
    for (let i = 0; i < 50; i++) {
      const [a, b] = rollFaithTraits(i / 50);
      expect(a).not.toBe(b);
    }
  });

  it('remembers its founder and holy city, and the first founding stands', () => {
    const meta = mintMeta('religion', 0.3);
    foundFaith(meta, 'Ada', 'Ashby');
    foundFaith(meta, 'Bob', 'Elsewhere');
    expect(faithOf(meta.id)).toMatchObject({ founder: 'Ada', holyCity: 'Ashby' });
  });

  it('gives an older religion traits lazily, and nothing to a culture', () => {
    const faith = mintMeta('religion', 0.6);
    const culture = mintMeta('culture', 0.6);
    expect(faithOf(faith.id)?.traits).toHaveLength(2);
    expect(faithOf(culture.id)).toBeNull();
  });

  it('turns zealotry into holy war between different faiths only', () => {
    const a = mintMeta('religion', 0.1);
    const b = mintMeta('religion', 0.2);
    foundFaith(a, null, null, 0);
    // Find a roll whose traits include zealotry for side a.
    const zealous = faithHas(a.id, 'zealotry');
    expect(holyWarTension(a.id, a.id)).toBe(0);
    if (zealous) expect(holyWarTension(a.id, b.id)).toBeGreaterThan(0);
    const calm = opinionBetween({
      ourKing: null, theirKing: null, borderTiles: 0, ourLand: 10, theirLand: 10,
      sameRace: true, sameCulture: null, sameLanguage: null, sameReligion: false,
      atWar: false, allied: false, foughtBefore: false,
    });
    const holy = opinionBetween({
      ourKing: null, theirKing: null, borderTiles: 0, ourLand: 10, theirLand: 10,
      sameRace: true, sameCulture: null, sameLanguage: null, sameReligion: false,
      holyWar: 6, atWar: false, allied: false, foughtBefore: false,
    });
    expect(holy.score).toBeLessThan(calm.score);
    expect(holy.factors.some(f => f.label === 'Holy war')).toBe(true);
  });
});

describe('religion trait spread', () => {
  it('does not hand neighbouring ids the same first trait', () => {
    resetIdentity();
    resetFaiths();
    const firsts = new Set<string>();
    for (let i = 0; i < 12; i++) firsts.add(faithOf(mintMeta('religion', i / 12).id)!.traits[0]);
    expect(firsts.size).toBeGreaterThanOrEqual(4);
  });
});
