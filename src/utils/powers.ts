// The power catalogue.
//
// WorldBox organises 374 powers into 8 tabs, and every one carries a one-line
// description with a joke in it. That writing is most of the game's
// personality and costs nothing but the writing
// (docs/project-tracker/06-WORLDBOX-COMPLETE-REFERENCE.md section 2).
//
// Ours is deliberately a shorter list with the same care taken over it. The
// catalogue lives apart from the bar that draws it so powers can be added,
// reordered and re-tabbed without touching layout code.
import type { Tool } from '../store/gameStore';

export type PowerTabId =
  | 'world'
  | 'shape'
  | 'observe'
  | 'life'
  | 'nature'
  | 'ruin'
  | 'divine'
  | 'unit';

export interface PowerTab {
  id: PowerTabId;
  label: string;
  /** Lucide icon name, resolved by the bar. */
  icon: string;
  blurb: string;
}

export const POWER_TABS: PowerTab[] = [
  { id: 'world', label: 'World', icon: 'Globe2', blurb: 'The world itself, and the rules it runs on' },
  { id: 'shape', label: 'Shape', icon: 'Mountain', blurb: 'Raise it, drown it, carve it' },
  { id: 'observe', label: 'Observe', icon: 'Eye', blurb: 'Ways of looking at what you have made' },
  { id: 'life', label: 'Life', icon: 'PawPrint', blurb: 'Fill it with things that want' },
  { id: 'nature', label: 'Nature', icon: 'Leaf', blurb: 'Growth, weather and what lies underground' },
  { id: 'ruin', label: 'Ruin', icon: 'Flame', blurb: 'Everything you will regret' },
  { id: 'divine', label: 'Divine', icon: 'Sparkles', blurb: 'Mercy and its opposite' },
];

/** A clickable power that selects a tool. */
export interface PowerEntry {
  kind: 'tool';
  id: NonNullable<Tool>;
  tab: PowerTabId;
  label: string;
  icon: string;
  /** What it does. */
  hint: string;
  /** Why you will do it anyway. */
  quip: string;
}

