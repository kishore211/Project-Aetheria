import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';

import { useGameStore } from '../store/gameStore';
import { determineBiome } from '../utils/worldGenerator';
import { WorldBehaviour, type WorldContext } from '../utils/worldBehaviour';
import { CloudSystem, DROPS, type DropKind } from '../utils/clouds';
import { BORN_SAPIENT } from '../utils/entitySystemMinimal';
import {
  Tile,
  MAP_SIZES,
  TILE_SIZE,
  computeScaledHeight,
  isWaterBiome,
  EntityType,
} from '../types/world';
import { EntityManager } from '../utils/entityManagerMinimal';
import { EffectsManager } from '../utils/effectsManager';
import { TerrainRenderer } from '../utils/terrainRenderer';
import { SettlementSystem } from '../utils/settlementSystem';
import { HerdSystem } from '../utils/herdSystem';
import { UnitIconLayer } from '../utils/unitIconLayer';
import { FireSystem } from '../utils/fireSystem';
import { worldAccess } from '../utils/worldAccess';
import { simulation } from '../utils/simulation';
import { advanceFloaters, floatBridge } from '../utils/floatBridge';
import { PowerHazards, type PowerContext } from '../utils/extraPowers';
import { RelationLines } from '../utils/relationLines';
import { ShotLayer } from '../utils/shotBridge';
import { CreatureLayer } from '../utils/creatureLayer';
import { magnetFollow, magnetHolding } from '../utils/magnet';
import { requestFlash, requestShake } from '../utils/impactBridge';
import { applyScenario, type Scenario } from '../utils/scenarios';
import type { AgeAction } from '../utils/ages';
import { visibleWorldSpan } from '../utils/cameraView';
import { ConwayLayer } from '../utils/conway';
import { soundManager } from '../utils/soundManager';
import { random } from '../utils/random';
import { applyToolEffect as applyToolEffectImpl } from './engine/toolEffects';
import { initializeWorld as initializeWorldImpl } from './engine/worldSetup';
import { projectFloaters as projectFloatersImpl, projectLabels as projectLabelsImpl, refreshLabels as refreshLabelsImpl } from './engine/labels';
import { advanceAge as advanceAgeImpl, runAgeAction as runAgeActionImpl } from './engine/ages';
import { gameTick as gameTickImpl } from './engine/frame';
import { updateCamera as updateCameraImpl } from './engine/camera';
import {
  handleMouseClick as handleMouseClickImpl,
  handleMouseMove as handleMouseMoveImpl,
  updateBrushPreview as updateBrushPreviewImpl,
  updateHover as updateHoverImpl,
  updateSelectionIndicator as updateSelectionIndicatorImpl,
} from './engine/input';

/** Mirrors entitySystemMinimal: only the sentient races get bubbles. */
const SPEAKING_RACES = new Set<string>(['human', 'elf', 'dwarf', 'orc']);



