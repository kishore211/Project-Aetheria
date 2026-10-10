import { useMemo, useState } from 'react';
import { Crown, Home, ScrollText, Swords, X } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';

/**
 * Browsable lists of everything the world contains.
 *
 * WorldBox has one of these per meta — wars, kingdoms, villages, clans — and
 * they are how you find anything at all in a 256² world
 * (06-WORLDBOX-COMPLETE-REFERENCE.md §3). Without them the only way to locate
 * a village is to squint at the map, which stops working the moment there are
 * more than a handful.
 *
 * One panel with tabs rather than one window per meta: the rows differ, the
 * behaviour does not, and every row does the same thing when clicked.
 */

type ListTab = 'realms' | 'villages' | 'wars' | 'plots';

const TABS: Array<{ id: ListTab; label: string; icon: typeof Crown }> = [
  { id: 'realms', label: 'Realms', icon: Crown },
  { id: 'villages', label: 'Towns', icon: Home },
  { id: 'wars', label: 'Standing', icon: Swords },
  { id: 'plots', label: 'Plots', icon: ScrollText },
];

const ListWindow = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const kingdoms = useGameStore((state) => state.kingdoms);
  const villages = useGameStore((state) => state.villages);
  const plots = useGameStore((state) => state.plots);
  const opinions = useGameStore((state) => state.opinions);
  const focusTile = useGameStore((state) => state.focusTile);
  const [tab, setTab] = useState<ListTab>('realms');

  /**
   * Wars are derived rather than stored: each kingdom already knows who it is
   * fighting, and a separate list would be a second copy of the same fact that
   * could fall out of step. Pairs are de-duplicated so a war appears once
   * rather than once per side.
   */
  const wars = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{ key: string; a: string; b: string; colorA: string; colorB: string }> = [];
    for (const kingdom of kingdoms) {
      for (const enemyName of kingdom.atWarWith) {
        const key = [kingdom.name, enemyName].sort().join(' vs ');
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          key,
          a: kingdom.name,
          b: enemyName,
          colorA: kingdom.color,
          colorB: kingdoms.find((other) => other.name === enemyName)?.color ?? '#94a3b8',
        });
      }
    }
    return rows;
  }, [kingdoms]);

  if (!open) return null;

  const counts: Record<ListTab, number> = {
    realms: kingdoms.length,
    villages: villages.length,
    wars: opinions.length || wars.length,
    plots: plots.length,
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="ui-modal w-full max-w-lg max-h-[80vh] flex flex-col bg-secondary rounded-xl shadow-2xl border border-muted/50 text-foreground">
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-lg font-bold">The World's Register</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-2.5">
          {TABS.map((entry) => {
            const Glyph = entry.icon;
            return (
              <button
                key={entry.id}
                type="button"
                className={`list-tab ${tab === entry.id ? 'is-on' : ''}`}
                onClick={() => setTab(entry.id)}
              >
                <Glyph size={13} />
                {entry.label}
                <span className="list-tab-count">{counts[entry.id]}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {tab === 'realms' && (kingdoms.length === 0
            ? <p className="list-empty">No kingdom has been founded yet.</p>
            : (
              <ul className="space-y-1">
                {kingdoms.map((kingdom) => (
                  <li key={kingdom.id}>
                    <div className="list-row list-row-static">
                      <i className="list-swatch" style={{ background: kingdom.color }} />
                      <span className="list-name">{kingdom.name}</span>
                      <span className="list-meta">
                        {kingdom.population} souls · {kingdom.villages} towns · {kingdom.territory} tiles
                        {kingdom.atWarWith.length > 0 && (
                          <span className="text-rose-300"> · at war</span>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'villages' && (villages.length === 0
            ? <p className="list-empty">Nowhere is settled yet. Put three of one race on good ground.</p>
            : (
              <ul className="space-y-1">
                {villages.map((village) => (
                  <li key={village.id}>
                    <button
                      type="button"
                      className="list-row"
                      title="Show me"
                      onClick={() => { focusTile(village.x, village.y); onClose(); }}
                    >
                      <i className="list-swatch" style={{ background: village.color }} />
                      <span className="list-name">
                        {village.name}
                        {village.capital && <Crown size={10} className="ml-1 inline text-amber-300" />}
                      </span>
                      <span className="list-meta">
                        {village.secedesIn !== null && (
                          <span className="text-rose-300">
                            secedes in {Math.ceil(village.secedesIn)}s ·{' '}
                          </span>
                        )}
                        {village.loyalty !== null && (
                          <span className={village.loyalty < 0 ? 'text-rose-300' : 'text-muted-foreground'}>
                            loyalty {village.loyalty > 0 ? '+' : ''}{village.loyalty} ·{' '}
                          </span>
                        )}
                        {village.kingdomName} · {village.population} living ·{' '}
                        {village.territory} tiles
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'plots' && (plots.length === 0
            ? (
              <p className="list-empty">
                Nobody is scheming. Give somebody a reason.
              </p>
            )
            : (
              <ul className="space-y-1.5">
                {plots.map((plot) => (
                  <li key={plot.id}>
                    <button
                      type="button"
                      className="plot-row"
                      title={plot.description}
                      onClick={() => { focusTile(plot.x, plot.y); onClose(); }}
                    >
                      <span className="plot-glyph" aria-hidden>{plot.glyph}</span>
                      <span className="min-w-0 flex-1">
                        <span className="plot-head">
                          <b>{plot.plotterName}</b> — {plot.label}
                          {plot.targetName ? ` against ${plot.targetName}` : ` in ${plot.subjectName}`}
                        </span>
                        {/* A bar, not a percentage: how close it is matters more
                            than the number, and the player is deciding whether
                            there is time to intervene. */}
                        <span className="plot-track">
                          <i
                            className={plot.hostile ? 'is-hostile' : 'is-benign'}
                            style={{ width: `${Math.max(3, plot.share * 100)}%` }}
                          />
                        </span>
                        <span className="plot-meta">
                          {Math.round(plot.share * 100)}% · planning for{' '}
                          {Math.round(plot.age)}s
                          {plot.conspirators > 1 && ` · ${plot.conspirators} involved`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'wars' && (opinions.length === 0
            ? (
              <p className="list-empty">
                {wars.length === 0
                  ? 'Nobody has a neighbour to have an opinion about yet.'
                  : 'Two realms are fighting, but their borders have not been surveyed yet.'}
              </p>
            )
            : (
              <ul className="space-y-1.5">
                {opinions.map((pair) => (
                  <li key={`${pair.a}|${pair.b}`} className="plot-row">
                    <span className="min-w-0 flex-1">
                      <span className="plot-head flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <i className="list-swatch" style={{ background: pair.colorA }} />
                        {pair.a}
                        {pair.atWar
                          ? <Swords size={11} className="text-rose-400" />
                          : pair.allied
                            ? <span className="text-emerald-300 text-[0.62rem]">allied</span>
                            : <span className="text-muted-foreground">·</span>}
                        {pair.b}
                        <i className="list-swatch" style={{ background: pair.colorB }} />
                        <b className={`ml-auto shrink-0 tabular-nums ${
                          pair.score >= 20 ? 'text-emerald-300'
                            : pair.score >= -20 ? 'text-amber-300' : 'text-rose-400'
                        }`}>
                          {pair.score > 0 ? '+' : ''}{pair.score}
                        </b>
                      </span>
                      {/* The reasons, not just the number. Same discipline as
                          the loyalty breakdown: a war nobody can account for
                          is indistinguishable from a bug. */}
                      <ul className="mt-1 space-y-0.5">
                        {pair.factors.slice(0, 4).map((factor) => (
                          <li
                            key={factor.label}
                            className="flex items-baseline gap-2 text-[0.66rem]"
                          >
                            <span className="flex-1 min-w-0 truncate text-muted-foreground">
                              {factor.label}
                            </span>
                            <span className={`font-semibold tabular-nums ${
                              factor.value > 0 ? 'text-emerald-300' : 'text-rose-400'
                            }`}>
                              {factor.value > 0 ? '+' : ''}{factor.value}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </span>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </div>
    </div>
  );
};

export default ListWindow;
