// Deterministic-feeling name generation for villages, kingdoms and rulers.
// Every race has its own syllables so an elven realm never sounds orcish.
import type { Race } from '../types/world';

interface RaceLexicon {
  prefixes: string[];
  middles: string[];
  suffixes: string[];
  /** Titles for a settlement, e.g. "Vale of Aur". */
  places: string[];
  /** Words a kingdom name can be built from. */
  realms: string[];
  titles: string[];
}

const LEXICONS: Record<Race, RaceLexicon> = {
  human: {
    prefixes: ['Ald', 'Bram', 'Cald', 'Dun', 'East', 'Fair', 'Grey', 'Hart', 'Kings', 'Mill', 'North', 'Oak', 'Red', 'Ship', 'Ston', 'West'],
    middles: ['', 'er', 'in', 'an', 'ow'],
    suffixes: ['ford', 'ton', 'bury', 'hold', 'wick', 'field', 'gate', 'haven', 'mere', 'stead'],
    places: ['Vale', 'Reach', 'Hollow', 'Crossing', 'Landing', 'Watch'],
    realms: ['Empire', 'Kingdom', 'Dominion', 'Realm', 'Commonwealth'],
    titles: ['King', 'Queen', 'High Steward', 'Sovereign'],
  },
  elf: {
    prefixes: ['Aer', 'Cel', 'Elan', 'Fael', 'Gala', 'Ithil', 'Lorn', 'Mith', 'Nim', 'Rion', 'Sylv', 'Thal', 'Vaen'],
    middles: ['a', 'e', 'ia', 'ae', 'o'],
    suffixes: ['dor', 'riel', 'lond', 'thil', 'wyn', 'mar', 'saal', 'neth', 'loth'],
    places: ['Grove', 'Glade', 'Song', 'Bloom', 'Starfall', 'Whisper'],
    realms: ['Concord', 'Dominion', 'Everbloom', 'Silvan Court', 'Twilight Realm'],
    titles: ['Archon', 'Lady', 'Lord', 'Everking'],
  },
  dwarf: {
    prefixes: ['Bor', 'Dur', 'Grim', 'Kaz', 'Khaz', 'Mor', 'Norg', 'Orv', 'Thrum', 'Ulf', 'Zar'],
    middles: ['', 'a', 'u', 'o'],
    suffixes: ['dun', 'grim', 'hold', 'delve', 'forge', 'deep', 'anvil', 'mor', 'bak'],
    places: ['Deep', 'Forge', 'Mine', 'Vault', 'Anvil', 'Undercroft'],
    realms: ['Clanhold', 'Undermountain', 'Forge-Realm', 'Stonekeep', 'Deepholm'],
    titles: ['Thane', 'Underking', 'Forgemaster', 'Clanlord'],
  },
  orc: {
    prefixes: ['Grak', 'Zug', 'Mor', 'Ur', 'Ghar', 'Nak', 'Bruk', 'Skarn', 'Vor', 'Drak'],
    middles: ['', 'ag', 'ur', 'ok'],
    suffixes: ['grod', 'nak', 'skar', 'gul', 'mash', 'thar', 'zul', 'krag'],
    places: ['Camp', 'Pyre', 'Warren', 'Pit', 'Skullyard', 'Bloodfield'],
    realms: ['Horde', 'War-Clan', 'Bloodpact', 'Warband', 'Iron Horde'],
    titles: ['Warchief', 'Warboss', 'Bloodking', 'Overlord'],
  },
};

const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

/** A settlement name, e.g. "Brameford" or "Vale of Aeriel". */
export const generateVillageName = (race: Race): string => {
  const lexicon = LEXICONS[race];
  if (Math.random() < 0.28) {
    return `${pick(lexicon.places)} of ${pick(lexicon.prefixes)}${pick(lexicon.middles)}`;
  }
  return `${pick(lexicon.prefixes)}${pick(lexicon.middles)}${pick(lexicon.suffixes)}`;
};

/** A kingdom name, e.g. "The Iron Horde of Grakzul". */
export const generateKingdomName = (race: Race): string => {
  const lexicon = LEXICONS[race];
  const root = `${pick(lexicon.prefixes)}${pick(lexicon.middles)}${pick(lexicon.suffixes)}`;
  return Math.random() < 0.5
    ? `${pick(lexicon.realms)} of ${root}`
    : `${root} ${pick(lexicon.realms)}`;
};

/** A ruler's name and title, e.g. "Warchief Zugnak". */
export const generateRulerName = (race: Race): string => {
  const lexicon = LEXICONS[race];
  const name = `${pick(lexicon.prefixes)}${pick(lexicon.middles)}${pick(lexicon.suffixes)}`;
  return `${pick(lexicon.titles)} ${name}`;
};

/**
 * Kingdom colours. Distinct enough to read as borders on a green map, and
 * loosely themed by race so a player learns them.
 */
const PALETTES: Record<Race, string[]> = {
  human: ['#4f7fd6', '#3f9ecf', '#5f6fd0', '#3f86a8'],
  elf: ['#3fbf8f', '#5fcf6f', '#2fae9f', '#7fd06f'],
  dwarf: ['#d69a3f', '#c47a2f', '#d6b84f', '#b8863f'],
  orc: ['#c8483f', '#a8402f', '#d1603f', '#b03050'],
};

const usedColors = new Set<string>();

/** Next unused colour for a race, recycling once every option is taken. */
export const pickKingdomColor = (race: Race): string => {
  const palette = PALETTES[race];
  for (const color of palette) {
    if (!usedColors.has(color)) {
      usedColors.add(color);
      return color;
    }
  }
  return pick(palette);
};

/** Called when a world is discarded so colours can be handed out again. */
export const resetKingdomColors = (): void => usedColors.clear();
