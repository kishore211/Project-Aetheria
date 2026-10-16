import { afterEach, describe, expect, it } from 'vitest';
import { random, seedRandom, unseedRandom } from './random';

const draw = (n: number): number[] => Array.from({ length: n }, () => random());

describe('random', () => {
  afterEach(() => {
    unseedRandom();
  });

  it('gives the same sequence for the same seed', () => {
    seedRandom(42);
    const first = draw(50);
    seedRandom(42);
    expect(draw(50)).toEqual(first);
  });

  it('gives different sequences for different seeds', () => {
    seedRandom(1);
    const a = draw(20);
    seedRandom(2);
    const b = draw(20);
    expect(a).not.toEqual(b);
  });

  it('stays in [0, 1) when seeded', () => {
    seedRandom(7);
    for (const x of draw(1000)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('delegates to Math.random when unseeded', () => {
    const original = Math.random;
    let calls = 0;
    Math.random = () => {
      calls++;
      return 0.42;
    };
    try {
      unseedRandom();
      expect(random()).toBe(0.42);
      expect(calls).toBe(1);
    } finally {
      Math.random = original;
    }
  });

  it('calls Math.random at draw time, not at import time', () => {
    const original = Math.random;
    Math.random = () => 0.9;
    try {
      expect(random()).toBe(0.9);
    } finally {
      Math.random = original;
    }
  });
});
