import { X } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { POWER_BY_TOOL, POWER_TABS, type PowerEntry } from '../../utils/powers';
import { creatureFacts } from '../../utils/knowledge';
import { isAquatic } from '../../utils/pathfinding';
import type { EntityType } from '../../types/world';
import { Icon } from './PowerBar';
import { portraitOf } from './KnowledgeBook';

const BRUSH_LABEL = ['Fine (1 tile)', 'Wide (3×3)', 'Vast (5×5)'];

/** Powers that work on whoever is standing under the brush. */
const ON_CREATURES = /^(gift-|trait-|shield|coffee|inspire|sleep|clone|plague|madness|confusion|divine-light|dust-|youth|love-potion|gift-arms|gold-rain|uplift|blessing|curse|poke)/;
/** Powers that strike one spot. */
const STRIKES = /^(meteor|lightning|grenade|bomb|napalm|atomic|void-bomb|cluster-bomb|tornado|volcano|geyser|earthquake|acid$|lava|swarm|fire|dynamite|antimatter|tsar-bomba|heat-ray)/;

/** How to use a power, in one or two plain sentences. */
const howTo = (power: PowerEntry): string[] => {
  const id = power.id as string;
  if (id.startsWith('spawn-')) {
    const type = id.slice(6) as EntityType;
    if (['human', 'elf', 'dwarf', 'orc'].includes(type)) {
      return ['Click on dry land to place one. Put three or more together on good land and they will found a village.'];
    }
    return [isAquatic(type) ? 'Click on water to release one.' : 'Click on land to place one. Click again for more.'];
  }
  if (id === 'spawn-animal') return ['Click on land: you get whatever lives in that biome.'];
  if (id === 'spawn-monster') return ['Click anywhere: the land decides which monster answers.'];
  if (id === 'magnet') return ['Click on creatures to lift everyone under the brush.', 'Move the mouse to carry them, then click again to set them down.'];
  if (id.startsWith('diplo-')) return ['Click on a kingdom’s land to work on that realm.'];
  if (id === 'select') return ['Click a creature or a tile to inspect it.'];
  if (id.endsWith('-cloud') || id === 'blood-rain') return ['Click where the cloud should form. It drifts with the wind and rains as it goes.'];
  if (id.startsWith('wall-')) return ['Click to build a wall on the tile. Nothing that walks can cross it.'];
  if (ON_CREATURES.test(id)) return ['Click on creatures. Everyone under the brush is touched.'];
  if (STRIKES.test(id)) return ['Click where it should strike.'];
  if (id.startsWith('seed-') || id.startsWith('paint-') || id.startsWith('stamp-')) return ['Click on the map to paint it. Click again to paint more.'];
  return ['Click on the map to use it. Click again to use it again.'];
};

/**
 * The window for whatever power is in your hand.
 *
 * WorldBox opens a panel the moment you pick a power: what it is, what it
 * does, how to use it. A hover tip that vanishes when the mouse moves on is
 * not that — you are left holding a tool with no idea what it will do.
 */
const PowerCard = () => {
  const selectedTool = useGameStore((state) => state.selectedTool);
  const setSelectedTool = useGameStore((state) => state.setSelectedTool);
  const brushRadius = useGameStore((state) => state.brushRadius);
  const uiHidden = useGameStore((state) => state.uiHidden);

  if (!selectedTool || selectedTool === 'select' || uiHidden) return null;
  const power = POWER_BY_TOOL.get(selectedTool);
  if (!power) return null;
  const tab = POWER_TABS.find(t => t.id === power.tab);
  const id = power.id as string;
  const creature = id.startsWith('spawn-') && !['spawn-animal', 'spawn-monster'].includes(id)
    ? creatureFacts(id.slice(6) as EntityType)
    : null;

  return (
    <div className="power-card ui-panel" role="dialog" aria-label={power.label}>
      <button
        type="button"
        className="power-card-close"
        title="Put it down (Esc)"
        onClick={() => setSelectedTool('select')}
      >
        <X size={14} />
      </button>
      <div className="power-card-head">
        <span className="power-card-icon">
          {creature
            ? <img src={portraitOf(creature.type)} alt="" style={{ imageRendering: 'pixelated' }} />
            : <Icon name={power.icon} size={26} />}
        </span>
        <div className="min-w-0">
          <h3>{power.label}</h3>
          {tab && <p className="power-card-tab">{tab.label} · {tab.blurb}</p>}
        </div>
      </div>
      <p className="power-card-hint">{power.hint}</p>
      {creature && (
        <p className="power-card-facts">
          {creature.health} health · {creature.strength} strength · {creature.speed} speed · {creature.moves.toLowerCase()}
          {creature.eats.length > 0 && <><br />Eats {creature.eats.slice(0, 5).map(t => t.replace(/_/g, ' ')).join(', ')}{creature.eats.length > 5 ? '…' : ''}</>}
          {creature.powers.map(p => <span key={p} className="block text-violet-200">{p}</span>)}
        </p>
      )}
      <ul className="power-card-how">
        {howTo(power).map((line) => <li key={line}>{line}</li>)}
        {!creature && !id.startsWith('spawn-') && <li>Brush: {BRUSH_LABEL[brushRadius]} — change it with the dots at the right of the bar.</li>}
        <li className="text-muted-foreground">Esc or the cross puts it down.</li>
      </ul>
      {power.quip && <p className="power-card-quip">{power.quip}</p>}
    </div>
  );
};

export default PowerCard;
