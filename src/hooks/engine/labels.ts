import type { RefObject } from 'react';
import * as THREE from 'three';
import type { RootState } from '@react-three/fiber';

import { useGameStore } from '../../store/gameStore';
import { TILE_SIZE, type Tile } from '../../types/world';
import type { EntityManager } from '../../utils/entityManagerMinimal';
import type { SettlementSystem } from '../../utils/settlementSystem';
import { labelBridge, publishLabels, type MapLabel } from '../../utils/labelBridge';
import { floatBridge } from '../../utils/floatBridge';
import { viewFraction } from '../../utils/cameraView';

/** What refreshLabels reads: the settlements and the living population. */
export interface LabelRefreshContext {
  settlementRef: RefObject<SettlementSystem | null>;
  entityManagerRef: RefObject<EntityManager | null>;
}

/** What the screen-space projections read: the view, the map and a scratch vector. */
export interface LabelProjectionContext {
  gl: THREE.WebGLRenderer;
  camera: THREE.Camera;
  controls: RootState['controls'];
  tilesRef: RefObject<Tile[][]>;
  entityManagerRef: RefObject<EntityManager | null>;
  projectionRef: RefObject<THREE.Vector3>;
  inBounds: (x: number, y: number) => boolean;
}


/**
 * Rebuild the label set. Cheap but not free, so it runs a couple of times a
 * second rather than per frame — villages are founded, not animated.
 */
export function refreshLabels(ctx: LabelRefreshContext): void {
  const {
    settlementRef,
    entityManagerRef,
  } = ctx;
  const settlements = settlementRef.current;
  if (!settlements) return;

  const targets: Array<Omit<MapLabel, 'screenX' | 'screenY' | 'opacity'>> = [...settlements.labelTargets()];
  // Battles: crossed swords over every fight big enough to matter, so a war
  // can be found from the whole-map view the way WorldBox marks them.
  const fights = new Map<string, { n: number; x: number; y: number }>();
  for (const entity of entityManagerRef.current?.getAllEntities() ?? []) {
    if (entity.activity !== 'fighting' && !entity.status.includes('fighting')) continue;
    if (!entity.kingdomId) continue;
    const key = `${Math.floor(entity.position.x / 8)}:${Math.floor(entity.position.y / 8)}`;
    const cell = fights.get(key) ?? { n: 0, x: 0, y: 0 };
    cell.n += 1;
    cell.x += entity.position.x;
    cell.y += entity.position.y;
    fights.set(key, cell);
  }
  for (const [key, cell] of fights) {
    if (cell.n < 3) continue;
    targets.push({
      id: `battle:${key}`, kind: 'battle', text: String(cell.n), color: '#ff6b5a',
      tileX: Math.floor(cell.x / cell.n), tileY: Math.floor(cell.y / cell.n),
      capital: false, kingdomId: null, race: '',
    });
  }
  // Armies: the kingdom's banner over each captain with two or more behind it.
  for (const army of settlements.armySummaries()) {
    if (army.soldiers < 2) continue;
    targets.push({
      id: army.id, kind: 'army', text: String(army.soldiers), color: army.color,
      tileX: Math.floor(army.x), tileY: Math.floor(army.y),
      capital: false, kingdomId: army.kingdomId, race: army.race, entityId: army.captainId,
    });
  }
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
      // A town that changes hands changes banner, which React has to see.
      if (previous.kingdomId !== target.kingdomId) changed = true;
      previous.kingdomId = target.kingdomId;
      previous.race = target.race;
      previous.entityId = target.entityId;
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
}

/**
 * Project every label to screen space and decide whether it should show.
 * Kingdom names belong to the zoomed-out view and village names to the
 * zoomed-in one, which keeps a busy map from turning into a wall of text.
 */
export function projectLabels(ctx: LabelProjectionContext): void {
  const {
    gl,
    camera,
    controls,
    tilesRef,
    entityManagerRef,
    projectionRef,
    inBounds,
  } = ctx;
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
    const band = label.kind === 'battle' || label.kind === 'army' ? 1 : label.kind === 'kingdom' ? kingdomOpacity : villageOpacity;
    // An army's banner rides with its captain, not on the tile it was last seen.
    if (label.entityId) {
      const leader = entityManagerRef.current?.getEntityById(label.entityId);
      if (leader) {
        label.tileX = Math.floor(leader.position.x);
        label.tileY = Math.floor(leader.position.y);
      }
    }
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
}

/**
 * Project the floater pool. Anything attached to an entity follows it, so a
 * damage number stays over the creature that took the hit while it staggers
 * away rather than hanging in the field where the blow landed.
 */
export function projectFloaters(ctx: LabelProjectionContext): void {
  const {
    gl,
    camera,
    controls,
    tilesRef,
    entityManagerRef,
    projectionRef,
    inBounds,
  } = ctx;
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
  const bar = document.querySelector('.powerbar');
  const barTop = bar
    ? bar.getBoundingClientRect().top - canvas.getBoundingClientRect().top - 6
    : Infinity;

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

    // Only what is actually on screen. The old margin let a fight just below
    // the view hang its numbers and hearts over the power bar, as if from
    // nobody at all.
    if (point.z > 1 || point.x < -1 || point.x > 1 || point.y < -0.92 || point.y > 1) {
      slot.opacity = 0;
      continue;
    }
    slot.screenX = (point.x * 0.5 + 0.5) * width;
    slot.screenY = (-point.y * 0.5 + 0.5) * height;
    // Nor from a creature standing under the power bar: its bubble would
    // sit on the buttons with nobody visible to have said it.
    if (slot.screenY > barTop) {
      slot.opacity = 0;
      continue;
    }
    slot.opacity = band;
  }
}
