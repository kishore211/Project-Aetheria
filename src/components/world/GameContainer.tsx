import { useEffect, useRef } from 'react';
import { MapControls } from '@react-three/drei';
import { MapControls as MapControlsImpl } from 'three-stdlib';
import { useGameEngine } from '../../hooks/useGameEngine';
import { MAP_SIZES, TILE_SIZE } from '../../types/world';
import { useGameStore } from '../../store/gameStore';

/**
 * Scene-level setup: camera controls tuned for a map (pan first, high pitch)
 * and the game engine itself. Lighting is owned by the engine so it can follow
 * the time of day; terrain shadows are deliberately absent.
 */
const GameContainer = () => {
  const controlsRef = useRef<MapControlsImpl>(null);
  const { worldSize, customWorldSize } = useGameStore();
  const { isInitialized } = useGameEngine();

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !isInitialized) return;

    const mapSize = worldSize === 'custom' ? customWorldSize : MAP_SIZES[worldSize];
    const worldUnits = mapSize * TILE_SIZE;

    // Close enough to read a single creature, far enough to see the whole map
    controls.minDistance = Math.max(3, worldUnits * 0.06);
    controls.maxDistance = worldUnits * 1.35;

    // Never look from below the horizon, and keep a map-like tilt
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI / 2.6;

    // Keep panning inside the world instead of drifting into empty space
    controls.screenSpacePanning = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.zoomSpeed = 1.1;
    controls.panSpeed = 1.0;
    controls.update();
  }, [isInitialized, worldSize, customWorldSize]);

  return (
    <MapControls
      ref={controlsRef}
      makeDefault
      enableRotate
      enableZoom
      enablePan
      target={[0, 0, 0]}
    />
  );
};

export default GameContainer;
