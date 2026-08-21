// Loyalty, and the civil stats it is built from.
//
// WorldBox's signature political moment is a province going quiet, then
// seceding, then being invaded by the empire it just left — and the whole thing
// runs off one number with an **eighteen-factor breakdown the player can open**
// (06-WORLDBOX-COMPLETE-REFERENCE.md §7). The breakdown is not decoration: a
// rebellion you cannot see coming is indistinguishable from a bug, and a number
// with no explanation is something the player learns to ignore.
//
// So this module computes loyalty *and* returns the reasons, and the reasons
// are what the interface shows.
//
// Ours has thirteen factors rather than eighteen, because the missing five
// depend on culture, language, religion, clans and subspecies — none of which
// exist yet (Phase 15). Adding empty factors that always read zero would make
// the breakdown longer and less informative, so they arrive with the systems
// they measure.

import type { Entity } from '../types/world';

/**
 * The four stats that decide how somebody governs.
 *
 * Rolled from a creature's attributes rather than stored independently, so a
 * clever creature makes a clever ruler and the numbers cannot drift out of
 * step with the sprite you inspected. Deterministic given the entity, which
 * also means no save-file migration.
 */
export interface CivilStats {
  /** Talking other kingdoms down. Drives peace and alliance plots. */
  diplomacy: number;
  /** Winning wars, and wanting them. */
  warfare: number;
  /** Keeping a realm fed and loyal. Weighted double in the loyalty formula. */
  stewardship: number;
  /** Seeing plots coming, and running them. */
  intrigue: number;
}

/**
 * Stat range. Deliberately narrow: the point is that rulers differ, not that
 * one ruler is ten times another. A spread this size moves loyalty by tens of
 * points once stewardship is doubled, which is enough to matter.
 */
const STAT_MIN = 1;
const STAT_MAX = 10;

const clampStat = (value: number): number =>
  Math.max(STAT_MIN, Math.min(STAT_MAX, Math.round(value)));

/**
 * Derive civil stats for a creature.
 *
 * Uses the creature's own attributes plus a stable hash of its id, so two
 * equally clever villagers are not identical rulers. The hash is the only
 * randomness and it is a pure function of the id, which keeps this safe to
 * call from anywhere — including from a render, and from a test.
 */
export const civilStats = (entity: Entity): CivilStats => {
  const attributes = entity.attributes;
  const hash = hashId(entity.id);

  // Four independent 0-1 values out of one hash.
  const a = ((hash >>> 0) % 1000) / 1000;
  const b = ((hash >>> 7) % 1000) / 1000;
  const c = ((hash >>> 14) % 1000) / 1000;
  const d = ((hash >>> 21) % 1000) / 1000;

  const intellect = attributes.intelligence / 10;
  const might = attributes.strength / 10;
  const grit = attributes.resilience / 10;

  return {
    diplomacy: clampStat(2 + intellect * 4 + a * 5),
    warfare: clampStat(2 + might * 4 + b * 5),
    stewardship: clampStat(2 + (intellect + grit) * 2 + c * 5),
    intrigue: clampStat(2 + intellect * 3 + d * 6),
  };
};

