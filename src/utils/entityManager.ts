// src/utils/entityManager.ts
import * as THREE from 'three';
import type { Tile, Entity, EntityType } from '../types/world';
import { createEntity } from './entitySystem';
import type { VisualizationManager } from './visualizationManager';
import { EntityAI } from './entitySystem';

/**
 * EntityManager - Handles spawning, updating, and managing entities in the world
 */
export class EntityManager {
  private entities: Map<string, Entity> = new Map();
  private entityAIs: Map<string, EntityAI> = new Map();
  private tiles: Tile[][];
  private scene: THREE.Scene;
  private lastUpdate = 0;
  private entityPopulationDensity: 'low' | 'medium' | 'high' = 'medium';
  private visualizationManager: VisualizationManager;
  
  // Lifecycle settings
  private reproductionProbability = 0.001; // Base chance per update
  private deathProbability = 0.0005; // Base chance per update
  private agingRate = 0.01; // Amount to age per update

  constructor(tiles: Tile[][], scene: THREE.Scene, visualizationManager: VisualizationManager) {
    this.tiles = tiles;
    this.scene = scene;
    this.visualizationManager = visualizationManager;
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
    
    // Add entity to management systems first (before visualization)
    this.entities.set(entity.id, entity);
    
    // Create AI for this entity
    const entityAI = new EntityAI(entity);
    this.entityAIs.set(entity.id, entityAI);
    
    // Add to tile's entity list
    tile.entities.push(entity);
    
    // Let visualization manager create the visual representation
    this.visualizationManager.updateEntityVisualization(entity, 0);
    
    return entity;
  }

  /**
   * Update all entities in the world
   */
  update(delta: number): void {
    const currentTime = Date.now();
    this.lastUpdate = currentTime;
    
    // Process each entity
    for (const [id, entity] of this.entities.entries()) {
      // First, run the entity's AI
      const ai = this.entityAIs.get(id);
      if (ai) {
        ai.update(this.tiles, delta);
      }

      // Then, handle lifecycle events
      this.processLifecycleEvents(entity, delta);
      
      // Update entity visual using visualization manager
      this.visualizationManager.updateEntityVisualization(entity, delta);
    }
  }
  
  /**
   * Process lifecycle events for an entity
   */
  private processLifecycleEvents(entity: Entity, delta: number): void {
    // Skip processing for non-living entities
    if (['skeleton', 'zombie'].includes(entity.type)) return;
    
    // Get entity current tile
    const { x, y } = entity.position;
    const currentTile = this.tiles[x][y];
    
    // Aging
    const agingAmount = this.agingRate * delta;
    entity.age += agingAmount;
    
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
    this.spawnEntity(entity.type, chosenTile.x, chosenTile.y);
    
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
  private killEntity(entity: Entity, cause: 'old_age' | 'health' | 'random'): void {
    const { x, y } = entity.position;
    const tile = this.tiles[x][y];
    
    // Remove entity visualization
    this.visualizationManager.removeEntityVisualization(entity.id);
    
    // Remove from management systems
    this.entities.delete(entity.id);
    this.entityAIs.delete(entity.id);
    
    // Remove from tile
    const entityIndex = tile.entities.findIndex(e => e.id === entity.id);
    if (entityIndex !== -1) {
      tile.entities.splice(entityIndex, 1);
    }
    
    // Handle remains or create resources from the death
    if (cause === 'old_age' || cause === 'health') {
      // Maybe add some resources or create a corpse entity in the future
    }
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
    for (const entity of this.entities.values()) {
      if (entity.type === type) count++;
    }
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
   * Check if a tile is suitable for a specific entity type
   */
  private isSuitableTileForEntity(type: EntityType, tile: Tile): boolean {
    // Base check - non-walkable tiles aren't suitable for any entity
    if (tile.walkable === false) return false;
    
    // Deep water is only suitable for fish
    if (tile.type === 'deep_ocean' || tile.type === 'ocean') {
      return type === 'fish';
    }
    
    // Shallow water is suitable for amphibious entities and fish
    if (tile.type === 'shallow_water' || tile.type === 'river' || tile.type === 'lake') {
      return ['fish'].includes(type);
    }
    
    // Specific biome preferences for intelligent races
    if (type === 'elf') {
      return tile.type.includes('forest');
    }
    
    if (type === 'dwarf') {
      return tile.type === 'mountains' || tile.type === 'hills';
    }
    
    if (type === 'orc') {
      return tile.type === 'badlands' || tile.type === 'savanna';
    }
    
    // Animals have their biome preferences
    if (type === 'wolf') {
      return tile.type.includes('forest') || tile.type === 'taiga';
    }
    
    if (type === 'bear') {
      return tile.type.includes('forest') || tile.type === 'taiga' || tile.type === 'mountains';
    }
    
    if (type === 'deer') {
      return tile.type.includes('forest') || tile.type === 'grassland';
    }
    
    if (type === 'rabbit') {
      return tile.type === 'grassland';
    }
    
    if (type === 'bird') {
      return tile.type.includes('forest') || tile.type === 'grassland';
    }
    
    // For monsters
    if (type === 'dragon') {
      return tile.type === 'mountains' || tile.type === 'volcanic';
    }
    
    if (type === 'demon') {
      return tile.type === 'volcanic' || tile.type === 'corrupted';
    }
    
    if (type === 'zombie' || type === 'skeleton') {
      return tile.type === 'corrupted' || Math.random() < 0.2; // Can spawn anywhere with low probability
    }
    
    // Default - most entities can go on most land tiles
    return tile.height > 0.25; // Basic check that it's not water
  }
  
  /**
   * Get nearby tiles within a certain range
   */
  private getNearbyTiles(x: number, y: number, range: number): Tile[] {
    const nearby: Tile[] = [];
    
    for (let dx = -range; dx <= range; dx++) {
      for (let dy = -range; dy <= range; dy++) {
        // Skip the center tile
        if (dx === 0 && dy === 0) continue;
        
        const nx = x + dx;
        const ny = y + dy;
        
        // Bounds check
        if (nx >= 0 && nx < this.tiles.length && ny >= 0 && ny < this.tiles[0].length) {
          nearby.push(this.tiles[nx][ny]);
        }
      }
    }
    
    return nearby;
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
