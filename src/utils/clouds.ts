// Clouds, and everything that falls out of them.
//
// Phase 18.3. A cloud is a drifting sprite with a *drop type*, and once that
// one idea exists, weather, plague, a blessing-rain and seeding a continent
// with forest all stop being four features and become four rows of a table.
// The cloud does not know what its drop means; the table does, and the sprite
// just carries a tint and a position.
//
// The value is not the hundred lines saved. It is that every one of these
// arrives the same way — you see it coming, you can watch where it is going,
// and it passes. A plague that appears as a status on forty creatures at once
// is a notification; a green cloud crossing a valley is an event.
import * as THREE from 'three';
import { isWaterBiome, type Entity, type Tile } from '../types/world';
import { addHeat } from './thermal';
import { applyStatus } from './statusEffects';

export type DropKind = 'none' | 'rain' | 'snow' | 'plague' | 'blessing' | 'seed'
  | 'thunder' | 'hellfire' | 'acid' | 'magic' | 'rage' | 'life';

export interface DropDef {
  /** Tint for the cloud carrying it, so the sky says what is coming. */
  tint: number;
  /** Chance per simulated second that a tile under the cloud is touched. */
  rate: number;
  /** What it does to the ground. Returns true if the tile needs redrawing. */
  onTile?: (tile: Tile, world?: CloudWorld) => boolean;
  /** What it does to whoever is standing there. */
  onCreature?: (entity: Entity) => void;
  /** Chronicle line when one is summoned, or null for the ambient ones. */
  herald: string | null;
}

/** Degrees a rainy tile loses per touch. Enough to matter to the ladder. */
const RAIN_COOLING = 45;

