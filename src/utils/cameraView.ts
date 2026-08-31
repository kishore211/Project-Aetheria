// How much of the world is currently on screen.
//
// Every level-of-detail decision in the game — which icons to draw, when map
// labels fade in, whether damage numbers are legible — is really asking one
// question: *how many world units tall is the view right now?*
//
// It used to be answered with `camera.position.length()`, which works only for
// a perspective camera that moves toward what it is looking at. The map camera
// is orthographic and sits at a fixed altitude, so that distance is a constant
// and every one of those decisions silently froze at one value. This is the
// one place that knows how to ask the question of either camera.
import * as THREE from 'three';

/**
 * World units visible from the top of the viewport to the bottom.
 *
 * Smaller means zoomed in. For an orthographic camera this is the frustum
 * height divided by zoom; for a perspective camera it is the height of the
 * view at the distance of the focus point.
 */
export const visibleWorldSpan = (
  camera: THREE.Camera,
  focus?: THREE.Vector3,
): number => {
  const ortho = camera as THREE.OrthographicCamera;
  if (ortho.isOrthographicCamera) {
    return Math.abs(ortho.top - ortho.bottom) / Math.max(1e-6, ortho.zoom);
  }

  const perspective = camera as THREE.PerspectiveCamera;
  if (perspective.isPerspectiveCamera) {
    const distance = focus
      ? camera.position.distanceTo(focus)
      : camera.position.length();
    return 2 * distance * Math.tan((perspective.fov * Math.PI) / 360);
  }

  return 1;
};

/**
 * The same thing as a fraction of the world's own size, which is what most
 * callers actually want: 1 means the whole world fits the screen exactly, 0.1
 * means you are looking at a tenth of it.
 */
export const viewFraction = (
  camera: THREE.Camera,
  worldUnits: number,
  focus?: THREE.Vector3,
): number => visibleWorldSpan(camera, focus) / Math.max(1e-6, worldUnits);
