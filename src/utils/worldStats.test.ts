import { describe, expect, it, beforeEach } from 'vitest';
import {
  SAMPLE_INTERVAL,
  readStats,
  recordBirth,
  recordDeath,
  resetStats,
  sampleWorld,
} from './worldStats';

describe('world statistics', () => {
  beforeEach(resetStats);

  it('starts a new world from nothing', () => {
    const stats = readStats();
    expect(stats.births).toBe(0);
    expect(stats.deaths).toBe(0);
    expect(stats.peakPopulation).toBe(0);
    expect(stats.populationHistory).toEqual([]);
    expect(stats.age).toBe(0);
  });

  it('counts births and deaths by cause', () => {
    recordBirth();
    recordBirth();
    recordDeath('combat');
    recordDeath('combat');
    recordDeath('old_age');

    const stats = readStats();
    expect(stats.births).toBe(2);
    expect(stats.deaths).toBe(3);
    expect(stats.deathsByCause.combat).toBe(2);
    expect(stats.deathsByCause.old_age).toBe(1);
    expect(stats.deathsByCause.burned).toBe(0);
  });

  it('remembers the highest population it ever saw', () => {
    sampleWorld(1, 40);
    sampleWorld(1, 120);
    sampleWorld(1, 12);
    expect(readStats().peakPopulation).toBe(120);
  });

  it('samples on the interval, not on every call', () => {
    // Halves, so the accumulation is exact in binary and the test is about the
    // interval logic rather than about floating-point addition.
    sampleWorld(SAMPLE_INTERVAL / 2, 50);
    expect(readStats().populationHistory).toEqual([]);
    sampleWorld(SAMPLE_INTERVAL / 2, 50);
    expect(readStats().populationHistory).toEqual([50]);
  });

  it('carries the overshoot forward instead of discarding it', () => {
    // Zeroing the timer on each sample throws away whatever the delta
    // overshot by, which at high speed is most of an interval every time and
    // quietly stretches the history's time axis.
    sampleWorld(SAMPLE_INTERVAL * 1.75, 10);
    expect(readStats().populationHistory).toEqual([10]);
    // 0.75 of an interval is banked, so a quarter more should trigger the next.
    sampleWorld(SAMPLE_INTERVAL * 0.25, 20);
    expect(readStats().populationHistory).toEqual([10, 20]);
  });

  it('records history oldest-first', () => {
    for (const population of [10, 20, 30]) sampleWorld(SAMPLE_INTERVAL, population);
    expect(readStats().populationHistory).toEqual([10, 20, 30]);
  });

  it('keeps a bounded window and drops the oldest, still in order', () => {
    // This runs forever, so the buffer must not grow. Overflowing it has to
    // leave the *recent* history readable, which a naive ring read does not.
    for (let step = 0; step < 400; step += 1) sampleWorld(SAMPLE_INTERVAL, step);

    const history = readStats().populationHistory;
    expect(history.length).toBeLessThanOrEqual(120);
    expect(history[history.length - 1]).toBe(399);
    // Strictly increasing, which is only true if the unroll starts in the
    // right place after the ring has wrapped.
    for (let step = 1; step < history.length; step += 1) {
      expect(history[step]).toBeGreaterThan(history[step - 1]);
    }
  });

  it('does not advance while the world is paused', () => {
    // The engine passes the speed-scaled delta, which is zero when paused. A
    // paused world must not fill up with history nobody watched happen.
    for (let step = 0; step < 500; step += 1) sampleWorld(0, 30);
    const stats = readStats();
    expect(stats.age).toBe(0);
    expect(stats.populationHistory).toEqual([]);
  });

  it('runs history faster at higher game speed', () => {
    sampleWorld(SAMPLE_INTERVAL * 3, 20);
    // Triple speed hands us triple the delta; one call is enough for a sample.
    expect(readStats().populationHistory).toEqual([20]);
    expect(readStats().age).toBe(SAMPLE_INTERVAL * 3);
  });

  it('wipes clean for a new world', () => {
    recordBirth();
    recordDeath('divine');
    sampleWorld(SAMPLE_INTERVAL, 99);
    resetStats();

    const stats = readStats();
    expect(stats.births).toBe(0);
    expect(stats.deaths).toBe(0);
    expect(stats.peakPopulation).toBe(0);
    expect(stats.populationHistory).toEqual([]);
  });

  it('hands out a copy, so a reader cannot corrupt the tally', () => {
    recordDeath('combat');
    const first = readStats();
    first.deathsByCause.combat = 9999;
    expect(readStats().deathsByCause.combat).toBe(1);
  });
});

describe('realm history', () => {
  it('keeps a line per realm, and a fallen realm drops to zero', async () => {
    const stats = await import('./worldStats');
    stats.resetStats();
    let realms = [{ id: 'k1', name: 'A', color: '#f00', population: 5 }, { id: 'k2', name: 'B', color: '#00f', population: 3 }];
    stats.setRealmSource(() => realms);
    stats.sampleWorld(stats.SAMPLE_INTERVAL, 8);
    realms = [{ id: 'k1', name: 'A', color: '#f00', population: 7 }];
    stats.sampleWorld(stats.SAMPLE_INTERVAL, 7);
    const history = stats.readStats().realmHistory;
    expect(history.find(r => r.id === 'k1')?.values).toEqual([5, 7]);
    expect(history.find(r => r.id === 'k2')?.values).toEqual([3, 0]);
    stats.setRealmSource(() => []);
  });
});
