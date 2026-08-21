// Culture, language and religion — all three on one mechanism.
//
// WorldBox spreads all three identically, and the mechanism is the most elegant
// thing in their design (06-WORLDBOX-COMPLETE-REFERENCE.md §9):
//
//   When two units converse, both their cultures go into a pot. A unit's entry
//   is added *again* if it matches their village's, and *again* if it matches
//   their kingdom's. One entry is drawn at random and wins.
//
// That single rule produces everything you want: identity spreads through
// contact rather than by decree, the majority usually but not always wins,
// institutions (a village, a kingdom) weigh more than individuals, and a
// culture can die out quietly when nobody carries it. No diffusion equation,
// no tunable spread rate.
//
// Building all three on one type is not a shortcut — it is the point. They
// differ only in what they are called and what they change.

import type { Entity } from '../types/world';

export type MetaKind = 'culture' | 'language' | 'religion';

/** Culture traits that actually change behaviour. */
export type CultureTraitId =
  | 'warlike' | 'pacifist'
  | 'expansionist' | 'insular'
  | 'xenophobic' | 'hospitable'
  | 'industrious' | 'frugal'
  | 'scholarly' | 'devout'
  | 'spacious' | 'dense';

export interface CultureTraitInfo {
  id: CultureTraitId;
  label: string;
  description: string;
  /** Traits that cannot coexist with this one. */
  opposes: CultureTraitId[];
}

/**
 * Twelve, not seventy-eight. Every one here changes something the simulation
 * actually does — a trait that only appears in a tooltip is a word, not a
 * culture.
 */
export const CULTURE_TRAITS: Record<CultureTraitId, CultureTraitInfo> = {
  warlike: {
    id: 'warlike', label: 'Warlike',
    description: 'Trains more warriors and takes offence faster.',
    opposes: ['pacifist'],
  },
  pacifist: {
    id: 'pacifist', label: 'Pacifist',
    description: 'Keeps fewer warriors and is slow to anger.',
    opposes: ['warlike'],
  },
  expansionist: {
    id: 'expansionist', label: 'Expansionist',
    description: 'Sends settlers out sooner and further.',
    opposes: ['insular'],
  },
  insular: {
    id: 'insular', label: 'Insular',
    description: 'Stays where it is, and is content there.',
    opposes: ['expansionist'],
  },
  xenophobic: {
    id: 'xenophobic', label: 'Xenophobic',
    description: 'Resents being governed by anyone unlike itself.',
    opposes: ['hospitable'],
  },
  hospitable: {
    id: 'hospitable', label: 'Hospitable',
    description: 'Takes in strangers and thinks little of it.',
    opposes: ['xenophobic'],
  },
  industrious: {
    id: 'industrious', label: 'Industrious',
    description: 'Builds noticeably faster.',
    opposes: ['frugal'],
  },
  frugal: {
    id: 'frugal', label: 'Frugal',
    description: 'Eats less and stores more.',
    opposes: ['industrious'],
  },
  scholarly: {
    id: 'scholarly', label: 'Scholarly',
    description: 'Schemes and plans come together faster.',
    opposes: ['devout'],
  },
  devout: {
    id: 'devout', label: 'Devout',
    description: 'Holds to its own beliefs and is hard to convert.',
    opposes: ['scholarly'],
  },
  spacious: {
    id: 'spacious', label: 'Spacious',
    description: 'Builds its towns wide, with room between the houses.',
    opposes: ['dense'],
  },
  dense: {
    id: 'dense', label: 'Dense',
    description: 'Packs its buildings close together.',
    opposes: ['spacious'],
  },
};

export interface Meta {
  id: string;
  kind: MetaKind;
  name: string;
  colorHex: string;
  /** Only cultures carry traits; the others are identity alone. */
  traits: CultureTraitId[];
}

/** What a village or kingdom is, institutionally. */
export interface MetaSet {
  culture: string | null;
  language: string | null;
  religion: string | null;
}

// -- the registry ----------------------------------------------------------

const metas = new Map<string, Meta>();
/** Village and kingdom identities, keyed by their id. */
const groups = new Map<string, MetaSet>();

let nextMetaId = 1;

export const registerMeta = (meta: Meta): Meta => {
  metas.set(meta.id, meta);
  return meta;
};

export const metaById = (id: string | null | undefined): Meta | null =>
  (id ? metas.get(id) ?? null : null);

