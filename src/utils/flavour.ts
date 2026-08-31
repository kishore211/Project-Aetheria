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
  volcanic: 'Still deciding whether it is finished.',
  corrupted: 'Something happened here and the ground has not stopped thinking about it.',
  enchanted_forest: 'Lit from somewhere that is not the sky.',
  sky_island: 'Up. Simply, unreasonably, up.',
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
