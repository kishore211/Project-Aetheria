import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import type { GameEvent } from '../../store/gameStore';
import { ScrollText, ChevronDown, ChevronUp } from 'lucide-react';

const kindColors: Record<GameEvent['kind'], string> = {
  info: 'text-slate-300',
  life: 'text-emerald-300',
  death: 'text-red-300',
  disaster: 'text-orange-300',
  divine: 'text-amber-200',
};

const EventLog = () => {
  const events = useGameStore((state) => state.events);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="ui-panel-right fixed bottom-4 right-4 w-80 bg-secondary/90 backdrop-blur rounded-md shadow-lg border border-muted/40 text-sm">
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
              {event.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default EventLog;
