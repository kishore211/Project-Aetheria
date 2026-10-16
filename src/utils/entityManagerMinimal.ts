// src/utils/entityManagerMinimal.ts
import { wants } from './mind';
import { bornInto, foundClan } from './families';
import { abilityTick, type AbilityWorld } from './creatureAbilities';
import { cloneEquipment, reserveItemIds } from './equipment';
import * as THREE from 'three';
import { pickRamp } from './subspecies';
import { isAquatic } from './pathfinding';
import { setEntanglewood } from './biomeEffects';
import { TILE_SIZE, type Tile, type Entity, type EntityType } from '../types/world';
import { createEntity, createEntityMesh, updateEntityMesh, EntityAI, type AIOrder } from './entitySystemMinimal';
import { earnTraits, inheritTraits } from './traits';
import { simulation } from './simulation';
import { emitDamage, emitFloater } from './floatBridge';
import { chronicle, deathTopic } from './chronicle';
import { recordBirth } from './worldStats';
import { applyStatus, clearStatus, forgetStatuses } from './statusEffects';
import { faithHas } from './religion';
import { seedMood } from './mood';
import { viewFraction } from './cameraView';
import { applyScenario } from './scenarios';
import { childAgingRate, isChild } from './size';
import { mapAll } from '../content/creatures';

/**
 * Races that need a partner to reproduce. Animals are deliberately absent:
 * they have herds rather than pairs, and gating them would halt every ecology.
 */
/**
 * Someone the chronicle should mention by name: a ruler or officer, a hero
 * with blood on their blade or a legend in their hand, a player's favourite,
 * or a monster. Everybody else lives and dies on the map, not in the log.
 */
const NOTABLE_STATUS = new Set(['king', 'leader', 'captain', 'priest']);
const isNotable = (entity: Entity): boolean =>
  Boolean(entity.favourite)
  || entity.status.some(s => NOTABLE_STATUS.has(s))
  || (entity.kills ?? 0) >= 5
  || entity.equipment?.weapon?.quality === 'legendary'
  || MONSTERS.has(entity.type);
/** A royal birth, or a favourite's child: the only births worth a line. */
const isRoyal = (entity: Entity): boolean => Boolean(entity.favourite) || entity.status.includes('king');
const MONSTERS = new Set<string>(['dragon', 'demon', 'crabzilla', 'ufo', 'sandworm', 'cold_one', 'yeti', 'necromancer', 'treant', 'robot_santa']);

/** Population cap per kind at medium density. See CreatureDef.maxPopulation. */
const BASE_MAX_COUNTS: Record<EntityType, number> = mapAll(c => c.maxPopulation);

