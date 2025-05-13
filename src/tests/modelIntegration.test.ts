// Test script to verify 3D model integration

import * as THREE from 'three';
import { EntityManager } from '../utils/entityManager';
import { VisualizationManager } from '../utils/visualizationManager';
import { ModelManager } from '../utils/modelManager';
import { ensureModelsLoaded } from '../utils/modelPreloader';
import type { Tile } from '../types/world';

/**
 * Simple test function to verify the 3D model integration
 * This is meant to be used as a reference, not as an automated test
 */
async function testModelIntegration(): Promise<void> {
  console.log('Starting 3D model integration test');
  
  // Create a scene
  const scene = new THREE.Scene();
  
  // Create dummy tiles
  const tilesData: Tile[][] = Array(10).fill(0).map((_, x) => 
    Array(10).fill(0).map((_, y) => ({
      x, y,
      height: 0.5,
      scaledHeight: 1.0,
      moisture: 0.5,
      temperature: 0.5,
      fertility: 0.5,
      type: 'grassland',
      population: 0,
      resources: [],
      structure: null,
      entities: [],
      isOnFire: false,
      walkable: true,
    }))
  );
  
  // Ensure models are loaded first
  console.log('Preloading models...');
  try {
    await ensureModelsLoaded();
    console.log('Models preloaded successfully');
  } catch (error) {
    console.error('Failed to preload models:', error);
  }
  
  // Create visualization manager
  console.log('Creating VisualizationManager');
  const visualizationManager = new VisualizationManager(scene);
  
  // Create entity manager with visualization manager
  console.log('Creating EntityManager with VisualizationManager');
  const entityManager = new EntityManager(tilesData, scene, visualizationManager);
  
  // Spawn a human entity
  console.log('Spawning a human entity');
  const entity = entityManager.spawnEntity('human', 5, 5);
  
  // Verify entity was created
  if (entity) {
    console.log('Entity created successfully:', entity.id);
    console.log('Entity mesh exists:', !!entity.mesh);
    
    // Update a few times to simulate movement
    console.log('Updating entity for a few frames');
    for (let i = 0; i < 10; i++) {
      entityManager.update(0.1);
    }
    
    // Cleanup
    console.log('Killing entity to test cleanup');
    entity.health = 0;
    entityManager.update(0.1);
    
    console.log('Test complete');
  } else {
    console.error('Failed to create entity');
  }
}

// This would be executed in a real environment
// testModelIntegration();

export { testModelIntegration };