export const allMetas = (kind: MetaKind): Meta[] =>
  Array.from(metas.values()).filter(meta => meta.kind === kind);

export const setGroupMetas = (groupId: string, set: MetaSet): void => {
  groups.set(groupId, { ...set });
};

export const groupMetas = (groupId: string | null | undefined): MetaSet | null =>
  (groupId ? groups.get(groupId) ?? null : null);

export const forgetGroup = (groupId: string): void => {
  groups.delete(groupId);
};

export const resetIdentity = (): void => {
  metas.clear();
  groups.clear();
  nextMetaId = 1;
  resetBooks();
};

/**
 * Drop metas nobody carries any more.
 *
 * WorldBox forgets a culture when no unit and no book holds it, and it matters:
 * without this the map-layer legend fills up with dead identities and the
 * registry grows for the life of the world.
 */
export const forgetUnusedMetas = (carried: ReadonlySet<string>): number => {
  let dropped = 0;
  for (const id of [...metas.keys()]) {
    if (carried.has(id)) continue;
    metas.delete(id);
    dropped += 1;
  }
  return dropped;
};

// -- naming ----------------------------------------------------------------

const CULTURE_STEMS = [
  'Aeld', 'Bryn', 'Cael', 'Dorn', 'Eshr', 'Fal', 'Gorm', 'Hald', 'Ith', 'Jor',
  'Kesh', 'Lorn', 'Mard', 'Nyl', 'Oss', 'Pell', 'Quel', 'Rhun', 'Sarn', 'Tor',
  'Ulm', 'Vash', 'Wyr', 'Yth', 'Zel',
];
const CULTURE_TAILS = ['ic', 'ish', 'an', 'ar', 'ene', 'ori', 'ai', 'esh', 'yn'];
const RELIGION_FORMS = [
  'the Way of {stem}', 'the {stem} Covenant', 'the Church of {stem}',
  'the {stem} Rite', 'the Faith of {stem}', 'the {stem} Mysteries',
];
const LANGUAGE_TAILS = ['speech', 'tongue', 'cant', 'dialect'];

const META_COLORS = [
  '#e2795c', '#5ca8e2', '#7ac97a', '#d9b44a', '#b57ae0',
  '#4fc0b0', '#e07a9f', '#8f9fd6', '#c99a5c', '#6fbf6f',
];

const pick = <T,>(list: T[], roll: number): T =>
  list[Math.floor(Math.abs(roll) * list.length) % list.length];

/** Hue in degrees, for judging how far apart two palette entries look. */
const hueOf = (hex: string): number => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const span = max - min;
  const hue = max === r ? ((g - b) / span + (g < b ? 6 : 0))
    : max === g ? (b - r) / span + 2
      : (r - g) / span + 4;
  return hue * 60;
};

/** Shortest distance around the colour wheel. */
const hueGap = (a: number, b: number): number => {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
};

/**
 * Pick the colour that will read as most distinct from the ones already in use
 * for this kind.
 *
 * Two earlier attempts were not enough. A hash collided immediately — the first
 * schism minted a culture the same colour as its parent, so the culture map
 * showed one colour for two peoples, which is the one thing that map exists to
 * distinguish. Then "least used" fixed the collision but handed out gold and
 * tan to two neighbouring realms, which on a drained grey map are the same
 * colour to the eye. So: fewest uses first, and among those, the one furthest
 * around the colour wheel from everything already taken.
 */
const leastUsedColor = (kind: MetaKind, roll: number): string => {
  const used = new Map<string, number>();
  for (const meta of metas.values()) {
    if (meta.kind !== kind) continue;
    used.set(meta.colorHex, (used.get(meta.colorHex) ?? 0) + 1);
  }

  if (used.size === 0) {
    // Nothing to be distinct from, so the roll decides.
    return META_COLORS[Math.floor(Math.abs(roll) * META_COLORS.length) % META_COLORS.length];
  }

  const takenHues = [...used.keys()].map(hueOf);
  const fewest = Math.min(...META_COLORS.map(hex => used.get(hex) ?? 0));

  let best = META_COLORS[0];
  let bestScore = -1;
  for (const hex of META_COLORS) {
    if ((used.get(hex) ?? 0) !== fewest) continue;
    const hue = hueOf(hex);
    const nearest = Math.min(...takenHues.map(taken => hueGap(hue, taken)));
    if (nearest > bestScore) {
      bestScore = nearest;
      best = hex;
    }
  }
  return best;
};

