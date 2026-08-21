// src/utils/entitySystemMinimal.ts
//
// Creature creation, rendering and the needs-driven AI state machine.
// Every creature is autonomous: it drinks, forages, hunts, flees, fights,
// sleeps, breeds and dies without any central script.
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import {
  isDrinkableBiome,
  isWaterBiome,
  type Entity,
  type EntityType,
  type Tile,
  type TraitId,
} from '../types/world';
import { getPixelSpriteTexture, getPixelSpriteFrames } from './pixelSprites';
import {
  canSwim,
  findNearestStandable,
  findPath,
  isAirborne,
  isShoreTile,
  isWalkableForEntity,
} from './pathfinding';
import { applyTraits, rollTraitsForType } from './traits';
import { simulation } from './simulation';
import type { EntityIndex } from './entityManagerMinimal';

/**
 * AI States for entities
 */
export type AIState =
  | 'idle'
  | 'moving'
  | 'following'
  | 'gathering'
  | 'hunting'
  | 'fleeing'
  | 'building'
  | 'fighting'
  | 'sleeping'
  | 'dying';

/** An instruction from the settlement system (deliver goods, build, raid). */
export interface AIOrder {
  kind: 'goto';
  x: number;
  y: number;
  purpose: 'deliver' | 'build' | 'raid' | 'return' | 'herd';
}

// Predator-Prey relationships
export const FOOD_CHAIN: Record<EntityType, EntityType[]> = {
  human: ['rabbit', 'deer', 'fish', 'sheep', 'chicken'],
  elf: ['fish', 'deer'],
  dwarf: ['fish'],
  orc: ['human', 'elf', 'rabbit', 'deer', 'fish', 'sheep'],
  wolf: ['rabbit', 'deer', 'sheep', 'chicken'],
  bear: ['fish', 'rabbit', 'deer', 'human', 'sheep'],
  deer: [],
  rabbit: [],
  bird: [],
  fish: [],
  sheep: [],
  chicken: [],
  fox: ['rabbit', 'chicken'],
  snake: ['rabbit', 'chicken'],
  dragon: ['human', 'elf', 'dwarf', 'orc', 'wolf', 'bear', 'deer', 'rabbit', 'sheep'],
  demon: ['human', 'elf', 'dwarf', 'orc'],
  zombie: ['human', 'elf', 'dwarf', 'orc'],
  skeleton: ['human', 'elf', 'dwarf'],
  elemental: [],
  bandit: ['human', 'elf'],
};

/** Reverse of FOOD_CHAIN, built once at module load. */
const PREDATORS_OF: Partial<Record<EntityType, EntityType[]>> = {};
for (const [predator, preyList] of Object.entries(FOOD_CHAIN) as [EntityType, EntityType[]][]) {
  for (const prey of preyList) {
    (PREDATORS_OF[prey] ??= []).push(predator);
  }
}

const SENTIENT: EntityType[] = ['human', 'elf', 'dwarf', 'orc'];
export const isSentient = (type: EntityType): boolean => SENTIENT.includes(type);

/**
 * Generate a name for an entity based on type
 */
function generateEntityName(type: EntityType): string {
  const names: Record<EntityType, string[]> = {
    human: ['Alex', 'Jamie', 'Morgan', 'Taylor', 'Jordan', 'Casey', 'Robin', 'Quinn', 'Riley', 'Avery'],
    elf: ['Elrond', 'Galadriel', 'Legolas', 'Arwen', 'Tauriel', 'Thranduil', 'Celeborn', 'Earwen', 'Finrod', 'Luthien'],
    dwarf: ['Thorin', 'Gimli', 'Balin', 'Dwalin', 'Fili', 'Kili', 'Gloin', 'Oin', 'Bifur', 'Bofur'],
    orc: ['Gromm', 'Zugdug', 'Krag', 'Rukh', 'Muzgash', 'Grishnak', 'Bolg', 'Azog', 'Ugluk', 'Lurtz'],
    wolf: ['Alpha', 'Shadow', 'Fang', 'Luna', 'Ghost', 'Storm', 'Timber', 'Blizzard', 'Savage', 'Howler'],
    bear: ['Grizzly', 'Kodiak', 'Bruno', 'Honey', 'Ursa', 'Teddy', 'Claw', 'Moose', 'Thunder', 'Shaggy'],
    deer: ['Bambi', 'Buck', 'Stag', 'Doe', 'Dasher', 'Prancer', 'Forest', 'Speckle', 'Maple', 'Swift'],
    rabbit: ['Hopper', 'Thumper', 'Cottontail', 'Flopsy', 'Mopsy', 'Peter', 'Benny', 'Roger', 'Jasper', 'Hazel'],
    bird: ['Robin', 'Sparrow', 'Jay', 'Swift', 'Hawk', 'Raven', 'Wren', 'Finch', 'Eagle', 'Falcon'],
    sheep: ['Woolly', 'Clover', 'Dolly', 'Nimbus', 'Fluff', 'Cotton', 'Baabara', 'Pip', 'Meadow', 'Snowdrop'],
    chicken: ['Pecky', 'Henrietta', 'Clucks', 'Nugget', 'Rooster', 'Feathers', 'Yolko', 'Scratch', 'Biddy', 'Coop'],
    fox: ['Rusty', 'Vixen', 'Ember', 'Copper', 'Sly', 'Kit', 'Amber', 'Bramble', 'Cinder', 'Dusk'],
    snake: ['Hiss', 'Coil', 'Venom', 'Slither', 'Fang', 'Scale', 'Basil', 'Nagi', 'Serpens', 'Rattle'],
    fish: ['Fins', 'Bubbles', 'Scales', 'Nemo', 'Marlin', 'Dory', 'Wave', 'Splash', 'Shimmer', 'Gill'],
    dragon: ['Smaug', 'Drogon', 'Glaurung', 'Rhaegal', 'Viserion', 'Balerion', 'Meraxes', 'Vermithrax', 'Alduin', 'Fafnir'],
    demon: ['Abaddon', 'Baal', 'Lilith', 'Mephistopheles', 'Asmodeus', 'Beelzebub', 'Moloch', 'Belial', 'Mammon', 'Legion'],
    zombie: ['Shuffler', 'Rotter', 'Lurcher', 'Biter', 'Walker', 'Shambler', 'Moaner', 'Creeper', 'Stinker', 'Lurch'],
    skeleton: ['Rattlebones', 'Marrow', 'Skully', 'Ribs', 'Clatters', 'Bones', 'Creaks', 'Dusty', 'Hollow', 'Grim'],
    elemental: ['Ember', 'Gust', 'Pebble', 'Splash', 'Bolt', 'Quake', 'Frost', 'Blaze', 'Torrent', 'Spark'],
    bandit: ['Cutthroat', 'Knuckles', 'Blade', 'Shadow', 'Scar', 'Knives', 'Dagger', 'Rogue', 'Crook', 'Mugger'],
  };

  const nameList = names[type] ?? ['Unknown'];
  return nameList[Math.floor(Math.random() * nameList.length)];
}

