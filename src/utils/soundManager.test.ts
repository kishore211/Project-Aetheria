import { describe, expect, it, beforeEach } from 'vitest';
import { soundManager } from './soundManager';

/**
 * The sound manager synthesises everything and there is no AudioContext in
 * jsdom, so these tests cover the part that is pure logic and audible: the
 * variant pool. WorldBox round-robins every repeated action from a pool of
 * 6-20 samples, and the reason it matters is that an identical repeat is what
 * makes a brush feel mechanical (09-WORLDBOX-VISUAL-RESEARCH.md §8).
 */

/** Reach the private round-robin the same way a sound method does. */
const variant = (name: string, count?: number, spread?: number): number =>
  (soundManager as unknown as {
    variant(name: string, count?: number, spread?: number): number;
  }).variant(name, count, spread);

describe('sound variants', () => {
  beforeEach(() => {
    (soundManager as unknown as { variantCursor: Map<string, number> })
      .variantCursor.clear();
  });

  it('walks the whole pool before repeating anything', () => {
    // Round-robin rather than random on purpose: random collides with itself
    // audibly, since two identical pitches in a row happen one time in `count`.
    const seen = new Set<number>();
    for (let step = 0; step < 8; step += 1) seen.add(variant('test', 8, 0.1));
    expect(seen.size).toBe(8);
  });

  it('wraps back to the start of the pool', () => {
    const first = variant('wrap', 4, 0.1);
    for (let step = 0; step < 3; step += 1) variant('wrap', 4, 0.1);
    expect(variant('wrap', 4, 0.1)).toBeCloseTo(first);
  });

  it('centres the pool on the sound as originally tuned', () => {
    // If the pool drifted sharp or flat, every sound in the game would be
    // subtly mistuned from how it was designed.
    let total = 0;
    const COUNT = 9;
    for (let step = 0; step < COUNT; step += 1) total += variant('centre', COUNT, 0.1);
    expect(total / COUNT).toBeCloseTo(1, 5);
  });

  it('keeps every variant inside the requested spread', () => {
    for (let step = 0; step < 20; step += 1) {
      const value = variant('spread', 10, 0.06);
      expect(value).toBeGreaterThanOrEqual(1 - 0.06 - 1e-9);
      expect(value).toBeLessThanOrEqual(1 + 0.06 + 1e-9);
    }
  });

  it('keeps separate cursors per sound', () => {
    // Otherwise firing a lightning strike would advance the birth sound, and
    // two births in a row could still come out identical.
    const a1 = variant('alpha', 4, 0.1);
    variant('beta', 4, 0.1);
    variant('beta', 4, 0.1);
    const a2 = variant('alpha', 4, 0.1);
    expect(a2).not.toBeCloseTo(a1);
  });

  it('degrades to no variation for a pool of one', () => {
    expect(variant('single', 1, 0.2)).toBe(1);
  });
});