/**
 * Mint a fresh identity.
 *
 * `roll` is supplied so a caller can seed it; naming reaches for the same stem
 * pool for all three kinds on purpose, because a people's language, faith and
 * culture sounding related is how real ones read.
 */
export const mintMeta = (kind: MetaKind, roll = Math.random()): Meta => {
  const stem = pick(CULTURE_STEMS, roll);
  const second = pick(CULTURE_TAILS, roll * 7.31);
  const color = leastUsedColor(kind, roll);

  const name = kind === 'culture'
    ? `${stem}${second}`
    : kind === 'language'
      ? `${stem}${second} ${pick(LANGUAGE_TAILS, roll * 5.13)}`
      : pick(RELIGION_FORMS, roll * 11.7).replace('{stem}', stem);

  return registerMeta({
    id: `${kind}-${nextMetaId++}`,
    kind,
    name,
    colorHex: color,
    traits: kind === 'culture' ? rollCultureTraits(roll) : [],
  });
};

/** Two or three traits, never a contradictory pair. */
export const rollCultureTraits = (roll: number): CultureTraitId[] => {
  const pool = Object.keys(CULTURE_TRAITS) as CultureTraitId[];
  const chosen: CultureTraitId[] = [];
  const wanted = 2 + Math.floor(Math.abs(roll * 13) % 2);

  // Walk the pool from a seeded offset rather than sampling repeatedly, so this
  // always terminates however unlucky the roll is.
  const start = Math.floor(Math.abs(roll * 97)) % pool.length;
  for (let step = 0; step < pool.length && chosen.length < wanted; step += 1) {
    const candidate = pool[(start + step * 5) % pool.length];
    if (chosen.includes(candidate)) continue;
    const clashes = chosen.some(held => CULTURE_TRAITS[held].opposes.includes(candidate));
    if (clashes) continue;
    chosen.push(candidate);
  }
  return chosen;
};

// -- the pot ---------------------------------------------------------------

/** A creature's own identity, in one place. */
export const metaOf = (entity: Entity, kind: MetaKind): string | null => {
  if (kind === 'culture') return entity.cultureId ?? null;
  if (kind === 'language') return entity.languageId ?? null;
  return entity.religionId ?? null;
};

export const setMetaOf = (entity: Entity, kind: MetaKind, id: string | null): void => {
  if (kind === 'culture') entity.cultureId = id;
  else if (kind === 'language') entity.languageId = id;
  else entity.religionId = id;
};

const groupMeta = (set: MetaSet | null, kind: MetaKind): string | null => {
  if (!set) return null;
  if (kind === 'culture') return set.culture;
  if (kind === 'language') return set.language;
  return set.religion;
};

/**
 * Build the pot for one conversation.
 *
 * Each speaker contributes their own identity once, again if their village
 * shares it, and again if their kingdom does. So a villager whose culture is
 * also their town's and their realm's speaks with three times the weight of a
 * lone outsider — which is why identity clusters geographically without any
 * code that mentions geography.
 */
export const buildPot = (a: Entity, b: Entity, kind: MetaKind): string[] => {
  const entries: string[] = [];

  for (const speaker of [a, b]) {
    const own = metaOf(speaker, kind);
    if (!own) continue;
    entries.push(own);
    if (groupMeta(groupMetas(speaker.villageId), kind) === own) entries.push(own);
    if (groupMeta(groupMetas(speaker.kingdomId), kind) === own) entries.push(own);
  }

  return entries;
};

/**
 * Two creatures talk. Returns the kinds that actually changed hands.
 *
 * A devout culture resists conversion, standing in for their True Roots and
 * Advanced Hippocampus gates — the principle being that some identities do not
 * spread by conversation alone.
 */
export const converse = (
  a: Entity,
  b: Entity,
  roll: () => number = Math.random,
): MetaKind[] => {
  const changed: MetaKind[] = [];

  for (const kind of ['culture', 'language', 'religion'] as MetaKind[]) {
    const pot = buildPot(a, b, kind);
    if (pot.length === 0) continue;

    const winner = pot[Math.floor(roll() * pot.length) % pot.length];

    for (const listener of [a, b]) {
      const own = metaOf(listener, kind);
      if (own === winner) continue;
      if (resistsConversion(listener, kind, roll)) continue;
      setMetaOf(listener, kind, winner);
      if (!changed.includes(kind)) changed.push(kind);
    }
  }

  return changed;
};

