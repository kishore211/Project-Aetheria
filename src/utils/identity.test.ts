import { describe, expect, it, beforeEach } from 'vitest';
import type { Entity } from '../types/world';
import {
  CULTURE_TRAITS,
  allMetas,
  bookAt,
  buildPot,
  carriedMetas,
  converse,
  forgetUnusedMetas,
  groupHasCultureTrait,
  hasCultureTrait,
  metaById,
  metaOf,
  mintMeta,
  readBook,
  resetIdentity,
  rollCultureTraits,
  setGroupMetas,
  setMetaOf,
  writeBook,
  type CultureTraitId,
} from './identity';

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

/** A deterministic roll sequence, so the lottery can be reasoned about. */
const rolls = (...values: number[]) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
};

beforeEach(resetIdentity);

describe('minting identities', () => {
  it('names all three kinds, and gives cultures traits', () => {
    const culture = mintMeta('culture', 0.3);
    const language = mintMeta('language', 0.3);
    const religion = mintMeta('religion', 0.3);

    expect(culture.name.length).toBeGreaterThan(2);
    expect(language.name).toMatch(/speech|tongue|cant|dialect/);
    expect(religion.name.toLowerCase()).toContain('the ');
    expect(culture.traits.length).toBeGreaterThan(0);
    // Only cultures carry traits; the others are identity alone.
    expect(language.traits).toEqual([]);
    expect(religion.traits).toEqual([]);
  });

  it('gives each a distinct id and registers it', () => {
    const a = mintMeta('culture', 0.1);
    const b = mintMeta('culture', 0.1);
    expect(a.id).not.toBe(b.id);
    expect(metaById(a.id)).toBe(a);
    expect(allMetas('culture')).toHaveLength(2);
  });

  it('never rolls a contradictory pair of traits', () => {
    for (let step = 0; step <= 40; step += 1) {
      const traits = rollCultureTraits(step / 40);
      expect(traits.length).toBeGreaterThanOrEqual(2);
      for (const trait of traits) {
        for (const other of traits) {
          if (trait === other) continue;
          expect(CULTURE_TRAITS[trait].opposes, `${trait} vs ${other}`).not.toContain(other);
        }
      }
    }
  });

  it('terminates for every roll, however unlucky', () => {
    for (let step = 0; step < 200; step += 1) {
      expect(rollCultureTraits(step / 199).length).toBeGreaterThan(0);
    }
  });

  it('gives every trait a label and a description', () => {
    // A trait that only appears in a tooltip is a word, not a culture — so at
    // minimum it has to be explainable.
    for (const info of Object.values(CULTURE_TRAITS)) {
      expect(info.label.length).toBeGreaterThan(3);
      expect(info.description.length).toBeGreaterThan(15);
    }
  });
});

describe('the pot', () => {
  it('weighs an individual once', () => {
    const a = makeEntity('a', { cultureId: 'c1' });
    const b = makeEntity('b', { cultureId: 'c2' });
    expect(buildPot(a, b, 'culture').sort()).toEqual(['c1', 'c2']);
  });

  it('weighs a villager twice and a subject of a matching realm three times', () => {
    // This is the whole mechanism: institutions weigh more than individuals,
    // which is why identity clusters geographically with no code that mentions
    // geography.
    setGroupMetas('v1', { culture: 'c1', language: null, religion: null });
    setGroupMetas('k1', { culture: 'c1', language: null, religion: null });

    const settled = makeEntity('a', { cultureId: 'c1', villageId: 'v1', kingdomId: 'k1' });
    const stranger = makeEntity('b', { cultureId: 'c2' });

    const pot = buildPot(settled, stranger, 'culture');
    expect(pot.filter(id => id === 'c1')).toHaveLength(3);
    expect(pot.filter(id => id === 'c2')).toHaveLength(1);
  });

  it('does not double-count a villager whose culture differs from the town', () => {
    setGroupMetas('v1', { culture: 'c9', language: null, religion: null });
    const dissenter = makeEntity('a', { cultureId: 'c1', villageId: 'v1' });
    const other = makeEntity('b', { cultureId: 'c2' });
    expect(buildPot(dissenter, other, 'culture').filter(id => id === 'c1')).toHaveLength(1);
  });

  it('skips speakers with nothing to say', () => {
    const blank = makeEntity('a');
    const held = makeEntity('b', { cultureId: 'c2' });
    expect(buildPot(blank, held, 'culture')).toEqual(['c2']);
    expect(buildPot(blank, makeEntity('c'), 'culture')).toEqual([]);
  });
});

