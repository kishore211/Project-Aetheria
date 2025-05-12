// src/utils/visualizationManager.ts
import * as THREE from 'three';
import { Entity, Tile } from '../types/world';
import { 
  getSpriteDataForEntity, 
  createBillboardSprite,
  animateSprite, 
  getAnimationForEntityStatus,
  applyStatusEffectsToSprite,
  updateSpriteDirection,
  createStatusEffectParticles
} from './spriteHandler';
import { ParticleSystem, ParticleType } from './particleSystem';
import { TerrainVisualizer } from './terrainVisualizer';
import { currentVisualSettings } from './visualSettings';
import { AnimatedSpriteFactory } from './animatedSpriteFactory';

/**
 * Manages visualization of entities and terrain using the pixelated aesthetic
 */
export class VisualizationManager {
  private scene: THREE.Scene;
  private particleSystem: ParticleSystem;
  private terrainVisualizer: TerrainVisualizer;
  private spriteFactory: AnimatedSpriteFactory;
  private clock: THREE.Clock;
  private entityVisuals: Map<string, {
    entity: Entity;
    lastStatus: string[];
    lastAnimation: string;
  }>;
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.particleSystem = new ParticleSystem(scene);
    this.terrainVisualizer = new TerrainVisualizer();
    this.spriteFactory = new AnimatedSpriteFactory();
    this.clock = new THREE.Clock();
    this.entityVisuals = new Map();
    
