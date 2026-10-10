import { useMemo, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import type { GameEvent } from '../../store/gameStore';
import {
  Baby, ChevronDown, ChevronUp, Crown, Flame, MapPin,
  ScrollText, Skull, Sparkles, Swords,
} from 'lucide-react';

type Kind = GameEvent['kind'];

/**
 * Per-kind identity: colour and a glyph.
 *
 * The icons matter more than they look like they should. A wall of same-coloured
 * text is read as one block; the same wall with a skull, a crown and a sword
 * down the left edge can be *skimmed*, which is what you actually do with a log
 * that is two hundred entries long
 * (07-UI-TEARDOWN-AND-SPEC.md — their chronicle is skimmable, ours was not).
 */
const KINDS: Record<Kind, { color: string; icon: typeof Skull; label: string }> = {
  life: { color: 'text-emerald-300', icon: Baby, label: 'Life' },
  death: { color: 'text-red-300', icon: Skull, label: 'Death' },
  kingdom: { color: 'text-violet-300', icon: Crown, label: 'Realms' },
  war: { color: 'text-rose-400', icon: Swords, label: 'War' },
  disaster: { color: 'text-orange-300', icon: Flame, label: 'Ruin' },
  divine: { color: 'text-amber-200', icon: Sparkles, label: 'Divine' },
  info: { color: 'text-slate-300', icon: ScrollText, label: 'World' },
};

/**
 * Filters, grouped rather than one chip per kind. Seven chips is a second
 * interface to learn; four is a decision you make instantly. "Life" covers
 * birth and death because what you want when you press it is *creatures*, not
 * one half of their existence.
 */
const FILTERS: Array<{ id: string; label: string; kinds: Kind[] }> = [
  { id: 'all', label: 'All', kinds: [] },
  { id: 'life', label: 'Life', kinds: ['life', 'death'] },
  { id: 'realms', label: 'Realms', kinds: ['kingdom', 'war'] },
  { id: 'acts', label: 'Acts of god', kinds: ['divine', 'disaster'] },
];

/** The world's history. Entries with a location fly the camera there. */
const EventLog = () => {
  const events = useGameStore((state) => state.events);
  const focusTile = useGameStore((state) => state.focusTile);
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState('all');

  const active = FILTERS.find((entry) => entry.id === filter) ?? FILTERS[0];
  const shown = useMemo(
    () => (active.kinds.length === 0
      ? events
      : events.filter((event) => active.kinds.includes(event.kind))),
    [events, active],
  );

  return (
    <div className="ui-panel-right mt-auto w-full bg-secondary/90 backdrop-blur-sm rounded-md shadow-lg border border-muted/40 text-sm">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-foreground font-medium"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="flex items-center gap-2">
          <ScrollText size={16} className="text-amber-200" />
          World Chronicle
        </span>
        {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {!collapsed && (
        <>
          <div className="flex gap-1 px-2.5 pb-1.5">
            {FILTERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`chronicle-chip ${filter === entry.id ? 'is-on' : ''}`}
                onClick={() => setFilter(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <ul className="max-h-48 overflow-y-auto px-2.5 pb-2 space-y-0.5">
            {shown.length === 0 && (
              <li className="text-muted-foreground italic px-0.5">
                {events.length === 0
                  ? 'The world awaits its first story…'
                  : 'Nothing of that kind has happened yet.'}
              </li>
            )}
            {shown.map((event) => {
              const kind = KINDS[event.kind];
              const Glyph = kind.icon;
              const body = (
                <>
                  <Glyph size={11} className="mt-[0.2rem] shrink-0 opacity-75" />
                  <span className="leading-snug">{event.message}</span>
                </>
              );
              return (
                <li key={event.id} className={`chronicle-item ${kind.color}`}>
                  {event.position ? (
                    <button
                      type="button"
                      className="w-full text-left flex items-start gap-1.5 rounded px-0.5 hover:bg-muted/40 group"
                      title="Show me"
                      onClick={() => focusTile(event.position!.x, event.position!.y)}
                    >
                      {body}
                      <MapPin
                        size={10}
                        className="mt-[0.2rem] ml-auto shrink-0 opacity-0 group-hover:opacity-70"
                      />
                    </button>
                  ) : (
                    <span className="flex items-start gap-1.5 px-0.5">{body}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
};

export default EventLog;
