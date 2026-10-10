// The Knowledge book.
//
// WorldBox keeps what you have met across every world you have made: a
// creature stays a silhouette until you have seen one, and then it is yours
// for good (06-WORLDBOX-COMPLETE-REFERENCE.md §8, Knowledge). Ours does the
// same for the bestiary, remembered in the browser rather than the save, so
// a new world does not take away what the last one taught you.

import type { BiomeType, EntityType } from '../types/world';
import { FOOD_CHAIN, profileOf, RANGED, BORN_SAPIENT } from './entitySystemMinimal';
import { NATIVES } from './worldBehaviour';
import { baseSizeOf, describeSize } from './size';
import { CREATURE_LINES } from './flavour';
import { ABILITIES } from './creatureAbilities';
import { isAirborne, isAquatic, canSwim } from './pathfinding';

const KEY = 'aetheria.knowledge';

const load = (): Set<string> => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return new Set(raw ? JSON.parse(raw) as string[] : []);
  } catch {
    return new Set();
  }
};

let known = load();
const listeners = new Set<() => void>();

const save = (): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify([...known]));
  } catch {
    // Nowhere to keep it: the book simply forgets on reload.
  }
};

/** Note that a kind has been met. True the first time. */
export const discover = (type: EntityType): boolean => {
  if (known.has(type)) return false;
  known.add(type);
  save();
  for (const fn of listeners) fn();
  return true;
};

export const isDiscovered = (type: EntityType): boolean => known.has(type);
export const discoveredCount = (): number => known.size;

/** For React: re-render when something new is met. */
export const subscribeKnowledge = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Forget everything. Tests and a "start over" button. */
export const resetKnowledge = (): void => {
  known = new Set();
  save();
  for (const fn of listeners) fn();
};

/** What auras do, in words. Kept beside the book rather than the mechanic. */
const AURA_TEXT: Partial<Record<EntityType, string>> = {
  necromancer: 'Raises skeletons from the earth around it.',
  plague_doctor: 'Cures the plague in everyone nearby.',
  fire_skull: 'Sets alight the ground it passes over.',
  cold_one: 'Turns the ground to snow wherever it walks.',
  bee: 'Enriches the meadow it works.',
  crabzilla: 'Flattens any building it treads on.',
  flame_tower: 'Burns whatever comes within five tiles, and the ground it stands on.',
  ice_tower: 'Shoots whatever comes near and spreads a winter around itself.',
  white_mage: 'Heals the people around it.',
  angel: 'Blesses the people it passes over.',
  treant: 'Plants forest as it walks.',
  candy_man: 'Turns the ground it walks on to candy.',
  robot_santa: 'Hands out weapons and armour to whoever it meets.',
  tumor: 'Spreads corruption around itself, and buds new tumors.',
  langton_ant: 'Rewrites the land by one rule, and builds a highway out of chaos.',
};

const RANGED_TEXT: Record<string, string> = {
  fire: 'Breathes fire from a distance',
  magic: 'Casts bolts from a distance',
  dark: 'Hurls dark bolts from a distance',
  laser: 'Fires a beam from a distance',
  arrow: 'Shoots from a distance',
};

export interface CreatureFacts {
  type: EntityType;
  name: string;
  lines: string[];
  health: number;
  strength: number;
  speed: number;
  lifespan: number;
  size: string;
  eats: EntityType[];
  eatenBy: EntityType[];
  lives: BiomeType[];
  moves: string;
  powers: string[];
  people: boolean;
}

/** Everything the book says about a kind, gathered from the systems that decide it. */
export const creatureFacts = (type: EntityType): CreatureFacts => {
  const profile = profileOf(type);
  const eatenBy = (Object.keys(FOOD_CHAIN) as EntityType[]).filter(k => FOOD_CHAIN[k].includes(type));
  const lives = (Object.keys(NATIVES) as BiomeType[]).filter(b => NATIVES[b]?.includes(type));
  const powers: string[] = [];
  const aura = AURA_TEXT[type];
  if (aura && ABILITIES[type]) powers.push(aura);
  const ranged = RANGED[type];
  if (ranged) powers.push(`${RANGED_TEXT[ranged.kind]}${ranged.ignite ? ', and can start fires' : ''}.`);
  return {
    type,
    name: type.replace(/_/g, ' '),
    lines: CREATURE_LINES[type] ?? [],
    health: profile.maxHealth,
    strength: profile.strength,
    speed: profile.speed,
    lifespan: profile.maxAge,
    size: describeSize(baseSizeOf(type)),
    eats: FOOD_CHAIN[type] ?? [],
    eatenBy,
    lives,
    moves: isAquatic(type) ? 'Swims' : isAirborne(type) ? 'Flies' : canSwim(type) ? 'Walks and swims' : 'Walks',
    powers,
    people: BORN_SAPIENT.has(type),
  };
};
