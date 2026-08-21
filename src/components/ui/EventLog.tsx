import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import type { GameEvent } from '../../store/gameStore';
import { ScrollText, ChevronDown, ChevronUp, MapPin } from 'lucide-react';

const kindColors: Record<GameEvent['kind'], string> = {
  info: 'text-slate-300',
  life: 'text-emerald-300',
  death: 'text-red-300',
  disaster: 'text-orange-300',
  divine: 'text-amber-200',
  kingdom: 'text-violet-300',
  war: 'text-rose-400',
};

/** The world's history. Entries with a location fly the camera there. */
const EventLog = () => {
  const events = useGameStore((state) => state.events);
  const focusTile = useGameStore((state) => state.focusTile);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="ui-panel-right mt-auto w-full bg-secondary/90 backdrop-blur rounded-md shadow-lg border border-muted/40 text-sm">
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
        <ul className="max-h-48 overflow-y-auto px-3 pb-2 space-y-1">
          {events.length === 0 && (
            <li className="text-muted-foreground italic">The world awaits its first story…</li>
          )}
          {events.map((event) => (
            <li key={event.id} className={`chronicle-item ${kindColors[event.kind]} leading-snug`}>
              {event.position ? (
                <button
                  type="button"
                  className="text-left hover:underline flex items-start gap-1"
                  title="Show me"
                  onClick={() => focusTile(event.position!.x, event.position!.y)}
                >
                  <MapPin size={11} className="mt-1 shrink-0 opacity-60" />
                  <span>{event.message}</span>
                </button>
              ) : (
                <span className="block pl-4">{event.message}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default EventLog;
