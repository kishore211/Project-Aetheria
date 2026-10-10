// The voice of the thing.
//
// Phase 19.4, and the plan is explicit that this is a shipping requirement
// rather than a nice-to-have: a line for every creature and every biome. It is
// worth being explicit about why, because "write some jokes" reads like
// polish. It is not. A simulation with no voice is a spreadsheet with a camera
// on it — the player is told what a tile *is* and never what anyone thinks
// about it, and the difference between a world and a dataset is entirely a
// matter of whether anything in it has an opinion.
//
// Two rules held throughout:
//
// The joke is never at the player's expense, and never at a creature's. It is
// at the situation's. A line that mocks the thing you are looking at makes the
// world feel contemptible; a line that is wry *about* it makes the world feel
// inhabited.
//
// A given creature or tile always gets the same line. Rotating them is the
// obvious thing and it is wrong: a line that changes every time you look is
// noise, and one that does not becomes that creature's line — you learn it,
// and the next one you meet has its own.
import type { BiomeType, EntityType } from '../types/world';

/** Anything not listed simply has nothing to say, which is allowed. */
export const CREATURE_LINES: Partial<Record<EntityType, string[]>> = {
  human: [
    'Convinced the next hundred years will go better than the last hundred.',
    'Has a plan. The plan involves a barn.',
    'Would like it on record that this was somebody else’s idea.',
  ],
  elf: [
    'Has been meaning to get round to this for about ninety years.',
    'Remembers the forest before it was a forest, and mentions it.',
    'Finds the whole business of hurrying rather quaint.',
  ],
  dwarf: [
    'Regards the surface as a temporary arrangement.',
    'Has strong feelings about load-bearing walls.',
    'Measures a mountain by what is under it.',
  ],
  orc: [
    'Is not angry. This is just the face.',
    'Believes most problems are a shouting distance from solved.',
    'Would fight the sea if somebody held its coat.',
  ],
  wolf: [
    'Doing arithmetic about you, and finishing it quickly.',
    'Has somewhere to be, and it is behind you.',
    'Thinks the pack is a wonderful idea, mostly for the pack.',
  ],
  bear: [
    'Has never once had to explain itself.',
    'Considers the entire valley to be broadly its business.',
    'Woke up. Regrets it. Proceeding anyway.',
  ],
  deer: [
    'Committed to leaving, pending a decision about which way.',
    'Startles at everything, and has outlived a great many things that did not.',
    'Eating, listening, eating, listening.',
  ],
  rabbit: [
    'Has a plan for every direction at once.',
    'The most successful strategy in the world is being somewhere else.',
    'Small, quick, and doing fine, thank you.',
  ],
  bird: [
    'Owns nothing, worries about nothing, is doing better than everyone.',
    'Has seen the whole map and is not impressed.',
    'Somewhere to be. Always somewhere to be.',
  ],
  fish: [
    'Untroubled by the entire history above the waterline.',
    'Doing the one thing, extremely well.',
  ],
  sheep: [
    'Has thought this through and concluded: grass.',
    'Finds the concept of the horizon overrated.',
    'Follows the sheep in front. It works out more often than you would think.',
  ],
  chicken: [
    'Genuinely believes it is the largest animal here.',
    'No thoughts. Enormous confidence.',
  ],
  fox: [
    'Has already worked out where the chickens are.',
    'Doing something. Would rather not say what.',
    'Too clever by exactly the right amount.',
  ],
  snake: [
    'Would very much like everyone to stop treading near it.',
    'Perfectly comfortable, thank you, do not fetch anyone.',
  ],
  dragon: [
    'Has outlived four kingdoms and remembers the names of two.',
    'Regards your walls as a suggestion, politely made.',
    'Not hungry. Bored, which is worse.',
  ],
  demon: [
    'Turned up uninvited and has strong opinions about the furniture.',
    'Here on business. The business is bad.',
  ],
  zombie: [
    'Still walking. Nobody has had the heart to raise it.',
    'Wants something, and has forgotten what, and is still going.',
  ],
  skeleton: [
    'Somehow still upright, which is impressive if you think about it.',
    'Has nothing left to lose, and it shows in the posture.',
  ],
  elemental: [
    'Not so much alive as insisted upon.',
    'A weather event that took an interest.',
  ],
  bandit: [
    'Has a philosophy about property. You will not enjoy it.',
    'Believes this is a career.',
  ],
  cat: [
    'Owns this village. The villagers are under the impression it is theirs.',
    'Knocked something off a table once and has never apologised.',
    'Asleep in the one patch of sun, on principle.',
  ],
  dog: [
    'Delighted to see you. Delighted to see everybody, frankly.',
    'Has found a stick and considers the day a success.',
    'Guards the house from the postman, who does not exist yet.',
  ],
  cow: [
    'Contemplating the grass with the seriousness it deserves.',
    'Moves at the speed of a decision nobody has made.',
    'Not bothered. Will never be bothered.',
  ],
  pig: [
    'Cleverer than it lets on, and filthier than it needs to be.',
    'Has found the only mud for a mile and is in it.',
    'Snuffling after something it can smell and you cannot.',
  ],
  crab: [
    'Going somewhere important, sideways.',
    'All armour and opinions.',
    'Pinches first and asks questions never.',
  ],
  frog: [
    'Sits very still until the exact moment it does not.',
    'Sings all night about something only other frogs care about.',
    'Damp, and pleased about it.',
  ],
  penguin: [
    'Dressed for a dinner nobody invited it to.',
    'Cannot fly, has made its peace with that, swims instead.',
    'Waddling with tremendous dignity.',
  ],
  turtle: [
    'Was here before the village and fully intends to be here after.',
    'Carries its house and never once complains about the rent.',
    'In no hurry. Has never been in a hurry.',
  ],
  monkey: [
    'Up to something, and the something is your lunch.',
    'Thinks the people are a very silly sort of monkey.',
    'Swinging from the subject at hand.',
  ],
  rat: [
    'Wherever there are granaries, there it is.',
    'Small, quick, and much better organised than you would like.',
    'Has heard about the plague and would like to deny everything.',
  ],
  crocodile: [
    'Smiling. It is not a friendly smile.',
    'Has been perfect for a hundred million years and sees no reason to change.',
    'Lies in the shallows looking exactly like a log, which is the point.',
  ],
  piranha: [
    'A small fish with a large problem, and the problem is teeth.',
    'Never alone, never full, never sorry.',
  ],
  hyena: [
    'Laughing at a joke you would not find funny.',
    'Lets something else do the hunting and turns up for dinner.',
    'Not a dog. Do not call it a dog.',
  ],
  rhino: [
    'Has poor eyesight and a policy of charging whatever it cannot see.',
    'Armoured, horned, and entirely uninterested in your borders.',
    'A boulder with a temper and a plan.',
  ],
  buffalo: [
    'Part of a herd that takes the whole valley to turn around.',
    'Shaggy, heavy, and moving in one direction: forward.',
    'Grazes like the plains owe it something.',
  ],
  unicorn: [
    'Exactly as real as you need it to be.',
    'Leaves flowers where it steps and judgement where it looks.',
    'Has never once been in a hurry, and still arrives first.',
  ],
  fairy: [
    'Mischief in a very small hat.',
    'Glows a bit when it laughs, which is often and at you.',
    'Has a favour to grant and a price it has not mentioned.',
  ],
  ghost: [
    'Unfinished business, and in no hurry to finish it.',
    'Walks through walls and through conversations.',
    'Was someone once. Remembers the outline of it.',
  ],
  mage: [
    'Read the wrong book, and read all of it.',
    'Has ambitions measured in kingdoms and a temper measured in craters.',
    'The robe is mostly for effect. So is the laugh.',
  ],
  druid: [
    'Speaks for the trees, which have been waiting a long time to be spoken for.',
    'Older than the village and kinder than it deserves.',
    'Smells faintly of moss and certainty.',
  ],
  alien: [
    'Came a very long way to look at cows.',
    'Taking notes. The notes are not flattering.',
    'Would like to speak to whoever is in charge, and then probe them.',
  ],
  snowman: [
    'Fragile, cheerful, and doomed by spring.',
    'Somebody made it, and now it is making its own decisions.',
    'Keeps glancing at the sun.',
  ],
  goat: [
    'Has climbed something it should not have, and is looking at you from it.',
    'Eats first, asks questions never.',
  ],
  camel: [
    'Carries its own water and its own grudges.',
    'Spits with an accuracy that suggests practice.',
  ],
  ostrich: [
    'Could fly, it insists, if it wanted to.',
    'Runs as if the ground owed it money.',
  ],
  flamingo: [
    'Pink because of what it eats, which is a lesson for everyone.',
    'Balanced on one leg and one principle.',
  ],
  seal: [
    'Barks at the sea and the sea barks back.',
    'Graceless on land, a poem in the water.',
  ],
  polar_bear: [
    'White on white, until it is red on white.',
    'The ice is its kingdom and everything on it is lunch.',
  ],
  beetle: [
    'Small, shiny, and entirely unbothered.',
    'Rolls on. Always rolls on.',
  ],
  bee: [
    'Every flower in the meadow owes it a little.',
    'Works itself to death and calls it a good life.',
  ],
  butterfly: [
    'Flaps its wings, and somewhere a hurricane begins.',
    'Has one week to live and spends it on beauty.',
  ],
  grasshopper: [
    'Sings all summer. Has not thought about winter.',
    'Jumps first, lands somewhere, decides later.',
  ],
  necromancer: [
    'Reads the dead like books, and lends them out.',
    'Wherever it walks the graves get restless.',
  ],
  plague_doctor: [
    'Arrives where the sickness is, which is either brave or suspicious.',
    'Breathes through a beak of herbs and hope.',
  ],
  fire_skull: [
    'Lost its body, kept its temper.',
    'Leaves a trail of smoke and regret.',
  ],
  cold_one: [
    'Winter, walking, and in no hurry at all.',
    'The frost goes where it goes.',
  ],
  ufo: [
    'Not from here. Not interested in here, except the cattle.',
    'Hums a tune nobody on this world has heard.',
  ],
  sand_spider: [
    'The dune moved. That was not the dune.',
    'Patient as sand and twice as hungry.',
  ],
  acid_blob: [
    'Wobbles towards you at the speed of inevitability.',
    'Has no face and no regrets.',
  ],
  lil_pumpkin: [
    'Grinning at nothing. Possibly at you.',
    'Will be pie by autumn, if anyone is brave.',
  ],
  gummy_bear: [
    'Sticky, sweet and slightly translucent.',
    'Bounces when it walks, as everyone should.',
  ],
  crabzilla: [
    'Came up out of the sea and has not yet decided to go back.',
    'Everything sideways, everything flattened.',
  ],
  flame_tower: [
    'Nobody remembers building it, and nobody is going near it to ask.',
    'Burns anything that comes close, on principle.',
  ],
  ice_tower: [
    'The cold comes off it in waves you can see.',
    'Spreads its own little winter and defends it.',
  ],
  white_mage: [
    'Has never met a wound it did not want to close.',
    'Walks where the sick are, and leaves fewer of them.',
  ],
  angel: [
    'Came down to deal with the dead, and means to finish.',
    'Its wings make no sound, which is worse.',
  ],
  sandworm: [
    'The desert has a heartbeat, and this is it.',
    'Swallows caravans whole and leaves the camels for later.',
  ],
  langton_ant: [
    'Turns right on light, left on dark, and changes the world either way.',
    'After ten thousand steps it builds a road, and nobody knows why.',
  ],
  tumor: [
    'Pulses slightly, as if it is listening.',
    'Every day there is more of it, and the ground around it is worse.',
  ],
  treant: [
    'Older than the kingdom and likely to outlast it.',
    'Plants a forest by walking through a field.',
  ],
  candy_man: [
    'Smells of caramel and bad decisions.',
    'Leaves a trail of sugar that the ground never forgets.',
  ],
  jumpy_skull: [
    'Bounces everywhere, bites everything.',
    'Nobody has ever seen it hold still.',
  ],
  robot_santa: [
    'Delivers gifts at a rate no chimney was designed for.',
    'Its list has only one column, and everyone is on it.',
  ],
  yeti: [
    'The snow moved, and then it had teeth.',
    'Leaves footprints the size of a door.',
  ],
};

