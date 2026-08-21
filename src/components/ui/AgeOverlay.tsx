import { useEffect, useRef } from 'react';
import { AGES } from '../../utils/ages';
import { ageBridge } from '../../utils/ageBridge';

/**
 * The era's wash over the world.
 *
 * This is what makes an age *noticeable* — the rule changes are what make it
 * matter, but nobody reads a rule change. WorldBox puts a full-screen overlay
 * on each of its ten ages for exactly this reason
 * (06-WORLDBOX-COMPLETE-REFERENCE.md §8).
 *
 * Crossfaded in a rAF loop rather than by a CSS transition on a React-driven
 * class, because both the colour and the opacity change together and a
 * transition between two arbitrary tints goes through grey on the way. Easing
 * the numbers directly keeps an Age of Ice arriving as cold rather than as
 * washed out.
 */

/**
 * Fraction of the remaining distance closed per second.
 *
 * 1.4 works out to roughly two and a half seconds to settle at 60fps, which is
 * about right for an era: slow enough that you notice the world changing
 * character rather than cutting to it, fast enough that it is finished before
 * you have gone looking for what happened.
 */
const FADE_RATE = 1.4;

const parse = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const AgeOverlay = () => {
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    let current = parse(AGES.hope.tint);
    let strength = 0;
    let last = performance.now();
    let frame = 0;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const delta = Math.min(0.1, (now - last) / 1000);
      last = now;

      const target = parse((AGES[ageBridge.age] ?? AGES.hope).tint);
      const targetStrength = ageBridge.strength;
      const step = Math.min(1, delta * FADE_RATE);

      current = [
        current[0] + (target[0] - current[0]) * step,
        current[1] + (target[1] - current[1]) * step,
        current[2] + (target[2] - current[2]) * step,
      ];
      strength += (targetStrength - strength) * step;

      if (strength < 0.004) {
        if (node.style.opacity !== '0') node.style.opacity = '0';
        return;
      }
      node.style.background = `rgb(${current.map(Math.round).join(' ')})`;
      node.style.opacity = String(strength);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <div ref={nodeRef} className="age-overlay" aria-hidden />;
};

export default AgeOverlay;
