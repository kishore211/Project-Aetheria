// What a faith does.
//
// Religions already spread the WorldBox way, through talk and books (see
// identity.ts). What they lacked was any reason to care which one won. In
// WorldBox a religion carries traits — prayers that heal, fire from the sky,
// zeal that starts holy wars — and its priests are the ones who work them.
// So each faith rolls two traits when it is founded, remembers who founded it
// and where, and every temple keeps a priest who acts them out.

import type { Entity } from '../types/world';
import { metaById, type Meta } from './identity';

export type FaithTraitId =
  | 'mending_prayer' | 'holy_fire' | 'divine_shield' | 'harvest_blessing'
  | 'zealotry' | 'missionaries' | 'ascetic' | 'martyrdom';

export interface FaithTrait {
  id: FaithTraitId;
  label: string;
  description: string;
  glyph: string;
}

export const FAITH_TRAITS: Record<FaithTraitId, FaithTrait> = {
  mending_prayer: { id: 'mending_prayer', label: 'Mending Prayer', glyph: '✚', description: 'Its priests heal the faithful around them.' },
  holy_fire: { id: 'holy_fire', label: 'Holy Fire', glyph: '\u{1F525}', description: 'Its priests call fire down on enemies who come near.' },
  divine_shield: { id: 'divine_shield', label: 'Divine Shield', glyph: '\u{1F6E1}', description: 'The faithful are shielded when they go to fight.' },
  harvest_blessing: { id: 'harvest_blessing', label: 'Harvest Blessing', glyph: '\u{1F33E}', description: 'Every temple adds to the granary.' },
  zealotry: { id: 'zealotry', label: 'Zealotry', glyph: '⚔', description: 'Its realms sour fast on neighbours of another faith: holy war.' },
  missionaries: { id: 'missionaries', label: 'Missionaries', glyph: '\u{1F4D6}', description: 'Its priests convert strangers near their temple.' },
  ascetic: { id: 'ascetic', label: 'Ascetic', glyph: '\u{1F64F}', description: 'The faithful go hungry slower.' },
  martyrdom: { id: 'martyrdom', label: 'Martyrdom', glyph: '\u{1F56F}', description: 'When one of the faithful falls, those nearby rise up enraged.' },
};

const TRAIT_IDS = Object.keys(FAITH_TRAITS) as FaithTraitId[];

/** What a religion remembers about itself, beyond its name and colour. */
export interface FaithRecord {
  traits: FaithTraitId[];
  founder: string | null;
  holyCity: string | null;
}

const faiths = new Map<string, FaithRecord>();

/**
 * The faith system's own dice. Kept off the global Math.random so founding a
 * religion does not shift the sequence every other system (and its tests)
 * is drawing from.
 */
let dice = 0x9e3779b9;
export const faithRoll = (): number => {
  dice = (Math.imul(dice ^ (dice >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
  return dice / 4294967296;
};

const idRoll = (id: string): number => {
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) % 100003;
  return (seed % 997) / 997;
};

/** Two distinct traits, seeded so a test can pin them. */
export const rollFaithTraits = (roll: number): FaithTraitId[] => {
  const first = Math.floor(Math.abs(roll) * TRAIT_IDS.length) % TRAIT_IDS.length;
  const step = 1 + (Math.floor(Math.abs(roll * 977)) % (TRAIT_IDS.length - 1));
  return [TRAIT_IDS[first], TRAIT_IDS[(first + step) % TRAIT_IDS.length]];
};

/** Record a religion's founding. Safe to call again: the first founder stands. */
export const foundFaith = (meta: Meta, founder: string | null, holyCity: string | null, roll = idRoll(meta.id)): FaithRecord => {
  const known = faiths.get(meta.id);
  if (known) return known;
  const record: FaithRecord = { traits: rollFaithTraits(roll), founder, holyCity };
  faiths.set(meta.id, record);
  return record;
};

/** A faith's record, minting traits lazily for one founded before this existed. */
export const faithOf = (religionId: string | null | undefined): FaithRecord | null => {
  if (!religionId) return null;
  const known = faiths.get(religionId);
  if (known) return known;
  const meta = metaById(religionId);
  if (!meta || meta.kind !== 'religion') return null;
  return foundFaith(meta, null, null);
};

export const faithHas = (religionId: string | null | undefined, trait: FaithTraitId): boolean =>
  faithOf(religionId)?.traits.includes(trait) ?? false;

export const entityFaithHas = (entity: Entity, trait: FaithTraitId): boolean =>
  faithHas(entity.religionId, trait);

export const resetFaiths = (): void => faiths.clear();

export const allFaithRecords = (): Map<string, FaithRecord> => faiths;

/**
 * How much more a zealous realm resents a neighbour per diplomacy pass when
 * their faiths differ. Zero when neither side is zealous or they share one.
 */
export const holyWarTension = (mine: string | null, theirs: string | null): number => {
  if (!mine || !theirs || mine === theirs) return 0;
  return (faithHas(mine, 'zealotry') ? 6 : 0) + (faithHas(theirs, 'zealotry') ? 3 : 0);
};
