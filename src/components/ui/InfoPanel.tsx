import { Crown, Eye, EyeOff, MapPin, PawPrint, Shield, Skull, Sword, X } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import type { Entity, Resource, TraitId } from '../../types/world';
import { TRAITS } from '../../utils/traits';
import { MOOD_MAX, MOOD_MIN, moodFace } from '../../utils/mood';
import { statusDef } from '../../utils/statusEffects';
import { BIOME_STEPS, groundSpeed } from '../../utils/biomeEffects';
import { describeCreature } from '../../utils/subspecies';
import { describeSize, sizeOf } from '../../utils/size';
import { biomeLine, creatureLine } from '../../utils/flavour';
import { CULTURE_TRAITS, type CultureTraitId } from '../../utils/identity';
import { worldAccess } from '../../utils/worldAccess';
import { describeItem, MATERIAL_COLOR, type Equipment, type Item } from '../../utils/equipment';

const NeedBar = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
  <div>
    <div className="flex justify-between text-xs text-muted-foreground">
      <span>{label}</span>
      <span>{Math.round(value * 100)}%</span>
    </div>
    <div className="w-full mt-0.5 bg-background rounded-full h-1.5">
      <div className={`${tone} h-1.5 rounded-full transition-all`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  </div>
);

const QUALITY_TONE: Record<Item['quality'], string> = {
  normal: 'text-foreground',
  fine: 'text-sky-300',
  masterwork: 'text-violet-300',
  legendary: 'text-amber-300',
};

/** Weapon and armour, with the item's own history on hover. */
const GearList = ({ equipment }: { equipment: Equipment }) => (
  <ul className="space-y-1 text-xs">
    {[equipment.weapon, equipment.armor].map((item) => {
      if (!item) return null;
      const history = [
        `Forged in ${item.madeIn}`,
        item.owners.length > 1 ? `held by ${item.owners.join(' → ')}` : null,
        item.kills > 0 ? `${item.kills} slain` : null,
      ].filter(Boolean).join(' · ');
      return (
        <li key={item.id} className="flex items-center gap-1.5" title={history}>
          {item.slot === 'weapon' ? <Sword size={11} /> : <Shield size={11} />}
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-xs border border-black/40"
            style={{ background: MATERIAL_COLOR[item.material] }}
          />
          <span className={`${QUALITY_TONE[item.quality]} truncate`}>{describeItem(item)}</span>
          <span className="ml-auto text-muted-foreground tabular-nums">{Math.max(0, Math.round(item.durability))}%</span>
        </li>
      );
    })}
  </ul>
);

const TraitChips = ({ traits }: { traits: TraitId[] }) => (
  <div className="flex flex-wrap gap-1">
    {traits.map((trait) => {
      const info = TRAITS[trait];
      if (!info) return null;
      return (
        <span
          key={trait}
          title={info.description}
          className={`text-xs px-2 py-0.5 rounded-full bg-background/70 border border-muted/50 ${info.tone}`}
        >
          {info.label}
        </span>
      );
    })}
  </div>
);

