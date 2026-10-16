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
import { biomesWhere, biomeTable } from '../content/biomes';
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

/**
 * Anything not listed walks at full speed and is harmless — which is most of
 * the map, and has to be, or "difficult ground" stops meaning anything.
 */
export const BIOME_STEPS: Partial<Record<BiomeType, BiomeStep>> = biomeTable(def => def.terrain);

/** Speed multiplier for the ground under a creature. */
/** World law: woods slow everyone by a fifth. */
let entanglewood = false;
const WOODS = new Set<BiomeType>(biomesWhere(def => def.forest));

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
