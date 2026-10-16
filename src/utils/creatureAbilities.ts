// What some creatures do to the world just by being in it.
//
// WorldBox's monsters are memorable because each one changes the ground it
// crosses: a Cold One leaves a trail of snow, a fire skull leaves a trail of
// fire, a necromancer leaves the dead standing up behind it
// (06-WORLDBOX-COMPLETE-REFERENCE.md §4, Creatures). Kept apart from the AI —
// none of this is a decision, it is an aura — and run on a per-creature
// clock in simulated seconds so pause and game speed hold.

import { biomesWhere } from '../content/biomes';
import type { BiomeType, Entity, EntityType, Tile } from '../types/world';
import { isWaterBiome } from '../types/world';
import { clearStatus } from './statusEffects';
import { emitShot, type ShotKind } from './shotBridge';
import { emitDamage, emitFloater } from './floatBridge';
import { applyStatus } from './statusEffects';
import { equip, forgeItem } from './equipment';
import { wieldsGear } from './pixelSprites';

/** Which way each Langton's ant is facing: 0 north, 1 east, 2 south, 3 west. */
const antHeading = new WeakMap<Entity, number>();
const ANT_STEP: Array<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const PEOPLE = new Set<string>(['human', 'elf', 'dwarf', 'orc']);

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
const FROZEN: ReadonlySet<BiomeType> = new Set(biomesWhere(def => def.frostbound));

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
  white_mage: {
    every: 4,
    use: (_self, tile, world) => {
      for (const other of world.near(tile.x + 0.5, tile.y + 0.5, 3)) {
        if (!PEOPLE.has(other.type) || other.health >= other.maxHealth) continue;
        const mend = Math.min(20, other.maxHealth - other.health);
        other.health += mend;
        emitFloater({ kind: 'heal', text: `+${Math.round(mend)}`, x: other.position.x, y: other.position.y, entityId: other.id });
      }
    },
  },
  angel: {
    every: 10,
    use: (_self, tile, world) => {
      for (const other of world.near(tile.x + 0.5, tile.y + 0.5, 2.5)) {
        if (PEOPLE.has(other.type)) applyStatus(other, 'blessed');
      }
    },
  },
  treant: {
    every: 6,
    use: (_self, tile, world) => {
      const x = tile.x + Math.round((world.random() - 0.5) * 4);
      const y = tile.y + Math.round((world.random() - 0.5) * 4);
      const ground = world.tiles[x]?.[y];
      if (!ground || isWaterBiome(ground.type) || ground.villageId || ground.type === 'mountains') return;
      ground.structure = { type: 'mature_tree', health: 100, level: 2 };
      if (!ground.resources.some(r => r.type === 'wood')) ground.resources.push({ type: 'wood', quantity: 6, discovered: true });
      world.setBiome?.(x, y, ground.temperature < 0.32 ? 'coniferous_forest' : 'deciduous_forest');
    },
  },
  candy_man: {
    every: 8,
    use: (_self, tile, world) => {
      if (!isWaterBiome(tile.type) && !tile.villageId && tile.type !== 'candy') world.setBiome?.(tile.x, tile.y, 'candy');
    },
  },
  robot_santa: {
    every: 15,
    use: (self, tile, world) => {
      const lucky = world.near(tile.x + 0.5, tile.y + 0.5, 3)
        .filter(o => o.id !== self.id && wieldsGear(o.type) && (!o.equipment?.weapon || !o.equipment?.armor));
      const pick = lucky[Math.floor(world.random() * lucky.length)];
      if (!pick) return;
      const item = forgeItem(pick.equipment?.weapon ? 'armor' : 'weapon', 3, pick.type, 'the North Pole', world.random);
      equip(pick, item);
      emitFloater({ kind: 'emote', text: '\u{1F381}', x: pick.position.x, y: pick.position.y, entityId: pick.id });
    },
  },
  tumor: {
    every: 3,
    use: (_self, tile, world) => {
      const x = tile.x + Math.round((world.random() - 0.5) * 4);
      const y = tile.y + Math.round((world.random() - 0.5) * 4);
      const ground = world.tiles[x]?.[y];
      if (ground && !isWaterBiome(ground.type) && !ground.villageId && ground.type !== 'corrupted') {
        world.setBiome?.(x, y, 'corrupted');
      }
      // Now and then it buds.
      if (world.random() < 0.025) world.spawn('tumor', tile.x + (world.random() < 0.5 ? -1 : 1), tile.y + (world.random() < 0.5 ? -1 : 1));
    },
  },
  langton_ant: {
    every: 0.4,
    use: (self, tile, world) => {
      // The rule: on light ground turn right, on dark turn left; flip the
      // ground; step forward. From that alone, after a few thousand steps of
      // chaos, comes the famous highway.
      let heading = antHeading.get(self) ?? 0;
      const dark = tile.type === 'desert';
      heading = (heading + (dark ? 3 : 1)) % 4;
      if (!tile.villageId && !isWaterBiome(tile.type)) world.setBiome?.(tile.x, tile.y, dark ? 'grassland' : 'desert');
      let [dx, dy] = ANT_STEP[heading];
      let next = world.tiles[tile.x + dx]?.[tile.y + dy];
      if (!next || isWaterBiome(next.type)) {
        heading = (heading + 2) % 4;
        [dx, dy] = ANT_STEP[heading];
        next = world.tiles[tile.x + dx]?.[tile.y + dy];
      }
      antHeading.set(self, heading);
      if (next && !isWaterBiome(next.type)) {
        self.lastPosition = { ...self.position };
        self.position = { x: next.x + 0.5, y: next.y + 0.5 };
      }
    },
  },
  monolith: {
    every: 8,
    use: (_self, tile, world) => {
      // It teaches. Whoever stands near it comes away inspired, and now and
      // then, cleverer for good.
      for (const other of world.near(tile.x + 0.5, tile.y + 0.5, 6)) {
        if (!PEOPLE.has(other.type)) continue;
        applyStatus(other, 'inspired');
        if (world.random() < 0.05 && !(other.traits ?? []).includes('genius')) {
          (other.traits ??= []).push('genius');
          other.attributes.intelligence = Math.round(other.attributes.intelligence * 1.8);
        }
      }
    },
  },
  grey_goo: {
    every: 2,
    use: (self, tile, world) => {
      // Eats the world: the ground under it goes to waste, whatever stands
      // there is dissolved, and it copies itself into the next tile.
      if (!isWaterBiome(tile.type) && tile.type !== 'wasteland') world.setBiome?.(tile.x, tile.y, 'wasteland');
      tile.structure = null;
      for (const other of world.near(tile.x + 0.5, tile.y + 0.5, 1.2)) {
        if (other.id === self.id || other.type === 'grey_goo') continue;
        other.health -= 15;
        if (other.health <= 0 && !other.status.includes('slain')) other.status.push('slain');
      }
      if (world.random() < 0.35) {
        const dir = ANT_STEP[Math.floor(world.random() * 4)];
        const next = world.tiles[tile.x + dir[0]]?.[tile.y + dir[1]];
        if (next && !isWaterBiome(next.type)) world.spawn('grey_goo', next.x + 0.5, next.y + 0.5);
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
