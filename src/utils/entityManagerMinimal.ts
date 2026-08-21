// src/utils/entityManagerMinimal.ts
import * as THREE from 'three';
import { TILE_SIZE, type Tile, type Entity, type EntityType } from '../types/world';
import { createEntity, createEntityMesh, updateEntityMesh, EntityAI, type AIOrder } from './entitySystemMinimal';
import { inheritTraits } from './traits';
import { simulation } from './simulation';
import { emitDamage, emitFloater } from './floatBridge';
import { speak } from './dialogue';
import { chronicle, deathTopic } from './chronicle';
import { recordBirth } from './worldStats';
import { applyStatus, clearStatus, forgetStatuses } from './statusEffects';
import { seedMood } from './mood';
import type { WorldLaws } from '../store/gameStore';
import type { GameEvent } from '../store/gameStore';
import type { SavedEntity } from './saveSystem';

export type DeathCause = 'old_age' | 'health' | 'random' | 'divine' | 'combat' | 'starvation' | 'burned';

/** Spatial buckets are this many tiles across. */
const BUCKET_SIZE = 8;

/**
 * Neighbourhood queries used by the AI. Backed by a coarse grid so hunting and
 * fleeing cost O(neighbours) instead of O(radius²) tile scans.
 */
export interface EntityIndex {
  query(x: number, y: number, radius: number): Entity[];
}

/**
 * EntityManager - Handles spawning, updating, and managing entities in the world
 */
export class EntityManager implements EntityIndex {
  private entities: Map<string, Entity> = new Map();
  private entityAIs: Map<string, EntityAI> = new Map();
  private tiles: Tile[][];
  private scene: THREE.Scene;
  private camera: THREE.Camera | null;
  /** bucketKey -> entities currently inside that bucket. */
  private buckets: Map<number, Set<Entity>> = new Map();
  private bucketOf: Map<string, number> = new Map();
  private bucketsPerRow: number;
  private laws: WorldLaws = simulation.laws;
  /** 1 = close up, 0 = zoomed far out. Drives visual level of detail. */
  private detailLevel = 1;

  onLifeEvent?: (message: string, kind: GameEvent['kind'], position?: { x: number; y: number }) => void;
  onEntityDeath?: (entity: Entity, cause: DeathCause) => void;
  onEntitySpawn?: (entity: Entity) => void;

  // Lifecycle settings
  private reproductionProbability = 0.001;
  private deathProbability = 0.0005;
  private agingRate = 0.01;
  private entityPopulationDensity: 'low' | 'medium' | 'high' = 'medium';

  constructor(tiles: Tile[][], scene: THREE.Scene, camera?: THREE.Camera) {
    this.tiles = tiles;
    this.scene = scene;
    this.camera = camera ?? null;
    this.bucketsPerRow = Math.max(1, Math.ceil(tiles.length / BUCKET_SIZE));
  }

  setWorldLaws(laws: WorldLaws): void {
    this.laws = laws;
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /** 1 = close up, 0 = zoomed right out. Drives HUD and animation detail. */
  get detail(): number {
    return this.detailLevel;
  }

  // -- spatial index -----------------------------------------------------

  private bucketKey(x: number, y: number): number {
    const bx = Math.min(this.bucketsPerRow - 1, Math.max(0, Math.floor(x / BUCKET_SIZE)));
    const by = Math.min(this.bucketsPerRow - 1, Math.max(0, Math.floor(y / BUCKET_SIZE)));
    return bx * this.bucketsPerRow + by;
  }

  private indexEntity(entity: Entity): void {
    const key = this.bucketKey(entity.position.x, entity.position.y);
    const previous = this.bucketOf.get(entity.id);
    if (previous === key) return;
    if (previous !== undefined) this.buckets.get(previous)?.delete(entity);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new Set();
      this.buckets.set(key, bucket);
    }
    bucket.add(entity);
    this.bucketOf.set(entity.id, key);
  }

  private unindexEntity(entity: Entity): void {
    const key = this.bucketOf.get(entity.id);
    if (key !== undefined) this.buckets.get(key)?.delete(entity);
    this.bucketOf.delete(entity.id);
  }

