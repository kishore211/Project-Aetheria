import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';

import { useGameStore } from '../store/gameStore';
import { generateWorld, determineBiome } from '../utils/worldGenerator';
import {
  Tile,
  MAP_SIZES,
  TILE_SIZE,
  computeScaledHeight,
  isWaterBiome,
  EntityType,
  TimeOfDay,
} from '../types/world';
import { EntityManager } from '../utils/entityManagerMinimal';
import { EffectsManager } from '../utils/effectsManager';
import { TerrainRenderer } from '../utils/terrainRenderer';
import { SettlementSystem } from '../utils/settlementSystem';
import { HerdSystem } from '../utils/herdSystem';
import { publishWorldAccess } from '../utils/worldAccess';
import { writeSave } from '../utils/saveSystem';
import { worldAccess } from '../utils/worldAccess';
import { buildSave } from '../utils/saveSystem';
import { publishSimulationContext, simulation } from '../utils/simulation';
import { soundManager } from '../utils/soundManager';

// Constants for game engine
const SELECTION_INDICATOR_HEIGHT = 0.1;
const SECONDS_PER_DAY_PHASE = 20; // Game seconds per dawn/day/dusk/night phase
const TIME_PHASES: TimeOfDay[] = ['dawn', 'day', 'dusk', 'night'];
const SKY_COLORS: Record<TimeOfDay, THREE.Color> = {
  dawn: new THREE.Color('#4a3a63'),
  day: new THREE.Color('#7cabce'),
  dusk: new THREE.Color('#5a3550'),
  night: new THREE.Color('#0b1120'),
};
const FLAMMABLE_BIOMES = [
  'deciduous_forest', 'coniferous_forest', 'taiga', 'rainforest',
  'tropical_forest', 'enchanted_forest', 'grassland', 'savanna', 'hills',
];

/** Tools that paint an area and therefore honour the brush size. */
const BRUSH_TOOLS = new Set([
  'raise-terrain', 'lower-terrain', 'place-water', 'place-mountain',
  'place-forest', 'plant-trees', 'unearth-minerals', 'fire',
]);

/**
 * Custom hook for the game engine logic
 */
