import { useEffect, useRef, useState } from 'react';
import Banner from './Banner';
import { Crown, Swords } from 'lucide-react';
import { labelBridge, type MapLabel } from '../../utils/labelBridge';

/**
 * Kingdom and village names, drawn over the map.
 *
 * The list of labels comes through React (it changes when a village is founded
 * or razed — rarely). Their positions do not: the engine projects them every
 * frame and this component writes the results straight to each element's
 * transform in its own animation loop. Putting sixty-times-a-second position
 * updates through React state would re-render the HUD for no reason.
 */
const MapLabels = () => {
  const [labels, setLabels] = useState<MapLabel[]>(labelBridge.labels);
  const nodes = useRef(new Map<string, HTMLDivElement>());

  // Pick up added and removed labels; the engine bumps `version` for those only
  useEffect(() => {
    let seen = labelBridge.version;
    const poll = window.setInterval(() => {
      if (labelBridge.version === seen) return;
      seen = labelBridge.version;
      setLabels([...labelBridge.labels]);
    }, 400);
    return () => window.clearInterval(poll);
  }, []);

  // Follow the camera without re-rendering
  useEffect(() => {
    let frame = 0;
    const follow = () => {
      for (const label of labelBridge.labels) {
        const node = nodes.current.get(label.id);
        if (!node) continue;
        if (label.opacity <= 0.01) {
          if (node.style.visibility !== 'hidden') node.style.visibility = 'hidden';
          continue;
        }
        if (node.style.visibility !== 'visible') node.style.visibility = 'visible';
        node.style.opacity = String(label.opacity);
        node.style.transform =
          `translate3d(${label.screenX}px, ${label.screenY}px, 0) translate(-50%, -100%)`;
      }
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [labels]);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      {labels.map((label) => (
        <div
          key={label.id}
          ref={(node) => {
            if (node) nodes.current.set(label.id, node);
            else nodes.current.delete(label.id);
          }}
          style={{ visibility: 'hidden', willChange: 'transform' }}
          className={`absolute left-0 top-0 whitespace-nowrap map-label map-label-${label.kind}`}
          title={label.kind === 'battle' ? `${label.text} fighting` : undefined}
        >
          {label.kind === 'battle' && <Swords size={14} strokeWidth={3} className="map-battle-icon" />}
          {label.kind === 'village' && label.capital && (
            <Crown size={10} className="mr-1 inline-block -translate-y-px text-amber-300" />
          )}
          {label.kingdomId && (
            <Banner
              id={label.kingdomId}
              color={label.color}
              race={label.race}
              height={label.kind === 'kingdom' ? 18 : 12}
              className="mr-1 align-middle -translate-y-px"
            />
          )}
          {label.kind !== 'battle' && (
            <span style={label.kind === 'kingdom' ? { color: label.color } : undefined}>
              {label.text}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

export default MapLabels;
