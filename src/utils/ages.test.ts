import { describe, expect, it } from 'vitest';
import {
  AGES,
  AGE_LENGTH,
  AGE_LIST,
  AGE_SLOTS,
  ageForSlot,
  nextAge,
  type AgeId,
} from './ages';

describe('the age clock', () => {
  it('keeps at least half the clock calm', () => {
    // Without this every age is an event, and when everything is an event
    // nothing is — the calm stretches are what make an Age of Ash land.
    const slots = Array.from({ length: AGE_SLOTS }, (_, slot) => ageForSlot(slot, 0.5));
    const calm = slots.filter(age => age === 'hope').length;
    expect(calm / AGE_SLOTS).toBeGreaterThanOrEqual(0.5);
  });

  it('spends half of an actual run in Hope, and never two harsh ages running', () => {
    // Half is the target: WorldBox reports ~53%, and what matters is that the
    // calm stretches are at least as common as everything else put together.
    // The Despair-forces-Hope rule does not raise this figure — with the
    // current layout the harsh slots are already followed by calm ones — so it
    // is a guarantee about adjacency, not a corrective, and this checks it as
    // one.
    const harsh = new Set<AgeId>(['sun', 'chaos', 'ice', 'ash', 'despair']);
    let age: AgeId = 'hope';
    let previous: AgeId = 'hope';
    let hopeCount = 0;
    const RUN = 400;

    for (let slot = 0; slot < RUN; slot += 1) {
      if (age === 'hope') hopeCount += 1;
      previous = age;
      age = nextAge(slot + 1, age, ((slot * 37) % 100) / 100);
      expect(harsh.has(previous) && harsh.has(age), `${previous} → ${age}`).toBe(false);
    }
    expect(hopeCount / RUN).toBeGreaterThanOrEqual(0.5);
  });

  it('wraps the slot index, forward and backward', () => {
    expect(ageForSlot(AGE_SLOTS, 0.5)).toBe(ageForSlot(0, 0.5));
    expect(ageForSlot(AGE_SLOTS * 3 + 1, 0.5)).toBe(ageForSlot(1, 0.5));
    expect(ageForSlot(-1, 0.5)).toBe(ageForSlot(AGE_SLOTS - 1, 0.5));
  });

  it('never returns an age that does not exist, for any roll', () => {
    for (let slot = 0; slot < AGE_SLOTS * 2; slot += 1) {
      for (const roll of [0, 0.25, 0.5, 0.75, 0.999999, 1]) {
        const age = ageForSlot(slot, roll);
        expect(AGES[age], `slot ${slot} roll ${roll}`).toBeDefined();
      }
    }
  });

  it('draws the harsh ages only from the harsh slots', () => {
    const harsh = new Set<AgeId>(['sun', 'chaos', 'ice', 'ash', 'despair']);
    for (const roll of [0, 0.3, 0.6, 0.9]) {
      expect(harsh.has(ageForSlot(0, roll))).toBe(false);
      expect(harsh.has(ageForSlot(2, roll))).toBe(false);
      expect(harsh.has(ageForSlot(4, roll))).toBe(false);
      expect(harsh.has(ageForSlot(5, roll))).toBe(false);
    }
  });

  it('reaches every age eventually', () => {
    const seen = new Set<AgeId>();
    for (let slot = 0; slot < AGE_SLOTS * 4; slot += 1) {
      for (let step = 0; step < 10; step += 1) {
        seen.add(ageForSlot(slot, step / 10));
      }
    }
    // Every age in the table should be reachable, or it is dead content.
    for (const def of AGE_LIST) {
      expect(seen.has(def.id), def.id).toBe(true);
    }
  });

  it('always follows Despair with Hope', () => {
    // A world that has just fallen apart needs somewhere to recover.
    // Back-to-back catastrophes read as the simulation losing the plot.
    for (let slot = 0; slot < AGE_SLOTS * 2; slot += 1) {
      for (const roll of [0, 0.4, 0.8, 1]) {
        expect(nextAge(slot, 'despair', roll)).toBe('hope');
      }
    }
  });

  it('does not force Hope after anything else', () => {
    const followers = new Set<AgeId>();
    for (let slot = 1; slot < AGE_SLOTS * 3; slot += 1) {
      followers.add(nextAge(slot, 'sun', (slot % 10) / 10));
    }
    expect(followers.size).toBeGreaterThan(1);
  });
});

describe('the age table', () => {
  it('describes and heralds every age', () => {
    for (const def of AGE_LIST) {
      expect(def.name.startsWith('Age of'), def.id).toBe(true);
      expect(def.herald.length).toBeGreaterThan(20);
      expect(def.tint).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('keeps every tint faint enough to see the world through', () => {
    // An age you cannot see past is an age the player turns off.
    for (const def of AGE_LIST) {
      expect(def.tintStrength, def.id).toBeGreaterThan(0);
      expect(def.tintStrength, def.id).toBeLessThanOrEqual(0.32);
    }
  });

  it('makes Hope the mildest age on every axis', () => {
    const hope = AGES.hope;
    expect(hope.fireSpread).toBe(1);
    expect(hope.growth).toBe(1);
    expect(hope.harshness).toBe(1);
    expect(hope.mood).toBeGreaterThan(0);
    expect(hope.action).toBe('none');
    // And the faintest wash, since it is where the world spends most of its time.
    for (const def of AGE_LIST) {
      if (def.id === 'hope') continue;
      expect(def.tintStrength, def.id).toBeGreaterThan(hope.tintStrength);
    }
  });

  it('gives every age a real rule change, not just a colour', () => {
    // An age that only tinted the screen would be a filter.
    for (const def of AGE_LIST) {
      if (def.id === 'hope') continue;
      const changesRules = def.fireSpread !== 1
        || def.growth !== 1
        || def.harshness !== 1
        || def.action !== 'none';
      expect(changesRules, def.id).toBe(true);
    }
  });

  it('pairs every action with an interval, and every "none" without one', () => {
    for (const def of AGE_LIST) {
      if (def.action === 'none') expect(def.actionEvery, def.id).toBe(0);
      else expect(def.actionEvery, def.id).toBeGreaterThan(0);
    }
  });

  it('sets an era length that a single sitting can see turn over', () => {
    // Their ages are "at least 30 years", but a WorldBox year is ~40s and ours
    // is ~45 minutes; copying the number would give a 22-hour age. What
    // transfers is the pace of play.
    expect(AGE_LENGTH).toBeGreaterThan(120);
    expect(AGE_LENGTH).toBeLessThan(900);
  });
});
