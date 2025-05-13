// src/utils/modelHandler.ts
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

/**
 * Class for handling 3D models and animations
 * Handles loading, caching, and animating 3D models
 */
export class ModelHandler {
  private scene: THREE.Scene;
  private fbxLoader: FBXLoader;
  private modelCache: Map<string, THREE.Group>;
  private animationCache: Map<string, THREE.AnimationClip[]>;
  private activeAnimations: Map<string, {
    mixer: THREE.AnimationMixer,
    actions: Map<string, THREE.AnimationAction>,
    currentAction?: THREE.AnimationAction
  }>;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.fbxLoader = new FBXLoader();
    this.modelCache = new Map();
    this.animationCache = new Map();
    this.activeAnimations = new Map();
  }

  /**
   * Load a 3D model from an FBX file
   * @param modelId Unique identifier for the model
   * @param filePath Path to the FBX file
   * @returns Promise that resolves to the loaded model
   */
  public async loadModel(modelId: string, filePath: string): Promise<THREE.Group> {
    // Return cached model if available
    if (this.modelCache.has(modelId)) {
      return this.modelCache.get(modelId)!.clone();
    }

    try {
      // Load the model
      const model = await this.loadFBXModel(filePath);
      
      // Cache the original model
      this.modelCache.set(modelId, model);
      
      // Store any animations that come with the model
      if (model.animations && model.animations.length > 0) {
        this.animationCache.set(modelId, model.animations);
      }
      
      // Return a clone of the model
      return model.clone();
    } catch (error) {
      console.error(`Error loading model ${modelId} from ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Load an FBX model file
   * @param filePath Path to the FBX file
   * @returns Promise that resolves to the loaded model
   */
  private loadFBXModel(filePath: string): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      this.fbxLoader.load(
        filePath,
        (fbx) => {
          // Scale down the model to match the game world scale
          fbx.scale.set(0.01, 0.01, 0.01);
          
          // Configure for better rendering
          fbx.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              
              // Improve material rendering
              if (child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(material => {
                  if (material instanceof THREE.MeshStandardMaterial || 
                      material instanceof THREE.MeshPhongMaterial) {
                    material.needsUpdate = true;
                  }
                });
              }
            }
          });
          
          resolve(fbx);
        },
        // Progress callback
        (xhr) => {
          const percent = (xhr.loaded / xhr.total) * 100;
          console.log(`Loading model: ${percent.toFixed(0)}%`);
        },
        // Error callback
        (error) => {
          console.error('Error loading FBX model:', error);
          reject(error);
        }
      );
    });
  }

  /**
   * Creates an entity model with animation capabilities
   * @param modelId Unique identifier for the model type
   * @param entityId Unique identifier for the entity instance
   * @param filePath Path to the FBX model file
   * @returns Promise that resolves to the model object
   */
  public async createEntityModel(modelId: string, entityId: string, filePath: string): Promise<THREE.Group> {
    try {
      // Load and clone the model
      const model = await this.loadModel(modelId, filePath);
      
      // Create an animation mixer for this specific instance
      const mixer = new THREE.AnimationMixer(model);
      
      // Set up animation tracking for this entity
      this.activeAnimations.set(entityId, {
        mixer,
        actions: new Map()
      });
      
      // Set up animations if available
      const animations = this.animationCache.get(modelId);
      if (animations) {
        const actions = new Map<string, THREE.AnimationAction>();
        
        // Create animation actions for each clip
        animations.forEach((clip) => {
          const action = mixer.clipAction(clip);
          actions.set(clip.name, action);
        });
        
        // Store actions for this entity
        this.activeAnimations.get(entityId)!.actions = actions;
      }
      
      return model;
    } catch (error) {
      console.error(`Error creating entity model ${modelId} for ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * Play an animation on an entity model
   * @param entityId ID of the entity to animate
   * @param animationName Name of the animation to play
   * @param fadeTime Time to fade between animations
   * @param loop Whether the animation should loop
   * @returns Success status
   */
  public playAnimation(entityId: string, animationName: string, fadeTime = 0.2, loop = true): boolean {
    const entityAnimations = this.activeAnimations.get(entityId);
    if (!entityAnimations) {
      console.warn(`No animations found for entity ${entityId}`);
      return false;
    }
    
    const action = entityAnimations.actions.get(animationName);
    if (!action) {
      console.warn(`Animation "${animationName}" not found for entity ${entityId}`);
      return false;
    }
    
    // Set looping behavior
    action.loop = loop ? THREE.LoopRepeat : THREE.LoopOnce;
    
    // If already playing this animation, don't restart
    if (entityAnimations.currentAction === action) {
      return true;
    }
    
    // If there's a current animation, fade it out
    if (entityAnimations.currentAction) {
      entityAnimations.currentAction.fadeOut(fadeTime);
    }
    
    // Start the new animation
    action.reset().fadeIn(fadeTime).play();
    
    // Update the current action
    entityAnimations.currentAction = action;
    
    return true;
  }

  /**
   * Stop all animations for an entity
   * @param entityId ID of the entity
   */
  public stopAnimations(entityId: string): void {
    const entityAnimations = this.activeAnimations.get(entityId);
    if (!entityAnimations) return;
    
    // Stop all actions
    entityAnimations.actions.forEach(action => action.stop());
    entityAnimations.currentAction = undefined;
  }

  /**
   * Update all active animation mixers
   * @param deltaTime Time elapsed since last update
   */
  public update(deltaTime: number): void {
    // Update all active mixers
    this.activeAnimations.forEach(({ mixer }) => {
      if (mixer) {
        mixer.update(deltaTime);
      }
    });
  }

  /**
   * Clean up resources for an entity
   * @param entityId ID of the entity to clean up
   */
  public removeEntity(entityId: string): void {
    // Remove animation tracking
    this.activeAnimations.delete(entityId);
  }

  /**
   * Get the appropriate animation name based on entity status
   * Maps entity statuses to model animation names
   * @param entity The entity with status info
   */
  public getAnimationForEntityStatus(entity: { status: string[] }): string {
    // Default to idle if no status matches
    let animationName = 'Idle';
    
    // Priority-based status mapping
    if (entity.status.includes('dead')) {
      animationName = 'Death';
    } else if (entity.status.includes('attacking')) {
      animationName = 'Attack';
    } else if (entity.status.includes('moving')) {
      animationName = 'Walking';
    } else if (entity.status.includes('interacting')) {
      animationName = 'Using A Fax Machine';  // The specific animation we're implementing
    }
    
    return animationName;
  }
}