describe('conversation', () => {
  it('converts the loser to the winner', () => {
    const a = makeEntity('a', { cultureId: 'c1' });
    const b = makeEntity('b', { cultureId: 'c2' });
    // First entry wins.
    converse(a, b, rolls(0));
    expect(metaOf(a, 'culture')).toBe(metaOf(b, 'culture'));
  });

  it('changes nothing when both already agree', () => {
    const a = makeEntity('a', { cultureId: 'c1', languageId: 'l1', religionId: 'r1' });
    const b = makeEntity('b', { cultureId: 'c1', languageId: 'l1', religionId: 'r1' });
    expect(converse(a, b, rolls(0.5))).toEqual([]);
  });

  it('lets a weighted majority usually win without always winning', () => {
    // Three entries against one: the settled culture should take most
    // exchanges but not all of them, or the mechanic is just "the town wins".
    setGroupMetas('v1', { culture: 'c1', language: null, religion: null });
    setGroupMetas('k1', { culture: 'c1', language: null, religion: null });

    let townWins = 0;
    const RUNS = 400;
    for (let run = 0; run < RUNS; run += 1) {
      const settled = makeEntity('a', { cultureId: 'c1', villageId: 'v1', kingdomId: 'k1' });
      const stranger = makeEntity('b', { cultureId: 'c2' });
      converse(settled, stranger);
      if (metaOf(stranger, 'culture') === 'c1') townWins += 1;
    }
    expect(townWins / RUNS).toBeGreaterThan(0.6);
    expect(townWins / RUNS).toBeLessThan(0.95);
  });

  it('carries all three kinds independently', () => {
    const a = makeEntity('a', { cultureId: 'c1', languageId: 'l1', religionId: 'r1' });
    const b = makeEntity('b', { cultureId: 'c2', languageId: 'l2', religionId: 'r2' });
    const changed = converse(a, b, rolls(0));
    expect(changed.sort()).toEqual(['culture', 'language', 'religion']);
  });

  it('lets a devout culture hold on to its faith', () => {
    const devout = mintMeta('culture', 0.5);
    devout.traits = ['devout'];
    const worldly = mintMeta('culture', 0.9);
    worldly.traits = [];

    let kept = 0;
    const RUNS = 200;
    for (let run = 0; run < RUNS; run += 1) {
      const believer = makeEntity('a', { cultureId: devout.id, religionId: 'r-old' });
      const missionary = makeEntity('b', { cultureId: worldly.id, religionId: 'r-new' });
      converse(believer, missionary);
      if (metaOf(believer, 'religion') === 'r-old') kept += 1;
    }
    // Devotion is mostly, not perfectly, effective.
    expect(kept / RUNS).toBeGreaterThan(0.6);
  });
});

describe('books', () => {
  it('names itself after the culture it carries', () => {
    const culture = mintMeta('culture', 0.2);
    const book = writeBook(5, 5, { culture: culture.id, language: null, religion: null }, 0.1);
    expect(book.title).toContain(culture.name);
  });

  it('is found from an adjacent tile, not only from its own', () => {
    writeBook(10, 10, { culture: 'c1', language: null, religion: null });
    expect(bookAt(10, 10)).not.toBeNull();
    expect(bookAt(11, 9)).not.toBeNull();
    expect(bookAt(14, 10)).toBeNull();
  });

  it('argues about evenly with the reader’s upbringing', () => {
    // Three against three: persuasive, not overwhelming. A book that always
    // won would flatten the map to one culture.
    const book = writeBook(0, 0, { culture: 'c-book', language: null, religion: null });
    let converted = 0;
    const RUNS = 400;
    for (let run = 0; run < RUNS; run += 1) {
      const reader = makeEntity('r', { cultureId: 'c-own' });
      readBook(reader, book);
      if (metaOf(reader, 'culture') === 'c-book') converted += 1;
    }
    expect(converted / RUNS).toBeGreaterThan(0.3);
    expect(converted / RUNS).toBeLessThan(0.7);
  });

  it('can bring back a culture nobody is left carrying', () => {
    // The reason books exist: a text keeps arguing for a people long after
    // the people are gone.
    const lost = mintMeta('culture', 0.4);
    const book = writeBook(3, 3, { culture: lost.id, language: null, religion: null });
    const reader = makeEntity('r', { cultureId: 'c-living' });
    readBook(reader, book, rolls(0.99));
    expect(metaOf(reader, 'culture')).toBe(lost.id);
  });

  it('leaves a reader who already agrees alone', () => {
    const book = writeBook(0, 0, { culture: 'c1', language: null, religion: null });
    const reader = makeEntity('r', { cultureId: 'c1' });
    expect(readBook(reader, book)).toEqual([]);
  });
});

