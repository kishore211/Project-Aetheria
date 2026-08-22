import { useEffect, useState } from 'react';
import { BarChart3, Skull, Sprout, X } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { useTweenedNumber } from '../../hooks/useTweenedNumber';
import {
  DEATH_CAUSES,
  DEATH_LABELS,
  readStats,
  type WorldStats,
} from '../../utils/worldStats';

/**
 * What kind of world you have been running.
 *
 * The chronicle tells you what just happened; this tells you the shape of the
 * whole thing — whether the population is climbing or has been flat for
 * decades, and whether your creatures are dying of old age or of each other.
 * Everything here was already being produced by the simulation and thrown away.
 */

/** Rough years, at four days a season and four seasons a year. */
const asYears = (seconds: number): number => Math.floor(seconds / 42 / 16) + 1;

const Sparkline = ({ values }: { values: number[] }) => {
  if (values.length < 2) {
    return (
      <div className="stats-spark-empty">
        Not enough history yet — let the world run.
      </div>
    );
  }

  const peak = Math.max(...values, 1);
  const width = 100;
  const height = 30;
  const step = width / (values.length - 1);

  const points = values
    .map((value, index) => `${(index * step).toFixed(2)},${(height - (value / peak) * height).toFixed(2)}`)
    .join(' ');

  return (
    <svg className="stats-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {/* Filled area first, so the stroke sits crisply on top of it */}
      <polygon points={`0,${height} ${points} ${width},${height}`} fill="rgb(52 211 153 / 0.18)" />
      <polyline points={points} fill="none" stroke="rgb(52 211 153)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const StatsPanel = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const population = useGameStore((state) => state.population);
  const kingdoms = useGameStore((state) => state.kingdoms);
  const [stats, setStats] = useState<WorldStats | null>(null);
  const shownPopulation = useTweenedNumber(population);

  // Polled rather than pushed. These numbers change constantly and nothing here
  // needs to be frame-accurate; twice a second reads as live and costs nothing.
  useEffect(() => {
    if (!open) return;
    setStats(readStats());
    const timer = window.setInterval(() => setStats(readStats()), 500);
    return () => window.clearInterval(timer);
  }, [open]);

  if (!open || !stats) return null;

  const worstCause = DEATH_CAUSES
    .filter((cause) => stats.deathsByCause[cause] > 0)
    .sort((a, b) => stats.deathsByCause[b] - stats.deathsByCause[a])[0];

  const totalTiles = kingdoms.reduce((sum, kingdom) => sum + kingdom.territory, 0);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="ui-modal w-full max-w-lg max-h-[88vh] overflow-y-auto bg-secondary rounded-xl shadow-2xl border border-muted/50 p-5 text-foreground">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <BarChart3 size={18} className="text-sky-300" />
            The World So Far
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className="stats-tile">
            <span className="stats-tile-value">{shownPopulation}</span>
            <span className="stats-tile-label">alive now</span>
          </div>
          <div className="stats-tile">
            <span className="stats-tile-value">{stats.peakPopulation}</span>
            <span className="stats-tile-label">most ever</span>
          </div>
          <div className="stats-tile">
            <span className="stats-tile-value">{stats.births}</span>
            <span className="stats-tile-label">born</span>
          </div>
          <div className="stats-tile">
            <span className="stats-tile-value">{stats.deaths}</span>
            <span className="stats-tile-label">died</span>
          </div>
        </div>

        <h3 className="stats-heading">
          <Sprout size={13} className="text-emerald-300" />
          Population
        </h3>
        <Sparkline values={stats.populationHistory} />
        <p className="stats-note">
          Roughly year {asYears(stats.age)}
          {stats.peakPopulation > 0 && population < stats.peakPopulation * 0.6
            && ' — well below its high water mark'}
          {population > 0 && population >= stats.peakPopulation && ' — and still climbing'}
        </p>

        <h3 className="stats-heading mt-4">
          <Skull size={13} className="text-red-300" />
          How they went
        </h3>
        {stats.deaths === 0 ? (
          <p className="stats-note">Nothing has died yet. Enjoy it.</p>
        ) : (
          <ul className="space-y-1">
            {DEATH_CAUSES.filter((cause) => stats.deathsByCause[cause] > 0).map((cause) => {
              const count = stats.deathsByCause[cause];
              const share = count / stats.deaths;
              return (
                <li key={cause} className="stats-bar-row">
                  <span className="stats-bar-label">{DEATH_LABELS[cause]}</span>
                  <span className="stats-bar-track">
                    <span className="stats-bar-fill" style={{ width: `${Math.max(2, share * 100)}%` }} />
                  </span>
                  <span className="stats-bar-count">{count}</span>
                </li>
              );
            })}
          </ul>
        )}
        {worstCause && (
          <p className="stats-note">
            Mostly {DEATH_LABELS[worstCause].toLowerCase()}.
          </p>
        )}

        {kingdoms.length > 0 && (
          <>
            <h3 className="stats-heading mt-4">Realms</h3>
            <ul className="space-y-1">
              {kingdoms.map((kingdom) => (
                <li key={kingdom.id} className="stats-bar-row">
                  <span className="stats-bar-label flex items-center gap-1.5">
                    <i className="stats-swatch" style={{ background: kingdom.color }} />
                    {kingdom.name}
                  </span>
                  <span className="stats-bar-track">
                    <span
                      className="stats-bar-fill"
                      style={{
                        width: `${Math.max(2, (kingdom.territory / Math.max(1, totalTiles)) * 100)}%`,
                        background: kingdom.color,
                      }}
                    />
                  </span>
                  <span className="stats-bar-count">{kingdom.territory}</span>
                </li>
              ))}
            </ul>
            <p className="stats-note">Bars are share of all claimed land, not of the map.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default StatsPanel;
