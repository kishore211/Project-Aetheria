// Happiness.
//
// The simulation already knew whether a creature was starving, wounded, alone
// or safe. What it had no notion of was whether the creature *minded*. That is
// the whole difference between a sprite executing a state machine and a
// character having a week, and it is why WorldBox's units read as people
// (06-WORLDBOX-COMPLETE-REFERENCE.md §5).
//
// Happiness runs -100..+100 and is almost never set directly. It is pulled
// toward a baseline computed from circumstance — needs, health, whether it has
// a home — and pushed by statuses and by one-off scenario events. That way a
// creature's mood is a *consequence* of its life rather than another field
// somebody has to remember to update.
import type { Entity } from '../types/world';
import { applyStatus, clearStatus, tickStatuses } from './statusEffects';

export const MOOD_MIN = -100;
export const MOOD_MAX = 100;

/** Six steps, matching WorldBox's face icon. */
export type MoodStep = 'miserable' | 'sad' | 'low' | 'fine' | 'happy' | 'delighted';

interface MoodFace {
  step: MoodStep;
  label: string;
  glyph: string;
  /** Lower bound, inclusive. */
  from: number;
}

/**
 * Ordered high to low, so the first match wins. The bands are deliberately not
 * even: the middle two are wide because "fine" is where most creatures spend
 * most of their lives, and the extremes are narrow so seeing one means
 * something.
 */
export const MOOD_FACES: MoodFace[] = [
  { step: 'delighted', label: 'Delighted', glyph: '\u{1F604}', from: 70 },
  { step: 'happy', label: 'Happy', glyph: '\u{1F60A}', from: 30 },
  { step: 'fine', label: 'Content', glyph: '\u{1F642}', from: -5 },
  { step: 'low', label: 'Glum', glyph: '\u{1F615}', from: -35 },
  { step: 'sad', label: 'Unhappy', glyph: '\u{1F641}', from: -70 },
  { step: 'miserable', label: 'Wretched', glyph: '\u{1F62D}', from: MOOD_MIN },
];

export const moodFace = (happiness: number): MoodFace =>
  MOOD_FACES.find((face) => happiness >= face.from) ?? MOOD_FACES[MOOD_FACES.length - 1];

/**
 * Where this creature's mood is heading, given how its life is going.
 *
 * Needs are the bulk of it, because they are what the creature spends its day
 * on. Belonging to somewhere is worth a lot on its own — WorldBox's villagers
 * are markedly happier than its wanderers, and so are ours now.
 */
export const moodBaseline = (entity: Entity): number => {
  const needs = entity.needs;
  const fed = (needs.hunger + needs.thirst) / 2;
  const rested = needs.rest;
  const social = needs.social;
  const whole = entity.health / Math.max(1, entity.maxHealth);

  // Each term is -1..+1 before weighting.
  const score =
    (fed * 2 - 1) * 0.34
    + (rested * 2 - 1) * 0.16
    + (social * 2 - 1) * 0.18
    + (whole * 2 - 1) * 0.22
    + (entity.villageId ? 0.10 : -0.06);

  return Math.max(MOOD_MIN, Math.min(MOOD_MAX, score * 100));
};

/**
 * How fast mood chases its baseline, in points per simulated second.
 *
 * Slow on purpose. A creature whose mood snapped to its circumstances would
 * flicker between faces every time it took a drink, and the face would stop
 * meaning anything. At this rate crossing the whole range takes about a minute
 * of world time, so a mood is a mood and not a readout.
 */
const DRIFT = 2.2;

/**
 * Advance one creature's mood. Called from the AI's per-tick needs pass, which
 * already has the delta and already runs for every living thing.
 */
export const updateMood = (entity: Entity, delta: number): void => {
  const current = entity.happiness ?? moodBaseline(entity);

  const statusPush = tickStatuses(entity, delta);
  const baseline = moodBaseline(entity);
  const towards = Math.sign(baseline - current) * Math.min(
    Math.abs(baseline - current), DRIFT * delta,
  );

  const next = Math.max(MOOD_MIN, Math.min(MOOD_MAX, current + towards + statusPush * delta));
  entity.happiness = next;
  syncMoodStatus(entity, next);
};

/**
 * Keep exactly one mood status on the creature, so the inspector and the icon
 * rail can read mood the same way they read everything else.
 */
const MOOD_STATUS = ['happy', 'content', 'sad', 'miserable'] as const;

const syncMoodStatus = (entity: Entity, happiness: number): void => {
  const wanted = happiness >= 40 ? 'happy'
    : happiness >= -10 ? 'content'
      : happiness >= -60 ? 'sad'
        : 'miserable';
  for (const status of MOOD_STATUS) {
    if (status !== wanted) clearStatus(entity, status);
  }
  applyStatus(entity, wanted);
};

/**
 * A one-off event moved this creature's mood.
 *
 * Clamped rather than wrapped, and deliberately additive on top of the drift:
 * a gift should feel like a gift even to a creature that is starving, it just
 * will not last.
 */
export const nudgeMood = (entity: Entity, amount: number): void => {
  const current = entity.happiness ?? moodBaseline(entity);
  entity.happiness = Math.max(MOOD_MIN, Math.min(MOOD_MAX, current + amount));
  syncMoodStatus(entity, entity.happiness);
};

/** Start a creature's life at whatever its circumstances imply. */
export const seedMood = (entity: Entity): void => {
  entity.happiness = moodBaseline(entity);
};
