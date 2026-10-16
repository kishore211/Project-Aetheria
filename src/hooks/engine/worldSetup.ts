import { setTileBiome, setTileWalkable } from '../../utils/pathfinding';
import type { RefObject } from 'react';
import * as THREE from 'three';
import type { RootState } from '@react-three/fiber';

import { useGameStore } from '../../store/gameStore';
import { generateWorld, type WorldTemplate } from '../../utils/worldGenerator';
import { populateWildlife } from '../../utils/worldBehaviour';
import type { CloudSystem } from '../../utils/clouds';
import { TILE_SIZE, type Tile } from '../../types/world';
import { EntityManager } from '../../utils/entityManagerMinimal';
import { EffectsManager } from '../../utils/effectsManager';
import { TerrainRenderer } from '../../utils/terrainRenderer';
import { SettlementSystem } from '../../utils/settlementSystem';
import { HerdSystem } from '../../utils/herdSystem';
import { UnitIconLayer } from '../../utils/unitIconLayer';
import { FireSystem } from '../../utils/fireSystem';
import { publishWorldAccess } from '../../utils/worldAccess';
import { applyMinedOre, buildSave } from '../../utils/saveSystem';
import { RelationLines } from '../../utils/relationLines';
import { ShotLayer } from '../../utils/shotBridge';
import { CreatureLayer } from '../../utils/creatureLayer';
import { discover } from '../../utils/knowledge';
import { describeItem, onItemEvent, type ItemEvent } from '../../utils/equipment';
import { visibleWorldSpan } from '../../utils/cameraView';
import { recordDeath, setRealmSource } from '../../utils/worldStats';
import { publishLabels } from '../../utils/labelBridge';
import { ConwayLayer } from '../../utils/conway';
import { soundManager } from '../../utils/soundManager';
import { seedRandom } from '../../utils/random';
import { resetWorldState } from '../../utils/resetWorldState';

/**
 * Everything world setup reads and writes: the three.js objects it places things
 * in, the hook's refs (which it fills in), and the hook's own helpers. The refs
 * are the hook's, so `.current` written here is what the rest of the hook sees.
 */
export interface WorldSetupContext {
  scene: THREE.Scene;
  camera: THREE.Camera;
  gl: THREE.WebGLRenderer;
  controls: RootState['controls'];
  mapSize: number;
  worldSeed: number;
  worldTemplate: WorldTemplate;
  tilesRef: RefObject<Tile[][]>;
  terrainRef: RefObject<TerrainRenderer | null>;
  entityManagerRef: RefObject<EntityManager | null>;
  effectsManagerRef: RefObject<EffectsManager | null>;
  settlementRef: RefObject<SettlementSystem | null>;
  herdRef: RefObject<HerdSystem | null>;
  unitIconsRef: RefObject<UnitIconLayer | null>;
  fireRef: RefObject<FireSystem | null>;
  relationLinesRef: RefObject<RelationLines | null>;
  shotLayerRef: RefObject<ShotLayer | null>;
  creatureLayerRef: RefObject<CreatureLayer | null>;
  conwayRef: RefObject<ConwayLayer | null>;
  selectionIndicatorRef: RefObject<THREE.Mesh | null>;
  brushPreviewRef: RefObject<THREE.Mesh | null>;
  cloudsRef: RefObject<CloudSystem>;
  setupLights: () => void;
  syncTile: (tile: Tile) => void;
  inBounds: (x: number, y: number) => boolean;
  tileWorldPosition: (tile: Tile) => THREE.Vector3;
  setIsInitialized: (initialized: boolean) => void;
}

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

/**
 * Initializes the game world
 */
export function initializeWorld(ctx: WorldSetupContext): void {
  const {
    scene,
    camera,
    gl,
    controls,
    mapSize,
    worldSeed,
    worldTemplate,
    tilesRef,
    terrainRef,
    entityManagerRef,
    effectsManagerRef,
    settlementRef,
    herdRef,
    unitIconsRef,
    fireRef,
    relationLinesRef,
    shotLayerRef,
    creatureLayerRef,
    conwayRef,
    selectionIndicatorRef,
    brushPreviewRef,
    cloudsRef,
    setupLights,
    syncTile,
    inBounds,
    tileWorldPosition,
    setIsInitialized,
  } = ctx;
  // Every module-level counter, registry and cooldown table starts empty, as on
  // a page load, so a seed replays the same history however many worlds came
  // before it. Then seed the simulation before anything else draws. A loaded
  // save comes through here too: requestLoad sets worldSeed from the save's own
  // seed.
  resetWorldState();
  seedRandom(worldSeed);
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
  relationLinesRef.current?.dispose();
  relationLinesRef.current = null;
  if (creatureLayerRef.current) scene.remove(creatureLayerRef.current.mesh);
  creatureLayerRef.current?.dispose();
  creatureLayerRef.current = null;
  if (conwayRef.current) scene.remove(conwayRef.current.mesh);
  conwayRef.current?.dispose();
  conwayRef.current = null;
  if (shotLayerRef.current) scene.remove(shotLayerRef.current.lines);
  shotLayerRef.current?.dispose();
  shotLayerRef.current = null;
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
  creatureLayerRef.current = new CreatureLayer();
  scene.add(creatureLayerRef.current.mesh);
  conwayRef.current = new ConwayLayer();
  scene.add(conwayRef.current.mesh);
  setRealmSource(() => useGameStore.getState().kingdoms.map(k => ({ id: k.id, name: k.name, color: k.color, population: k.population })));
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
    discover(entity.type);
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
    armies: () => settlements.armySummaries(),
    intervene: (act, x, y) => settlements.intervene(act, x, y),
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
      setTileBiome(tile, delta.t);
      tile.structure = delta.s ? { type: delta.s, health: 100, level: 1 } : null;
      tile.ownerId = delta.o ?? null;
      setTileWalkable(tile, !['deep_ocean', 'ocean'].includes(tile.type) && tile.height >= 0.25);
      terrain.syncTile(tile, pending.world.timeOfDay, pending.world.season);
    }
    // Deposits miners dug out stay dug out: the fresh veins are cut back to
    // what was left, and the tiles repainted.
    for (const tile of applyMinedOre(tilesData, pending.ore)) {
      terrain.syncTile(tile, pending.world.timeOfDay, pending.world.season);
    }
    settlements.restore(pending.kingdoms, pending.villages);
    for (const savedEntity of pending.entities) {
      manager.restoreEntity(savedEntity);
    }
    useGameStore.getState().clearPendingSave();
  } else if (storeState.worldLaws.wildlife !== false) {
    // A fresh world starts with its animals already grazing.
    populateWildlife(tilesData, (type, x, y) => manager.spawnEntity(type, x, y));
  }

  // Whatever the world starts with has been met, including a loaded save's.
  for (const entity of manager.getAllEntities()) discover(entity.type);

  setIsInitialized(true);
  useGameStore.getState().addEvent(
    pending
      ? `"${pending.label}" restored — year ${pending.world.year}, ${pending.world.season}`
      : `A new world awakens (seed ${worldSeed})`,
    'info',
  );
}
