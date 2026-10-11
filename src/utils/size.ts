// How big a creature is, as one number.
//
// Phase 19.3. Size was a lookup on the creature's *kind* and nothing else, so
// every wolf in the world was exactly as large as every other wolf and the
// number could not carry any information. Made a per-creature float with trait
// deltas on it, it does three jobs at once: it draws the sprite, it varies a
// crowd, and — through one discrete tier — it decides who can eat whom.
//
// The tier is the part worth arguing about. A continuous comparison ("bigger
// than you, so I can eat you") makes predation a knife-edge: two wolves a
// percent apart, and one hunts the other. Bands mean a runt is still a wolf,
// and only a creature at the edge of its band is changed by its own size roll
// — which is exactly where you want individual variation to matter.
import type { Entity, EntityType, TraitId } from '../types/world';

/** Base size per kind, in world units. Half of what the sprite ends up as. */
const BASE: Partial<Record<EntityType, number>> = {
  human: 0.15, elf: 0.17, dwarf: 0.12, orc: 0.18,
  wolf: 0.12, bear: 0.2, deer: 0.15, rabbit: 0.08,
  bird: 0.07, fish: 0.09, sheep: 0.12, chicken: 0.08,
  fox: 0.11, snake: 0.11,
  dragon: 0.35, demon: 0.25, zombie: 0.16, skeleton: 0.16,
  elemental: 0.2, bandit: 0.15,
  cat: 0.08, dog: 0.1, cow: 0.17, pig: 0.12, crab: 0.07, frog: 0.06, penguin: 0.09,
  turtle: 0.1, monkey: 0.11, rat: 0.05, crocodile: 0.2, piranha: 0.07, hyena: 0.12,
  rhino: 0.24, buffalo: 0.19, unicorn: 0.18, fairy: 0.07, ghost: 0.15, mage: 0.16,
  druid: 0.16, alien: 0.14, snowman: 0.15,
  goat: 0.11, camel: 0.19, ostrich: 0.16, flamingo: 0.13, seal: 0.13, polar_bear: 0.21,
  beetle: 0.05, bee: 0.04, butterfly: 0.05, grasshopper: 0.05,
  necromancer: 0.16, plague_doctor: 0.15, fire_skull: 0.09, cold_one: 0.2, ufo: 0.2,
  sand_spider: 0.13, acid_blob: 0.14, lil_pumpkin: 0.08, gummy_bear: 0.09, crabzilla: 0.4,
  flame_tower: 0.26, ice_tower: 0.26,
  white_mage: 0.16, angel: 0.18, sandworm: 0.38, langton_ant: 0.07, tumor: 0.12, treant: 0.28,
  candy_man: 0.14, jumpy_skull: 0.1, robot_santa: 0.18, yeti: 0.24, monolith: 0.3, grey_goo: 0.12,
};

export const baseSizeOf = (type: EntityType): number => BASE[type] ?? 0.15;

/**
 * What each trait does to a body.
 *
 * Multipliers rather than absolute deltas, so the same trait means the same
 * thing on a rabbit and on a dragon. Kept small — a trait should nudge a
 * creature within its class, not promote it out of one, or `strong` quietly
 * becomes "can now eat bears".
 */
const TRAIT_SCALE: Partial<Record<TraitId, number>> = {
  strong: 1.14,
  tough: 1.08,
  swift: 0.94,
  immortal: 1.1,
  regeneration: 1.05,
  coward: 0.96,
  giant: 1.18,
  tiny: 0.85,
};

/** How much two creatures of a kind may differ, either side. */
const SPREAD = 0.13;

/**
 * Roll a size for a new creature.
 *
 * The individual variation is drawn once at birth and then carried, not
 * recomputed: a creature that changes size between frames is a rendering
 * fault, and one that changes size when a trait is inspected is worse.
 */
export const rollSize = (
  type: EntityType,
  traits: TraitId[] | undefined,
  random: () => number = Math.random,
): number => {
  let size = baseSizeOf(type);
  for (const trait of traits ?? []) size *= TRAIT_SCALE[trait] ?? 1;
  // Triangular rather than uniform: most of a population sits near the middle
  // of its range, and a flat distribution gives as many giants as averages.
  const spread = (random() + random() - 1) * SPREAD;
  return size * (1 + spread);
};

/** A creature's size, falling back to its kind for anything born before this. */
export const sizeOf = (entity: Pick<Entity, 'type' | 'size'>): number =>
  entity.size ?? baseSizeOf(entity.type);

/**
 * Size bands, smallest first. The boundaries are what predation reads.
 *
 * Placed so the existing bestiary falls where it should: birds, rabbits and
 * chickens at the bottom; wolves, sheep and dwarves next; people, deer and
 * orcs above them; bears and demons above that; dragons alone at the top.
 */
export const SIZE_TIERS = [0.1, 0.135, 0.19, 0.28] as const;

export const TIER_LABELS = ['tiny', 'small', 'middling', 'large', 'huge'] as const;

/** 0-4. */
export const sizeTier = (size: number): number => {
  let tier = 0;
  for (const boundary of SIZE_TIERS) {
    if (size >= boundary) tier += 1;
  }
  return tier;
};

export const describeSize = (size: number): string => TIER_LABELS[sizeTier(size)];

/**
 * May this creature hunt that one?
 *
 * One band above itself, and no further.
 *
 * The obvious rule — strictly bigger than you — is wrong, and checking it
 * against the bestiary is what showed it: wolves take deer, orcs take people,
 * and both of those are prey the same size or larger than the hunter. A rule
 * that forbids them does not model a food chain, it deletes one.
 *
 * What this does instead is bite at the margins, which is where the individual
 * size roll lives. A wolf is normally one band under a deer and can just about
 * take it; a small or swift-built wolf drops a band and is left with sheep and
 * rabbits, while an oversized deer puts itself out of reach. The table still
 * says what counts as prey. This says whether *this* animal is big enough to
 * try, and the answer is different for two wolves standing next to each other.
 */
export const canPreyOn = (
  hunter: Pick<Entity, 'type' | 'size'>,
  quarry: Pick<Entity, 'type' | 'size'>,
): boolean => sizeTier(sizeOf(hunter)) + 1 >= sizeTier(sizeOf(quarry));
