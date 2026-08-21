import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';

import { useGameStore } from '../store/gameStore';
import { generateTerrain, determineBiome, getBiomeColor } from '../utils/worldGenerator';
import { Tile, MAP_SIZES, TILE_SIZE, MIN_TILE_HEIGHT, BASE_TILE_SCALED_HEIGHT_MULTIPLIER, EntityType, TimeOfDay } from '../types/world';
import { EntityManager } from '../utils/entityManagerMinimal';
import { EffectsManager } from '../utils/effectsManager';
import { soundManager } from '../utils/soundManager';

// Constants for game engine
const SELECTION_INDICATOR_HEIGHT = 0.1;
const SECONDS_PER_DAY_PHASE = 20; // Game seconds per dawn/day/dusk/night phase
const TIME_PHASES: TimeOfDay[] = ['dawn', 'day', 'dusk', 'night'];
const SKY_COLORS: Record<TimeOfDay, THREE.Color> = {
  dawn: new THREE.Color('#43325e'),
  day: new THREE.Color('#6f9fc8'),
  dusk: new THREE.Color('#53304e'),
  night: new THREE.Color('#0b1120'),
};
const FLAMMABLE_BIOMES = [
  'deciduous_forest', 'coniferous_forest', 'taiga', 'rainforest',
  'tropical_forest', 'enchanted_forest', 'grassland', 'savanna', 'hills',
];

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
    weather,
    selectedTool,
    selectedTile
  } = useGameStore();
  
  // Three.js references and state
  const worldRef = useRef<THREE.Group>(null);
  const tilesRef = useRef<Tile[][]>([]);
  const mousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const selectionIndicatorRef = useRef<THREE.Mesh | null>(null);
  const tickTimerRef = useRef<number>(0);
  const entityManagerRef = useRef<EntityManager | null>(null);
  const effectsManagerRef = useRef<EffectsManager | null>(null);
  const burningTilesRef = useRef<Set<Tile>>(new Set());
  const phaseTimerRef = useRef<number>(0);
  const weatherTimerRef = useRef<number>(0);
  const statsTimerRef = useRef<number>(0);
  
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  
  // Get Three.js objects
  const { scene, camera, gl } = useThree();
  
  /**
   * Initializes the game world
   */
  const initializeWorld = useCallback(() => {
    console.log('Initializing world...');
    
    // Tear down any existing world and free GPU resources
    if (entityManagerRef.current) {
      entityManagerRef.current.clear();
      entityManagerRef.current = null;
    }
    if (effectsManagerRef.current) {
      effectsManagerRef.current.dispose();
      effectsManagerRef.current = null;
    }
    if (worldRef.current) {
      worldRef.current.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach(m => m.dispose());
        else if (material) material.dispose();
      });
      scene.remove(worldRef.current);
    }
    if (selectionIndicatorRef.current) {
      scene.remove(selectionIndicatorRef.current);
      selectionIndicatorRef.current.geometry.dispose();
      (selectionIndicatorRef.current.material as THREE.Material).dispose();
      selectionIndicatorRef.current = null;
    }
    burningTilesRef.current.clear();
    
    // Create new world
    worldRef.current = new THREE.Group();
    scene.add(worldRef.current);
    
    // Generate terrain using the time/season at generation moment
    const storeState = useGameStore.getState();
    const mapSize = worldSize === 'custom' ? customWorldSize : MAP_SIZES[worldSize];
    const { worldGroup, tilesData } = generateTerrain(
      worldSeed,
      worldSize,
      customWorldSize,
      storeState.timeOfDay,
      storeState.season
    );
    
    // Store the tiles data and add the world group to the scene
    tilesRef.current = tilesData;
    worldRef.current.add(worldGroup);
    
    // Create selection indicator (pulsing ring)
    const indicatorGeometry = new THREE.RingGeometry(TILE_SIZE * 0.45, TILE_SIZE * 0.6, 24);
    const indicatorMaterial = new THREE.MeshBasicMaterial({
      color: 0xffee66,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    
    selectionIndicatorRef.current = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    selectionIndicatorRef.current.rotation.x = -Math.PI / 2;
    selectionIndicatorRef.current.visible = false;
    scene.add(selectionIndicatorRef.current);
    
    // Position camera
    const worldSizeWorld = mapSize * TILE_SIZE;
    camera.position.set(worldSizeWorld * 0.3, worldSizeWorld * 0.3, worldSizeWorld * 0.3);
    camera.lookAt(0, 0, 0);
    
    // Set up lights
    setupLights();
    
    // Initialize entity manager and wire world events
    entityManagerRef.current = new EntityManager(tilesData, scene);
    entityManagerRef.current.setPopulationDensity(storeState.entityPopulationDensity);
    entityManagerRef.current.onLifeEvent = (message, kind) => {
      useGameStore.getState().addEvent(message, kind);
    };
    entityManagerRef.current.onEntityDeath = (entity) => {
      const state = useGameStore.getState();
      if (state.selectedEntity?.id === entity.id) {
        state.setSelectedEntity(null);
      }
      // Soul puff at the point of death
      const ex = Math.floor(entity.position.x);
      const ey = Math.floor(entity.position.y);
      if (ex >= 0 && ex < tilesData.length && ey >= 0 && ey < tilesData[0].length) {
        effectsManagerRef.current?.spawnBurst(tileWorldPosition(tilesData[ex][ey]), 0x9aa4b5, 12, 1.4);
      }
      soundManager.death();
    };
    entityManagerRef.current.onEntitySpawn = (entity) => {
      const ex = Math.floor(entity.position.x);
      const ey = Math.floor(entity.position.y);
      if (ex >= 0 && ex < tilesData.length && ey >= 0 && ey < tilesData[0].length) {
        effectsManagerRef.current?.spawnBurst(tileWorldPosition(tilesData[ex][ey]), 0x9fe8a0, 10, 1.2);
      }
      soundManager.spawn();
    };
    
    // Initialize the visual effects system
    effectsManagerRef.current = new EffectsManager(scene);
    effectsManagerRef.current.initAtmosphere(mapSize * TILE_SIZE);
    
    setIsInitialized(true);
    useGameStore.getState().addEvent(`A new world awakens (seed ${worldSeed})`, 'info');
    console.log('World initialization complete.');
  }, [worldSeed, worldSize, customWorldSize, scene, camera]); // eslint-disable-line react-hooks/exhaustive-deps
  
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
  const handleMouseClick = useCallback((event: MouseEvent) => {
    // Nothing to do if not initialized
    if (!isInitialized) return;
    // Ignore clicks on UI panels; only act on the 3D canvas itself
    if (event.target !== gl.domElement) return;
    
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
          }
          // Non-select tools fall through and act on the tile under the entity
          const ex = Math.floor(clickedEntity.position.x);
          const ey = Math.floor(clickedEntity.position.y);
          if (ex >= 0 && ex < tilesRef.current.length && ey >= 0 && ey < tilesRef.current[0].length) {
            applyToolEffect(tilesRef.current[ex][ey], selectedTool);
          }
          return;
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
  }, [isInitialized, selectedTool, camera, gl, worldSize, customWorldSize]); // eslint-disable-line react-hooks/exhaustive-deps
  
  /**
   * Applies the effect of a tool on a tile
   */
  const tileWorldPosition = useCallback((tile: Tile): THREE.Vector3 => {
    const mapWidth = tilesRef.current.length;
    const mapHeight = tilesRef.current[0]?.length ?? 0;
    return new THREE.Vector3(
      (tile.x - mapWidth / 2) * TILE_SIZE,
      tile.scaledHeight,
      (tile.y - mapHeight / 2) * TILE_SIZE,
    );
  }, []);

  const igniteTile = useCallback((tile: Tile) => {
    if (tile.isOnFire || tile.height <= 0.25) return;
    tile.isOnFire = true;
    tile.fireIntensity = 1;
    tile.fireFuel = FLAMMABLE_BIOMES.includes(tile.type) ? 6 : 2.5;
    burningTilesRef.current.add(tile);
    effectsManagerRef.current?.spawnFlame(tileWorldPosition(tile), tile.fireFuel);
    if (tile.mesh) {
      const material = (tile.mesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
      material.emissive = new THREE.Color(0xff4400);
      material.emissiveIntensity = 0.6;
    }
  }, [tileWorldPosition]);

  const extinguishTile = useCallback((tile: Tile, burned: boolean) => {
    tile.isOnFire = false;
    tile.fireIntensity = 0;
    burningTilesRef.current.delete(tile);
    if (burned && tile.height > 0.25) {
      tile.type = 'badlands';
      tile.structure = null;
      tile.fertility = Math.max(0, tile.fertility - 0.4);
      tile.resources = tile.resources.filter(r => !['wood', 'food'].includes(r.type));
    }
    if (tile.mesh) {
      const material = (tile.mesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = 0;
      const state = useGameStore.getState();
      material.color.copy(getBiomeColor(tile.type, state.timeOfDay, state.season));
    }
  }, []);

  const applyToolEffect = useCallback((tile: Tile, tool: string | null) => {
    if (!tile || !tool) return;
    
    switch (tool) {
      case 'raise-terrain':
        if (tile.height < 0.95) {
          tile.height = Math.min(1.0, tile.height + 0.1);
          updateTileHeight(tile);
          soundManager.terraform();
        }
        break;
        
      case 'lower-terrain':
        if (tile.height > 0.05) {
          tile.height = Math.max(0.0, tile.height - 0.1);
          updateTileHeight(tile);
          soundManager.terraform();
        }
        break;
        
      case 'place-water':
        if (tile.height > 0.1) {
          tile.height = 0.2; // Lower to water level
          tile.type = 'shallow_water';
          updateTileHeight(tile);
          updateTileAppearance(tile);
          soundManager.terraform();
        }
        break;
        
      case 'place-mountain':
        tile.height = 0.9; // Raise to mountain height
        tile.type = 'mountains';
        updateTileHeight(tile);
        updateTileAppearance(tile);
        soundManager.terraform();
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
          soundManager.terraform();
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
        if (tile.height > 0.25 && !['deep_ocean', 'ocean', 'shallow_water'].includes(tile.type)) {
          if (entityManagerRef.current) {
            entityManagerRef.current.spawnEntity('elf', tile.x, tile.y);
            tile.population += 1;
          }
        }
        break;
        
      case 'spawn-dwarf':
        if (tile.height > 0.25 && !['deep_ocean', 'ocean', 'shallow_water'].includes(tile.type)) {
          if (entityManagerRef.current) {
            entityManagerRef.current.spawnEntity('dwarf', tile.x, tile.y);
            tile.population += 1;
          }
        }
        break;
        
      case 'spawn-orc':
        if (tile.height > 0.25 && !['deep_ocean', 'ocean', 'shallow_water'].includes(tile.type)) {
          if (entityManagerRef.current) {
            entityManagerRef.current.spawnEntity('orc', tile.x, tile.y);
            tile.population += 1;
          }
        }
        break;
        
      case 'spawn-animal':
        if (tile.height > 0.25 && !['deep_ocean', 'ocean'].includes(tile.type)) {
          if (entityManagerRef.current) {
            // Choose a biome-appropriate animal so spawning always succeeds
            let candidates: EntityType[];
            if (['shallow_water', 'river', 'lake'].includes(tile.type)) {
              candidates = ['fish'];
            } else if (tile.type.includes('forest') || tile.type === 'taiga') {
              candidates = ['wolf', 'bear', 'deer', 'bird'];
            } else if (tile.type === 'grassland' || tile.type === 'savanna') {
              candidates = ['rabbit', 'deer', 'bird'];
            } else if (tile.type === 'mountains' || tile.type === 'hills') {
              candidates = ['bear', 'bird'];
            } else {
              candidates = ['bird', 'rabbit'];
            }
            const selectedType = candidates[Math.floor(Math.random() * candidates.length)];
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

      case 'plant-trees': {
        if (tile.height > 0.28 && tile.height < 0.75 && !tile.type.includes('water')) {
          tile.type = tile.temperature < 0.3 ? 'coniferous_forest' : 'deciduous_forest';
          tile.structure = { type: 'young_tree', health: 100, level: 1 };
          tile.resources.push({ type: 'wood', quantity: 5, discovered: true });
          updateTileAppearance(tile);
          effectsManagerRef.current?.spawnBurst(tileWorldPosition(tile), 0x44cc44, 14, 1.5);
        }
        break;
      }

      case 'unearth-minerals': {
        const mineralTypes = ['iron', 'gold', 'stone', 'coal', 'gem'] as const;
        const mineral = mineralTypes[Math.floor(Math.random() * mineralTypes.length)];
        tile.resources.push({ type: mineral, quantity: 5 + Math.floor(Math.random() * 10), discovered: true });
        effectsManagerRef.current?.spawnBurst(tileWorldPosition(tile), 0xffdd55, 16, 2);
        useGameStore.getState().addEvent(`A vein of ${mineral} surfaced at (${tile.x}, ${tile.y})`, 'divine');
        break;
      }

      case 'summon-rain': {
        const store = useGameStore.getState();
        if (store.weather === 'clear') {
          store.setWeather('rain');
          store.addEvent('Rain begins to fall across the land', 'divine');
        } else {
          store.setWeather('clear');
          store.addEvent('The skies clear', 'divine');
        }
        break;
      }

      case 'fire': {
        igniteTile(tile);
        soundManager.fire();
        useGameStore.getState().addEvent(`Divine fire ignites (${tile.x}, ${tile.y})`, 'disaster');
        break;
      }

      case 'earthquake': {
        const radius = 4;
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dy = -radius; dy <= radius; dy++) {
            const nx = tile.x + dx;
            const ny = tile.y + dy;
            if (nx < 0 || nx >= tilesRef.current.length || ny < 0 || ny >= tilesRef.current[0].length) continue;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > radius) continue;
            const target = tilesRef.current[nx][ny];
            const shift = (Math.random() - 0.5) * 0.25 * (1 - distance / radius);
            target.height = Math.max(0, Math.min(1, target.height + shift));
            target.structure = null;
            updateTileHeight(target);
            updateTileAppearance(target);
          }
        }
        const kills = entityManagerRef.current?.damageArea(tile.x, tile.y, radius, 35) ?? 0;
        effectsManagerRef.current?.spawnShockwave(tileWorldPosition(tile), 0xaa8855, 6);
        soundManager.earthquake();
        useGameStore.getState().addEvent(
          `An earthquake reshapes the land${kills > 0 ? `, claiming ${kills} lives` : ''}`,
          'disaster'
        );
        break;
      }

      case 'meteor': {
        const impact = tileWorldPosition(tile);
        effectsManagerRef.current?.spawnMeteor(impact, () => {
          const radius = 3;
          for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
              const nx = tile.x + dx;
              const ny = tile.y + dy;
              if (nx < 0 || nx >= tilesRef.current.length || ny < 0 || ny >= tilesRef.current[0].length) continue;
              const distance = Math.sqrt(dx * dx + dy * dy);
              if (distance > radius) continue;
              const target = tilesRef.current[nx][ny];
              target.height = Math.max(0.05, target.height - 0.3 * (1 - distance / radius));
              target.structure = null;
              if (distance < 1.5) {
                target.type = 'volcanic';
              }
              updateTileHeight(target);
              updateTileAppearance(target);
              if (distance < 2 && FLAMMABLE_BIOMES.includes(target.type)) {
                igniteTile(target);
              }
            }
          }
          const kills = entityManagerRef.current?.damageArea(tile.x, tile.y, radius + 1, 80) ?? 0;
          soundManager.meteor();
          useGameStore.getState().addEvent(
            `A meteor devastates the region${kills > 0 ? ` — ${kills} perished` : ''}`,
            'disaster'
          );
        });
        break;
      }

      case 'lightning': {
        effectsManagerRef.current?.spawnLightning(tileWorldPosition(tile));
        soundManager.lightning();
        const kills = entityManagerRef.current?.damageArea(tile.x, tile.y, 1.2, 60) ?? 0;
        if (FLAMMABLE_BIOMES.includes(tile.type) && Math.random() < 0.6) {
          igniteTile(tile);
        }
        useGameStore.getState().addEvent(
          `Lightning strikes (${tile.x}, ${tile.y})${kills > 0 ? ` — ${kills} slain` : ''}`,
          'disaster'
        );
        break;
      }

      case 'blessing': {
        const healed = entityManagerRef.current?.healArea(tile.x, tile.y, 4, 50) ?? 0;
        const radius = 3;
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dy = -radius; dy <= radius; dy++) {
            const nx = tile.x + dx;
            const ny = tile.y + dy;
            if (nx < 0 || nx >= tilesRef.current.length || ny < 0 || ny >= tilesRef.current[0].length) continue;
            const target = tilesRef.current[nx][ny];
            target.fertility = Math.min(1, target.fertility + 0.3);
            if (target.type === 'corrupted') {
              target.type = determineBiome(target.height, target.moisture, target.temperature);
              updateTileAppearance(target);
            }
            if (Math.random() < 0.3 && target.height > 0.25 && !target.resources.some(r => r.type === 'food')) {
              target.resources.push({ type: 'food', quantity: 5, discovered: true });
            }
          }
        }
        effectsManagerRef.current?.spawnAura(tileWorldPosition(tile), 0xffee88);
        soundManager.bless();
        useGameStore.getState().addEvent(
          `A blessing radiates outward${healed > 0 ? `, healing ${healed} creatures` : ''}`,
          'divine'
        );
        break;
      }

      case 'curse': {
        const radius = 3;
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dy = -radius; dy <= radius; dy++) {
            const nx = tile.x + dx;
            const ny = tile.y + dy;
            if (nx < 0 || nx >= tilesRef.current.length || ny < 0 || ny >= tilesRef.current[0].length) continue;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > radius) continue;
            const target = tilesRef.current[nx][ny];
            if (target.height > 0.25) {
              target.type = 'corrupted';
              target.fertility = Math.max(0, target.fertility - 0.5);
              target.structure = null;
              updateTileAppearance(target);
            }
          }
        }
        const kills = entityManagerRef.current?.damageArea(tile.x, tile.y, radius, 25) ?? 0;
        effectsManagerRef.current?.spawnAura(tileWorldPosition(tile), 0x9922cc);
        soundManager.curse();
        useGameStore.getState().addEvent(
          `Dark corruption spreads${kills > 0 ? ` — ${kills} souls claimed` : ''}`,
          'disaster'
        );
        break;
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  /**
   * Updates tile height and mesh
   */
  const updateTileHeight = useCallback((tile: Tile) => {
    if (!tile.mesh) return;
    
    // Recalculate scaled height
    tile.scaledHeight = MIN_TILE_HEIGHT + tile.height * BASE_TILE_SCALED_HEIGHT_MULTIPLIER;
    
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
      
      // Position just above the selected tile, spin and pulse
      const yPos = selectedTile.scaledHeight + SELECTION_INDICATOR_HEIGHT / 2;
      selectionIndicatorRef.current.position.set(
        selectedTile.mesh.position.x,
        yPos,
        selectedTile.mesh.position.z
      );
      selectionIndicatorRef.current.rotation.z = Date.now() / 900;
      const pulse = 1 + Math.sin(Date.now() / 250) * 0.12;
      selectionIndicatorRef.current.scale.set(pulse, pulse, 1);
    } else {
      selectionIndicatorRef.current.visible = false;
    }
  }, [selectedTile]);
  
  /**
   * Game tick logic 
   */
  const gameTick = useCallback((deltaTime: number) => {
    if (isGamePaused) return;
    
    const scaledDelta = deltaTime * gameSpeed;
    tickTimerRef.current += scaledDelta;
    
    // Update entities every frame for smooth movement
    if (entityManagerRef.current) {
      entityManagerRef.current.update(scaledDelta);
    }

    // Update visual effects in real time
    effectsManagerRef.current?.update(deltaTime);

    // Advance the day/night cycle
    phaseTimerRef.current += scaledDelta;
    if (phaseTimerRef.current >= SECONDS_PER_DAY_PHASE) {
      phaseTimerRef.current = 0;
      const store = useGameStore.getState();
      const nextPhase = TIME_PHASES[(TIME_PHASES.indexOf(store.timeOfDay) + 1) % TIME_PHASES.length];
      store.setTimeOfDay(nextPhase);
      if (nextPhase === 'dawn') {
        store.advanceDay();
      }
      refreshWorldColors();
    }

    // Weather evolution: rain slowly fades, storms may spark
    weatherTimerRef.current += scaledDelta;
    if (weatherTimerRef.current >= 12) {
      weatherTimerRef.current = 0;
      const store = useGameStore.getState();
      if (store.weather !== 'clear' && Math.random() < 0.3) {
        store.setWeather('clear');
        store.addEvent('The rain subsides', 'info');
      } else if (store.weather === 'clear' && Math.random() < 0.08) {
        store.setWeather('rain');
        store.addEvent('Clouds gather; rain begins to fall', 'info');
      }
    }

    // Simulation steps at fixed cadence
    const tickInterval = 0.25;
    while (tickTimerRef.current >= tickInterval) {
      tickTimerRef.current -= tickInterval;
      simulateFire(tickInterval);
    }

    // Publish population and moisture effects periodically
    statsTimerRef.current += deltaTime;
    if (statsTimerRef.current >= 1) {
      statsTimerRef.current = 0;
      const store = useGameStore.getState();
      store.setPopulation(entityManagerRef.current?.getPopulation() ?? 0);
      if (store.weather !== 'clear') {
        effectsManagerRef.current?.startRain();
        soundManager.startRain();
      } else {
        effectsManagerRef.current?.stopRain();
        soundManager.stopRain();
      }
    }

    // Smoothly blend the sky and fog toward the current phase
    const currentPhase = useGameStore.getState().timeOfDay;
    const targetSky = SKY_COLORS[currentPhase];
    if (scene.background instanceof THREE.Color) {
      scene.background.lerp(targetSky, Math.min(1, deltaTime * 0.8));
    } else {
      scene.background = targetSky.clone();
    }
    if (scene.fog?.color) {
      scene.fog.color.lerp(targetSky, Math.min(1, deltaTime * 0.8));
    }
    effectsManagerRef.current?.setStarVisibility(currentPhase === 'night' || currentPhase === 'dusk');
  }, [isGamePaused, gameSpeed, scene]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Spread, burn down, and extinguish fires. */
  const simulateFire = useCallback((delta: number) => {
    if (burningTilesRef.current.size === 0) return;
    const store = useGameStore.getState();
    const raining = store.weather !== 'clear';
    const toExtinguish: { tile: Tile; burned: boolean }[] = [];

    burningTilesRef.current.forEach(tile => {
      tile.fireFuel = (tile.fireFuel ?? 1) - delta * (raining ? 3 : 1);
      if (tile.fireFuel <= 0) {
        toExtinguish.push({ tile, burned: !raining });
        return;
      }
      // Damage entities standing in the fire
      entityManagerRef.current?.damageArea(tile.x, tile.y, 0.8, 8 * delta * 4);
      // Chance to spread to flammable neighbors
      if (!raining && Math.random() < 0.12) {
        const dx = Math.floor(Math.random() * 3) - 1;
        const dy = Math.floor(Math.random() * 3) - 1;
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        if (nx >= 0 && nx < tilesRef.current.length && ny >= 0 && ny < tilesRef.current[0].length) {
          const neighbor = tilesRef.current[nx][ny];
          if (!neighbor.isOnFire && FLAMMABLE_BIOMES.includes(neighbor.type)) {
            igniteTile(neighbor);
          }
        }
      }
    });

    for (const { tile, burned } of toExtinguish) {
      extinguishTile(tile, burned);
    }
  }, [igniteTile, extinguishTile]);

  /** Re-tint every tile after a time-of-day or season change. */
  const refreshWorldColors = useCallback(() => {
    const state = useGameStore.getState();
    for (const row of tilesRef.current) {
      for (const tile of row) {
        if (!tile.mesh || tile.isOnFire) continue;
        const material = (tile.mesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
        material.color.copy(getBiomeColor(tile.type, state.timeOfDay, state.season));
      }
    }
  }, []);
  
  // Initialize the world only when the seed or dimensions change
  useEffect(() => {
    if (!scene) return;
    
    initializeWorld();
  }, [scene, initializeWorld]);

  // Mouse listeners bind independently of world regeneration
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleMouseClick);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleMouseClick);
    };
  }, [handleMouseMove, handleMouseClick]);
  
  // Update lights and terrain tint when time of day or season changes
  useEffect(() => {
    if (isInitialized) {
      setupLights();
      refreshWorldColors();
    }
  }, [isInitialized, timeOfDay, season, setupLights, refreshWorldColors]);

  // React to manual weather changes from the toolbar
  useEffect(() => {
    if (!isInitialized) return;
    if (weather !== 'clear') {
      effectsManagerRef.current?.startRain();
    } else {
      effectsManagerRef.current?.stopRain();
    }
  }, [isInitialized, weather]);
  
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
