// A GPU point cloud that draws thousands of billboarded pixel-art sprites from
// one atlas in a single draw call. Used for terrain decoration (trees, rocks)
// and for village buildings.
//
// Every slot in the cloud has a fixed index so a single tile can be updated in
// O(1) without rebuilding buffers: hidden slots are parked below the world.
import * as THREE from 'three';
import type { Atlas } from './pixelAtlas';

const PARKED_Y = -1000;

const VERTEX_SHADER = /* glsl */ `
  attribute float aSlot;
  attribute float aSize;
  attribute vec3 aTint;
  uniform float uScale;
  varying float vSlot;
  varying vec3 vTint;

  void main() {
    vSlot = aSlot;
    vTint = aTint;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (uScale / max(0.001, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec2 uCells;
  varying float vSlot;
  varying vec3 vTint;

  void main() {
    if (vSlot < 0.0) discard;
    float col = mod(vSlot, uCells.x);
    float row = floor(vSlot / uCells.x);
    vec2 cell = vec2(1.0 / uCells.x, 1.0 / uCells.y);
    vec2 uv = (vec2(col, row) + gl_PointCoord) * cell;
    vec4 texel = texture2D(uAtlas, uv);
    if (texel.a < 0.5) discard;
    gl_FragColor = vec4(texel.rgb * vTint, 1.0);
  }
`;

export interface SpriteCloudItem {
  position: THREE.Vector3;
  /** Slot name from the atlas. */
  sprite: string;
  /** World-space size in units. */
  size: number;
  /** Multiplicative tint (defaults to white). */
  tint?: THREE.Color;
}

export class SpriteCloud {
  readonly points: THREE.Points;
  private atlas: Atlas;
  private positions: THREE.BufferAttribute;
  private slots: THREE.BufferAttribute;
  private sizes: THREE.BufferAttribute;
  private tints: THREE.BufferAttribute;
  private material: THREE.ShaderMaterial;
  readonly capacity: number;

  constructor(atlas: Atlas, capacity: number) {
    this.atlas = atlas;
    this.capacity = capacity;

    const geometry = new THREE.BufferGeometry();
    this.positions = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
    this.slots = new THREE.BufferAttribute(new Float32Array(capacity), 1);
    this.sizes = new THREE.BufferAttribute(new Float32Array(capacity), 1);
    this.tints = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);

    for (let i = 0; i < capacity; i++) {
      this.positions.setXYZ(i, 0, PARKED_Y, 0);
      this.slots.setX(i, -1);
      this.sizes.setX(i, 0);
      this.tints.setXYZ(i, 1, 1, 1);
    }

    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('aSlot', this.slots);
    geometry.setAttribute('aSize', this.sizes);
    geometry.setAttribute('aTint', this.tints);
    // Everything is parked or placed manually; a fixed sphere avoids per-frame
    // bounding recomputation and keeps the cloud from being culled.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: atlas.texture },
        uCells: { value: new THREE.Vector2(atlas.cols, atlas.rows) },
        uScale: { value: 400 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: false,
      depthWrite: true,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  /** Keep point sizes stable across window sizes (half the drawing height). */
  setViewportScale(scale: number): void {
    this.material.uniforms.uScale.value = scale;
  }

  /** Place or replace the sprite in a slot. */
  set(index: number, item: SpriteCloudItem): void {
    if (index < 0 || index >= this.capacity) return;
    const slot = this.atlas.slots[item.sprite];
    if (slot === undefined) return;
    this.positions.setXYZ(index, item.position.x, item.position.y, item.position.z);
    this.slots.setX(index, slot);
    this.sizes.setX(index, item.size);
    const tint = item.tint;
    this.tints.setXYZ(index, tint ? tint.r : 1, tint ? tint.g : 1, tint ? tint.b : 1);
    this.markDirty();
  }

  /** Move an existing sprite without touching its art. */
  setPosition(index: number, position: THREE.Vector3): void {
    if (index < 0 || index >= this.capacity) return;
    if (this.slots.getX(index) < 0) return;
    this.positions.setXYZ(index, position.x, position.y, position.z);
    this.positions.needsUpdate = true;
  }

  /** Recolour an existing sprite (kingdom colours, scorch marks…). */
  setTint(index: number, tint: THREE.Color): void {
    if (index < 0 || index >= this.capacity) return;
    this.tints.setXYZ(index, tint.r, tint.g, tint.b);
    this.tints.needsUpdate = true;
  }

  /** Hide the slot. */
  clear(index: number): void {
    if (index < 0 || index >= this.capacity) return;
    this.positions.setXYZ(index, 0, PARKED_Y, 0);
    this.slots.setX(index, -1);
    this.sizes.setX(index, 0);
    this.markDirty();
  }

  has(index: number): boolean {
    return index >= 0 && index < this.capacity && this.slots.getX(index) >= 0;
  }

  clearAll(): void {
    for (let i = 0; i < this.capacity; i++) this.clear(i);
  }

  private markDirty(): void {
    this.positions.needsUpdate = true;
    this.slots.needsUpdate = true;
    this.sizes.needsUpdate = true;
    this.tints.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
