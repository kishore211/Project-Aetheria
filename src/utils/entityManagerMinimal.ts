// src/utils/entityManagerMinimal.ts
import * as THREE from 'three';
import { Tile, Entity, EntityType } from '../types/world';
import { createEntity, createEntityMesh, updateEntityMesh, EntityAI } from './entitySystemMinimal';

/**
 * EntityManager - Handles spawning, updating, and managing entities in the world
 */
export class EntityManager {
  private entities: Map<string, Entity> = new Map();
  private entityAIs: Map<string, EntityAI> = new Map();
  private tiles: Tile[][];
  private scene: THREE.Scene;
  onLifeEvent?: (message: string, kind: 'life' | 'death') => void;
  onEntityDeath?: (entity: Entity) => void;
  onEntitySpawn?: (entity: Entity) => void;
  
  // Lifecycle settings
  private reproductionProbability = 0.001; // Base chance per update
  private deathProbability = 0.0005; // Base chance per update
  private agingRate = 0.01; // Amount to age per update
  private entityPopulationDensity: 'low' | 'medium' | 'high' = 'medium';

  constructor(tiles: Tile[][], scene: THREE.Scene) {
    this.tiles = tiles;
    this.scene = scene;
  }

  /**
   * Spawn a new entity in the world
   */
  spawnEntity(type: EntityType, x: number, y: number): Entity | null {
    // Check valid coordinates
    if (x < 0 || x >= this.tiles.length || y < 0 || y >= this.tiles[0].length) {
      console.warn(`Cannot spawn entity at invalid position: ${x}, ${y}`);
      return null;
    }

    // Get the tile at the position
    const tile = this.tiles[x][y];

    // Check if the tile is suitable for this entity type
    if (!this.isSuitableTileForEntity(type, tile)) {
      console.warn(`Tile ${x}, ${y} with type ${tile.type} is not suitable for ${type}`);
      return null;
    }

    // Create the entity
    const entity = createEntity(type, x, y);
    
    // Create and position the mesh
    const mesh = createEntityMesh(entity);
    const worldX = (x - this.tiles.length / 2) * 0.5; // Assuming TILE_SIZE = 0.5
    const worldY = tile.scaledHeight;
    const worldZ = (y - this.tiles[0].length / 2) * 0.5;
    
    mesh.position.set(worldX, worldY, worldZ);
    
    // Add mesh to the scene
    this.scene.add(mesh);
    
    // Add entity to management systems
    entity.mesh = mesh;
    this.entities.set(entity.id, entity);
    
    // Create AI for this entity
    const entityAI = new EntityAI(entity);
    this.entityAIs.set(entity.id, entityAI);
    
    // Add to tile's entity list
    tile.entities.push(entity);
    
    this.onEntitySpawn?.(entity);
    return entity;
  }

