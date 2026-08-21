import { useEffect, useRef } from 'react';
import { floatBridge, type Floater } from '../../utils/floatBridge';

/**
 * Draws the floater pool.
 *
 * Deliberately React-free below the container: a battle can emit dozens of
 * numbers a second and reconciling that many mounts and unmounts per frame is
 * exactly the sort of thing that turns a smooth world into a stuttering one.
 * Instead this creates one node per pool slot on mount and, every frame,
 * copies the slot's state onto it. Nodes are never created or destroyed.
 */
const FloatingText = () => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const nodes: HTMLDivElement[] = floatBridge.slots.map(() => {
      const node = document.createElement('div');
      node.className = 'floater';
      node.style.visibility = 'hidden';
      host.appendChild(node);
      return node;
    });

    // What each slot was showing last frame, so text is only written when it
    // actually changes — assigning textContent invalidates layout every time.
    const shown = new Array<number>(nodes.length).fill(0);
    let frame = 0;

    const draw = () => {
      frame = requestAnimationFrame(draw);
      for (let index = 0; index < nodes.length; index += 1) {
        const slot: Floater = floatBridge.slots[index];
        const node = nodes[index];

        if (slot.id === 0 || slot.opacity <= 0.01) {
          if (node.style.visibility !== 'hidden') node.style.visibility = 'hidden';
          continue;
        }

        if (shown[index] !== slot.id) {
          shown[index] = slot.id;
          node.textContent = slot.text;
          node.className = `floater floater-${slot.kind}`;
        }

        const progress = slot.age / slot.life;
        // Rise fast and then ease off, so the eye catches it leaving the target
        const lift = 34 * (1 - (1 - progress) * (1 - progress));
        // Hold full opacity for the first half, then fade
        const fade = progress < 0.5 ? 1 : 1 - (progress - 0.5) * 2;

        node.style.transform = 'translate3d('
          + `${slot.screenX + slot.drift}px, `
          + `${slot.screenY - lift - slot.stack * 22}px, 0) translate(-50%, -100%)`;
        node.style.opacity = String(fade * slot.opacity);
        if (node.style.visibility !== 'visible') node.style.visibility = 'visible';
      }
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      for (const node of nodes) node.remove();
    };
  }, []);

  return <div ref={hostRef} className="floater-host" aria-hidden />;
};

export default FloatingText;
