// Heritable unit traits — the cheapest source of emergent stories in the game.
import type { Entity, EntityType, TraitId } from '../types/world';

export interface TraitInfo {
  id: TraitId;
  label: string;
  description: string;
  /** Tailwind text colour used by the inspector. */
  tone: string;
}

export const TRAITS: Record<TraitId, TraitInfo> = {
  swift: { id: 'swift', label: 'Swift', description: 'Moves noticeably faster.', tone: 'text-sky-300' },
  strong: { id: 'strong', label: 'Strong', description: 'Hits considerably harder.', tone: 'text-red-300' },
  tough: { id: 'tough', label: 'Tough', description: 'Much larger health pool.', tone: 'text-orange-300' },
  genius: { id: 'genius', label: 'Genius', description: 'Sharper senses and wider awareness.', tone: 'text-indigo-300' },
  longevity: { id: 'longevity', label: 'Long-lived', description: 'Lives half again as long.', tone: 'text-emerald-300' },
  fertile: { id: 'fertile', label: 'Fertile', description: 'Reproduces far more often.', tone: 'text-pink-300' },
  immortal: { id: 'immortal', label: 'Immortal', description: 'Never dies of old age.', tone: 'text-amber-300' },
  regeneration: { id: 'regeneration', label: 'Regeneration', description: 'Slowly heals its wounds.', tone: 'text-lime-300' },
  pyromaniac: { id: 'pyromaniac', label: 'Pyromaniac', description: 'Sets the ground alight as it wanders.', tone: 'text-orange-400' },
  coward: { id: 'coward', label: 'Coward', description: 'Flees from threats much earlier.', tone: 'text-slate-300' },
  bloodthirsty: { id: 'bloodthirsty', label: 'Bloodthirsty', description: 'Hunts even when well fed.', tone: 'text-rose-400' },
  fireproof: { id: 'fireproof', label: 'Fireproof', description: 'Fire and burning ground cannot touch it.', tone: 'text-amber-400' },
  giant: { id: 'giant', label: 'Giant', description: 'Bigger and hardier than the rest of its kind.', tone: 'text-orange-300' },
  tiny: { id: 'tiny', label: 'Tiny', description: 'Small, quick, and easy to overlook.', tone: 'text-sky-200' },
  venomous: { id: 'venomous', label: 'Venomous', description: 'Its bite does far more than it should.', tone: 'text-lime-400' },
  peaceful: { id: 'peaceful', label: 'Peaceful', description: 'Will not hunt unless it is starving.', tone: 'text-teal-300' },
  lucky: { id: 'lucky', label: 'Lucky', description: 'Accidents tend to happen to somebody else.', tone: 'text-yellow-300' },
  nimble: { id: 'nimble', label: 'Nimble', description: 'Dodges one blow in four.', tone: 'text-cyan-300' },
  glutton: { id: 'glutton', label: 'Glutton', description: 'Always hungry, and it shows.', tone: 'text-orange-200' },
  armored: { id: 'armored', label: 'Thick-skinned', description: 'Shrugs off a third of every wound.', tone: 'text-stone-300' },
};

const ALL_TRAITS = Object.keys(TRAITS) as TraitId[];

/** Rarer traits should not show up on every second creature. */
const WEIGHTS: Record<TraitId, number> = {
  swift: 10,
  strong: 10,
  tough: 9,
  genius: 7,
  longevity: 7,
  fertile: 7,
  regeneration: 4,
  coward: 8,
  bloodthirsty: 5,
  pyromaniac: 2,
  immortal: 1,
  fireproof: 3,
  giant: 4,
  tiny: 4,
  venomous: 3,
  peaceful: 5,
  lucky: 4,
  nimble: 5,
  glutton: 6,
  armored: 4,
};

