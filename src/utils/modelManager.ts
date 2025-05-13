// src/utils/modelManager.ts
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import type { Entity } from '../types/world';
import { ModelPreloader, ensureModelsLoaded } from './modelPreloader';

/**
 * Interface for model data
 */
export interface ModelData {
  path: string;                 // Path to the model file
  scale: number;                // Scale factor for the model
  animations?: Record<string, string>; // Maps animation name to clip name
  yOffset?: number;             // Y-axis offset for positioning
  rotationOffset?: number;      // Rotation offset in radians
}

/**
 * ModelManager handles loading, instancing, and animating 3D models
 */
export class ModelManager {
  private scene: THREE.Scene;
  private models: Map<string, THREE.Group> = new Map();
  private animations: Map<string, THREE.AnimationClip[]> = new Map();
  private mixers: Map<string, THREE.AnimationMixer> = new Map();
  private fbxLoader: FBXLoader;
  private clock: THREE.Clock;
  private modelLoading: Map<string, Promise<THREE.Group>> = new Map();
  
  // Default mapping of entity types to model data
  private modelDataMap: Map<string, ModelData> = new Map([
    ['human', {
      path: './assets/models/human/Using A Fax Machine.fbx', // Use relative path without encoding
      scale: 0.0005, // Reduced scale by 10x to make humans appropriately sized
      animations: {
        'idle': 'Idle',
        'walking': 'Walking',
        'running': 'Running',
        'attacking': 'Attack'
      },
      yOffset: 0.15, // Slightly elevate human models to avoid z-fighting with the terrain
      rotationOffset: Math.PI
    }]
  ]);
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.clock = new THREE.Clock();
    this.fbxLoader = new FBXLoader();
    