/** The map's ground, for turning the cursor into a tile without a pick. */
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.2);

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
  const creatureLayerRef = useRef<CreatureLayer | null>(null);
  const conwayRef = useRef<ConwayLayer | null>(null);
  const magnetPointRef = useRef(new THREE.Vector3());
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

  /** Set up the world from the current store settings: terrain, layers, entities and any queued save. */
  const initializeWorld = useCallback(() => initializeWorldImpl({
    scene, camera, gl, controls, mapSize, worldSeed, worldTemplate,
    tilesRef, terrainRef, entityManagerRef, effectsManagerRef, settlementRef, herdRef, unitIconsRef, fireRef,
    relationLinesRef, shotLayerRef, creatureLayerRef, conwayRef, selectionIndicatorRef, brushPreviewRef, cloudsRef,
    setupLights, syncTile, inBounds, tileWorldPosition, setIsInitialized,
  // Only world identity belongs here: including the light/callback identities
  // would regenerate the whole world on every time-of-day change.
  }), [worldSeed, mapSize, worldTemplate, worldRevision, scene]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseMove = useCallback((event: MouseEvent) => handleMouseMoveImpl({ gl, mousePositionRef }, event), [gl]);

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
      paintBorder: (x, y, erase) => settlementRef.current?.paintBorder(x, y, erase) ?? false,
      conway: (x, y, mode) => {
        const life = conwayRef.current;
        if (!life) return 0;
        if (mode === 'clear') { const n = life.count; life.clear(); return n; }
        return life.seed(x, y, store.brushRadius, tilesRef.current.length, random, mode === 'glider');
      },
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
      random,
    };
  }, [inBounds, forEachBrushTile, reshapeTile, syncTile, extinguishTile, tileWorldPosition, summonCloud]);

  const applyToolEffect = useCallback((tile: Tile, tool: string | null): boolean => applyToolEffectImpl({
    entityManagerRef,
    effectsManagerRef,
    settlementRef,
    fireRef,
    hazardsRef,
    forEachBrushTile,
    reshapeTile,
    igniteTile,
    extinguishTile,
    syncTile,
    tileWorldPosition,
    spawnRace,
    spawnableAnimalsFor,
    reactNearby,
    summonCloud,
    inBounds,
    powerContext,
  }, tile, tool), [forEachBrushTile, reshapeTile, igniteTile, extinguishTile, syncTile, tileWorldPosition, spawnRace, spawnableAnimalsFor, reactNearby, summonCloud, powerContext, inBounds]);

  const handleMouseClick = useCallback((event: MouseEvent) => handleMouseClickImpl({
    isInitialized, selectedTool, camera, gl, mousePositionRef, raycasterRef, terrainRef, tilesRef,
    entityManagerRef, inBounds, applyToolEffect,
  }, event), [isInitialized, selectedTool, camera, gl, applyToolEffect, inBounds]);

  const updateSelectionIndicator = useCallback(() => updateSelectionIndicatorImpl({
    selectionIndicatorRef, selectedTile, tileWorldPosition,
  }), [selectedTile, tileWorldPosition]);


  const updateHover = useCallback(() => updateHoverImpl({
    camera, mousePositionRef, raycasterRef, terrainRef, tilesRef, entityManagerRef,
    settlementRef, herdRef, hoverKeyRef, hoverTileRef, inBounds,
  }), [camera, inBounds]);

  const updateBrushPreview = useCallback(() => updateBrushPreviewImpl({
    brushPreviewRef, hoverTileRef, tileWorldPosition,
  }), [tileWorldPosition]);


  const refreshLabels = useCallback(() => refreshLabelsImpl({ settlementRef, entityManagerRef }), []);

  const projectLabels = useCallback(() => projectLabelsImpl({ gl, camera, controls, tilesRef, entityManagerRef, projectionRef, inBounds }), [camera, controls, gl, inBounds]);

  const projectFloaters = useCallback(() => projectFloatersImpl({ gl, camera, controls, tilesRef, entityManagerRef, projectionRef, inBounds }), [camera, controls, gl, inBounds]);

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
      random,
      ignite: (tile: Tile) => { fireRef.current?.ignite(tile); },
      flash: (tile: Tile) => {
        effectsManagerRef.current?.spawnBurst(tileWorldPosition(tile), 0xeef4ff, 8, 1.6);
        soundManager.lightning?.();
      },
    };
  }, [syncTile, tileWorldPosition]);

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
        wildlife: store.worldLaws.wildlife,
        monsterVisits: store.worldLaws.monsterVisits,
      },
      inBounds,
      syncTile,
      ignite: (tile) => { fireRef.current?.ignite(tile); },
      spawn: (type, x, y) => Boolean(entityManagerRef.current?.spawnEntity(type, x, y)),
      // Wildlife only: counting the peoples too meant a growing civilisation
      // stopped the animals coming back, and the wild emptied as towns filled.
      population: () => entityManagerRef.current?.getAllEntities().filter(e => !BORN_SAPIENT.has(e.type)).length ?? 0,
      near: (x, y, radius) => entityManagerRef.current?.query(x, y, radius) ?? [],
      announce: (message, at) => store.addEvent(message, 'info', at),
      random,
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

  const updateCamera = useCallback((delta: number) => updateCameraImpl({ gl, camera, controls, tilesRef, entityManagerRef, lastCameraNonceRef, lastZoomNonceRef, shakingRef, inBounds, tileWorldPosition }, delta), [controls, camera, gl, inBounds, tileWorldPosition]);

  const runAgeAction = useCallback((action: AgeAction) => runAgeActionImpl({ tilesRef, fireRef, entityManagerRef, syncTile, extinguishTile }, action), [extinguishTile, syncTile]);

  const advanceAge = useCallback((delta: number) => advanceAgeImpl({ entityManagerRef, ageTimerRef, ageActionTimerRef, ageSlotRef, runAgeAction }, delta), [runAgeAction]);

  /** One frame of the game. The logic lives in engine/frame.ts. */
  const gameTick = useCallback((deltaTime: number) => gameTickImpl({
    scene,
    isGamePaused,
    gameSpeed,
    tilesRef,
    effectsManagerRef,
    entityManagerRef,
    settlementRef,
    herdRef,
    conwayRef,
    unitIconsRef,
    worldBehaviourRef,
    cloudsRef,
    hazardsRef,
    tickTimerRef,
    phaseTimerRef,
    weatherTimerRef,
    iconTimerRef,
    statsTimerRef,
    autosaveTimerRef,
    updateCamera,
    refreshWorldColors,
    simulateFire,
    advanceAge,
    worldContext,
    cloudWorld,
    powerContext,
  }, deltaTime), [isGamePaused, gameSpeed, scene, refreshWorldColors, simulateFire, worldContext, cloudWorld, updateCamera, advanceAge, powerContext]);

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
    simulation.syncTile = (x, y) => {
      if (inBounds(x, y)) syncTile(tilesRef.current[x][y]);
    };
    simulation.wellFor = (entity) => settlementRef.current?.wellFor(entity) ?? null;
    simulation.isWell = (x, y) => settlementRef.current?.isWell(x, y) ?? false;
    return () => {
      simulation.igniteTile = undefined;
      simulation.setBiome = undefined;
      simulation.demolishAt = undefined;
      simulation.syncTile = undefined;
      simulation.wellFor = undefined;
      simulation.isWell = undefined;
    };
  }, [igniteTile, inBounds, reshapeTile, syncTile]);

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

    // The magnet's crowd rides the cursor. Raycast to the ground plane rather
    // than reading the hover tile, because the hover pass hits the held units
    // themselves and reports no tile at all.
    if (magnetHolding().length > 0 && entityManagerRef.current) {
      const manager = entityManagerRef.current;
      raycasterRef.current.setFromCamera(new THREE.Vector2(mousePositionRef.current.x, mousePositionRef.current.y), camera);
      const ground = raycasterRef.current.ray.intersectPlane(GROUND_PLANE, magnetPointRef.current);
      if (ground) {
        const half = tilesRef.current.length / 2;
        magnetFollow(ground.x / TILE_SIZE + half, ground.z / TILE_SIZE + half, (id) => manager.getEntityById(id));
      }
    }

    if (entityManagerRef.current) {
      // At least ~14 pixels tall on screen, whatever the zoom.
      const zoom = (camera as THREE.OrthographicCamera).isOrthographicCamera ? (camera as THREE.OrthographicCamera).zoom : 0;
      creatureLayerRef.current?.update(entityManagerRef.current.getAllEntities(), zoom > 0 ? 14 / zoom : 0);
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
      get gl() { return gl; },
      get scene() { return scene; },
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
  }, [isInitialized, camera, controls, inBounds, applyToolEffect, tileWorldPosition, gl, scene]);

  return {
    tilesRef,
    terrainRef,
    entityManagerRef,
    isInitialized,
  };
};
