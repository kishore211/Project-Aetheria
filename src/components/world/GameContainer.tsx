import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import { MapControls as MapControlsImpl } from 'three-stdlib';
import { useGameEngine } from '../../hooks/useGameEngine';
import { MAP_SIZES, TILE_SIZE } from '../../types/world';
import { useGameStore } from '../../store/gameStore';

/**
 * High enough that nothing clips, low enough to stay well inside `far`. With an
 * orthographic camera the altitude has no effect on framing at all — only on
 * what falls inside the near/far planes.
 */
const CAMERA_ALTITUDE = 200;

/**
 * How far off vertical the camera sits, in radians.
 *
 * Not zero. At exactly zero the view direction is parallel to `camera.up`, the
 * camera's roll is undefined, and OrbitControls resolves it by flipping the
 * world around unpredictably as you pan. A thousandth of a radian is
 * indistinguishable from straight down — the tile sides it exposes are well
 * under a pixel — and it is numerically stable.
 */
const TOP_DOWN_EPSILON = 0.001;

/**
 * Scene-level setup: a straight-down orthographic map camera, and the game
 * engine itself. Lighting is owned by the engine so it can follow the time of
 * day; terrain shadows are deliberately absent.
 */
const GameContainer = () => {
  const controlsRef = useRef<MapControlsImpl>(null);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const { worldSize, customWorldSize, worldSeed, worldRevision } = useGameStore();
  const { isInitialized } = useGameEngine();

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !isInitialized) return;

    const mapSize = worldSize === 'custom' ? customWorldSize : MAP_SIZES[worldSize];
    const worldUnits = mapSize * TILE_SIZE;
    const ortho = camera as THREE.OrthographicCamera;

    // Zoom, not distance. An orthographic camera's framing is `zoom`, and
    // moving it along its view axis changes nothing you can see.
    const viewport = Math.min(size.width, size.height);
    // Whole map in frame at the far end, a few tiles across at the near end.
    controls.minZoom = viewport / worldUnits * 0.75;
    // At most about 16 tiles across the short edge.
    //
    // This was 34, set when a tile's top face was one flat colour and getting
    // closer only made the flatness bigger. The ground has art in it now — an
    // 8x8 grain, dithered edges, a per-pixel coastline, tools in hands — and
    // none of that is legible from far enough away to see thirty-four tiles at
    // once. Half the distance is where the pixels start reading as pixels,
    // which is the whole point of drawing them.
    controls.maxZoom = viewport / (TILE_SIZE * 16);

    // Straight down, and staying there. Rotation is what put the sides of the
    // tiles on screen in the first place.
    //
    // A hair off vertical rather than exactly 0: at exactly zero the view
    // direction is parallel to `camera.up` and the camera's orientation is
    // undefined, which OrbitControls resolves by flipping unpredictably.
    controls.minPolarAngle = TOP_DOWN_EPSILON;
    controls.maxPolarAngle = TOP_DOWN_EPSILON;
    controls.enableRotate = false;

    controls.screenSpacePanning = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.zoomSpeed = 1.1;
    controls.panSpeed = 1.0;

    // Frame the new world: close enough that the map runs past the edges of
    // the screen, which is what makes it read as a place rather than an object.
    controls.target.set(0, 0, 0);
    camera.position.set(0, CAMERA_ALTITUDE, CAMERA_ALTITUDE * Math.tan(TOP_DOWN_EPSILON));
    ortho.zoom = THREE.MathUtils.clamp(
      viewport / worldUnits * 1.15, controls.minZoom, controls.maxZoom,
    );
    ortho.updateProjectionMatrix();
    controls.update();
  }, [isInitialized, worldSize, customWorldSize, worldSeed, worldRevision, camera, size]);

  return (
    <MapControls
      ref={controlsRef}
      makeDefault
      enableRotate={false}
      enableZoom
      enablePan
      target={[0, 0, 0]}
    />
  );
};

export default GameContainer;