export const POWERS: PowerEntry[] = [
  // -- Observe --
  {
    kind: 'tool', id: 'select', tab: 'observe', label: 'Inspect', icon: 'MousePointer2',
    hint: 'Click a tile or creature to open it up.',
    quip: 'Everyone deserves to be looked at closely, at least once.',
  },

  // -- Shape --
  {
    kind: 'tool', id: 'raise-terrain', tab: 'shape', label: 'Raise', icon: 'ArrowUp',
    hint: 'Push the ground upward.',
    quip: 'Mountains have to start somewhere.',
  },
  {
    kind: 'tool', id: 'lower-terrain', tab: 'shape', label: 'Lower', icon: 'ArrowDown',
    hint: 'Sink the ground toward the sea.',
    quip: 'Gravity, applied with intent.',
  },
  {
    kind: 'tool', id: 'place-water', tab: 'shape', label: 'Water', icon: 'Waves',
    hint: 'Flood tiles into shallow water.',
    quip: 'Nobody asked the villagers.',
  },
  {
    kind: 'tool', id: 'place-mountain', tab: 'shape', label: 'Mountain', icon: 'Mountain',
    hint: 'Raise impassable peaks.',
    quip: 'A wall, but geological.',
  },
  {
    kind: 'tool', id: 'place-forest', tab: 'shape', label: 'Forest', icon: 'TreePine',
    hint: 'Grow woodland on open ground.',
    quip: 'Instant shade. Ask no questions.',
  },

  // -- Life --
  {
    kind: 'tool', id: 'spawn-human', tab: 'life', label: 'Humans', icon: 'Users',
    hint: 'Adaptable, sociable, and quick to organise.',
    quip: 'They will name a kingdom after themselves within the hour.',
  },
  {
    kind: 'tool', id: 'spawn-elf', tab: 'life', label: 'Elves', icon: 'Sprout',
    hint: 'Long-lived and clever, poor at hurrying.',
    quip: 'Five centuries and still no sense of urgency.',
  },
  {
    kind: 'tool', id: 'spawn-dwarf', tab: 'life', label: 'Dwarves', icon: 'Axe',
    hint: 'Tough, stubborn, and fond of stone.',
    quip: 'Their towns are tidier than yours.',
  },
  {
    kind: 'tool', id: 'spawn-orc', tab: 'life', label: 'Orcs', icon: 'Swords',
    hint: 'Strong, numerous, and impatient with neighbours.',
    quip: 'They keep a grudge the way others keep livestock.',
  },
  {
    kind: 'tool', id: 'spawn-animal', tab: 'life', label: 'Wildlife', icon: 'PawPrint',
    hint: 'Whatever suits the ground you clicked.',
    quip: 'Herds form on their own. So do the wolves that follow them.',
  },
  {
    kind: 'tool', id: 'spawn-monster', tab: 'life', label: 'Monsters', icon: 'Ghost',
    hint: 'Dragons, demons, and the restless dead.',
    quip: 'A decision you get to watch play out.',
  },

  // -- Nature --
  {
    kind: 'tool', id: 'plant-trees', tab: 'nature', label: 'Trees', icon: 'Trees',
    hint: 'Plant timber and food where it will grow.',
    quip: 'Villages notice. Villages always notice.',
  },
  {
    kind: 'tool', id: 'unearth-minerals', tab: 'nature', label: 'Minerals', icon: 'Gem',
    hint: 'Surface a vein of ore.',
    quip: 'You have just decided where the next war happens.',
  },
  {
    kind: 'tool', id: 'summon-rain', tab: 'nature', label: 'Rain', icon: 'CloudRain',
    hint: 'Summon or dismiss rain. Puts out fires.',
    quip: 'The cheapest apology available to a god.',
  },

  // -- Ruin --
  {
    kind: 'tool', id: 'fire', tab: 'ruin', label: 'Fire', icon: 'Flame',
    hint: 'Set the land alight. Dry ground spreads it further.',
    quip: 'It goes where the wind and the grass agree.',
  },
  {
    kind: 'tool', id: 'earthquake', tab: 'ruin', label: 'Quake', icon: 'Activity',
    hint: 'Shatter the ground and everything standing on it.',
    quip: 'Rearranging the furniture.',
  },
  {
    kind: 'tool', id: 'meteor', tab: 'ruin', label: 'Meteor', icon: 'Rocket',
    hint: 'Call down a rock from the sky.',
    quip: 'Nothing personal. Mostly.',
  },
  {
    kind: 'tool', id: 'lightning', tab: 'ruin', label: 'Lightning', icon: 'Zap',
    hint: 'Strike a single tile from a clear sky.',
    quip: 'Precise, theatrical, deniable.',
  },

  // -- Divine --
  {
    kind: 'tool', id: 'blessing', tab: 'divine', label: 'Bless', icon: 'Heart',
    hint: 'Heal, fertilise, purify, and put out fires.',
    quip: 'Mercy is a tool like any other.',
  },
  {
    kind: 'tool', id: 'curse', tab: 'divine', label: 'Curse', icon: 'Skull',
    hint: 'Corrupt the land and everything on it.',
    quip: 'The ground remembers this one.',
  },
  {
    kind: 'tool', id: 'poke', tab: 'divine', label: 'Poke', icon: 'Pointer',
    hint: 'Prod a creature. It barely hurts. It notices.',
    quip: 'They cannot see you and they know something is there.',
  },

  // -- Erasers --
  //
  // WorldBox gives every creative power an undo shaped like a tool rather than
  // a menu item — a sickle for plants, a sponge for terrain, a life eraser
  // (06-WORLDBOX-COMPLETE-REFERENCE.md §2). Building something you cannot
  // unbuild makes a sandbox feel like a form you are filling in.
  {
    kind: 'tool', id: 'erase-forest', tab: 'shape', label: 'Clear', icon: 'Scissors',
    hint: 'Cut back trees and undergrowth, leaving the ground.',
    quip: 'Someone will want it back. That is their problem.',
  },
  {
    kind: 'tool', id: 'erase-buildings', tab: 'shape', label: 'Demolish', icon: 'Hammer',
    hint: 'Flatten whatever has been built here.',
    quip: 'They took a season over that.',
  },
  {
    kind: 'tool', id: 'douse', tab: 'nature', label: 'Douse', icon: 'Droplets',
    hint: 'Put out fires without waiting for the rain.',
    quip: 'The one merciful thing in this tab.',
  },
  {
    kind: 'tool', id: 'erase-life', tab: 'divine', label: 'Unmake', icon: 'Eraser',
    hint: 'Remove creatures from the world. No corpse, no chronicle entry.',
    quip: 'Not death. Something tidier and worse.',
  },
];

export const POWERS_BY_TAB = (tab: PowerTabId): PowerEntry[] =>
  POWERS.filter(power => power.tab === tab);

/** Look up a power by the tool it selects. */
export const POWER_BY_TOOL = new Map(POWERS.map(power => [power.id, power]));
