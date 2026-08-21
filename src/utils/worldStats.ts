// The world's own record of itself.
//
// The simulation already produces all of this and threw every bit of it away
// the moment it happened. A chronicle tells you what just occurred; statistics
// tell you what kind of world you have been running — whether the population
// is climbing or has been flat for ten years, whether your creatures are dying
// of old age or of each other. WorldBox has a whole window for it
// (06-WORLDBOX-COMPLETE-REFERENCE.md §3, list windows) and it is one of the
// cheapest things in this codebase to add, because nothing new needs simulating.

import type { DeathCause } from './entityManagerMinimal';

/** All causes, in the order they should be listed. Most interesting first. */
export const DEATH_CAUSES: DeathCause[] = [
  'combat', 'starvation', 'burned', 'divine', 'old_age', 'health', 'random',
];

export const DEATH_LABELS: Record<DeathCause, string> = {
  combat: 'Killed',
  starvation: 'Starved',
  burned: 'Burned',
  divine: 'Struck down',
  old_age: 'Old age',
  health: 'Illness',
  random: 'Unexplained',
};

/**
 * How many population samples to keep, and how often to take one.
 *
 * 120 samples at one every 4 seconds is eight minutes of history, which at our
 * pacing is a few dozen years — long enough to show a dynasty rising or a
 * collapse, short enough that the graph is not a flat line with a wiggle at the
 * end. A ring buffer rather than an array that grows: this runs forever.
 */
const SAMPLE_COUNT = 120;
export const SAMPLE_INTERVAL = 4;

export interface WorldStats {
  births: number;
  deaths: number;
  deathsByCause: Record<DeathCause, number>;
  /** Highest population ever seen in this world. */
  peakPopulation: number;
  /** Oldest sample first. Shorter than SAMPLE_COUNT until the buffer fills. */
  populationHistory: number[];
  /** Seconds of simulated time since this world was made. */
  age: number;
}

const emptyCauses = (): Record<DeathCause, number> => ({
  old_age: 0, health: 0, random: 0, divine: 0, combat: 0, starvation: 0, burned: 0,
});

let births = 0;
let deaths = 0;
let deathsByCause = emptyCauses();
let peakPopulation = 0;
let age = 0;

const samples = new Array<number>(SAMPLE_COUNT).fill(0);
let sampleHead = 0;
let sampleFilled = 0;
let sampleTimer = 0;

export const recordBirth = (): void => { births += 1; };

export const recordDeath = (cause: DeathCause): void => {
  deaths += 1;
  deathsByCause[cause] = (deathsByCause[cause] ?? 0) + 1;
};

/**
 * Advance the clock and take a population sample when one is due.
 *
 * Called with the tick's delta, so it follows game speed and stops while
 * paused: a paused world should not accumulate a flat line of history the
 * player did not watch happen.
 */
export const sampleWorld = (delta: number, population: number): void => {
  age += delta;
  if (population > peakPopulation) peakPopulation = population;

  sampleTimer += delta;
  if (sampleTimer < SAMPLE_INTERVAL) return;
  // Carry the remainder rather than resetting to zero. Zeroing throws away
  // whatever the delta overshot by, which at triple speed is most of an
  // interval every sample and quietly stretches the history's time axis.
  sampleTimer -= SAMPLE_INTERVAL;
  samples[sampleHead] = population;
  sampleHead = (sampleHead + 1) % SAMPLE_COUNT;
  sampleFilled = Math.min(SAMPLE_COUNT, sampleFilled + 1);
};

export const readStats = (): WorldStats => {
  const history: number[] = [];
  // Unroll the ring oldest-first. While the buffer is still filling, the
  // oldest entry is index 0; once it has wrapped, it is at the head.
  const start = sampleFilled < SAMPLE_COUNT ? 0 : sampleHead;
  for (let step = 0; step < sampleFilled; step += 1) {
    history.push(samples[(start + step) % SAMPLE_COUNT]);
  }

  return {
    births,
    deaths,
    deathsByCause: { ...deathsByCause },
    peakPopulation,
    populationHistory: history,
    age,
  };
};

export const resetStats = (): void => {
  births = 0;
  deaths = 0;
  deathsByCause = emptyCauses();
  peakPopulation = 0;
  age = 0;
  samples.fill(0);
  sampleHead = 0;
  sampleFilled = 0;
  sampleTimer = 0;
};
