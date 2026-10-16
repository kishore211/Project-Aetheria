import { beforeEach } from 'vitest';
import { resetEntityIds } from '../utils/ids';

// jsdom has no 2D canvas backend. The atlas and sprite code is written to
// tolerate a missing context, so stub it out quietly rather than letting jsdom
// print a "not implemented" notice for every texture we build.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
}

/**
 * The simulation is built on Math.random: trait rolls, wander directions, herd
 * churn, diplomacy. Left alone, a behavioural test is a coin flip that usually
 * lands the right way up, which is worse than useless — it hides real
 * regressions behind reruns.
 *
 * Every test therefore starts from the same seeded stream. Behaviour stays
 * varied within a test, but a failure is reproducible and means something.
 * A test that needs several different outcomes should loop, not rerun.
 */
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const SEED = 20260821;

beforeEach(() => {
  const random = mulberry32(SEED);
  Math.random = random;
  // Creature ids come from a per-world counter (utils/ids.ts), not from a
  // random source, so each test starts it again at e-1. Anything that orders
  // or pairs by id then behaves the same from run to run.
  resetEntityIds();
});
