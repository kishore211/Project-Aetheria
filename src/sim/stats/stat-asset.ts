import { Library, type Asset } from '../core/library';

/**
 * Definition of one stat. Final value of a stat on a container is
 * `clamp((default + sum(flat)) * (1 + sum(mult)), min, max)`.
 *
 * Conventions:
 * - `percent` stats are fractions (0.25 = 25%); the UI multiplies by 100.
 * - `multiplier` stats are ratios where 1 = unchanged (e.g. crit damage 1.5).
 * - `mult` contributions are fractions: 0.1 means +10%.
 */
export interface StatAsset extends Asset {
  readonly default: number;
  readonly min: number;
  readonly max: number;
  readonly percent: boolean;
  readonly multiplier: boolean;
  /** Decimals to show in the UI. */
  readonly decimals: number;
}

export type StatDef = Pick<StatAsset, 'id' | 'default'> & Partial<Omit<StatAsset, 'id' | 'default'>>;

export function defineStat(def: StatDef): StatAsset {
  return {
    min: 0,
    max: Number.POSITIVE_INFINITY,
    percent: false,
    multiplier: false,
    decimals: def.percent ? 1 : 0,
    ...def,
  };
}

export function createStatLibrary(defs: readonly StatDef[]): Library<StatAsset> {
  const lib = new Library<StatAsset>('stats');
  for (const d of defs) lib.add(defineStat(d));
  return lib;
}
