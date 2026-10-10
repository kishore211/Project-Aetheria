import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';

import { useGameStore } from '../store/gameStore';
import { generateWorld, determineBiome } from '../utils/worldGenerator';
import { WorldBehaviour, type WorldContext } from '../utils/worldBehaviour';
import { MELT, addHeat } from '../utils/thermal';
import { CloudSystem, DROPS, type DropKind } from '../utils/clouds';
import { FLASH_SECONDS } from '../utils/statusEffects';
import { BORN_SAPIENT } from '../utils/entitySystemMinimal';
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
import { UnitIconLayer } from '../utils/unitIconLayer';
import { FLAMMABLE_BIOMES, FireSystem } from '../utils/fireSystem';
import { publishWorldAccess } from '../utils/worldAccess';
import { writeSave } from '../utils/saveSystem';
import { worldAccess } from '../utils/worldAccess';
import { buildSave } from '../utils/saveSystem';
import { publishSimulationContext, simulation } from '../utils/simulation';
import { advanceFloaters, clearFloaters, floatBridge } from '../utils/floatBridge';
import { runExtraPower, PowerHazards, type PowerContext } from '../utils/extraPowers';
import { heldDirection } from '../utils/possession';
import { RelationLines } from '../utils/relationLines';
import { advanceShots, clearShots, ShotLayer } from '../utils/shotBridge';
import { describeItem, onItemEvent, type ItemEvent } from '../utils/equipment';
import { clearImpacts, isShaking, requestFlash, requestShake, sampleShake } from '../utils/impactBridge';
import { chronicle, toll } from '../utils/chronicle';
import { applyScenario, type Scenario } from '../utils/scenarios';
import { nudgeMood } from '../utils/mood';
import { AGES, AGE_LENGTH, nextAge, type AgeAction } from '../utils/ages';
import { resetPlotIds } from '../utils/plots';
import { resetIdentity } from '../utils/identity';
import { viewFraction, visibleWorldSpan } from '../utils/cameraView';
import { ageBridge } from '../utils/ageBridge';
import { recordDeath, resetStats, sampleWorld } from '../utils/worldStats';

/** Mirrors entitySystemMinimal: only the sentient races get bubbles. */
const SPEAKING_RACES = new Set<string>(['human', 'elf', 'dwarf', 'orc']);

/**
 * Which material a tile sounds like under the brush.
 *
 * Grouped by what the ear expects rather than by biome family: mesa and
 * badlands are stone even though they are technically dry soil, because they
 * look like rock.
 */
const terraformVoiceFor = (tile: Tile): TerraformVoice => {
  if (isWaterBiome(tile.type)) return 'water';
  if (tile.type === 'beach' || tile.type === 'desert') return 'sand';
  if (tile.type.includes('forest') || tile.type === 'taiga') return 'forest';
  if (
    tile.type === 'mountains' || tile.type === 'hills'
    || tile.type === 'mesa' || tile.type === 'badlands' || tile.type === 'volcanic'
  ) return 'stone';
  return 'soil';
};
import { labelBridge, publishLabels, type MapLabel } from '../utils/labelBridge';
import { soundManager, type TerraformVoice } from '../utils/soundManager';

// Constants for game engine
const SELECTION_INDICATOR_HEIGHT = 0.1;
/**
 * Pacing. These four numbers decide how busy the world feels, and the first
 * pass had them all too fast: a full day took 80 seconds, so the sky was in
 * near-constant transition, and rain arrived every couple of minutes.
 *
 * A day is now ~2.8 minutes at 1x, which is slow enough that dusk reads as an
 * event rather than as flicker, and most play happens at 2-3x anyway.
 */
const SECONDS_PER_DAY_PHASE = 42;
/** How often the weather is reconsidered. */
const WEATHER_INTERVAL = 30;
/** Chance rain starts on a given roll, before the season is taken into account. */
const RAIN_START_CHANCE = 0.055;
/** Chance rain stops on a given roll. */
const RAIN_STOP_CHANCE = 0.34;
/** Wet springs, dry summers. */
const RAIN_SEASON_FACTOR: Record<string, number> = {
  spring: 1.6,
  summer: 0.45,
  autumn: 1.35,
  winter: 0.9,
};
const TIME_PHASES: TimeOfDay[] = ['dawn', 'day', 'dusk', 'night'];
const SKY_COLORS: Record<TimeOfDay, THREE.Color> = {
  dawn: new THREE.Color('#5b4670'),
  day: new THREE.Color('#7cabce'),
  dusk: new THREE.Color('#6a3f5c'),
  // Night used to be near-black, which hid the map for a quarter of every day
  night: new THREE.Color('#141d33'),
};
/** Tools that paint an area and therefore honour the brush size. */
const BRUSH_TOOLS = new Set([
  'raise-terrain', 'lower-terrain', 'place-water', 'place-mountain',
  'place-forest', 'plant-trees', 'unearth-minerals', 'fire',
]);

/**
 * Custom hook for the game engine logic
 */
/**
 * The chronicle line for an item, or null for the ones nobody would care
 * about. A copper sword changing hands is not news; a named one is.
 */
