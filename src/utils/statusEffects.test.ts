import { describe, expect, it, beforeEach } from 'vitest';
import type { Entity } from '../types/world';
import {
  STATUSES,
  applyStatus,
  clearAllStatusTimers,
  clearStatus,
  forgetStatuses,
  hasStatus,
  isStatusId,
  statusDef,
  statusTimerCount,
  tickStatuses,
} from './statusEffects';

const makeEntity = (id = 'e1'): Entity => ({
  id,
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
});

describe('status effects', () => {
  beforeEach(clearAllStatusTimers);

  it('applies and clears', () => {
    const entity = makeEntity();
    applyStatus(entity, 'wounded');
    expect(hasStatus(entity, 'wounded')).toBe(true);
    clearStatus(entity, 'wounded');
    expect(hasStatus(entity, 'wounded')).toBe(false);
  });

  it('never adds the same status twice', () => {
    const entity = makeEntity();
    applyStatus(entity, 'eating');
    applyStatus(entity, 'eating');
    expect(entity.status.filter(s => s === 'eating')).toHaveLength(1);
  });

  it('expires timed statuses on simulated time, not the wall clock', () => {
    // The old implementation used setTimeout, so a status lasted the same real
    // seconds at triple speed and kept counting down while paused. Ticking on
    // the game delta is the whole point of this table.
    const entity = makeEntity();
    applyStatus(entity, 'eating');
    const life = STATUSES.eating.duration;

    tickStatuses(entity, life * 0.6);
    expect(hasStatus(entity, 'eating')).toBe(true);

    tickStatuses(entity, life * 0.5);
    expect(hasStatus(entity, 'eating')).toBe(false);
  });

  it('does not expire anything while the world is paused', () => {
    const entity = makeEntity();
    applyStatus(entity, 'poked');
    for (let step = 0; step < 500; step += 1) tickStatuses(entity, 0);
    expect(hasStatus(entity, 'poked')).toBe(true);
  });

  it('leaves open-ended statuses to whoever set them', () => {
    const entity = makeEntity();
    applyStatus(entity, 'king');
    for (let step = 0; step < 200; step += 1) tickStatuses(entity, 1);
    expect(hasStatus(entity, 'king')).toBe(true);
    expect(STATUSES.king.duration).toBe(0);
  });

  it('refreshes rather than stacks when re-applied', () => {
    // A creature standing in a fire should stay burnt for a while after it
    // leaves, not for a while after it first caught.
    const entity = makeEntity();
    applyStatus(entity, 'laughing');
    tickStatuses(entity, STATUSES.laughing.duration * 0.9);
    applyStatus(entity, 'laughing');
    tickStatuses(entity, STATUSES.laughing.duration * 0.5);
    expect(hasStatus(entity, 'laughing')).toBe(true);
  });

  it('sums the mood push of everything currently held', () => {
    const entity = makeEntity();
    applyStatus(entity, 'exhausted');
    applyStatus(entity, 'wounded');
    const expected = STATUSES.exhausted.mood + STATUSES.wounded.mood;
    expect(tickStatuses(entity, 0)).toBeCloseTo(expected);
    expect(expected).toBeLessThan(0);
  });

  it('ignores statuses it does not know instead of throwing', () => {
    const entity = makeEntity();
    entity.status.push('something-a-future-system-invented');
    expect(() => tickStatuses(entity, 1)).not.toThrow();
    expect(statusDef('something-a-future-system-invented')).toBeNull();
    expect(isStatusId('wounded')).toBe(true);
  });

  it('lets go of a dead creature’s timers', () => {
    const entity = makeEntity('doomed');
    applyStatus(entity, 'eating');
    expect(statusTimerCount()).toBe(1);
    forgetStatuses(entity.id);
    expect(statusTimerCount()).toBe(0);
  });

  it('drops the timer table when a timed status runs out on its own', () => {
    // Otherwise the map grows by one entry per creature that ever ate.
    const entity = makeEntity('transient');
    applyStatus(entity, 'drinking');
    expect(statusTimerCount()).toBe(1);
    tickStatuses(entity, STATUSES.drinking.duration + 1);
    expect(statusTimerCount()).toBe(0);
  });

  it('gives every status a label, a glyph and a flavour line', () => {
    // A status the interface cannot draw or explain is a string with extra
    // steps, which is what this table replaced.
    for (const def of Object.values(STATUSES)) {
      expect(def.label.length).toBeGreaterThan(2);
      expect(def.glyph.length).toBeGreaterThan(0);
      expect(def.flavour.length).toBeGreaterThan(8);
      expect(def.duration).toBeGreaterThanOrEqual(0);
    }
  });

  it('only marks the social statuses contagious', () => {
    const contagious = Object.values(STATUSES).filter(def => def.contagious).map(def => def.id);
    expect(contagious.sort()).toEqual(['crying', 'laughing', 'singing']);
  });
});
