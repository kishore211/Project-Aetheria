import { describe, expect, it, beforeEach } from 'vitest';
import type { Entity } from '../types/world';
import { SCENARIO_TABLE, applyScenario, type Scenario } from './scenarios';
import { MOOD_MAX, MOOD_MIN, seedMood } from './mood';
import { clearAllStatusTimers, hasStatus } from './statusEffects';
import { clearFloaters, floatBridge } from './floatBridge';

const makeEntity = (over: Partial<Entity> = {}): Entity => ({
  id: 's1',
  type: 'human',
  name: 'Test',
  age: 30,
  maxAge: 70,
  health: 100,
  maxHealth: 100,
  position: { x: 5, y: 5 },
  attributes: { strength: 5, intelligence: 5, speed: 5, resilience: 5 },
  needs: { hunger: 0.7, thirst: 0.7, rest: 0.7, social: 0.7 },
  inventory: [],
  status: [],
  ...over,
});

const live = () => floatBridge.slots.filter(slot => slot.id !== 0);

describe('scenarios', () => {
  beforeEach(() => {
    clearAllStatusTimers();
    clearFloaters();
  });

  it('moves mood in the direction the table says', () => {
    const lucky = makeEntity();
    seedMood(lucky);
    const before = lucky.happiness!;
    applyScenario(lucky, 'gotHome');
    expect(lucky.happiness!).toBeGreaterThan(before);

    const unlucky = makeEntity();
    seedMood(unlucky);
    const start = unlucky.happiness!;
    applyScenario(unlucky, 'lostChild');
    expect(unlucky.happiness!).toBeLessThan(start);
  });

  it('applies the status the scenario carries', () => {
    const entity = makeEntity();
    seedMood(entity);
    applyScenario(entity, 'poked');
    expect(hasStatus(entity, 'poked')).toBe(true);
  });

  it('keeps mood inside the range even for the largest events', () => {
    const entity = makeEntity();
    entity.happiness = MOOD_MIN;
    applyScenario(entity, 'lostChild');
    expect(entity.happiness).toBe(MOOD_MIN);

    entity.happiness = MOOD_MAX;
    applyScenario(entity, 'fellInLove');
    expect(entity.happiness).toBe(MOOD_MAX);
  });

  it('shows a glyph for the big events and stays quiet for the small ones', () => {
    // A face over a creature's head every time it takes a drink is noise.
    const sipper = makeEntity();
    seedMood(sipper);
    applyScenario(sipper, 'drankWell');
    expect(live().filter(slot => slot.kind === 'emote')).toHaveLength(0);

    const bereaved = makeEntity({ id: 's2' });
    seedMood(bereaved);
    applyScenario(bereaved, 'lostLover');
    expect(live().filter(slot => slot.kind === 'emote').length).toBeGreaterThan(0);
  });

  it('never leaves a placeholder in a spoken line', () => {
    const entity = makeEntity();
    seedMood(entity);
    for (const scenario of Object.keys(SCENARIO_TABLE) as Scenario[]) {
      applyScenario(entity, scenario);
    }
    for (const slot of live()) {
      if (slot.kind === 'speech') expect(slot.text).not.toMatch(/[{}]/);
    }
  });

  it('weights grief far above a bad night, and a meal far below both', () => {
    // The numbers only matter relative to each other. If everything were worth
    // 20 then nothing would be.
    const grief = Math.abs(SCENARIO_TABLE.lostChild.mood);
    const rough = Math.abs(SCENARIO_TABLE.sleptRough.mood);
    const meal = Math.abs(SCENARIO_TABLE.ateWell.mood);
    expect(grief).toBeGreaterThan(rough * 3);
    expect(rough).toBeGreaterThan(meal);
  });

  it('makes being poked an insult rather than an injury', () => {
    // One point of damage is dealt at the call site; the scenario is all mood.
    expect(Math.abs(SCENARIO_TABLE.poked.mood)).toBeGreaterThan(10);
    expect(SCENARIO_TABLE.poked.voice).toBeGreaterThan(0.5);
  });

  it('gives every scenario a non-zero mood change', () => {
    // A scenario that changes nothing is a call site with extra steps.
    for (const [name, def] of Object.entries(SCENARIO_TABLE)) {
      expect(def.mood, name).not.toBe(0);
      if (def.occasion) expect(def.voice, name).toBeGreaterThan(0);
    }
  });

  it('does not speak for scenarios with no voice set', () => {
    const entity = makeEntity();
    seedMood(entity);
    applyScenario(entity, 'drankWell');
    expect(live().filter(slot => slot.kind === 'speech')).toHaveLength(0);
  });
});

describe('scenario glyphs', () => {
  beforeEach(() => {
    clearAllStatusTimers();
    clearFloaters();
  });

  it('shows what happened, not where the creature ended up', () => {
    // Poking a well-fed villager leaves it at about +66, so deriving the glyph
    // from the resulting mood showed a smiling face as feedback for hurting
    // somebody. The glyph must describe the event.
    const cheerful = makeEntity();
    cheerful.happiness = 84;
    applyScenario(cheerful, 'poked');

    const glyphs = live().filter(slot => slot.kind === 'emote').map(slot => slot.text);
    expect(glyphs.length).toBeGreaterThan(0);
    expect(glyphs).not.toContain('\u{1F60A}');
    expect(cheerful.happiness!).toBeGreaterThan(40);
  });

  it('gives the events with an obvious symbol their own', () => {
    expect(SCENARIO_TABLE.fellInLove.glyph).toBe('❤');
    expect(SCENARIO_TABLE.lostLover.glyph).toBe('\u{1F494}');
    expect(SCENARIO_TABLE.crowned.glyph).toBe('\u{1F451}');
  });

  it('falls back to a plain good or bad marker, never to a mood face', () => {
    const entity = makeEntity({ id: 's9' });
    entity.happiness = -90;
    applyScenario(entity, 'restedWell');
    // restedWell is below the glyph threshold, so nothing should appear.
    expect(live().filter(slot => slot.kind === 'emote')).toHaveLength(0);

    clearFloaters();
    applyScenario(entity, 'turnedOut');
    const shown = live().filter(slot => slot.kind === 'emote').map(slot => slot.text);
    expect(shown.length).toBeGreaterThan(0);
  });
});