interface TypeProfile {
  maxAge: number;
  maxHealth: number;
  strength: number;
  intelligence: number;
  speed: number;
  resilience: number;
}

const PROFILES: Partial<Record<EntityType, TypeProfile>> = {
  human: { maxAge: 80, maxHealth: 100, strength: 10, intelligence: 15, speed: 10, resilience: 10 },
  elf: { maxAge: 500, maxHealth: 90, strength: 8, intelligence: 18, speed: 12, resilience: 8 },
  dwarf: { maxAge: 250, maxHealth: 120, strength: 15, intelligence: 12, speed: 8, resilience: 15 },
  orc: { maxAge: 60, maxHealth: 115, strength: 18, intelligence: 8, speed: 10, resilience: 12 },
  wolf: { maxAge: 15, maxHealth: 80, strength: 12, intelligence: 8, speed: 15, resilience: 10 },
  bear: { maxAge: 25, maxHealth: 150, strength: 18, intelligence: 7, speed: 8, resilience: 15 },
  deer: { maxAge: 12, maxHealth: 70, strength: 5, intelligence: 6, speed: 16, resilience: 8 },
  rabbit: { maxAge: 5, maxHealth: 30, strength: 2, intelligence: 5, speed: 18, resilience: 4 },
  bird: { maxAge: 6, maxHealth: 25, strength: 2, intelligence: 6, speed: 20, resilience: 4 },
  fish: { maxAge: 6, maxHealth: 25, strength: 2, intelligence: 3, speed: 12, resilience: 4 },
  sheep: { maxAge: 12, maxHealth: 60, strength: 4, intelligence: 4, speed: 8, resilience: 8 },
  chicken: { maxAge: 6, maxHealth: 20, strength: 1, intelligence: 3, speed: 9, resilience: 3 },
  fox: { maxAge: 10, maxHealth: 50, strength: 8, intelligence: 10, speed: 16, resilience: 7 },
  snake: { maxAge: 12, maxHealth: 35, strength: 10, intelligence: 4, speed: 7, resilience: 6 },
  dragon: { maxAge: 900, maxHealth: 600, strength: 45, intelligence: 20, speed: 14, resilience: 35 },
  demon: { maxAge: 400, maxHealth: 260, strength: 30, intelligence: 16, speed: 12, resilience: 22 },
  zombie: { maxAge: 9999, maxHealth: 70, strength: 12, intelligence: 2, speed: 5, resilience: 12 },
  skeleton: { maxAge: 9999, maxHealth: 60, strength: 11, intelligence: 3, speed: 8, resilience: 10 },
  elemental: { maxAge: 600, maxHealth: 180, strength: 20, intelligence: 12, speed: 11, resilience: 25 },
  bandit: { maxAge: 60, maxHealth: 105, strength: 14, intelligence: 11, speed: 12, resilience: 10 },
};

const DEFAULT_PROFILE: TypeProfile = {
  maxAge: 100, maxHealth: 100, strength: 10, intelligence: 10, speed: 10, resilience: 10,
};

/**
 * Create a new entity of the specified type
 */
export function createEntity(
  type: EntityType,
  x: number,
  y: number,
  traits?: TraitId[],
): Entity {
  const profile = PROFILES[type] ?? DEFAULT_PROFILE;

  const entity: Entity = {
    id: uuidv4(),
    type,
    name: generateEntityName(type),
    age: 0,
    maxAge: profile.maxAge,
    health: profile.maxHealth,
    maxHealth: profile.maxHealth,
    position: { x, y },
    attributes: {
      strength: profile.strength,
      intelligence: profile.intelligence,
      speed: profile.speed,
      resilience: profile.resilience,
    },
    needs: { hunger: 1.0, thirst: 1.0, rest: 1.0, social: 1.0 },
    inventory: [],
    status: [],
    traits: traits ?? rollTraitsForType(type),
    kills: 0,
    kingdomId: null,
    villageId: null,
    carrying: null,
    job: null,
  };

  // Start part-grown so a fresh world is not entirely newborns
  entity.age = profile.maxAge * (0.2 + Math.random() * 0.25);
  applyTraits(entity);
  return entity;
}

/**
 * Create a 3D mesh for an entity based on its type
 */
export function createEntityMesh(entity: Entity): THREE.Object3D {
  const size = getEntitySize(entity.type);
  const container = new THREE.Object3D();
  container.name = `entity-${entity.id}`;

  const texture = getPixelSpriteTexture(entity.type);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.1,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size * 3, size * 3, 1);
  sprite.position.y = size * 1.5;
  container.add(sprite);

  const healthBar = createHealthBar(entity);
  healthBar.position.y = size * 3.4;
  container.add(healthBar);

  return container;
}

/**
 * Get a size based on entity type
 */
