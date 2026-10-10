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
import { emitShot, type ShotKind } from './shotBridge';
import { emitDamage } from './floatBridge';

/** Towers do not fight each other, or anything that is not alive. */
const TOWER_TYPES = new Set<string>(['flame_tower', 'ice_tower']);

/**
 * A tower's volley: the nearest living thing in range takes a bolt. Hostile
 * towers are indiscriminate on purpose — WorldBox's flame and ice towers are
 * hazards you place, not allies.
 */
const towerShot = (self: Entity, world: AbilityWorld, kind: ShotKind, damage: number): Entity | null => {
  let target: Entity | null = null;
  let best = 25;
  for (const other of world.near(self.position.x, self.position.y, 5)) {
    if (other.health <= 0 || TOWER_TYPES.has(other.type)) continue;
    const d = (other.position.x - self.position.x) ** 2 + (other.position.y - self.position.y) ** 2;
    if (d < best) { best = d; target = other; }
  }
  if (!target) return null;
  emitShot({ position: { x: self.position.x, y: self.position.y - 0.4 } }, target, kind);
  target.health -= damage;
  emitDamage(target.position.x, target.position.y, damage, target.id);
  if (target.health <= 0 && !target.status.includes('slain')) target.status.push('slain');
  return target;
};

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
  flame_tower: {
    every: 1.3,
    use: (self, _tile, world) => {
      const hit = towerShot(self, world, 'fire', 14);
      if (hit && world.random() < 0.3) world.ignite?.(Math.floor(hit.position.x), Math.floor(hit.position.y));
    },
  },
  ice_tower: {
    every: 1.3,
    use: (self, tile, world) => {
      towerShot(self, world, 'magic', 10);
      // And a ring of frost that spreads a little each volley.
      const x = tile.x + Math.round((world.random() - 0.5) * 6);
      const y = tile.y + Math.round((world.random() - 0.5) * 6);
      const ground = world.tiles[x]?.[y];
      if (ground && !isWaterBiome(ground.type) && !FROZEN.has(ground.type) && ground.type !== 'mountains') {
        ground.temperature = Math.min(ground.temperature, 0.1);
        world.setBiome?.(x, y, 'snow');
      }
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
