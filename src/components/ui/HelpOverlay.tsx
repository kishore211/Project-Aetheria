import { useGameStore } from '../../store/gameStore';
import {
  Crown, Hand, HardDriveDownload, Heart, Map as MapIcon,
  Mountain, Scale, Sparkles, Users, Zap,
} from 'lucide-react';

const ROWS = [
  {
    icon: <Hand size={18} className="text-sky-300" />,
    title: 'Shape it',
    body: 'Pick a power on the bar below, choose a brush size, then click the world. Drag to pan, scroll to zoom, right-drag to turn.',
  },
  {
    icon: <Mountain size={18} className="text-stone-300" />,
    title: 'Terraform',
    body: 'Raise land, carve seas, push up mountains, plant forests and surface veins of ore.',
  },
  {
    icon: <Users size={18} className="text-emerald-300" />,
    title: 'Fill it with life',
    body: 'Humans, elves, dwarves and orcs, plus wildlife and monsters. Every creature drinks, forages, hunts, flees, sleeps and breeds on its own — and passes its traits to its children.',
  },
  {
    icon: <Crown size={18} className="text-amber-300" />,
    title: 'Watch borders grow',
    body: 'Put three of one race on good land and they found a village, name a kingdom, gather timber, build, and claim the ground outward. Neighbours build tension, then war.',
  },
  {
    icon: <Zap size={18} className="text-yellow-300" />,
    title: 'Break it',
    body: 'Meteors, lightning, fire and earthquakes. Fire spreads through woodland and rain puts it out.',
  },
  {
    icon: <Heart size={18} className="text-pink-300" />,
    title: 'Bless or curse',
    body: 'Heal and fertilise a region, or corrupt it. Every act is written into the World Chronicle.',
  },
  {
    icon: <MapIcon size={18} className="text-indigo-300" />,
    title: 'Find your way',
    body: 'Click the minimap or any chronicle entry to fly there. Inspect a creature and follow it to watch one life play out.',
  },
  {
    icon: <Scale size={18} className="text-orange-300" />,
    title: 'Rewrite the rules',
    body: 'World Laws turn off aging, hunger, breeding, fire spread, settlements or war — the sandbox is yours.',
  },
  {
    icon: <HardDriveDownload size={18} className="text-slate-300" />,
    title: 'Keep it',
    body: 'Three save slots plus an autosave, or export a world to a file and bring it back later.',
  },
];

/**
 * The bindings, printed. A hotkey nobody can find is a hotkey nobody uses, and
 * the bar only has room to show the nine number keys.
 */
const KEYS: Array<[string, string]> = [
  ['Space', 'Pause or resume time'],
  ['1 – 0', 'Your bound power, or the nth in the open tab'],
  ['Ctrl + digit', 'Bind what you are holding to that slot'],
  ['Tab', 'Next tab of powers (Shift+Tab back)'],
  ['Z / X', 'Cycle how the map is painted'],
  ['F', 'Follow whatever is under the cursor'],
  ['H', 'Hide the whole interface'],
  ['N', 'Kingdom and village names'],
  ['M', 'Minimap'],
  ['I', 'Icons above creatures'],
  ['L', 'World laws'],
  ['+ / −', 'Zoom in and out'],
  ['Esc', 'Back out one step'],
];

const HelpOverlay = () => {
  const { showHelp, setShowHelp } = useGameStore();

  if (!showHelp) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="ui-modal max-w-lg w-full max-h-[88vh] overflow-y-auto bg-secondary rounded-xl shadow-2xl border border-muted/50 p-6 text-foreground">
        <h1 className="text-2xl font-bold flex items-center gap-2 mb-1">
          <Sparkles className="text-amber-300" />
          Project Aetheria
        </h1>
        <p className="text-muted-foreground mb-5">
          You are the god of a living pixel world. There is nothing to win — only
          a world to make, and the stories it tells you back.
        </p>

        <ul className="space-y-3 text-sm mb-6">
          {ROWS.map((row) => (
            <li key={row.title} className="flex gap-3">
              <span className="shrink-0 mt-0.5">{row.icon}</span>
              <span>
                <b>{row.title}</b> — {row.body}
              </span>
            </li>
          ))}
        </ul>

        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Keyboard
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs mb-6">
          {KEYS.map(([key, what]) => (
            <li key={key} className="flex items-center gap-2">
              <kbd className="shrink-0 min-w-[3.1rem] text-center px-1.5 py-0.5 rounded border border-muted/60 border-b-2 bg-background/60 text-[0.65rem] font-semibold">
                {key}
              </kbd>
              <span className="text-muted-foreground">{what}</span>
            </li>
          ))}
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