/** Every biome has something to say about itself. */
export const BIOME_LINES: Record<BiomeType, string> = {
  deep_ocean: 'Nobody has ever come back from here with anything but a story.',
  ocean: 'Flat, blue, and entirely uninterested in your plans.',
  shallow_water: 'Deep enough to lose a boot in, and it has.',
  river: 'Going somewhere. Has been going there for a very long time.',
  lake: 'Holds still and reflects things. Not much else to it, and it knows.',
  beach: 'Where the sea keeps everything it did not want.',
  rocky_shore: 'The coast, minus the good bits.',
  grassland: 'Nothing has ever happened here, which is rather the appeal.',
  deciduous_forest: 'Green in the summer, ruinous in the autumn, honest in the winter.',
  coniferous_forest: 'Quiet in a way that starts to feel like an opinion.',
  hills: 'Always one more of them than you counted.',
  mountains: 'Older than every argument anyone has ever had about them.',
  taiga: 'Cold, tall and unbothered.',
  tundra: 'Wide open, and every bit of it exactly as bleak as the last.',
  snow: 'Beautiful for about an hour.',
  ice: 'Solid, until the moment it stops being a matter of opinion.',
  glacier: 'Moving. You will not see it, but your grandchildren might.',
  desert: 'Enormous, gold, and trying to kill you politely.',
  savanna: 'Grass, a tree, more grass. Somebody is being hunted out there.',
  mesa: 'Layers of every year that ever happened, stacked and left out.',
  badlands: 'The land gave up. It is not clear on what.',
  swamp: 'Takes a boot for every mile and gives back nothing.',
  marsh: 'Neither one thing nor the other, and smug about it.',
  rainforest: 'Everything here is either eating or being eaten, loudly.',
  tropical_forest: 'Warm, wet, and absolutely full of things.',
  ashland: 'Whatever grew here is still here, only much smaller and grey.',
  salt_flat: 'The water left. The rest of it did not.',
  bloom: 'Something was kind to this place and it has not stopped saying so.',
  volcanic: 'Still deciding whether it is finished.',
  corrupted: 'Something happened here and the ground has not stopped thinking about it.',
  enchanted_forest: 'Lit from somewhere that is not the sky.',
  sky_island: 'Up. Simply, unreasonably, up.',
  candy: 'Sweet, sticky, and a dentist\u2019s idea of a cautionary tale.',
  crystal: 'The ground rings faintly when you walk on it, and remembers.',
  mushroom: 'Damp, spongy, and very slightly watching you.',
  infernal: 'Hot enough to have opinions about the people standing on it.',
  wasteland: 'Something used to live here. It has not decided to come back.',
};

/**
 * A stable index into a list, from any string.
 *
 * Deterministic on purpose: a line that changes every time you look at the
 * same creature is noise, and one that does not becomes *that creature's*
 * line. Not `Math.random` for a second reason too — flavour is asked for by
 * the UI on render, and drawing from the shared stream while painting a panel
 * would make the simulation depend on which panels are open.
 */
const indexFor = (key: string, length: number): number => {
  if (length <= 0) return 0;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % length;
};

/**
 * What this particular creature would say for itself.
 *
 * Keyed on the creature's id, so the same one always says the same thing and
 * two of a kind standing together say different things.
 */
export const creatureLine = (type: EntityType, id: string): string | null => {
  const lines = CREATURE_LINES[type];
  if (!lines || lines.length === 0) return null;
  return lines[indexFor(`${type}:${id}`, lines.length)];
};

export const biomeLine = (biome: BiomeType): string => BIOME_LINES[biome];