function getEntitySize(type: EntityType): number {
  const sizeMap: Partial<Record<EntityType, number>> = {
    human: 0.15, elf: 0.17, dwarf: 0.12, orc: 0.18,
    wolf: 0.12, bear: 0.2, deer: 0.15, rabbit: 0.08,
    bird: 0.07, fish: 0.09, sheep: 0.12, chicken: 0.08,
    fox: 0.11, snake: 0.11,
    dragon: 0.35, demon: 0.25, zombie: 0.16, skeleton: 0.16,
    elemental: 0.2, bandit: 0.15,
  };
  return sizeMap[type] ?? 0.15;
}

/**
 * Create a billboarded health bar indicator for an entity
 */
function createHealthBar(entity: Entity): THREE.Object3D {
  const container = new THREE.Object3D();
  container.name = 'healthBar';

  const bgMaterial = new THREE.SpriteMaterial({ color: 0x222222, depthTest: false });
  const background = new THREE.Sprite(bgMaterial);
  background.scale.set(0.34, 0.05, 1);
  container.add(background);

  const healthPercent = entity.health / entity.maxHealth;
  const fillMaterial = new THREE.SpriteMaterial({ color: 0x00dd44, depthTest: false });
  const fill = new THREE.Sprite(fillMaterial);
  fill.scale.set(0.3 * healthPercent, 0.035, 1);
  fill.position.z = 0.001;
  container.add(fill);

  container.visible = healthPercent < 0.99;
  return container;
}

/** Human-readable animation name, surfaced in the inspector. */
export function getAnimationForEntityStatus(entity: Entity): string {
  const status = entity.status;
  if (status.includes('dead')) return 'death';
  if (status.includes('attacking')) return 'attack';
  if (status.includes('fleeing')) return 'run';
  if (status.includes('sleeping')) return 'sleep';
  if (status.includes('eating') || status.includes('drinking')) return 'eat';
  if (status.includes('moving')) return 'walk';
  return 'idle';
}

/**
 * Update the entity's mesh based on its current state.
 * `detailLevel` (0-1) comes from the camera distance: chrome and animation are
 * dropped when the map is zoomed far out.
 */
export function updateEntityMesh(entity: Entity, deltaTime = 1 / 60, detailLevel = 1): void {
  if (!entity.mesh) return;

  const healthBar = entity.mesh.children.find(child => child.name === 'healthBar');
  if (healthBar) {
    const healthPercent = Math.max(0, entity.health / entity.maxHealth);
    healthBar.visible = detailLevel > 0.45 && healthPercent < 0.99;
    if (healthBar.visible) {
      const fill = healthBar.children[1] as THREE.Sprite | undefined;
      if (fill) {
        fill.scale.x = Math.max(0.001, 0.3 * healthPercent);
        const material = fill.material as THREE.SpriteMaterial;
        if (healthPercent > 0.7) material.color.setHex(0x00dd44);
        else if (healthPercent > 0.3) material.color.setHex(0xffcc00);
        else material.color.setHex(0xff3322);
      }
    }
  }

  const sprite = entity.mesh.children.find(child => child instanceof THREE.Sprite) as THREE.Sprite | undefined;
  if (!sprite) return;

  // Face the direction of travel
  if (entity.lastPosition) {
    const dx = entity.position.x - entity.lastPosition.x;
    if (Math.abs(dx) > 1e-4) {
      sprite.scale.x = Math.abs(sprite.scale.x) * (dx > 0 ? 1 : -1);
    }
  }

  const baseY = getEntitySize(entity.type) * 1.5;
  const isMoving = entity.status.includes('moving');

  if (isMoving && detailLevel > 0.25) {
    sprite.position.y = baseY + Math.abs(Math.sin(Date.now() / 40)) * 0.05;
    const frames = getPixelSpriteFrames(entity.type);
    const frameIndex = Math.floor(Date.now() / 180) % 2;
    const material = sprite.material as THREE.SpriteMaterial;
    if (material.map !== frames[frameIndex]) {
      material.map = frames[frameIndex];
      material.needsUpdate = true;
    }
  } else {
    sprite.position.y = baseY;
    const frames = getPixelSpriteFrames(entity.type);
    const material = sprite.material as THREE.SpriteMaterial;
    if (material.map !== frames[0]) {
      material.map = frames[0];
      material.needsUpdate = true;
    }
  }

  applyStatusVisuals(entity, sprite, deltaTime);
}

/**
 * Tint and fade the sprite according to the entity's status effects.
 */
function applyStatusVisuals(entity: Entity, sprite: THREE.Sprite, _deltaTime: number): void {
  const material = sprite.material as THREE.SpriteMaterial;
  entity.currentAnimation = getAnimationForEntityStatus(entity);

  material.opacity = 1;
  material.color.setHex(0xffffff);

  if (entity.status.includes('sleeping')) {
    material.opacity = 0.75;
  }

  if (entity.status.includes('fleeing')) {
    sprite.position.x = (Math.random() - 0.5) * 0.04;
  } else {
    sprite.position.x = 0;
  }

  if (entity.status.includes('attacking')) {
    material.color.setHex(0xffd0c0);
  } else if (entity.status.includes('wounded')) {
    material.color.setHex(0xffb0b0);
  } else if (entity.status.includes('blessed')) {
    material.color.setHex(0xfff3c0);
  }
}

/**
 * EntityAI - Controls the behavior of an entity
 */
export class EntityAI {
  entity: Entity;
  currentState: AIState = 'idle';
  targetTile: Tile | null = null;
  targetEntity: Entity | null = null;
  path: Tile[] = [];
  order: AIOrder | null = null;
  /** Creature this one trails (its herd alpha), and how far behind it stays. */
  anchor: Entity | null = null;
  anchorSlack = 3.5;
  ticksSinceLastAction = 0;
  private index: EntityIndex | null;
  private repathCooldown = 0;
  private attackCooldown = 0;
  private pyroCooldown = 6;
  /** Seconds spent trying to move without actually getting anywhere. */
  private stuckTimer = 0;
  private lastStuckPosition = { x: 0, y: 0 };
  /** Throttles the "am I walled in?" check, which is the expensive one. */
  private confinementCooldown = 2;

