import { useMemo, useState } from 'react';
import {
  Activity, ArrowDown, ArrowUp, Axe, BadgeCheck, BarChart3, ChevronRight,
  Circle, CloudRain, Droplets, Eraser, Eye, EyeOff, Flame, Gem, Ghost,
  Globe2, Hammer, HardDriveDownload, Heart, HelpCircle, Leaf, ListTree, Map,
  Mountain, MousePointer2, Pause, PawPrint, Play, Pointer, Rocket, Scale,
  Scissors, Skull, Sparkle, Sparkles, Sprout, Swords, Tag, TreePine, Trees,
  User, Users, Video, VideoOff, Waves, X, Zap,
  Biohazard, Bird, Bomb, Bone, Brain, Bug, Cloud, CloudSnow, Coffee, Copy, Crown, Dog, Droplet, Egg, Fish, FlaskConical, Flag, Flower, Handshake, HeartHandshake, Lightbulb, Megaphone, Moon, MountainSnow, Orbit, Palmtree, Rabbit, Radiation, Shell, Shield, Snowflake, Spline, Squirrel, Sun, Sword, ThermometerSnowflake, ThermometerSun, Tornado, TreePalm, Unlink, WandSparkles, Wheat, Wind, CircleDot,
  PiggyBank, Banana, Wand, Cat, Rat, Gamepad2, BookOpen, Bot,
  type LucideIcon,
} from 'lucide-react';
import { useGameStore, type BrushRadius } from '../../store/gameStore';
import { soundManager } from '../../utils/soundManager';
import { WORLD_TEMPLATES, type WorldTemplate } from '../../utils/worldGenerator';
import {
  POWERS_BY_TAB,
  POWER_TABS,
  type PowerEntry,
  type PowerTabId,
} from '../../utils/powers';
import { MAP_LAYERS } from '../../utils/mapLayers';
import { HOTKEY_SLOTS } from '../../utils/hotkeyBindings';
import SavePanel from './SavePanel';
import StatsPanel from './StatsPanel';
import ListWindow from './ListWindow';
import KnowledgeBook from './KnowledgeBook';

/**
 * The bottom power bar.
 *
 * This replaces the left sidebar, which was a scrolling list of every tool at
 * once — fine at 22 powers, hopeless at 50, and nothing like the instrument
 * panel WorldBox puts under your world
 * (docs/project-tracker/07-UI-TEARDOWN-AND-SPEC.md, W1). Powers are grouped
 * into tabs, every one has a hotkey printed on it, and the bar keeps the map
 * unobstructed above it instead of eating a column of it.
 */

/** Resolve a lucide icon by name, so the catalogue can stay plain data. */
const ICONS: Record<string, LucideIcon> = {
  BookOpen,
  Bot,
  Activity, ArrowDown, ArrowUp, Axe, BadgeCheck, BarChart3, Circle, CloudRain,
  Droplets, Eraser, Eye, EyeOff, Flame, Gem, Ghost, Globe2, Hammer,
  HardDriveDownload, Heart, HelpCircle, Leaf, ListTree, Map, Mountain,
  MousePointer2, PawPrint, Pointer, Rocket, Scale, Scissors, Skull, Sparkle,
  Sparkles, Sprout, Swords, Tag, TreePine, Trees, User, Users, Video, VideoOff,
  Waves, X, Zap,
  PiggyBank, Banana, Wand, Cat, Rat, Gamepad2,
  Biohazard, Bird, Bomb, Bone, Brain, Bug, Cloud, CloudSnow, Coffee, Copy, Crown, Dog, Droplet, Egg, Fish, FlaskConical, Flag, Flower, Handshake, HeartHandshake, Lightbulb, Megaphone, Moon, MountainSnow, Orbit, Palmtree, Rabbit, Radiation, Shell, Shield, Snowflake, Spline, Squirrel, Sun, Sword, ThermometerSnowflake, ThermometerSun, Tornado, TreePalm, Unlink, WandSparkles, Wheat, Wind, CircleDot,
};

const Icon = ({ name, size = 20 }: { name: string; size?: number }) => {
  const Resolved = ICONS[name] ?? Circle;
  return <Resolved size={size} />;
};

const BRUSHES: Array<{ radius: BrushRadius; label: string; dots: number }> = [
  { radius: 0, label: 'Fine — 1×1', dots: 1 },
  { radius: 1, label: 'Wide — 3×3', dots: 2 },
  { radius: 2, label: 'Vast — 5×5', dots: 3 },
];

const SIZES = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
  { id: 'huge', label: 'Huge' },
] as const;

/** A non-tool button that lives on the bar: a toggle or a one-shot action. */
interface ActionItem {
  key: string;
  label: string;
  icon: string;
  hint: string;
  quip: string;
  on?: boolean;
  run: () => void;
}

