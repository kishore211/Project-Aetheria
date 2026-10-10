import { beforeEach, vi } from 'vitest';

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

/**
 * Entity ids come from `uuid`, which reads the crypto stream rather than
 * Math.random — so the seed above never reached them, and anything that
 * orders or pairs by id (wars handled once per pair, map iteration after a
 * delete) varied from run to run. That was the source of the rare, never
 * reproducible failures in the soak and colonisation tests. A counter makes
 * ids as deterministic as everything else without spending any of the
 * random stream on them.
 */
let nextId = 0;
vi.mock('uuid', () => ({
  v4: () => `test-${(nextId++).toString(36).padStart(6, '0')}`,
}));

beforeEach(() => {
  const random = mulberry32(SEED);
  Math.random = random;
  nextId = 0;
});
