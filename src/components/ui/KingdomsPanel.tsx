import { useCallback, useState } from 'react';
import { Crown, ChevronDown, ChevronUp, Shield, Swords } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import Banner from './Banner';
import KingdomWindow from './KingdomWindow';

/**
 * Live standings of every kingdom: territory, population and active wars.
 * The panel hides itself entirely until civilization actually appears.
 */
const KingdomsPanel = () => {
  const kingdoms = useGameStore((state) => state.kingdoms);
  const [collapsed, setCollapsed] = useState(false);
  // One realm open at a time: the card is a window into a kingdom, and two
  // open cards in a panel this narrow is a wall of text.
  const [open, setOpen] = useState<string | null>(null);
  const closeWindow = useCallback(() => setOpen(null), []);

  if (kingdoms.length === 0) return null;

  return (
    <div className="ui-panel-right w-full bg-secondary/90 backdrop-blur-sm rounded-md shadow-lg border border-muted/40 text-sm">
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
              <button
                type="button"
                className="w-full flex items-center gap-2 text-left"
                onClick={() => setOpen(kingdom.id)}
                title="Open this realm"
              >
                <Banner id={kingdom.id} color={kingdom.color} race={kingdom.race} height={18} />
                <span className="truncate font-medium text-foreground" title={kingdom.name}>
                  {kingdom.name}
                </span>
                {(kingdom.army ?? 0) > 0 && (
                  <span className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums">
                    <Shield size={11} />{kingdom.army}
                  </span>
                )}
              </button>
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
      {open && <KingdomWindow id={open} onClose={closeWindow} />}
    </div>
  );
};

export default KingdomsPanel;
