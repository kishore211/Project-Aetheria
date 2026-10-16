// Impact feedback: camera shake, and the screen flashing for big moments.
//
// WorldBox sells its disasters with motion and colour, not with numbers. A
// meteor does not merely damage tiles — the view lurches and the world goes
// white for a frame. That is the difference between watching a state change
// and watching something happen to a place you were looking at
// (07-UI-TEARDOWN-AND-SPEC.md, W4).
//
// Both live here rather than in the engine so anything can request them —
// tools, disasters, the settlement system declaring a war — without reaching
// into the render loop.

import { random } from './random';

export type FlashTone = 'impact' | 'divine' | 'blood' | 'plague';

interface Shake {
  /** Remaining shake time in seconds. */
  time: number;
  /**
   * Starting amplitude in screen pixels, at a nominal 900px-tall viewport.
   *
   * Screen pixels rather than world units, and applied through the camera's
   * view offset rather than its position. Moving the camera looks like the
   * obvious approach and does not work: MapControls re-derives its internal
   * orbit state from wherever the camera actually is, so every frame's random
   * nudge gets baked in and a shake becomes a random walk the view never
   * returns from. Measured drift on a single lightning strike was 0.09 world
   * units, permanently. A view offset is invisible to the controls.
   */
  amplitude: number;
  /** Total duration, kept so the decay curve is right. */
  duration: number;
}

export const impactBridge = {
  shake: { time: 0, amplitude: 0, duration: 1 } as Shake,
  flash: {
    tone: 'impact' as FlashTone,
    /** Bumped per request; the DOM layer watches it to restart the animation. */
    nonce: 0,
    /** 0-1, how hard. */
    strength: 0,
  },
};

/**
 * Shake the view.
 *
 * Requests do not queue — a second meteor while the first is still shaking
 * takes the larger of the two rather than adding, because two overlapping
 * shakes read as a broken camera rather than as two meteors.
 */
export const requestShake = (amplitude: number, duration = 0.55): void => {
  const shake = impactBridge.shake;
  if (shake.time > 0 && shake.amplitude >= amplitude) return;
  shake.amplitude = amplitude;
  shake.duration = duration;
  shake.time = duration;
};

export const requestFlash = (tone: FlashTone, strength = 1): void => {
  impactBridge.flash.tone = tone;
  impactBridge.flash.strength = Math.max(0, Math.min(1, strength));
  impactBridge.flash.nonce += 1;
};

/**
 * Advance the shake and return this frame's offset in nominal pixels.
 *
 * Decays as the square of remaining time, which lands much closer to how a
 * real jolt dies away than a straight ramp — a linear decay reads as the
 * camera being dragged rather than struck.
 */
export const sampleShake = (delta: number): { x: number; y: number } => {
  const shake = impactBridge.shake;
  if (shake.time <= 0) return { x: 0, y: 0 };

  shake.time = Math.max(0, shake.time - delta);
  const remaining = shake.time / shake.duration;
  const strength = shake.amplitude * remaining * remaining;

  return {
    x: (random() - 0.5) * 2 * strength,
    // Less vertical than horizontal: a ground-level jolt, not a lift
    y: (random() - 0.5) * strength,
  };
};

/** True while a shake is running, so the engine knows when to clear the offset. */
export const isShaking = (): boolean => impactBridge.shake.time > 0;

export const clearImpacts = (): void => {
  impactBridge.shake.time = 0;
  impactBridge.shake.amplitude = 0;
  impactBridge.flash.strength = 0;
};
