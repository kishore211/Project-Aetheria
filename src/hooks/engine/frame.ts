import type { RefObject } from 'react';
import * as THREE from 'three';

import { useGameStore } from '../../store/gameStore';
import type { Tile, TimeOfDay } from '../../types/world';
import type { EffectsManager } from '../../utils/effectsManager';
import type { EntityManager } from '../../utils/entityManagerMinimal';
import type { SettlementSystem } from '../../utils/settlementSystem';
import type { HerdSystem } from '../../utils/herdSystem';
import type { UnitIconLayer } from '../../utils/unitIconLayer';
import type { ConwayLayer } from '../../utils/conway';
import type { CloudSystem, CloudWorld } from '../../utils/clouds';
import type { WorldBehaviour, WorldContext } from '../../utils/worldBehaviour';
import type { PowerContext, PowerHazards } from '../../utils/extraPowers';
import { publishSimulationContext } from '../../utils/simulation';
import { advanceShots } from '../../utils/shotBridge';
import { soundManager } from '../../utils/soundManager';
import { sampleWorld } from '../../utils/worldStats';
import { worldAccess } from '../../utils/worldAccess';
import { writeSave } from '../../utils/saveSystem';

/**
 * Everything one frame of the game tick reads and writes: the scene, the
 * subsystems and their clocks, and the hook's callbacks that build the
 * contexts each subsystem is handed. The refs are the hook's, so `.current`
 * written here is what the rest of the hook sees.
 */
export interface FrameContext {
  scene: THREE.Scene;
  /** Simulation pause and speed, as the hook saw them when it built the callback. */
  isGamePaused: boolean;
  gameSpeed: number;
  tilesRef: RefObject<Tile[][]>;
  effectsManagerRef: RefObject<EffectsManager | null>;
  entityManagerRef: RefObject<EntityManager | null>;
  settlementRef: RefObject<SettlementSystem | null>;
  herdRef: RefObject<HerdSystem | null>;
  conwayRef: RefObject<ConwayLayer | null>;
  unitIconsRef: RefObject<UnitIconLayer | null>;
  worldBehaviourRef: RefObject<WorldBehaviour>;
  cloudsRef: RefObject<CloudSystem>;
  hazardsRef: RefObject<PowerHazards>;
  tickTimerRef: RefObject<number>;
  phaseTimerRef: RefObject<number>;
  weatherTimerRef: RefObject<number>;
  iconTimerRef: RefObject<number>;
  statsTimerRef: RefObject<number>;
  autosaveTimerRef: RefObject<number>;
  updateCamera: (delta: number) => void;
  refreshWorldColors: () => void;
  simulateFire: (delta: number) => void;
  advanceAge: (delta: number) => void;
  worldContext: () => WorldContext;
  cloudWorld: () => CloudWorld;
  powerContext: () => PowerContext;
}

// Constants for game engine
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

/**
 * One frame of the game: effects, sky, the day/night and weather clocks, the
 * fixed-step simulation, and the ambient processes. Paused worlds still get
 * their sky and effects; everything after the pause check is simulated time.
 */
export function gameTick(ctx: FrameContext, deltaTime: number): void {
  const {
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
  } = ctx;
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
  conwayRef.current?.update(scaledDelta);

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
}