interface HoverInfo {
  label: string;
  hint: string;
  quip: string;
  hotkey?: string;
}

const PowerBar = () => {
  const {
    selectedTool, setSelectedTool,
    brushRadius, setBrushRadius,
    activePowerTab, setActivePowerTab,
    uiHidden, toggleUiHidden,
    worldSeed, setWorldSeed,
    worldSize, setWorldSize,
    worldTemplate, setWorldTemplate,
    entityPopulationDensity, setEntityPopulationDensity,
    setShowHelp, setShowLaws,
    mapLayer, setMapLayer,
    showMinimap, toggleMinimap,
    showUnitIcons, toggleUnitIcons,
    showMapLabels, toggleMapLabels,
    isGamePaused, togglePause,
    gameSpeed, setGameSpeed,
    selectedEntity, setSelectedEntity,
    followEntityId, setFollowEntity,
    possessedId, setPossessed,
    hotkeySlots,
  } = useGameStore();

  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [showSaves, setShowSaves] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showList, setShowList] = useState(false);
  const showKnowledge = useGameStore((state) => state.showKnowledge);
  const setShowKnowledge = useGameStore((state) => state.setShowKnowledge);

  const hasUnit = Boolean(selectedEntity);
  const tabs = useMemo(
    () => (hasUnit
      ? [...POWER_TABS, { id: 'unit' as PowerTabId, label: selectedEntity?.name?.split(' ')[0] ?? 'Unit', icon: 'User', blurb: 'The creature you have picked out' }]
      : POWER_TABS),
    [hasUnit, selectedEntity?.name],
  );

  // The unit tab vanishes with its unit; fall back rather than showing nothing.
  const tab: PowerTabId = activePowerTab === 'unit' && !hasUnit ? 'shape' : activePowerTab;

  const powers = POWERS_BY_TAB(tab);

  const actions: ActionItem[] = useMemo(() => {
    if (tab === 'world') {
      return [
        {
          key: 'new-world', label: 'New World', icon: 'Sparkle',
          hint: 'Roll a fresh world from a new seed.',
          quip: 'The old one had it coming.',
          run: () => setWorldSeed(Math.floor(Math.random() * 1000000)),
        },
        {
          key: 'laws', label: 'Laws', icon: 'Scale',
          hint: 'Rules the world runs on: ageing, war, plague, reproduction.',
          quip: 'Physics by committee, and you are the committee.',
          run: () => setShowLaws(true),
        },
        {
          key: 'saves', label: 'Archive', icon: 'HardDriveDownload',
          hint: 'Save this world or load another.',
          quip: 'Regret, but reversible.',
          run: () => setShowSaves(true),
        },
        {
          key: 'stats', label: 'Records', icon: 'BarChart3',
          hint: 'Population over time, and what everyone died of.',
          quip: 'Every world keeps a tally whether you look at it or not.',
          run: () => setShowStats(true),
        },
        {
          key: 'knowledge', label: 'Knowledge', icon: 'BookOpen',
          hint: 'Every creature you have met, across every world. (K)',
          quip: 'Gotta meet them all.',
          run: () => setShowKnowledge(true),
        },
        {
          key: 'help', label: 'Help', icon: 'HelpCircle',
          hint: 'Controls, hotkeys and what everything does.',
          quip: 'No shame in it.',
          run: () => setShowHelp(true),
        },
        {
          key: 'hide', label: 'Hide UI', icon: 'EyeOff',
          hint: 'Put every panel away and just watch. (H)',
          quip: 'The world looks better without us in the way.',
          run: toggleUiHidden, on: uiHidden,
        },
      ];
    }
    if (tab === 'observe') {
      return [
        {
          key: 'labels', label: 'Names', icon: 'Tag',
          hint: 'Draw kingdom and village names on the map.',
          quip: 'Somebody has to know what to call it.',
          on: showMapLabels, run: toggleMapLabels,
        },
        {
          key: 'icons', label: 'Icons', icon: 'BadgeCheck',
          hint: 'Show what each creature does and what it is doing now.',
          quip: 'Crowns, hammers, and the occasional broken heart.',
          on: showUnitIcons, run: toggleUnitIcons,
        },
        {
          key: 'register', label: 'Register', icon: 'ListTree',
          hint: 'Every realm, town and war, with somewhere to click.',
          quip: 'Squinting at the map stops working around the fourth village.',
          run: () => setShowList(true),
        },
        {
          key: 'minimap', label: 'Minimap', icon: 'Map',
          hint: 'The whole world, small, in the corner.',
          quip: 'For when you have lost your own continent.',
          on: showMinimap, run: toggleMinimap,
        },
      ];
    }
    if (tab === 'unit' && selectedEntity) {
      const following = followEntityId === selectedEntity.id;
      return [
        {
          key: 'follow', label: following ? 'Unfollow' : 'Follow', icon: following ? 'VideoOff' : 'Video',
          hint: 'Lock the camera onto this creature. (F)',
          quip: 'It has no idea you are doing this.',
          on: following,
          run: () => setFollowEntity(following ? null : selectedEntity.id),
        },
        {
          key: 'possess', label: possessedId === selectedEntity.id ? 'Let go' : 'Possess', icon: 'Gamepad2',
          hint: 'Take control: WASD to walk, Space to strike, Esc to let go. (G)',
          quip: 'It will not remember this. Probably.',
          on: possessedId === selectedEntity.id,
          run: () => setPossessed(possessedId === selectedEntity.id ? null : selectedEntity.id),
        },
        {
          key: 'deselect', label: 'Release', icon: 'X',
          hint: 'Stop watching this one. (Esc)',
          quip: 'Go on, live your life.',
          run: () => { setSelectedEntity(null); setFollowEntity(null); },
        },
      ];
    }
    return [];
  }, [
    tab, uiHidden, showMapLabels, showUnitIcons, showMinimap, selectedEntity, followEntityId,
    setWorldSeed, setShowLaws, setShowHelp, setShowKnowledge, toggleUiHidden, toggleMapLabels, toggleUnitIcons,
    toggleMinimap, setFollowEntity, setSelectedEntity, possessedId, setPossessed,
  ]);

  if (uiHidden) {
    return (
      <button
        type="button"
        title="Show the interface (H)"
        className="powerbar-peek"
        onClick={toggleUiHidden}
      >
        <Eye size={16} />
      </button>
    );
  }

  const pickPower = (power: PowerEntry) => {
    soundManager.uiClick();
    setSelectedTool(power.id);
  };

  const speeds = [
    { value: 1, label: 'Normal', chevrons: 1 },
    { value: 2, label: 'Fast', chevrons: 2 },
    { value: 3, label: 'Ultra', chevrons: 3 },
  ];

  return (
    <>
      <div className="powerbar" onMouseLeave={() => setHover(null)}>
        {hover && (
          <div className="powerbar-tip">
            <div className="powerbar-tip-head">
              <span>{hover.label}</span>
              {hover.hotkey && <kbd>{hover.hotkey}</kbd>}
            </div>
            <p className="powerbar-tip-hint">{hover.hint}</p>
            <p className="powerbar-tip-quip">{hover.quip}</p>
          </div>
        )}

        <div className="powerbar-tabs">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`powerbar-tab ${tab === entry.id ? 'is-active' : ''} ${entry.id === 'unit' ? 'is-unit' : ''}`}
              onClick={() => { soundManager.uiClick(); setActivePowerTab(entry.id); }}
              onMouseEnter={() => setHover({ label: entry.label, hint: entry.blurb, quip: '' })}
            >
              <Icon name={entry.icon} size={15} />
              <span className="powerbar-tab-label">{entry.label}</span>
            </button>
          ))}
        </div>

        <div className="powerbar-body">
          {/* Time — the most-used control on the bar, so it gets the left edge */}
          <div className="powerbar-cluster">
            <button
              type="button"
              className={`powerbar-chip ${isGamePaused ? 'is-on' : ''}`}
              onClick={togglePause}
              onMouseEnter={() => setHover({
                label: isGamePaused ? 'Resume' : 'Pause',
                hint: 'Stop or restart the passage of time.',
                quip: 'Your powers still work while it is stopped.',
                hotkey: 'Space',
              })}
            >
              {isGamePaused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            {speeds.map((speed) => (
              <button
                key={speed.value}
                type="button"
                className={`powerbar-chip ${gameSpeed === speed.value && !isGamePaused ? 'is-on' : ''}`}
                onClick={() => setGameSpeed(speed.value)}
                onMouseEnter={() => setHover({
                  label: `${speed.label} speed`,
                  hint: 'How fast the world lives.',
                  quip: speed.value === 3 ? 'Dynasties in a teacup.' : 'Time, at your convenience.',
                })}
              >
                <span className="powerbar-chevrons">
                  {Array.from({ length: speed.chevrons }, (_, index) => (
                    <ChevronRight key={index} size={14} />
                  ))}
                </span>
              </button>
            ))}
          </div>

          <div className="powerbar-divider" />

          {/* The powers of the active tab */}
          <div
            className="powerbar-powers no-scrollbar"
            // A tab of thirty powers is wider than the bar. A plain mouse
            // wheel only scrolls vertically, so without this the end of the
            // row is unreachable for anyone not on a trackpad.
            onWheel={(event) => {
              if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
                event.currentTarget.scrollLeft += event.deltaY;
              }
            }}
          >
            {powers.map((power, index) => {
              // A binding the player made outranks the tab position, and the
              // button has to say so — a key that has been reassigned and
              // still shows its old number is worse than showing nothing.
              const bound = hotkeySlots.indexOf(power.id);
              const key = bound >= 0
                ? String(bound === HOTKEY_SLOTS - 1 ? 0 : bound + 1)
                : (index < 9 && !hotkeySlots[index] ? String(index + 1) : undefined);
              return (
                <button
                  key={power.id}
                  type="button"
                  className={`powerbtn ${selectedTool === power.id ? 'is-active' : ''}`}
                  onClick={() => pickPower(power)}
                  onMouseEnter={() => setHover({
                    label: power.label,
                    hint: power.hint,
                    quip: power.quip,
                    hotkey: key,
                  })}
                >
                  <Icon name={power.icon} />
                  <span className="powerbtn-label">{power.label}</span>
                  {key && <span className="powerbtn-key">{key}</span>}
                </button>
              );
            })}

            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                className={`powerbtn is-action ${action.on ? 'is-on' : ''}`}
                onClick={() => { soundManager.uiClick(); action.run(); }}
                onMouseEnter={() => setHover({ label: action.label, hint: action.hint, quip: action.quip })}
              >
                <Icon name={action.icon} />
                <span className="powerbtn-label">{action.label}</span>
              </button>
            ))}

            {tab === 'world' && (
              <div className="powerbar-inline">
                <label className="powerbar-inline-label">Size</label>
                <div className="powerbar-segmented">
                  {SIZES.map((size) => (
                    <button
                      key={size.id}
                      type="button"
                      className={worldSize === size.id ? 'is-on' : ''}
                      onClick={() => setWorldSize(size.id)}
                    >
                      {size.label}
                    </button>
                  ))}
                </div>
                <label className="powerbar-inline-label">Shape</label>
                <select
                  className="powerbar-select"
                  value={worldTemplate}
                  onChange={(event) => setWorldTemplate(event.target.value as WorldTemplate)}
                  title="Applies to the next new world"
                >
                  {(Object.entries(WORLD_TEMPLATES) as Array<[WorldTemplate, { label: string }]>).map(
                    ([id, config]) => <option key={id} value={id}>{config.label}</option>,
                  )}
                </select>
                <span className="powerbar-seed">seed {worldSeed}</span>
              </div>
            )}

            {tab === 'observe' && (
              <div className="powerbar-inline">
                <label className="powerbar-inline-label">Painted as</label>
                <div className="powerbar-segmented">
                  {MAP_LAYERS.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={mapLayer === entry.id ? 'is-on' : ''}
                      onClick={() => { soundManager.uiClick(); setMapLayer(entry.id); }}
                      onMouseEnter={() => setHover({
                        label: entry.label,
                        hint: entry.hint,
                        quip: '',
                        hotkey: 'Z / X',
                      })}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === 'life' && (
              <div className="powerbar-inline">
                <label className="powerbar-inline-label">How many</label>
                <div className="powerbar-segmented">
                  {(['low', 'medium', 'high'] as const).map((density) => (
                    <button
                      key={density}
                      type="button"
                      className={entityPopulationDensity === density ? 'is-on' : ''}
                      onClick={() => setEntityPopulationDensity(density)}
                    >
                      {density === 'low' ? 'A few' : density === 'medium' ? 'Some' : 'Many'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === 'unit' && selectedEntity && (
              <div className="powerbar-inline">
                <span className="powerbar-unitname">{selectedEntity.name}</span>
                <span className="powerbar-inline-label">
                  {selectedEntity.type} · {Math.floor(selectedEntity.age)} yrs
                </span>
              </div>
            )}
          </div>

          <div className="powerbar-divider" />

          {/* Brush — only meaningful for powers you paint with */}
          <div className="powerbar-cluster">
            {BRUSHES.map((brush) => (
              <button
                key={brush.radius}
                type="button"
                className={`powerbar-chip ${brushRadius === brush.radius ? 'is-on' : ''}`}
                onClick={() => setBrushRadius(brush.radius)}
                onMouseEnter={() => setHover({
                  label: brush.label,
                  hint: 'How much land a single click touches.',
                  quip: brush.radius === 2 ? 'Subtlety is not the point.' : 'Aim carefully.',
                })}
              >
                <span className="powerbar-dots">
                  {Array.from({ length: brush.dots }, (_, index) => (
                    <i key={index} style={{ width: 3 + index * 2, height: 3 + index * 2 }} />
                  ))}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <SavePanel open={showSaves} onClose={() => setShowSaves(false)} />
      <StatsPanel open={showStats} onClose={() => setShowStats(false)} />
      <KnowledgeBook open={showKnowledge} onClose={() => setShowKnowledge(false)} />
      <ListWindow open={showList} onClose={() => setShowList(false)} />
    </>
  );
};

export default PowerBar;
