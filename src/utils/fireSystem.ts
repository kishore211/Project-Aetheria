// Fire.
//
// Pulled out of the engine hook so it can be tested, because fire is the one
// system in the game with a real runaway failure mode: a burning tile lives a
// few seconds and can light its neighbours, so if the spread rate gives it a
// branching factor above one, a single spark deterministically consumes the
// world. That is not a hypothetical — it happened, and it took a 33-creature
// world down in 24 seconds.
import { setTileBiome } from './pathfinding';
import { isWaterBiome, type Tile } from '../types/world';
import { simulation } from './simulation';
import { random } from './random';

export const FLAMMABLE_BIOMES = [
  'deciduous_forest', 'coniferous_forest', 'taiga', 'rainforest',
  'tropical_forest', 'enchanted_forest', 'grassland', 'savanna', 'hills',
];

/** Seconds a tile burns for, by how much there is to burn. */
const FUEL_FLAMMABLE = 6;
const FUEL_SPARSE = 2.5;

/**
 * Base chance per spread attempt. One attempt happens per burning tile per
 * tick, so with a 0.25 s tick and ~6 s of fuel a tile makes ~24 attempts in its
 * life. Keeping `base x attempts x dryness` near or below 1 is what stops the
 * cascade — see the test in fireSystem.test.ts, which asserts it.
 */
const SPREAD_BASE = 0.035;

export interface FireCallbacks {
  /** A tile caught: spawn the flame, repaint it. */
  onIgnite?: (tile: Tile) => void;
  /** A tile stopped burning. `burned` is false when rain put it out. */
  onExtinguish?: (tile: Tile, burned: boolean) => void;
  /** Hurt whatever is standing in the flames. */
  onDamage?: (x: number, y: number, radius: number, amount: number) => void;
}

export class FireSystem {
  private tiles: Tile[][];
  private burning = new Set<Tile>();
  private callbacks: FireCallbacks;

  constructor(tiles: Tile[][], callbacks: FireCallbacks = {}) {
    this.tiles = tiles;
    this.callbacks = callbacks;
  }

  get burningCount(): number {
    return this.burning.size;
  }

  get burningTiles(): ReadonlySet<Tile> {
    return this.burning;
  }

  /** Set a tile alight, if there is anything there to burn. */
  ignite(tile: Tile): boolean {
    if (tile.isOnFire) return false;
    if (tile.height <= 0.25 || isWaterBiome(tile.type)) return false;

    tile.isOnFire = true;
    tile.fireIntensity = 1;
    tile.fireFuel = FLAMMABLE_BIOMES.includes(tile.type) ? FUEL_FLAMMABLE : FUEL_SPARSE;
    this.burning.add(tile);
    this.callbacks.onIgnite?.(tile);
    return true;
  }

  /**
   * Put a tile out. `burned` means it ran out of fuel rather than being rained
   * on, and leaves the ground scorched. The scorching lives here rather than in
   * the caller because it is fire behaviour, not presentation — and because a
   * rule the tests cannot see is a rule that quietly stops working.
   */
  /**
   * Put every fire out at once.
   *
   * Iterates a copy, because `extinguish` mutates the burning set and
   * iterating a Set while deleting from it is how you silently skip half of
   * them. Used by the Age of Tears, whose rain is meant to be relentless
   * rather than merely discouraging.
   */
  extinguishAll(): number {
    const doused = Array.from(this.burning);
    for (const tile of doused) this.extinguish(tile, false);
    return doused.length;
  }

  extinguish(tile: Tile, burned: boolean): void {
    tile.isOnFire = false;
    tile.fireIntensity = 0;
    this.burning.delete(tile);

    if (burned && tile.height > 0.25) {
      setTileBiome(tile, 'badlands');
      tile.structure = null;
      tile.fertility = Math.max(0, tile.fertility - 0.4);
      tile.resources = tile.resources.filter(
        resource => resource.type !== 'wood' && resource.type !== 'food',
      );
    }

    this.callbacks.onExtinguish?.(tile, burned);
  }

  clear(): void {
    for (const tile of this.burning) {
      tile.isOnFire = false;
      tile.fireIntensity = 0;
    }
    this.burning.clear();
  }

  /**
   * Burn down, damage, and maybe spread. Rain triples burn-down and stops
   * spread entirely; `spreadEnabled` is the world law.
   */
  update(delta: number, options: { raining: boolean; spreadEnabled: boolean }): void {
    if (this.burning.size === 0) return;

    const { raining, spreadEnabled } = options;
    const canSpread = spreadEnabled && !raining;
    const spent: Tile[] = [];

    for (const tile of this.burning) {
      tile.fireFuel = (tile.fireFuel ?? 1) - delta * (raining ? 3 : 1);
      if ((tile.fireFuel ?? 0) <= 0) {
        spent.push(tile);
        continue;
      }

      this.callbacks.onDamage?.(tile.x, tile.y, 0.8, 32 * delta);

      if (!canSpread) continue;

      const dx = Math.floor(random() * 3) - 1;
      const dy = Math.floor(random() * 3) - 1;
      const neighbour = this.tileAt(tile.x + dx, tile.y + dy);
      if (!neighbour || neighbour.isOnFire) continue;
      if (!FLAMMABLE_BIOMES.includes(neighbour.type)) continue;

      // Damp ground resists, dry ground catches — which is also what makes
      // rain, rivers and wet biomes matter.
      const dryness = Math.max(0.2, 1.25 - neighbour.moisture);
      // An Age of Sun doubles this; an Age of Tears all but stops it. The
      // multiplier lands here rather than on SPREAD_BASE so the cascade test's
      // branching-factor argument still reads correctly at 1.0.
      const era = simulation.age.fireSpread;
      if (random() < SPREAD_BASE * dryness * era) this.ignite(neighbour);
    }

    for (const tile of spent) {
      this.extinguish(tile, !raining);
    }
  }

  private tileAt(x: number, y: number): Tile | null {
    if (x < 0 || x >= this.tiles.length || y < 0 || y >= this.tiles[0].length) return null;
    return this.tiles[x][y];
  }
}
