/**
 * Pointer, selection, hover and brush-preview input for the engine hook.
 *
 * Each function reads what it needs from a typed context: the refs it reads or
 * writes, and the few values it depends on. The hook keeps a thin useCallback
 * wrapper per function with the same dependency array it always had.
 */
import type { RefObject } from 'react';
import * as THREE from 'three';

import { useGameStore, type Tool } from '../../store/gameStore';
import type { Tile } from '../../types/world';
import type { EntityManager } from '../../utils/entityManagerMinimal';
import type { HerdSystem } from '../../utils/herdSystem';
import type { SettlementSystem } from '../../utils/settlementSystem';
import type { TerrainRenderer } from '../../utils/terrainRenderer';
import { BRUSH_TOOLS } from './toolEffects';

const SELECTION_INDICATOR_HEIGHT = 0.1;

/** Cursor position in normalised device coordinates, written on every mousemove. */
type CursorRef = RefObject<{ x: number; y: number }>;

/** What handleMouseMove needs: the canvas to measure and the cursor slot to write. */
export interface MouseMoveContext {
  gl: THREE.WebGLRenderer;
  mousePositionRef: CursorRef;
}

/** What handleMouseClick needs: the engine's picking objects, the tool, and the tool effect. */
export interface ClickContext {
  isInitialized: boolean;
  selectedTool: Tool;
  camera: THREE.Camera;
  gl: THREE.WebGLRenderer;
  mousePositionRef: CursorRef;
  raycasterRef: RefObject<THREE.Raycaster>;
  terrainRef: RefObject<TerrainRenderer | null>;
  tilesRef: RefObject<Tile[][]>;
  entityManagerRef: RefObject<EntityManager | null>;
  inBounds: (x: number, y: number) => boolean;
  applyToolEffect: (tile: Tile, tool: string | null) => boolean;
}

/** What updateSelectionIndicator needs: the indicator mesh and the selected tile. */
export interface SelectionIndicatorContext {
  selectionIndicatorRef: RefObject<THREE.Mesh | null>;
  selectedTile: Tile | null;
  tileWorldPosition: (tile: Tile) => THREE.Vector3;
}

/** What updateHover needs: the picking rays, the unit and settlement readers, and the hover cache. */
export interface HoverContext {
  camera: THREE.Camera;
  mousePositionRef: CursorRef;
  raycasterRef: RefObject<THREE.Raycaster>;
  terrainRef: RefObject<TerrainRenderer | null>;
  tilesRef: RefObject<Tile[][]>;
  entityManagerRef: RefObject<EntityManager | null>;
  settlementRef: RefObject<SettlementSystem | null>;
  herdRef: RefObject<HerdSystem | null>;
  hoverKeyRef: RefObject<string>;
  hoverTileRef: RefObject<Tile | null>;
  inBounds: (x: number, y: number) => boolean;
}

/** What updateBrushPreview needs: the preview mesh and the tile under the cursor. */
export interface BrushPreviewContext {
  brushPreviewRef: RefObject<THREE.Mesh | null>;
  hoverTileRef: RefObject<Tile | null>;
  tileWorldPosition: (tile: Tile) => THREE.Vector3;
}

/**
 * Handles mouse movement over the game world
 */
export function handleMouseMove(ctx: MouseMoveContext, event: MouseEvent): void {
  const { gl, mousePositionRef } = ctx;
  const rect = gl.domElement.getBoundingClientRect();
  mousePositionRef.current = {
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
  };
}

/**
 * Handles mouse click on the game world
 */
export function handleMouseClick(ctx: ClickContext, event: MouseEvent): void {
  const { isInitialized, selectedTool, camera, gl, mousePositionRef, raycasterRef, terrainRef, tilesRef, entityManagerRef, inBounds, applyToolEffect } = ctx;
  if (!isInitialized) return;
  // Ignore clicks on UI panels; only act on the 3D canvas itself
  if (event.target !== gl.domElement) return;

  const mousePos = new THREE.Vector2(mousePositionRef.current.x, mousePositionRef.current.y);
  raycasterRef.current.setFromCamera(mousePos, camera);

  // Entities take priority when using the select tool
  const manager = entityManagerRef.current;
  if (manager) {
    const entities = manager.getAllEntities().filter(e => e.mesh);
    manager.prepareForPicking();
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
}

/**
 * Update the selection indicator position and visibility
 */
export function updateSelectionIndicator(ctx: SelectionIndicatorContext): void {
  const { selectionIndicatorRef, selectedTile, tileWorldPosition } = ctx;
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
}

/**
 * Work out what the cursor is over, and publish it. Throttled: this runs on a
 * timer from the frame loop rather than on every mousemove event, so a fast
 * flick across the map costs a handful of raycasts rather than hundreds.
 */
export function updateHover(ctx: HoverContext): void {
  const { camera, mousePositionRef, raycasterRef, terrainRef, tilesRef, entityManagerRef, settlementRef, herdRef, hoverKeyRef, hoverTileRef, inBounds } = ctx;
  const terrain = terrainRef.current;
  const manager = entityManagerRef.current;
  const store = useGameStore.getState();
  if (!terrain) return;

  const mouse = new THREE.Vector2(mousePositionRef.current.x, mousePositionRef.current.y);
  raycasterRef.current.setFromCamera(mouse, camera);

  // Units first — they are what the player is usually asking about
  if (manager) {
    const entities = manager.getAllEntities().filter(entity => entity.mesh);
    manager.prepareForPicking();
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
}

/** Show the player exactly which tiles the current power will touch. */
export function updateBrushPreview(ctx: BrushPreviewContext): void {
  const { brushPreviewRef, hoverTileRef, tileWorldPosition } = ctx;
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
}
