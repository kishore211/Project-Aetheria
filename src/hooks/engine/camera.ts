import type { RefObject } from 'react';
import * as THREE from 'three';
import type { RootState } from '@react-three/fiber';

import { useGameStore } from '../../store/gameStore';
import { TILE_SIZE, type Tile } from '../../types/world';
import type { EntityManager } from '../../utils/entityManagerMinimal';
import { heldDirection } from '../../utils/possession';
import { isShaking, sampleShake } from '../../utils/impactBridge';

/** What the camera reads and writes each frame: the view, the map, and the nonces and shake state it carries between frames. */
export interface CameraContext {
  gl: THREE.WebGLRenderer;
  camera: THREE.Camera;
  controls: RootState['controls'];
  tilesRef: RefObject<Tile[][]>;
  entityManagerRef: RefObject<EntityManager | null>;
  lastCameraNonceRef: RefObject<number>;
  lastZoomNonceRef: RefObject<number>;
  shakingRef: RefObject<boolean>;
  inBounds: (x: number, y: number) => boolean;
  tileWorldPosition: (tile: Tile) => THREE.Vector3;
}

/** Follow a unit or fly to a requested tile. */
export function updateCamera(ctx: CameraContext, delta: number): void {
  const {
    gl,
    camera,
    controls,
    tilesRef,
    entityManagerRef,
    lastCameraNonceRef,
    lastZoomNonceRef,
    shakingRef,
    inBounds,
    tileWorldPosition,
  } = ctx;
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
}