/** Tile, creature, village and kingdom inspector. */
const InfoPanel = () => {
  const {
    selectedTile,
    selectedEntity,
    showDebugInfo,
    setSelectedEntity,
    setSelectedTile,
    followEntityId,
    setFollowEntity,
    focusTile,
  } = useGameStore();

  if (!selectedTile && !selectedEntity) return null;

  const close = () => {
    setSelectedEntity(null);
    setSelectedTile(null);
  };

  const village = selectedTile
    ? worldAccess.current?.villageInfo(selectedTile.x, selectedTile.y) ?? null
    : null;

  const isFollowing = selectedEntity && followEntityId === selectedEntity.id;
  const herd = selectedEntity
    ? worldAccess.current?.herdInfo(selectedEntity) ?? null
    : null;

  return (
    <div className="ui-panel-right relative w-full max-h-[46vh] overflow-y-auto bg-secondary/95 backdrop-blur-sm border border-muted/40 p-4 rounded-md shadow-lg">
      <button
        type="button"
        onClick={close}
        title="Close"
        className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
      >
        <X size={16} />
      </button>

      {selectedEntity ? (
        <div>
          <h3 className="text-foreground font-medium text-lg mb-0.5 pr-6">{selectedEntity.name}</h3>
          <p className="text-xs text-muted-foreground capitalize mb-3">
            {/* "snow wolf" rather than "wolf": the colouring is the subspecies,
                and a name that does not say so wastes the whole system. */}
            {/* "a huge snow wolf": the colouring is the subspecies and the
                band is what it can hunt, so both belong in the name rather
                than in a stat nobody scrolls to. */}
            {describeSize(sizeOf(selectedEntity))} {describeCreature(selectedEntity.type, selectedEntity.subspecies)}
            {selectedEntity.uplifted ? ' · uplifted' : ''}
            {selectedEntity.job ? ` · ${selectedEntity.job}` : ''}
          </p>
          {/* What it would say for itself. Keyed on its id, so the same
              creature always says the same thing and two of a kind standing
              together say different things. */}
          {creatureLine(selectedEntity.type, selectedEntity.id) && (
            <p className="text-xs text-muted-foreground italic -mt-2 mb-3">
              {creatureLine(selectedEntity.type, selectedEntity.id)}
            </p>
          )}

          <div className="flex gap-2 mb-3">
            <button
              type="button"
              className={`tool-btn flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded ${
                isFollowing ? 'bg-accent text-accent-foreground' : 'bg-muted/60 hover:bg-muted'
              }`}
              onClick={() => setFollowEntity(isFollowing ? null : selectedEntity.id)}
            >
              {isFollowing ? <EyeOff size={13} /> : <Eye size={13} />}
              {isFollowing ? 'Stop following' : 'Follow'}
            </button>
            <button
              type="button"
              title="Centre the camera here"
              className="tool-btn px-2 py-1.5 rounded bg-muted/60 hover:bg-muted"
              onClick={() => focusTile(Math.floor(selectedEntity.position.x), Math.floor(selectedEntity.position.y))}
            >
              <MapPin size={13} />
            </button>
          </div>

          <div className="space-y-2.5 text-sm">
            <NeedBar
              label={`Health ${Math.round(selectedEntity.health)}/${Math.round(selectedEntity.maxHealth)}`}
              value={selectedEntity.health / selectedEntity.maxHealth}
              tone="bg-red-500"
            />

            {selectedEntity.happiness !== undefined && (() => {
              const face = moodFace(selectedEntity.happiness);
              const share = (selectedEntity.happiness - MOOD_MIN) / (MOOD_MAX - MOOD_MIN);
              return (
                <div className="mood-row">
                  <span className="mood-face" title={`Happiness ${Math.round(selectedEntity.happiness!)}`}>
                    {face.glyph}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="mood-label">{face.label}</span>
                    {/* Centre-anchored, because the meaningful reading is which
                        side of neutral it sits on and by how far — a bar that
                        fills from the left makes -100 and 0 look like the same
                        kind of thing. */}
                    <span className="mood-track">
                      <i className="mood-zero" />
                      <i
                        className={`mood-fill ${selectedEntity.happiness! >= 0 ? 'is-good' : 'is-bad'}`}
                        style={{
                          left: `${Math.min(50, share * 100)}%`,
                          width: `${Math.abs(share - 0.5) * 100}%`,
                        }}
                      />
                    </span>
                  </span>
                </div>
              );
            })()}

            {herd && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <PawPrint size={11} />
                {herd.isAlpha ? 'Leads' : 'Travels with'} a herd of {herd.size}
              </p>
            )}

            <div className="text-xs text-muted-foreground">
              Age {Math.round(selectedEntity.age)} of {Math.round(selectedEntity.maxAge)} years
              {(selectedEntity.kills ?? 0) > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-rose-300">
                  <Skull size={11} /> {selectedEntity.kills} kills
                </span>
              )}
            </div>

            {(selectedEntity.traits?.length ?? 0) > 0 && (
              <div>
                <h4 className="text-muted-foreground text-xs font-medium mb-1">Traits</h4>
                <TraitChips traits={selectedEntity.traits ?? []} />
              </div>
            )}

            {(selectedEntity.equipment?.weapon || selectedEntity.equipment?.armor) && (
              <div>
                <h4 className="text-muted-foreground text-xs font-medium mb-1">Gear</h4>
                <GearList equipment={selectedEntity.equipment} />
              </div>
            )}

            <div>
              <h4 className="text-muted-foreground text-xs font-medium mb-1">Attributes</h4>
              <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                <li><span className="text-muted-foreground">Strength</span> {selectedEntity.attributes.strength}</li>
                <li><span className="text-muted-foreground">Speed</span> {selectedEntity.attributes.speed}</li>
                <li><span className="text-muted-foreground">Intellect</span> {selectedEntity.attributes.intelligence}</li>
                <li><span className="text-muted-foreground">Resilience</span> {selectedEntity.attributes.resilience}</li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <NeedBar label="Hunger" value={selectedEntity.needs.hunger} tone="bg-amber-500" />
              <NeedBar label="Thirst" value={selectedEntity.needs.thirst} tone="bg-blue-500" />
              <NeedBar label="Rest" value={selectedEntity.needs.rest} tone="bg-purple-500" />
            </div>

            {selectedEntity.carrying && (
              <p className="text-xs text-muted-foreground">
                Hauling {selectedEntity.carrying.quantity} {selectedEntity.carrying.type} home
              </p>
            )}

            {selectedEntity.status.length > 0 && (
              <div>
                <h4 className="text-muted-foreground text-xs font-medium mb-1">Status</h4>
                <ul className="flex flex-wrap gap-1">
                  {selectedEntity.status.map((status: string) => {
                    const def = statusDef(status);
                    return (
                      <li
                        key={`status-${status}`}
                        // The flavour line is the payoff of the typed table:
                        // "wounded" tells you what; "Bleeding, and thinking
                        // about it" tells you what it is like.
                        title={def?.flavour}
                        className="capitalize bg-primary/20 px-2 py-0.5 rounded-full text-xs flex items-center gap-1"
                      >
                        {def && <span aria-hidden>{def.glyph}</span>}
                        {def?.label ?? status}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {selectedEntity.inventory.length > 0 && (
              <div>
                <h4 className="text-muted-foreground text-xs font-medium mb-1">Inventory</h4>
                <ul className="text-xs">
                  {selectedEntity.inventory.map((item: Resource) => (
                    <li key={`inventory-${item.type}`} className="capitalize">{item.type} ({item.quantity})</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      ) : selectedTile ? (
        <div>
          <h3 className="text-foreground font-medium text-lg mb-0.5 pr-6 capitalize">
            {selectedTile.type.replace(/_/g, ' ')}
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Tile {selectedTile.x}, {selectedTile.y} · elevation {Math.round(selectedTile.height * 100)}%
          </p>

          {village && (
            <div className="mb-3 p-2.5 rounded-lg bg-background/50 border border-muted/40">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-3 h-3 rounded-sm border border-black/30" style={{ backgroundColor: village.kingdomColor }} />
                <span className="font-medium text-sm text-foreground">{village.name}</span>
                {village.capital && (
                  <span className="text-[10px] uppercase tracking-wide text-amber-300">capital</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Crown size={11} /> {village.kingdomName}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {village.buildings} building{village.buildings === 1 ? '' : 's'} · {village.territory} tiles claimed
              </p>
              <p className="text-xs text-muted-foreground">
                Granary: {village.store.food} food · {village.store.wood} wood · {village.store.stone} stone
              </p>
              <p className="text-xs text-muted-foreground">
                Treasury: <span className="text-amber-300">{Math.round(village.store.gold)}</span> gold
              </p>
              {village.identity.culture && (
                <div className="mt-1.5 pt-1.5 border-t border-muted/30">
                  <p className="text-xs flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-sm border border-black/30 shrink-0"
                      style={{ backgroundColor: village.identity.cultureColor ?? '#64748b' }}
                    />
                    <span className="text-foreground">{village.identity.culture}</span>
                  </p>
                  {village.identity.cultureTraits.length > 0 && (
                    <ul className="flex flex-wrap gap-1 mt-1">
                      {village.identity.cultureTraits.map((trait) => (
                        <li
                          key={trait}
                          title={CULTURE_TRAITS[trait as CultureTraitId]?.description}
                          className="capitalize text-[0.62rem] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground"
                        >
                          {CULTURE_TRAITS[trait as CultureTraitId]?.label ?? trait}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[0.68rem] text-muted-foreground mt-1">
                    {village.identity.language}
                    {village.identity.religion && ` · ${village.identity.religion}`}
                  </p>
                </div>
              )}

              {village.ruler && (
                <p className="text-xs text-muted-foreground mt-1">
                  Ruled by {village.ruler}
                  {village.rulerStats && (
                    <span className="text-muted-foreground/70">
                      {' '}· dip {village.rulerStats.diplomacy} · stew {village.rulerStats.stewardship}
                      {' '}· war {village.rulerStats.warfare}
                    </span>
                  )}
                </p>
              )}

              {village.loyalty !== null && (
                <div className="mt-2 pt-2 border-t border-muted/30">
                  <div className="flex items-baseline justify-between">
                    <h5 className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      Loyalty
                    </h5>
                    <span className={`text-sm font-bold ${
                      village.loyalty >= 40 ? 'text-emerald-300'
                        : village.loyalty >= 0 ? 'text-amber-300' : 'text-rose-400'
                    }`}>
                      {village.loyalty > 0 ? '+' : ''}{village.loyalty}
                    </span>
                  </div>

                  {village.secedesIn !== null && (
                    <p className="text-[0.68rem] text-rose-300 mt-0.5">
                      Secedes in {Math.ceil(village.secedesIn)}s unless something changes.
                    </p>
                  )}

                  {/* The breakdown is the point. A number with no explanation is
                      a number the player learns to ignore, and a rebellion you
                      cannot see coming is indistinguishable from a bug. */}
                  <ul className="mt-1 space-y-0.5">
                    {village.loyaltyFactors.slice(0, 6).map((factor) => (
                      <li key={factor.label} className="flex items-baseline gap-2 text-[0.68rem]">
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
                    {village.loyaltyFactors.length > 6 && (
                      <li className="text-[0.66rem] text-muted-foreground/60">
                        and {village.loyaltyFactors.length - 6} smaller
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2.5 text-sm">
            <div>
              <h4 className="text-muted-foreground text-xs font-medium mb-1">Resources</h4>
              {selectedTile.resources.length > 0 ? (
                <ul className="flex flex-wrap gap-1">
                  {selectedTile.resources.map((resource: Resource) => (
                    <li key={`resource-${resource.type}`} className="capitalize text-xs bg-background/70 border border-muted/50 px-2 py-0.5 rounded-full">
                      {resource.type} {resource.quantity}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-xs italic text-muted-foreground">Barren</span>
              )}
            </div>

            {selectedTile.entities.length > 0 && (
              <div>
                <h4 className="text-muted-foreground text-xs font-medium mb-1">Standing here</h4>
                <ul className="space-y-0.5">
                  {selectedTile.entities.map((entity: Entity) => (
                    <li key={entity.id}>
                      <button
                        type="button"
                        className="text-xs hover:underline text-foreground capitalize"
                        onClick={() => {
                          setSelectedEntity(entity);
                          setSelectedTile(null);
                        }}
                      >
                        {entity.name} · {entity.type}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selectedTile.structure && (
              <p className="text-xs text-muted-foreground capitalize">
                Feature: {selectedTile.structure.type.replace(/_/g, ' ')}
              </p>
            )}

            <div className="grid grid-cols-3 gap-1 text-xs">
              <div><span className="text-muted-foreground block">Moisture</span>{Math.round(selectedTile.moisture * 100)}%</div>
              <div><span className="text-muted-foreground block">Temp</span>{Math.round(selectedTile.temperature * 100)}%</div>
              <div><span className="text-muted-foreground block">Fertility</span>{Math.round(selectedTile.fertility * 100)}%</div>
            </div>

            {/*
              * What the ground does to whoever stands on it. Shown as its own
              * line rather than folded into the stats grid: it is the only
              * thing on this panel that is about consequence rather than
              * measurement, and a percentage next to it would read as one more
              * number to ignore.
              */}
            <p className="text-xs text-muted-foreground italic">
              {biomeLine(selectedTile.type)}
            </p>

            {BIOME_STEPS[selectedTile.type] && (
              <p className="text-xs text-muted-foreground italic">
                {BIOME_STEPS[selectedTile.type]!.note}
                {groundSpeed(selectedTile.type) < 1 && (
                  <span className="not-italic">
                    {' '}Crossing it costs {Math.round((1 - groundSpeed(selectedTile.type)) * 100)}% of your pace.
                  </span>
                )}
              </p>
            )}

            {selectedTile.isOnFire && <p className="text-xs text-orange-400">This tile is burning.</p>}
          </div>

          {showDebugInfo && (
            <div className="mt-3 pt-2 border-t border-muted/40 text-xs text-muted-foreground">
              <div>Raw height {selectedTile.height.toFixed(3)}</div>
              <div>Visual height {selectedTile.scaledHeight.toFixed(3)}</div>
              <div>Instance {selectedTile.instanceId ?? '—'}</div>
              <div>Walkable {selectedTile.walkable === false ? 'no' : 'yes'}</div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default InfoPanel;