  constructor(entity: Entity, index?: EntityIndex) {
    this.entity = entity;
    this.index = index ?? null;
  }

  /** Give the unit somewhere to be (used by the settlement system). */
  setOrder(order: AIOrder | null): void {
    this.order = order;
    if (order) {
      this.targetEntity = null;
      this.targetTile = null;
      this.path = [];
      this.currentState = 'idle';
      this.ticksSinceLastAction = 99;
    }
  }

  /**
   * Update the entity's AI
   */
  update(tiles: Tile[][], deltaTime: number): void {
    this.ticksSinceLastAction += deltaTime;
    this.repathCooldown = Math.max(0, this.repathCooldown - deltaTime);
    this.attackCooldown = Math.max(0, this.attackCooldown - deltaTime);

    if (this.entity.health <= 0) {
      this.currentState = 'dying';
      this.handleDyingState();
      return;
    }

    this.updateNeeds(deltaTime);
    this.ensureStandable(tiles);
    this.trackStuck(tiles, deltaTime);
    this.maybeStartFire(tiles, deltaTime);

    switch (this.currentState) {
      case 'idle': this.handleIdleState(tiles); break;
      case 'moving': this.handleMovingState(tiles, deltaTime); break;
      case 'following': this.handleFollowingState(tiles, deltaTime); break;
      case 'gathering': this.handleGatheringState(); break;
      case 'hunting': this.handleHuntingState(tiles, deltaTime); break;
      case 'fleeing': this.handleFleeingState(tiles, deltaTime); break;
      case 'fighting': this.handleFightingState(deltaTime); break;
      case 'building': this.handleBuildingState(); break;
      case 'sleeping': this.handleSleepingState(deltaTime); break;
      case 'dying': this.handleDyingState(); break;
    }
  }

  // -- staying unstuck ---------------------------------------------------
  //
  // An emergent world strands its inhabitants: terrain gets lowered under
  // their feet, a meteor leaves them in a crater, a river cuts them off on a
  // one-tile island. WorldBox keeps explicit escape hatches for exactly this
  // (move_from_block, check_if_stuck_on_small_land, teleport_back_home) and so
  // do we. Detection and recovery beat trying to make it impossible.

  /** If the ground under this creature stopped being viable, move it off. */
  private ensureStandable(tiles: Tile[][]): void {
    if (isAirborne(this.entity.type)) return;
    const tile = this.tileAt(tiles, Math.floor(this.entity.position.x), Math.floor(this.entity.position.y));
    if (tile && isWalkableForEntity(tile, this.entity.type)) return;

    // Swimmers get a moment to make their own way out of the water
    if (tile && canSwim(this.entity.type) && isWaterBiome(tile.type) && this.stuckTimer < 4) {
      this.addStatus('swimming');
      return;
    }
    this.removeStatus('swimming');
    this.teleportToSafety(tiles);
  }

  /** Notice a creature that means to move but is not moving. */
  private trackStuck(tiles: Tile[][], deltaTime: number): void {
    const trying = this.currentState === 'moving'
      || this.currentState === 'following'
      || this.currentState === 'hunting'
      || this.currentState === 'fleeing'
      || this.currentState === 'fighting';

    if (!trying) {
      this.stuckTimer = 0;
      this.lastStuckPosition = { ...this.entity.position };
      this.checkConfinement(tiles, deltaTime);
      return;
    }

    const moved = Math.hypot(
      this.entity.position.x - this.lastStuckPosition.x,
      this.entity.position.y - this.lastStuckPosition.y,
    );
    if (moved > 0.35) {
      this.stuckTimer = 0;
      this.lastStuckPosition = { ...this.entity.position };
      return;
    }

    this.stuckTimer += deltaTime;

    // First try: forget the errand and step somewhere it can actually stand.
    if (this.stuckTimer > 4 && this.stuckTimer - deltaTime <= 4) {
      this.nudgeOut(tiles);
      return;
    }
    // Last resort: put it back on solid ground, near home if it has one.
    if (this.stuckTimer > 14) {
      this.teleportToSafety(tiles);
    }
  }

  /**
   * A creature can be standing on perfectly good ground and still be trapped —
   * a one-tile island, a crater ringed with water, a pocket walled in by
   * mountains. It never enters a moving state, so the movement watchdog above
   * never fires. Measure the area it can actually reach instead.
   */
  private checkConfinement(tiles: Tile[][], deltaTime: number): void {
    if (isAirborne(this.entity.type)) return;
    this.confinementCooldown -= deltaTime;
    if (this.confinementCooldown > 0) return;
    this.confinementCooldown = 3;

    if (this.reachableArea(tiles, 4) > 4) return;
    // Nowhere to go: lift it out rather than let it starve where it stands.
    this.teleportToSafety(tiles);
  }