  /**
   * Update all entities in the world
   */
  update(delta: number): void {
    // Process each entity
    this.entities.forEach((entity, id) => {
      const previousTileX = Math.floor(entity.position.x);
      const previousTileY = Math.floor(entity.position.y);

      // First, run the entity's AI
      const ai = this.entityAIs.get(id);
      if (ai) {
        ai.update(this.tiles, delta);
      }

      this.syncTileOccupancy(entity, previousTileX, previousTileY);

      // Then, handle lifecycle events
      this.processLifecycleEvents(entity, delta);
      
      // Update entity visual
      this.updateEntityVisual(entity, delta);
    });
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
      if (!newTile.entities.some(e => e.id === entity.id)) {
        newTile.entities.push(entity);
      }
    }
  }

  private isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.tiles.length && y >= 0 && y < this.tiles[0].length;
  }
  
  /**
   * Process lifecycle events for an entity
   */
  private processLifecycleEvents(entity: Entity, delta: number): void {
    // Skip processing for non-living entities
    if (['skeleton', 'zombie'].includes(entity.type)) return;
    
    // Aging
    entity.age += this.agingRate * delta;
    
    // Death by old age
    if (entity.age >= entity.maxAge) {
      this.killEntity(entity, 'old_age');
      return;
    }
    
    // Random death chance (disease, accidents, etc.)
    const deathRoll = Math.random();
    if (deathRoll < this.deathProbability * delta) {
      this.killEntity(entity, 'random');
      return;
    }
    
    // Health-based death
    if (entity.health <= 0) {
      this.killEntity(entity, 'health');
      return;
    }
    
    // Reproduction
    const canReproduce = entity.age >= entity.maxAge * 0.2 && entity.age <= entity.maxAge * 0.8;
    const populationMultiplier = this.getPopulationDensityMultiplier();
    
    if (canReproduce && Math.random() < this.reproductionProbability * delta * populationMultiplier) {
      this.reproduceEntity(entity);
    }
  }
  
  /**
   * Have an entity reproduce, creating a new entity of the same type
   */
  private reproduceEntity(entity: Entity): void {
    // Check if we already have too many entities of this type
    const entityCount = this.getEntityCountByType(entity.type);
    const maxCount = this.getMaxEntityCount(entity.type);
    
    if (entityCount >= maxCount) {
      return; // Skip reproduction if at capacity
    }
    
    const { x, y } = entity.position;
    
    // Try to find a nearby suitable tile to place the new entity
    const possibleTiles = this.getNearbyTiles(x, y, 2);
    const suitableTiles = possibleTiles.filter(t => this.isSuitableTileForEntity(entity.type, t));
    
    if (suitableTiles.length === 0) return; // No suitable place to reproduce
    
    // Choose a random suitable tile
    const chosenTile = suitableTiles[Math.floor(Math.random() * suitableTiles.length)];
    
    // Create new entity
    const child = this.spawnEntity(entity.type, chosenTile.x, chosenTile.y);
    if (child) {
      this.onLifeEvent?.(`${child.name} the ${child.type} was born`, 'life');
    }
    
    // Add status effect to parent
    entity.status.push('reproduced');
    // Remove the status after some time
    setTimeout(() => {
      const index = entity.status.indexOf('reproduced');
      if (index !== -1) entity.status.splice(index, 1);
    }, 5000);
  }
  
  /**
   * Kill an entity and handle its removal
   */
  killEntity(entity: Entity, cause: 'old_age' | 'health' | 'random' | 'divine'): void {
    const { x, y } = entity.position;
    
    // Find the tile this entity is on
    if (x >= 0 && x < this.tiles.length && y >= 0 && y < this.tiles[0].length) {
      const tile = this.tiles[Math.floor(x)][Math.floor(y)];
      
      // Remove from tile
      const entityIndex = tile.entities.findIndex(e => e.id === entity.id);
      if (entityIndex !== -1) {
        tile.entities.splice(entityIndex, 1);
      }
    }
    
    // Remove from management systems
    this.entities.delete(entity.id);
    this.entityAIs.delete(entity.id);
    
    // Remove visual from scene and free GPU resources
    if (entity.mesh) {
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

    this.onEntityDeath?.(entity);
    const causeText = cause === 'old_age' ? 'died of old age'
      : cause === 'divine' ? 'was struck down by divine power'
      : cause === 'health' ? 'perished'
      : 'died suddenly';
    this.onLifeEvent?.(`${entity.name} the ${entity.type} ${causeText}`, 'death');
  }

  /** Damage every entity within a tile radius; returns kill count. */
  damageArea(centerX: number, centerY: number, radius: number, damage: number): number {
    let kills = 0;
    const victims: Entity[] = [];
    this.entities.forEach(entity => {
      const dx = entity.position.x - centerX;
      const dy = entity.position.y - centerY;
      if (Math.sqrt(dx * dx + dy * dy) <= radius) victims.push(entity);
    });
    for (const victim of victims) {
      victim.health -= damage;
      if (!victim.status.includes('wounded')) victim.status.push('wounded');
      if (victim.health <= 0) {
        this.killEntity(victim, 'divine');
        kills++;
      }
    }
    return kills;
  }

  /** Heal every entity within a tile radius. */
  healArea(centerX: number, centerY: number, radius: number, amount: number): number {
    let healed = 0;
    this.entities.forEach(entity => {
      const dx = entity.position.x - centerX;
      const dy = entity.position.y - centerY;
      if (Math.sqrt(dx * dx + dy * dy) <= radius) {
        entity.health = Math.min(entity.maxHealth, entity.health + amount);
        entity.needs.hunger = 1.0;
        entity.needs.thirst = 1.0;
        const woundedIndex = entity.status.indexOf('wounded');
        if (woundedIndex !== -1) entity.status.splice(woundedIndex, 1);
        if (!entity.status.includes('blessed')) entity.status.push('blessed');
        healed++;
      }
    });
    return healed;
  }

  /** Total number of living entities. */
  getPopulation(): number {
    return this.entities.size;
  }

  /** Remove every entity and dispose meshes (world reset). */
  clear(): void {
    this.entities.forEach(entity => {
      if (entity.mesh) {
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
    });
    this.entities.clear();
    this.entityAIs.clear();
  }
  
  /**
   * Set the population density setting
   */
  setPopulationDensity(density: 'low' | 'medium' | 'high'): void {
    this.entityPopulationDensity = density;
    
    // Update probabilities based on density
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
  
  /**
   * Get population density multiplier for calculations
   */
  private getPopulationDensityMultiplier(): number {
    switch (this.entityPopulationDensity) {
      case 'low': return 0.5;
      case 'medium': return 1.0;
      case 'high': return 2.0;
      default: return 1.0;
    }
  }
  
  /**
   * Get the number of entities of a specific type
   */
  private getEntityCountByType(type: EntityType): number {
    let count = 0;
    this.entities.forEach(entity => {
      if (entity.type === type) count++;
    });
    return count;
  }
  
  /**
   * Get the maximum allowed entities of a specific type based on density setting
   */
  private getMaxEntityCount(type: EntityType): number {
    // Base values
    const baseMaxCounts: Record<EntityType, number> = {
      human: 100, elf: 80, dwarf: 60, orc: 70,
      wolf: 30, bear: 15, deer: 40, rabbit: 60, bird: 80, fish: 100,
      dragon: 3, demon: 5, zombie: 50, skeleton: 70, elemental: 10, bandit: 25
    };
    
    // Default value for any missing types
    const baseMax = baseMaxCounts[type] || 50;
    
    // Adjust based on density
    switch (this.entityPopulationDensity) {
      case 'low': return Math.floor(baseMax * 0.5);
      case 'medium': return baseMax;
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
  
  /**
   * Get nearby tiles within a certain range
   */
  private getNearbyTiles(x: number, y: number, range: number): Tile[] {
    const nearby: Tile[] = [];
    
    // Get integer coordinates
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    
    for (let dx = -range; dx <= range; dx++) {
      for (let dy = -range; dy <= range; dy++) {
        // Skip the center tile
        if (dx === 0 && dy === 0) continue;
        
        const nx = ix + dx;
        const ny = iy + dy;
        
        // Bounds check
        if (nx >= 0 && nx < this.tiles.length && ny >= 0 && ny < this.tiles[0].length) {
          nearby.push(this.tiles[nx][ny]);
        }
      }
    }
    
    return nearby;
  }
  
  /**
   * Update the visual representation of an entity
   */
  private updateEntityVisual(entity: Entity, delta: number): void {
    if (!entity.mesh) return;
    
    // Get the tile at the entity's position
    const { x, y } = entity.position;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    
    // Bounds check
    if (ix < 0 || ix >= this.tiles.length || iy < 0 || iy >= this.tiles[0].length) {
      return;
    }
    
    const tile = this.tiles[ix][iy];
    
    // Position the mesh correctly
    const worldX = (x - this.tiles.length / 2) * 0.5;
    const worldY = tile.scaledHeight;
    const worldZ = (y - this.tiles[0].length / 2) * 0.5;
    
    // Use lerp for smooth movement if there was a previous position
    if (entity.lastPosition) {
      entity.mesh.position.x = THREE.MathUtils.lerp(entity.mesh.position.x, worldX, 0.1);
      entity.mesh.position.z = THREE.MathUtils.lerp(entity.mesh.position.z, worldZ, 0.1);
    } else {
      entity.mesh.position.x = worldX;
      entity.mesh.position.z = worldZ;
    }
    
    // Always update Y to match the terrain
    entity.mesh.position.y = worldY;
    
    // Update the mesh appearance based on health, status, etc.
    updateEntityMesh(entity, delta);
  }
  
  /**
   * Get all entities
   */
  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }
  
  /**
   * Get entity by ID
   */
  getEntityById(id: string): Entity | undefined {
    return this.entities.get(id);
  }
}
