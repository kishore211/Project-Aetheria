import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Axe,
  ChevronLeft,
  ChevronRight,
  CloudSunRain,
  Flame,
  Gem,
  Ghost,
  Hand,
  Heart,
  HelpCircle,
  HardDriveDownload,
  MountainIcon,
  PawPrint,
  Rocket,
  Scale,
  SkullIcon,
  Sprout,
  Swords,
  TreePine,
  Trees,
  Users,
  Waves,
  Zap,
} from 'lucide-react';
import { useGameStore, type BrushRadius, type Tool } from '../../store/gameStore';
import { soundManager } from '../../utils/soundManager';
import { WORLD_TEMPLATES, type WorldTemplate } from '../../utils/worldGenerator';
import SavePanel from './SavePanel';

interface ToolEntry {
  id: Tool;
  name: string;
  icon: React.ReactNode;
  category: string;
  hint: string;
}

const toolsList: ToolEntry[] = [
  { id: 'select', name: 'Inspect', icon: <Hand size={18} />, category: 'basic', hint: 'Click a tile or creature to inspect it' },

  { id: 'raise-terrain', name: 'Raise', icon: <ArrowUp size={18} />, category: 'terrain', hint: 'Push land upward' },
  { id: 'lower-terrain', name: 'Lower', icon: <ArrowDown size={18} />, category: 'terrain', hint: 'Sink land toward the sea' },
  { id: 'place-water', name: 'Water', icon: <Waves size={18} />, category: 'terrain', hint: 'Flood tiles' },
  { id: 'place-mountain', name: 'Mountain', icon: <MountainIcon size={18} />, category: 'terrain', hint: 'Raise impassable peaks' },
  { id: 'place-forest', name: 'Forest', icon: <TreePine size={18} />, category: 'terrain', hint: 'Grow woodland' },

  { id: 'spawn-human', name: 'Humans', icon: <Users size={18} />, category: 'life', hint: 'Versatile builders' },
  { id: 'spawn-elf', name: 'Elves', icon: <Sprout size={18} />, category: 'life', hint: 'Long-lived and clever' },
  { id: 'spawn-dwarf', name: 'Dwarves', icon: <Axe size={18} />, category: 'life', hint: 'Tough miners' },
  { id: 'spawn-orc', name: 'Orcs', icon: <Swords size={18} />, category: 'life', hint: 'Strong and quick to war' },
  { id: 'spawn-animal', name: 'Animals', icon: <PawPrint size={18} />, category: 'life', hint: 'Biome-appropriate wildlife' },
  { id: 'spawn-monster', name: 'Monsters', icon: <Ghost size={18} />, category: 'life', hint: 'Dragons, demons and worse' },

  { id: 'plant-trees', name: 'Trees', icon: <Trees size={18} />, category: 'nature', hint: 'Plant timber and food' },
  { id: 'unearth-minerals', name: 'Minerals', icon: <Gem size={18} />, category: 'nature', hint: 'Surface a vein of ore' },
  { id: 'summon-rain', name: 'Rain', icon: <CloudSunRain size={18} />, category: 'nature', hint: 'Summon or dismiss rain' },

  { id: 'fire', name: 'Fire', icon: <Flame size={18} />, category: 'destruction', hint: 'Set the land alight' },
  { id: 'earthquake', name: 'Quake', icon: <MountainIcon size={18} />, category: 'destruction', hint: 'Shatter the ground' },
  { id: 'meteor', name: 'Meteor', icon: <Rocket size={18} />, category: 'destruction', hint: 'Call down a rock from the sky' },
  { id: 'lightning', name: 'Lightning', icon: <Zap size={18} />, category: 'destruction', hint: 'Strike a single tile' },

  { id: 'blessing', name: 'Bless', icon: <Heart size={18} />, category: 'divine', hint: 'Heal, fertilise and purify' },
  { id: 'curse', name: 'Curse', icon: <SkullIcon size={18} />, category: 'divine', hint: 'Corrupt the land and its people' },
];

const categoryNames: Record<string, string> = {
  basic: 'Basic',
  terrain: 'Terrain',
  life: 'Life',
  nature: 'Nature',
  destruction: 'Destruction',
  divine: 'Divine',
};

const BRUSHES: Array<{ radius: BrushRadius; label: string }> = [
  { radius: 0, label: '1×1' },
  { radius: 1, label: '3×3' },
  { radius: 2, label: '5×5' },
];

const SIZES: Array<{ id: 'small' | 'medium' | 'large'; label: string }> = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
];

