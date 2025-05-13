import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

import { useGameStore } from '../store/gameStore';
import { generateTerrain, determineBiome, getBiomeColor } from '../utils/worldGenerator';
import { Tile, BiomeType, MAP_SIZES, TILE_SIZE, EntityType } from '../types/world';
import { EntityManager } from '../utils/entityManager';
import { VisualizationManager } from '../utils/visualizationManager';

// Constants for game engine
const CAMERA_PAN_SPEED = 0.5;
const CAMERA_ZOOM_SPEED = 0.1;
const MIN_CAMERA_HEIGHT = 3;
const MAX_CAMERA_HEIGHT = 100;
const SELECTION_INDICATOR_HEIGHT = 0.1;
const TERRAIN_ADJUST_AMOUNT = TILE_SIZE * 0.3;

/**
 * Custom hook for the game engine logic
 */
export const useGameEngine = () => {
  const {
    worldSeed,
    worldSize,
    customWorldSize,
    timeOfDay,
    season,
    gameSpeed,
    isGamePaused,
    selectedTool,
    selectedTile,
    setSelectedTile
  } = useGameStore();
  
  // Three.js references and state
  const worldRef = useRef<THREE.Group>(null);
  const tilesRef = useRef<Tile[][]>([]);
  const mousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const selectionIndicatorRef = useRef<THREE.Mesh | null>(null);
  const tickTimerRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const entityManagerRef = useRef<EntityManager | null>(null);
  const visualizationManagerRef = useRef<VisualizationManager | null>(null);
  
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  
  // Get Three.js objects
  const { scene, camera, gl } = useThree();
  
  /**
   * Initializes the game world
   */
  const initializeWorld = useCallback(() => {
    console.log('Initializing world...');
    
    // Clear any existing world
    if (worldRef.current) {
      scene.remove(worldRef.current);
    }
    
    // Create new world
    worldRef.current = new THREE.Group();
    scene.add(worldRef.current);
    
    // Generate terrain
    const mapSize = worldSize === 'custom' ? customWorldSize : MAP_SIZES[worldSize];
    const { worldGroup, tilesData } = generateTerrain(
      worldSeed,
      worldSize,
      customWorldSize,
      timeOfDay,
      season
    );
    
    // Store the tiles data and add the world group to the scene
    tilesRef.current = tilesData;
    worldRef.current.add(worldGroup);
    
    // Create selection indicator (a simple wireframe box)
    const indicatorGeometry = new THREE.BoxGeometry(TILE_SIZE, SELECTION_INDICATOR_HEIGHT, TILE_SIZE);
    const indicatorMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      wireframe: true,
      transparent: true,
      opacity: 0.8,
    });
    
    selectionIndicatorRef.current = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    selectionIndicatorRef.current.visible = false;
    scene.add(selectionIndicatorRef.current);
    
    // Position camera
    const worldSizeWorld = mapSize * TILE_SIZE;
    camera.position.set(worldSizeWorld * 0.3, worldSizeWorld * 0.3, worldSizeWorld * 0.3);
    camera.lookAt(0, 0, 0);
    
    // Set up lights
    setupLights();
    
    // Initialize visualization manager first
    console.log('Initializing VisualizationManager');
    visualizationManagerRef.current = new VisualizationManager(scene);
    
    // Initialize terrain in visualization manager
    visualizationManagerRef.current.initializeTerrain(tilesData, TILE_SIZE, 2.0);
    
    // Then initialize entity manager with the visualization manager
    console.log('Initializing EntityManager with VisualizationManager');
    if (visualizationManagerRef.current) {
      entityManagerRef.current = new EntityManager(
        tilesData, 
        scene, 
        visualizationManagerRef.current
      );
      
      // Set population density
      entityManagerRef.current.setPopulationDensity('medium');
    }
    
    setIsInitialized(true);
    console.log('World initialization complete.');
  }, [worldSeed, worldSize, customWorldSize, timeOfDay, season, scene, camera]);
  
  /**
   * Sets up scene lighting based on time of day
   */
  const setupLights = useCallback(() => {
    // Remove existing lights
    scene.children.forEach(child => {
      if (child instanceof THREE.Light) {
        scene.remove(child);
      }
    });
    
    // Add ambient light (different intensity based on time of day)
    const ambientIntensity = timeOfDay === 'night' ? 0.2 : 
                             timeOfDay === 'dawn' || timeOfDay === 'dusk' ? 0.4 : 
                             0.6;
    const ambientLight = new THREE.AmbientLight(0xffffff, ambientIntensity);
    scene.add(ambientLight);
    
    // Add directional light (sun/moon)
    const directionalIntensity = timeOfDay === 'night' ? 0.1 : 
                                 timeOfDay === 'dawn' || timeOfDay === 'dusk' ? 0.5 : 
                                 0.8;
    const directionalLight = new THREE.DirectionalLight(
      timeOfDay === 'night' ? 0x8888ff : 
      timeOfDay === 'dawn' ? 0xffcc88 :
      timeOfDay === 'dusk' ? 0xff8866 :
      0xffffff, 
      directionalIntensity
    );
    
    // Position light based on time of day
    const mapSize = worldSize === 'custom' ? customWorldSize : MAP_SIZES[worldSize];
    const worldSizeWorld = mapSize * TILE_SIZE;
    const distance = worldSizeWorld * 2;
    
    switch(timeOfDay) {
      case 'dawn':
        directionalLight.position.set(-distance, distance * 0.5, 0);
        break;
      case 'day':
        directionalLight.position.set(0, distance, 0);
        break;
      case 'dusk':
        directionalLight.position.set(distance, distance * 0.5, 0);
        break;
      case 'night':
        directionalLight.position.set(0, -distance, 0);
        break;
    }
    
    directionalLight.castShadow = true;
    
    // Configure shadow properties
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = distance * 3;
    
    const shadowSize = worldSizeWorld * 0.6;
    directionalLight.shadow.camera.left = -shadowSize;
    directionalLight.shadow.camera.right = shadowSize;
    directionalLight.shadow.camera.top = shadowSize;
    directionalLight.shadow.camera.bottom = -shadowSize;
    
    scene.add(directionalLight);
  }, [timeOfDay, worldSize, customWorldSize, scene]);
  
  /**
   * Handles mouse movement over the game world
   */
  const handleMouseMove = useCallback((event: MouseEvent) => {
    // Calculate mouse position in normalized device coordinates
    const rect = gl.domElement.getBoundingClientRect();
    mousePositionRef.current = {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1
    };
  }, [gl]);
  
  /**
   * Handles mouse click on the game world
   */
  const handleMouseClick = useCallback(() => {
    // Nothing to do if not initialized
    if (!isInitialized) return;
    
    // Get mouse position vector for raycast
    const mousePos = new THREE.Vector2(mousePositionRef.current.x, mousePositionRef.current.y);
    
    // Use raycaster to find the clicked objects
    raycasterRef.current.setFromCamera(mousePos, camera);
    
    // First, check for entity intersections (give priority to entities)
    if (entityManagerRef.current) {
      const entities = entityManagerRef.current.getAllEntities();
      const entityMeshes = entities
        .filter(e => e.mesh)
        .map(e => e.mesh!);
      
      const entityIntersects = raycasterRef.current.intersectObjects(entityMeshes);
      
      if (entityIntersects.length > 0) {
        // Find the entity that was clicked
        const clickedMesh = entityIntersects[0].object;
        const clickedEntity = entities.find(e => e.mesh === clickedMesh);
        
        if (clickedEntity) {
          if (selectedTool === 'select') {
            // Select the entity
            useGameStore.getState().setSelectedEntity(clickedEntity);
            return;
          } else {
            // Apply tool effects to entity (if implemented)
            // applyToolEffectToEntity(clickedEntity, selectedTool);
            return;
          }
        }
      }
    }
    
    // If no entity was clicked, check for tile intersections
    const intersects = raycasterRef.current.intersectObjects(worldRef.current?.children || []);
    
    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh;
      const mapSize = worldSize === 'custom' ? customWorldSize : MAP_SIZES[worldSize];
      
      // Calculate tile x,y from the mesh position
      const tileX = Math.floor(mesh.position.x / TILE_SIZE + mapSize / 2);
      const tileY = Math.floor(mesh.position.z / TILE_SIZE + mapSize / 2);
      
      // Bounds check
      if (tileX >= 0 && tileX < mapSize && tileY >= 0 && tileY < mapSize) {
        const clickedTile = tilesRef.current[tileX][tileY];
        
        // Apply tool effect based on the selected tool
        if (selectedTool === 'select') {
          useGameStore.getState().setSelectedTile(clickedTile);
          useGameStore.getState().setSelectedEntity(null); // Clear any selected entity
        } else {
          applyToolEffect(clickedTile, selectedTool);
        }
      }
    }
  }, [isInitialized, selectedTool, camera, worldSize, customWorldSize]);
  
  /**
   * Applies the effect of a tool on a tile
   */
  const applyToolEffect = useCallback((tile: Tile, tool: string | null) => {
    if (!tile || !tool) return;
    
    const x = tile.x;
    const y = tile.y;
    
    switch (tool) {
      case 'raise-terrain':
        if (tile.height < 0.95) {
          tile.height = Math.min(1.0, tile.height + 0.1);
          updateTileHeight(tile);
        }
        break;
        
      case 'lower-terrain':
        if (tile.height > 0.05) {
          tile.height = Math.max(0.0, tile.height - 0.1);
          updateTileHeight(tile);
        }
        break;
        
      case 'place-water':
        if (tile.height > 0.1) {
          tile.height = 0.2; // Lower to water level
          tile.type = 'shallow_water';
          updateTileHeight(tile);
          updateTileAppearance(tile);
        }
        break;
        
      case 'place-mountain':
        tile.height = 0.9; // Raise to mountain height
        tile.type = 'mountains';
        updateTileHeight(tile);
        updateTileAppearance(tile);
        break;
        
      case 'place-forest':
        if (tile.height > 0.25 && tile.height < 0.7) {
          tile.type = 'deciduous_forest';
          tile.structure = {
            type: 'mature_tree',
            health: 100,
            level: 2
          };
          updateTileAppearance(tile);
        }
        break;
        
      case 'spawn-human':
        if (tile.height > 0.25 && !['deep_ocean', 'ocean', 'shallow_water'].includes(tile.type)) {
          if (entityManagerRef.current) {
            entityManagerRef.current.spawnEntity('human', tile.x, tile.y);
            tile.population += 1;
          }
        }
        break;
        
      case 'spawn-elf':
        if (tile.height > 0.25 && tile.type.includes('forest')) {
          if (entityManagerRef.current) {
            entityManagerRef.current.spawnEntity('elf', tile.x, tile.y);
            tile.population += 1;
          }
        }
        break;
        
      case 'spawn-dwarf':
        if (tile.height > 0.4 && ['mountains', 'hills', 'rock'].includes(tile.type)) {
          if (entityManagerRef.current) {
            entityManagerRef.current.spawnEntity('dwarf', tile.x, tile.y);
            tile.population += 1;
          }
        }
        break;
        
      case 'spawn-orc':
        if (tile.height > 0.25 && ['badlands', 'savanna', 'hills'].includes(tile.type)) {
          if (entityManagerRef.current) {
            entityManagerRef.current.spawnEntity('orc', tile.x, tile.y);
            tile.population += 1;
          }
        }
        break;
        
      case 'spawn-animal':
        if (tile.height > 0.25 && !['deep_ocean', 'ocean'].includes(tile.type)) {
          if (entityManagerRef.current) {
            // Choose a random animal based on the biome
            const animalTypes: EntityType[] = ['wolf', 'bear', 'deer', 'rabbit', 'bird'];
            
            // Bias selection based on biome
            let selectedType: EntityType;
            
            if (tile.type.includes('forest')) {
              // Forest biomes have more wolves, bears, and deer
              selectedType = animalTypes[Math.floor(Math.random() * 3)];
            } else if (tile.type === 'grassland' || tile.type === 'savanna') {
              // Grasslands have more rabbits and deer
              selectedType = Math.random() < 0.7 ? 
                (Math.random() < 0.5 ? 'rabbit' : 'deer') : 
                animalTypes[Math.floor(Math.random() * 3)];
            } else if (['shallow_water', 'river', 'lake'].includes(tile.type)) {
              // Water bodies have fish
              selectedType = 'fish';
            } else {
              // Random selection for other biomes
              selectedType = animalTypes[Math.floor(Math.random() * animalTypes.length)];
            }
            
            entityManagerRef.current.spawnEntity(selectedType, tile.x, tile.y);
            tile.population += 1;
          }
        }
        break;
        
      case 'spawn-monster':
        if (entityManagerRef.current) {
          // Choose monster type based on biome
          let monsterType: EntityType;
          
          if (tile.type === 'volcanic') {
            monsterType = Math.random() < 0.7 ? 'dragon' : 'demon';
          } else if (tile.type === 'corrupted') {
            monsterType = Math.random() < 0.6 ? 'zombie' : 'skeleton';
          } else if (tile.height > 0.7) {
            monsterType = 'dragon'; // Dragons in mountains
          } else {
            // Random monster for other areas
            const monsterTypes: EntityType[] = ['zombie', 'skeleton', 'demon', 'bandit'];
            monsterType = monsterTypes[Math.floor(Math.random() * monsterTypes.length)];
          }
          
          entityManagerRef.current.spawnEntity(monsterType, tile.x, tile.y);
          tile.population += 1;
        }
        break;
        
      // Add other tool implementations here
    }
  }, []);
  
  /**
   * Updates tile height and mesh
   */
  const updateTileHeight = useCallback((tile: Tile) => {
    if (!tile.mesh) return;
    
    // Recalculate scaled height
    const minHeight = 0.05;
    const heightRange = 2.0;
    tile.scaledHeight = minHeight + tile.height * heightRange;
    
    // Update geometry
    const geometry = new THREE.BoxGeometry(TILE_SIZE, tile.scaledHeight, TILE_SIZE);
    (tile.mesh as THREE.Mesh).geometry.dispose();
    (tile.mesh as THREE.Mesh).geometry = geometry;
    
    // Update position (since box geometry is centered)
    tile.mesh.position.y = tile.scaledHeight / 2;
    
    // Update biome based on new height
    tile.type = determineBiome(tile.height, tile.moisture, tile.temperature);
  }, []);
  
  /**
   * Updates tile appearance (color, etc.)
   */
  const updateTileAppearance = useCallback((tile: Tile) => {
    if (!tile.mesh) return;
    
    // Update material color based on biome
    const material = (tile.mesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
    material.color.copy(
      new THREE.Color(getBiomeColor(tile.type, timeOfDay, season))
    );
  }, [timeOfDay, season]);
  
  /**
   * Update the selection indicator position and visibility
   */
  const updateSelectionIndicator = useCallback(() => {
    if (!selectionIndicatorRef.current) return;
    
    if (selectedTile && selectedTile.mesh) {
      selectionIndicatorRef.current.visible = true;
      
      // Position just above the selected tile
      const yPos = selectedTile.scaledHeight + SELECTION_INDICATOR_HEIGHT / 2;
      selectionIndicatorRef.current.position.set(
        selectedTile.mesh.position.x,
        yPos,
        selectedTile.mesh.position.z
      );
    } else {
      selectionIndicatorRef.current.visible = false;
    }
  }, [selectedTile]);
  
  /**
   * Game tick logic 
   */
  const gameTick = useCallback((deltaTime: number) => {
    if (isGamePaused) return;
    
    // Time accumulator for ticks
    tickTimerRef.current += deltaTime * gameSpeed;
    
    // Update entities every frame for smooth movement
    if (entityManagerRef.current) {
      entityManagerRef.current.update(deltaTime);
    }
    
    // Update visualization manager
    if (visualizationManagerRef.current) {
      visualizationManagerRef.current.update();
    }
    
    // Perform game simulation every ~250ms of game time
    const tickInterval = 0.25;
    while (tickTimerRef.current >= tickInterval) {
      tickTimerRef.current -= tickInterval;
      
      // Perform other simulation logic (environment, civilizations, etc.)
      // This will be expanded later with more game simulation logic
    }
  }, [isGamePaused, gameSpeed]);
  
  // Initialize the world on component mount or when relevant props change
  useEffect(() => {
    if (!scene) return;
    
    initializeWorld();
    
    // Event listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleMouseClick);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleMouseClick);
    };
  }, [scene, worldSeed, worldSize, customWorldSize, timeOfDay, season, initializeWorld, handleMouseMove, handleMouseClick]);
  
  // Update lights when time of day changes
  useEffect(() => {
    if (isInitialized) {
      setupLights();
    }
  }, [isInitialized, timeOfDay, setupLights]);
  
  // Animation frame update
  useFrame((_, deltaTime) => {
    if (!isInitialized) return;
    
    // Update selection indicator
    updateSelectionIndicator();
    
    // Game simulation tick
    gameTick(deltaTime);
  });
  
  return {
    worldRef,
    tilesRef,
    isInitialized,
  };
};