    // Preload textures
    this.particleSystem.preloadTextures();
  }
  
  /**
   * Initialize the terrain for the world
   */
  public initializeTerrain(tiles: Tile[][], tileSize: number, heightMultiplier: number): void {
    const terrainGroup = new THREE.Group();
    terrainGroup.name = 'terrain';
    
    // Process each tile
    for (let x = 0; x < tiles.length; x++) {
      for (let y = 0; y < tiles[0].length; y++) {
        const tile = tiles[x][y];
        
        // Create the base terrain tile
        const terrainMesh = this.terrainVisualizer.createTerrainTile(
          tile, 
          tileSize, 
          heightMultiplier
        );
        
        terrainGroup.add(terrainMesh);
        
        // Add water layer for water tiles
        if (tile.type.includes('water') || tile.type.includes('ocean')) {
          const waterMesh = this.terrainVisualizer.createWaterTile(tile, tileSize);
          terrainGroup.add(waterMesh);
        }
        
        // Add structure if present
        if (tile.structure) {
          const structureMesh = this.terrainVisualizer.createStructure(
            tile.structure.type,
            { x: tile.x * tileSize, y: tile.y * tileSize },
            tile.scaledHeight * heightMultiplier
          );
          terrainGroup.add(structureMesh);
        }
        
        // Add resource markers
        if (tile.resources && tile.resources.length > 0) {
          for (const resource of tile.resources) {
            // Only show discovered resources
            if (resource.discovered) {
              const resourceMarker = this.terrainVisualizer.createResourceMarker(
                resource.type,
                { x: tile.x * tileSize, y: tile.y * tileSize },
                tile.scaledHeight * heightMultiplier
              );
              terrainGroup.add(resourceMarker);
            }
          }
        }
      }
    }
    
    // Add terrain to scene
    this.scene.add(terrainGroup);
  }
  
  /**
   * Initialize or update the visualization for an entity
   */
  public updateEntityVisualization(entity: Entity, deltaTime: number): void {
    // If entity doesn't have a mesh yet, create one
    if (!entity.mesh) {
      // Get sprite data for entity type
      const spriteData = getSpriteDataForEntity(entity.type);
      
      // Create billboard sprite
      const sprite = createBillboardSprite(spriteData, 0, 0.5);
      
      // Position the sprite
      const height = 0.5; // Some height above the ground
      sprite.position.set(entity.position.x, height, entity.position.y);
      
      // Add to scene
      this.scene.add(sprite);
      
      // Store mesh reference in entity
      entity.mesh = sprite;
      
      // Set initial animation
      entity.currentAnimation = 'idle';
      entity.animationFrame = 0;
      
      // Store for tracking changes
      this.entityVisuals.set(entity.id, {
        entity,
        lastStatus: [...entity.status],
        lastAnimation: entity.currentAnimation
      });
    }
    
    // Update the sprite's position
    if (entity.mesh && entity.mesh instanceof THREE.Sprite) {
      entity.mesh.position.x = entity.position.x;
      entity.mesh.position.z = entity.position.y; // Y in world is Z in scene
      
      // Get sprite data and determine animation
      const spriteData = getSpriteDataForEntity(entity.type);
      const animationName = getAnimationForEntityStatus(entity);
      
      // Update animation frame
      entity.animationFrame = animateSprite(
        entity.mesh, 
        spriteData, 
        animationName, 
        deltaTime,
        entity.animationFrame || 0
      );
      
      entity.currentAnimation = animationName;
      
      // Apply status effects to sprite appearance
      applyStatusEffectsToSprite(entity.mesh, entity);
      
      // Update sprite facing based on movement direction
      updateSpriteDirection(entity.mesh, entity);
      
      // Get visual tracking data
      const visualData = this.entityVisuals.get(entity.id);
      
      if (visualData) {
        // Check if status changed
        const statusChanged = !this.areStatusArraysEqual(
          visualData.lastStatus,
          entity.status
        );
        
        // Create particles for status changes
        if (statusChanged && currentVisualSettings.enableParticleEffects) {
          // Generate particles based on status
          createStatusEffectParticles(entity, this.particleSystem);
          
          // Check for specific status changes
          if (entity.status.includes('moving') && !visualData.lastStatus.includes('moving')) {
            // Entity started moving - add footstep particles
            this.createFootstepEffect(entity);
          }
          
          if (entity.status.includes('attacking') && !visualData.lastStatus.includes('attacking')) {
            // Entity started attacking - add attack particles
            this.createAttackEffect(entity);
          }
        }
        
        // Update tracking data
        visualData.lastStatus = [...entity.status];
        visualData.lastAnimation = entity.currentAnimation;
      }
    }
  }
  
  /**
   * Compare status arrays to detect changes
   */
  private areStatusArraysEqual(arr1: string[], arr2: string[]): boolean {
    if (arr1.length !== arr2.length) return false;
    
    const set1 = new Set(arr1);
    for (const status of arr2) {
      if (!set1.has(status)) return false;
    }
    
    return true;
  }
  
  /**
   * Create footstep particles for moving entities
   */
  private createFootstepEffect(entity: Entity): void {
    if (!currentVisualSettings.enableParticleEffects) return;
    
    // Default to "grassland" if we don't know the actual terrain
    let biomeType = "grassland";
    
    // Note: We could determine actual biome type here if needed
    // by checking the terrain type at entity position
    
    // Create footstep effect
    this.particleSystem.createFootstepEffect(
      { x: entity.position.x, y: entity.position.y },
      biomeType
    );
  }
  
  /**
   * Create attack effect for entity combat
   */
  private createAttackEffect(entity: Entity): void {
    if (!currentVisualSettings.enableParticleEffects) return;
    
    // Calculate position slightly in front of entity
    const baseOffsetX = 0.3;
    const offsetY = 0;
    
    // Adjust offset based on entity facing direction
    let finalOffsetX = baseOffsetX;
    if (entity.mesh && entity.mesh instanceof THREE.Sprite) {
      // If sprite is flipped, offset should be in opposite direction
      if (entity.mesh.scale.x < 0) {
        finalOffsetX = -baseOffsetX;
      }
    }
    
    const effectPos = {
      x: entity.position.x + finalOffsetX,
      y: entity.position.y + offsetY
    };
    
    // Create attack particles
    this.particleSystem.createEffect(
      ParticleType.SPARKS,
      { x: effectPos.x, y: effectPos.y, z: 0.3 },
      0.5
    );
  }
  
  /**
   * Remove an entity's visualization
   */
  public removeEntityVisualization(entityId: string): void {
    const visualData = this.entityVisuals.get(entityId);
    if (visualData?.entity?.mesh) {
      this.scene.remove(visualData.entity.mesh);
      
      // If it's a sprite, dispose of materials
      if (visualData.entity.mesh instanceof THREE.Sprite) {
        const material = visualData.entity.mesh.material as THREE.SpriteMaterial;
        if (material) {
          material.map?.dispose();
          material.dispose();
        }
      }
      
      visualData.entity.mesh = null;
    }
    
    // Remove from tracking
    this.entityVisuals.delete(entityId);
  }
  
  /**
   * Update weather effects
   */
  public updateWeatherEffects(weatherType: string, centerPosition: { x: number; y: number }, radius: number): void {
    if (!currentVisualSettings.enableParticleEffects) return;
    
    // Create weather particles if appropriate
    if (['snow', 'rain', 'heavy_rain', 'thunderstorm', 'blizzard', 'sandstorm'].includes(weatherType)) {
      this.particleSystem.createWeatherEffect(weatherType, centerPosition, radius);
    }
  }
  
  /**
   * Update all visualizations
   */
  public update(): void {
    // Get current time for animations
    this.clock.getDelta(); // Update the clock
    
    // Update particle system
    this.particleSystem.update();
    
    // Update water animation
    this.terrainVisualizer.updateWaterAnimation(performance.now() * 0.001);
    
    // Update animated sprites
    this.spriteFactory.update();
  }
}