const Sidebar = () => {
  const {
    selectedTool,
    setSelectedTool,
    brushRadius,
    setBrushRadius,
    setWorldSeed,
    worldSeed,
    worldSize,
    setWorldSize,
    worldTemplate,
    setWorldTemplate,
    entityPopulationDensity,
    setEntityPopulationDensity,
    setShowHelp,
    setShowLaws,
  } = useGameStore();

  // Phones and narrow panes start with the tool drawer closed so the world is
  // visible; it opens as an overlay on top of the map.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 700,
  );
  const [showSaves, setShowSaves] = useState(false);

  const toolCategories = toolsList.reduce((acc: Record<string, ToolEntry[]>, tool) => {
    (acc[tool.category] ??= []).push(tool);
    return acc;
  }, {});

  if (collapsed) {
    return (
      <button
        type="button"
        title="Show tools"
        className="tool-btn fixed left-0 top-1/2 -translate-y-1/2 bg-secondary/95 backdrop-blur border border-l-0 border-muted/40 rounded-r-lg py-4 px-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => setCollapsed(false)}
      >
        <ChevronRight size={18} />
      </button>
    );
  }

  return (
    <>
      <div className="ui-sidebar fixed left-0 top-0 bottom-0 z-20 w-56 sm:w-60 bg-secondary/95 backdrop-blur px-3 py-3 pb-[env(safe-area-inset-bottom)] overflow-y-auto border-r border-muted/40">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-foreground">Aetheria</h1>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <button type="button" title="World laws" className="hover:text-foreground" onClick={() => setShowLaws(true)}>
              <Scale size={17} />
            </button>
            <button type="button" title="Save & load" className="hover:text-foreground" onClick={() => setShowSaves(true)}>
              <HardDriveDownload size={17} />
            </button>
            <button type="button" title="How to play" className="hover:text-foreground" onClick={() => setShowHelp(true)}>
              <HelpCircle size={17} />
            </button>
            <button type="button" title="Hide panel" className="hover:text-foreground" onClick={() => setCollapsed(true)}>
              <ChevronLeft size={17} />
            </button>
          </div>
        </div>

        {/* World creation */}
        <button
          type="button"
          className="tool-btn w-full bg-primary hover:bg-primary/80 transition-colors text-white py-2 px-4 rounded mb-2 font-medium text-sm"
          onClick={() => {
            soundManager.uiClick();
            setWorldSeed(Math.floor(Math.random() * 1000000));
          }}
        >
          ✦ New World
        </button>

        <div className="grid grid-cols-3 gap-1 mb-2">
          {SIZES.map((size) => (
            <button
              key={size.id}
              type="button"
              title={`${size.label} world`}
              onClick={() => setWorldSize(size.id)}
              className={`tool-btn text-xs py-1 rounded ${
                worldSize === size.id ? 'bg-accent text-accent-foreground' : 'bg-background/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              {size.label}
            </button>
          ))}
        </div>

        <select
          className="w-full mb-4 text-xs bg-background/60 border border-muted/50 rounded px-2 py-1.5 text-foreground"
          value={worldTemplate}
          onChange={(event) => setWorldTemplate(event.target.value as WorldTemplate)}
          title="World shape (applies to the next new world)"
        >
          {(Object.entries(WORLD_TEMPLATES) as Array<[WorldTemplate, { label: string }]>).map(
            ([id, config]) => (
              <option key={id} value={id}>{config.label}</option>
            ),
          )}
        </select>

        {/* Brush size */}
        <div className="mb-4">
          <h2 className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">Brush</h2>
          <div className="grid grid-cols-3 gap-1">
            {BRUSHES.map((brush) => (
              <button
                key={brush.radius}
                type="button"
                onClick={() => setBrushRadius(brush.radius)}
                className={`tool-btn text-xs py-1 rounded ${
                  brushRadius === brush.radius
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-background/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                {brush.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tools */}
        <div className="space-y-4">
          {Object.entries(toolCategories).map(([category, tools]) => (
            <div key={category}>
              <h2 className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide border-b border-muted/50 pb-1">
                {categoryNames[category] ?? category}
              </h2>
              <div className="grid grid-cols-2 gap-1.5">
                {tools.map((tool) => (
                  <button
                    type="button"
                    key={tool.id}
                    onClick={() => {
                      soundManager.uiClick();
                      setSelectedTool(tool.id);
                    }}
                    className={`tool-btn flex items-center gap-1.5 py-1.5 px-2 rounded text-xs ${
                      selectedTool === tool.id
                        ? 'tool-btn-active bg-accent text-accent-foreground'
                        : 'bg-background/40 text-foreground hover:bg-muted'
                    }`}
                    title={tool.hint}
                  >
                    <span className="shrink-0">{tool.icon}</span>
                    <span className="truncate">{tool.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Population density, only relevant while seeding life */}
        {(selectedTool?.toString() ?? '').includes('spawn') && (
          <div className="mt-4">
            <h2 className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">
              Population density
            </h2>
            <div className="grid grid-cols-3 gap-1">
              {(['low', 'medium', 'high'] as const).map((density) => (
                <button
                  key={density}
                  type="button"
                  onClick={() => setEntityPopulationDensity(density)}
                  className={`tool-btn capitalize text-xs py-1 rounded ${
                    entityPopulationDensity === density
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-background/50 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {density}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 pb-16 text-xs text-muted-foreground">
          <p>{toolsList.find((tool) => tool.id === selectedTool)?.hint ?? 'Click the world to act'}</p>
          <p className="mt-1">Seed: <span className="text-foreground">{worldSeed}</span></p>
        </div>
      </div>

      <SavePanel open={showSaves} onClose={() => setShowSaves(false)} />
    </>
  );
};

export default Sidebar;
