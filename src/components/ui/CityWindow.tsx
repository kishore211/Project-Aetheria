import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { Coins, Crown, Hammer, Home, MapPin, Mountain, Trees, Wheat, X } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { worldAccess } from '../../utils/worldAccess';
import { CULTURE_TRAITS, type CultureTraitId } from '../../utils/identity';

/** A banner in the realm's colour, standing in for the town's portrait. */
const Banner = ({ color }: { color: string }) => (
  <svg viewBox="0 0 12 14" className="city-banner" shapeRendering="crispEdges" aria-hidden>
    <rect x="1" y="0" width="1" height="14" fill="#5e3b1f" />
    <rect x="2" y="1" width="9" height="8" fill={color} />
    <rect x="2" y="9" width="3" height="2" fill={color} />
    <rect x="8" y="9" width="3" height="2" fill={color} />
    <rect x="2" y="1" width="9" height="1" fill="#ffffff" opacity="0.25" />
    <rect x="5" y="3" width="3" height="3" fill="#ffffff" opacity="0.7" />
  </svg>
);

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
  <div className="unit-stat" title={label}>
    {icon}
    <span>{value}</span>
  </div>
);

/**
 * The town window. WorldBox opens a village in the middle of the screen, the
 * same frame as a unit: its banner, where it belongs, what it holds and who
 * rules it. Clicking a plain tile still opens the small side panel.
 */
const CityWindow = () => {
  const selectedTile = useGameStore((state) => state.selectedTile);
  const selectedEntity = useGameStore((state) => state.selectedEntity);
  const setSelectedTile = useGameStore((state) => state.setSelectedTile);
  const focusTile = useGameStore((state) => state.focusTile);
  const [, tick] = useState(0);

  const village = selectedTile && !selectedEntity
    ? worldAccess.current?.villageInfo(selectedTile.x, selectedTile.y) ?? null
    : null;

  const open = village !== null;
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => tick((n) => n + 1), 500);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedTile(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setSelectedTile]);

  if (!selectedTile || !village) return null;
  const close = () => setSelectedTile(null);
  const loyaltyTone = village.loyalty === null ? '' : village.loyalty >= 40 ? 'is-good' : village.loyalty >= 0 ? 'is-mid' : 'is-bad';

  // Portalled out of the HUD layer, so it sits above the speech bubbles and
  // numbers floating over the map rather than under them.
  return createPortal(
    <div className="unit-window-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="unit-window" role="dialog" aria-label={village.name}>
        <div className="unit-window-title">
          <h2>{village.name}</h2>
        </div>
        <button type="button" className="unit-window-close" onClick={close} title="Close (Esc)">
          <X size={18} strokeWidth={3} />
        </button>

        <div className="unit-window-top">
          <div className="unit-portrait">
            <Banner color={village.kingdomColor} />
          </div>
          <dl className="unit-facts city-head">
            <dt>Realm</dt>
            <dd style={{ color: village.kingdomColor }}>{village.kingdomName}</dd>
            <dt>People</dt>
            <dd>{village.race}</dd>
            {village.capital && (<><dt>Seat</dt><dd><Crown size={11} className="inline" /> capital</dd></>)}
            {village.ruler && (<><dt>Ruler</dt><dd>{village.ruler}</dd></>)}
          </dl>
        </div>

        <div className="unit-stats">
          <Stat icon={<Home size={13} />} label="Buildings" value={village.buildings} />
          <Stat icon={<MapPin size={13} />} label="Tiles claimed" value={village.territory} />
          <Stat icon={<Wheat size={13} />} label="Food" value={village.store.food} />
          <Stat icon={<Trees size={13} />} label="Wood" value={village.store.wood} />
          <Stat icon={<Mountain size={13} />} label="Stone" value={village.store.stone} />
        </div>

        <dl className="unit-facts">
          <dt><Coins size={11} className="inline" /> Treasury</dt>
          <dd>{Math.round(village.store.gold)} gold</dd>
          {village.identity.culture && (<><dt>Culture</dt><dd style={{ color: village.identity.cultureColor ?? undefined }}>{village.identity.culture}</dd></>)}
          {village.identity.language && (<><dt>Language</dt><dd>{village.identity.language}</dd></>)}
          {village.identity.religion && (<><dt>Faith</dt><dd>{village.identity.religion}</dd></>)}
          {village.rulerStats && (
            <>
              <dt><Hammer size={11} className="inline" /> Ruler</dt>
              <dd>dip {village.rulerStats.diplomacy} · stew {village.rulerStats.stewardship} · war {village.rulerStats.warfare}</dd>
            </>
          )}
        </dl>

        {village.identity.cultureTraits.length > 0 && (
          <ul className="unit-status">
            {village.identity.cultureTraits.map((trait) => (
              <li key={trait} title={CULTURE_TRAITS[trait as CultureTraitId]?.description}>
                {CULTURE_TRAITS[trait as CultureTraitId]?.label ?? trait}
              </li>
            ))}
          </ul>
        )}

        {village.loyalty !== null && (
          <div className="unit-section">
            <div className="city-loyalty">
              <h4>Loyalty</h4>
              <span className={`city-loyalty-value ${loyaltyTone}`}>
                {village.loyalty > 0 ? '+' : ''}{village.loyalty}
              </span>
            </div>
            {village.secedesIn !== null && (
              <p className="city-warning">Secedes in {Math.ceil(village.secedesIn)}s unless something changes.</p>
            )}
            <ul className="city-factors">
              {village.loyaltyFactors.slice(0, 6).map((factor) => (
                <li key={factor.label}>
                  <span>{factor.label}</span>
                  <b className={factor.value > 0 ? 'is-good' : 'is-bad'}>{factor.value > 0 ? '+' : ''}{factor.value}</b>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="unit-actions">
          <button
            type="button"
            className="unit-action"
            title="Centre the camera here"
            onClick={() => focusTile(selectedTile.x, selectedTile.y)}
          >
            <MapPin size={18} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CityWindow;
