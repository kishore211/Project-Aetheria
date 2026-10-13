// Conway's Game of Life, as a toy laid over the world.
//
// WorldBox ships it among its fun powers: click to seed a patch of cells and
// watch them breed, starve and glide across your continent. It changes
// nothing underneath — it is a drawing that draws itself — which is exactly
// why it belongs on its own layer rather than in the tiles.

import * as THREE from 'three';
import { TILE_SIZE } from '../types/world';

const key = (x: number, y: number): number => x * 65536 + y;
const unkey = (k: number): [number, number] => [Math.floor(k / 65536), k % 65536];

/** Hard ceiling, so a runaway pattern cannot eat the frame. */
export const MAX_CELLS = 6000;

/**
 * One generation, the standard B3/S23 rule, on a board `size` tiles across.
 * Cells pushed off the edge simply die. Pure, so it can be tested.
 */
export const stepLife = (live: ReadonlySet<number>, size: number): Set<number> => {
  const counts = new Map<number, number>();
  for (const cell of live) {
    const [x, y] = unkey(cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const k = key(nx, ny);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
  }
  const next = new Set<number>();
  for (const [cell, n] of counts) {
    if (n === 3 || (n === 2 && live.has(cell))) next.add(cell);
    if (next.size >= MAX_CELLS) break;
  }
  return next;
};

/** A glider, heading down and to the right. */
export const GLIDER: Array<[number, number]> = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];

export class ConwayLayer {
  readonly mesh: THREE.InstancedMesh;
  private live = new Set<number>();
  private timer = 0;
  private dirty = false;
  private matrix = new THREE.Matrix4();
  private size = 0;

  constructor() {
    const geometry = new THREE.PlaneGeometry(TILE_SIZE * 0.92, TILE_SIZE * 0.92);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0xf2fff0, transparent: true, opacity: 0.85, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_CELLS);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'conway';
  }

  get count(): number {
    return this.live.size;
  }

  /** Seed cells: a glider, or a random soup across the brush. */
  seed(x: number, y: number, radius: number, size: number, random: () => number, glider = false): number {
    this.size = size;
    let added = 0;
    const put = (cx: number, cy: number) => {
      if (cx < 0 || cy < 0 || cx >= size || cy >= size || this.live.size >= MAX_CELLS) return;
      const k = key(cx, cy);
      if (!this.live.has(k)) { this.live.add(k); added++; }
    };
    if (glider) {
      for (const [dx, dy] of GLIDER) put(x + dx - 1, y + dy - 1);
    } else {
      const r = Math.max(2, radius + 2);
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (dx * dx + dy * dy <= r * r && random() < 0.42) put(x + dx, y + dy);
        }
      }
    }
    this.dirty = true;
    return added;
  }

  clear(): void {
    this.live.clear();
    this.dirty = true;
  }

  /** Advance on simulated time: about four generations a second. */
  update(delta: number): void {
    if (this.live.size > 0) {
      this.timer += delta;
      if (this.timer >= 0.25) {
        this.timer = 0;
        this.live = stepLife(this.live, this.size);
        this.dirty = true;
      }
    }
    if (!this.dirty) return;
    this.dirty = false;
    let i = 0;
    const half = this.size / 2;
    for (const cell of this.live) {
      const [x, y] = unkey(cell);
      this.matrix.makeTranslation((x - half + 0.5) * TILE_SIZE, 0.09, (y - half + 0.5) * TILE_SIZE);
      this.mesh.setMatrixAt(i++, this.matrix);
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
