import { describe, expect, it, beforeEach } from 'vitest';
import type { Entity } from '../types/world';
import {
  MOOD_FACES,
  MOOD_MAX,
  MOOD_MIN,
  moodBaseline,
  moodFace,
  nudgeMood,
  seedMood,
  updateMood,
} from './mood';
import { applyStatus, clearAllStatusTimers } from './statusEffects';

const makeEntity = (over: Partial<Entity> = {}): Entity => ({
  id: 'm1',
  type: 'human',
  name: 'Test',
  age: 10,
  maxAge: 60,
  health: 100,
  maxHealth: 100,
  position: { x: 0, y: 0 },
  attributes: { strength: 5, intelligence: 5, speed: 5, resilience: 5 },
  needs: { hunger: 1, thirst: 1, rest: 1, social: 1 },
  inventory: [],
  status: [],
  ...over,
});

describe('mood', () => {
  beforeEach(clearAllStatusTimers);

  it('gives a well-fed, healthy, settled creature a good baseline', () => {
    const settled = makeEntity({ villageId: 'v1' });
    expect(moodBaseline(settled)).toBeGreaterThan(50);
  });

  it('gives a starving, wounded, homeless one a bad baseline', () => {
    const wretch = makeEntity({
      health: 15,
      needs: { hunger: 0.05, thirst: 0.05, rest: 0.1, social: 0 },
    });
    expect(moodBaseline(wretch)).toBeLessThan(-50);
  });

  it('counts belonging somewhere as worth something on its own', () => {
    const base = { needs: { hunger: 0.5, thirst: 0.5, rest: 0.5, social: 0.5 } };
    const homeless = moodBaseline(makeEntity(base));
    const settled = moodBaseline(makeEntity({ ...base, villageId: 'v1' }));
    expect(settled).toBeGreaterThan(homeless);
  });

  it('stays inside the range whatever it is handed', () => {
    const best = makeEntity({ villageId: 'v', needs: { hunger: 1, thirst: 1, rest: 1, social: 1 } });
    const worst = makeEntity({ health: 0, needs: { hunger: 0, thirst: 0, rest: 0, social: 0 } });
    expect(moodBaseline(best)).toBeLessThanOrEqual(MOOD_MAX);
    expect(moodBaseline(worst)).toBeGreaterThanOrEqual(MOOD_MIN);

    const entity = makeEntity();
    nudgeMood(entity, 10000);
    expect(entity.happiness).toBe(MOOD_MAX);
    nudgeMood(entity, -100000);
    expect(entity.happiness).toBe(MOOD_MIN);
  });

  it('drifts toward the baseline rather than snapping to it', () => {
    // A mood that tracked circumstance instantly would flicker between faces
    // every time a creature took a drink, and the face would stop meaning
    // anything.
    const entity = makeEntity({ villageId: 'v1' });
    entity.happiness = -80;
    const target = moodBaseline(entity);

    updateMood(entity, 1);
    expect(entity.happiness!).toBeGreaterThan(-80);
    expect(entity.happiness!).toBeLessThan(target - 10);

    for (let step = 0; step < 200; step += 1) updateMood(entity, 1);
    expect(entity.happiness!).toBeGreaterThan(target - 15);
  });

  it('never overshoots the baseline on a long step', () => {
    const entity = makeEntity({ villageId: 'v1' });
    entity.happiness = -100;
    const target = moodBaseline(entity);
    // A single enormous delta must not fling it past where it was heading.
    updateMood(entity, 10_000);
    expect(entity.happiness!).toBeLessThanOrEqual(MOOD_MAX);
    expect(entity.happiness!).toBeGreaterThan(target - 30);
  });

  it('lets statuses push mood against the baseline', () => {
    const bare = makeEntity({ villageId: 'v1' });
    seedMood(bare);
    const miserable = makeEntity({ villageId: 'v1' });
    seedMood(miserable);
    applyStatus(miserable, 'cursed');
    applyStatus(miserable, 'grieving');

    for (let step = 0; step < 20; step += 1) {
      updateMood(bare, 0.5);
      updateMood(miserable, 0.5);
    }
    expect(miserable.happiness!).toBeLessThan(bare.happiness!);
  });

  it('keeps exactly one mood status on a creature', () => {
    const entity = makeEntity({ villageId: 'v1' });
    seedMood(entity);
    updateMood(entity, 1);
    const moodStatuses = entity.status.filter(
      s => ['happy', 'content', 'sad', 'miserable'].includes(s));
    expect(moodStatuses).toHaveLength(1);

    // Drive it down and confirm the old one was removed, not just joined.
    nudgeMood(entity, -200);
    const after = entity.status.filter(
      s => ['happy', 'content', 'sad', 'miserable'].includes(s));
    expect(after).toEqual(['miserable']);
  });

  it('maps every point in the range to exactly one face', () => {
    for (let value = MOOD_MIN; value <= MOOD_MAX; value += 1) {
      const face = moodFace(value);
      expect(face).toBeDefined();
      const matches = MOOD_FACES.filter(candidate => value >= candidate.from);
      // The first match wins, and it must be the one returned.
      expect(matches[0].step).toBe(face.step);
    }
  });

  it('reserves the extreme faces for extreme lives', () => {
    // Seeing a wretched face should mean something, so the band is narrow.
    expect(moodFace(0).step).toBe('fine');
    expect(moodFace(MOOD_MAX).step).toBe('delighted');
    expect(moodFace(MOOD_MIN).step).toBe('miserable');
    expect(moodFace(-40).step).toBe('sad');
  });

  it('starts a creature at its circumstances, not at zero', () => {
    const entity = makeEntity({ villageId: 'v1' });
    seedMood(entity);
    expect(entity.happiness).toBeCloseTo(moodBaseline(entity));
  });
});
