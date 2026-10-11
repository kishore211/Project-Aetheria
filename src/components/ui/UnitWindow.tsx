import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import { Brain, Eye, EyeOff, Footprints, Heart, MapPin, PawPrint, Shield, Skull, Sword, X } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import type { Entity } from '../../types/world';
import { moodFace } from '../../utils/mood';
import { statusDef } from '../../utils/statusEffects';
import { describeCreature } from '../../utils/subspecies';
import { describeSize, sizeOf } from '../../utils/size';
import { creatureLine } from '../../utils/flavour';
import { worldAccess } from '../../utils/worldAccess';
import { levelOf, outfitOf } from '../../utils/entitySystemMinimal';
import { gearLook, getPixelSpriteFrames } from '../../utils/pixelSprites';
import { FavouriteStar, GearList, MindEditor, NeedBar, TraitChips } from './InfoPanel';

/** The creature as it actually looks — its colouring, office and gear — drawn once per look. */
const portraits = new Map<string, string>();
const portraitFor = (entity: Entity): string => {
  const frames = getPixelSpriteFrames(entity.type, entity.subspecies, outfitOf(entity), gearLook(entity.equipment));
  const image = frames[0]?.image as HTMLCanvasElement | undefined;
  if (!image) return '';
  const key = `${entity.type}|${entity.subspecies ?? ''}|${frames[0].uuid}`;
  const hit = portraits.get(key);
  if (hit !== undefined) return hit;
  let url = '';
  try {
    url = image.toDataURL?.() ?? '';
  } catch {
    url = '';
  }
  portraits.set(key, url);
  return url;
};

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
  <div className="unit-stat" title={label}>
    {icon}
    <span>{value}</span>
  </div>
);

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </>
);

/**
 * The unit window: WorldBox opens a creature in the middle of the screen, a
 * framed card with its portrait, its traits and gear, a health bar with its
 * level, the numbers that matter, and the buttons to follow or favour it.
 * The creature object is live, so the window redraws a few times a second
 * rather than waiting for the store to change.
 */
