// What some creatures do to the world just by being in it.
//
// WorldBox's monsters are memorable because each one changes the ground it
// crosses: a Cold One leaves a trail of snow, a fire skull leaves a trail of
// fire, a necromancer leaves the dead standing up behind it
// (06-WORLDBOX-COMPLETE-REFERENCE.md §4, Creatures). Kept apart from the AI —
// none of this is a decision, it is an aura — and run on a per-creature
// clock in simulated seconds so pause and game speed hold.

import type { BiomeType, Entity, EntityType, Tile } from '../types/world';
import { isWaterBiome } from '../types/world';
import { clearStatus } from './statusEffects';

export interface AbilityWorld {
  tiles: Tile[][];
  spawn: (type: EntityType, x: number, y: number) => Entity | null;
  near: (x: number, y: number, radius: number) => Entity[];
  ignite?: (x: number, y: number) => void;
  setBiome?: (x: number, y: number, type: BiomeType) => void;
  demolishAt?: (x: number, y: number) => boolean;
  announce?: (message: string, at: { x: number; y: number }) => void;
  random: () => number;
}

interface Ability {
  /** Seconds between uses. */
  every: number;
  use: (self: Entity, tile: Tile, world: AbilityWorld) => void;
}

/** Ground a cold one will not freeze: already frozen, or not ground at all. */
const FROZEN: ReadonlySet<BiomeType> = new Set(['snow', 'ice', 'glacier', 'tundra'] as BiomeType[]);

export const ABILITIES: Partial<Record<EntityType, Ability>> = {
  necromancer: {
    every: 14,
    use: (self, tile, world) => {
      const risen = world.spawn('skeleton', tile.x + (world.random() < 0.5 ? -1 : 1), tile.y);
      if (risen && world.random() < 0.25) {
        world.announce?.(`${self.name} calls a skeleton up out of the earth`, self.position);
      }
    },
  },
  plague_doctor: {
    every: 3,
    use: (_self, tile, world) => {
      for (const other of world.near(tile.x + 0.5, tile.y + 0.5, 3)) {
        if (other.status.includes('infected')) clearStatus(other, 'infected');
      }
    },
  },
  fire_skull: {
    every: 4,
    use: (_self, tile, world) => {
      if (!isWaterBiome(tile.type)) world.ignite?.(tile.x, tile.y);
    },
  },
  cold_one: {
    every: 1.5,
    use: (_self, tile, world) => {
      if (isWaterBiome(tile.type) || FROZEN.has(tile.type) || tile.type === 'mountains') return;
      tile.temperature = Math.min(tile.temperature, 0.1);
      world.setBiome?.(tile.x, tile.y, 'snow');
    },
  },
  bee: {
    every: 6,
    use: (_self, tile) => {
      // Pollination: the meadow it works grows richer, which is what the
      // farms and the forests downstream feed on.
      if (!isWaterBiome(tile.type)) tile.fertility = Math.min(1, tile.fertility + 0.04);
    },
  },
  crabzilla: {
    every: 1,
    use: (_self, tile, world) => {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) world.demolishAt?.(tile.x + dx, tile.y + dy);
      }
    },
  },
};

const clocks = new WeakMap<Entity, number>();

/**
 * Run a creature's aura, if it has one. Cheap for everything that does not:
 * one table lookup and out.
 */
export const abilityTick = (entity: Entity, delta: number, world: AbilityWorld): boolean => {
  const ability = ABILITIES[entity.type];
  if (!ability) return false;
  const clock = (clocks.get(entity) ?? ability.every * 0.5) - delta;
  if (clock > 0) {
    clocks.set(entity, clock);
    return false;
  }
  clocks.set(entity, ability.every);
  const tile = world.tiles[Math.floor(entity.position.x)]?.[Math.floor(entity.position.y)];
  if (!tile) return false;
  ability.use(entity, tile, world);
  return true;
};