const itemEventLine = (event: ItemEvent): string | null => {
  const { item, owner } = event;
  const notable = item.name !== null || item.quality === 'masterwork';
  switch (event.kind) {
    case 'forged':
      return `${owner.name} is handed ${item.name}, a legendary ${item.material} ${item.kind === 'armor' ? 'armour' : item.kind} forged in ${item.madeIn}`;
    case 'named':
      return `${owner.name}'s blade has killed enough to earn a name: ${item.name}`;
    case 'looted':
      return notable ? `${owner.name} takes ${item.name ?? describeItem(item).toLowerCase()} from the body of ${event.from.name}` : null;
    case 'broke':
      return item.name ? `${item.name} shatters in the hands of ${owner.name}` : null;
  }
};

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
    mapLayer,
  } = useGameStore();

  // Three.js references and state
  const tilesRef = useRef<Tile[][]>([]);
  const terrainRef = useRef<TerrainRenderer | null>(null);
  const mousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const selectionIndicatorRef = useRef<THREE.Mesh | null>(null);
  const relationLinesRef = useRef<RelationLines | null>(null);
  const shotLayerRef = useRef<ShotLayer | null>(null);
  const lightsRef = useRef<THREE.Light[]>([]);
  const tickTimerRef = useRef<number>(0);
  const entityManagerRef = useRef<EntityManager | null>(null);
  const effectsManagerRef = useRef<EffectsManager | null>(null);
  const settlementRef = useRef<SettlementSystem | null>(null);
  const herdRef = useRef<HerdSystem | null>(null);
  const unitIconsRef = useRef<UnitIconLayer | null>(null);
  const iconTimerRef = useRef<number>(0);
  const fireRef = useRef<FireSystem | null>(null);
  const phaseTimerRef = useRef<number>(0);
  const weatherTimerRef = useRef<number>(0);
  const statsTimerRef = useRef<number>(0);
  /**
   * The world's ambient processes, on one clock.
   *
   * Held in a ref rather than rebuilt: each row carries its own countdown, and
   * a scheduler recreated on every render is a scheduler that never fires.
   */
  const worldBehaviourRef = useRef<WorldBehaviour>(new WorldBehaviour());
  /** Drifting clouds and whatever they are carrying. See `clouds.ts`. */
  const cloudsRef = useRef<CloudSystem>(new CloudSystem());
  /** Tornadoes, eruptions and geysers: powers that keep going after the click. */
  const hazardsRef = useRef<PowerHazards>(new PowerHazards());
  const autosaveTimerRef = useRef<number>(0);
  const lastCameraNonceRef = useRef<number>(0);
  const lastZoomNonceRef = useRef<number>(0);
  const shakingRef = useRef<boolean>(false);
  const ageTimerRef = useRef<number>(0);
  const ageActionTimerRef = useRef<number>(0);
  const ageSlotRef = useRef<number>(0);
  const hoverTimerRef = useRef<number>(0);
  const hoverKeyRef = useRef<string>('');
  const brushPreviewRef = useRef<THREE.Mesh | null>(null);
  const hoverTileRef = useRef<Tile | null>(null);
  const labelTimerRef = useRef<number>(0);
  const projectionRef = useRef<THREE.Vector3>(new THREE.Vector3());

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

    const ambientIntensity = timeOfDay === 'night' ? 1.35
      : timeOfDay === 'dawn' || timeOfDay === 'dusk' ? 1.6
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
    unitIconsRef.current?.dispose();
    unitIconsRef.current = null;
    terrainRef.current?.dispose();
    terrainRef.current = null;
    publishWorldAccess(null);
    publishLabels([]);
    clearFloaters();
    clearImpacts();
    resetStats();
    resetPlotIds();
    resetIdentity();
    relationLinesRef.current?.dispose();
    relationLinesRef.current = null;
    if (shotLayerRef.current) scene.remove(shotLayerRef.current.lines);
    shotLayerRef.current?.dispose();
    shotLayerRef.current = null;
    clearShots();
    onItemEvent(null);
    if (selectionIndicatorRef.current) {
      scene.remove(selectionIndicatorRef.current);
      selectionIndicatorRef.current.geometry.dispose();
      (selectionIndicatorRef.current.material as THREE.Material).dispose();
      selectionIndicatorRef.current = null;
    }
    if (brushPreviewRef.current) {
      scene.remove(brushPreviewRef.current);
      brushPreviewRef.current.geometry.dispose();
      (brushPreviewRef.current.material as THREE.Material).dispose();
      brushPreviewRef.current = null;
    }
    fireRef.current?.clear();
    fireRef.current = null;

    const storeState = useGameStore.getState();
    const { tilesData } = generateWorld({
      seed: worldSeed,
      mapSize,
      template: worldTemplate,
    });
    tilesRef.current = tilesData;

    // Build the instanced terrain
    const terrain = new TerrainRenderer(tilesData, storeState.timeOfDay, storeState.season);
    // Lets an edit upload only the patch it touched instead of the whole map.
    terrain.setRenderer(gl);
    // A new world inherits the layer you were looking through. Snapping back to
    // natural on every regeneration would be the kind of small betrayal that
    // makes an interface feel like it is not listening.
    terrain.setMapLayer(storeState.mapLayer, storeState.timeOfDay, storeState.season);
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
    relationLinesRef.current = new RelationLines();
    scene.add(relationLinesRef.current.lines);
    shotLayerRef.current = new ShotLayer();
    scene.add(shotLayerRef.current.lines);
    onItemEvent((event) => {
      const line = itemEventLine(event);
      if (line) useGameStore.getState().addEvent(line, 'info', { ...event.owner.position });
    });

    // Brush preview: shows exactly which tiles a power will touch before the
    // player commits. Area tools were previously a guess.
    const previewGeometry = new THREE.RingGeometry(TILE_SIZE * 0.42, TILE_SIZE * 0.5, 40);
    const previewMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff0c0,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    const preview = new THREE.Mesh(previewGeometry, previewMaterial);
    preview.rotation.x = -Math.PI / 2;
    preview.visible = false;
    preview.renderOrder = 2;
    brushPreviewRef.current = preview;
    scene.add(preview);

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
    // The sprites are the effects manager's; what falls out of them is not.
    const sky = effectsManagerRef.current.cloudSprites();
    cloudsRef.current.adopt(sky.sprites, sky.area);

    // Entities
    const manager = new EntityManager(tilesData, scene, camera);
    entityManagerRef.current = manager;
    manager.setPopulationDensity(storeState.entityPopulationDensity);
    manager.setWorldLaws(storeState.worldLaws);
    manager.onLifeEvent = (message, kind, position) => {
      useGameStore.getState().addEvent(message, kind, position);
    };
    manager.onEntityDeath = (entity, cause) => {
      recordDeath(cause);
      settlementRef.current?.forgetPlotter(entity.id);
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
      onVillagesChanged: (summaries) => {
        useGameStore.getState().setVillages(summaries);
      },
      onPlotsChanged: (summaries) => {
        useGameStore.getState().setPlots(summaries);
      },
      onIdentitiesChanged: (rows) => {
        useGameStore.getState().setIdentities(rows);
      },
      onOpinionsChanged: (rows) => {
        useGameStore.getState().setOpinions(rows);
      },
    });
    settlementRef.current = settlements;
    settlements.setWorldLaws(storeState.worldLaws);

    // Animals travel in families; see utils/herdSystem.ts
    const herds = new HerdSystem(tilesData, manager);
    herdRef.current = herds;

    // Fire lives in its own system so its spread rate can be tested; see
    // utils/fireSystem.ts for why that matters.
    const fire = new FireSystem(tilesData, {
      onIgnite: (tile) => {
        effectsManagerRef.current?.spawnFlame(tileWorldPosition(tile), tile.fireFuel ?? 4);
        syncTile(tile);
      },
      // The scorching itself is the fire system's business; we only repaint.
      onExtinguish: (tile) => syncTile(tile),
      onDamage: (x, y, radius, amount) => {
        entityManagerRef.current?.damageArea(x, y, radius, amount, 'burned');
      },
    });
    fireRef.current = fire;

    // Icons above heads: profession and current activity
    const unitIcons = new UnitIconLayer(scene);
    unitIconsRef.current = unitIcons;
    unitIcons.setVisible(storeState.showUnitIcons);


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
          span: visibleWorldSpan(camera, target) / TILE_SIZE,
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
    fireRef.current?.ignite(tile);
  }, []);

  const extinguishTile = useCallback((tile: Tile, burned: boolean) => {
    fireRef.current?.extinguish(tile, burned);
  }, []);

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
    if (['shallow_water', 'river', 'lake'].includes(tile.type)) return ['fish', 'fish', 'piranha'];
    if (tile.type === 'enchanted_forest') return ['unicorn', 'fairy', 'deer'];
    if (tile.type === 'rainforest' || tile.type === 'tropical_forest') return ['monkey', 'snake', 'frog', 'bird'];
    if (tile.type.includes('forest') || tile.type === 'taiga') return ['wolf', 'bear', 'deer', 'bird', 'fox', 'snake', 'pig'];
    if (tile.type === 'savanna') return ['buffalo', 'hyena', 'rhino', 'snake', 'bird', 'ostrich'];
    if (tile.type === 'beach') return ['crab', 'turtle', 'seal'];
    if (['snow', 'tundra', 'ice', 'glacier'].includes(tile.type)) return ['penguin', 'wolf', 'seal', 'polar_bear'];
    if (tile.type === 'grassland') return ['rabbit', 'deer', 'bird', 'sheep', 'chicken', 'fox', 'cow', 'pig', 'cat', 'dog', 'bee', 'butterfly', 'grasshopper'];
    if (tile.type === 'mountains' || tile.type === 'hills') return ['bear', 'bird', 'sheep', 'goat'];
    if (tile.type === 'desert' || tile.type === 'badlands' || tile.type === 'mesa') return ['snake', 'bird', 'camel', 'beetle'];
    if (tile.type === 'swamp' || tile.type === 'marsh') return ['snake', 'bird', 'frog', 'crocodile', 'flamingo'];
    if (tile.type === 'candy') return ['gummy_bear', 'lil_pumpkin'];
    return ['bird', 'rabbit', 'chicken'];
  }, []);

  const spawnRace = useCallback((tile: Tile, type: EntityType): boolean => {
    if (tile.height <= 0.25 || isWaterBiome(tile.type)) return false;
    const spawned = entityManagerRef.current?.spawnEntity(type, tile.x, tile.y);
    if (!spawned) return false;
    tile.population += 1;
    return true;
  }, []);

  /**
   * Put something in the sky over a place.
   *
   * Reports when it cannot rather than swallowing it: every cloud already
   * being busy is a real answer, and a power that silently does nothing is
   * worse than one that says so.
   */
  const summonCloud = useCallback((kind: DropKind, x: number, y: number): void => {
    const sent = cloudsRef.current.summon(kind, x, y, tilesRef.current.length);
    if (!sent) {
      useGameStore.getState().addEvent('The sky is already full', 'info');
      return;
    }
    const herald = DROPS[kind].herald;
    if (herald) useGameStore.getState().addEvent(herald, 'divine', { x, y });
  }, []);

  /**
   * Let the people standing in a divine act feel it.
   *
   * This used to only make a couple of them say something. Now it goes through
   * the scenario table, so being blessed means a mood change, a status and
   * possibly a line — one door for the whole event rather than three places
   * that could disagree about what happened.
   *
   * No cap on how many are affected. A whole village showing happy faces after
   * a blessing is the feedback we want, and speech is already rationed
   * globally in floatBridge, so the crowd does not all talk at once.
   */
  const reactNearby = useCallback((tile: Tile, radius: number, scenario: Scenario) => {
    const witnesses = entityManagerRef.current?.query(tile.x, tile.y, radius + 1) ?? [];
    for (const witness of witnesses) {
      if (!SPEAKING_RACES.has(witness.type)) continue;
      applyScenario(witness, scenario);
    }
  }, []);

  /** What the powers in utils/extraPowers.ts are allowed to touch. */
  const powerContext = useCallback((): PowerContext => {
    const store = useGameStore.getState();
    const fxAt = (tile: Tile) => tileWorldPosition(tile);
    return {
      tiles: tilesRef.current,
      brushRadius: store.brushRadius,
      inBounds,
      forEachBrushTile,
      reshape: (tile, height, type) => reshapeTile(tile, height, type),
      sync: syncTile,
      ignite: (tile) => Boolean(fireRef.current?.ignite(tile)),
      extinguish: (tile) => extinguishTile(tile, false),
      query: (x, y, radius) => entityManagerRef.current?.query(x, y, radius) ?? [],
      spawn: (type, x, y, subspecies) =>
        entityManagerRef.current?.spawnEntity(type, x, y, { subspecies: subspecies ?? null }) ?? null,
      damageArea: (x, y, radius, damage) => entityManagerRef.current?.damageArea(x, y, radius, damage) ?? 0,
      healArea: (x, y, radius, amount) => entityManagerRef.current?.healArea(x, y, radius, amount) ?? 0,
      demolishAt: (x, y) => { settlementRef.current?.demolishAt(x, y); },
      cancelPlotsBy: (id) => settlementRef.current?.cancelPlotsBy(id, 'blessed') ?? 0,
      diplomacy: (act, x, y) => settlementRef.current?.intervene(act, x, y) ?? null,
      summonCloud,
      announce: (message, kind, position) => store.addEvent(message, kind, position),
      fx: {
        burst: (tile, color, count, speed) => effectsManagerRef.current?.spawnBurst(fxAt(tile), color, count, speed),
        aura: (tile, color) => effectsManagerRef.current?.spawnAura(fxAt(tile), color),
        shockwave: (tile, color, radius) => effectsManagerRef.current?.spawnShockwave(fxAt(tile), color, radius),
      },
      sound: {
        terraform: (voice) => soundManager.terraform(voice),
        boom: () => soundManager.meteor(),
        quake: () => soundManager.earthquake(),
        fire: () => soundManager.fire(),
        bless: () => soundManager.bless(),
        curse: () => soundManager.curse(),
        click: () => soundManager.uiClick(),
      },
      shake: requestShake,
      flash: requestFlash,
      random: Math.random,
    };
  }, [inBounds, forEachBrushTile, reshapeTile, syncTile, extinguishTile, tileWorldPosition, summonCloud]);

  const applyToolEffect = useCallback((tile: Tile, tool: string | null): boolean => {
    if (!tile || !tool) return false;
    const store = useGameStore.getState();
    const radius = BRUSH_TOOLS.has(tool) ? store.brushRadius : 0;
    // Powers report whether they actually did something, so a refused click can
    // say so instead of looking like a broken game.
    let acted = true;

    switch (tool) {
      case 'raise-terrain':
        forEachBrushTile(tile, radius, (target, distance) => {
          const amount = 0.1 * (1 - distance / (radius + 1));
          if (target.height < 0.98) reshapeTile(target, target.height + amount);
        });
        // The voice comes from the ground actually under the brush, so dragging
        // across a coastline audibly changes material. That is the whole point
        // of having more than one — a fixed voice would just be a second click.
        soundManager.terraform(terraformVoiceFor(tile));
        break;

      case 'lower-terrain':
        forEachBrushTile(tile, radius, (target, distance) => {
          const amount = 0.1 * (1 - distance / (radius + 1));
          if (target.height > 0.02) reshapeTile(target, target.height - amount);
        });
        soundManager.terraform(terraformVoiceFor(tile));
        break;

      case 'place-water':
        forEachBrushTile(tile, radius, (target) => {
          if (target.height > 0.1) reshapeTile(target, 0.24, 'shallow_water');
        });
        soundManager.terraform('water');
        break;

      case 'place-mountain':
        forEachBrushTile(tile, radius, (target, distance) => {
          reshapeTile(target, 0.9 - distance * 0.12, 'mountains');
        });
        soundManager.terraform('stone');
        break;

      case 'place-forest':
      case 'plant-trees':
        acted = false;
        forEachBrushTile(tile, radius, (target) => {
          if (target.height <= 0.28 || target.height >= 0.78 || isWaterBiome(target.type)) return;
          acted = true;
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
        if (!acted) break;
        effectsManagerRef.current?.spawnBurst(tileWorldPosition(tile), 0x55cc55, 14, 1.5);
        soundManager.terraform('forest');
        break;

      case 'spawn-human': acted = spawnRace(tile, 'human'); break;
      case 'spawn-elf': acted = spawnRace(tile, 'elf'); break;
      case 'spawn-dwarf': acted = spawnRace(tile, 'dwarf'); break;
      case 'spawn-orc': acted = spawnRace(tile, 'orc'); break;

      case 'uplift': {
        // One power, both directions. Making waking and un-waking two separate
        // buttons would be two entries on a bar that is already long, and it
        // would hide the thing that makes this interesting — that it is
        // reversible, and that you can take it back.
        const radius = 1 + store.brushRadius;
        const near = entityManagerRef.current?.query(tile.x, tile.y, radius) ?? [];
        const animals = near.filter(creature => !BORN_SAPIENT.has(creature.type));
        if (animals.length === 0) { acted = false; break; }

        // Whichever way the majority needs to go, so a second click on the
        // same spot undoes the first rather than flickering half of them.
        const woken = animals.filter(creature => creature.uplifted).length;
        const waking = woken * 2 < animals.length;
        for (const creature of animals) {
          creature.uplifted = waking;
          if (waking && !creature.happiness) creature.happiness = 0;
          creature.flashFor = FLASH_SECONDS;
        }
        effectsManagerRef.current?.spawnAura(tileWorldPosition(tile), waking ? 0x9fe8ff : 0x8f7a5a);
        soundManager.bless();
        store.addEvent(
          waking
            ? `${animals.length === 1 ? 'A creature wakes' : `${animals.length} creatures wake`} into something that can wonder about it`
            : `${animals.length === 1 ? 'A mind is' : `${animals.length} minds are`} laid gently back down`,
          'divine',
          { x: tile.x, y: tile.y },
        );
        break;
      }

      case 'spawn-animal': {
        const candidates = spawnableAnimalsFor(tile);
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        acted = Boolean(entityManagerRef.current?.spawnEntity(chosen, tile.x, tile.y));
        break;
      }

      case 'spawn-monster': {
        let monsterType: EntityType;
        if (tile.type === 'volcanic' || tile.type === 'infernal') monsterType = Math.random() < 0.5 ? 'dragon' : Math.random() < 0.5 ? 'demon' : 'fire_skull';
        else if (tile.type === 'corrupted') monsterType = Math.random() < 0.4 ? 'zombie' : Math.random() < 0.5 ? 'skeleton' : 'necromancer';
        else if (['snow', 'tundra', 'ice', 'glacier'].includes(tile.type)) monsterType = 'cold_one';
        else if (tile.type === 'desert') monsterType = 'sand_spider';
        else if (tile.height > 0.7) monsterType = 'dragon';
        else {
          const monsters: EntityType[] = ['zombie', 'skeleton', 'demon', 'bandit', 'ghost', 'mage', 'alien', 'acid_blob', 'fire_skull', 'necromancer'];
          monsterType = monsters[Math.floor(Math.random() * monsters.length)];
        }
        acted = Boolean(entityManagerRef.current?.spawnEntity(monsterType, tile.x, tile.y));
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
        acted = false;
        forEachBrushTile(tile, radius, (target) => {
          if (fireRef.current?.ignite(target)) acted = true;
        });
        if (!acted) break;
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
        requestShake(18 + store.brushRadius * 8, 1.1);
        effectsManagerRef.current?.spawnShockwave(tileWorldPosition(tile), 0xaa8855, 6);
        soundManager.earthquake();
        store.addEvent(
          chronicle('quake') + toll('dead', kills),
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
            // Heat, dumped in rather than applied: the thermal ladder then
            // decides what that means for each tile, so the crater cooks its
            // way outward over the following seconds and cools back over the
            // following minutes without any of that being written here.
            //
            // This is the only source in the game that arrives all at once and
            // can therefore reach the top rung. A fire settles below it by
            // design; a meteor is supposed to leave lava behind.
            addHeat(target, MELT * 1.4 * (1 - distance / (craterRadius + 1)));
          });
          const kills = entityManagerRef.current?.damageArea(tile.x, tile.y, craterRadius + 1, 80) ?? 0;
          soundManager.meteor();
          // Scaled to the crater, so a 5x5 meteor lands harder than a 1x1
          requestShake(26 + store.brushRadius * 10, 0.7);
          requestFlash('impact', 0.9);
          store.addEvent(
            chronicle('meteor') + toll('dead', kills),
            'disaster',
            { x: tile.x, y: tile.y },
          );
        });
        break;
      }

      case 'lightning': {
        effectsManagerRef.current?.spawnLightning(tileWorldPosition(tile));
        soundManager.lightning();
        requestShake(9, 0.3);
        requestFlash('impact', 0.55);
        const kills = entityManagerRef.current?.damageArea(tile.x, tile.y, 1.2, 60) ?? 0;
        if (FLAMMABLE_BIOMES.includes(tile.type) && Math.random() < 0.6) igniteTile(tile);
        store.addEvent(
          chronicle('lightning') + toll('slain', kills),
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
        // ...and a cloud that stays behind afterwards. The flash is the act;
        // the cloud is the consequence, and it is the part that is worth
        // watching — it drifts, it keeps working, and the people under it can
        // walk out from under it.
        summonCloud('blessing', tile.x, tile.y);
        soundManager.bless();
        reactNearby(tile, blessRadius, 'blessed');
        // Divine light is the non-violent way to stop a scheme. Without a way
        // to intervene, a plot is a countdown rather than a decision.
        {
          const settled = entityManagerRef.current?.query(tile.x, tile.y, blessRadius + 1) ?? [];
          let calmed = 0;
          for (const witness of settled) {
            calmed += settlementRef.current?.cancelPlotsBy(witness.id, 'blessed') ?? 0;
          }
          if (calmed > 0) requestFlash('divine', 0.7);
        }
        requestFlash('divine', 0.5);
        store.addEvent(
          chronicle('blessing') + toll('healed', healed),
          'divine',
          { x: tile.x, y: tile.y },
        );
        break;
      }

      // -- erasers ------------------------------------------------------
      //
      // Every creative power in this switch needed an inverse. Building
      // something you cannot unbuild makes a sandbox feel like a form you are
      // filling in rather than a place you are shaping.

      case 'erase-forest': {
        acted = false;
        forEachBrushTile(tile, radius, (target) => {
          if (!target.structure && !target.resources.some(r => r.type === 'wood')) return;
          acted = true;
          target.structure = null;
          target.resources = target.resources.filter(r => r.type !== 'wood');
          if (target.type.includes('forest') || target.type === 'taiga') {
            // Back to whatever the climate would have grown without trees.
            target.type = target.moisture > 0.55 ? 'grassland' : 'savanna';
          }
          syncTile(target);
        });
        if (acted) soundManager.uiClick();
        break;
      }

      case 'erase-buildings': {
        acted = false;
        forEachBrushTile(tile, radius, (target) => {
          if (!target.villageId && !target.structure) return;
          acted = true;
          // The settlement system owns village tiles, so ask it to let go
          // rather than clearing the tile behind its back and leaving it with
          // a building it still believes in.
          settlementRef.current?.demolishAt(target.x, target.y);
          target.structure = null;
          syncTile(target);
        });
        if (acted) {
          effectsManagerRef.current?.spawnBurst(tileWorldPosition(tile), 0x9aa4b5, 14, 1.6);
          requestShake(6, 0.25);
        }
        break;
      }

      case 'douse': {
        acted = false;
        forEachBrushTile(tile, radius + 1, (target) => {
          if (!target.isOnFire) return;
          acted = true;
          extinguishTile(target, false);
        });
        if (acted) {
          effectsManagerRef.current?.spawnBurst(tileWorldPosition(tile), 0x8ec5ff, 18, 1.8);
          soundManager.uiClick();
        }
        break;
      }

      case 'erase-life': {
        const doomed = entityManagerRef.current?.query(tile.x, tile.y, radius + 0.8) ?? [];
        if (doomed.length === 0) return false;
        for (const victim of doomed) {
          // Erased, not killed: no chronicle entry, no grief, no statistics.
          // That distinction is the whole character of the tool.
          entityManagerRef.current?.eraseEntity(victim);
        }
        effectsManagerRef.current?.spawnBurst(tileWorldPosition(tile), 0xd8b4fe, 12, 1.4);
        break;
      }

      case 'poke': {
        // WorldBox's sharpest bit of writing is that the player is *felt*. A
        // creature prodded by something enormous and unseen does not shrug it
        // off, and it cannot name what did it. One point of damage; eighteen
        // points of mood.
        const victims = entityManagerRef.current?.query(tile.x, tile.y, 1.2) ?? [];
        if (victims.length === 0) return false;
        for (const victim of victims) {
          victim.health = Math.max(1, victim.health - 1);
          applyScenario(victim, 'poked');
        }
        soundManager.uiClick();
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
        summonCloud('plague', tile.x, tile.y);
        soundManager.curse();
        reactNearby(tile, curseRadius, 'cursed');
        requestFlash('plague', 0.7);
        store.addEvent(
          chronicle('curse') + toll('claimed', kills),
          'disaster',
          { x: tile.x, y: tile.y },
        );
        break;
      }
      default: {
        const result = runExtraPower(tool, tile, powerContext(), hazardsRef.current);
        acted = result === true;
        break;
      }
    }

    if (!acted) {
      effectsManagerRef.current?.spawnRefusal(tileWorldPosition(tile));
      soundManager.refused();
    }
    return acted;
  }, [forEachBrushTile, reshapeTile, igniteTile, extinguishTile, syncTile, tileWorldPosition, spawnRace, spawnableAnimalsFor, reactNearby, summonCloud, powerContext]);

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


  /**
   * Work out what the cursor is over, and publish it. Throttled: this runs on a
   * timer from the frame loop rather than on every mousemove event, so a fast
   * flick across the map costs a handful of raycasts rather than hundreds.
   */
  const updateHover = useCallback(() => {
    const terrain = terrainRef.current;
    const manager = entityManagerRef.current;
    const store = useGameStore.getState();
    if (!terrain) return;

    const mouse = new THREE.Vector2(mousePositionRef.current.x, mousePositionRef.current.y);
    raycasterRef.current.setFromCamera(mouse, camera);

    // Units first — they are what the player is usually asking about
    if (manager) {
      const entities = manager.getAllEntities().filter(entity => entity.mesh);
      const hits = raycasterRef.current.intersectObjects(entities.map(entity => entity.mesh!), true);
      if (hits.length > 0) {
        const hit = hits[0].object;
        const unit = entities.find(entity => entity.mesh === hit || entity.mesh === hit.parent);
        if (unit) {
          const key = `unit:${unit.id}:${unit.activity}:${Math.round(unit.health)}`;
          if (key !== hoverKeyRef.current) {
            hoverKeyRef.current = key;
            const settlements = settlementRef.current;
            const village = unit.villageId
              ? settlements?.villageName(unit.villageId) ?? null
              : null;
            const kingdom = unit.kingdomId
              ? settlements?.kingdomName(unit.kingdomId) ?? null
              : null;
            const office = ['king', 'leader', 'captain'].find(rank => unit.status.includes(rank))
              ?? (unit.job ? unit.job : null);
            store.setHoverTarget({
              kind: 'unit',
              id: unit.id,
              name: unit.name,
              species: unit.type,
              activity: unit.activity ?? 'idle',
              office: office ?? null,
              health: unit.health,
              maxHealth: unit.maxHealth,
              traits: unit.traits ?? [],
              village,
              kingdom,
              kingdomColor: unit.kingdomId
                ? settlements?.kingdomColorFor(unit.kingdomId) ?? null
                : null,
              herd: herdRef.current?.describe(unit)?.size ?? null,
              happiness: unit.happiness ?? 0,
            });
          }
          hoverTileRef.current = null;
          return;
        }
      }
    }

    // Otherwise the ground
    const hits = raycasterRef.current.intersectObject(terrain.pickTarget);
    const instanceId = hits[0]?.instanceId;
    if (instanceId === undefined) {
      hoverTileRef.current = null;
      if (hoverKeyRef.current !== '') {
        hoverKeyRef.current = '';
        store.setHoverTarget(null);
      }
      return;
    }

    const { x, y } = terrain.tileCoordsFromInstanceId(instanceId);
    if (!inBounds(x, y)) return;
    const tile = tilesRef.current[x][y];
    hoverTileRef.current = tile;

    const key = `tile:${x}:${y}:${tile.type}:${tile.isOnFire}:${tile.ownerId ?? ''}`;
    if (key === hoverKeyRef.current) return;
    hoverKeyRef.current = key;

    const settlements = settlementRef.current;
    store.setHoverTarget({
      kind: 'tile',
      x,
      y,
      biome: tile.type,
      elevation: tile.height,
      fertility: tile.fertility,
      resources: tile.resources
        .filter(resource => resource.quantity > 0)
        .map(resource => ({ type: resource.type, quantity: resource.quantity })),
      village: tile.villageId ? settlements?.villageName(tile.villageId) ?? null : null,
      kingdom: tile.ownerId ? settlements?.kingdomName(tile.ownerId) ?? null : null,
      kingdomColor: tile.ownerId ? settlements?.kingdomColorFor(tile.ownerId) ?? null : null,
      onFire: tile.isOnFire,
      occupants: tile.entities.length,
    });
  }, [camera, inBounds]);

  /** Show the player exactly which tiles the current power will touch. */
  const updateBrushPreview = useCallback(() => {
    const preview = brushPreviewRef.current;
    if (!preview) return;

    const store = useGameStore.getState();
    const tile = hoverTileRef.current;
    const tool = store.selectedTool;

    if (!tile || !tool || tool === 'select') {
      preview.visible = false;
      return;
    }

    const radius = BRUSH_TOOLS.has(tool) ? store.brushRadius : 0;
    const position = tileWorldPosition(tile);
    preview.visible = true;
    preview.position.set(position.x, position.y + 0.04, position.z);
    const span = (radius * 2 + 1) * 0.94;
    preview.scale.set(span, span, 1);
  }, [tileWorldPosition]);


  /**
   * Rebuild the label set. Cheap but not free, so it runs a couple of times a
   * second rather than per frame — villages are founded, not animated.
   */
  const refreshLabels = useCallback(() => {
    const settlements = settlementRef.current;
    if (!settlements) return;

    const targets = settlements.labelTargets();
    const existing = new Map(labelBridge.labels.map(label => [label.id, label]));

    let changed = targets.length !== labelBridge.labels.length;
    const labels: MapLabel[] = targets.map((target) => {
      // Reuse the object so the animation loop keeps reading the same instance
      const previous = existing.get(target.id);
      if (previous) {
        previous.text = target.text;
        previous.color = target.color;
        previous.tileX = target.tileX;
        previous.tileY = target.tileY;
        previous.capital = target.capital;
        return previous;
      }
      changed = true;
      return {
        ...target,
        screenX: 0,
        screenY: 0,
        opacity: 0,
      };
    });

    if (changed) publishLabels(labels);
    else labelBridge.labels = labels;
  }, []);

  /**
   * Project every label to screen space and decide whether it should show.
   * Kingdom names belong to the zoomed-out view and village names to the
   * zoomed-in one, which keeps a busy map from turning into a wall of text.
   */
  const projectLabels = useCallback(() => {
    const labels = labelBridge.labels;
    if (labels.length === 0) return;

    const store = useGameStore.getState();
    const canvas = gl.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const size = tilesRef.current.length;
    if (size === 0 || width === 0) return;

    if (!store.showMapLabels) {
      for (const label of labels) label.opacity = 0;
      return;
    }

    const orbit = controls as unknown as { target?: THREE.Vector3 } | null;
    const focus = orbit?.target ?? new THREE.Vector3();
    const worldUnits = size * TILE_SIZE;
    const zoom = viewFraction(camera, worldUnits, focus);

    // Fade bands, so labels arrive and leave rather than popping
    const kingdomOpacity = THREE.MathUtils.clamp((zoom - 0.35) / 0.2, 0, 1);
    const villageOpacity = THREE.MathUtils.clamp((0.85 - zoom) / 0.2, 0, 1);

    for (const label of labels) {
      const band = label.kind === 'kingdom' ? kingdomOpacity : villageOpacity;
      if (band <= 0.01) {
        label.opacity = 0;
        continue;
      }

      if (!inBounds(label.tileX, label.tileY)) {
        label.opacity = 0;
        continue;
      }
      const tile = tilesRef.current[label.tileX][label.tileY];
      const point = projectionRef.current.set(
        (tile.x - size / 2 + 0.5) * TILE_SIZE,
        tile.scaledHeight + 0.6,
        (tile.y - size / 2 + 0.5) * TILE_SIZE,
      );
      point.project(camera);

      // Behind the camera, or outside the viewport with a margin
      if (point.z > 1 || point.x < -1.2 || point.x > 1.2 || point.y < -1.2 || point.y > 1.2) {
        label.opacity = 0;
        continue;
      }

      label.screenX = (point.x * 0.5 + 0.5) * width;
      label.screenY = (-point.y * 0.5 + 0.5) * height;
      label.opacity = band;
    }
  }, [camera, controls, gl, inBounds]);

  /**
   * Project the floater pool. Anything attached to an entity follows it, so a
   * damage number stays over the creature that took the hit while it staggers
   * away rather than hanging in the field where the blow landed.
   */
  const projectFloaters = useCallback(() => {
    const canvas = gl.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const size = tilesRef.current.length;
    if (size === 0 || width === 0) return;

    const orbit = controls as unknown as { target?: THREE.Vector3 } | null;
    const focus = orbit?.target ?? new THREE.Vector3();
    const zoom = viewFraction(camera, size * TILE_SIZE, focus);
    // Numbers over two hundred creatures at map scale are static, not
    // information. They fade in as you come down to where you can tell who
    // is who.
    const band = THREE.MathUtils.clamp((0.62 - zoom) / 0.14, 0, 1);

    for (const slot of floatBridge.slots) {
      if (slot.id === 0) continue;
      if (band <= 0.01) {
        slot.opacity = 0;
        continue;
      }

      if (slot.entityId) {
        const entity = entityManagerRef.current?.getEntityById(slot.entityId);
        if (entity) {
          slot.x = entity.position.x;
          slot.y = entity.position.y;
        } else {
          slot.entityId = null;
        }
      }

      const tx = Math.floor(slot.x);
      const ty = Math.floor(slot.y);
      if (!inBounds(tx, ty)) {
        slot.opacity = 0;
        continue;
      }
      const tile = tilesRef.current[tx][ty];
      const point = projectionRef.current.set(
        (slot.x - size / 2) * TILE_SIZE,
        tile.scaledHeight + (slot.kind === 'speech' ? 1.05 : 0.75),
        (slot.y - size / 2) * TILE_SIZE,
      );
      point.project(camera);

      if (point.z > 1 || point.x < -1.15 || point.x > 1.15 || point.y < -1.15 || point.y > 1.15) {
        slot.opacity = 0;
        continue;
      }
      slot.screenX = (point.x * 0.5 + 0.5) * width;
      slot.screenY = (-point.y * 0.5 + 0.5) * height;
      slot.opacity = band;
    }
  }, [camera, controls, gl, inBounds]);

  /** Advance the fire system with the current weather and world laws. */
  const simulateFire = useCallback((delta: number) => {
    const store = useGameStore.getState();
    fireRef.current?.update(delta, {
      raining: store.weather !== 'clear',
      spreadEnabled: store.worldLaws.fireSpread,
    });
  }, []);

  /**
   * Slow world processes: food regrows, forests creep outward, corruption
   * spreads, scorched land recovers. Sampled rather than exhaustive so cost is
   * independent of map size.
   */
  /**
   * What the ambient processes are allowed to touch.
   *
   * Rebuilt each firing rather than memoised: it reads the season, the age and
   * the world laws, all of which change under it, and a stale context is a
   * world that keeps growing through a winter nobody is having.
   */
  /**
   * What a cloud is allowed to reach on its way over.
   *
   * Separate from the ambient-process context because a cloud needs one thing
   * that nothing else does — the creatures standing under it — and widening
   * `WorldContext` to carry it would put a spatial query on every row of a
   * table where six of the seven rows do not want one.
   */
  const cloudWorld = useCallback(() => {
    const store = useGameStore.getState();
    return {
      tiles: tilesRef.current,
      creaturesNear: (x: number, y: number, radius: number) =>
        entityManagerRef.current?.query(x, y, radius) ?? [],
      syncTile,
      announce: (message: string) => store.addEvent(message, 'info'),
      random: Math.random,
    };
  }, [syncTile]);

  const worldContext = useCallback((): WorldContext => {
    const store = useGameStore.getState();
    const tiles = tilesRef.current;
    return {
      tiles,
      size: tiles.length,
      season: store.season,
      growth: simulation.age.growth,
      laws: {
        biomeGrowth: store.worldLaws.biomeGrowth,
        disasters: store.worldLaws.disasters,
        erosion: store.worldLaws.erosion,
      },
      inBounds,
      syncTile,
      ignite: (tile) => { fireRef.current?.ignite(tile); },
      spawn: (type, x, y) => Boolean(entityManagerRef.current?.spawnEntity(type, x, y)),
      population: () => entityManagerRef.current?.getAllEntities().length ?? 0,
      announce: (message, at) => store.addEvent(message, 'info', at),
      random: Math.random,
      // The disaster surface. A disaster needs a building to eat, so this is
      // the one place the ambient world is allowed to reach into settlements.
      buildings: () => settlementRef.current?.standingBuildings() ?? [],
      destroyBuilding: (id) => settlementRef.current?.destroyBuilding(id) ?? false,
      damageArea: (x, y, radius, damage) =>
        entityManagerRef.current?.damageArea(x, y, radius, damage) ?? 0,
      tileAt: (x, y) => (inBounds(x, y) ? tiles[x][y] : null),
    };
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

    // Keyboard zoom. Moving the camera along its own view axis is what the
    // scroll wheel does, so +/- and the wheel end up feeling like one control.
    if (store.zoomRequest && store.zoomRequest.nonce !== lastZoomNonceRef.current) {
      lastZoomNonceRef.current = store.zoomRequest.nonce;
      // Orthographic: zoom is a property, not a distance. Moving the camera
      // along its own view axis changes nothing you can see.
      const ortho = camera as THREE.OrthographicCamera;
      const limits = controls as unknown as { minZoom?: number; maxZoom?: number };
      const step = store.zoomRequest.direction > 0 ? 1 / 1.18 : 1.18;
      ortho.zoom = Math.min(
        limits.maxZoom ?? Infinity,
        Math.max(limits.minZoom ?? 0.01, ortho.zoom * step),
      );
      ortho.updateProjectionMatrix();
      orbit.update?.();
    }

    // WASD and the arrows pan the map — unless they are walking a possessed
    // creature, in which case the camera is already riding along with it.
    // Wall-clock, so you can look around a paused world.
    const held = heldDirection();
    if ((held.dx !== 0 || held.dy !== 0) && !store.possessedId) {
      if (store.followEntityId) store.setFollowEntity(null);
      const ortho = camera as THREE.OrthographicCamera;
      const viewWidth = ortho.isOrthographicCamera ? (ortho.right - ortho.left) / ortho.zoom : 20;
      const step = viewWidth * 0.7 * delta;
      const half = (tilesRef.current.length * TILE_SIZE) / 2;
      const nextX = Math.max(-half, Math.min(half, orbit.target.x + held.dx * step));
      const nextZ = Math.max(-half, Math.min(half, orbit.target.z + held.dy * step));
      camera.position.x += nextX - orbit.target.x;
      camera.position.z += nextZ - orbit.target.z;
      orbit.target.x = nextX;
      orbit.target.z = nextZ;
      orbit.update?.();
    }

    // Spectate mode
    if (store.followEntityId) {
      const entity = entityManagerRef.current?.getEntityById(store.followEntityId);
      if (!entity) {
        // A possessed creature that dies lets go of you, too.
        if (store.possessedId) store.setPossessed(null);
        else store.setFollowEntity(null);
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

    // Shake through the projection, not the position. See impactBridge for why
    // moving the camera cannot work here: MapControls would absorb the offset
    // into its own orbit state and the view would never come back.
    const perspective = camera as THREE.PerspectiveCamera;
    if (isShaking()) {
      const canvas = gl.domElement;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width > 0 && height > 0) {
        const jolt = sampleShake(delta);
        const scale = height / 900;
        perspective.setViewOffset(
          width, height, jolt.x * scale, jolt.y * scale, width, height,
        );
        shakingRef.current = true;
      }
    } else if (shakingRef.current) {
      shakingRef.current = false;
      perspective.clearViewOffset();
    }
  }, [controls, camera, gl, inBounds, tileWorldPosition]);

  /**
   * Do whatever the current era does to the world.
   *
   * These are the reason an age matters rather than merely tinting the screen.
   * Each is deliberately small and frequent instead of one large event: a
   * drought that kills a few trees every twenty-odd seconds reads as a
   * *condition*, where one that razes a forest at once reads as a disaster
   * somebody triggered.
   */
  const runAgeAction = useCallback((action: AgeAction) => {
    const tiles = tilesRef.current;
    const size = tiles.length;
    if (size === 0 || action === 'none') return;
    const store = useGameStore.getState();
    const samples = Math.max(20, Math.floor((size * size) / 260));

    switch (action) {
      case 'drought': {
        for (let attempt = 0; attempt < samples; attempt += 1) {
          const tile = tiles[Math.floor(Math.random() * size)][Math.floor(Math.random() * size)];
          if (isWaterBiome(tile.type)) continue;
          tile.moisture = Math.max(0, tile.moisture - 0.05);
          if (tile.structure && Math.random() < 0.25) {
            tile.structure = null;
            tile.resources = tile.resources.filter(r => r.type !== 'food');
            syncTile(tile);
          }
        }
        break;
      }
      case 'downpour': {
        if (store.weather === 'clear') store.setWeather('rain');
        // Rain in an Age of Tears is relentless enough to put fires out
        // wherever it finds them, not merely to slow them down.
        fireRef.current?.extinguishAll();
        break;
      }
      case 'frost': {
        for (let attempt = 0; attempt < samples; attempt += 1) {
          const tile = tiles[Math.floor(Math.random() * size)][Math.floor(Math.random() * size)];
          if (isWaterBiome(tile.type)) continue;
          tile.temperature = Math.max(0, tile.temperature - 0.04);
          const food = tile.resources.find(r => r.type === 'food');
          if (food && Math.random() < 0.5) {
            food.quantity = Math.max(0, food.quantity - 2);
          }
          if (tile.isOnFire) extinguishTile(tile, false);
        }
        break;
      }
      case 'derangement': {
        // Chaos turns creatures on each other. Picked at random across the
        // whole population rather than in one place, so it feels like the age
        // rather than like an attack.
        const all = entityManagerRef.current?.getAllEntities() ?? [];
        if (all.length === 0) break;
        for (let attempt = 0; attempt < Math.max(1, Math.floor(all.length * 0.04)); attempt += 1) {
          const victim = all[Math.floor(Math.random() * all.length)];
          applyScenario(victim, 'lostFight');
        }
        break;
      }
      case 'ashfall': {
        for (let attempt = 0; attempt < samples; attempt += 1) {
          const tile = tiles[Math.floor(Math.random() * size)][Math.floor(Math.random() * size)];
          if (isWaterBiome(tile.type)) continue;
          tile.fertility = Math.max(0, tile.fertility - 0.03);
        }
        const living = entityManagerRef.current?.getAllEntities() ?? [];
        for (const creature of living) {
          if (Math.random() < 0.05) creature.health = Math.max(1, creature.health - 2);
        }
        break;
      }
      case 'flourish': {
        for (let attempt = 0; attempt < samples; attempt += 1) {
          const tile = tiles[Math.floor(Math.random() * size)][Math.floor(Math.random() * size)];
          if (isWaterBiome(tile.type)) continue;
          tile.fertility = Math.min(1, tile.fertility + 0.03);
          const food = tile.resources.find(r => r.type === 'food');
          if (food) food.quantity = Math.min(10, food.quantity + 1);
          else if (tile.fertility > 0.4) {
            tile.resources.push({ type: 'food', quantity: 2, discovered: true });
          }
        }
        break;
      }
      default: break;
    }
  }, [extinguishTile, syncTile]);

  /** Move the age clock along and let the current era act on the world. */
  const advanceAge = useCallback((delta: number) => {
    const store = useGameStore.getState();
    if (!store.worldLaws.ages) {
      // Held in Hope rather than frozen mid-era: switching the law off should
      // give a temperate world, not leave an Age of Ash running for ever.
      if (store.age !== 'hope') store.setAge('hope');
      ageBridge.age = 'hope';
      ageBridge.strength = 0;
      return;
    }

    const current = AGES[store.age] ?? AGES.hope;
    ageBridge.age = current.id;
    ageBridge.strength = current.tintStrength;

    // Everything alive feels the era, which is our stand-in for their
    // per-age loyalty and opinion bonuses.
    if (current.mood !== 0) {
      for (const creature of entityManagerRef.current?.getAllEntities() ?? []) {
        nudgeMood(creature, current.mood * delta);
      }
    }

    if (current.action !== 'none' && current.actionEvery > 0) {
      ageActionTimerRef.current += delta;
      if (ageActionTimerRef.current >= current.actionEvery) {
        ageActionTimerRef.current = 0;
        runAgeAction(current.action);
      }
    }

    ageTimerRef.current += delta;
    store.setAgeProgress(Math.min(1, ageTimerRef.current / AGE_LENGTH));
    if (ageTimerRef.current < AGE_LENGTH) return;

    ageTimerRef.current = 0;
    ageActionTimerRef.current = 0;
    ageSlotRef.current += 1;
    const chosen = nextAge(ageSlotRef.current, current.id, Math.random());
    store.setAge(chosen);
    store.setAgeProgress(0);
    store.addEvent(AGES[chosen].herald, 'info');
    requestFlash(chosen === 'hope' || chosen === 'wonders' ? 'divine' : 'plague', 0.55);
  }, [runAgeAction]);

  /**
   * Game tick logic
   */
  const gameTick = useCallback((deltaTime: number) => {
    // Effects and camera keep running while paused so the world still breathes
    effectsManagerRef.current?.update(deltaTime);
    // Clouds drift on the wall clock like the sea does — the sky should not
    // freeze when the world is paused — but their *drops* run on simulated
    // time, which is why they are advanced from inside the game tick instead.
    updateCamera(deltaTime);

    const currentPhase = useGameStore.getState().timeOfDay;
    const targetSky = SKY_COLORS[currentPhase];
    // Slow enough that a change of phase is something you notice happening
    const skyBlend = Math.min(1, deltaTime * 0.35);
    if (scene.background instanceof THREE.Color) {
      scene.background.lerp(targetSky, skyBlend);
    } else {
      scene.background = targetSky.clone();
    }
    if (scene.fog?.color) {
      scene.fog.color.lerp(targetSky, skyBlend);
    }
    effectsManagerRef.current?.setStarVisibility(currentPhase === 'night' || currentPhase === 'dusk');

    if (isGamePaused) return;

    const store = useGameStore.getState();
    publishSimulationContext(store.worldLaws, store.season, store.timeOfDay, store.age, store.mapLayer);

    const scaledDelta = deltaTime * gameSpeed;
    tickTimerRef.current += scaledDelta;

    entityManagerRef.current?.update(scaledDelta);
    advanceShots(scaledDelta);
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

    advanceAge(scaledDelta);

    // Weather drifts on its own, seasonally and far more slowly than it used
    // to: rain every couple of minutes read as bad weather rather than as
    // weather.
    weatherTimerRef.current += scaledDelta;
    if (weatherTimerRef.current >= WEATHER_INTERVAL) {
      weatherTimerRef.current = 0;
      const store = useGameStore.getState();
      if (store.weather !== 'clear') {
        if (Math.random() < RAIN_STOP_CHANCE) {
          store.setWeather('clear');
          store.addEvent('The rain subsides', 'info');
        }
      } else {
        const seasonal = RAIN_SEASON_FACTOR[store.season] ?? 1;
        if (Math.random() < RAIN_START_CHANCE * seasonal) {
          store.setWeather('rain');
          store.addEvent(
            store.season === 'winter'
              ? 'Snow begins to fall across the land'
              : 'Clouds gather; rain begins to fall',
            'info',
          );
        }
      }
    }

    // Fixed-cadence simulation steps
    const tickInterval = 0.25;
    while (tickTimerRef.current >= tickInterval) {
      tickTimerRef.current -= tickInterval;
      simulateFire(tickInterval);
    }

    // Icons change on the scale of seconds, so refresh them a few times a
    // second rather than every frame.
    iconTimerRef.current += deltaTime;
    if (iconTimerRef.current >= 1 / 6) {
      iconTimerRef.current = 0;
      const manager = entityManagerRef.current;
      if (manager) {
        unitIconsRef.current?.update(
          manager.getAllEntities(),
          manager.detail,
          settlementRef.current?.plottingIds(),
          settlementRef.current?.craftTiers(),
        );
      }
    }

    // Statistics run on simulated time, not the wall clock: at triple speed the
    // world's history should fill three times as fast, and a paused world must
    // not accumulate a flat line of history nobody watched happen. Cheap enough
    // to call every frame; sampleWorld owns its own interval.
    sampleWorld(scaledDelta, useGameStore.getState().population);

    // Every ambient process, on one clock it owns itself. Each row keeps its
    // own countdown, so nothing has to be scheduled from here.
    if (tilesRef.current.length > 0) {
      worldBehaviourRef.current.advance(scaledDelta, worldContext());
      cloudsRef.current.update(scaledDelta, cloudWorld());
      if (hazardsRef.current.active > 0) hazardsRef.current.update(scaledDelta, powerContext());
    }

    // Publish stats and drive weather visuals
    statsTimerRef.current += deltaTime;
    if (statsTimerRef.current >= 1) {
      statsTimerRef.current = 0;
      const store = useGameStore.getState();
      const population = entityManagerRef.current?.getPopulation() ?? 0;
      store.setPopulation(population);
      if (store.weather !== 'clear') {
        effectsManagerRef.current?.startRain();
        soundManager.startRain();
      } else {
        effectsManagerRef.current?.stopRain();
        soundManager.stopRain();
      }
      // Rain is now a thing that falls out of the clouds rather than a
      // particle effect over an unchanged map: it wets the ground, puts out
      // fires and is the only counterweight the world has to the thermal
      // ladder. Snow in a winter that is cold enough to mean it.
      cloudsRef.current.setWeather(
        store.weather === 'clear' ? 'clear'
          : store.season === 'winter' ? 'snow' : 'rain',
      );

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
  }, [isGamePaused, gameSpeed, scene, refreshWorldColors, simulateFire, worldContext, cloudWorld, updateCamera, advanceAge, powerContext]);

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

  // Repaint the whole map when the player asks it a different question.
  // Separate from the effect above so a layer change does not also rebuild the
  // lighting, and so switching layers costs exactly one recolour pass.
  useEffect(() => {
    if (!isInitialized) return;
    const state = useGameStore.getState();
    terrainRef.current?.setMapLayer(mapLayer, state.timeOfDay, state.season);
    // The territory overlay is tinted by kingdom on most layers and by culture,
    // language or faith on the identity ones, so it has to be repainted too —
    // recolouring the terrain underneath and leaving the borders in the old
    // scheme is worse than not switching at all.
    //
    // The layer is passed explicitly rather than read from the simulation
    // context, because that context is only published from the game tick — which
    // runs *after* this effect. Reading it here painted every border in the
    // previous layer's scheme and left it that way until a claim happened to
    // change.
    settlementRef.current?.repaintAllTerritory(mapLayer);
  }, [isInitialized, mapLayer]);

  // Let the AI (pyromaniac trait) and raids set tiles alight
  useEffect(() => {
    simulation.igniteTile = (x: number, y: number) => {
      if (!inBounds(x, y)) return;
      igniteTile(tilesRef.current[x][y]);
    };
    simulation.setBiome = (x, y, type) => {
      if (!inBounds(x, y)) return;
      const tile = tilesRef.current[x][y];
      if (tile.type === type) return;
      reshapeTile(tile, tile.height, type);
    };
    simulation.demolishAt = (x, y) => settlementRef.current?.demolishAt(x, y) ?? false;
    return () => {
      simulation.igniteTile = undefined;
      simulation.setBiome = undefined;
      simulation.demolishAt = undefined;
    };
  }, [igniteTile, inBounds, reshapeTile]);

  // React to manual weather changes from the toolbar
  useEffect(() => {
    if (!isInitialized) return;
    if (weather !== 'clear') effectsManagerRef.current?.startRain();
    else effectsManagerRef.current?.stopRain();
  }, [isInitialized, weather]);

  // Icon overlay toggle
  const showUnitIcons = useGameStore((state) => state.showUnitIcons);
  useEffect(() => {
    unitIconsRef.current?.setVisible(showUnitIcons);
  }, [showUnitIcons, isInitialized]);

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
    // the current camera.
    //
    // The two projections need different numbers. A perspective camera wants a
    // constant the shader divides by depth; an orthographic one has no such
    // relationship — pixels per world unit is simply its zoom — and dividing by
    // depth under a top-down camera, where depth is the same everywhere, sized
    // every sprite identically and enormously.
    const ortho = camera as THREE.OrthographicCamera;
    const orthographic = Boolean(ortho.isOrthographicCamera);
    const pixelScale = orthographic
      ? ortho.zoom
      : (gl.domElement.height * 0.5)
        / Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov ?? 55) / 2);
    terrainRef.current?.setViewportScale(pixelScale, orthographic);
    settlementRef.current?.setViewportScale(pixelScale, orthographic);
    unitIconsRef.current?.setViewportScale(pixelScale, orthographic);
    updateSelectionIndicator();
    {
      const selected = useGameStore.getState().selectedEntity;
      const live = selected ? entityManagerRef.current?.getEntityById(selected.id) ?? null : null;
      relationLinesRef.current?.update(live, {
        entity: (id) => entityManagerRef.current?.getEntityById(id),
        home: (entity) => simulation.homePositionFor?.(entity) ?? null,
        toWorld: (x, y, target) => target.set(
          (x - tilesRef.current.length / 2 + 0.5) * TILE_SIZE,
          0.2,
          (y - tilesRef.current.length / 2 + 0.5) * TILE_SIZE,
        ),
      });
    }

    shotLayerRef.current?.update((x, y, out) => out.set(
      (x - tilesRef.current.length / 2) * TILE_SIZE,
      0.2,
      (y - tilesRef.current.length / 2) * TILE_SIZE,
    ));

    // Hover is sampled ~15x a second: often enough to feel instant, rarely
    // enough that flicking the mouse does not cost hundreds of raycasts.
    hoverTimerRef.current += deltaTime;
    if (hoverTimerRef.current >= 1 / 15) {
      hoverTimerRef.current = 0;
      updateHover();
      updateBrushPreview();
    }

    labelTimerRef.current += deltaTime;
    if (labelTimerRef.current >= 0.5) {
      labelTimerRef.current = 0;
      refreshLabels();
    }
    // Water moves whether the world is paused or not: a frozen sea is the most
    // obvious tell that a place is a diagram. Same reason the sky keeps
    // drifting while paused.
    // How big a tile is on screen right now, so the terrain shader can drop
    // detail it cannot resolve.
    {
      const span = visibleWorldSpan(camera);
      const viewportPixels = gl.domElement.clientHeight;
      if (span > 0 && viewportPixels > 0) {
        terrainRef.current?.setTilePixels((TILE_SIZE / span) * viewportPixels);
      }
    }
    terrainRef.current?.advanceWater(deltaTime);
    settlementRef.current?.advancePulse(deltaTime);

    projectLabels();
    // Clamped like the game tick: a tab returning from the background hands us
    // a delta of several seconds, and unclamped that retires every floater at
    // once instead of playing the animations the player came back to see.
    advanceFloaters(Math.min(deltaTime, 0.1));
    projectFloaters();

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
      /** Live floaters, for verifying numbers and speech without screenshots. */
      get floaters() {
        return floatBridge.slots
          .filter(slot => slot.id !== 0)
          .map(slot => ({ kind: slot.kind, text: slot.text, opacity: slot.opacity }));
      },
      get settlements() { return settlementRef.current; },
      get herds() { return herdRef.current; },
      /** Snapshot the world, for save/load round-trip checks. */
      captureSave: (label = 'debug') => worldAccess.current?.captureSave(label) ?? null,
      /** Move the camera to a tile at a given height, for tests and debugging. */
      /**
       * Centre the view on a tile. `tilesAcross` says how much world to show.
       *
       * Written for the orthographic map camera: framing is `zoom`, and the
       * camera stays directly above its target. The old version offset the
       * camera in Z to fake a tilt, which under a top-down camera simply
       * shifted the centre of the screen away from the tile it claimed to be
       * looking at.
       */
      lookAt: (x: number, y: number, tilesAcross = 24) => {
        if (!inBounds(x, y)) return;
        const orbit = controls as unknown as {
          target?: THREE.Vector3; update?: () => void;
          minZoom?: number; maxZoom?: number;
        } | null;
        const position = tileWorldPosition(tilesRef.current[x][y]);
        const ortho = camera as THREE.OrthographicCamera;

        if (orbit?.target) orbit.target.set(position.x, 0, position.z);
        camera.position.set(position.x, camera.position.y, position.z);

        if (ortho.isOrthographicCamera) {
          // The frustum is the viewport. `updateProjectionMatrix` derives
          // left/right/top/bottom straight from the canvas, so the camera
          // already knows how many pixels it is looking through — and reading
          // it here rather than from `gl.domElement` keeps the renderer out of
          // this effect's dependencies, which is what the linter was asking
          // for and what changed the array's length under React.
          const viewport = Math.min(ortho.right - ortho.left, ortho.top - ortho.bottom);
          ortho.zoom = THREE.MathUtils.clamp(
            viewport / (tilesAcross * TILE_SIZE),
            orbit?.minZoom ?? 0.01,
            orbit?.maxZoom ?? Infinity,
          );
          ortho.updateProjectionMatrix();
        }
        orbit?.update?.();
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
