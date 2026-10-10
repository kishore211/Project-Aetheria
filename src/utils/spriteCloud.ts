// A GPU point cloud that draws thousands of billboarded pixel-art sprites from
// one atlas in a single draw call. Used for terrain decoration (trees, rocks)
// and for village buildings.
//
// Every slot in the cloud has a fixed index so a single tile can be updated in
// O(1) without rebuilding buffers: hidden slots are parked below the world.
import * as THREE from 'three';
import type { Atlas } from './pixelAtlas';
import { DAYLIGHT } from './daylight';

const PARKED_Y = -1000;

const VERTEX_SHADER = /* glsl */ `
  attribute float aSlot;
  attribute float aSize;
  attribute vec3 aTint;
  attribute float aSway;
  uniform float uScale;
  uniform float uWind;
  /** 1 for an orthographic camera, 0 for a perspective one. */
  uniform float uOrtho;
  varying float vSlot;
  varying vec3 vTint;

  void main() {
    vSlot = aSlot;
    vTint = aTint;

    vec3 world = position;

    // Wind. Only sprites that opted in (aSway > 0) move, so buildings and
    // icons stay put while foliage does not.
    //
    // The phase comes from world position, so a gust travels across a forest
    // instead of every tree leaning on the same beat — the same reason the
    // water swell is position-phased. Two frequencies again, because one sine
    // across a whole forest reads as a mechanism.
    // Buildings pulse instead of swaying. WorldBox ships "little scale
    // animations synced with flow of time speed", and it is why a paused
    // WorldBox world still looks alive and a sped-up one looks frantic
    // (09-WORLDBOX-VISUAL-RESEARCH.md §1). aSway < 0 marks a pulser.
    float pulse = 1.0;
    if (aSway < 0.0) {
      float phase = world.x * 2.3 + world.z * 1.7;
      pulse = 1.0 + sin(uWind * 1.6 + phase) * (-aSway) * 0.035;
    }

    if (aSway > 0.0) {
      float phase = world.x * 0.7 + world.z * 0.45;
      float gust = sin(uWind * 0.9 + phase) * 0.65
                 + sin(uWind * 0.37 - phase * 1.7) * 0.35;
      // Horizontal only, and scaled by the sprite's own size so a tree leans
      // further than a tuft of grass.
      world.x += gust * aSway * aSize * 0.09;
      world.z += gust * aSway * aSize * 0.035;
    }

    vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
    // Perspective shrinks a sprite with distance; orthographic does not — its
    // scale is a constant number of pixels per world unit, and depth is the
    // same for everything under a top-down camera. Dividing by depth there
    // gave every sprite one fixed enormous size.
    float pixelsPerUnit = mix(uScale / max(0.001, -mvPosition.z), uScale, uOrtho);
    gl_PointSize = aSize * pulse * pixelsPerUnit;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec2 uCells;
  uniform vec3 uTintK;
  uniform vec3 uTintO;
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
    gl_FragColor = vec4(texel.rgb * vTint * uTintK + uTintO, 1.0);
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
  /**
   * Motion for this sprite. Defaults to 0 — dead still — so an icon over a
   * head needs no opt-out.
   *
   * Positive leans in the wind (foliage). **Negative pulses in scale**
   * (buildings), which is a different motion for a different kind of thing:
   * a swaying house looks broken, a breathing one looks inhabited. One
   * attribute rather than two because the shader branch is cheaper than a
   * second per-vertex float and the two are mutually exclusive by nature.
   */
  sway?: number;
}

export class SpriteCloud {
  readonly points: THREE.Points;
  private atlas: Atlas;
  private positions: THREE.BufferAttribute;
  private slots: THREE.BufferAttribute;
  private sizes: THREE.BufferAttribute;
  private tints: THREE.BufferAttribute;
  private sways: THREE.BufferAttribute;
  private material: THREE.ShaderMaterial;
  readonly capacity: number;

  /**
   * @param lit Whether the sprites stand in the world's daylight (buildings,
   *   boats) or float above it as interface (icons), which stays readable.
   */
  constructor(atlas: Atlas, capacity: number, lit = false) {
    this.atlas = atlas;
    this.capacity = capacity;

    const geometry = new THREE.BufferGeometry();
    this.positions = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
    this.slots = new THREE.BufferAttribute(new Float32Array(capacity), 1);
    this.sizes = new THREE.BufferAttribute(new Float32Array(capacity), 1);
    this.tints = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
    this.sways = new THREE.BufferAttribute(new Float32Array(capacity), 1);

    for (let i = 0; i < capacity; i++) {
      this.positions.setXYZ(i, 0, PARKED_Y, 0);
      this.slots.setX(i, -1);
      this.sizes.setX(i, 0);
      this.tints.setXYZ(i, 1, 1, 1);
      this.sways.setX(i, 0);
    }

    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('aSlot', this.slots);
    geometry.setAttribute('aSize', this.sizes);
    geometry.setAttribute('aTint', this.tints);
    geometry.setAttribute('aSway', this.sways);
    // Everything is parked or placed manually; a fixed sphere avoids per-frame
    // bounding recomputation and keeps the cloud from being culled.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: atlas.texture },
        uCells: { value: new THREE.Vector2(atlas.cols, atlas.rows) },
        uScale: { value: 400 },
        uOrtho: { value: 0 },
        uWind: { value: 0 },
        uTintK: { value: lit ? DAYLIGHT.k : new THREE.Vector3(1, 1, 1) },
        uTintO: { value: lit ? DAYLIGHT.o : new THREE.Vector3(0, 0, 0) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: false,
      depthWrite: true,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  /**
   * Advance the wind clock. Called once per frame; runs while paused, because a
   * frozen forest is as much of a tell as a frozen sea.
   */
  advanceWind(delta: number): void {
    const wind = this.material.uniforms.uWind;
    wind.value = (wind.value + delta) % 10000;
  }

  /** Keep point sizes stable across window sizes (half the drawing height). */
  /**
   * How many screen pixels one world unit covers, and which projection we are
   * under. The two have to travel together: the shader needs the flag to know
   * whether the number it has been given is already final or still has to be
   * divided by depth.
   */
  setViewportScale(scale: number, orthographic = false): void {
    this.material.uniforms.uScale.value = scale;
    this.material.uniforms.uOrtho.value = orthographic ? 1 : 0;
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
    this.sways.setX(index, item.sway ?? 0);
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
    this.sways.needsUpdate = true;
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
