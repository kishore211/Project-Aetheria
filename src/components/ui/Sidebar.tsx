// No React import needed in modern React with JSX transform
import { 
  Hand, 
  ArrowUp, 
  ArrowDown, 
  Waves, 
  MountainIcon, 
  TreePine, 
  Users, 
  Flame, 
  CloudSunRain, 
  Gem,
  Zap,
  Rocket,
  Heart,
  SkullIcon,
  Sprout,
  Axe,
  Swords,
  PawPrint,
  Ghost,
  HelpCircle,
  Trees
} from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import type { Tool } from '../../store/gameStore';
import { soundManager } from '../../utils/soundManager';

// List of tools available to the player
const toolsList: { id: Tool; name: string; icon: React.ReactNode; category: string }[] = [
  // Basic tools
  { id: 'select', name: 'Select', icon: <Hand size={20} />, category: 'basic' },
  
  // Terrain tools
  { id: 'raise-terrain', name: 'Raise Land', icon: <ArrowUp size={20} />, category: 'terrain' },
  { id: 'lower-terrain', name: 'Lower Land', icon: <ArrowDown size={20} />, category: 'terrain' },
  { id: 'place-water', name: 'Water', icon: <Waves size={20} />, category: 'terrain' },
  { id: 'place-mountain', name: 'Mountain', icon: <MountainIcon size={20} />, category: 'terrain' },
  { id: 'place-forest', name: 'Forest', icon: <TreePine size={20} />, category: 'terrain' },
  
  // Entity/Life tools
  { id: 'spawn-human', name: 'Humans', icon: <Users size={20} />, category: 'life' },
  { id: 'spawn-elf', name: 'Elves', icon: <Sprout size={20} />, category: 'life' },
  { id: 'spawn-dwarf', name: 'Dwarves', icon: <Axe size={20} />, category: 'life' },
  { id: 'spawn-orc', name: 'Orcs', icon: <Swords size={20} />, category: 'life' },
  { id: 'spawn-animal', name: 'Animals', icon: <PawPrint size={20} />, category: 'life' },
  { id: 'spawn-monster', name: 'Monsters', icon: <Ghost size={20} />, category: 'life' },
  
  // Nature tools
  { id: 'plant-trees', name: 'Trees', icon: <Trees size={20} />, category: 'nature' },
  { id: 'unearth-minerals', name: 'Minerals', icon: <Gem size={20} />, category: 'nature' },
  { id: 'summon-rain', name: 'Rain', icon: <CloudSunRain size={20} />, category: 'weather' },
  
  // Destruction tools
  { id: 'fire', name: 'Fire', icon: <Flame size={20} />, category: 'destruction' },
  { id: 'earthquake', name: 'Earthquake', icon: <MountainIcon size={20} />, category: 'destruction' },
  { id: 'meteor', name: 'Meteor', icon: <Rocket size={20} />, category: 'destruction' },
  { id: 'lightning', name: 'Lightning', icon: <Zap size={20} />, category: 'destruction' },
  
  // Divine tools
  { id: 'blessing', name: 'Blessing', icon: <Heart size={20} />, category: 'divine' },
  { id: 'curse', name: 'Curse', icon: <SkullIcon size={20} />, category: 'divine' },
];

// Entity types are now handled directly through the tool system

// Sidebar component with tools and controls
const Sidebar = () => {
  const { 
    selectedTool, 
    setSelectedTool,
    setWorldSeed,
    worldSeed,
    entityPopulationDensity,
    setEntityPopulationDensity,
    setShowHelp
  } = useGameStore();
  
  // Group tools by category
  const toolCategories = toolsList.reduce((acc: Record<string, typeof toolsList>, tool) => {
    if (!acc[tool.category]) {
      acc[tool.category] = [];
    }
    acc[tool.category].push(tool);
    return acc;
  }, {});
  
  // Category display names
  const categoryNames: Record<string, string> = {
    basic: 'Basic',
    terrain: 'Terrain',
    nature: 'Nature',
    life: 'Life',
    weather: 'Weather',
    destruction: 'Destruction',
    divine: 'Divine',
  };
  
  return (
    <div className="ui-sidebar fixed left-0 top-0 bottom-0 w-64 bg-secondary/95 backdrop-blur p-4 overflow-y-auto border-r border-muted/40">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-foreground">Aetheria</h1>
        <button
          type="button"
          title="How to play"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setShowHelp(true)}
        >
          <HelpCircle size={20} />
        </button>
      </div>
      
      {/* New World Button */}
      <button 
        type="button"
        className="tool-btn w-full bg-primary hover:bg-primary/80 transition-colors text-white py-2 px-4 rounded mb-6 font-medium"
        onClick={() => {
          soundManager.uiClick();
          setWorldSeed(Math.floor(Math.random() * 1000000));
        }}
      >
        ✦ New World
      </button>
      
      {/* Tool Categories */}
      <div className="space-y-6">
        {Object.entries(toolCategories).map(([category, tools]) => (
          <div key={category}>
            <h2 className="text-md font-semibold mb-2 text-foreground border-b border-muted pb-1">
              {categoryNames[category] || category}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {tools.map((tool) => (
                <button
                  type="button"
                  key={tool.id}
                  onClick={() => {
                    soundManager.uiClick();
                    setSelectedTool(tool.id);
                  }}
                  className={`tool-btn flex items-center justify-center py-2 px-3 rounded text-sm ${
                    selectedTool === tool.id 
                      ? 'tool-btn-active bg-accent text-accent-foreground' 
                      : 'bg-secondary text-foreground hover:bg-muted'
                  }`}
                  title={tool.name}
                >
                  <span className="mr-2">{tool.icon}</span>
                  <span>{tool.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {/* Entity Population Density Settings */}
      {(selectedTool?.toString() || '').includes('spawn') && (
        <div className="mt-6">
          <h2 className="text-md font-semibold mb-2 text-foreground border-b border-muted pb-1">
            Population Density
          </h2>
          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => setEntityPopulationDensity('low')}
              className={`text-center py-1 px-2 rounded ${
                entityPopulationDensity === 'low'
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-secondary text-foreground hover:bg-muted'
              }`}
            >
              Low
            </button>
            <button
              type="button"
              onClick={() => setEntityPopulationDensity('medium')}
              className={`text-center py-1 px-2 rounded ${
                entityPopulationDensity === 'medium'
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-secondary text-foreground hover:bg-muted'
              }`}
            >
              Medium
            </button>
            <button
              type="button"
              onClick={() => setEntityPopulationDensity('high')}
              className={`text-center py-1 px-2 rounded ${
                entityPopulationDensity === 'high'
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-secondary text-foreground hover:bg-muted'
              }`}
            >
              High
            </button>
          </div>
        </div>
      )}
      
      {/* Bottom info */}
      <div className="mt-6 text-sm text-muted-foreground">
        <p>Click on the world to interact</p>
        <p className="mt-1 text-xs">Seed: <span className="text-foreground">{worldSeed}</span></p>
      </div>
    </div>
  );
};

export default Sidebar;