export const useGameEngine = () => {
  const {
    worldSeed,
    worldSize,
    customWorldSize,
    worldTemplate,
    worldRevision,
    timeOfDay,
    season,
    gameSpeed,
    isGamePaused,
    weather,
    selectedTool,
    selectedTile,
  } = useGameStore();

  // Three.js references and state
  const tilesRef = useRef<Tile[][]>([]);
  const terrainRef = useRef<TerrainRenderer | null>(null);
  const mousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const selectionIndicatorRef = useRef<THREE.Mesh | null>(null);
  const lightsRef = useRef<THREE.Light[]>([]);
  const tickTimerRef = useRef<number>(0);
  const entityManagerRef = useRef<EntityManager | null>(null);
  const effectsManagerRef = useRef<EffectsManager | null>(null);
  const settlementRef = useRef<SettlementSystem | null>(null);
  const herdRef = useRef<HerdSystem | null>(null);
  const burningTilesRef = useRef<Set<Tile>>(new Set());
  const phaseTimerRef = useRef<number>(0);
  const weatherTimerRef = useRef<number>(0);
  const statsTimerRef = useRef<number>(0);
  const ecologyTimerRef = useRef<number>(0);
  const autosaveTimerRef = useRef<number>(0);
  const lastCameraNonceRef = useRef<number>(0);

  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // Get Three.js objects
  const { scene, camera, gl, controls } = useThree();

  const mapSize = useMemo(
    () => (worldSize === 'custom' ? customWorldSize : MAP_SIZES[worldSize]),
    [worldSize, customWorldSize],
  );

  /** Centre of a tile in world space. */
  const tileWorldPosition = useCallback((tile: Tile): THREE.Vector3 => {
    const size = tilesRef.current.length || mapSize;
    return new THREE.Vector3(
      (tile.x - size / 2 + 0.5) * TILE_SIZE,
      tile.scaledHeight,
      (tile.y - size / 2 + 0.5) * TILE_SIZE,
    );
  }, [mapSize]);

  const inBounds = useCallback((x: number, y: number): boolean => {
    const tiles = tilesRef.current;
    return x >= 0 && x < tiles.length && y >= 0 && y < (tiles[0]?.length ?? 0);
  }, []);

  /** Push a tile's simulation state to the GPU. */
  const syncTile = useCallback((tile: Tile) => {
    const state = useGameStore.getState();
    terrainRef.current?.syncTile(tile, state.timeOfDay, state.season);
  }, []);

  /**
   * Sets up scene lighting. Terrain shadows are deliberately off: a flat,
   * readable map beats a moody one (docs/project-tracker/03-MAP-REDESIGN.md).
   */
  const setupLights = useCallback(() => {
    for (const light of lightsRef.current) {
      scene.remove(light);
      light.dispose?.();
    }
    lightsRef.current = [];

    const ambientIntensity = timeOfDay === 'night' ? 1.05
      : timeOfDay === 'dawn' || timeOfDay === 'dusk' ? 1.5
      : 1.9;
    const ambient = new THREE.AmbientLight(0xffffff, ambientIntensity);
    scene.add(ambient);
    lightsRef.current.push(ambient);

    const directionalIntensity = timeOfDay === 'night' ? 0.25
      : timeOfDay === 'dawn' || timeOfDay === 'dusk' ? 0.7
      : 1.0;
    const directional = new THREE.DirectionalLight(
      timeOfDay === 'night' ? 0x8899ff
        : timeOfDay === 'dawn' ? 0xffcc88
        : timeOfDay === 'dusk' ? 0xff9a77
        : 0xffffff,
      directionalIntensity,
    );

    const worldUnits = mapSize * TILE_SIZE;
    const distance = worldUnits * 1.5;
    switch (timeOfDay) {
      case 'dawn': directional.position.set(-distance, distance * 0.6, distance * 0.2); break;
      case 'day': directional.position.set(distance * 0.2, distance, distance * 0.3); break;
      case 'dusk': directional.position.set(distance, distance * 0.6, -distance * 0.2); break;
      case 'night': directional.position.set(-distance * 0.4, distance * 0.8, -distance * 0.4); break;
    }
    directional.castShadow = false;
    scene.add(directional);
    lightsRef.current.push(directional);
  }, [timeOfDay, mapSize, scene]);

  /**
   * Initializes the game world
   */
  const initializeWorld = useCallback(() => {
    // Tear down any existing world and free GPU resources
    entityManagerRef.current?.clear();
    entityManagerRef.current = null;
    effectsManagerRef.current?.dispose();
    effectsManagerRef.current = null;
    settlementRef.current?.dispose();
    settlementRef.current = null;
    herdRef.current?.dispose();
    herdRef.current = null;
    terrainRef.current?.dispose();
    terrainRef.current = null;
    publishWorldAccess(null);
    if (selectionIndicatorRef.current) {
      scene.remove(selectionIndicatorRef.current);
      selectionIndicatorRef.current.geometry.dispose();
      (selectionIndicatorRef.current.material as THREE.Material).dispose();
      selectionIndicatorRef.current = null;
    }
    burningTilesRef.current.clear();

    const storeState = useGameStore.getState();
    const { tilesData } = generateWorld({
      seed: worldSeed,
      mapSize,
      template: worldTemplate,
    });
    tilesRef.current = tilesData;

    // Build the instanced terrain
    const terrain = new TerrainRenderer(tilesData, storeState.timeOfDay, storeState.season);
    terrainRef.current = terrain;
    scene.add(terrain.group);

    // Selection indicator (pulsing ring)
    const indicatorGeometry = new THREE.RingGeometry(TILE_SIZE * 0.42, TILE_SIZE * 0.58, 24);
    const indicatorMaterial = new THREE.MeshBasicMaterial({
      color: 0xffee66,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    indicator.rotation.x = -Math.PI / 2;
    indicator.visible = false;
    indicator.renderOrder = 2;
    selectionIndicatorRef.current = indicator;
    scene.add(indicator);

    // Frame the whole map, whatever shape the window is. A fixed distance looks
    // right on one aspect ratio and wrong on every other, so derive it from the
    // camera's own field of view.
    const worldUnits = mapSize * TILE_SIZE;
    const perspective = camera as THREE.PerspectiveCamera;
    const halfFovY = THREE.MathUtils.degToRad(perspective.fov ?? 55) / 2;
    const halfFovX = Math.atan(Math.tan(halfFovY) * (perspective.aspect || 1.6));
    const fitDistance = Math.max(
      (worldUnits * 0.5) / Math.tan(halfFovY),
      (worldUnits * 0.5) / Math.tan(halfFovX),
    ) * 1.08;
    // A ~55 degree pitch reads as a map without flattening the relief away
    const pitch = THREE.MathUtils.degToRad(56);
    camera.position.set(0, Math.sin(pitch) * fitDistance, Math.cos(pitch) * fitDistance);
    camera.lookAt(0, 0, 0);
    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
    if (orbit?.target) {
      orbit.target.set(0, 0, 0);
      orbit.update?.();
    }

    setupLights();

    // Visual effects first, so entity spawn callbacks can use it
    effectsManagerRef.current = new EffectsManager(scene);
    effectsManagerRef.current.initAtmosphere(worldUnits);

    // Entities
    const manager = new EntityManager(tilesData, scene, camera);
    entityManagerRef.current = manager;
    manager.setPopulationDensity(storeState.entityPopulationDensity);
    manager.setWorldLaws(storeState.worldLaws);
    manager.onLifeEvent = (message, kind, position) => {
      useGameStore.getState().addEvent(message, kind, position);
    };
    manager.onEntityDeath = (entity) => {
      const state = useGameStore.getState();
      if (state.selectedEntity?.id === entity.id) state.setSelectedEntity(null);
      if (state.followEntityId === entity.id) state.setFollowEntity(null);
      const ex = Math.floor(entity.position.x);
      const ey = Math.floor(entity.position.y);
      if (inBounds(ex, ey)) {
        effectsManagerRef.current?.spawnBurst(tileWorldPosition(tilesData[ex][ey]), 0x9aa4b5, 12, 1.4);
      }
      soundManager.death();
    };
    manager.onEntitySpawn = (entity) => {
      const ex = Math.floor(entity.position.x);
      const ey = Math.floor(entity.position.y);
      if (inBounds(ex, ey)) {
        effectsManagerRef.current?.spawnBurst(tileWorldPosition(tilesData[ex][ey]), 0x9fe8a0, 10, 1.2);
      }
      soundManager.spawn();
    };

    // Civilization layer
    const settlements = new SettlementSystem(tilesData, terrain, manager, scene, {
      onEvent: (message, kind, position) => {
        useGameStore.getState().addEvent(message, kind, position);
      },
      onKingdomsChanged: (summaries) => {
        useGameStore.getState().setKingdoms(summaries);
      },
    });
    settlementRef.current = settlements;
    settlements.setWorldLaws(storeState.worldLaws);

    // Animals travel in families; see utils/herdSystem.ts
    const herds = new HerdSystem(tilesData, manager);
    herdRef.current = herds;

    simulation.onOrderComplete = (entity, order) => {
      if (order.purpose === 'herd') herds.handleArrival(entity);
      else settlements.handleOrderComplete(entity, order);
    };
    // Lets the AI walk a stranded villager back to somewhere it belongs
    simulation.homePositionFor = (entity) => settlements.homePositionFor(entity);

    // Let HUD panels (minimap, kingdom list) read the live world
    publishWorldAccess({
      tiles: tilesData,
      entities: () => manager.getAllEntities(),
      kingdomColor: (id: string) => settlements.kingdomColorFor(id),
      cameraFocus: () => {
        const orbitControls = controls as unknown as { target?: THREE.Vector3 } | null;
        const target = orbitControls?.target ?? new THREE.Vector3();
        const size = tilesData.length;
        return {
          x: target.x / TILE_SIZE + size / 2,
          y: target.z / TILE_SIZE + size / 2,
          span: camera.position.distanceTo(target) / TILE_SIZE,
        };
      },
      captureSave: (label: string) => {
        const state = useGameStore.getState();
        // Regenerate the untouched world so the save only stores what changed.
        const { tilesData: pristine } = generateWorld({
          seed: state.worldSeed,
          mapSize: tilesData.length,
          template: state.worldTemplate,
        });
        const snapshot = settlements.snapshot();
        return buildSave({
          label,
          world: {
            seed: state.worldSeed,
            size: state.worldSize,
            customSize: state.customWorldSize,
            template: state.worldTemplate,
            timeOfDay: state.timeOfDay,
            season: state.season,
            year: state.year,
            day: state.day,
            weather: state.weather,
            laws: state.worldLaws,
          },
          liveTiles: tilesData,
          pristineTiles: pristine,
          entities: manager.getAllEntities(),
          villages: snapshot.villages,
          kingdoms: snapshot.kingdoms,
        });
      },
      herdInfo: (entity) => herds.describe(entity),
      villageInfo: (x: number, y: number) => settlements.describeVillage(x, y),
    });

    // Apply a queued save on top of the freshly generated world
    const pending = storeState.pendingSave;
    if (pending) {
      const size = tilesData.length;
      for (const delta of pending.tiles) {
        const x = Math.floor(delta.i / size);
        const y = delta.i % size;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const tile = tilesData[x][y];
        tile.height = delta.h;
        tile.type = delta.t;
        tile.structure = delta.s ? { type: delta.s, health: 100, level: 1 } : null;
        tile.ownerId = delta.o ?? null;
        tile.walkable = !['deep_ocean', 'ocean'].includes(tile.type) && tile.height >= 0.25;
        terrain.syncTile(tile, pending.world.timeOfDay, pending.world.season);
      }
      settlements.restore(pending.kingdoms, pending.villages);
      for (const savedEntity of pending.entities) {
        manager.restoreEntity(savedEntity);
      }
      useGameStore.getState().clearPendingSave();
    }

    setIsInitialized(true);
    useGameStore.getState().addEvent(
      pending
        ? `"${pending.label}" restored — year ${pending.world.year}, ${pending.world.season}`
        : `A new world awakens (seed ${worldSeed})`,
      'info',
    );
  // Only world identity belongs here: including the light/callback identities
  // would regenerate the whole world on every time-of-day change.
  }, [worldSeed, mapSize, worldTemplate, worldRevision, scene]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Handles mouse movement over the game world
   */
  const handleMouseMove = useCallback((event: MouseEvent) => {
    const rect = gl.domElement.getBoundingClientRect();
    mousePositionRef.current = {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
    };
  }, [gl]);

  // ---------------------------------------------------------------------
  // Tools
  // ---------------------------------------------------------------------

  /** Run a callback over every tile inside the current brush. */
  const forEachBrushTile = useCallback((center: Tile, radius: number, fn: (tile: Tile, distance: number) => void) => {
    if (radius <= 0) {
      fn(center, 0);
      return;
    }
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const nx = center.x + dx;
        const ny = center.y + dy;
        if (!inBounds(nx, ny)) continue;
        const distance = Math.hypot(dx, dy);
        if (distance > radius + 0.25) continue;
        fn(tilesRef.current[nx][ny], distance);
      }
    }
  }, [inBounds]);

  const igniteTile = useCallback((tile: Tile) => {
    if (tile.isOnFire || tile.height <= 0.25 || isWaterBiome(tile.type)) return;
    tile.isOnFire = true;
    tile.fireIntensity = 1;
    tile.fireFuel = FLAMMABLE_BIOMES.includes(tile.type) ? 6 : 2.5;
    burningTilesRef.current.add(tile);
    effectsManagerRef.current?.spawnFlame(tileWorldPosition(tile), tile.fireFuel);
    syncTile(tile);
  }, [tileWorldPosition, syncTile]);

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
    syncTile(tile);
  }, [syncTile]);

  /** Terraform a tile and keep its biome/height/visuals consistent. */
  const reshapeTile = useCallback((tile: Tile, height: number, type?: Tile['type']) => {
    tile.height = Math.max(0, Math.min(1, height));
    tile.type = type ?? determineBiome(tile.height, tile.moisture, tile.temperature);
    tile.scaledHeight = computeScaledHeight(tile.height, tile.type);
    tile.walkable = !['deep_ocean', 'ocean'].includes(tile.type) && tile.height >= 0.25;
    if (isWaterBiome(tile.type)) tile.structure = null;
    syncTile(tile);
  }, [syncTile]);

  const spawnableAnimalsFor = useCallback((tile: Tile): EntityType[] => {
    if (['shallow_water', 'river', 'lake'].includes(tile.type)) return ['fish'];
    if (tile.type.includes('forest') || tile.type === 'taiga') return ['wolf', 'bear', 'deer', 'bird', 'fox', 'snake'];
    if (tile.type === 'grassland' || tile.type === 'savanna') return ['rabbit', 'deer', 'bird', 'sheep', 'chicken', 'fox'];
    if (tile.type === 'mountains' || tile.type === 'hills') return ['bear', 'bird', 'sheep'];
    if (tile.type === 'desert' || tile.type === 'badlands' || tile.type === 'mesa') return ['snake', 'bird'];
    if (tile.type === 'swamp' || tile.type === 'marsh') return ['snake', 'bird', 'rabbit'];
    return ['bird', 'rabbit', 'chicken'];
  }, []);

  const spawnRace = useCallback((tile: Tile, type: EntityType) => {
    if (tile.height <= 0.25 || isWaterBiome(tile.type)) return;
    const spawned = entityManagerRef.current?.spawnEntity(type, tile.x, tile.y);
    if (spawned) tile.population += 1;
  }, []);

  const applyToolEffect = useCallback((tile: Tile, tool: string | null) => {
    if (!tile || !tool) return;
    const store = useGameStore.getState();
    const radius = BRUSH_TOOLS.has(tool) ? store.brushRadius : 0;

    switch (tool) {
      case 'raise-terrain':
        forEachBrushTile(tile, radius, (target, distance) => {
          const amount = 0.1 * (1 - distance / (radius + 1));
          if (target.height < 0.98) reshapeTile(target, target.height + amount);
        });
        soundManager.terraform();
        break;

      case 'lower-terrain':
        forEachBrushTile(tile, radius, (target, distance) => {
          const amount = 0.1 * (1 - distance / (radius + 1));
          if (target.height > 0.02) reshapeTile(target, target.height - amount);
        });
        soundManager.terraform();
        break;

      case 'place-water':
        forEachBrushTile(tile, radius, (target) => {
          if (target.height > 0.1) reshapeTile(target, 0.24, 'shallow_water');
        });
        soundManager.terraform();
        break;

      case 'place-mountain':
        forEachBrushTile(tile, radius, (target, distance) => {
          reshapeTile(target, 0.9 - distance * 0.12, 'mountains');
        });
        soundManager.terraform();
        break;

      case 'place-forest':
      case 'plant-trees':
        forEachBrushTile(tile, radius, (target) => {
          if (target.height <= 0.28 || target.height >= 0.78 || isWaterBiome(target.type)) return;
          target.type = target.temperature < 0.32 ? 'coniferous_forest' : 'deciduous_forest';
          target.structure = { type: 'mature_tree', health: 100, level: 2 };
          if (!target.resources.some(r => r.type === 'wood')) {
            target.resources.push({ type: 'wood', quantity: 6, discovered: true });
          }
          if (!target.resources.some(r => r.type === 'food')) {
            target.resources.push({ type: 'food', quantity: 4, discovered: true });
          }
          syncTile(target);
        });
        effectsManagerRef.current?.spawnBurst(tileWorldPosition(tile), 0x55cc55, 14, 1.5);
        soundManager.terraform();
        break;

      case 'spawn-human': forEachBrushTile(tile, 0, (t) => spawnRace(t, 'human')); break;
      case 'spawn-elf': forEachBrushTile(tile, 0, (t) => spawnRace(t, 'elf')); break;
      case 'spawn-dwarf': forEachBrushTile(tile, 0, (t) => spawnRace(t, 'dwarf')); break;
      case 'spawn-orc': forEachBrushTile(tile, 0, (t) => spawnRace(t, 'orc')); break;

      case 'spawn-animal': {
        const candidates = spawnableAnimalsFor(tile);
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        entityManagerRef.current?.spawnEntity(chosen, tile.x, tile.y);
        break;
      }

      case 'spawn-monster': {
        let monsterType: EntityType;
        if (tile.type === 'volcanic') monsterType = Math.random() < 0.7 ? 'dragon' : 'demon';
        else if (tile.type === 'corrupted') monsterType = Math.random() < 0.6 ? 'zombie' : 'skeleton';
        else if (tile.height > 0.7) monsterType = 'dragon';
        else {
          const monsters: EntityType[] = ['zombie', 'skeleton', 'demon', 'bandit'];
          monsterType = monsters[Math.floor(Math.random() * monsters.length)];
        }
        entityManagerRef.current?.spawnEntity(monsterType, tile.x, tile.y);
        break;
      }

      case 'unearth-minerals': {
        const mineralTypes = ['iron', 'gold', 'stone', 'coal', 'gem'] as const;
        forEachBrushTile(tile, radius, (target) => {
          const mineral = mineralTypes[Math.floor(Math.random() * mineralTypes.length)];
          target.resources.push({
            type: mineral,
            quantity: 5 + Math.floor(Math.random() * 10),
            discovered: true,
          });
        });
        effectsManagerRef.current?.spawnBurst(tileWorldPosition(tile), 0xffdd55, 16, 2);
        store.addEvent(`A vein of ore surfaced at (${tile.x}, ${tile.y})`, 'divine', { x: tile.x, y: tile.y });
        break;
      }

      case 'summon-rain': {
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
        forEachBrushTile(tile, radius, (target) => igniteTile(target));
        soundManager.fire();
        store.addEvent(`Divine fire ignites (${tile.x}, ${tile.y})`, 'disaster', { x: tile.x, y: tile.y });
        break;
      }

      case 'earthquake': {
        const quakeRadius = 4 + store.brushRadius * 2;
        forEachBrushTile(tile, quakeRadius, (target, distance) => {
          const shift = (Math.random() - 0.5) * 0.25 * (1 - distance / quakeRadius);
          target.structure = null;
          reshapeTile(target, target.height + shift);
        });
        const kills = entityManagerRef.current?.damageArea(tile.x, tile.y, quakeRadius, 35) ?? 0;
        effectsManagerRef.current?.spawnShockwave(tileWorldPosition(tile), 0xaa8855, 6);
        soundManager.earthquake();
        store.addEvent(
          `An earthquake reshapes the land${kills > 0 ? `, claiming ${kills} lives` : ''}`,
          'disaster',
          { x: tile.x, y: tile.y },
        );
        break;
      }

      case 'meteor': {
        const impact = tileWorldPosition(tile);
        const craterRadius = 3 + store.brushRadius;
        effectsManagerRef.current?.spawnMeteor(impact, () => {
          forEachBrushTile(tile, craterRadius, (target, distance) => {
            target.structure = null;
            const drop = 0.3 * (1 - distance / craterRadius);
            reshapeTile(target, target.height - drop, distance < 1.5 ? 'volcanic' : undefined);
            if (distance < 2.2 && FLAMMABLE_BIOMES.includes(target.type)) igniteTile(target);
          });
          const kills = entityManagerRef.current?.damageArea(tile.x, tile.y, craterRadius + 1, 80) ?? 0;
          soundManager.meteor();
          store.addEvent(
            `A meteor devastates the region${kills > 0 ? ` — ${kills} perished` : ''}`,
            'disaster',
            { x: tile.x, y: tile.y },
          );
        });
        break;
      }

      case 'lightning': {
        effectsManagerRef.current?.spawnLightning(tileWorldPosition(tile));
        soundManager.lightning();
        const kills = entityManagerRef.current?.damageArea(tile.x, tile.y, 1.2, 60) ?? 0;
        if (FLAMMABLE_BIOMES.includes(tile.type) && Math.random() < 0.6) igniteTile(tile);
        store.addEvent(
          `Lightning strikes (${tile.x}, ${tile.y})${kills > 0 ? ` — ${kills} slain` : ''}`,
          'disaster',
          { x: tile.x, y: tile.y },
        );
        break;
      }

      case 'blessing': {
        const blessRadius = 3 + store.brushRadius;
        const healed = entityManagerRef.current?.healArea(tile.x, tile.y, blessRadius + 1, 50) ?? 0;
        forEachBrushTile(tile, blessRadius, (target) => {
          target.fertility = Math.min(1, target.fertility + 0.3);
          if (target.type === 'corrupted' || target.type === 'badlands') {
            target.type = determineBiome(target.height, target.moisture, target.temperature);
          }
          if (target.isOnFire) extinguishTile(target, false);
          if (Math.random() < 0.35 && target.height > 0.25 && !target.resources.some(r => r.type === 'food')) {
            target.resources.push({ type: 'food', quantity: 5, discovered: true });
          }
          syncTile(target);
        });
        effectsManagerRef.current?.spawnAura(tileWorldPosition(tile), 0xffee88);
        soundManager.bless();
        store.addEvent(
          `A blessing radiates outward${healed > 0 ? `, healing ${healed} creatures` : ''}`,
          'divine',
          { x: tile.x, y: tile.y },
        );
        break;
      }

      case 'curse': {
        const curseRadius = 3 + store.brushRadius;
        forEachBrushTile(tile, curseRadius, (target) => {
          if (target.height <= 0.25) return;
          target.type = 'corrupted';
          target.fertility = Math.max(0, target.fertility - 0.5);
          target.structure = null;
          syncTile(target);
        });
        const kills = entityManagerRef.current?.damageArea(tile.x, tile.y, curseRadius, 25) ?? 0;
        effectsManagerRef.current?.spawnAura(tileWorldPosition(tile), 0x9922cc);
        soundManager.curse();
        store.addEvent(
          `Dark corruption spreads${kills > 0 ? ` — ${kills} souls claimed` : ''}`,
          'disaster',
          { x: tile.x, y: tile.y },
        );
        break;
      }
    }
  }, [forEachBrushTile, reshapeTile, igniteTile, extinguishTile, syncTile, tileWorldPosition, spawnRace, spawnableAnimalsFor]);

  /**
   * Handles mouse click on the game world
   */
  const handleMouseClick = useCallback((event: MouseEvent) => {
    if (!isInitialized) return;
    // Ignore clicks on UI panels; only act on the 3D canvas itself
    if (event.target !== gl.domElement) return;

    const mousePos = new THREE.Vector2(mousePositionRef.current.x, mousePositionRef.current.y);
    raycasterRef.current.setFromCamera(mousePos, camera);

    // Entities take priority when using the select tool
    const manager = entityManagerRef.current;
    if (manager) {
      const entities = manager.getAllEntities().filter(e => e.mesh);
      const entityIntersects = raycasterRef.current.intersectObjects(entities.map(e => e.mesh!), true);
      if (entityIntersects.length > 0) {
        const hit = entityIntersects[0].object;
        const clicked = entities.find(e => e.mesh === hit || e.mesh === hit.parent);
        if (clicked) {
          if (selectedTool === 'select') {
            useGameStore.getState().setSelectedEntity(clicked);
            useGameStore.getState().setSelectedTile(null);
            return;
          }
          const ex = Math.floor(clicked.position.x);
          const ey = Math.floor(clicked.position.y);
          if (inBounds(ex, ey)) applyToolEffect(tilesRef.current[ex][ey], selectedTool);
          return;
        }
      }
    }

    // Otherwise pick a terrain instance
    const terrain = terrainRef.current;
    if (!terrain) return;
    const hits = raycasterRef.current.intersectObject(terrain.pickTarget);
    if (hits.length === 0) return;

    const instanceId = hits[0].instanceId;
    if (instanceId === undefined) return;
    const { x, y } = terrain.tileCoordsFromInstanceId(instanceId);
    if (!inBounds(x, y)) return;

    const clickedTile = tilesRef.current[x][y];
    if (selectedTool === 'select') {
      useGameStore.getState().setSelectedTile(clickedTile);
      useGameStore.getState().setSelectedEntity(null);
    } else {
      applyToolEffect(clickedTile, selectedTool);
    }
  }, [isInitialized, selectedTool, camera, gl, applyToolEffect, inBounds]);

  /**
   * Update the selection indicator position and visibility
   */
  const updateSelectionIndicator = useCallback(() => {
    const indicator = selectionIndicatorRef.current;
    if (!indicator) return;

    const target = selectedTile;
    if (target) {
      const position = tileWorldPosition(target);
      indicator.visible = true;
      indicator.position.set(position.x, position.y + SELECTION_INDICATOR_HEIGHT / 2, position.z);
      indicator.rotation.z = Date.now() / 900;
      const pulse = 1 + Math.sin(Date.now() / 250) * 0.12;
      indicator.scale.set(pulse, pulse, 1);
    } else {
      indicator.visible = false;
    }
  }, [selectedTile, tileWorldPosition]);

  /** Spread, burn down, and extinguish fires. */
  const simulateFire = useCallback((delta: number) => {
    if (burningTilesRef.current.size === 0) return;
    const store = useGameStore.getState();
    const raining = store.weather !== 'clear';
    const canSpread = store.worldLaws.fireSpread && !raining;
    const toExtinguish: { tile: Tile; burned: boolean }[] = [];

    burningTilesRef.current.forEach(tile => {
      tile.fireFuel = (tile.fireFuel ?? 1) - delta * (raining ? 3 : 1);
      if (tile.fireFuel <= 0) {
        toExtinguish.push({ tile, burned: !raining });
        return;
      }
      entityManagerRef.current?.damageArea(tile.x, tile.y, 0.8, 8 * delta * 4, 'burned');
      if (canSpread && Math.random() < 0.12) {
        const dx = Math.floor(Math.random() * 3) - 1;
        const dy = Math.floor(Math.random() * 3) - 1;
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        if (inBounds(nx, ny)) {
          const neighbor = tilesRef.current[nx][ny];
          if (!neighbor.isOnFire && FLAMMABLE_BIOMES.includes(neighbor.type)) igniteTile(neighbor);
        }
      }
    });

    for (const { tile, burned } of toExtinguish) extinguishTile(tile, burned);
  }, [igniteTile, extinguishTile, inBounds]);

  /**
   * Slow world processes: food regrows, forests creep outward, corruption
   * spreads, scorched land recovers. Sampled rather than exhaustive so cost is
   * independent of map size.
   */
  const simulateEcology = useCallback(() => {
    const tiles = tilesRef.current;
    if (tiles.length === 0) return;
    const store = useGameStore.getState();
    const size = tiles.length;
    const samples = Math.max(24, Math.floor((size * size) / 220));
    const growthAllowed = store.worldLaws.biomeGrowth;
    const winter = store.season === 'winter';

    for (let i = 0; i < samples; i++) {
      const x = Math.floor(Math.random() * size);
      const y = Math.floor(Math.random() * size);
      const tile = tiles[x][y];
      if (tile.isOnFire || isWaterBiome(tile.type)) continue;

      // Food regrowth, driven by fertility and the season
      const food = tile.resources.find(r => r.type === 'food');
      const regrowthChance = tile.fertility * (winter ? 0.12 : 0.55);
      if (Math.random() < regrowthChance) {
        if (food) {
          food.quantity = Math.min(10, food.quantity + 1);
          food.discovered = true;
        } else if (tile.fertility > 0.35) {
          tile.resources.push({ type: 'food', quantity: 2, discovered: true });
        }
      }

      // Standing timber and exposed rock replenish, so a village that manages
      // its land can keep building instead of stripping the map bare once.
      const forested = ['deciduous_forest', 'coniferous_forest', 'rainforest', 'tropical_forest', 'taiga', 'enchanted_forest'].includes(tile.type);
      if (forested && !winter && Math.random() < 0.3) {
        const wood = tile.resources.find(r => r.type === 'wood');
        if (wood) wood.quantity = Math.min(10, wood.quantity + 1);
        else tile.resources.push({ type: 'wood', quantity: 2, discovered: true });
      }
      if ((tile.type === 'mountains' || tile.type === 'hills') && Math.random() < 0.2) {
        const stone = tile.resources.find(r => r.type === 'stone');
        if (stone) stone.quantity = Math.min(10, stone.quantity + 1);
        else tile.resources.push({ type: 'stone', quantity: 2, discovered: true });
      }

      if (!growthAllowed) continue;

      // Forests creep into fertile neighbours
      if (['deciduous_forest', 'coniferous_forest', 'rainforest', 'tropical_forest', 'taiga'].includes(tile.type)) {
        const dx = Math.floor(Math.random() * 3) - 1;
        const dy = Math.floor(Math.random() * 3) - 1;
        const nx = x + dx;
        const ny = y + dy;
        if (inBounds(nx, ny)) {
          const neighbor = tiles[nx][ny];
          if (
            (neighbor.type === 'grassland' || neighbor.type === 'hills') &&
            neighbor.moisture > 0.45 &&
            neighbor.fertility > 0.4 &&
            !neighbor.villageId &&
            Math.random() < 0.25
          ) {
            neighbor.type = tile.type;
            neighbor.structure = { type: 'young_tree', health: 100, level: 1 };
            neighbor.resources.push({ type: 'wood', quantity: 4, discovered: true });
            syncTile(neighbor);
          }
        }
      }

      // Corruption creeps, but only slowly
      if (tile.type === 'corrupted' && Math.random() < 0.12) {
        const dx = Math.floor(Math.random() * 3) - 1;
        const dy = Math.floor(Math.random() * 3) - 1;
        if (inBounds(x + dx, y + dy)) {
          const neighbor = tiles[x + dx][y + dy];
          if (neighbor.height > 0.25 && !isWaterBiome(neighbor.type) && neighbor.type !== 'corrupted') {
            neighbor.type = 'corrupted';
            neighbor.structure = null;
            neighbor.fertility = Math.max(0, neighbor.fertility - 0.3);
            syncTile(neighbor);
          }
        }
      }

      // Burned ground slowly heals
      if (tile.type === 'badlands' && tile.moisture > 0.4 && Math.random() < 0.08) {
        tile.fertility = Math.min(1, tile.fertility + 0.15);
        if (tile.fertility > 0.5) {
          tile.type = determineBiome(tile.height, tile.moisture, tile.temperature);
          syncTile(tile);
        }
      }
    }
  }, [inBounds, syncTile]);

  /** Re-tint every tile after a time-of-day or season change. */
  const refreshWorldColors = useCallback(() => {
    const state = useGameStore.getState();
    terrainRef.current?.refreshColors(state.timeOfDay, state.season);
  }, []);

  /** Follow a unit or fly to a requested tile. */
  const updateCamera = useCallback((delta: number) => {
    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
    if (!orbit?.target) return;
    const store = useGameStore.getState();

    // Camera jump requested by the minimap or the chronicle
    if (store.cameraTarget && store.cameraTarget.nonce !== lastCameraNonceRef.current) {
      lastCameraNonceRef.current = store.cameraTarget.nonce;
      const { x, y } = store.cameraTarget;
      if (inBounds(x, y)) {
        const position = tileWorldPosition(tilesRef.current[x][y]);
        const offset = camera.position.clone().sub(orbit.target);
        orbit.target.copy(position);
        camera.position.copy(position).add(offset);
        orbit.update?.();
      }
    }

    // Spectate mode
    if (store.followEntityId) {
      const entity = entityManagerRef.current?.getEntityById(store.followEntityId);
      if (!entity) {
        store.setFollowEntity(null);
      } else {
        const ex = Math.floor(entity.position.x);
        const ey = Math.floor(entity.position.y);
        if (inBounds(ex, ey)) {
          const tile = tilesRef.current[ex][ey];
          const desired = new THREE.Vector3(
            (entity.position.x - tilesRef.current.length / 2 + 0.5) * TILE_SIZE,
            tile.scaledHeight,
            (entity.position.y - tilesRef.current.length / 2 + 0.5) * TILE_SIZE,
          );
          const offset = camera.position.clone().sub(orbit.target);
          const lerp = Math.min(1, delta * 4);
          orbit.target.lerp(desired, lerp);
          camera.position.copy(orbit.target).add(offset);
          orbit.update?.();
        }
      }
    }
  }, [controls, camera, inBounds, tileWorldPosition]);

  /**
   * Game tick logic
   */
  const gameTick = useCallback((deltaTime: number) => {
    // Effects and camera keep running while paused so the world still breathes
    effectsManagerRef.current?.update(deltaTime);
    updateCamera(deltaTime);

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

    if (isGamePaused) return;

    const store = useGameStore.getState();
    publishSimulationContext(store.worldLaws, store.season, store.timeOfDay);

    const scaledDelta = deltaTime * gameSpeed;
    tickTimerRef.current += scaledDelta;

    entityManagerRef.current?.update(scaledDelta);
    herdRef.current?.update(scaledDelta);
    settlementRef.current?.update(scaledDelta);

    // Advance the day/night cycle
    phaseTimerRef.current += scaledDelta;
    if (phaseTimerRef.current >= SECONDS_PER_DAY_PHASE) {
      phaseTimerRef.current = 0;
      const store = useGameStore.getState();
      const nextPhase = TIME_PHASES[(TIME_PHASES.indexOf(store.timeOfDay) + 1) % TIME_PHASES.length];
      store.setTimeOfDay(nextPhase);
      if (nextPhase === 'dawn') store.advanceDay();
      refreshWorldColors();
      soundManager.setMusicMood(
        store.season === 'winter' || store.season === 'autumn' ? 'dark' : 'bright',
      );
    }

    // Weather drifts on its own
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

    // Fixed-cadence simulation steps
    const tickInterval = 0.25;
    while (tickTimerRef.current >= tickInterval) {
      tickTimerRef.current -= tickInterval;
      simulateFire(tickInterval);
    }

    ecologyTimerRef.current += scaledDelta;
    if (ecologyTimerRef.current >= 2.5) {
      ecologyTimerRef.current = 0;
      simulateEcology();
    }

    // Publish stats and drive weather visuals
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

      // Autosave on a wall-clock timer so a long session is never lost.
      autosaveTimerRef.current += 1;
      if (autosaveTimerRef.current >= 150) {
        autosaveTimerRef.current = 0;
        const access = worldAccess.current;
        if (access) {
          writeSave('autosave', access.captureSave(`Year ${store.year}, ${store.season}`));
        }
      }
    }
  }, [isGamePaused, gameSpeed, scene, refreshWorldColors, simulateFire, simulateEcology, updateCamera]);

  // Initialize the world when the seed, size, template or revision changes
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
    if (!isInitialized) return;
    setupLights();
    refreshWorldColors();
  }, [isInitialized, timeOfDay, season, setupLights, refreshWorldColors]);

  // Let the AI (pyromaniac trait) and raids set tiles alight
  useEffect(() => {
    simulation.igniteTile = (x: number, y: number) => {
      if (!inBounds(x, y)) return;
      igniteTile(tilesRef.current[x][y]);
    };
    return () => {
      simulation.igniteTile = undefined;
    };
  }, [igniteTile, inBounds]);

  // React to manual weather changes from the toolbar
  useEffect(() => {
    if (!isInitialized) return;
    if (weather !== 'clear') effectsManagerRef.current?.startRain();
    else effectsManagerRef.current?.stopRain();
  }, [isInitialized, weather]);

  // Keep the entity simulation in sync with the world laws panel
  const worldLaws = useGameStore((state) => state.worldLaws);
  useEffect(() => {
    entityManagerRef.current?.setWorldLaws(worldLaws);
    settlementRef.current?.setWorldLaws(worldLaws);
  }, [worldLaws, isInitialized]);

  // Animation frame update
  useFrame((_, deltaTime) => {
    if (!isInitialized) return;
    // Point sprites are sized in pixels, so convert world units to pixels for
    // the current viewport and field of view.
    const perspective = camera as THREE.PerspectiveCamera;
    const halfFov = THREE.MathUtils.degToRad(perspective.fov ?? 55) / 2;
    const pixelScale = (gl.domElement.height * 0.5) / Math.tan(halfFov);
    terrainRef.current?.setViewportScale(pixelScale);
    settlementRef.current?.setViewportScale(pixelScale);
    updateSelectionIndicator();
    gameTick(Math.min(deltaTime, 0.1));
  });

  // Test/debug bridge: lets automated tests and the console drive the world
  // without going through the DOM. Read-only handles, no behaviour of its own.
  useEffect(() => {
    if (!isInitialized) return;
    const bridge = {
      get tiles() { return tilesRef.current; },
      get entities() { return entityManagerRef.current?.getAllEntities() ?? []; },
      get camera() { return camera; },
      get terrain() { return terrainRef.current; },
      spawn: (type: EntityType, x: number, y: number) =>
        entityManagerRef.current?.spawnEntity(type, x, y) ?? null,
      useTool: (tool: string, x: number, y: number) => {
        if (!inBounds(x, y)) return;
        applyToolEffect(tilesRef.current[x][y], tool);
      },
      get settlements() { return settlementRef.current; },
      get herds() { return herdRef.current; },
      /** Move the camera to a tile at a given height, for tests and debugging. */
      lookAt: (x: number, y: number, height = 6) => {
        if (!inBounds(x, y)) return;
        const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
        const position = tileWorldPosition(tilesRef.current[x][y]);
        camera.position.set(position.x, position.y + height, position.z + height * 0.7);
        if (orbit?.target) {
          orbit.target.copy(position);
          orbit.update?.();
        }
      },
      store: useGameStore,
    };
    (window as unknown as { __aetheria?: typeof bridge }).__aetheria = bridge;
  }, [isInitialized, camera, controls, inBounds, applyToolEffect, tileWorldPosition]);

  return {
    tilesRef,
    terrainRef,
    entityManagerRef,
    isInitialized,
  };
};
