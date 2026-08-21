// Ages of the world.
//
// WorldBox runs ten eras on an eight-slot clock, each with a full-screen
// overlay, a particle layer, and *real rule changes* — droughts that kill
// trees, frosts that kill crops, chaos that turns creatures
// (06-WORLDBOX-COMPLETE-REFERENCE.md §8). The overlay is what makes an age
// noticeable; the rule changes are what make it matter. An age that only
// tinted the screen would be a filter.
//
// **On length.** Theirs are "at least 30 years", but a WorldBox year is about
// 40 seconds and ours is roughly 45 minutes — 16 days at four 42-second
// phases each. Copying "30 years" would give a 22-hour age. What actually
// transfers is the *pace of play*: their ages turn over every twenty minutes
// or so. Ours run in simulated seconds, so game speed carries them, and the
// length is picked for that feel rather than pasted from the wiki.

export type AgeId =
  | 'hope' | 'sun' | 'dark' | 'tears' | 'moon'
  | 'chaos' | 'wonders' | 'ice' | 'ash' | 'despair';

/** A periodic thing an age does to the world. */
export type AgeAction =
  | 'none'
  | 'drought'      // kills trees, dries the land
  | 'downpour'     // forces rain, puts fires out
  | 'frost'        // kills plants, freezes shallow water
  | 'derangement'  // creatures turn on each other
  | 'ashfall'      // smothers growth, sickens the living
  | 'flourish';    // growth and good spirits

export interface AgeDef {
  id: AgeId;
  /** Shown in the HUD. */
  name: string;
  /** One line, in the chronicle, when it begins. */
  herald: string;
  /** Screen wash. */
  tint: string;
  /**
   * 0-1 opacity of a plain veil over the world. Kept low: an age you cannot
   * see past is an age the player turns off. Ash and Despair sit highest
   * because a world that has gone grey is the entire point of them.
   */
  tintStrength: number;
  /** Multiplies how fast fire jumps between tiles. */
  fireSpread: number;
  /** Multiplies forest creep, regrowth and crop growth. */
  growth: number;
  /** Multiplies how fast needs drain. Winter already does this too. */
  harshness: number;
  /** Happiness pushed per simulated second, for everything alive. */
  mood: number;
  action: AgeAction;
  /** Simulated seconds between triggers of the action. */
  actionEvery: number;
}

export const AGES: Record<AgeId, AgeDef> = {
  hope: {
    id: 'hope', name: 'Age of Hope',
    herald: 'The world settles, and for a while nothing is wrong with it.',
    tint: '#ffe9b0', tintStrength: 0.05,
    fireSpread: 1, growth: 1, harshness: 1, mood: 0.4,
    action: 'none', actionEvery: 0,
  },
  sun: {
    id: 'sun', name: 'Age of Sun',
    herald: 'The sun leans closer. The rivers start to look nervous.',
    tint: '#ffb347', tintStrength: 0.14,
    fireSpread: 2, growth: 0.35, harshness: 1.35, mood: -0.3,
    action: 'drought', actionEvery: 26,
  },
  dark: {
    id: 'dark', name: 'Age of Darkness',
    herald: 'Something has gone out of the sky, and nobody can say what.',
    tint: '#1b2340', tintStrength: 0.26,
    fireSpread: 0.8, growth: 0.5, harshness: 1.2, mood: -0.9,
    action: 'none', actionEvery: 0,
  },
  tears: {
    id: 'tears', name: 'Age of Tears',
    herald: 'It begins to rain, and does not stop for a long while.',
    tint: '#7fa8d8', tintStrength: 0.16,
    fireSpread: 0.2, growth: 1.4, harshness: 0.9, mood: -0.2,
    action: 'downpour', actionEvery: 20,
  },
  moon: {
    id: 'moon', name: 'Age of the Moon',
    herald: 'The nights come out longer than they went in.',
    tint: '#8fa5e8', tintStrength: 0.18,
    fireSpread: 0.7, growth: 0.85, harshness: 1, mood: 0.1,
    action: 'none', actionEvery: 0,
  },
  chaos: {
    id: 'chaos', name: 'Age of Chaos',
    herald: 'Everything that could turn on everything else begins to.',
    tint: '#b4368f', tintStrength: 0.2,
    fireSpread: 1.5, growth: 0.7, harshness: 1.25, mood: -1.6,
    action: 'derangement', actionEvery: 18,
  },
  wonders: {
    id: 'wonders', name: 'Age of Wonders',
    herald: 'Crops come in heavy and nobody is quite sure why.',
    tint: '#9ae6c8', tintStrength: 0.12,
    fireSpread: 0.9, growth: 1.8, harshness: 0.8, mood: 1.2,
    action: 'flourish', actionEvery: 24,
  },
  ice: {
    id: 'ice', name: 'Age of Ice',
    herald: 'The cold arrives early and settles in as though it lives here.',
    tint: '#cfe8ff', tintStrength: 0.2,
    fireSpread: 0.35, growth: 0.2, harshness: 1.5, mood: -0.8,
    action: 'frost', actionEvery: 22,
  },
  ash: {
    id: 'ash', name: 'Age of Ash',
    herald: 'Grey falls out of the sky and settles on everything.',
    tint: '#6b6560', tintStrength: 0.28,
    fireSpread: 1.2, growth: 0.15, harshness: 1.4, mood: -1.1,
    action: 'ashfall', actionEvery: 20,
  },
  despair: {
    id: 'despair', name: 'Age of Despair',
    herald: 'Whatever was holding this world together has let go.',
    tint: '#3b2b4a', tintStrength: 0.3,
    fireSpread: 0.6, growth: 0.1, harshness: 1.6, mood: -2,
    action: 'frost', actionEvery: 16,
  },
};

