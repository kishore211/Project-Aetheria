// Arrows in flight.
//
// An archer that hurts something three tiles away with nothing crossing the
// gap reads as a bug. WorldBox draws every arrow; so do we, as a short dark
// stroke riding an arc from bow to target. The creature AI only records the
// shot; the engine owns the scene and draws it, the same split as the
// floating-text bridge.
import * as THREE from 'three';
import type { Entity } from '../types/world';

/** What is flying: decides its colour and how high it arcs. */
export type ShotKind = 'arrow' | 'fire' | 'magic' | 'dark' | 'laser';

const SHOT_COLOR: Record<ShotKind, [number, number, number]> = {
  arrow: [0.17, 0.11, 0.06],
  fire: [1, 0.55, 0.12],
  magic: [0.72, 0.45, 1],
  dark: [0.35, 0.95, 0.55],
  laser: [0.45, 1, 0.95],
};

/** Arrows arc; spells and beams fly flat. */
const SHOT_ARC: Record<ShotKind, number> = { arrow: 0.35, fire: 0.12, magic: 0.18, dark: 0.15, laser: 0 };

interface Shot {
  kind: ShotKind;
  fromX: number; fromY: number;
  toX: number; toY: number;
  /** 0 → 1 over the flight. */
  t: number;
  /** Seconds the flight takes, from its length. */
  flight: number;
}

const MAX_SHOTS = 96;
const queue: Shot[] = [];

/** Record an arrow leaving `from` for `to`. Oldest is dropped when full. */
export const emitShot = (from: Pick<Entity, 'position'>, to: Pick<Entity, 'position'>, kind: ShotKind = 'arrow'): void => {
  if (queue.length >= MAX_SHOTS) queue.shift();
  const distance = Math.hypot(to.position.x - from.position.x, to.position.y - from.position.y);
  queue.push({
    kind,
    fromX: from.position.x, fromY: from.position.y,
    toX: to.position.x, toY: to.position.y,
    t: 0,
    flight: Math.max(0.12, distance * (kind === 'laser' ? 0.03 : 0.07)),
  });
};

/** How many are in the air. For tests. */
export const shotsInFlight = (): number => queue.length;

/** Forget everything in flight, on a new world. */
export const clearShots = (): void => {
  queue.length = 0;
};

/** Advance the flights. Done in simulated time, so pause freezes the arrows. */
export const advanceShots = (delta: number): void => {
  for (let i = queue.length - 1; i >= 0; i--) {
    const shot = queue[i];
    shot.t += delta / shot.flight;
    if (shot.t >= 1) queue.splice(i, 1);
  }
};

/** Draws everything in `queue` as line segments. */
export class ShotLayer {
  readonly lines: THREE.LineSegments;
  private positions: THREE.BufferAttribute;
  private colours: THREE.BufferAttribute;
  private head = new THREE.Vector3();
  private tail = new THREE.Vector3();

  constructor() {
    const geometry = new THREE.BufferGeometry();
    this.positions = new THREE.BufferAttribute(new Float32Array(MAX_SHOTS * 2 * 3), 3);
    this.colours = new THREE.BufferAttribute(new Float32Array(MAX_SHOTS * 2 * 3), 3);
    this.positions.setUsage(THREE.DynamicDrawUsage);
    this.colours.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('color', this.colours);
    geometry.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
      vertexColors: true,
      depthTest: false,
    }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 6;
    this.lines.name = 'arrows';
  }

  /** `toWorld` maps tile coordinates to scene space (y up, z down the screen). */
  update(toWorld: (x: number, y: number, out: THREE.Vector3) => THREE.Vector3): number {
    let count = 0;
    for (const shot of queue) {
      const at = (t: number, out: THREE.Vector3) => {
        toWorld(shot.fromX + (shot.toX - shot.fromX) * t, shot.fromY + (shot.toY - shot.fromY) * t, out);
        // The arc: top-down, height reads as a lift up the screen.
        const lift = Math.sin(t * Math.PI) * SHOT_ARC[shot.kind];
        out.y += 0.3 + lift;
        out.z -= lift;
        return out;
      };
      at(Math.min(1, shot.t), this.head);
      // A beam is drawn the whole way; everything else as a short streak.
      at(shot.kind === 'laser' ? 0 : Math.max(0, shot.t - (shot.kind === 'arrow' ? 0.12 : 0.22)), this.tail);
      this.positions.setXYZ(count * 2, this.tail.x, this.tail.y, this.tail.z);
      this.positions.setXYZ(count * 2 + 1, this.head.x, this.head.y, this.head.z);
      const [r, g, b] = SHOT_COLOR[shot.kind];
      this.colours.setXYZ(count * 2, r * 0.6, g * 0.6, b * 0.6);
      this.colours.setXYZ(count * 2 + 1, r, g, b);
      count += 1;
    }
    this.positions.needsUpdate = true;
    this.colours.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, count * 2);
    return count;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}