/** FNV-1a, so a creature's stats never change and never need saving. */
const hashId = (id: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/** How well somebody governs, in one number. Stewardship counts double. */
export const leadership = (stats: CivilStats): number =>
  stats.diplomacy + stats.stewardship * 2;

// -- loyalty ---------------------------------------------------------------

/** One line of the breakdown. */
export interface LoyaltyFactor {
  label: string;
  value: number;
}

export interface LoyaltyResult {
  /** The total, clamped. */
  score: number;
  /** Every contribution, largest magnitude first. Zeroes are dropped. */
  factors: LoyaltyFactor[];
}

/** Everything the formula needs, gathered by the caller. */
export interface LoyaltyInput {
  isCapital: boolean;
  /** Civil stats of the kingdom's ruler, if a real unit holds the crown. */
  king: CivilStats | null;
  /** Civil stats of this village's leader. */
  leader: CivilStats | null;
  /** Traits of this village's leader, for the modifiers. */
  leaderTraits: string[];
  population: number;
  capitalPopulation: number;
  territory: number;
  capitalTerritory: number;
  /** Tiles from this village to the capital. */
  distanceToCapital: number;
  /** True when this village's claim touches the capital's. */
  bordersCapital: boolean;
  /** Seconds this village has existed. */
  villageAge: number;
  /** Seconds the kingdom has existed. */
  kingdomAge: number;
  /** How many villages the kingdom holds beyond what it can govern. */
  villagesOverLimit: number;
  /** True when the kingdom is losing a war. */
  losingWar: boolean;
  /** Does the village share the ruler's species? */
  sameSpeciesAsKing: boolean;
  /** Mean happiness of the residents, -100..+100. */
  averageMood: number;
}

export const LOYALTY_MIN = -100;
export const LOYALTY_MAX = 100;

/**
 * Trait modifiers on a village leader.
 *
 * WorldBox has a long list running from Pacifist +50 to Madness −100. Ours only
 * covers traits we actually have, and the spread is deliberately wide: a leader
 * with the wrong temperament should be able to lose a province on its own.
 */
const LEADER_TRAITS: Record<string, number> = {
  genius: 12,
  tough: 6,
  longevity: 8,
  bloodthirsty: -18,
  pyromaniac: -30,
  coward: -12,
};

/**
 * The formula.
 *
 * Returns the reasons as well as the number, and the caller is expected to show
 * them. Factors are ordered by magnitude rather than by definition order, so
 * the breakdown opens with whatever is actually driving the outcome.
 */
export const loyaltyFor = (input: LoyaltyInput): LoyaltyResult => {
  const factors: LoyaltyFactor[] = [];
  const add = (label: string, value: number) => {
    if (Math.abs(value) < 0.5) return;
    factors.push({ label, value: Math.round(value) });
  };

  if (input.isCapital) {
    // The seat of a kingdom does not secede from itself. Given its own
    // enormous constant rather than a special case in the caller, so it still
    // shows up in the breakdown as the reason.
    add('Seat of the kingdom', LOYALTY_MAX);
  }

  // A weak king under a strong governor is how provinces get ideas.
  if (input.king && input.leader) {
    add('Rule from the throne', (leadership(input.king) - leadership(input.leader)) * 1.6);
  } else if (input.king) {
    add('Rule from the throne', leadership(input.king) * 0.8);
  }

  for (const trait of input.leaderTraits) {
    const modifier = LEADER_TRAITS[trait];
    if (modifier) add(`Governor is ${trait}`, modifier);
  }

  // Outgrowing the capital is the classic road to secession.
  add(
    'Larger than the capital',
    -Math.min(30, Math.max(0, (input.population - input.capitalPopulation) / 3)),
  );
  add(
    'Holds more land than the capital',
    -Math.min(15, Math.max(0, (input.territory - input.capitalTerritory) / 20)),
  );

  add('Distance from the capital', -input.distanceToCapital / 10);
  if (input.bordersCapital) add('Borders the capital', 20);

  // Young settlements and young kingdoms are still enthusiastic.
  add('Recently founded', Math.max(0, (150 - input.villageAge) / 150) * 25);
  add('A new kingdom', Math.max(0, (240 - input.kingdomAge) / 240) * 20);

  // Over-expansion. This replaces the hard village cap the settlement system
  // used to enforce: an empire can now grow past what it can govern, and pays
  // for it in loyalty rather than being forbidden from trying.
  add('Kingdom overextended', -input.villagesOverLimit * 25);

  // Losing a war *raises* loyalty. WorldBox does this and it is right: an
  // outside threat is the one thing that reliably stops a province complaining
  // about the capital.
  if (input.losingWar) add('Enemies at the gate', 35);

  if (!input.sameSpeciesAsKing) {
    const xenophobe = input.leaderTraits.includes('bloodthirsty');
    add('Ruled by another people', xenophobe ? -50 : -25);
  }

  // Ours, not theirs: Phase 10 gave every creature a mood, and a province full
  // of miserable people is exactly where a rebellion should start.
  add('Mood of the people', input.averageMood * 0.35);

  factors.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const total = factors.reduce((sum, factor) => sum + factor.value, 0);

  return {
    score: Math.max(LOYALTY_MIN, Math.min(LOYALTY_MAX, Math.round(total))),
    factors,
  };
};

/**
 * How many villages a kingdom can govern before loyalty starts to suffer.
 *
 * Scales with the ruler's stewardship, so a capable king holds a wider realm
 * together — which is the whole reason civil stats exist.
 */
export const governableVillages = (king: CivilStats | null): number =>
  king ? 2 + Math.floor(king.stewardship / 2) : 3;

/** Loyalty below this, sustained, and the province goes. */
export const REBELLION_THRESHOLD = 0;