  /** Every living entity whose centre lies within `radius` tiles of (x, y). */
  query(x: number, y: number, radius: number): Entity[] {
    const results: Entity[] = [];
    const span = Math.ceil(radius / BUCKET_SIZE);
    const bx = Math.floor(x / BUCKET_SIZE);
    const by = Math.floor(y / BUCKET_SIZE);
    const radiusSq = radius * radius;

    for (let ix = bx - span; ix <= bx + span; ix++) {
      if (ix < 0 || ix >= this.bucketsPerRow) continue;
      for (let iy = by - span; iy <= by + span; iy++) {
        if (iy < 0 || iy >= this.bucketsPerRow) continue;
        const bucket = this.buckets.get(ix * this.bucketsPerRow + iy);
        if (!bucket) continue;
        for (const entity of bucket) {
          if (entity.health <= 0) continue;
          const dx = entity.position.x - x;
          const dy = entity.position.y - y;
          if (dx * dx + dy * dy <= radiusSq) results.push(entity);
        }
      }
    }
    return results;
  }

  // -- spawning ----------------------------------------------------------

  /**
   * Spawn a new entity in the world
   */
  spawnEntity(type: EntityType, x: number, y: number, options: { traits?: Entity['traits'] } = {}): Entity | null {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (!this.isInBounds(ix, iy)) return null;

    const tile = this.tiles[ix][iy];
    if (!this.isSuitableTileForEntity(type, tile)) return null;

    const entity = createEntity(type, ix + 0.5, iy + 0.5, options.traits);

    const mesh = createEntityMesh(entity);
    mesh.position.set(
      (entity.position.x - this.tiles.length / 2) * TILE_SIZE,
      tile.scaledHeight,
      (entity.position.y - this.tiles[0].length / 2) * TILE_SIZE,
    );
    this.scene.add(mesh);

    entity.mesh = mesh;
    // Start life at whatever its circumstances imply, rather than at zero:
    // a creature spawned into good land should not have to earn its way up
    // from neutral for the first minute of its existence.
    seedMood(entity);
    this.entities.set(entity.id, entity);
    this.entityAIs.set(entity.id, new EntityAI(entity, this));
    this.indexEntity(entity);
    tile.entities.push(entity);

    this.onEntitySpawn?.(entity);
    return entity;
  }

  /** Recreate an entity exactly as it was saved (see saveSystem.ts). */
  restoreEntity(saved: SavedEntity): Entity | null {
    const ix = Math.floor(saved.x);
    const iy = Math.floor(saved.y);
    if (!this.isInBounds(ix, iy)) return null;
    const tile = this.tiles[ix][iy];

    const entity: Entity = {
      id: saved.id,
      type: saved.type,
      name: saved.name,
      age: saved.age,
      maxAge: saved.maxAge,
      health: saved.health,
      maxHealth: saved.maxHealth,
      position: { x: saved.x, y: saved.y },
      attributes: { ...saved.attributes },
      needs: { ...saved.needs },
      inventory: [],
      status: [],
      traits: [...saved.traits],
      kills: saved.kills,
      kingdomId: saved.kingdomId,
      villageId: saved.villageId,
      carrying: null,
      job: saved.job,
    };

    const mesh = createEntityMesh(entity);
    mesh.position.set(
      (entity.position.x - this.tiles.length / 2) * TILE_SIZE,
      tile.scaledHeight,
      (entity.position.y - this.tiles[0].length / 2) * TILE_SIZE,
    );
    this.scene.add(mesh);
    entity.mesh = mesh;

    this.entities.set(entity.id, entity);
    this.entityAIs.set(entity.id, new EntityAI(entity, this));
    this.indexEntity(entity);
    tile.entities.push(entity);
    return entity;
  }

  // -- per-frame update --------------------------------------------------

  update(delta: number): void {
    this.updateDetailLevel();

    this.entities.forEach((entity, id) => {
      const previousTileX = Math.floor(entity.position.x);
      const previousTileY = Math.floor(entity.position.y);

      this.entityAIs.get(id)?.update(this.tiles, delta);

      this.syncTileOccupancy(entity, previousTileX, previousTileY);
      this.indexEntity(entity);
      this.processLifecycleEvents(entity, delta);
      this.updateEntityVisual(entity, delta);
    });
  }