describe('forgetting', () => {
  it('drops metas nothing carries any more', () => {
    const kept = mintMeta('culture', 0.1);
    mintMeta('culture', 0.8);
    const holder = makeEntity('a', { cultureId: kept.id });

    const dropped = forgetUnusedMetas(carriedMetas([holder]));
    expect(dropped).toBe(1);
    expect(metaById(kept.id)).not.toBeNull();
    expect(allMetas('culture')).toHaveLength(1);
  });

  it('counts a book and an institution as carriers, not just creatures', () => {
    const inBook = mintMeta('culture', 0.2);
    const inTown = mintMeta('culture', 0.6);
    writeBook(1, 1, { culture: inBook.id, language: null, religion: null });
    setGroupMetas('v1', { culture: inTown.id, language: null, religion: null });

    forgetUnusedMetas(carriedMetas([]));
    expect(metaById(inBook.id)).not.toBeNull();
    expect(metaById(inTown.id)).not.toBeNull();
  });
});

describe('reading traits', () => {
  it('reads a trait off a creature and off a group', () => {
    const culture = mintMeta('culture', 0.3);
    culture.traits = ['warlike'] as CultureTraitId[];
    const soldier = makeEntity('a', { cultureId: culture.id });
    setGroupMetas('v1', { culture: culture.id, language: null, religion: null });

    expect(hasCultureTrait(soldier, 'warlike')).toBe(true);
    expect(hasCultureTrait(soldier, 'pacifist')).toBe(false);
    expect(groupHasCultureTrait('v1', 'warlike')).toBe(true);
    expect(groupHasCultureTrait('nowhere', 'warlike')).toBe(false);
    expect(groupHasCultureTrait(null, 'warlike')).toBe(false);
  });

  it('sets and reads each kind without touching the others', () => {
    const entity = makeEntity('a');
    setMetaOf(entity, 'language', 'l1');
    expect(metaOf(entity, 'language')).toBe('l1');
    expect(metaOf(entity, 'culture')).toBeNull();
    expect(metaOf(entity, 'religion')).toBeNull();
  });
});

describe('colour assignment', () => {
  it('never gives two identities of one kind the same colour while it can help it', () => {
    // A hash was the obvious approach and collided immediately: the first
    // schism minted a culture the same colour as its parent, so the culture map
    // showed one colour for two peoples — the one thing that map exists to
    // distinguish.
    const colours = new Set<string>();
    for (let step = 0; step < 10; step += 1) {
      colours.add(mintMeta('culture', step / 10).colorHex);
    }
    expect(colours.size).toBe(10);
  });

  it('keeps the kinds independent, so a culture and a faith may share a colour', () => {
    // They are never drawn on the same layer, so competing for the palette
    // would only make each layer's colours less distinct.
    const culture = mintMeta('culture', 0.05);
    const religion = mintMeta('religion', 0.05);
    expect(culture.colorHex).toBe(religion.colorHex);
  });

  it('starts reusing colours only once the palette is exhausted', () => {
    for (let step = 0; step < 10; step += 1) mintMeta('language', step / 10);
    const eleventh = mintMeta('language', 0.5);
    // It has to pick *something*, and the least-used one is the right something.
    expect(eleventh.colorHex).toBeTruthy();
  });
});

describe('colours stay telling apart', () => {
  it('puts the second identity far around the wheel from the first', () => {
    // "Least used" alone handed gold and tan to two neighbouring realms, which
    // on a drained grey map are the same colour to the eye.
    const hue = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max === min) return 0;
      const span = max - min;
      const raw = max === r ? ((g - b) / span + (g < b ? 6 : 0))
        : max === g ? (b - r) / span + 2
          : (r - g) / span + 4;
      return raw * 60;
    };
    const gap = (a: number, b: number) => {
      const raw = Math.abs(a - b) % 360;
      return raw > 180 ? 360 - raw : raw;
    };

    for (let seed = 0; seed <= 10; seed += 1) {
      resetIdentity();
      const first = mintMeta('culture', seed / 10);
      const second = mintMeta('culture', seed / 10);
      expect(gap(hue(first.colorHex), hue(second.colorHex)), first.colorHex).toBeGreaterThan(60);
    }
  });
});
