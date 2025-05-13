// src/utils/visualizationManager.ts
import * as THREE from 'three';
import type { Entity, Tile } from '../types/world';
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
import { ModelManager } from './modelManager';
import { ensureModelsLoaded } from './modelPreloader';

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
    useModel: boolean;  // Whether this entity uses a 3D model
  }>;
  private modelManager: ModelManager; // Manager for 3D models
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.particleSystem = new ParticleSystem(scene);
    this.terrainVisualizer = new TerrainVisualizer();
    this.spriteFactory = new AnimatedSpriteFactory();
    this.clock = new THREE.Clock();
    this.entityVisuals = new Map();
    
    // Initialize the ModelManager with the scene
    console.log('VisualizationManager: Initializing ModelManager');
    this.modelManager = new ModelManager(scene);
    
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
      // Check if this entity should use a 3D model (currently only humans)
      let useModel = entity.type === 'human';
      
      console.log(`Entity ${entity.id} of type ${entity.type}, useModel: ${useModel}`);
      
      if (useModel) {
        // Force use of models for human types
        console.log(`Attempting to create 3D model for entity ${entity.id}`);
        
        // Check if the ModelManager is properly initialized
        if (!this.modelManager) {
          console.error('ModelManager not initialized! Creating it now.');
          this.modelManager = new ModelManager(this.scene);
        }
        
        // Create a 3D model for this entity using the ModelManager
        const model = this.modelManager.createModelForEntity(entity);
        
        if (model) {
          console.log(`Successfully created 3D model for entity ${entity.id}`);
          // Store mesh reference in entity
          entity.mesh = model;
          
          // Store for tracking changes with model flag
          this.entityVisuals.set(entity.id, {
            entity,
            lastStatus: [...entity.status],
            lastAnimation: 'idle',
            useModel: true
          });
          
          // Always return after successfully creating a model to prevent sprite creation
          return;
        } else {
          // Fallback to sprite if model creation failed
          console.warn(`Failed to create model for entity type ${entity.type}, falling back to sprite`);
          useModel = false;
        }
      }
      
      // For non-model entities, use sprite as before
      const spriteData = getSpriteDataForEntity(entity.type);
      const sprite = createBillboardSprite(spriteData, 0, 0.5);
      const height = 0.5; // Some height above the ground
      sprite.position.set(entity.position.x, height, entity.position.y);
      
      this.scene.add(sprite);
      entity.mesh = sprite;
      entity.currentAnimation = 'idle';
      entity.animationFrame = 0;
      
      this.entityVisuals.set(entity.id, {
        entity,
        lastStatus: [...entity.status],
        lastAnimation: entity.currentAnimation || 'idle',
        useModel: false
      });
      
      return;
    }
    
    // Get visual tracking data
    const visualData = this.entityVisuals.get(entity.id);
    
    if (!visualData) {
      return; // No visual data found
    }
    
    // Check if using a 3D model or sprite
    if (visualData.useModel) {
      // Update model using the ModelManager
      this.modelManager.updateEntityModel(entity);
      
      // Update animation based on entity state
      const newAnimation = this.modelManager.getAnimationForEntityStatus(entity);
      if (newAnimation !== visualData.lastAnimation) {
        this.modelManager.playAnimation(entity, newAnimation);
        visualData.lastAnimation = newAnimation;
      }
      
      // Check if status changed for effects
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
          this.createFootstepEffect(entity);
        }
        
        if (entity.status.includes('attacking') && !visualData.lastStatus.includes('attacking')) {
          this.createAttackEffect(entity);
        }
      }
      
      // Update tracking data
      visualData.lastStatus = [...entity.status];
    } else {
      // Update sprite as before
      if (entity.mesh && entity.mesh instanceof THREE.Sprite) {
        entity.mesh.position.x = entity.position.x;
        entity.mesh.position.z = entity.position.y;
        
        const spriteData = getSpriteDataForEntity(entity.type);
        const animationName = getAnimationForEntityStatus(entity);
        
        entity.animationFrame = animateSprite(
          entity.mesh, 
          spriteData, 
          animationName, 
          deltaTime,
          entity.animationFrame || 0
        );
        
        entity.currentAnimation = animationName;
        applyStatusEffectsToSprite(entity.mesh, entity);
        updateSpriteDirection(entity.mesh, entity);
        
        const statusChanged = !this.areStatusArraysEqual(
          visualData.lastStatus,
          entity.status
        );
        
        if (statusChanged && currentVisualSettings.enableParticleEffects) {
          createStatusEffectParticles(entity, this.particleSystem);
          
          if (entity.status.includes('moving') && !visualData.lastStatus.includes('moving')) {
            this.createFootstepEffect(entity);
          }
          
          if (entity.status.includes('attacking') && !visualData.lastStatus.includes('attacking')) {
            this.createAttackEffect(entity);
          }
        }
        
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
    const biomeType = "grassland";
    
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
    if (!visualData || !visualData.entity.mesh) return;
    
    this.scene.remove(visualData.entity.mesh);
    
    if (visualData.entity.mesh instanceof THREE.Sprite) {
      // Clean up sprite-specific resources
      const material = visualData.entity.mesh.material as THREE.SpriteMaterial;
      if (material) {
        material.map?.dispose();
        material.dispose();
      }
    } else if (visualData.useModel) {
      // Clean up model-specific resources
      this.modelManager.removeEntityModel(entityId);
    }
    
    // Clear the mesh reference
    visualData.entity.mesh = null;
    
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
    const deltaTime = this.clock.getDelta();
    
    // Update particle system
    this.particleSystem.update();
    
    // Update water animation
    this.terrainVisualizer.updateWaterAnimation(performance.now() * 0.001);
    
    // Update animated sprites
    this.spriteFactory.update();
    
    // Update model animations
    this.modelManager.update(deltaTime);
    
    // Check for any human entities still using sprites and convert them to models if possible
    this.checkForModelUpgrades();
  }
  
  /**
   * Check for any human entities still using sprites and convert them to 3D models
   * This helps ensure entities are properly upgraded once models are loaded
   */
  private checkForModelUpgrades(): void {
    // We only do this occasionally, not every frame
    if (Math.random() > 0.05) return; // ~5% chance to run each frame
    
    this.entityVisuals.forEach((visualData, entityId) => {
      // Skip if already using model or not a human
      if (visualData.useModel || visualData.entity.type !== 'human') return;
      
      console.log(`Found human entity ${entityId} still using sprite, attempting to upgrade to 3D model`);
      
      // Try to create a model
      const model = this.modelManager.createModelForEntity(visualData.entity);
      if (model) {
        console.log(`Successfully upgraded entity ${entityId} to 3D model`);
        
        // Remove old sprite from scene
        if (visualData.entity.mesh) {
          this.scene.remove(visualData.entity.mesh);
          
          // Clean up sprite resources
          if (visualData.entity.mesh instanceof THREE.Sprite) {
            const material = visualData.entity.mesh.material as THREE.SpriteMaterial;
            if (material) {
              material.map?.dispose();
              material.dispose();
            }
          }
        }
        
        // Update with new model
        visualData.entity.mesh = model;
        visualData.useModel = true;
        visualData.lastAnimation = 'idle';
      }
    });
  }
}