const PAIRING_TYPES = new Set<string>(['human', 'elf', 'dwarf', 'orc']);
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
  /**
   * Where the per-creature objects live. Deliberately *not* in the scene: the
   * creature layer draws them in one batch, so the renderer has no reason to
   * walk thousands of hidden sprites every frame. They are kept for their
   * state and for picking — see `prepareForPicking`.
   */
  private scene: THREE.Group;
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
  /**
   * Chance per second of an unexplained death. It was 0.0005 — a mean life of
   * about half an hour whatever a creature's age, a quarter of a human's
   * natural span — so sudden deaths outnumbered births and a civilisation of
   * forty took half an hour to reach sixty. Old age, hunger and war are what
   * should end most lives; this is the background, not the main cause.
   */
  private deathProbability = 0.00012;
  private agingRate = 0.01;
  private entityPopulationDensity: 'low' | 'medium' | 'high' = 'medium';

  constructor(tiles: Tile[][], scene: THREE.Scene, camera?: THREE.Camera) {
    this.tiles = tiles;
    void scene;
    this.scene = new THREE.Group();
    this.scene.name = 'creature-proxies';
    this.camera = camera ?? null;
    this.bucketsPerRow = Math.max(1, Math.ceil(tiles.length / BUCKET_SIZE));
  }

  private villagePopulation(villageId: string): number {
    let count = 0;
    for (const other of this.entities.values()) if (other.villageId === villageId) count++;
    return count;
  }

  setWorldLaws(laws: WorldLaws): void {
    setEntanglewood(laws.entanglewood);
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
  spawnEntity(
    type: EntityType,
    x: number,
    y: number,
    options: { traits?: Entity['traits']; subspecies?: string | null } = {},
  ): Entity | null {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (!this.isInBounds(ix, iy)) return null;

    const tile = this.tiles[ix][iy];
    if (!this.isSuitableTileForEntity(type, tile)) return null;

    const entity = createEntity(type, ix + 0.5, iy + 0.5, options.traits);
    // Arrivals found their own clan; the born are given one by reproduceEntity.
    foundClan(entity);
    // Colouring comes from where it is born, not from what it is: a white coat
    // is a cold choice. Passed in when a parent has one, so a litter looks like
    // its mother rather than like the field it happened to be dropped in.
    entity.subspecies = options.subspecies !== undefined
      ? options.subspecies
      : pickRamp(type, tile);

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
      // Absent in saves written before colour ramps existed, which load as the
      // plain palette rather than being re-rolled — a world you come back to
      // should have the same wolves in it.
      subspecies: saved.subspecies ?? null,
      size: saved.size,
      uplifted: saved.uplifted,
      equipment: cloneEquipment(saved.equipment),
      clan: saved.clan ?? null,
      mind: saved.mind ? { ...saved.mind } : undefined,
      favourite: saved.favourite,
      parentIds: saved.parentIds ? [...saved.parentIds] : undefined,
      carrying: null,
      job: saved.job,
    };
    reserveItemIds(entity.equipment);

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

  /**
   * Cheap zoom-based level of detail: hide chrome when the map is far away.
   *
   * Asked as "how much of the world is on screen" rather than "how far is the
   * camera", because the map camera is orthographic and sits at a fixed
   * altitude — its distance never changes, so the old test froze detail at one
   * value for ever.
   */
  private updateDetailLevel(): void {
    if (!this.camera) return;
    const worldUnits = this.tiles.length * TILE_SIZE;
    const fraction = viewFraction(this.camera, worldUnits);
    // Full detail up to a third of the world in view, none past the whole world.
    const t = (fraction - 0.35) / 0.65;
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

  /** What a creature's aura can touch. Built on first use; the closures read live state. */
  private abilityWorld?: AbilityWorld;

  private abilities(): AbilityWorld {
    this.abilityWorld ??= {
      tiles: this.tiles,
      spawn: (type, x, y) => (this.isInBounds(Math.floor(x), Math.floor(y)) ? this.spawnEntity(type, x, y) : null),
      near: (x, y, radius) => this.query(x, y, radius),
      ignite: (x, y) => simulation.igniteTile?.(x, y),
      setBiome: (x, y, type) => simulation.setBiome?.(x, y, type),
      demolishAt: (x, y) => simulation.demolishAt?.(x, y) ?? false,
      announce: (message, at) => this.onLifeEvent?.(message, 'info', { x: Math.floor(at.x), y: Math.floor(at.y) }),
      random: Math.random,
    };
    return this.abilityWorld;
  }

  private processLifecycleEvents(entity: Entity, delta: number): void {
    abilityTick(entity, delta, this.abilities());
    // A snowman somewhere warm is a snowman with a deadline.
    if (entity.type === 'snowman') {
      const ix = Math.floor(entity.position.x);
      const iy = Math.floor(entity.position.y);
      if (this.isInBounds(ix, iy) && this.tiles[ix][iy].temperature > 0.55) {
        entity.health -= 4 * delta;
      }
    }

    // Undead do not age or breed
    if (['skeleton', 'zombie', 'ghost', 'fire_skull', 'ufo', 'flame_tower', 'ice_tower', 'angel', 'langton_ant', 'tumor', 'jumpy_skull', 'robot_santa', 'monolith', 'grey_goo'].includes(entity.type)) {
      if (entity.health <= 0) {
        this.killEntity(entity, entity.status.includes('slain') ? 'combat' : 'health');
      }
      return;
    }

    const traits = entity.traits ?? [];

    if (this.laws.aging && !traits.includes('immortal')) {
      // Childhood runs on its own clock, the same few minutes for every
      // people: a town that waits a quarter of an hour for its babies to grow
      // up never sends anyone out to found the next one.
      entity.age += isChild(entity) ? childAgingRate(entity) * delta : this.agingRate * delta;
      if (entity.age >= entity.maxAge) {
        this.killEntity(entity, 'old_age');
        return;
      }
    }

    if (traits.includes('regeneration') && entity.health < entity.maxHealth) {
      entity.health = Math.min(entity.maxHealth, entity.health + entity.maxHealth * 0.02 * delta);
    }

    // Earned traits: checked here because both kills and wounds land elsewhere.
    if ((entity.kills ?? 0) >= 10 || entity.health < entity.maxHealth * 0.15) {
      const earned = earnTraits(entity);
      if (earned) {
        emitFloater({ kind: 'speech', text: earned === 'veteran' ? 'I have done this before.' : 'That one will leave a mark.', x: entity.position.x, y: entity.position.y, entityId: entity.id });
      }
    }

    const accidents = traits.includes('unlucky') ? 2 : 1;
    if (Math.random() < this.deathProbability * delta * accidents) {
      // Lucky: half of the accidents that would have happened, do not.
      if (!(traits.includes('lucky') && Math.random() < 0.5)) {
        this.killEntity(entity, 'random');
        return;
      }
    }

    if (entity.health <= 0) {
      const slain = entity.status.includes('slain');
      const starved = entity.needs.hunger <= 0.02 || entity.needs.thirst <= 0.02;
      this.killEntity(entity, slain ? 'combat' : starved ? 'starvation' : 'health');
      return;
    }

    if (!this.laws.reproduction) return;

    const canReproduce = wants(entity, 'breed')
      && entity.age >= entity.maxAge * 0.2
      && entity.age <= entity.maxAge * 0.8
      && entity.needs.hunger > 0.4;
    // Couples breed faster than herds: both partners have to be together and
    // fed for any of it to happen, which already throttles it far below the
    // raw rate, and a town that never grows is a town nobody watches.
    const fertility = (traits.includes('fertile') ? 3 : 1) * (PAIRING_TYPES.has(entity.type) ? 2.5 : 1);
    const populationMultiplier = this.getPopulationDensityMultiplier();

    if (canReproduce && Math.random() < this.reproductionProbability * delta * populationMultiplier * fertility) {
      // 100 People: a town that has reached its hundred stops having babies.
      // Counted only when a birth is actually about to happen, which is rare.
      if (this.laws.populationCap && entity.villageId && this.villagePopulation(entity.villageId) >= 100) return;
      this.reproduceEntity(entity);
    }
  }

  private reproduceEntity(entity: Entity): void {
    if (this.getEntityCountByType(entity.type) >= this.getMaxEntityCount(entity.type)) return;

    // The sentient races need a partner. Animals do not — they have herds and
    // no notion of pairing, and gating them would quietly halt every ecology
    // in the world. This replaces "reproduce alone", which was always a
    // placeholder: a village's growth now depends on its people actually
    // getting on with each other, which is a far better reason for a
    // population to stall than an invisible probability.
    if (PAIRING_TYPES.has(entity.type)) {
      if (!entity.loverId) return;
      const lover = this.entities.get(entity.loverId);
      if (!lover || lover.health <= 0) return;
      // Together, not merely betrothed.
      const dx = lover.position.x - entity.position.x;
      const dy = lover.position.y - entity.position.y;
      if (dx * dx + dy * dy > 36) return;
    }
    this.bearChild(entity, entity.loverId ? this.entities.get(entity.loverId) ?? null : null);
  }

  /**
   * A child for `entity` (and `partner`, when there is one), born beside it.
   *
   * Public because towns raise families on their own schedule: WorldBox
   * grows a village by its housing and its granary, not by two lovers
   * happening to stand within six tiles of each other at the right moment.
   */
  bearChild(entity: Entity, partner: Entity | null = null): Entity | null {
    if (this.getEntityCountByType(entity.type) >= this.getMaxEntityCount(entity.type)) return null;
    const { x, y } = entity.position;
    const suitable = this.getNearbyTiles(x, y, 2)
      .filter(t => this.isSuitableTileForEntity(entity.type, t));
    if (suitable.length === 0) return null;

    const chosen = suitable[Math.floor(Math.random() * suitable.length)];
    const child = this.spawnEntity(entity.type, chosen.x, chosen.y, {
      traits: inheritTraits(entity.traits),
      // Colour is inherited, which is the whole reason a region ends up with a
      // *population* of snow wolves rather than a scattering of them.
      subspecies: entity.subspecies ?? null,
    });
    if (child) {
      // Born, not arrived: it starts its life at the beginning.
      child.age = 0;
      bornInto(child, entity, partner);
      recordBirth();
      child.kingdomId = entity.kingdomId ?? null;
      child.villageId = entity.villageId ?? null;
      // A child costs the parent some of its reserves
      entity.needs.hunger = Math.max(0.15, entity.needs.hunger - 0.35);
      // Only a birth worth remembering reaches the chronicle: a town of a
      // hundred has a child every few seconds, and a log of all of them
      // buries the wars and the founding of nations.
      if (isRoyal(entity) || (partner && isRoyal(partner))) {
        this.onLifeEvent?.(
          chronicle('born', { name: child.name, type: child.type }),
          'life',
          { x: Math.floor(child.position.x), y: Math.floor(child.position.y) },
        );
      }
      // A heart over the parent, and once in a while a word about it.
      emitFloater({
        kind: 'emote', text: '\u2665',
        x: entity.position.x, y: entity.position.y, entityId: entity.id,
      });
      // Both parents feel it, when there are two.
      applyScenario(entity, 'childBorn');
      if (partner) applyScenario(partner, 'childBorn');
    }
    return child;
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
    this.mournFor(entity);
    // Martyrdom: a faithful who falls in battle stirs the faithful around it.
    if (cause === 'combat' && entity.religionId && faithHas(entity.religionId, 'martyrdom')) {
      for (const other of this.query(entity.position.x, entity.position.y, 5)) {
        if (other.id !== entity.id && other.religionId === entity.religionId && other.health > 0) applyStatus(other, 'enraged');
      }
    }

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
    // A favourite's death is news whatever killed it.
    if (entity.favourite) {
      this.onLifeEvent?.(`\u2605 ${entity.name}, one of your favourites, is gone`, 'death', { x: Math.floor(entity.position.x), y: Math.floor(entity.position.y) });
    }
    if (isNotable(entity) || cause === 'divine') {
      this.onLifeEvent?.(
        chronicle(deathTopic(cause), { name: entity.name, type: entity.type }),
        'death',
        { x: ix, y: iy },
      );
    }

    // The plague's last act: whoever it took gets up again. Only people — an
    // infected creature is always a person, since that is the only thing the
    // infection spreads between — and never something already undead.
    if (entity.status.includes('infected') && entity.type !== 'zombie' && entity.type !== 'skeleton') {
      const risen = this.spawnEntity('zombie', entity.position.x, entity.position.y);
      if (risen) {
        this.onLifeEvent?.(`${entity.name} rises again, and is not themselves`, 'death', { x: ix, y: iy });
      }
    }
  }

  /**
   * Remove a creature without any of the consequences of it dying.
   *
   * Deliberately not `killEntity`: no chronicle entry, no grief for its
   * partner, no entry in the death statistics, no skull. That distinction is
   * the whole character of the tool — a life eraser is a correction to the
   * world, not an event in it, and a player tidying up a mis-click should not
   * end up with a village in mourning and a fabricated line of history.
   */
  eraseEntity(entity: Entity): void {
    if (!this.entities.has(entity.id)) return;

    const ix = Math.floor(entity.position.x);
    const iy = Math.floor(entity.position.y);
    if (this.isInBounds(ix, iy)) {
      const tile = this.tiles[ix][iy];
      const index = tile.entities.findIndex(e => e.id === entity.id);
      if (index !== -1) tile.entities.splice(index, 1);
      tile.population = Math.max(0, tile.population - 1);
    }

    // Bonds still have to be cleared, or a survivor keeps a reference to
    // somebody who no longer exists. They simply are not mourned.
    for (const other of this.entities.values()) {
      if (other.friendId === entity.id) other.friendId = null;
      if (other.loverId === entity.id) other.loverId = null;
    }

    this.entities.delete(entity.id);
    this.entityAIs.delete(entity.id);
    forgetStatuses(entity.id);
    this.unindexEntity(entity);
    this.disposeMesh(entity);
  }

  /**
   * Tell the people who cared.
   *
   * Run before the entity is removed, so its partner and friend can still be
   * looked up and their bond cleared. Grief is the strongest single number in
   * the scenario table and it should be: it is the one thing in this
   * simulation a creature cannot recover from by walking somewhere.
   */
  private mournFor(entity: Entity): void {
    if (entity.loverId) {
      const lover = this.entities.get(entity.loverId);
      if (lover) {
        lover.loverId = null;
        if (lover.friendId === entity.id) lover.friendId = null;
        applyScenario(lover, 'lostLover');
      }
    }
    if (entity.friendId && entity.friendId !== entity.loverId) {
      const friend = this.entities.get(entity.friendId);
      if (friend) {
        if (friend.friendId === entity.id) friend.friendId = null;
        applyScenario(friend, 'lostFriend');
      }
    }

    // Anyone close enough to watch it happen is shaken by it.
    for (const witness of this.query(entity.position.x, entity.position.y, 4)) {
      if (witness.id === entity.id) continue;
      if (witness.id === entity.loverId || witness.id === entity.friendId) continue;
      if (Math.random() < 0.25) applyScenario(witness, 'sawDeath');
    }
  }

  /**
   * Bring the creature objects' world matrices up to date so a raycast can hit
   * them. They are outside the scene, so the renderer no longer does it for
   * free; picking is a few times a second, so doing it here is cheap.
   */
  prepareForPicking(): void {
    this.scene.updateMatrixWorld(true);
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
      if (victim.status.includes('shielded')) continue;
      const traits = victim.traits ?? [];
      if (cause === 'burned' && traits.includes('fireproof')) continue;
      const dealt = traits.includes('armored') ? damage * 0.67 : damage;
      victim.health -= dealt;
      emitDamage(victim.position.x, victim.position.y, dealt, victim.id);
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
        this.deathProbability = 0.00025;
        break;
      case 'medium':
        this.reproductionProbability = 0.001;
        this.deathProbability = 0.00012;
        break;
      case 'high':
        this.reproductionProbability = 0.002;
        this.deathProbability = 0.00006;
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
    const baseMax = BASE_MAX_COUNTS[type] ?? 50;
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
    if (isAquatic(type)) return isWater;
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
    // Held up by the magnet: lifted up the screen, which is what height looks
    // like from straight above.
    const worldZ = (y - this.tiles[0].length / 2) * TILE_SIZE - (entity.status.includes('lifted') ? 0.35 : 0);

    if (entity.lastPosition) {
      entity.mesh.position.x = THREE.MathUtils.lerp(entity.mesh.position.x, worldX, 0.25);
      entity.mesh.position.z = THREE.MathUtils.lerp(entity.mesh.position.z, worldZ, 0.25);
    } else {
      entity.mesh.position.x = worldX;
      entity.mesh.position.z = worldZ;
    }
    entity.mesh.position.y = THREE.MathUtils.lerp(entity.mesh.position.y, worldY, 0.3);

    updateEntityMesh(entity, delta, this.detailLevel);
    // A passenger is inside the boat, not standing on the water beside it.
    entity.mesh.visible = !entity.status.includes('aboard');
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

  /** Is this unit already on an errand for its village? */
  hasOrder(entity: Entity): boolean {
    return Boolean(this.entityAIs.get(entity.id)?.order);
  }

  /** Send a unit into melee with a specific enemy. */
  engage(entity: Entity, target: Entity): void {
    this.entityAIs.get(entity.id)?.engage(target);
  }

  /** Make a creature trail another one (herd following). */
  setHerdAnchor(entity: Entity, anchor: Entity | null, slack = 3.5, offset: { x: number; y: number } | null = null): void {
    const ai = this.entityAIs.get(entity.id);
    if (!ai) return;
    ai.anchor = anchor;
    ai.anchorSlack = slack;
    ai.anchorOffset = offset;
    if (!anchor && ai.currentState === 'following') ai.currentState = 'idle';
  }

  /** Population by kingdom id, used by the settlement system. */
  /** Residents grouped by village, for the political passes. */
  getEntitiesByVillage(): Map<string, Entity[]> {
    const grouped = new Map<string, Entity[]>();
    this.entities.forEach(entity => {
      if (!entity.villageId) return;
      const list = grouped.get(entity.villageId);
      if (list) list.push(entity);
      else grouped.set(entity.villageId, [entity]);
    });
    return grouped;
  }

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
