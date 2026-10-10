import { useState } from 'react';
import { Crown, ChevronDown, ChevronUp, Handshake, MapPin, Shield, Swords, Sword } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import Banner from './Banner';

/**
 * Live standings of every kingdom: territory, population and active wars.
 * The panel hides itself entirely until civilization actually appears.
 */
const KingdomsPanel = () => {
  const kingdoms = useGameStore((state) => state.kingdoms);
  const focusTile = useGameStore((state) => state.focusTile);
  const [collapsed, setCollapsed] = useState(false);
  // One realm open at a time: the card is a window into a kingdom, and two
  // open cards in a panel this narrow is a wall of text.
  const [open, setOpen] = useState<string | null>(null);

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
                onClick={() => setOpen(open === kingdom.id ? null : kingdom.id)}
                title="Show this realm"
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
              {open === kingdom.id && (
                <div className="mt-1.5 ml-5 p-2 rounded-md bg-background/50 border border-muted/40 text-xs space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Crown size={11} className="text-amber-300" />
                    <span className="text-muted-foreground">Ruled by</span>
                    <span className="text-foreground truncate">{kingdom.ruler ?? 'nobody yet'}</span>
                  </div>
                  {kingdom.capital && (
                    <button
                      type="button"
                      className="flex items-center gap-1.5 hover:text-foreground text-muted-foreground"
                      onClick={() => focusTile(kingdom.capital!.x, kingdom.capital!.y)}
                      title="Fly to the capital"
                    >
                      <MapPin size={11} />
                      Seat at <span className="text-foreground underline decoration-dotted">{kingdom.capital.name}</span>
                    </button>
                  )}
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Shield size={11} />
                    {kingdom.army ?? 0} under arms{(kingdom.army ?? 0) > 0 ? `, ${kingdom.armed ?? 0} with blades` : ''}
                  </div>
                  {(kingdom.allies?.length ?? 0) > 0 && (
                    <div className="flex items-center gap-1.5 text-emerald-300">
                      <Handshake size={11} /> allied with {kingdom.allies!.join(', ')}
                    </div>
                  )}
                  {kingdom.relic && (
                    <div className="flex items-center gap-1.5 text-amber-200">
                      <Sword size={11} /> carries the legendary {kingdom.relic}
                    </div>
                  )}
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