  /** Flood fill from the current tile, giving up once `limit` is exceeded. */
  private reachableArea(tiles: Tile[][], limit: number): number {
    const start = this.tileAt(tiles, Math.floor(this.entity.position.x), Math.floor(this.entity.position.y));
    if (!start) return 0;

    const seen = new Set<Tile>([start]);
    const queue: Tile[] = [start];
    while (queue.length > 0 && seen.size <= limit) {
      const tile = queue.shift()!;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const neighbour = this.tileAt(tiles, tile.x + dx, tile.y + dy);
          if (!neighbour || seen.has(neighbour)) continue;
          if (!isWalkableForEntity(neighbour, this.entity.type)) continue;
          seen.add(neighbour);
          queue.push(neighbour);
          if (seen.size > limit) return seen.size;
        }
      }
    }
    return seen.size;
  }

  /** Abandon whatever it was doing and walk to the nearest viable tile. */
  private nudgeOut(tiles: Tile[][]): void {
    this.targetEntity = null;
    this.order = null;
    this.path = [];
    const escape = findNearestStandable(
      tiles,
      Math.floor(this.entity.position.x),
      Math.floor(this.entity.position.y),
      this.entity.type,
      6,
    );
    if (escape) {
      this.targetTile = escape;
      this.currentState = 'moving';
    } else {
      this.targetTile = null;
      this.currentState = 'idle';
    }
    this.ticksSinceLastAction = 0;
  }

  /** Place the creature back on solid ground; prefer its home village. */
  private teleportToSafety(tiles: Tile[][]): void {
    const home = simulation.homePositionFor?.(this.entity) ?? null;
    const anchor = home ?? {
      x: Math.floor(this.entity.position.x),
      y: Math.floor(this.entity.position.y),
    };

    const refuge = findNearestStandable(tiles, anchor.x, anchor.y, this.entity.type, 16)
      ?? findNearestStandable(
        tiles,
        Math.floor(this.entity.position.x),
        Math.floor(this.entity.position.y),
        this.entity.type,
        24,
      );

    this.stuckTimer = 0;
    this.confinementCooldown = 6;
    this.path = [];
    this.targetTile = null;
    this.targetEntity = null;
    this.order = null;
    this.removeStatus('swimming');
    this.currentState = 'idle';
    this.ticksSinceLastAction = 0;

    if (!refuge) return;
    this.entity.position = { x: refuge.x + 0.5, y: refuge.y + 0.5 };
    this.lastStuckPosition = { ...this.entity.position };
    this.entity.lastPosition = undefined;
  }

  // -- needs -------------------------------------------------------------

  private updateNeeds(deltaTime: number): void {
    if (!simulation.laws.hunger) {
      this.entity.needs.hunger = Math.max(this.entity.needs.hunger, 0.6);
      this.entity.needs.thirst = Math.max(this.entity.needs.thirst, 0.6);
      return;
    }

    const rate = 0.0075 * deltaTime * simulation.needsMultiplier;
    const needs = this.entity.needs;
    needs.hunger = Math.max(0, needs.hunger - rate);
    needs.thirst = Math.max(0, needs.thirst - rate * 1.5);
    needs.rest = Math.max(0, needs.rest - rate * 0.7);
    needs.social = Math.max(0, needs.social - rate * 0.3);

    if (needs.hunger <= 0.15 || needs.thirst <= 0.15) {
      this.entity.health -= 0.8 * deltaTime;
    }

    if (needs.rest <= 0.2) this.addStatus('exhausted');
    else this.removeStatus('exhausted');
  }

  /** Pyromaniacs leave a trail of small fires behind them. */
  private maybeStartFire(tiles: Tile[][], deltaTime: number): void {
    if (!this.entity.traits?.includes('pyromaniac')) return;
    this.pyroCooldown -= deltaTime;
    if (this.pyroCooldown > 0) return;
    this.pyroCooldown = 12 + Math.random() * 20;
    const x = Math.floor(this.entity.position.x);
    const y = Math.floor(this.entity.position.y);
    if (x < 0 || x >= tiles.length || y < 0 || y >= tiles[0].length) return;
    simulation.igniteTile?.(x, y);
  }

  // -- states ------------------------------------------------------------

  private handleIdleState(tiles: Tile[][]): void {
    if (this.ticksSinceLastAction < 1.2) return;
    this.removeStatus('moving');

    // Village orders outrank personal errands unless the unit is desperate.
    const desperate = this.entity.needs.thirst <= 0.2 || this.entity.needs.hunger <= 0.2;
    if (this.order && !desperate) {
      const target = this.tileAt(tiles, this.order.x, this.order.y);
      if (target) {
        this.targetTile = target;
        this.path = [];
        this.currentState = 'moving';
        this.ticksSinceLastAction = 0;
        return;
      }
      this.order = null;
    }

    // A straggler this far behind rejoins before doing anything else, or the
    // herd smears across the map and stops reading as a group.
    if (this.anchor && this.anchor.health > 0 && this.anchor.id !== this.entity.id && !desperate) {
      const gap = Math.hypot(
        this.anchor.position.x - this.entity.position.x,
        this.anchor.position.y - this.entity.position.y,
      );
      if (gap > this.anchorSlack * 3) {
        this.currentState = 'following';
        this.ticksSinceLastAction = 0;
        return;
      }
    }

    // Thirst. Land animals drink from the bank; only swimmers wade in, which
    // is what stops the whole population ending up in the water.
    if (this.entity.needs.thirst <= 0.35) {
      const water = this.findNearbyTile(tiles, 14, (tile) => (
        isDrinkableBiome(tile.type)
          ? canSwim(this.entity.type) || isAirborne(this.entity.type)
          : isShoreTile(tile, tiles)
      ));
      if (water) {
        this.targetTile = water;
        this.path = [];
        this.currentState = 'moving';
        this.ticksSinceLastAction = 0;
        return;
      }
    }

    // Hunger: hunt if a predator, otherwise forage
    const bloodthirsty = this.entity.traits?.includes('bloodthirsty') ?? false;
    if (this.entity.needs.hunger <= (bloodthirsty ? 0.75 : 0.4)) {
      if (this.isPredator()) {
        const prey = this.findNearbyPrey();
        if (prey) {
          this.targetEntity = prey;
          this.currentState = 'hunting';
          this.ticksSinceLastAction = 0;
          return;
        }
      }
      const foodTile = this.findNearbyTile(tiles, 10, (tile) =>
        tile.resources.some(r => r.type === 'food' && r.quantity > 0));
      if (foodTile) {
        this.targetTile = foodTile;
        this.path = [];
        this.currentState = 'moving';
        this.ticksSinceLastAction = 0;
        return;
      }
    }

    // Village workers fetch building material once they are fed
    if (
      this.entity.job === 'gatherer'
      && this.entity.villageId
      && !this.entity.carrying
      && this.entity.needs.hunger > 0.5
    ) {
      const supplyTile = this.findNearbyTile(tiles, 9, (tile) =>
        tile.resources.some(r => (r.type === 'wood' || r.type === 'stone') && r.quantity > 0));
      if (supplyTile) {
        this.targetTile = supplyTile;
        this.path = [];
        this.currentState = 'moving';
        this.ticksSinceLastAction = 0;
        return;
      }
    }

    // Rest — creatures prefer to sleep at night
    const nightTime = simulation.timeOfDay === 'night';
    if (this.entity.needs.rest <= (nightTime ? 0.6 : 0.2)) {
      this.currentState = 'sleeping';
      this.addStatus('sleeping');
      this.ticksSinceLastAction = 0;
      return;
    }

    // Danger
    if (this.isPrey()) {
      const fleeRadius = this.entity.traits?.includes('coward') ? 9 : 6;
      const threat = this.findNearbyThreat(fleeRadius);
      if (threat) {
        this.targetEntity = threat;
        this.currentState = 'fleeing';
        this.ticksSinceLastAction = 0;
        return;
      }
    }

    // Keep up with the herd. This sits below survival needs and above idle
    // wandering, so an animal will still break off to drink but will otherwise
    // travel with its family instead of milling about on the spot.
    if (this.anchor && this.anchor.health > 0 && this.anchor.id !== this.entity.id) {
      const gap = Math.hypot(
        this.anchor.position.x - this.entity.position.x,
        this.anchor.position.y - this.entity.position.y,
      );
      if (gap > this.anchorSlack) {
        this.currentState = 'following';
        this.ticksSinceLastAction = 0;
        return;
      }
    }

    // Wander
    if (Math.random() < 0.35) {
      const currentX = Math.floor(this.entity.position.x);
      const currentY = Math.floor(this.entity.position.y);
      const range = 4;
      const targetX = Math.max(0, Math.min(tiles.length - 1, currentX + Math.floor(Math.random() * (range * 2 + 1)) - range));
      const targetY = Math.max(0, Math.min(tiles[0].length - 1, currentY + Math.floor(Math.random() * (range * 2 + 1)) - range));
      const candidate = tiles[targetX][targetY];
      if (candidate.walkable !== false && isWalkableForEntity(candidate, this.entity.type)) {
        this.targetTile = candidate;
        this.path = [];
        this.currentState = 'moving';
      }
      this.ticksSinceLastAction = 0;
    }
  }

  private tilesPerSecond(): number {
    let speed = this.entity.attributes.speed * 0.12;
    if (this.entity.status.includes('exhausted')) speed *= 0.5;
    return speed;
  }

  private handleMovingState(tiles: Tile[][], deltaTime: number): void {
    if (!this.targetTile) {
      this.currentState = 'idle';
      return;
    }
    this.addStatus('moving');

    if (this.path.length === 0) {
      const startX = Math.max(0, Math.min(tiles.length - 1, Math.floor(this.entity.position.x)));
      const startY = Math.max(0, Math.min(tiles[0].length - 1, Math.floor(this.entity.position.y)));
      const startTile = tiles[startX][startY];

      if (startTile === this.targetTile) {
        this.arriveAtTarget(startTile, tiles);
        return;
      }

      if (this.repathCooldown === 0) {
        this.repathCooldown = 0.5;
        this.path = findPath(startTile, this.targetTile, tiles, this.entity.type);
      }

      if (this.path.length === 0) {
        // No route exists. Walking the straight line anyway is what used to
        // march creatures into the sea and strand them, so give up on the
        // errand instead and let the idle state pick something reachable.
        const adjacent = Math.abs(startTile.x - this.targetTile.x) <= 1
          && Math.abs(startTile.y - this.targetTile.y) <= 1;
        if (adjacent && isWalkableForEntity(this.targetTile, this.entity.type)) {
          this.path = [this.targetTile];
        } else {
          this.targetTile = null;
          this.currentState = 'idle';
          this.ticksSinceLastAction = 0;
          this.removeStatus('moving');
          return;
        }
      }
    }

    const waypoint = this.path[0];

    // The world changes underneath a path: a tile can be flooded or raised
    // after the route was planned. Re-plan rather than walking into it.
    if (!isWalkableForEntity(waypoint, this.entity.type)) {
      this.path = [];
      this.repathCooldown = 0;
      return;
    }

    const { x, y } = this.entity.position;
    const dx = waypoint.x + 0.5 - x;
    const dy = waypoint.y + 0.5 - y;
    const length = Math.hypot(dx, dy);

    this.entity.lastPosition = { x, y };

    if (length < 0.12) {
      this.path.shift();
      if (this.path.length > 0) return;
      this.arriveAtTarget(waypoint, tiles);
      return;
    }

    const step = Math.min(this.tilesPerSecond() * deltaTime, length);
    this.entity.position = {
      x: x + (dx / length) * step,
      y: y + (dy / length) * step,
    };
  }

  /**
   * Trail the herd alpha. Deliberately direct steps rather than A*: the target
   * moves every frame, so a route would be stale before it was walked, and a
   * herd of nine re-planning constantly is pure cost for no benefit.
   */
  private handleFollowingState(tiles: Tile[][], deltaTime: number): void {
    const anchor = this.anchor;
    if (!anchor || anchor.health <= 0) {
      this.anchor = null;
      this.currentState = 'idle';
      return;
    }

    const dx = anchor.position.x - this.entity.position.x;
    const dy = anchor.position.y - this.entity.position.y;
    const gap = Math.hypot(dx, dy);

    if (gap <= this.anchorSlack * 0.7) {
      this.removeStatus('moving');
      this.currentState = 'idle';
      this.ticksSinceLastAction = 0;
      return;
    }

    this.addStatus('moving');
    this.entity.lastPosition = { ...this.entity.position };
    const step = this.tilesPerSecond() * deltaTime;
    const nextX = this.entity.position.x + (dx / gap) * step;
    const nextY = this.entity.position.y + (dy / gap) * step;

    if (this.canStand(tiles, nextX, nextY)) {
      this.entity.position = { x: nextX, y: nextY };
      return;
    }

    // Something is in the way — walk to the alpha's tile properly instead
    const target = this.tileAt(tiles, Math.floor(anchor.position.x), Math.floor(anchor.position.y));
    if (target && isWalkableForEntity(target, this.entity.type)) {
      this.targetTile = target;
      this.path = [];
      this.currentState = 'moving';
    } else {
      this.currentState = 'idle';
    }
  }

  /** Resolve whatever the unit walked here to do. */
  private arriveAtTarget(tile: Tile, tiles: Tile[][]): void {
    // Only settle onto the tile if it is somewhere this creature can be
    if (isWalkableForEntity(tile, this.entity.type)) {
      this.entity.position = { x: tile.x + 0.5, y: tile.y + 0.5 };
    }
    this.removeStatus('moving');

    // Fulfil a village order
    if (this.order && this.order.x === tile.x && this.order.y === tile.y) {
      const order = this.order;
      this.order = null;
      this.targetTile = null;
      this.currentState = 'idle';
      this.ticksSinceLastAction = 0;
      simulation.onOrderComplete?.(this.entity, order);
      return;
    }

    if (isDrinkableBiome(tile.type) || isShoreTile(tile, tiles)) {
      this.entity.needs.thirst = 1.0;
      this.addTimedStatus('drinking', 2500);
    } else if (this.hasHarvestableResource(tile)) {
      this.currentState = 'gathering';
      this.ticksSinceLastAction = 0;
      return;
    }

    this.targetTile = null;
    this.currentState = 'idle';
    this.ticksSinceLastAction = 0;
  }

  /** Anything this unit would stop to pick up. */
  private hasHarvestableResource(tile: Tile): boolean {
    if (tile.resources.some(r => r.type === 'food' && r.quantity > 0)) return true;
    if (this.entity.job !== 'gatherer' || !this.entity.villageId) return false;
    return tile.resources.some(r => (r.type === 'wood' || r.type === 'stone') && r.quantity > 0);
  }

  private handleGatheringState(): void {
    if (!this.targetTile) {
      this.currentState = 'idle';
      return;
    }
    if (this.ticksSinceLastAction < 0.8) return;

    const tile = this.targetTile;
    const food = tile.resources.find(r => r.type === 'food' && r.quantity > 0);
    if (food) {
      food.quantity -= 1;
      this.entity.needs.hunger = Math.min(1.0, this.entity.needs.hunger + 0.55);
      this.addTimedStatus('eating', 2500);

      // Village gatherers haul a share home instead of eating it all
      if (this.entity.job === 'gatherer' && this.entity.villageId && !this.entity.carrying) {
        this.entity.carrying = { type: 'food', quantity: 2 };
      }

      if (food.quantity <= 0) {
        const index = tile.resources.indexOf(food);
        if (index !== -1) tile.resources.splice(index, 1);
      }
    }

    // Village workers also fell timber and quarry stone
    if (this.entity.job === 'gatherer' && this.entity.villageId && !this.entity.carrying) {
      const haul = tile.resources.find(r => (r.type === 'wood' || r.type === 'stone') && r.quantity > 0);
      if (haul) {
        haul.quantity -= 1;
        this.entity.carrying = { type: haul.type, quantity: 2 };
        if (haul.quantity <= 0) {
          const index = tile.resources.indexOf(haul);
          if (index !== -1) tile.resources.splice(index, 1);
        }
      }
    }

    this.currentState = 'idle';
    this.ticksSinceLastAction = 0;
  }

  private handleHuntingState(tiles: Tile[][], deltaTime: number): void {
    const target = this.targetEntity;
    if (!target || target.health <= 0) {
      this.targetEntity = null;
      this.currentState = 'idle';
      return;
    }

    const dx = target.position.x - this.entity.position.x;
    const dy = target.position.y - this.entity.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 14) {
      this.targetEntity = null;
      this.currentState = 'idle';
      return;
    }

    if (distance < 0.6) {
      this.strike(target);
      if (target.health <= 0) {
        this.entity.needs.hunger = 1.0;
        this.addTimedStatus('eating', 2500);
        this.entity.kills = (this.entity.kills ?? 0) + 1;
        this.targetEntity = null;
        this.currentState = 'idle';
      }
      return;
    }

    this.addStatus('moving');
    this.entity.lastPosition = { ...this.entity.position };
    const step = this.tilesPerSecond() * deltaTime;
    const nextX = this.entity.position.x + (dx / distance) * step;
    const nextY = this.entity.position.y + (dy / distance) * step;
    if (this.canStand(tiles, nextX, nextY)) {
      this.entity.position = { x: nextX, y: nextY };
    } else {
      this.targetEntity = null;
      this.currentState = 'idle';
    }
  }

  private handleFightingState(deltaTime: number): void {
    const target = this.targetEntity;
    if (!target || target.health <= 0) {
      this.targetEntity = null;
      this.currentState = 'idle';
      this.removeStatus('fighting');
      return;
    }

    // Badly wounded units break off and run
    if (this.entity.health < this.entity.maxHealth * 0.25) {
      this.currentState = 'fleeing';
      return;
    }

    const dx = target.position.x - this.entity.position.x;
    const dy = target.position.y - this.entity.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 0.7) {
      this.addStatus('fighting');
      this.strike(target);
      if (target.health <= 0) {
        this.entity.kills = (this.entity.kills ?? 0) + 1;
        this.targetEntity = null;
        this.currentState = 'idle';
        this.removeStatus('fighting');
      }
      return;
    }

    if (distance > 12) {
      this.targetEntity = null;
      this.currentState = 'idle';
      return;
    }

    this.addStatus('moving');
    this.entity.lastPosition = { ...this.entity.position };
    const step = this.tilesPerSecond() * deltaTime;
    this.entity.position = {
      x: this.entity.position.x + (dx / distance) * step,
      y: this.entity.position.y + (dy / distance) * step,
    };
  }

  /** Deal one blow, respecting the attack cooldown. */
  private strike(target: Entity): void {
    if (this.attackCooldown > 0) return;
    this.attackCooldown = 0.8;
    target.health -= this.entity.attributes.strength * 0.6;
    this.addTimedStatus('attacking', 600);
    if (!target.status.includes('wounded')) target.status.push('wounded');
    if (target.health <= 0 && !target.status.includes('slain')) target.status.push('slain');
  }

  private handleFleeingState(tiles: Tile[][], deltaTime: number): void {
    const threat = this.targetEntity;
    if (!threat) {
      this.removeStatus('fleeing');
      this.currentState = 'idle';
      return;
    }

    const dx = threat.position.x - this.entity.position.x;
    const dy = threat.position.y - this.entity.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 8 || threat.health <= 0) {
      this.targetEntity = null;
      this.removeStatus('fleeing');
      this.currentState = 'idle';
      return;
    }

    this.addStatus('fleeing');
    this.addStatus('moving');
    this.entity.lastPosition = { ...this.entity.position };

    const step = this.tilesPerSecond() * 1.25 * deltaTime;
    const dirX = -dx / (distance || 1);
    const dirY = -dy / (distance || 1);

    const candidates: Array<[number, number]> = [[dirX, dirY]];
    for (const angle of [0.6, -0.6, 1.3, -1.3]) {
      candidates.push([
        dirX * Math.cos(angle) - dirY * Math.sin(angle),
        dirX * Math.sin(angle) + dirY * Math.cos(angle),
      ]);
    }

    for (const [cx, cy] of candidates) {
      const nextX = this.entity.position.x + cx * step;
      const nextY = this.entity.position.y + cy * step;
      if (this.canStand(tiles, nextX, nextY)) {
        this.entity.position = { x: nextX, y: nextY };
        return;
      }
    }

    // Cornered: turn and fight rather than shaking against a wall forever
    if (this.entity.health > this.entity.maxHealth * 0.35) {
      this.removeStatus('fleeing');
      this.currentState = 'fighting';
    }
  }

  private handleBuildingState(): void {
    // Construction progress is driven by the settlement system.
    this.currentState = 'idle';
  }

  private handleSleepingState(deltaTime: number): void {
    this.removeStatus('moving');
    this.entity.needs.rest = Math.min(1.0, this.entity.needs.rest + 0.12 * deltaTime);
    if (this.entity.needs.rest > 0.9 || (simulation.timeOfDay !== 'night' && this.entity.needs.rest > 0.5)) {
      this.removeStatus('sleeping');
      this.currentState = 'idle';
      this.ticksSinceLastAction = 0;
    }
  }

  private handleDyingState(): void {
    this.addStatus('dead');
  }

  // -- helpers -----------------------------------------------------------

  private addStatus(status: string): void {
    if (!this.entity.status.includes(status)) this.entity.status.push(status);
  }

  private removeStatus(status: string): void {
    const index = this.entity.status.indexOf(status);
    if (index !== -1) this.entity.status.splice(index, 1);
  }

  private addTimedStatus(status: string, milliseconds: number): void {
    this.addStatus(status);
    setTimeout(() => this.removeStatus(status), milliseconds);
  }

  private tileAt(tiles: Tile[][], x: number, y: number): Tile | null {
    if (x < 0 || x >= tiles.length || y < 0 || y >= tiles[0].length) return null;
    return tiles[x][y];
  }

  private canStand(tiles: Tile[][], x: number, y: number): boolean {
    const tile = this.tileAt(tiles, Math.floor(x), Math.floor(y));
    if (!tile) return false;
    return tile.walkable !== false && isWalkableForEntity(tile, this.entity.type);
  }

  /** Closest tile within `radius` satisfying a predicate. */
  private findNearbyTile(tiles: Tile[][], radius: number, predicate: (tile: Tile) => boolean): Tile | null {
    const cx = Math.floor(this.entity.position.x);
    const cy = Math.floor(this.entity.position.y);
    let best: Tile | null = null;
    let bestDistance = Infinity;

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const tile = this.tileAt(tiles, cx + dx, cy + dy);
        if (!tile || !predicate(tile)) continue;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = tile;
        }
      }
    }
    return best;
  }

  private findNearbyPrey(): Entity | null {
    if (!this.index) return null;
    const preyTypes = FOOD_CHAIN[this.entity.type] ?? [];
    if (preyTypes.length === 0) return null;

    const perception = this.entity.traits?.includes('genius') ? 12 : 8;
    let best: Entity | null = null;
    let bestDistance = Infinity;

    for (const candidate of this.index.query(this.entity.position.x, this.entity.position.y, perception)) {
      if (candidate.id === this.entity.id) continue;
      if (!preyTypes.includes(candidate.type)) continue;
      const distance = (candidate.position.x - this.entity.position.x) ** 2
        + (candidate.position.y - this.entity.position.y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best;
  }

  private findNearbyThreat(radius: number): Entity | null {
    if (!this.index) return null;
    const predators = PREDATORS_OF[this.entity.type] ?? [];
    if (predators.length === 0) return null;

    let best: Entity | null = null;
    let bestDistance = Infinity;
    for (const candidate of this.index.query(this.entity.position.x, this.entity.position.y, radius)) {
      if (!predators.includes(candidate.type)) continue;
      const distance = (candidate.position.x - this.entity.position.x) ** 2
        + (candidate.position.y - this.entity.position.y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best;
  }

  private isPredator(): boolean {
    return (FOOD_CHAIN[this.entity.type] ?? []).length > 0;
  }

  private isPrey(): boolean {
    return (PREDATORS_OF[this.entity.type] ?? []).length > 0;
  }

  /** Send this unit to fight a specific enemy (used by raids). */
  engage(target: Entity): void {
    this.targetEntity = target;
    this.targetTile = null;
    this.path = [];
    this.currentState = 'fighting';
  }
}
