import { useEffect, useRef } from 'react';
import { impactBridge } from '../../utils/impactBridge';

/**
 * A full-screen wash of colour for the big moments.
 *
 * Kept out of React entirely: it is triggered from the middle of the render
 * loop and its whole job is to be instant, which a state update and a
 * reconcile is not. The nonce is polled instead — cheap, and it means the
 * engine can fire one without knowing this component exists.
 */
const ScreenFlash = () => {
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    let seen = impactBridge.flash.nonce;
    let frame = 0;

    const poll = () => {
      frame = requestAnimationFrame(poll);
      const flash = impactBridge.flash;
      if (flash.nonce === seen) return;
      seen = flash.nonce;

      node.className = `screen-flash screen-flash-${flash.tone}`;
      node.style.setProperty('--flash-strength', String(flash.strength));
      // Restarting a CSS animation needs the class off, a reflow, and it back
      // on. Reading offsetWidth is the reflow.
      node.style.animation = 'none';
      void node.offsetWidth;
      node.style.animation = '';
    };

    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <div ref={nodeRef} className="screen-flash" aria-hidden />;
};

export default ScreenFlash;
