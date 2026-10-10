// Families and clans.
//
// WorldBox people belong to families and clans, and a clan's name runs down
// the generations: you can follow the Ironbeards through three wars and two
// kingdoms (06-WORLDBOX-COMPLETE-REFERENCE.md §3, Families and clans). It is
// the cheapest possible way to make a population into lineages. A surname is
// enough to turn "a dwarf died" into "the last of the Ironbeards died".
//
// Clan names are hashed from an id rather than drawn from Math.random: a
// founder's surname must not cost the simulation any of its random stream
// (rule 4 in the master plan), and the same founder always gets the same name.

import type { Entity, EntityType } from '../types/world';

const PARTS: Record<string, [string[], string[]]> = {
  human: [
    ['Oak', 'Ash', 'Brook', 'Stone', 'Hart', 'Fair', 'Black', 'White', 'Wood', 'Hill', 'Mill', 'Thorn', 'Win', 'Red'],
    ['wood', 'ford', 'well', 'hart', 'field', 'ley', 'wick', 'son', 'by', 'croft', 'more', 'gate'],
  ],
  elf: [
    ['Silver', 'Moon', 'Star', 'Leaf', 'Dawn', 'Wind', 'Sun', 'Mist', 'Glimmer', 'Vale', 'Dew', 'Night'],
    ['whisper', 'song', 'bough', 'glade', 'shade', 'bloom', 'light', 'river', 'petal', 'brook'],
  ],
  dwarf: [
    ['Iron', 'Stone', 'Gold', 'Copper', 'Deep', 'Anvil', 'Granite', 'Coal', 'Bronze', 'Flint', 'Rock', 'Steel'],
    ['beard', 'hammer', 'fist', 'delver', 'forge', 'helm', 'foot', 'shield', 'brow', 'mantle'],
  ],
  orc: [
    ['Skull', 'Blood', 'Bone', 'Gore', 'Iron', 'Rot', 'Ash', 'Grim', 'War', 'Black', 'Rage', 'Gut'],
    ['splitter', 'tusk', 'fang', 'maw', 'crusher', 'hide', 'eye', 'claw', 'ripper', 'jaw'],
  ],
};

/** FNV-1a. */
const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Whether this kind of creature carries a family name at all. */
export const hasClan = (type: EntityType): boolean => type in PARTS;

/** A clan name for a founder, from its id. Same id, same name. */
export const clanName = (type: EntityType, seed: string): string => {
  const [heads, tails] = PARTS[type] ?? PARTS.human;
  const h = hash(seed);
  return heads[h % heads.length] + tails[(h >>> 12) % tails.length];
};

/** The given name, without any surname. */
export const givenName = (entity: Pick<Entity, 'name' | 'clan'>): string =>
  entity.clan && entity.name.endsWith(` ${entity.clan}`)
    ? entity.name.slice(0, -(entity.clan.length + 1))
    : entity.name;

/** Give a creature a clan, rewriting its name to carry it. */
export const joinClan = (entity: Entity, clan: string): void => {
  const first = givenName(entity);
  entity.clan = clan;
  entity.name = `${first} ${clan}`;
};

/**
 * Found a clan for a newcomer of a people that has them. Called once, at
 * spawn, for creatures that arrive without parents.
 */
export const foundClan = (entity: Entity): void => {
  if (!hasClan(entity.type) || entity.clan) return;
  joinClan(entity, clanName(entity.type, entity.id));
};

/** A child takes its parents' clan and remembers who they were. */
export const bornInto = (child: Entity, parent: Entity, other: Entity | null): void => {
  child.parentIds = other ? [parent.id, other.id] : [parent.id];
  if (parent.clan && hasClan(child.type)) joinClan(child, parent.clan);
};
