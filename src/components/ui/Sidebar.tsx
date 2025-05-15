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
  SkullIcon
} from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import WorldModeSelector from './WorldModeSelector';
import type { Tool } from '../../store/gameStore';

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
  { id: 'spawn-elf', name: 'Elves', icon: <Users size={20} />, category: 'life' },
  { id: 'spawn-dwarf', name: 'Dwarves', icon: <Users size={20} />, category: 'life' },
  { id: 'spawn-orc', name: 'Orcs', icon: <Users size={20} />, category: 'life' },
  { id: 'spawn-animal', name: 'Animals', icon: <Users size={20} />, category: 'life' },
  { id: 'spawn-monster', name: 'Monsters', icon: <SkullIcon size={20} />, category: 'life' },
  
  // Nature tools
  { id: 'plant-trees', name: 'Trees', icon: <TreePine size={20} />, category: 'nature' },
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
    timeOfDay, 
    toggleDayNight,
    setWorldSeed,
    entityPopulationDensity,
    setEntityPopulationDensity
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
    <div className="fixed left-0 top-0 bottom-0 w-64 bg-secondary p-4 overflow-y-auto">
      <h1 className="text-xl font-bold mb-4 text-foreground">Project Aetheria</h1>
      
      {/* New World Button */}
      <button 
        type="button"
        className="w-full bg-primary text-white py-2 px-4 rounded mb-6"
        onClick={() => setWorldSeed(Math.floor(Math.random() * 1000000))}
      >
        New World
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
                  onClick={() => setSelectedTool(tool.id)}
                  className={`flex items-center justify-center py-2 px-3 rounded text-sm ${
                    selectedTool === tool.id 
                      ? 'bg-accent text-accent-foreground' 
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
      
      {/* World Mode Selector */}
      <div className="mt-6">
        <WorldModeSelector />
      </div>
      
      {/* Bottom info */}
      <div className="mt-6 text-sm text-muted-foreground">
        <p>Click on the world to interact</p>
        <p className="mt-1">
          Time of day: <span className="text-foreground">{timeOfDay}</span>
        </p>
        <button
          type="button"
          onClick={toggleDayNight}
          className="mt-2 text-xs py-1 px-2 bg-muted hover:bg-muted/80 rounded"
        >
          Toggle Day/Night
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
