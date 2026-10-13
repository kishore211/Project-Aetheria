import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HeartHandshake, Handshake, Home, MapPin, Megaphone, Shield, Sword, Swords, Unlink, Users, X } from 'lucide-react';
import { worldAccess } from '../../utils/worldAccess';
import { useGameStore, type KingdomSummary } from '../../store/gameStore';
import Banner from './Banner';

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
  <div className="unit-stat" title={label}>
    {icon}
    <span>{value}</span>
  </div>
);

/**
 * The kingdom window, in the same frame as units and towns: its banner, its
 * crown and seat, its strength, and who it is fighting or sworn to. Reads the
 * live summary from the store by id, so it updates as the realm does.
 */
const KingdomWindow = ({ id, onClose }: { id: string; onClose: () => void }) => {
  const kingdom = useGameStore((state) => state.kingdoms.find((k) => k.id === id)) as KingdomSummary | undefined;
  const focusTile = useGameStore((state) => state.focusTile);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A realm that falls while its window is open simply closes it.
  useEffect(() => {
    if (!kingdom) onClose();
  }, [kingdom, onClose]);
  if (!kingdom) return null;

  return createPortal(
    <div className="unit-window-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="unit-window" role="dialog" aria-label={kingdom.name}>
        <div className="unit-window-title">
          <h2>{kingdom.name}</h2>
        </div>
        <button type="button" className="unit-window-close" onClick={onClose} title="Close (Esc)">
          <X size={18} strokeWidth={3} />
        </button>

        <div className="unit-window-top">
          <div className="unit-portrait">
            <Banner id={kingdom.id} color={kingdom.color} race={kingdom.race} height={72} />
          </div>
          <dl className="unit-facts city-head">
            <dt>People</dt>
            <dd>{kingdom.race}</dd>
            <dt>Ruler</dt>
            <dd>{kingdom.ruler ?? 'nobody yet'}</dd>
            {kingdom.capital && (<><dt>Seat</dt><dd>{kingdom.capital.name}</dd></>)}
            {kingdom.relic && (<><dt>Relic</dt><dd className="text-amber-200"><Sword size={11} className="inline" /> {kingdom.relic}</dd></>)}
          </dl>
        </div>

        <div className="unit-stats">
          <Stat icon={<Users size={13} />} label="Population" value={kingdom.population} />
          <Stat icon={<Home size={13} />} label="Villages" value={kingdom.villages} />
          <Stat icon={<MapPin size={13} />} label="Tiles" value={kingdom.territory} />
          <Stat icon={<Shield size={13} />} label="Under arms" value={kingdom.army ?? 0} />
          <Stat icon={<Sword size={13} />} label="With blades" value={kingdom.armed ?? 0} />
        </div>

        <div className="unit-section">
          <h4><Swords size={11} className="inline" /> Wars</h4>
          {kingdom.atWarWith.length > 0
            ? <ul className="unit-status">{kingdom.atWarWith.map((name) => <li key={name} className="is-war">{name}</li>)}</ul>
            : <p className="unit-line">At peace with everyone, for now.</p>}
        </div>
        <div className="unit-section">
          <h4><Handshake size={11} className="inline" /> Allies</h4>
          {(kingdom.allies?.length ?? 0) > 0
            ? <ul className="unit-status">{kingdom.allies!.map((name) => <li key={name} className="is-ally">{name}</li>)}</ul>
            : <p className="unit-line">Nobody has sworn to them.</p>}
        </div>

        {kingdom.capital && (
          <div className="unit-actions kingdom-acts">
            {([
              ['whisper', 'Whisper of war: set it on the neighbour it resents most', Swords],
              ['friendship', 'Friendship: end its wars and calm every grudge', Handshake],
              ['unity', 'Unity: ally it with its nearest neighbour', HeartHandshake],
              ['discord', 'Discord: break its alliances', Unlink],
              ['spite', 'Spite: make every realm resent it', Megaphone],
            ] as const).map(([act, title, Icon]) => (
              <button
                key={act}
                type="button"
                title={title}
                onClick={() => worldAccess.current?.intervene?.(act, kingdom.capital!.x, kingdom.capital!.y)}
              >
                <Icon size={18} />
              </button>
            ))}
          </div>
        )}

        <div className="unit-actions">
          {kingdom.capital && (
            <button
              type="button"
              title="Fly to the capital"
              onClick={() => { focusTile(kingdom.capital!.x, kingdom.capital!.y); onClose(); }}
            >
              <MapPin size={18} />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default KingdomWindow;
