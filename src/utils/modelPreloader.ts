// src/utils/modelPreloader.ts
// This utility helps preload 3D models to ensure they're ready when needed

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

interface PreloadedModel {
  model: THREE.Group;
  animations: THREE.AnimationClip[];
}

export class ModelPreloader {
  private static instance: ModelPreloader;
  private models: Map<string, PreloadedModel> = new Map();
  private isLoading = false;
  private loadPromise: Promise<boolean> | null = null;
  private fbxLoader: FBXLoader;

  private constructor() {
    this.fbxLoader = new FBXLoader();
    console.log('ModelPreloader instantiated');
  }

  /**
   * Get the singleton instance of the model preloader
   */
  public static getInstance(): ModelPreloader {
    if (!ModelPreloader.instance) {
      ModelPreloader.instance = new ModelPreloader();
    }
    return ModelPreloader.instance;
  }

  /**
   * Preload all required models
   */
  public preloadModels(): Promise<boolean> {
    if (this.loadPromise) {
      return this.loadPromise;
    }

    const modelList = [
      {
        id: 'human',
        path: './assets/models/human/Using A Fax Machine.fbx',
        scale: 0.005
      }
      // Add more models here as needed
    ];

    this.isLoading = true;

    // Create array of load promises
    const loadPromises = modelList.map(model => this.loadModel(model.id, model.path, model.scale));

    // Create a promise that will resolve when all models are loaded
    this.loadPromise = Promise.all(loadPromises)
      .then(() => {
        this.isLoading = false;
        console.log('All models preloaded successfully');
        console.log('Available models:', Array.from(this.models.keys()).join(', '));
        return true;
      })
      .catch(error => {
        console.error('Error preloading models:', error);
        this.isLoading = false;
        return false;
      });

    return this.loadPromise;
  }

  /**
   * Load a specific model
   */
  private loadModel(id: string, path: string, scale: number): Promise<void> {
    console.log(`Preloading model: ${id} from ${path}`);

    // Try several alternative paths to handle variations in how paths are constructed
    const pathVariations = [
      path,
      path.startsWith('./') ? path : `./${path}`,
      path.startsWith('/') ? path : `/${path}`,
      encodeURI(path)
    ];

    return new Promise((resolve, reject) => {
      const tryNextPath = (index = 0) => {
        if (index >= pathVariations.length) {
          reject(new Error(`Failed to load model ${id} after trying ${pathVariations.length} path variations`));
          return;
        }

        const currentPath = pathVariations[index];
        console.log(`Trying to load ${id} with path: ${currentPath}`);

        this.fbxLoader.load(
          currentPath,
          (model) => {
            console.log(`Successfully loaded model ${id} from ${currentPath}`);
            console.log(`Model has ${model.animations?.length || 0} animations`);
            
            // Apply scale
            model.scale.set(scale, scale, scale);
            
            // Store the model
            this.models.set(id, {
              model,
              animations: model.animations || []
            });
            
            resolve();
          },
          (xhr) => {
            if (xhr.lengthComputable) {
              const percent = (xhr.loaded / xhr.total) * 100;
              console.log(`Loading ${id}: ${percent.toFixed(0)}%`);
            }
          },
          (error) => {
            console.warn(`Failed to load ${id} from ${currentPath}:`, error);
            // Try the next path
            tryNextPath(index + 1);
          }
        );
      };

      tryNextPath();
    });
  }

  /**
   * Get a preloaded model
   * @param id Model identifier
   * @returns The model or null if not loaded
   */
  public getModel(id: string): PreloadedModel | null {
    return this.models.get(id) || null;
  }

  /**
   * Check if all models are loaded
   */
  public isLoaded(): boolean {
    return !this.isLoading && this.loadPromise !== null;
  }
}

// Helper function to preload models on demand
export function ensureModelsLoaded(): Promise<boolean> {
  const preloader = ModelPreloader.getInstance();
  return preloader.preloadModels();
}
