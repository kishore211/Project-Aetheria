// The current era, for the screen wash.
//
// Same split as the other bridges: the engine owns the clock, the DOM owns the
// overlay. Published here rather than read from the store so the overlay can
// animate its own crossfade in a rAF loop without a React render per frame —
// an era change is a slow fade, and slow fades are exactly what React
// re-rendering is worst at.
import type { AgeId } from './ages';

export const ageBridge: { age: AgeId; strength: number } = {
  age: 'hope',
  strength: 0,
};
