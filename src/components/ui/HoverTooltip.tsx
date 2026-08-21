import { useEffect, useRef } from 'react';
import { Crown, Flame, PawPrint, Sparkles, Users } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { TRAITS } from '../../utils/traits';

const OFFICE_LABEL: Record<string, string> = {
  king: 'King',
  leader: 'Leader',
  captain: 'Captain',
  warrior: 'Warrior',
  gatherer: 'Gatherer',
  builder: 'Builder',
};

const pretty = (value: string): string => value.replace(/_/g, ' ');

/**
 * The hover readout. Reading the world by pointing at it is most of what makes
 * WorldBox's interface feel light; having to click a thing and read a panel is
 * most of what made ours feel heavy
 * (docs/project-tracker/07-UI-TEARDOWN-AND-SPEC.md).
 *
 * The cursor position is written straight to the element's transform rather
 * than held in React state — following the mouse through the render cycle would
 * re-render the tree at pointer rate for no benefit.
 */
const HoverTooltip = () => {
  const target = useGameStore((state) => state.hoverTarget);
  const boxRef = useRef<HTMLDivElement>(null);
  // The pointer may never have moved in this session (a touch device, or the
  // window regaining focus), and a tooltip parked at the origin looks broken.
  const positioned = useRef(false);

  useEffect(() => {
    const move = (event: MouseEvent) => {
      const box = boxRef.current;
      if (!box) return;
      if (!positioned.current) {
        positioned.current = true;
        box.style.visibility = 'visible';
      }
      const pad = 14;
      const width = box.offsetWidth;
      const height = box.offsetHeight;
      // Flip to the other side of the cursor near the window edges
      const x = event.clientX + pad + width > window.innerWidth
        ? event.clientX - pad - width
        : event.clientX + pad;
      const y = event.clientY + pad + height > window.innerHeight
        ? event.clientY - pad - height
        : event.clientY + pad;
      box.style.transform = `translate3d(${Math.max(4, x)}px, ${Math.max(4, y)}px, 0)`;
    };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, []);

  if (!target) return null;

  return (
    <div
      ref={boxRef}
      style={{ visibility: positioned.current ? 'visible' : 'hidden' }}
      className="fixed left-0 top-0 z-40 pointer-events-none max-w-[15rem] rounded-md border border-muted/50 bg-secondary/95 px-2.5 py-2 text-xs shadow-xl backdrop-blur"
    >
      {target.kind === 'unit' ? (
        <>
          <div className="flex items-center gap-1.5">
            {target.office === 'king' && <Crown size={12} className="text-amber-300" />}
            <span className="font-semibold text-foreground">{target.name}</span>
            <span className="capitalize text-muted-foreground">{pretty(target.species)}</span>
          </div>

          <div className="mt-1 capitalize text-muted-foreground">
            {target.office ? `${OFFICE_LABEL[target.office] ?? pretty(target.office)} · ` : ''}
            {pretty(target.activity)}
          </div>

          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-red-500"
              style={{ width: `${Math.max(0, (target.health / target.maxHealth) * 100)}%` }}
            />
          </div>

          {(target.village || target.kingdom) && (
            <div className="mt-1.5 flex items-center gap-1.5 text-muted-foreground">
              {target.kingdomColor && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm border border-black/30"
                  style={{ backgroundColor: target.kingdomColor }}
                />
              )}
              <span className="truncate">
                {[target.village, target.kingdom].filter(Boolean).join(' · ')}
              </span>
            </div>
          )}

          {target.herd !== null && (
            <div className="mt-1 flex items-center gap-1 text-muted-foreground">
              <PawPrint size={11} /> herd of {target.herd}
            </div>
          )}

          {target.traits.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {target.traits.map((trait) => {
                const info = TRAITS[trait as keyof typeof TRAITS];
                return (
                  <span
                    key={trait}
                    className={`rounded-full bg-background/70 px-1.5 py-px ${info?.tone ?? 'text-foreground'}`}
                  >
                    {info?.label ?? trait}
                  </span>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold capitalize text-foreground">{pretty(target.biome)}</span>
            {target.onFire && <Flame size={12} className="text-orange-400" />}
          </div>

          <div className="mt-0.5 text-muted-foreground">
            {target.x}, {target.y} · {Math.round(target.elevation * 100)}% high ·{' '}
            {Math.round(target.fertility * 100)}% fertile
          </div>

          {(target.village || target.kingdom) && (
            <div className="mt-1.5 flex items-center gap-1.5">
              {target.kingdomColor && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm border border-black/30"
                  style={{ backgroundColor: target.kingdomColor }}
                />
              )}
              <span className="truncate text-foreground">
                {[target.village, target.kingdom].filter(Boolean).join(' · ')}
              </span>
            </div>
          )}

          {target.resources.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1 text-muted-foreground">
              {target.resources.map((resource) => (
                <span
                  key={resource.type}
                  className="rounded-full border border-muted/50 bg-background/70 px-1.5 py-px capitalize"
                >
                  {resource.type} {resource.quantity}
                </span>
              ))}
            </div>
          )}

          {target.occupants > 0 && (
            <div className="mt-1 flex items-center gap-1 text-muted-foreground">
              <Users size={11} /> {target.occupants} here
            </div>
          )}

          {target.resources.length === 0 && target.occupants === 0 && !target.village && (
            <div className="mt-1 flex items-center gap-1 italic text-muted-foreground">
              <Sparkles size={11} /> empty land
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default HoverTooltip;