const pickWeighted = (): TraitId => {
  const total = ALL_TRAITS.reduce((sum, id) => sum + WEIGHTS[id], 0);
  let roll = Math.random() * total;
  for (const id of ALL_TRAITS) {
    roll -= WEIGHTS[id];
    if (roll <= 0) return id;
  }
  return 'swift';
};

/** Traits for a brand new creature. Most have none; a few have two. */
export const rollTraits = (): TraitId[] => {
  const roll = Math.random();
  const count = roll < 0.62 ? 0 : roll < 0.94 ? 1 : 2;
  const traits: TraitId[] = [];
  for (let i = 0; i < count; i++) {
    const trait = pickWeighted();
    if (!traits.includes(trait)) traits.push(trait);
  }
  return traits;
};

/**
 * A child keeps each parent trait with high probability and may mutate a new
 * one, so lineages drift instead of being reshuffled every generation.
 */
export const inheritTraits = (parentTraits: TraitId[] = []): TraitId[] => {
  const traits = parentTraits.filter(() => Math.random() < 0.75);
  if (Math.random() < 0.12) {
    const mutation = pickWeighted();
    if (!traits.includes(mutation)) traits.push(mutation);
  }
  return traits;
};

/** Apply the stat side of a trait list to a freshly created entity. */
export const applyTraits = (entity: Entity): void => {
  for (const trait of entity.traits ?? []) applyTrait(entity, trait);
};

/**
 * Give a living creature one more trait, stats and all. Returns false when it
 * already had it, so a power never doubles a multiplier.
 */
export const grantTrait = (entity: Entity, trait: TraitId): boolean => {
  const traits = (entity.traits ??= []);
  if (traits.includes(trait)) return false;
  // Opposites cancel rather than stack: a giant made tiny is merely ordinary.
  const opposite: Partial<Record<TraitId, TraitId>> = {
    giant: 'tiny', tiny: 'giant', peaceful: 'bloodthirsty', bloodthirsty: 'peaceful', coward: 'bloodthirsty',
  };
  const clash = opposite[trait];
  if (clash && traits.includes(clash)) traits.splice(traits.indexOf(clash), 1);
  traits.push(trait);
  applyTrait(entity, trait);
  return true;
};

/** The stat side of one trait. */
const applyTrait = (entity: Entity, trait: TraitId): void => {
  {
    switch (trait) {
      case 'swift':
        entity.attributes.speed = Math.round(entity.attributes.speed * 1.6);
        break;
      case 'strong':
        entity.attributes.strength = Math.round(entity.attributes.strength * 1.7);
        break;
      case 'tough':
        entity.maxHealth = Math.round(entity.maxHealth * 1.8);
        entity.health = entity.maxHealth;
        entity.attributes.resilience = Math.round(entity.attributes.resilience * 1.4);
        break;
      case 'genius':
        entity.attributes.intelligence = Math.round(entity.attributes.intelligence * 1.8);
        break;
      case 'longevity':
        entity.maxAge = Math.round(entity.maxAge * 1.5);
        break;
      case 'giant':
        entity.maxHealth = Math.round(entity.maxHealth * 1.3);
        entity.health = entity.maxHealth;
        entity.attributes.strength = Math.round(entity.attributes.strength * 1.2);
        break;
      case 'tiny':
        entity.maxHealth = Math.round(entity.maxHealth * 0.8);
        entity.health = entity.maxHealth;
        entity.attributes.speed = Math.round(entity.attributes.speed * 1.2);
        break;
      default:
        break;
    }
  }
};

export const hasTrait = (entity: Entity, trait: TraitId): boolean =>
  entity.traits?.includes(trait) ?? false;

/** Sentient races get slightly better odds of an interesting trait. */
export const rollTraitsForType = (type: EntityType): TraitId[] => {
  const traits = rollTraits();
  if (traits.length === 0 && ['human', 'elf', 'dwarf', 'orc'].includes(type) && Math.random() < 0.25) {
    traits.push(pickWeighted());
  }
  return traits;
};