export const DROPS: Record<DropKind, DropDef> = {
  none: { tint: 0xffffff, rate: 0, herald: null },

  rain: {
    tint: 0xb9c6d8,
    rate: 0.9,
    herald: null,
    onTile: (tile) => {
      tile.moisture = Math.min(1, tile.moisture + 0.02);
      // Rain is the counterweight to the thermal ladder, and the only one the
      // world produces on its own. Without it a fire season is permanent.
      addHeat(tile, -RAIN_COOLING);
      if (tile.isOnFire) {
        tile.isOnFire = false;
        return true;
      }
      return false;
    },
  },

  snow: {
    tint: 0xe8f0f8,
    rate: 0.9,
    herald: null,
    onTile: (tile) => {
      tile.moisture = Math.min(1, tile.moisture + 0.01);
      addHeat(tile, -RAIN_COOLING * 1.6);
      if (tile.isOnFire) {
        tile.isOnFire = false;
        return true;
      }
      return false;
    },
  },

  plague: {
    tint: 0x8fbf6a,
    rate: 0.55,
    herald: 'A sickness gathers in the clouds',
    // Nothing to the ground: a plague that also ruined the land would be
    // indistinguishable from a curse, and the whole point of it is that the
    // fields are still there afterwards and there is nobody to work them.
    onCreature: (entity) => {
      entity.health = Math.max(0, entity.health - 6);
      applyStatus(entity, 'wounded');
    },
  },

  blessing: {
    tint: 0xf4d98b,
    rate: 0.55,
    herald: 'Light gathers overhead',
    onTile: (tile) => {
      tile.fertility = Math.min(1, tile.fertility + 0.03);
      // Ground that has been blessed past the point of ordinary richness
      // shows it. Only open grass: a blessing should not erase a forest to
      // improve it, and a bloom that can appear anywhere means nothing.
      if (tile.type === 'grassland' && tile.fertility > 0.85 && !tile.villageId) {
        tile.type = 'bloom';
        return true;
      }
      return false;
    },
    onCreature: (entity) => {
      entity.health = Math.min(entity.maxHealth, entity.health + 8);
      applyStatus(entity, 'blessed');
    },
  },

  thunder: {
    tint: 0x5a6074,
    rate: 0.06,
    herald: 'The sky goes dark and starts to grumble',
    onTile: (tile, world) => {
      // Lightning: rare, and it lands. Dry ground catches.
      if (!isWaterBiome(tile.type) && tile.moisture < 0.6) world?.ignite?.(tile);
      world?.flash?.(tile);
      return false;
    },
    onCreature: (entity) => {
      entity.health -= 30;
      applyStatus(entity, 'wounded');
    },
  },

  hellfire: {
    tint: 0xd8502a,
    rate: 0.25,
    herald: 'A cloud the colour of a forge rolls in',
    onTile: (tile, world) => {
      if (isWaterBiome(tile.type)) return false;
      addHeat(tile, 160);
      world?.ignite?.(tile);
      return false;
    },
    onCreature: (entity) => {
      if (entity.traits?.includes('fireproof')) return;
      entity.health -= 8;
    },
  },

  acid: {
    tint: 0x9ad83a,
    rate: 0.45,
    herald: 'The rain smells wrong',
    onTile: (tile) => {
      // Burns the life out of the ground and the leaves off the trees.
      tile.fertility = Math.max(0, tile.fertility - 0.08);
      if (tile.structure && (tile.structure.type === 'sapling' || tile.structure.type === 'young_tree')) {
        tile.structure = null;
        return true;
      }
      return false;
    },
    onCreature: (entity) => {
      entity.health -= 5;
      applyStatus(entity, 'wounded');
    },
  },

  magic: {
    tint: 0xb48cff,
    rate: 0.45,
    herald: 'Something shimmers overhead',
    onCreature: (entity) => {
      applyStatus(entity, 'inspired');
      entity.health = Math.min(entity.maxHealth, entity.health + 4);
    },
  },

  rage: {
    tint: 0xa8243a,
    rate: 0.4,
    herald: 'Blood falls from the sky',
    onCreature: (entity) => {
      applyStatus(entity, 'enraged');
    },
  },

  life: {
    tint: 0x9cf0b0,
    rate: 0.6,
    herald: 'A green rain begins, and everything leans toward it',
    onTile: (tile) => {
      tile.fertility = Math.min(1, tile.fertility + 0.05);
      if (tile.isOnFire) { tile.isOnFire = false; return true; }
      if ((tile.type === 'ashland' || tile.type === 'badlands' || tile.type === 'wasteland') && !tile.villageId) {
        tile.type = 'grassland';
        return true;
      }
      return false;
    },
    onCreature: (entity) => {
      entity.health = Math.min(entity.maxHealth, entity.health + 12);
      for (const bad of ['infected', 'wounded', 'cursed'] as const) {
        const i = entity.status.indexOf(bad);
        if (i !== -1) entity.status.splice(i, 1);
      }
    },
  },

  seed: {
    tint: 0x7fae5a,
    rate: 0.35,
    herald: 'Something is being sown from above',
    onTile: (tile) => {
      // Only where a forest would actually have grown. A seeding cloud that
      // can plant a wood on a glacier is a paintbrush, not weather.
      if (isWaterBiome(tile.type) || tile.villageId) return false;
      if (tile.type !== 'grassland' && tile.type !== 'hills') return false;
      if (tile.moisture < 0.4 || tile.fertility < 0.35) return false;
      tile.type = tile.temperature < 0.32 ? 'coniferous_forest' : 'deciduous_forest';
      tile.structure = { type: 'sapling', health: 100, level: 1 };
      tile.resources.push({ type: 'wood', quantity: 3, discovered: true });
      return true;
    },
  },
};

/** What a cloud is, apart from a sprite. */
interface Cloud {
  sprite: THREE.Sprite;
  drop: DropKind;
  /** Simulated seconds left before it goes back to being weather. */
  life: number;
}

/** How far a cloud reaches, in tiles either side of its centre. */
const REACH = 4;

/** What the world has to hand a cloud so its drop can land. */
export interface CloudWorld {
  tiles: Tile[][];
  /** Creatures near a map position, for the drops that touch them. */
  creaturesNear(x: number, y: number, radius: number): Entity[];
  syncTile(tile: Tile): void;
  announce(message: string): void;
  random(): number;
  /** Set a tile alight, through the fire system. */
  ignite?(tile: Tile): void;
  /** A flash where lightning lands. */
  flash?(tile: Tile): void;
}

/**
 * Drifting clouds, and the drops they carry.
 *
 * The sprites are made and owned by the effects manager, which knows how to
 * draw them; this owns what they *mean*. Splitting it that way is what keeps
 * the drop table testable without a renderer.
 */
