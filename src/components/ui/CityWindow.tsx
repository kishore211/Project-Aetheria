import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { Coins, Crown, Gem, Hammer, Home, MapPin, Mountain, Pickaxe, Trees, Users, Wheat, X } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { worldAccess } from '../../utils/worldAccess';
import { CULTURE_TRAITS, type CultureTraitId } from '../../utils/identity';
import Banner from './Banner';

/** What each trade is called on the town's roll. */
const TRADE_LABEL: Record<string, string> = {
  farmer: 'farmers', woodcutter: 'woodcutters', miner: 'miners', builder: 'builders',
  gatherer: 'gatherers', warrior: 'warriors', trader: 'traders', young: 'children', idle: 'idle',
};

/** One decimal place: wages come in halves, so whole numbers would hide them. */
const coin = (amount: number) => (Math.round(amount * 10) / 10).toString();

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
            <Banner id={village.kingdomId} color={village.kingdomColor} race={village.race} height={72} />
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
        <div className="unit-stats">
          <Stat icon={<Users size={13} />} label="People" value={village.population} />
          <Stat icon={<Pickaxe size={13} />} label="Metal from the mines" value={village.store.metal ?? 0} />
          <Stat icon={<Gem size={13} />} label="Gems" value={village.store.gems ?? 0} />
          {(village.store.mithril ?? 0) > 0 && <Stat icon={<span className="ore-dot ore-mithril" />} label="Mithril" value={village.store.mithril} />}
          {(village.store.adamantine ?? 0) > 0 && <Stat icon={<span className="ore-dot ore-adamantine" />} label="Adamantine" value={village.store.adamantine} />}
        </div>

        <div className="unit-section">
          <h4>At work</h4>
          <ul className="unit-status city-jobs">
            {Object.entries(village.jobs)
              .sort((a, b) => b[1] - a[1])
              .map(([trade, count]) => <li key={trade}>{count} {TRADE_LABEL[trade] ?? trade}</li>)}
          </ul>
        </div>

        <div className="unit-section city-treasury">
          <h4><Coins size={11} className="inline" /> Treasury</h4>
          <dl className="unit-facts">
            <dt>Gold in the chest</dt>
            <dd>{Math.round(village.store.gold)}</dd>
            <dt>Wages, last minute</dt>
            <dd>{coin(village.treasury.wages)}</dd>
            <dt>Spent at market</dt>
            <dd title={`${Math.round(village.treasury.bought.wood)} wood, ${Math.round(village.treasury.bought.stone)} stone, ${Math.round(village.treasury.bought.food)} food`}>
              {coin(village.treasury.purchases)}
            </dd>
            {village.treasury.festivals > 0 && (<><dt>Festivals, last minute</dt><dd>{coin(village.treasury.festivals)}</dd></>)}
            <dt>Income, last minute</dt>
            <dd className="is-good">+{coin(village.treasury.income)}</dd>
          </dl>
          {village.treasury.unpaidSoldiers > 0 && (
            <p className="city-warning">{village.treasury.unpaidSoldiers} {village.treasury.unpaidSoldiers === 1 ? 'soldier is' : 'soldiers are'} unpaid.</p>
          )}
        </div>

        <dl className="unit-facts">
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