/** Devout cultures hold on to their religion, and mostly to themselves. */
export const resistsConversion = (
  entity: Entity,
  kind: MetaKind,
  roll: () => number = Math.random,
): boolean => {
  const culture = metaById(entity.cultureId);
  if (!culture?.traits.includes('devout')) return false;
  // Religion is what devotion is actually about; culture is dragged along.
  return kind === 'religion' ? roll() < 0.85 : roll() < 0.4;
};

// -- books -----------------------------------------------------------------

/**
 * A written work, left somewhere in the world.
 *
 * WorldBox's books use the same pot with heavier weights — the reader's
 * identity counts three, the book's counts three (06-WORLDBOX-COMPLETE-
 * REFERENCE.md §9). They are how a culture survives its last living speaker,
 * and how one can spread to a village that has never met anybody who holds it.
 */
export interface Book {
  id: string;
  title: string;
  x: number;
  y: number;
  metas: MetaSet;
}

const books = new Map<string, Book>();
let nextBookId = 1;

const BOOK_FORMS = [
  'the {stem} Chronicle', 'the Book of {stem}', 'the {stem} Testament',
  'the Sayings of {stem}', 'the {stem} Codex',
];

export const writeBook = (x: number, y: number, metas: MetaSet, roll = Math.random()): Book => {
  const source = metaById(metas.culture)?.name ?? pick(CULTURE_STEMS, roll);
  const book: Book = {
    id: `book-${nextBookId++}`,
    title: pick(BOOK_FORMS, roll).replace('{stem}', source),
    x, y,
    metas: { ...metas },
  };
  books.set(book.id, book);
  return book;
};

export const allBooks = (): Book[] => Array.from(books.values());

export const bookAt = (x: number, y: number): Book | null => {
  for (const book of books.values()) {
    if (Math.abs(book.x - x) <= 1 && Math.abs(book.y - y) <= 1) return book;
  }
  return null;
};

export const resetBooks = (): void => {
  books.clear();
  nextBookId = 1;
};

/**
 * Somebody reads a book. Returns the kinds that changed hands.
 *
 * Weighted three against three, so a book is roughly an even fight with the
 * reader's own upbringing — persuasive but not overwhelming. A book carrying a
 * dead culture can bring it back, which is the whole reason these exist.
 */
export const readBook = (
  reader: Entity,
  book: Book,
  roll: () => number = Math.random,
): MetaKind[] => {
  const changed: MetaKind[] = [];

  for (const kind of ['culture', 'language', 'religion'] as MetaKind[]) {
    const mine = metaOf(reader, kind);
    const theirs = kind === 'culture' ? book.metas.culture
      : kind === 'language' ? book.metas.language
        : book.metas.religion;
    if (!theirs || theirs === mine) continue;

    const pot: string[] = [];
    for (let copy = 0; copy < 3; copy += 1) {
      if (mine) pot.push(mine);
      pot.push(theirs);
    }

    const winner = pot[Math.floor(roll() * pot.length) % pot.length];
    if (winner === mine) continue;
    if (resistsConversion(reader, kind, roll)) continue;
    setMetaOf(reader, kind, winner);
    changed.push(kind);
  }

  return changed;
};

/** Every meta any creature or book still carries, for the sweep. */
export const carriedMetas = (entities: Iterable<Entity>): Set<string> => {
  const carried = new Set<string>();
  const note = (id: string | null | undefined) => { if (id) carried.add(id); };

  for (const entity of entities) {
    note(entity.cultureId);
    note(entity.languageId);
    note(entity.religionId);
  }
  for (const book of books.values()) {
    note(book.metas.culture);
    note(book.metas.language);
    note(book.metas.religion);
  }
  for (const set of groups.values()) {
    note(set.culture);
    note(set.language);
    note(set.religion);
  }
  return carried;
};

/** Does this creature's culture hold a trait? */
export const hasCultureTrait = (entity: Entity, trait: CultureTraitId): boolean =>
  metaById(entity.cultureId)?.traits.includes(trait) ?? false;

/** Does this group's culture hold a trait? */
export const groupHasCultureTrait = (
  groupId: string | null | undefined,
  trait: CultureTraitId,
): boolean => {
  const set = groupMetas(groupId);
  return metaById(set?.culture)?.traits.includes(trait) ?? false;
};
