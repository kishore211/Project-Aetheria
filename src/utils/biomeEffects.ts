// What the ground does to whatever is standing on it.
//
// One row per biome (docs/project-tracker/08-MASTER-PLAN.md 18.4), and it buys
// more character per line than anything else on the plan. A swamp that merely
// looks like a swamp is a colour; a swamp that halves your speed is a decision
// about which way to go round. Terrain that only ever affects pathfinding is
// terrain the player learns once and then ignores.
//
// Two separate things live in a row, and they are separate on purpose:
//
//   `speed`  — always on, no randomness, no message. Felt rather than read.
//   `hazard` — a chance per simulated second of something landing, with a
//              status or damage attached. Noticed rather than felt.
//
// Speed with no hazard is most of the table. A biome that hurts you every few
// seconds is a biome you route around permanently, and then it may as well be
// a wall; the ones that bite are the few that should be frightening.
import { isWaterBiome, type BiomeType, type Entity } from '../types/world';
import { applyStatus, type StatusId } from './statusEffects';
import { random as sharedRandom } from './random';

export interface BiomeStep {
  /** Multiplier on movement speed while standing here. */
  speed: number;
  /** Chance per simulated second that the hazard lands. Zero for most rows. */
  hazard: number;
  /** What lands, if anything. */
  status?: StatusId;
  /** Damage per landing. */
  damage?: number;
  /** One line, for the tile inspector. Written to be worth reading. */
  note: string;
}

const step = (
  speed: number, hazard: number, note: string,
  status?: StatusId, damage?: number,
): BiomeStep => ({ speed, hazard, note, status, damage });

/**
 * Anything not listed walks at full speed and is harmless — which is most of
 * the map, and has to be, or "difficult ground" stops meaning anything.
 */
export const BIOME_STEPS: Partial<Record<BiomeType, BiomeStep>> = {
  // -- slow going, no teeth --
  swamp: step(0.6, 0, 'Every step comes back up slower than it went down.'),
  marsh: step(0.7, 0, 'Water where you expected ground.'),
  mountains: step(0.55, 0, 'Vertical, mostly.'),
  hills: step(0.85, 0, 'Never quite flat.'),
  rainforest: step(0.75, 0, 'You get through it, but not quickly.'),
  tropical_forest: step(0.8, 0, 'Thick underfoot.'),
  deciduous_forest: step(0.9, 0, 'Roots, and a lot of them.'),
  coniferous_forest: step(0.9, 0, 'Needles, silence, and poor footing.'),
  taiga: step(0.85, 0, 'Cold ground that never fully thaws.'),
  beach: step(0.95, 0, 'Sand takes a little of every step.'),
  // The one row on the table that is *good* to walk through, which is the
  // point of it: a map where every named ground is a penalty teaches the
  // player to avoid every named ground.
  bloom: step(1, 0, 'Easy going, and it smells extraordinary.'),
  rocky_shore: step(0.8, 0, 'Loose stone, all of it moving.'),
  shallow_water: step(0.5, 0, 'Wading, with the bottom still under you.'),
  river: step(0.5, 0, 'The current does not care where you were going.'),
  lake: step(0.5, 0, 'Wading, and then swimming.'),

  // -- ground that bites --
  desert: step(0.9, 0.035, 'The heat is the whole problem.', 'exhausted'),
  mesa: step(0.85, 0.03, 'Bare rock, and nothing that drinks.', 'exhausted'),
  badlands: step(0.85, 0.05, 'Poisoned ground, and it shows.', 'exhausted'),
  snow: step(0.7, 0.03, 'Knee-deep, and getting colder.', 'exhausted'),
  ice: step(0.75, 0.035, 'No grip, and no shelter anywhere.', 'exhausted'),
  glacier: step(0.65, 0.05, 'Nothing has ever lived here.', 'exhausted'),
  tundra: step(0.9, 0.015, 'Wind with nothing to stop it.', 'exhausted'),
  corrupted: step(0.9, 0.045, 'Something is wrong with the ground itself.', 'cursed'),
  ashland: step(0.9, 0.02, 'Soft underfoot, and it gets everywhere.', 'exhausted'),
  salt_flat: step(0.95, 0.045, 'Flat, bright, and there is nothing to drink.', 'exhausted'),
  volcanic: step(0.8, 0.06, 'The rock is still warm, and in places it is not rock.', undefined, 4),
  infernal: step(0.8, 0.07, 'The ground is on fire, in a manner of speaking and also literally.', undefined, 5),
  wasteland: step(0.9, 0.03, 'Nothing grows, and the air tastes of metal.', 'exhausted'),
  mushroom: step(0.85, 0, 'Springy, damp, and it squeaks.'),
  // The two kind ones: a god who plants candy wants people to enjoy it.
  candy: step(1, 0, 'Sticky underfoot, and absolutely nobody minds.'),
  crystal: step(0.95, 0, 'Clear as glass and cold as it, and it hums.'),
};

/** Speed multiplier for the ground under a creature. */
/** World law: woods slow everyone by a fifth. */
let entanglewood = false;
const WOODS = new Set<BiomeType>([
  'deciduous_forest', 'coniferous_forest', 'rainforest', 'tropical_forest', 'taiga', 'enchanted_forest',
]);

export const setEntanglewood = (on: boolean): void => {
  entanglewood = on;
};

export const groundSpeed = (biome: BiomeType): number =>
  (BIOME_STEPS[biome]?.speed ?? 1) * (entanglewood && WOODS.has(biome) ? 0.8 : 1);

/**
 * Roll whatever the ground does to a creature standing on it.
 *
 * Returns the damage dealt, so the caller can kill and report. Guarded before
 * the roll and not after: a subsystem a creature cannot participate in must
 * not consume its randomness, or the ninety per cent of the map with no hazard
 * on it silently re-rolls every other random decision in the game. That has
 * bitten this codebase three times.
 */
export const stepOnGround = (
  entity: Entity,
  biome: BiomeType,
  delta: number,
  random: () => number = sharedRandom,
): number => {
  const ground = BIOME_STEPS[biome];
  if (!ground || ground.hazard <= 0) return 0;
  // The dead and the swimming are exempt: drowning is its own system, and a
  // corpse cannot be made more exhausted.
  if (entity.health <= 0 || isWaterBiome(biome)) return 0;
  // Fireproof walks over burning ground as if it were grass.
  if ((biome === 'volcanic' || biome === 'infernal') && entity.traits?.includes('fireproof')) return 0;
  if (random() >= ground.hazard * delta) return 0;

  if (ground.status) applyStatus(entity, ground.status);
  if (ground.damage) {
    entity.health = Math.max(0, entity.health - ground.damage);
    return ground.damage;
  }
  return 0;
};
