import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { BookOpen, X } from 'lucide-react';
import type { EntityType } from '../../types/world';
import { FOOD_CHAIN } from '../../utils/entitySystemMinimal';
import { getPixelSpriteFrames } from '../../utils/pixelSprites';
import {
  creatureFacts, discoveredCount, isDiscovered, subscribeKnowledge,
} from '../../utils/knowledge';

const ALL = Object.keys(FOOD_CHAIN) as EntityType[];

/** A creature's standing frame as a data URL, drawn once and kept. */
const portraits = new Map<string, string>();
export const portraitOf = (type: EntityType): string => {
  const hit = portraits.get(type);
  if (hit !== undefined) return hit;
  let url = '';
  try {
    const image = getPixelSpriteFrames(type)[0].image as HTMLCanvasElement | undefined;
    url = image?.toDataURL?.() ?? '';
  } catch {
    url = '';
  }
  portraits.set(type, url);
  return url;
};

const label = (type: string) => type.replace(/_/g, ' ');

/**
 * Every creature this browser has ever met, across every world. The rest are
 * silhouettes, which is the whole reason to keep looking.
 */
const KnowledgeBook = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const count = useSyncExternalStore(subscribeKnowledge, discoveredCount, discoveredCount);
  const [picked, setPicked] = useState<EntityType | null>(null);
  const facts = useMemo(() => (picked ? creatureFacts(picked) : null), [picked]);

  useEffect(() => {
    if (!open) setPicked(null);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="ui-modal w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-secondary rounded-xl shadow-2xl border border-muted/50 p-5 text-foreground">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <BookOpen size={18} className="text-amber-300" />
            Knowledge
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {count} of {ALL.length} creatures met, across every world you have made.
        </p>

        {facts && (
          <div className="mb-4 p-3 rounded-lg bg-background/50 border border-muted/40 flex gap-3">
            <img
              src={portraitOf(facts.type)}
              alt=""
              className="w-20 h-20 shrink-0 rounded-md bg-emerald-900/40"
              style={{ imageRendering: 'pixelated' }}
            />
            <div className="min-w-0 text-xs space-y-1">
              <h3 className="text-base font-semibold capitalize text-foreground">
                {facts.name}
                {facts.people && <span className="ml-2 text-amber-300 text-xs font-normal">one of the peoples</span>}
              </h3>
              {facts.lines[0] && <p className="italic text-muted-foreground">{facts.lines[0]}</p>}
              <p className="text-muted-foreground">
                <span className="text-foreground">{facts.health}</span> health ·{' '}
                <span className="text-foreground">{facts.strength}</span> strength ·{' '}
                <span className="text-foreground">{facts.speed}</span> speed ·{' '}
                lives <span className="text-foreground">{facts.lifespan >= 9999 ? 'for ever' : `${facts.lifespan} years`}</span> ·{' '}
                {facts.size} · {facts.moves.toLowerCase()}
              </p>
              {facts.eats.length > 0 && (
                <p><span className="text-muted-foreground">Eats</span> <span className="capitalize">{facts.eats.map(label).join(', ')}</span></p>
              )}
              {facts.eatenBy.length > 0 && (
                <p><span className="text-muted-foreground">Hunted by</span> <span className="capitalize">{facts.eatenBy.map(label).join(', ')}</span></p>
              )}
              {facts.lives.length > 0 && (
                <p><span className="text-muted-foreground">Found in</span> <span className="capitalize">{facts.lives.map(label).join(', ')}</span></p>
              )}
              {facts.powers.map((power) => <p key={power} className="text-violet-200">{power}</p>)}
            </div>
          </div>
        )}

        <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5">
          {ALL.map((type) => {
            const met = isDiscovered(type);
            return (
              <button
                key={type}
                type="button"
                disabled={!met}
                title={met ? label(type) : 'Not met yet'}
                onClick={() => setPicked(type)}
                className={`aspect-square rounded-md border flex flex-col items-center justify-center p-1 ${
                  picked === type ? 'border-amber-300/70 bg-amber-300/10' : 'border-muted/40 bg-background/40'
                } ${met ? 'hover:bg-muted/50' : 'cursor-default'}`}
              >
                <img
                  src={portraitOf(type)}
                  alt=""
                  className="w-9 h-9"
                  style={{ imageRendering: 'pixelated', filter: met ? undefined : 'brightness(0)', opacity: met ? 1 : 0.35 }}
                />
                <span className="text-[0.6rem] leading-tight text-muted-foreground capitalize truncate w-full text-center">
                  {met ? label(type) : '???'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBook;
