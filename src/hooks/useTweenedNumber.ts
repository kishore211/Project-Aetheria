import { useEffect, useRef, useState } from 'react';

/**
 * A number that travels to its target instead of jumping there.
 *
 * "Make the numbers go brrrr" is a real line from WorldBox's own changelog, and
 * the reason it matters is that a counter which snaps gives you no sense of
 * *rate*. A population that ticks 41 → 44 → 48 tells you the world is growing;
 * the same values snapping in place tell you only where it currently is
 * (09-WORLDBOX-VISUAL-RESEARCH.md §10, item 27).
 *
 * Driven by `requestAnimationFrame` rather than by a CSS transition, because the
 * thing being animated is the *text*, and there is no CSS property for that.
 */
export const useTweenedNumber = (target: number, secondsToClose = 0.45): number => {
  const [shown, setShown] = useState(target);
  const currentRef = useRef(target);
  const targetRef = useRef(target);

  targetRef.current = target;

  useEffect(() => {
    let frame = 0;
    let last = performance.now();

    const step = (now: number) => {
      // Clamped at zero as well as above: a frame stamp from an earlier clock
      // (a tab coming back from the background) made the gap negative, and a
      // negative step walks the number *away* from its target — the counter
      // once read minus a hundred and seventy.
      const delta = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;

      const goal = targetRef.current;
      const gap = goal - currentRef.current;

      // Snap when close enough that a further frame could not show a
      // difference, so the loop always terminates on an integer rather than
      // asymptoting at 43.9997 for ever.
      if (Math.abs(gap) < 0.5) {
        if (currentRef.current !== goal) {
          currentRef.current = goal;
          setShown(goal);
        }
        frame = requestAnimationFrame(step);
        return;
      }

      // Exponential ease: fast at the start, slow at the end. A linear ramp
      // reads as a machine counting; this reads as a value settling.
      currentRef.current += gap * Math.min(1, delta / secondsToClose);
      setShown(Math.round(currentRef.current));
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [secondsToClose]);

  // A large jump is a different world, not a change in this one — loading a
  // save or generating a fresh map should not spend two seconds counting.
  useEffect(() => {
    if (Math.abs(target - currentRef.current) > 400) {
      currentRef.current = target;
      setShown(target);
    }
  }, [target]);

  return shown;
};