  /** Cheap zoom-based level of detail: hide chrome when the map is far away. */
  private updateDetailLevel(): void {
    if (!this.camera) return;
    const worldUnits = this.tiles.length * TILE_SIZE;
    const distance = this.camera.position.length();
    // Full detail up to a third of the world size, none past the whole world.
    const t = (distance - worldUnits * 0.35) / (worldUnits * 0.65);
    this.detailLevel = Math.max(0, Math.min(1, 1 - t));
  }

  /** Keep tile entity lists accurate as entities move between tiles. */
  private syncTileOccupancy(entity: Entity, previousX: number, previousY: number): void {
    const currentX = Math.floor(entity.position.x);
    const currentY = Math.floor(entity.position.y);
    if (currentX === previousX && currentY === previousY) return;

    if (this.isInBounds(previousX, previousY)) {
      const oldTile = this.tiles[previousX][previousY];
      const index = oldTile.entities.findIndex(e => e.id === entity.id);
      if (index !== -1) oldTile.entities.splice(index, 1);
    }
    if (this.isInBounds(currentX, currentY)) {
      const newTile = this.tiles[currentX][currentY];
      if (!newTile.entities.some(e => e.id === entity.id)) newTile.entities.push(entity);
    }
  }

  private isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.tiles.length && y >= 0 && y < this.tiles[0].length;
  }

  // -- lifecycle ---------------------------------------------------------

  private processLifecycleEvents(entity: Entity, delta: number): void {
    // Undead do not age or breed
    if (['skeleton', 'zombie'].includes(entity.type)) {
      if (entity.health <= 0) {
        this.killEntity(entity, entity.status.includes('slain') ? 'combat' : 'health');
      }
      return;
    }

    const traits = entity.traits ?? [];

    if (this.laws.aging && !traits.includes('immortal')) {
      entity.age += this.agingRate * delta;
      if (entity.age >= entity.maxAge) {
        this.killEntity(entity, 'old_age');
        return;
      }
    }

    if (traits.includes('regeneration') && entity.health < entity.maxHealth) {
      entity.health = Math.min(entity.maxHealth, entity.health + entity.maxHealth * 0.02 * delta);
    }

    if (Math.random() < this.deathProbability * delta) {
      this.killEntity(entity, 'random');
      return;
    }

    if (entity.health <= 0) {
      const slain = entity.status.includes('slain');
      const starved = entity.needs.hunger <= 0.02 || entity.needs.thirst <= 0.02;
      this.killEntity(entity, slain ? 'combat' : starved ? 'starvation' : 'health');
      return;
    }

    if (!this.laws.reproduction) return;

    const canReproduce = entity.age >= entity.maxAge * 0.2
      && entity.age <= entity.maxAge * 0.8
      && entity.needs.hunger > 0.4;
    const fertility = traits.includes('fertile') ? 3 : 1;
    const populationMultiplier = this.getPopulationDensityMultiplier();

    if (canReproduce && Math.random() < this.reproductionProbability * delta * populationMultiplier * fertility) {
      this.reproduceEntity(entity);
    }
  }

  private reproduceEntity(entity: Entity): void {
    if (this.getEntityCountByType(entity.type) >= this.getMaxEntityCount(entity.type)) return;

    const { x, y } = entity.position;
    const suitable = this.getNearbyTiles(x, y, 2)
      .filter(t => this.isSuitableTileForEntity(entity.type, t));
    if (suitable.length === 0) return;

    const chosen = suitable[Math.floor(Math.random() * suitable.length)];
    const child = this.spawnEntity(entity.type, chosen.x, chosen.y, {
      traits: inheritTraits(entity.traits),
    });
    if (child) {
      recordBirth();
      child.kingdomId = entity.kingdomId ?? null;
      child.villageId = entity.villageId ?? null;
      // A child costs the parent some of its reserves
      entity.needs.hunger = Math.max(0.15, entity.needs.hunger - 0.35);
      this.onLifeEvent?.(
        chronicle('born', { name: child.name, type: child.type }),
        'life',
        { x: Math.floor(child.position.x), y: Math.floor(child.position.y) },
      );
      // A heart over the parent, and once in a while a word about it.
      emitFloater({
        kind: 'emote', text: '\u2665',
        x: entity.position.x, y: entity.position.y, entityId: entity.id,
      });
      if (Math.random() < 0.35) {
        emitFloater({
          kind: 'speech', text: speak('newborn', Math.random()),
          x: entity.position.x, y: entity.position.y, entityId: entity.id,
        });
      }
    }
  }

  /**
   * Kill an entity and handle its removal
   */
  killEntity(entity: Entity, cause: DeathCause): void {
    if (!this.entities.has(entity.id)) return;

    // Marked here rather than on the corpse: the entity is about to stop
    // existing, so the floater is given a fixed position instead of an id to
    // follow.
    emitFloater({
      kind: 'emote', text: '\u2620',
      x: entity.position.x, y: entity.position.y,
    });

    const ix = Math.floor(entity.position.x);
    const iy = Math.floor(entity.position.y);
    if (this.isInBounds(ix, iy)) {
      const tile = this.tiles[ix][iy];
      const index = tile.entities.findIndex(e => e.id === entity.id);
      if (index !== -1) tile.entities.splice(index, 1);
      tile.population = Math.max(0, tile.population - 1);
    }

    this.entities.delete(entity.id);
    this.entityAIs.delete(entity.id);
    forgetStatuses(entity.id);
    this.unindexEntity(entity);
    this.disposeMesh(entity);

    this.onEntityDeath?.(entity, cause);
    this.onLifeEvent?.(
      chronicle(deathTopic(cause), { name: entity.name, type: entity.type }),
      'death',
      { x: ix, y: iy },
    );
  }

  private disposeMesh(entity: Entity): void {
    if (!entity.mesh) return;
    this.scene.remove(entity.mesh);
    entity.mesh.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach(m => m.dispose());
      else if (material) material.dispose();
    });
    entity.mesh = null;
  }

  /** Damage every entity within a tile radius; returns kill count. */
  damageArea(
    centerX: number,
    centerY: number,
    radius: number,
    damage: number,
    cause: DeathCause = 'divine',
  ): number {
    let kills = 0;
    for (const victim of this.query(centerX, centerY, radius)) {
      victim.health -= damage;
      emitDamage(victim.position.x, victim.position.y, damage, victim.id);
      applyStatus(victim, 'wounded');
      if (victim.health <= 0) {
        this.killEntity(victim, cause);
        kills++;
      }
    }
    return kills;
  }

  /** Heal every entity within a tile radius. */
  healArea(centerX: number, centerY: number, radius: number, amount: number): number {
    let healed = 0;
    for (const entity of this.query(centerX, centerY, radius)) {
      const before = entity.health;
      entity.health = Math.min(entity.maxHealth, entity.health + amount);
      const given = Math.round(entity.health - before);
      if (given >= 1) {
        emitFloater({
          kind: 'heal', text: `+${given}`,
          x: entity.position.x, y: entity.position.y, entityId: entity.id,
        });
      }
      entity.needs.hunger = 1.0;
      entity.needs.thirst = 1.0;
      clearStatus(entity, 'wounded');
      applyStatus(entity, 'blessed');
      healed++;
    }
    return healed;
  }

  getPopulation(): number {
    return this.entities.size;
  }

  /** Remove every entity and dispose meshes (world reset). */
  clear(): void {
    this.entities.forEach(entity => this.disposeMesh(entity));
    this.entities.clear();
    this.entityAIs.clear();
    this.buckets.clear();
    this.bucketOf.clear();
  }

  setPopulationDensity(density: 'low' | 'medium' | 'high'): void {
    this.entityPopulationDensity = density;
    switch (density) {
      case 'low':
        this.reproductionProbability = 0.0005;
        this.deathProbability = 0.001;
        break;
      case 'medium':
        this.reproductionProbability = 0.001;
        this.deathProbability = 0.0005;
        break;
      case 'high':
        this.reproductionProbability = 0.002;
        this.deathProbability = 0.0002;
        break;
    }
  }

  private getPopulationDensityMultiplier(): number {
    switch (this.entityPopulationDensity) {
      case 'low': return 0.5;
      case 'high': return 2.0;
      default: return 1.0;
    }
  }

  private getEntityCountByType(type: EntityType): number {
    let count = 0;
    this.entities.forEach(entity => {
      if (entity.type === type) count++;
    });
    return count;
  }

  private getMaxEntityCount(type: EntityType): number {
    const baseMaxCounts: Record<EntityType, number> = {
      human: 140, elf: 110, dwarf: 90, orc: 110,
      wolf: 30, bear: 15, deer: 40, rabbit: 60, bird: 60, fish: 90,
      sheep: 50, chicken: 60, fox: 25, snake: 25,
      dragon: 3, demon: 5, zombie: 60, skeleton: 70, elemental: 10, bandit: 25,
    };
    const baseMax = baseMaxCounts[type] ?? 50;
    switch (this.entityPopulationDensity) {
      case 'low': return Math.floor(baseMax * 0.5);
      case 'high': return Math.floor(baseMax * 2);
      default: return baseMax;
    }
  }

  /**
   * Check if a tile is suitable for a specific entity type.
   * Deliberately permissive so god-tools always feel responsive:
   * fish need water, everyone else needs land.
   */
  private isSuitableTileForEntity(type: EntityType, tile: Tile): boolean {
    const isWater = ['deep_ocean', 'ocean', 'shallow_water', 'river', 'lake'].includes(tile.type);
    if (type === 'fish') return isWater;
    if (isWater || tile.walkable === false) return false;
    return tile.height > 0.25;
  }

  private getNearbyTiles(x: number, y: number, range: number): Tile[] {
    const nearby: Tile[] = [];
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    for (let dx = -range; dx <= range; dx++) {
      for (let dy = -range; dy <= range; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = ix + dx;
        const ny = iy + dy;
        if (this.isInBounds(nx, ny)) nearby.push(this.tiles[nx][ny]);
      }
    }
    return nearby;
  }

  /**
   * Update the visual representation of an entity
   */
  private updateEntityVisual(entity: Entity, delta: number): void {
    if (!entity.mesh) return;

    const { x, y } = entity.position;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (!this.isInBounds(ix, iy)) return;

    const tile = this.tiles[ix][iy];
    const worldX = (x - this.tiles.length / 2) * TILE_SIZE;
    const worldY = tile.scaledHeight;
    const worldZ = (y - this.tiles[0].length / 2) * TILE_SIZE;

    if (entity.lastPosition) {
      entity.mesh.position.x = THREE.MathUtils.lerp(entity.mesh.position.x, worldX, 0.25);
      entity.mesh.position.z = THREE.MathUtils.lerp(entity.mesh.position.z, worldZ, 0.25);
    } else {
      entity.mesh.position.x = worldX;
      entity.mesh.position.z = worldZ;
    }
    entity.mesh.position.y = THREE.MathUtils.lerp(entity.mesh.position.y, worldY, 0.3);

    updateEntityMesh(entity, delta, this.detailLevel);
  }

  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  getEntityById(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  /** Tell a unit where its village wants it (see SettlementSystem). */
  giveOrder(entity: Entity, order: AIOrder): void {
    const ai = this.entityAIs.get(entity.id);
    if (!ai) return;
    // Don't override an identical standing order — that would reset the path
    // every time the village re-evaluates its workforce.
    if (ai.order && ai.order.x === order.x && ai.order.y === order.y && ai.order.purpose === order.purpose) return;
    ai.setOrder(order);
  }

  /** Send a unit into melee with a specific enemy. */
  engage(entity: Entity, target: Entity): void {
    this.entityAIs.get(entity.id)?.engage(target);
  }

  /** Make a creature trail another one (herd following). */
  setHerdAnchor(entity: Entity, anchor: Entity | null, slack = 3.5): void {
    const ai = this.entityAIs.get(entity.id);
    if (!ai) return;
    ai.anchor = anchor;
    ai.anchorSlack = slack;
    if (!anchor && ai.currentState === 'following') ai.currentState = 'idle';
  }

  /** Population by kingdom id, used by the settlement system. */
  getEntitiesByKingdom(): Map<string, Entity[]> {
    const grouped = new Map<string, Entity[]>();
    this.entities.forEach(entity => {
      if (!entity.kingdomId) return;
      const list = grouped.get(entity.kingdomId);
      if (list) list.push(entity);
      else grouped.set(entity.kingdomId, [entity]);
    });
    return grouped;
  }
}
