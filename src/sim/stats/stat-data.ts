import type { StatDef } from './stat-asset';

/**
 * Starter stat table. One place to add more stats.
 *
 * Design choices (tunable; documented here, not in code paths):
 * - Combat chances/reductions are fractions clamped to [0, 1].
 * - `default` is what a bare container reports; creature assets then add
 *   their own flat values through the 'asset' source.
 * - Scale: health/damage are in "hit points"; speed in tiles per second-ish
 *   units; lifespan in world years; size is a visual/physical scale ratio.
 * - Social skill stats (diplomacy..intrigue) are small integers, 0..100.
 */
export const STAT_DEFS: readonly StatDef[] = [
  { id: 'health', default: 1, min: 1, max: 1_000_000 },
  { id: 'damage', default: 0, min: 0, max: 1_000_000 },
  { id: 'armor', default: 0, min: 0, max: 100, decimals: 0 },
  { id: 'speed', default: 10, min: 1, max: 500, decimals: 1 },
  { id: 'attack_speed', default: 10, min: 1, max: 1000, decimals: 1 },
  { id: 'critical_chance', default: 0.05, min: 0, max: 1, percent: true },
  { id: 'critical_damage_multiplier', default: 1.5, min: 1, max: 20, multiplier: true, decimals: 2 },
  { id: 'knockback', default: 0, min: 0, max: 100, decimals: 1 },
  { id: 'knockback_reduction', default: 0, min: 0, max: 1, percent: true },
  { id: 'accuracy', default: 0.9, min: 0, max: 2, percent: true },
  { id: 'dodge', default: 0, min: 0, max: 0.95, percent: true },
  { id: 'range', default: 1, min: 0, max: 200, decimals: 1 },
  { id: 'size', default: 1, min: 0.1, max: 20, multiplier: true, decimals: 2 },
  { id: 'lifespan', default: 60, min: 1, max: 100_000 },
  { id: 'fertility', default: 0.1, min: 0, max: 1, percent: true },
  { id: 'offspring', default: 1, min: 0, max: 50 },
  { id: 'mass', default: 10, min: 0.1, max: 1_000_000, decimals: 1 },
  { id: 'stamina', default: 100, min: 0, max: 100_000 },
  { id: 'mana', default: 0, min: 0, max: 100_000 },
  { id: 'diplomacy', default: 0, min: 0, max: 100 },
  { id: 'warfare', default: 0, min: 0, max: 100 },
  { id: 'stewardship', default: 0, min: 0, max: 100 },
  { id: 'intrigue', default: 0, min: 0, max: 100 },
  { id: 'loyalty_traits', default: 0, min: -1000, max: 1000 },
  { id: 'opinion', default: 0, min: -1000, max: 1000 },
  // Personality axes, each 0..1 (0.5 = neutral).
  { id: 'personality_aggression', default: 0.5, min: 0, max: 1, percent: true },
  { id: 'personality_administration', default: 0.5, min: 0, max: 1, percent: true },
  { id: 'personality_diplomatic', default: 0.5, min: 0, max: 1, percent: true },
  { id: 'personality_rationality', default: 0.5, min: 0, max: 1, percent: true },
];
