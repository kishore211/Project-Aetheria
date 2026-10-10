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
  | 'realm'
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
  { id: 'realm', label: 'Realms', icon: 'Crown', blurb: 'A word in the right ear' },
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
    kind: 'tool', id: 'uplift', tab: 'life', label: 'Uplift', icon: 'Sparkles',
    hint: 'Wake an animal into a person, or let a person go back.',
    quip: 'It works both ways, which is the interesting part.',
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
  // -- the rest of the bar: utils/extraPowers.ts --
  {
    kind: 'tool', id: 'paint-deep', tab: 'shape', label: 'Deep', icon: 'Waves',
    hint: 'Paint the deepest ocean.',
    quip: 'Somewhere for the big fish to think.',
  },
  {
    kind: 'tool', id: 'paint-ocean', tab: 'shape', label: 'Ocean', icon: 'Waves',
    hint: 'Paint open sea.',
    quip: 'Wet, blue, and in the way.',
  },
  {
    kind: 'tool', id: 'paint-shallow', tab: 'shape', label: 'Shallows', icon: 'Droplet',
    hint: 'Paint wading water along a coast.',
    quip: 'Deep enough for a boot, not for a boat.',
  },
  {
    kind: 'tool', id: 'paint-sand', tab: 'shape', label: 'Sand', icon: 'Shell',
    hint: 'Paint a beach.',
    quip: 'Every coast deserves somewhere to sit.',
  },
  {
    kind: 'tool', id: 'paint-soil', tab: 'shape', label: 'Soil', icon: 'Sprout',
    hint: 'Paint plain, fertile ground.',
    quip: 'A blank page, with worms.',
  },
  {
    kind: 'tool', id: 'paint-hills', tab: 'shape', label: 'Hills', icon: 'MountainSnow',
    hint: 'Paint rolling high ground.',
    quip: 'Good for watchtowers and complaining.',
  },
  {
    kind: 'tool', id: 'paint-summit', tab: 'shape', label: 'Summit', icon: 'Mountain',
    hint: 'Paint a snow-capped peak.',
    quip: 'Nobody lives up there, which is the point.',
  },
  {
    kind: 'tool', id: 'sponge', tab: 'shape', label: 'Sponge', icon: 'Droplets',
    hint: 'Soak up water and leave dry land.',
    quip: 'The sea had it coming.',
  },
  {
    kind: 'tool', id: 'stamp-island', tab: 'shape', label: 'Island', icon: 'Palmtree',
    hint: 'Raise a whole island in one go.',
    quip: 'Some assembly required. Inhabitants not included.',
  },
  {
    kind: 'tool', id: 'stamp-lake', tab: 'shape', label: 'Lake', icon: 'Waves',
    hint: 'Sink a round lake into the ground.',
    quip: 'A mirror for the sky, and somewhere to drown.',
  },
  {
    kind: 'tool', id: 'stamp-atoll', tab: 'shape', label: 'Atoll', icon: 'CircleDot',
    hint: 'A ring of sand around a lagoon.',
    quip: 'Paradise, in the shape of a doughnut.',
  },
  {
    kind: 'tool', id: 'seed-grass', tab: 'nature', label: 'Grassland', icon: 'Leaf',
    hint: 'Seed plain meadow.',
    quip: 'The default setting for a nice day.',
  },
  {
    kind: 'tool', id: 'seed-desert', tab: 'nature', label: 'Desert', icon: 'Sun',
    hint: 'Seed a desert. Trees wither.',
    quip: 'Sand, sun, and a strong opinion about water.',
  },
  {
    kind: 'tool', id: 'seed-savanna', tab: 'nature', label: 'Savanna', icon: 'Wheat',
    hint: 'Seed dry grassland with the odd tree.',
    quip: 'Somebody is always being hunted out there.',
  },
  {
    kind: 'tool', id: 'seed-jungle', tab: 'nature', label: 'Jungle', icon: 'TreePalm',
    hint: 'Seed a dense rainforest.',
    quip: 'Everything in it is either lunch or hungry.',
  },
  {
    kind: 'tool', id: 'seed-swamp', tab: 'nature', label: 'Swamp', icon: 'Bug',
    hint: 'Seed a bog.',
    quip: 'Takes a boot for every mile.',
  },
  {
    kind: 'tool', id: 'seed-tundra', tab: 'nature', label: 'Tundra', icon: 'ThermometerSnowflake',
    hint: 'Seed cold, open steppe.',
    quip: 'Wide, bleak, and quite proud of it.',
  },
  {
    kind: 'tool', id: 'seed-snow', tab: 'nature', label: 'Snow', icon: 'Snowflake',
    hint: 'Seed a snowfield.',
    quip: 'Beautiful for about an hour.',
  },
  {
    kind: 'tool', id: 'seed-enchanted', tab: 'nature', label: 'Enchanted', icon: 'WandSparkles',
    hint: 'Seed an enchanted wood that glows.',
    quip: 'Lit from somewhere that is not the sky.',
  },
  {
    kind: 'tool', id: 'seed-bloom', tab: 'nature', label: 'Bloom', icon: 'Flower',
    hint: 'Seed a meadow in permanent flower.',
    quip: 'The bees are thrilled. The bees are always thrilled.',
  },
  {
    kind: 'tool', id: 'seed-corrupt', tab: 'nature', label: 'Corruption', icon: 'Biohazard',
    hint: 'Seed corrupted, sickly ground.',
    quip: 'Something is wrong with the dirt, and it spreads.',
  },
  {
    kind: 'tool', id: 'seed-candy', tab: 'nature', label: 'Candy', icon: 'Sparkle',
    hint: 'Seed a land of candy and frosting.',
    quip: 'A dentist\u2019s nightmare, lovingly made.',
  },
  {
    kind: 'tool', id: 'seed-crystal', tab: 'nature', label: 'Crystal', icon: 'Gem',
    hint: 'Seed a crystal land that rings underfoot.',
    quip: 'Pretty, cold, and faintly musical.',
  },
  {
    kind: 'tool', id: 'seed-mushroom', tab: 'nature', label: 'Mushroom', icon: 'Bean',
    hint: 'Seed a damp land of giant toadstools.',
    quip: 'Fungus, but with ambition.',
  },
  {
    kind: 'tool', id: 'seed-infernal', tab: 'nature', label: 'Infernal', icon: 'Flame',
    hint: 'Seed a burning, hellish land. Hurts to stand on.',
    quip: 'The floor is lava, and it means it.',
  },
  {
    kind: 'tool', id: 'seed-wasteland', tab: 'nature', label: 'Wasteland', icon: 'Wind',
    hint: 'Seed a dead, grey wasteland.',
    quip: 'Even the weeds gave up.',
  },
  {
    kind: 'tool', id: 'rain-cloud', tab: 'nature', label: 'Rain Cloud', icon: 'CloudRain',
    hint: 'Send a rain cloud here. Cools and waters.',
    quip: 'A small apology, delivered by air.',
  },
  {
    kind: 'tool', id: 'snow-cloud', tab: 'nature', label: 'Snow Cloud', icon: 'CloudSnow',
    hint: 'Send a snow cloud here.',
    quip: 'Winter, by appointment.',
  },
  {
    kind: 'tool', id: 'seed-cloud', tab: 'nature', label: 'Seed Cloud', icon: 'Cloud',
    hint: 'A cloud that rains saplings.',
    quip: 'Reforestation, from above.',
  },
  {
    kind: 'tool', id: 'heat', tab: 'nature', label: 'Heat', icon: 'ThermometerSun',
    hint: 'Warm the ground. Thaws ice; enough of it burns.',
    quip: 'Turn it up. Keep turning.',
  },
  {
    kind: 'tool', id: 'cold', tab: 'nature', label: 'Cold', icon: 'ThermometerSnowflake',
    hint: 'Chill the ground. Freezes water.',
    quip: 'For when a lake needs to be a floor.',
  },
  {
    kind: 'tool', id: 'tornado', tab: 'nature', label: 'Tornado', icon: 'Tornado',
    hint: 'A tornado that wanders, uprooting trees and tossing creatures.',
    quip: 'It has somewhere to be, and it is everywhere.',
  },
  {
    kind: 'tool', id: 'volcano', tab: 'nature', label: 'Volcano', icon: 'Mountain',
    hint: 'Raise a volcano that keeps erupting for a while.',
    quip: 'A mountain with a temper.',
  },
  {
    kind: 'tool', id: 'geyser', tab: 'nature', label: 'Geyser', icon: 'Droplets',
    hint: 'Open a spring. Waters and fertilises the land around it.',
    quip: 'Hot water, free, forever. Mostly.',
  },
  {
    kind: 'tool', id: 'grenade', tab: 'ruin', label: 'Grenade', icon: 'Bomb',
    hint: 'A small explosion.',
    quip: 'Pull the pin. Then think about it.',
  },
  {
    kind: 'tool', id: 'bomb', tab: 'ruin', label: 'Bomb', icon: 'Bomb',
    hint: 'A large explosion that leaves a crater.',
    quip: 'For problems a grenade only annoyed.',
  },
  {
    kind: 'tool', id: 'napalm', tab: 'ruin', label: 'Napalm', icon: 'Flame',
    hint: 'Set a wide area on fire at once.',
    quip: 'It sticks. That is rather the point.',
  },
  {
    kind: 'tool', id: 'atomic', tab: 'ruin', label: 'Atomic', icon: 'Radiation',
    hint: 'A blast that wipes out everything for miles and leaves ash.',
    quip: 'A second sun, briefly. Then nothing.',
  },
  {
    kind: 'tool', id: 'void-bomb', tab: 'ruin', label: 'Void', icon: 'Orbit',
    hint: 'Erase a piece of the world into deep sea.',
    quip: 'Not destroyed. Absent.',
  },
  {
    kind: 'tool', id: 'lava', tab: 'ruin', label: 'Lava', icon: 'Flame',
    hint: 'Pour molten rock.',
    quip: 'The floor is, in fact, lava.',
  },
  {
    kind: 'tool', id: 'acid', tab: 'ruin', label: 'Acid', icon: 'FlaskConical',
    hint: 'Acid rain that dissolves life and growth.',
    quip: 'The ground will not forgive this.',
  },
  {
    kind: 'tool', id: 'plague', tab: 'ruin', label: 'Plague', icon: 'Biohazard',
    hint: 'Infect people. It spreads by contact, and the dead get up again.',
    quip: 'Feeling a little peaky? It will pass. In a sense.',
  },
  {
    kind: 'tool', id: 'madness', tab: 'ruin', label: 'Madness', icon: 'Brain',
    hint: 'Drive creatures into a rage at whoever is nearest.',
    quip: 'Blaming the gods, and settling for the neighbours.',
  },
  {
    kind: 'tool', id: 'confusion', tab: 'ruin', label: 'Confusion', icon: 'Spline',
    hint: 'Make creatures forget which way anything is.',
    quip: 'Reality slips a little sideways.',
  },
  {
    kind: 'tool', id: 'divine-light', tab: 'divine', label: 'Light', icon: 'Sun',
    hint: 'Heal, cure plague and madness, end schemes, put out fires.',
    quip: 'The one power everyone is glad of.',
  },
  {
    kind: 'tool', id: 'shield', tab: 'divine', label: 'Shield', icon: 'Shield',
    hint: 'Make creatures immune to harm for a while.',
    quip: 'Nothing gets in. Nothing at all.',
  },
  {
    kind: 'tool', id: 'coffee', tab: 'divine', label: 'Coffee', icon: 'Coffee',
    hint: 'Make creatures very fast for a while.',
    quip: 'Moving at the speed of a bad idea.',
  },
  {
    kind: 'tool', id: 'inspire', tab: 'divine', label: 'Inspire', icon: 'Lightbulb',
    hint: 'Inspire creatures: faster, harder-hitting, happier.',
    quip: 'A good idea, delivered directly.',
  },
  {
    kind: 'tool', id: 'sleep', tab: 'divine', label: 'Sleep', icon: 'Moon',
    hint: 'Put creatures to sleep where they stand.',
    quip: 'Sweet dreams, whether they wanted them or not.',
  },
  {
    kind: 'tool', id: 'clone', tab: 'divine', label: 'Clone', icon: 'Copy',
    hint: 'Make a copy of every creature here.',
    quip: 'Two of everything. Ask the first one how it feels.',
  },
  {
    kind: 'tool', id: 'dust-culture', tab: 'divine', label: 'Forget Culture', icon: 'Wind',
    hint: 'Make people forget their culture. They pick one up again by talking.',
    quip: 'Who were we, again?',
  },
  {
    kind: 'tool', id: 'dust-language', tab: 'divine', label: 'Forget Language', icon: 'Wind',
    hint: 'Make people forget their language.',
    quip: 'Nobody can find the word for "word".',
  },
  {
    kind: 'tool', id: 'dust-religion', tab: 'divine', label: 'Forget Faith', icon: 'Wind',
    hint: 'Make people forget their religion.',
    quip: 'The gods are not offended. Mostly.',
  },
  {
    kind: 'tool', id: 'dust-everything', tab: 'divine', label: 'Forget All', icon: 'Sparkles',
    hint: 'Culture, language and faith, all at once.',
    quip: 'A clean slate, and a very confused afternoon.',
  },
  {
    kind: 'tool', id: 'diplo-friendship', tab: 'realm', label: 'Friendship', icon: 'Handshake',
    hint: 'Click a kingdom: make peace with everyone.',
    quip: 'Nobody can remember what the quarrel was.',
  },
  {
    kind: 'tool', id: 'diplo-unity', tab: 'realm', label: 'Unity', icon: 'HeartHandshake',
    hint: 'Click a kingdom: ally it with its nearest neighbour.',
    quip: 'Stronger together. For now.',
  },
  {
    kind: 'tool', id: 'diplo-spite', tab: 'realm', label: 'Spite', icon: 'Megaphone',
    hint: 'Click a kingdom: every other realm comes to hate it.',
    quip: 'Everyone agrees it is their fault.',
  },
  {
    kind: 'tool', id: 'diplo-whisper', tab: 'realm', label: 'Whisper of War', icon: 'Swords',
    hint: 'Click a kingdom: it declares war on the neighbour it resents most.',
    quip: 'A voice in the king’s ear says they are weak.',
  },
  {
    kind: 'tool', id: 'diplo-discord', tab: 'realm', label: 'Discord', icon: 'Unlink',
    hint: 'Click a kingdom: its alliances fall apart.',
    quip: 'Old friends find they never really liked each other.',
  },
  {
    kind: 'tool', id: 'diplo-inspiration', tab: 'realm', label: 'Independence', icon: 'Flag',
    hint: 'Click a province: it breaks away as its own kingdom.',
    quip: 'A town struck by the idea that it could rule itself.',
  },
  {
    kind: 'tool', id: 'spawn-wolf', tab: 'life', label: 'Wolf', icon: 'Dog',
    hint: 'Hunts in packs.',
    quip: 'Doing arithmetic about you, and finishing it quickly.',
  },
  {
    kind: 'tool', id: 'spawn-bear', tab: 'life', label: 'Bear', icon: 'PawPrint',
    hint: 'Big, solitary, and best left alone.',
    quip: 'Has never once had to explain itself.',
  },
  {
    kind: 'tool', id: 'spawn-deer', tab: 'life', label: 'Deer', icon: 'Rabbit',
    hint: 'Grazes and startles.',
    quip: 'Committed to leaving, pending a decision about which way.',
  },
  {
    kind: 'tool', id: 'spawn-rabbit', tab: 'life', label: 'Rabbit', icon: 'Rabbit',
    hint: 'Breeds fast, feeds everything.',
    quip: 'The most successful strategy in the world is being elsewhere.',
  },
  {
    kind: 'tool', id: 'spawn-sheep', tab: 'life', label: 'Sheep', icon: 'Cloud',
    hint: 'Flocks and grazes.',
    quip: 'Has thought it through and concluded: grass.',
  },
  {
    kind: 'tool', id: 'spawn-chicken', tab: 'life', label: 'Chicken', icon: 'Egg',
    hint: 'Pecks about.',
    quip: 'No thoughts. Enormous confidence.',
  },
  {
    kind: 'tool', id: 'spawn-fox', tab: 'life', label: 'Fox', icon: 'Squirrel',
    hint: 'Small hunter, smaller conscience.',
    quip: 'Has already worked out where the chickens are.',
  },
  {
    kind: 'tool', id: 'spawn-snake', tab: 'life', label: 'Snake', icon: 'Spline',
    hint: 'Lurks in dry and wet places.',
    quip: 'Would like everyone to stop treading near it.',
  },
  {
    kind: 'tool', id: 'spawn-bird', tab: 'life', label: 'Bird', icon: 'Bird',
    hint: 'Flies anywhere.',
    quip: 'Has seen the whole map and is not impressed.',
  },
  {
    kind: 'tool', id: 'spawn-fish', tab: 'life', label: 'Fish', icon: 'Fish',
    hint: 'Lives in water. Click water.',
    quip: 'Untroubled by everything above the waterline.',
  },
  {
    kind: 'tool', id: 'spawn-cat', tab: 'life', label: 'Cat', icon: 'Cat',
    hint: 'Hunts rats and owns villages.',
    quip: 'It allows the village to stay.',
  },
  {
    kind: 'tool', id: 'spawn-dog', tab: 'life', label: 'Dog', icon: 'Dog',
    hint: 'Loyal, cheerful, chases small things.',
    quip: 'A good dog. They are all good dogs.',
  },
  {
    kind: 'tool', id: 'spawn-cow', tab: 'life', label: 'Cow', icon: 'PawPrint',
    hint: 'Grazes in herds on open grass.',
    quip: 'A herd of moos.',
  },
  {
    kind: 'tool', id: 'spawn-pig', tab: 'life', label: 'Pig', icon: 'PiggyBank',
    hint: 'Roots in fields and woods.',
    quip: 'Smarter than it smells.',
  },
  {
    kind: 'tool', id: 'spawn-crab', tab: 'life', label: 'Crab', icon: 'Shell',
    hint: 'Scuttles along beaches.',
    quip: 'Sideways is a direction too.',
  },
  {
    kind: 'tool', id: 'spawn-frog', tab: 'life', label: 'Frog', icon: 'Bug',
    hint: 'Lives in swamps and marshes.',
    quip: 'Ribbit, it says, meaning everything.',
  },
  {
    kind: 'tool', id: 'spawn-penguin', tab: 'life', label: 'Penguin', icon: 'Snowflake',
    hint: 'Waddles on ice and snow, eats fish.',
    quip: 'Dressed for dinner, forever.',
  },
  {
    kind: 'tool', id: 'spawn-turtle', tab: 'life', label: 'Turtle', icon: 'Shell',
    hint: 'Slow, tough, and very long-lived.',
    quip: 'It will outlive the kingdom. Probably two.',
  },
  {
    kind: 'tool', id: 'spawn-monkey', tab: 'life', label: 'Monkey', icon: 'Banana',
    hint: 'Troops of them in the jungle.',
    quip: 'Somebody will lose a sandwich.',
  },
  {
    kind: 'tool', id: 'spawn-rat', tab: 'life', label: 'Rat', icon: 'Rat',
    hint: 'Breeds fast wherever there is food.',
    quip: 'Where there are granaries, there are rats.',
  },
  {
    kind: 'tool', id: 'spawn-crocodile', tab: 'life', label: 'Crocodile', icon: 'Spline',
    hint: 'Lurks in swamps and shallows. Eats anything.',
    quip: 'A log with teeth.',
  },
  {
    kind: 'tool', id: 'spawn-piranha', tab: 'life', label: 'Piranha', icon: 'Fish',
    hint: 'Schools of biters. Click water.',
    quip: 'The river is no longer for swimming.',
  },
  {
    kind: 'tool', id: 'spawn-hyena', tab: 'life', label: 'Hyena', icon: 'Dog',
    hint: 'Savanna scavengers that hunt in packs.',
    quip: 'Laughing at something. Possibly you.',
  },
  {
    kind: 'tool', id: 'spawn-rhino', tab: 'life', label: 'Rhino', icon: 'Mountain',
    hint: 'Armoured, horned, and short-tempered.',
    quip: 'It cannot see you. It is charging anyway.',
  },
  {
    kind: 'tool', id: 'spawn-buffalo', tab: 'life', label: 'Buffalo', icon: 'Mountain',
    hint: 'Great herds on the plains.',
    quip: 'The ground shakes when they decide to move.',
  },
  {
    kind: 'tool', id: 'spawn-unicorn', tab: 'life', label: 'Unicorn', icon: 'WandSparkles',
    hint: 'A rare and magical beast.',
    quip: 'Exactly as real as you need it to be.',
  },
  {
    kind: 'tool', id: 'spawn-fairy', tab: 'life', label: 'Fairy', icon: 'Sparkle',
    hint: 'Tiny, winged and mischievous.',
    quip: 'Has a favour to grant and a price not yet named.',
  },
  {
    kind: 'tool', id: 'spawn-ghost', tab: 'life', label: 'Ghost', icon: 'Ghost',
    hint: 'A restless spirit that haunts the living.',
    quip: 'Unfinished business.',
  },
  {
    kind: 'tool', id: 'spawn-mage', tab: 'life', label: 'Evil Mage', icon: 'Wand',
    hint: 'A dark sorcerer that attacks villages.',
    quip: 'Read the wrong book, all the way through.',
  },
  {
    kind: 'tool', id: 'spawn-druid', tab: 'life', label: 'Druid', icon: 'Leaf',
    hint: 'A keeper of the forest.',
    quip: 'Speaks for the trees.',
  },
  {
    kind: 'tool', id: 'spawn-alien', tab: 'life', label: 'Alien', icon: 'Orbit',
    hint: 'Visitors from the stars, curious about cows.',
    quip: 'We come in peace. Mostly.',
  },
  {
    kind: 'tool', id: 'spawn-snowman', tab: 'life', label: 'Snowman', icon: 'Snowflake',
    hint: 'A cheerful snowman that has come to life.',
    quip: 'Doomed by spring, and determined to enjoy it.',
  },
  {
    kind: 'tool', id: 'spawn-goat', tab: 'life', label: 'Goat', icon: 'Mountain',
    hint: 'Sure-footed grazers of hills and peaks.',
    quip: 'Will eat the power bar if you let it.',
  },
  {
    kind: 'tool', id: 'spawn-camel', tab: 'life', label: 'Camel', icon: 'Squirrel',
    hint: 'Desert walkers that go weeks without a drink.',
    quip: 'Two humps, no opinions.',
  },
  {
    kind: 'tool', id: 'spawn-ostrich', tab: 'life', label: 'Ostrich', icon: 'Bird',
    hint: 'Fast flightless birds of the savanna.',
    quip: 'Faster than anything that wants to eat it.',
  },
  {
    kind: 'tool', id: 'spawn-flamingo', tab: 'life', label: 'Flamingo', icon: 'Bird',
    hint: 'Pink waders of marsh and shallows.',
    quip: 'Stands on one leg out of pure confidence.',
  },
  {
    kind: 'tool', id: 'spawn-seal', tab: 'life', label: 'Seal', icon: 'Fish',
    hint: 'Cold-coast swimmers that fish and bask.',
    quip: 'A dog that chose the sea.',
  },
  {
    kind: 'tool', id: 'spawn-polar_bear', tab: 'life', label: 'Polar Bear', icon: 'PawPrint',
    hint: 'The great hunter of the ice.',
    quip: 'Cuddly from a very great distance.',
  },
  {
    kind: 'tool', id: 'spawn-beetle', tab: 'life', label: 'Beetle', icon: 'Bug',
    hint: 'Little armoured crawlers. Bird food.',
    quip: 'Has outlived empires. Will outlive yours.',
  },
  {
    kind: 'tool', id: 'spawn-bee', tab: 'life', label: 'Bee', icon: 'Flower',
    hint: 'Pollinators: the meadow grows richer where they work.',
    quip: 'Busy, and proud of it.',
  },
  {
    kind: 'tool', id: 'spawn-butterfly', tab: 'life', label: 'Butterfly', icon: 'Sparkle',
    hint: 'Drifts over meadows. Harmless and lovely.',
    quip: 'It was a caterpillar once. Do not mention it.',
  },
  {
    kind: 'tool', id: 'spawn-grasshopper', tab: 'life', label: 'Grasshopper', icon: 'Leaf',
    hint: 'Meadow jumpers that birds and frogs adore.',
    quip: 'Fiddling while the meadow burns.',
  },
  {
    kind: 'tool', id: 'spawn-necromancer', tab: 'life', label: 'Necromancer', icon: 'Skull',
    hint: 'Raises skeletons from the earth around it.',
    quip: 'Death is a phase. It intends to help you through it.',
  },
  {
    kind: 'tool', id: 'spawn-plague_doctor', tab: 'life', label: 'Plague Doctor', icon: 'FlaskConical',
    hint: 'Walks the sick lands curing the plague.',
    quip: 'The beak is full of herbs. The bill is full of fees.',
  },
  {
    kind: 'tool', id: 'spawn-fire_skull', tab: 'life', label: 'Fire Skull', icon: 'Flame',
    hint: 'A burning skull that sets the land alight.',
    quip: 'Hot-headed, literally.',
  },
  {
    kind: 'tool', id: 'spawn-cold_one', tab: 'life', label: 'Cold One', icon: 'Snowflake',
    hint: 'Turns the ground to snow wherever it walks.',
    quip: 'Brings winter with it, like a bad houseguest.',
  },
  {
    kind: 'tool', id: 'spawn-ufo', tab: 'life', label: 'UFO', icon: 'Orbit',
    hint: 'Visitors from above. They take what they like.',
    quip: 'Probably here for the cows.',
  },
  {
    kind: 'tool', id: 'spawn-sand_spider', tab: 'life', label: 'Sand Spider', icon: 'Bug',
    hint: 'Desert ambushers that hunt in the dunes.',
    quip: 'Eight legs. Zero chill.',
  },
  {
    kind: 'tool', id: 'spawn-acid_blob', tab: 'life', label: 'Acid Blob', icon: 'Droplet',
    hint: 'A wobbling glob of acid that dissolves the living.',
    quip: 'Squishy, and the bad kind of squishy.',
  },
  {
    kind: 'tool', id: 'spawn-lil_pumpkin', tab: 'life', label: 'Lil Pumpkin', icon: 'Sprout',
    hint: 'A cheerful little living pumpkin.',
    quip: 'Spooky, technically.',
  },
  {
    kind: 'tool', id: 'spawn-gummy_bear', tab: 'life', label: 'Gummy Bear', icon: 'Heart',
    hint: 'Sweet critters of the candy lands.',
    quip: 'Do not eat. It has a family.',
  },
  {
    kind: 'tool', id: 'spawn-crabzilla', tab: 'life', label: 'Crabzilla', icon: 'Shell',
    hint: 'A titanic crab that flattens towns.',
    quip: 'It came from the sea. It wants the land. It wants everything.',
  },
  {
    kind: 'tool', id: 'spawn-dragon', tab: 'life', label: 'Dragon', icon: 'Flame',
    hint: 'Flies, burns, and is very hard to kill.',
    quip: 'Regards your walls as a suggestion.',
  },
  {
    kind: 'tool', id: 'spawn-demon', tab: 'life', label: 'Demon', icon: 'Skull',
    hint: 'Hostile to everything.',
    quip: 'Here on business. The business is bad.',
  },
  {
    kind: 'tool', id: 'spawn-zombie', tab: 'life', label: 'Zombie', icon: 'Ghost',
    hint: 'Shambles toward the living.',
    quip: 'Wants something, has forgotten what, still going.',
  },
  {
    kind: 'tool', id: 'spawn-skeleton', tab: 'life', label: 'Skeleton', icon: 'Bone',
    hint: 'Rattles and fights.',
    quip: 'Somehow still upright.',
  },
  {
    kind: 'tool', id: 'spawn-elemental', tab: 'life', label: 'Elemental', icon: 'Wind',
    hint: 'A walking storm.',
    quip: 'A weather event that took an interest.',
  },
  {
    kind: 'tool', id: 'spawn-bandit', tab: 'life', label: 'Bandit', icon: 'Sword',
    hint: 'Robs and raids.',
    quip: 'Has a philosophy about property. You will not enjoy it.',
  },
];

export const POWERS_BY_TAB = (tab: PowerTabId): PowerEntry[] =>
  POWERS.filter(power => power.tab === tab);

/** Look up a power by the tool it selects. */
export const POWER_BY_TOOL = new Map(POWERS.map(power => [power.id, power]));
