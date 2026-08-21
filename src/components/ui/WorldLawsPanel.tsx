import { Scale, X } from 'lucide-react';
import { useGameStore, type WorldLaws } from '../../store/gameStore';

const LAWS: Array<{ key: keyof WorldLaws; label: string; description: string }> = [
  { key: 'aging', label: 'Old age', description: 'Creatures grow old and die.' },
  { key: 'hunger', label: 'Hunger & thirst', description: 'Needs drain and starvation kills.' },
  { key: 'reproduction', label: 'Reproduction', description: 'Creatures breed and pass on traits.' },
  { key: 'fireSpread', label: 'Fire spread', description: 'Flames jump to neighbouring tiles.' },
  { key: 'biomeGrowth', label: 'Biome growth', description: 'Forests creep, corruption spreads, scars heal.' },
  { key: 'settlements', label: 'Settlements', description: 'Races found villages and build.' },
  { key: 'warfare', label: 'Warfare', description: 'Kingdoms build tension, declare war and raid.' },
  { key: 'disasters', label: 'Natural disasters', description: 'The world may strike on its own.' },
];

/** The sandbox switchboard: turn any simulation rule off and watch what changes. */
const WorldLawsPanel = () => {
  const showLaws = useGameStore((state) => state.showLaws);
  const setShowLaws = useGameStore((state) => state.setShowLaws);
  const worldLaws = useGameStore((state) => state.worldLaws);
  const toggleWorldLaw = useGameStore((state) => state.toggleWorldLaw);

  if (!showLaws) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="ui-modal w-full max-w-md bg-secondary rounded-xl shadow-2xl border border-muted/50 p-5 text-foreground">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Scale size={18} className="text-amber-300" />
            World Laws
          </h2>
          <button type="button" onClick={() => setShowLaws(false)} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          Rewrite the rules of your world. Changes take effect immediately.
        </p>

        <ul className="space-y-2">
          {LAWS.map((law) => {
            const enabled = worldLaws[law.key];
            return (
              <li key={law.key}>
                <button
                  type="button"
                  onClick={() => toggleWorldLaw(law.key)}
                  className={`tool-btn w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg border ${
                    enabled
                      ? 'bg-accent/15 border-accent/50'
                      : 'bg-background/40 border-muted/40'
                  }`}
                >
                  <span
                    className={`shrink-0 w-9 h-5 rounded-full relative transition-colors ${
                      enabled ? 'bg-accent' : 'bg-muted'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                        enabled ? 'left-4' : 'left-0.5'
                      }`}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{law.label}</span>
                    <span className="block text-xs text-muted-foreground">{law.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default WorldLawsPanel;