export class CloudSystem {
  private clouds: Cloud[] = [];
  private area = 64;
  /** Accumulated simulated time, so drops land on seconds not on frames. */
  private carried = 0;

  /** Adopt the sprites the effects manager built. */
  adopt(sprites: THREE.Sprite[], area: number): void {
    this.area = area;
    this.clouds = sprites.map(sprite => ({ sprite, drop: 'none' as DropKind, life: 0 }));
  }

  /** How many clouds are carrying something. Used by tests and the HUD. */
  get laden(): number {
    return this.clouds.filter(cloud => cloud.drop !== 'none').length;
  }

  /**
   * Weather, expressed as a drop.
   *
   * Applied to every cloud rather than to a few, because weather is the one
   * kind that is meant to be everywhere — a rainstorm over a third of the map
   * reads as a bug, where one green cloud reads as a plague.
   */
  setWeather(kind: 'clear' | 'rain' | 'snow'): void {
    const drop: DropKind = kind === 'clear' ? 'none' : kind;
    for (const cloud of this.clouds) {
      // A summoned cloud outranks the weather and keeps its errand.
      if (cloud.life > 0) continue;
      cloud.drop = drop;
      this.paint(cloud);
    }
  }

  /**
   * Send one cloud somewhere with something in it.
   *
   * Returns false when every cloud is already busy, which the caller should
   * report rather than swallow: a power that silently does nothing is worse
   * than one that says it cannot.
   */
  summon(kind: DropKind, x: number, y: number, tiles: number, seconds = 45): boolean {
    const free = this.clouds.find(cloud => cloud.life <= 0);
    if (!free) return false;
    free.drop = kind;
    free.life = seconds;
    // Placed in world space, which is the one thing here that has to agree
    // with the terrain renderer's idea of where a tile is.
    free.sprite.position.x = (x - tiles / 2 + 0.5) * 0.5;
    free.sprite.position.z = (y - tiles / 2 + 0.5) * 0.5;
    this.paint(free);
    return true;
  }

  private paint(cloud: Cloud): void {
    (cloud.sprite.material as THREE.SpriteMaterial).color.setHex(DROPS[cloud.drop].tint);
  }

  /**
   * Drift, drop, and expire.
   *
   * Drops are accumulated to whole simulated seconds rather than rolled every
   * frame: a per-frame roll means the sky is kinder on a slow machine, which
   * is the same class of bug as timing an animation off the wall clock.
   */
  update(delta: number, world: CloudWorld): void {
    const half = this.area / 2;
    for (const cloud of this.clouds) {
      cloud.sprite.position.x += delta * 0.4;
      cloud.sprite.position.z += delta * 0.15;
      if (cloud.sprite.position.x > half) cloud.sprite.position.x = -half;
      if (cloud.sprite.position.z > half) cloud.sprite.position.z = -half;

      if (cloud.life > 0) {
        cloud.life -= delta;
        if (cloud.life <= 0) {
          cloud.drop = 'none';
          this.paint(cloud);
        }
      }
    }

    this.carried += delta;
    if (this.carried < 1) return;
    const seconds = Math.min(this.carried, 3);
    this.carried = 0;
    for (const cloud of this.clouds) {
      if (cloud.drop !== 'none') this.rain(cloud, seconds, world);
    }
  }

  /** Land one cloud's drop on the ground under it. */
  private rain(cloud: Cloud, seconds: number, world: CloudWorld): void {
    const def = DROPS[cloud.drop];
    const size = world.tiles.length;
    const centreX = Math.round(cloud.sprite.position.x / 0.5 + size / 2 - 0.5);
    const centreY = Math.round(cloud.sprite.position.z / 0.5 + size / 2 - 0.5);

    for (let dx = -REACH; dx <= REACH; dx += 1) {
      for (let dy = -REACH; dy <= REACH; dy += 1) {
        if (dx * dx + dy * dy > REACH * REACH) continue;
        if (world.random() >= def.rate * seconds) continue;
        const x = centreX + dx;
        const y = centreY + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const tile = world.tiles[x][y];
        if (def.onTile?.(tile, world)) world.syncTile(tile);
        if (def.onCreature) {
          for (const creature of world.creaturesNear(x, y, 0.8)) def.onCreature(creature);
        }
      }
    }
  }
}
