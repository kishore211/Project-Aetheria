import { useState } from 'react';
import { Crown, ChevronDown, ChevronUp, Swords } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';

/**
 * Live standings of every kingdom: territory, population and active wars.
 * The panel hides itself entirely until civilization actually appears.
 */
const KingdomsPanel = () => {
  const kingdoms = useGameStore((state) => state.kingdoms);
  const [collapsed, setCollapsed] = useState(false);

  if (kingdoms.length === 0) return null;

  return (
    <div className="ui-panel-right w-full bg-secondary/90 backdrop-blur rounded-md shadow-lg border border-muted/40 text-sm">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-foreground font-medium"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="flex items-center gap-2">
          <Crown size={16} className="text-amber-300" />
          Kingdoms ({kingdoms.length})
        </span>
        {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {!collapsed && (
        <ul className="max-h-56 overflow-y-auto px-3 pb-2 space-y-2">
          {kingdoms.map((kingdom) => (
            <li key={kingdom.id} className="chronicle-item">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-sm shrink-0 border border-black/30"
                  style={{ backgroundColor: kingdom.color }}
                />
                <span className="truncate font-medium text-foreground" title={kingdom.name}>
                  {kingdom.name}
                </span>
              </div>
              <div className="pl-5 text-xs text-muted-foreground">
                {kingdom.population} souls · {kingdom.villages} village{kingdom.villages === 1 ? '' : 's'} · {kingdom.territory} tiles
              </div>
              {kingdom.atWarWith.length > 0 && (
                <div className="pl-5 text-xs text-rose-400 flex items-center gap-1">
                  <Swords size={11} />
                  at war with {kingdom.atWarWith.join(', ')}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default KingdomsPanel;