    // Try to use preloaded models first, then load models if needed
    this.usePreloadedModelsOrLoad();
  }
  
  /**
   * Load all models defined in the modelDataMap
   */
  private async loadModels(): Promise<void> {
    console.log("ModelManager: Starting to load all models");
    
    // First create placeholder models immediately for all entity types
    // This ensures we have something to show even while the real models are loading
    for (const entityType of this.modelDataMap.keys()) {
      this.createPlaceholderModel(entityType);
      console.log(`Created placeholder model for ${entityType}`);
    }
    
    // Then try to load the actual FBX models
    for (const [entityType, modelData] of this.modelDataMap.entries()) {
      try {
        console.log(`Loading actual model for ${entityType} from ${modelData.path}`);
        await this.loadModelFromFBX(entityType, modelData);
      } catch (error) {
        console.error(`Failed to load model for ${entityType}, using placeholder:`, error);
        // We already have a placeholder model created above
      }
    }
    
    console.log(`Model loading complete. Available models: ${Array.from(this.models.keys()).join(', ')}`);
  }
  
  /**
   * Load a model from an FBX file
   */
  private loadModelFromFBX(entityType: string, modelData: ModelData): Promise<THREE.Group> {
    // Debug log to track loading attempts
    console.log(`Attempting to load model for ${entityType} from ${modelData.path}`);
    
    // Check if we're already loading this model
    if (this.modelLoading.has(entityType)) {
      const loadingPromise = this.modelLoading.get(entityType);
      if (loadingPromise) {
        console.log(`Already loading model for ${entityType}, reusing promise`);
        return loadingPromise;
      }
    }
    
    // Try several path variations to handle different path formats
    const possiblePaths = [
      modelData.path,                                    // Original path (relative)
      modelData.path.startsWith('./') ? modelData.path : `./${modelData.path}`,  // Ensure ./ prefix
      modelData.path.startsWith('/') ? modelData.path : `/${modelData.path}`,    // Ensure / prefix
      encodeURI(modelData.path),                         // URL encoded
      `/assets/models/${entityType}/Using A Fax Machine.fbx`,  // Direct path with spaces
      `/assets/models/${entityType}/Using%20A%20Fax%20Machine.fbx` // Direct path with encoding
    ];
    
    // Create a new loading promise
    const loadingPromise = new Promise<THREE.Group>((resolve, reject) => {
      console.log(`Will try these paths: ${possiblePaths.join(', ')}`);
      
      // Function to try loading with different paths
      const tryLoadWithPath = (pathIndex = 0) => {
        if (pathIndex >= possiblePaths.length) {
          console.error('Failed to load model after trying all path variations');
          reject(new Error('Failed to load model after trying all path variations'));
          return;
        }
        
        const currentPath = possiblePaths[pathIndex];
        console.log(`Trying path variation #${pathIndex+1}: ${currentPath}`);
        
        this.fbxLoader.load(
          currentPath,
          (fbx) => {
            // Log successful loading
            console.log(`Successfully loaded model for ${entityType} using path: ${currentPath}`);
            console.log(`Model has ${fbx.animations ? fbx.animations.length : 0} animations`);
            
            // Apply scale from model data
            fbx.scale.set(modelData.scale, modelData.scale, modelData.scale);
            
            // Configure model for better rendering
            fbx.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                
                // Improve material rendering
                if (child.material) {
                  const materials = Array.isArray(child.material) ? child.material : [child.material];
                  for (const material of materials) {
                    if (material instanceof THREE.MeshStandardMaterial || 
                        material instanceof THREE.MeshPhongMaterial) {
                      material.needsUpdate = true;
                    }
                  }
                }
              }
            });
            
            // Store model and animations
            this.models.set(entityType, fbx);
            
            // Store animations if available
            if (fbx.animations && fbx.animations.length > 0) {
              this.animations.set(entityType, fbx.animations);
              console.log(`Model ${entityType} loaded with ${fbx.animations.length} animations`);
            } else {
              console.warn(`Model loaded but no animations found for ${entityType}`);
            }
            
            resolve(fbx);
          },
          // Progress callback
          (xhr) => {
            if (xhr.lengthComputable) {
              const percent = (xhr.loaded / xhr.total) * 100;
              console.log(`Loading ${entityType} model: ${percent.toFixed(0)}%`);
            } else {
              console.log(`Loading ${entityType} model... (size unknown)`);
            }
          },
          // Error callback
          (error) => {
            console.warn(`Error loading model with path ${currentPath}:`, error);
            // Try next path variation
            tryLoadWithPath(pathIndex + 1);
          }
        );
      };
      
      // Start trying paths
      tryLoadWithPath();
    });
    
    // Store the loading promise
    this.modelLoading.set(entityType, loadingPromise);
    
    // Handle final resolution/rejection
    loadingPromise.then(
      () => console.log(`Model loading for ${entityType} completed successfully`),
      (error) => {
        console.error(`All loading attempts for ${entityType} failed:`, error);
        console.log(`Ensuring placeholder model is available for ${entityType}`);
        this.createPlaceholderModel(entityType);
      }
    );
    
    return loadingPromise;
  }
  
  /**
   * Create placeholder model for an entity type as fallback
   */
  private createPlaceholderModel(entityType: string): void {
    console.log(`Creating placeholder model for ${entityType}`);
    
    if (entityType === 'human') {
      // Create a simple placeholder for human entities
      const humanGroup = new THREE.Group();
      humanGroup.name = 'placeholder-human-model';
      
      // Create a simple mannequin-like human shape
      const headGeometry = new THREE.SphereGeometry(0.1, 8, 8);
      const bodyGeometry = new THREE.CylinderGeometry(0.1, 0.15, 0.4, 8);
      const legGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
      const armGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.25, 8);
      
      const material = new THREE.MeshStandardMaterial({ color: 0x3080ff });
      
      // Create body parts
      const head = new THREE.Mesh(headGeometry, material);
      const body = new THREE.Mesh(bodyGeometry, material);
      const leftLeg = new THREE.Mesh(legGeometry, material);
      const rightLeg = new THREE.Mesh(legGeometry, material);
      const leftArm = new THREE.Mesh(armGeometry, material);
      const rightArm = new THREE.Mesh(armGeometry, material);
      
      // Position body parts
      head.position.y = 0.5;
      body.position.y = 0.25;
      leftLeg.position.set(-0.08, -0.05, 0);
      rightLeg.position.set(0.08, -0.05, 0);
      leftArm.position.set(-0.2, 0.25, 0);
      rightArm.position.set(0.2, 0.25, 0);
      
      // Rotate the arms slightly
      leftArm.rotation.z = Math.PI / 3;
      rightArm.rotation.z = -Math.PI / 3;
      
      // Add all parts to the group
      humanGroup.add(head, body, leftLeg, rightLeg, leftArm, rightArm);
      
      // Add a debug indicator - a small red cube on top
      const debugCube = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.05, 0.05),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      );
      debugCube.position.set(0, 0.6, 0); // Place on top of the head
      humanGroup.add(debugCube);
      
      // Store the placeholder model
      this.models.set(entityType, humanGroup);
      
      // Create dummy animations
      this.createPlaceholderAnimations(entityType);
    }
  }
  
  /**
   * Create placeholder animations for fallback models
   */
  private createPlaceholderAnimations(entityType: string): void {
    // Create a simple idle animation (bobbing up and down)
    const idleTrack = new THREE.NumberKeyframeTrack(
      '.position[y]', // The property to animate
      [0, 1, 2], // Keyframe times
      [0, 0.05, 0], // Y position values for bobbing effect
      THREE.InterpolateSmooth
    );
    
    // Create animation clip
    const idleClip = new THREE.AnimationClip('Idle', 2, [idleTrack]);
    
    // Create a walking animation (bobbing up and down faster)
    const walkTrack = new THREE.NumberKeyframeTrack(
      '.position[y]', 
      [0, 0.5, 1], 
      [0, 0.05, 0],
      THREE.InterpolateSmooth
    );
    
    const walkClip = new THREE.AnimationClip('Walking', 1, [walkTrack]);
    
    // Store the animations
    this.animations.set(entityType, [idleClip, walkClip]);
  }
  
  /**
   * Create a 3D model instance for an entity
   */
  public createModelForEntity(entity: Entity): THREE.Object3D | null {
    console.log(`ModelManager: Creating model for entity ${entity.id} of type ${entity.type}`);
    
    // Check if we have a model for this entity type
    const originalModel = this.models.get(entity.type);
    if (!originalModel) {
      console.warn(`No model available for entity type: ${entity.type}. Available models: ${Array.from(this.models.keys()).join(', ')}`);
      
      // If models haven't loaded yet but we're in the process of loading them,
      // create a placeholder model for now
      if (this.modelLoading.has(entity.type)) {
        console.log(`Model for ${entity.type} is still loading, creating placeholder`);
        this.createPlaceholderModel(entity.type);
        const placeholderModel = this.models.get(entity.type);
        if (placeholderModel) {
          const model = placeholderModel.clone(true);
          const mixer = new THREE.AnimationMixer(model);
          this.mixers.set(entity.id, mixer);
          return model;
        }
      }
      
      return null;
    }
    
    console.log(`Found model for ${entity.type}, creating instance`);
    
    // Clone the model for this entity
    const model = originalModel.clone(true);
    
    // Create an AnimationMixer for this instance
    const mixer = new THREE.AnimationMixer(model);
    this.mixers.set(entity.id, mixer);
    
    // Get model data
    const modelData = this.modelDataMap.get(entity.type);
    if (modelData) {
      // Apply any offsets from model data
      if (modelData.yOffset !== undefined) {
        model.position.y = modelData.yOffset;
      }
    }
    
    // Position the model at the entity's position
    model.position.set(entity.position.x, model.position.y, entity.position.y);
    
    // Add the model to the scene
    this.scene.add(model);
    
    // Start with idle animation
    this.playAnimation(entity, 'idle');
    
    return model;
  }
  
  /**
   * Play an animation on an entity's model
   */
  public playAnimation(entity: Entity, animationName: string): void {
    if (!entity.mesh) return;
    
    // Get the animation mixer for this entity
    const mixer = this.mixers.get(entity.id);
    if (!mixer) return;
    
    // Get model data for this entity type
    const modelData = this.modelDataMap.get(entity.type);
    if (!modelData || !modelData.animations) return;
    
    // Map the generic animation name to the specific clip name for this model
    const clipName = modelData.animations[animationName] || animationName;
    
    // Get the animations for this entity type
    const animations = this.animations.get(entity.type);
    if (!animations || animations.length === 0) return;
    
    // Find the animation clip
    let clip = animations.find(animation => animation.name === clipName);
    
    // If specific clip not found, use idle as fallback
    if (!clip) {
      const fallbackClip = modelData.animations.idle || 'Idle';
      clip = animations.find(animation => animation.name === fallbackClip);
      
      // If still no clip, use the first available
      if (!clip && animations.length > 0) {
        clip = animations[0];
      }
    }
    
    if (!clip) return;
    
    // Stop all current actions
    mixer.stopAllAction();
    
    // Play the animation with crossfade
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
    action.fadeIn(0.3).play();
    
    // Update the entity's current animation
    entity.currentAnimation = animationName;
  }
  
  /**
   * Update entity model position and rotation
   */
  public updateEntityModel(entity: Entity): void {
    if (!entity.mesh) return;
    
    // Update position
    entity.mesh.position.x = entity.position.x;
    entity.mesh.position.z = entity.position.y; // Y in world is Z in scene
    
    // Get model data for rotation offset
    const modelData = this.modelDataMap.get(entity.type);
    const rotationOffset = modelData?.rotationOffset || Math.PI;
    
    // Update rotation if entity has moved
    if (entity.lastPosition) {
      const dx = entity.position.x - entity.lastPosition.x;
      const dy = entity.position.y - entity.lastPosition.y;
      
      // Only update rotation if there's significant movement
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        // Calculate angle
        const angle = Math.atan2(dy, dx);
        
        // Smooth rotation (interpolate current to target)
        const currentRotation = entity.mesh.rotation.y;
        const targetRotation = angle + rotationOffset;
        entity.mesh.rotation.y = currentRotation + (targetRotation - currentRotation) * 0.1;
      }
    }
  }
  
  /**
   * Get the appropriate animation based on entity status
   */
  public getAnimationForEntityStatus(entity: Entity): string {
    if (entity.status.includes('attacking')) {
      return 'attacking';
    } 
    
    if (entity.status.includes('running')) {
      return 'running';
    } 
    
    if (entity.status.includes('moving')) {
      return 'walking';
    }
    
    return 'idle';
  }
  
  /**
   * Remove a model instance
   */
  public removeEntityModel(entityId: string): void {
    this.mixers.delete(entityId);
  }
  
  /**
   * Update animation mixers
   */
  public update(deltaTime?: number): void {
    const delta = deltaTime || this.clock.getDelta();
    
    // Update all animation mixers
    for (const mixer of this.mixers.values()) {
      mixer.update(delta);
    }
  }
  
  /**
   * Try to use preloaded models from ModelPreloader, or load models directly
   */
  private usePreloadedModelsOrLoad(): void {
    const preloader = ModelPreloader.getInstance();
    
    // Check if models are already loaded by the preloader
    if (preloader.isLoaded()) {
      console.log('Using pre-loaded models from ModelPreloader');
      this.initializeFromPreloader();
    } else {
      // If not preloaded, start preloading and use models when ready
      console.log('Models not preloaded, starting preload process');
      ensureModelsLoaded().then(() => {
        console.log('Preloading complete, now initializing models');
        this.initializeFromPreloader();
      }).catch(error => {
        console.error('Preloading failed, falling back to direct loading', error);
        // Fallback to direct loading
        this.loadModels();
      });
      
      // Create placeholder models right away while waiting for real models
      for (const entityType of this.modelDataMap.keys()) {
        this.createPlaceholderModel(entityType);
      }
    }
  }
  
  /**
   * Initialize models from the ModelPreloader
   */
  private initializeFromPreloader(): void {
    const preloader = ModelPreloader.getInstance();
    
    for (const entityType of this.modelDataMap.keys()) {
      // Try to get the preloaded model
      const preloadedModel = preloader.getModel(entityType);
      
      if (preloadedModel) {
        console.log(`Using preloaded model for ${entityType}`);
        
        // Store the model
        this.models.set(entityType, preloadedModel.model);
        
        // Store animations if available
        if (preloadedModel.animations.length > 0) {
          this.animations.set(entityType, preloadedModel.animations);
          console.log(`Loaded ${preloadedModel.animations.length} animations for ${entityType}`);
        } else {
          console.warn(`No animations found in preloaded model for ${entityType}`);
          // Create placeholder animations as fallback
          this.createPlaceholderAnimations(entityType);
        }
      } else {
        console.warn(`No preloaded model found for ${entityType}, creating placeholder`);
        this.createPlaceholderModel(entityType);
      }
    }
  }
}
