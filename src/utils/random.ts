/**
 * The simulation's one source of randomness.
 *
 * Every draw the simulation makes goes through random() here, not through
 * Math.random directly. Until seeded, random() is just Math.random, so
 * nothing changes. Calling seedRandom(seed) swaps in a seeded generator, so
 * a whole world can be replayed from one number: same seed, same sequence of
 * draws, same history. unseedRandom() puts Math.random back.
 */

export type RandomSource = () => number;

// Called through at draw time (not captured) so a test that replaces
// Math.random still takes effect.
let source: RandomSource = () => Math.random();

/** mulberry32: a small, fast 32-bit generator. Good enough for a game, not for crypto. */
const mulberry32 = (seed: number): RandomSource => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A number in [0, 1). Every simulation draw goes through this. */
export const random = (): number => source();

/** Switch every draw to a generator seeded from `seed`. */
export const seedRandom = (seed: number): void => {
  source = mulberry32(seed);
};

/** Go back to delegating to Math.random. */
export const unseedRandom = (): void => {
  source = () => Math.random();
};
