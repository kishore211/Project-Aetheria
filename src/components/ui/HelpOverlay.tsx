import { useGameStore } from '../../store/gameStore';
import { Sparkles, MousePointer, Mountain, Users, Zap, Heart } from 'lucide-react';

const HelpOverlay = () => {
  const { showHelp, setShowHelp } = useGameStore();

  if (!showHelp) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="ui-modal max-w-lg w-full mx-4 bg-secondary rounded-xl shadow-2xl border border-muted/50 p-6 text-foreground">
        <h1 className="text-2xl font-bold flex items-center gap-2 mb-1">
          <Sparkles className="text-amber-300" />
          Project Aetheria
        </h1>
        <p className="text-muted-foreground mb-5">
          You are the god of a living pixel world. Shape it, fill it with life, and watch stories unfold.
        </p>

        <ul className="space-y-3 text-sm mb-6">
          <li className="flex gap-3">
            <MousePointer size={18} className="text-sky-300 shrink-0 mt-0.5" />
            <span><b>Select</b> a tool from the left panel, then click the world to use it. Drag with right mouse to rotate, scroll to zoom.</span>
          </li>
          <li className="flex gap-3">
            <Mountain size={18} className="text-stone-300 shrink-0 mt-0.5" />
            <span><b>Terraform</b> — raise land, carve seas, plant forests, and unearth minerals.</span>
          </li>
          <li className="flex gap-3">
            <Users size={18} className="text-emerald-300 shrink-0 mt-0.5" />
            <span><b>Create life</b> — humans, elves, dwarves, orcs, animals, and monsters. They hunt, drink, flee, breed, and die on their own.</span>
          </li>
          <li className="flex gap-3">
            <Zap size={18} className="text-yellow-300 shrink-0 mt-0.5" />
            <span><b>Unleash disasters</b> — meteors, lightning, fire, and earthquakes reshape the land and its inhabitants.</span>
          </li>
          <li className="flex gap-3">
            <Heart size={18} className="text-pink-300 shrink-0 mt-0.5" />
            <span><b>Bless or curse</b> regions, summon rain to douse fires, and follow every birth and death in the World Chronicle.</span>
          </li>
        </ul>

        <button
          type="button"
          className="tool-btn w-full py-2.5 bg-primary hover:bg-primary/80 transition-colors rounded-lg font-semibold text-white"
          onClick={() => setShowHelp(false)}
        >
          Begin Creation
        </button>
      </div>
    </div>
  );
};

export default HelpOverlay;