/**
 * Roughly seven minutes at normal speed, in simulated seconds — so game speed
 * carries it and a session at triple speed marches through several ages.
 *
 * Long enough that an age is a period you live through rather than weather,
 * short enough that a single sitting sees the world change character more than
 * once. See the note at the top of this file on why this is not "30 years".
 */
export const AGE_LENGTH = 420;

/**
 * The age clock, following WorldBox's shape: eight slots, most of them Hope.
 *
 * Hope holding over half the slots is the important part and it is easy to get
 * wrong. Without it every age is an event, and when everything is an event
 * nothing is — the calm stretches are what make an Age of Ash land. Theirs is
 * ~53% Hope for exactly this reason.
 */
const HOPE = 'hope' as const;
const MIDDLING: AgeId[] = ['dark', 'tears', 'moon', 'wonders'];
const HARSH: AgeId[] = ['sun', 'chaos', 'ice', 'ash', 'despair'];

export const AGE_SLOTS = 8;

/**
 * Which age fills a given slot. `roll` is a 0-1 value supplied by the caller,
 * so the sequence is reproducible from a seed rather than reaching for
 * Math.random inside a pure function.
 */
export const ageForSlot = (slot: number, roll: number): AgeId => {
  const index = ((slot % AGE_SLOTS) + AGE_SLOTS) % AGE_SLOTS;
  // Slots 0, 2, 4, 5 are calm — over half the clock.
  if (index === 0 || index === 2 || index === 4 || index === 5) return HOPE;
  // 1 and 6 draw from the merely strange.
  if (index === 1 || index === 6) return MIDDLING[Math.floor(roll * MIDDLING.length) % MIDDLING.length];
  // 3 and 7 are where the world gets hurt.
  return HARSH[Math.floor(roll * HARSH.length) % HARSH.length];
};

/**
 * Despair forces Hope next, as it does in WorldBox. A world that has just
 * fallen apart needs somewhere to recover, and back-to-back catastrophes read
 * as the simulation having lost the plot rather than as a dark chapter.
 *
 * With the slot layout above this never actually fires — the harsh slots (3
 * and 7) are already followed by calm ones (4 and 0). It is kept because it is
 * a *guarantee* rather than a correction: the layout is the kind of thing that
 * gets tuned later, and this is the one adjacency that must not happen however
 * the slots are rearranged.
 */
export const nextAge = (slot: number, current: AgeId, roll: number): AgeId => {
  if (current === 'despair') return HOPE;
  return ageForSlot(slot, roll);
};

export const AGE_LIST: AgeDef[] = Object.values(AGES);