const UnitWindow = () => {
  const entity = useGameStore((state) => state.selectedEntity);
  const setSelectedEntity = useGameStore((state) => state.setSelectedEntity);
  const followEntityId = useGameStore((state) => state.followEntityId);
  const setFollowEntity = useGameStore((state) => state.setFollowEntity);
  const focusTile = useGameStore((state) => state.focusTile);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!entity) return;
    const timer = window.setInterval(() => tick((n) => n + 1), 250);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedEntity(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [entity, setSelectedEntity]);

  const children = useMemo(
    () => (entity ? (worldAccess.current?.entities() ?? []).filter((e) => e.parentIds?.includes(entity.id)).length : 0),
    // Recounted when the window opens on someone new; births mid-view are rare enough.
    [entity],
  );

  if (!entity) return null;

  const close = () => setSelectedEntity(null);
  const following = followEntityId === entity.id;
  const level = levelOf(entity);
  const herd = worldAccess.current?.herdInfo(entity) ?? null;
  const place = worldAccess.current?.villageInfo(Math.floor(entity.position.x), Math.floor(entity.position.y)) ?? null;
  const face = entity.happiness !== undefined ? moodFace(entity.happiness) : null;
  const line = creatureLine(entity.type, entity.id);
  const parents = (entity.parentIds ?? [])
    .map((id) => worldAccess.current?.entities().find((e) => e.id === id)?.name)
    .filter(Boolean);
  const health = Math.max(0, entity.health / Math.max(1, entity.maxHealth));

  // Portalled out of the HUD layer, so it sits above the speech bubbles and
  // numbers floating over the map rather than under them.
  return createPortal(
    <div className="unit-window-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="unit-window" role="dialog" aria-label={entity.name}>
        <div className="unit-window-title">
          <h2>{entity.name}</h2>
        </div>
        <button type="button" className="unit-window-close" onClick={close} title="Close (Esc)">
          <X size={18} strokeWidth={3} />
        </button>

        <div className="unit-window-top">
          <div className="unit-portrait">
            <img src={portraitFor(entity)} alt="" />
            {face && <span className="unit-portrait-mood" title={face.label}>{face.glyph}</span>}
          </div>
          <div className="unit-window-who">
            <p className="unit-kind">
              {describeSize(sizeOf(entity))} {describeCreature(entity.type, entity.subspecies)}
              {entity.uplifted ? ' · uplifted' : ''}
            </p>
            {line && <p className="unit-line">{line}</p>}
            {(entity.traits?.length ?? 0) > 0 && <TraitChips traits={entity.traits ?? []} />}
          </div>
        </div>

        <div className="unit-health" title={`Health ${Math.round(entity.health)}/${Math.round(entity.maxHealth)}`}>
          <Heart size={14} className="text-rose-400" fill="currentColor" />
          <div className="unit-health-track">
            <div className="unit-health-fill" style={{ width: `${health * 100}%` }} />
            <span>{Math.round(entity.health)}/{Math.round(entity.maxHealth)}</span>
          </div>
          <span className="unit-level" title="Level: veterans hit harder, +6% a level">{level}</span>
        </div>

        <div className="unit-stats">
          <Stat icon={<Sword size={13} />} label="Strength" value={entity.attributes.strength} />
          <Stat icon={<Footprints size={13} />} label="Speed" value={entity.attributes.speed} />
          <Stat icon={<Brain size={13} />} label="Intellect" value={entity.attributes.intelligence} />
          <Stat icon={<Shield size={13} />} label="Resilience" value={entity.attributes.resilience} />
          <Stat icon={<Skull size={13} />} label="Kills" value={entity.kills ?? 0} />
        </div>

        <dl className="unit-facts">
          <Row label="Age">{Math.round(entity.age)} / {Math.round(entity.maxAge)}</Row>
          <Row label="Doing">{(entity.activity ?? 'idle').replace(/_/g, ' ')}</Row>
          {face && <Row label="Mood">{face.label}</Row>}
          {entity.job && <Row label="Job">{entity.job}</Row>}
          {entity.clan && <Row label="Clan">{entity.clan}</Row>}
          {place && <Row label="Realm"><span style={{ color: place.kingdomColor }}>{place.kingdomName}</span></Row>}
          {place && <Row label="Town">{place.name}</Row>}
          {children > 0 && <Row label="Children">{children}</Row>}
          {parents.length > 0 && <Row label="Parents">{parents.join(', ')}</Row>}
          {herd && <Row label="Herd"><PawPrint size={10} className="inline" /> {herd.isAlpha ? 'leads' : 'in'} {herd.size}</Row>}
          {entity.carrying && <Row label="Carrying">{entity.carrying.quantity} {entity.carrying.type}</Row>}
        </dl>

        <div className="unit-needs">
          <NeedBar label="Hunger" value={entity.needs.hunger} tone="bg-amber-500" />
          <NeedBar label="Thirst" value={entity.needs.thirst} tone="bg-blue-500" />
          <NeedBar label="Rest" value={entity.needs.rest} tone="bg-purple-500" />
        </div>

        {(entity.equipment?.weapon || entity.equipment?.armor) && (
          <div className="unit-section">
            <h4>Gear</h4>
            <GearList equipment={entity.equipment} />
          </div>
        )}

        {entity.status.length > 0 && (
          <ul className="unit-status">
            {entity.status.map((status) => {
              const def = statusDef(status);
              return (
                <li key={status} title={def?.flavour}>
                  {def && <span aria-hidden>{def.glyph}</span>}
                  {def?.label ?? status.replace(/_/g, ' ')}
                </li>
              );
            })}
          </ul>
        )}

        <div className="unit-section">
          <MindEditor entityId={entity.id} />
        </div>

        <div className="unit-actions">
          <button
            type="button"
            className={`unit-action ${following ? 'is-on' : ''}`}
            title={following ? 'Stop following' : 'Follow with the camera'}
            onClick={() => setFollowEntity(following ? null : entity.id)}
          >
            {following ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          <FavouriteStar entityId={entity.id} />
          <button
            type="button"
            className="unit-action"
            title="Centre the camera here"
            onClick={() => focusTile(Math.floor(entity.position.x), Math.floor(entity.position.y))}
          >
            <MapPin size={18} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default UnitWindow;
