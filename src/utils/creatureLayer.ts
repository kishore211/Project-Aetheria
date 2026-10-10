// Every creature in one draw call.
//
// Each creature used to be its own THREE.Sprite plus two more for its health
// bar: two thousand creatures cost four thousand draw calls and ten
// milliseconds a frame before the simulation had done anything. WorldBox
// runs worlds with many thousands of units, so the renderer has to stop
// scaling with the population.
//
// The per-creature objects stay exactly as they were — the animation code
// still squashes, mirrors, tints and flashes each sprite, and picking still
// raycasts against them — but their materials are switched off, and this
// layer copies what they would have drawn into one instanced quad mesh fed
// from a shared atlas of every sprite frame seen so far. So nothing about how
// a creature looks had to change to make a crowd of them cheap.
import * as THREE from 'three';
import type { Entity } from '../types/world';

/** Art pixels per frame. Every sprite template is 12x12. */
const ART = 12;
/** One transparent pixel around each frame, so nearest sampling never bleeds. */
const CELL = ART + 2;
const ATLAS = 1024;
const PER_ROW = Math.floor(ATLAS / CELL);
const CAPACITY_CELLS = PER_ROW * PER_ROW;

const VERTEX = /* glsl */ `
  attribute vec3 iCenter;
  attribute vec2 iScale;
  attribute float iRot;
  attribute vec4 iUV;
  attribute vec4 iColor;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    // Billboarded in view space, the way THREE.Sprite does it.
    vec4 mv = modelViewMatrix * vec4(iCenter, 1.0);
    vec2 p = position.xy * iScale;
    float c = cos(iRot);
    float s = sin(iRot);
    mv.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    gl_Position = projectionMatrix * mv;
    vUv = mix(iUV.xy, iUV.zw, uv);
    vColor = iColor;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    vec4 texel = texture2D(map, vUv);
    if (texel.a < 0.1) discard;
    gl_FragColor = vec4(texel.rgb * vColor.rgb, texel.a * vColor.a);
    #include <colorspace_fragment>
  }
`;

/** Switch a per-creature mesh's own drawing off; the layer draws it instead. */
export const handOverToLayer = (mesh: THREE.Object3D): void => {
  mesh.traverse((child) => {
    const material = (child as THREE.Sprite).material as THREE.Material | undefined;
    if (material) material.visible = false;
  });
};

export class CreatureLayer {
  readonly mesh: THREE.Mesh;
  private geometry: THREE.InstancedBufferGeometry;
  private material: THREE.ShaderMaterial;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private atlas: THREE.CanvasTexture;
  /** Frame texture -> atlas cell. Weak, so retired textures do not pin it. */
  private cells = new WeakMap<THREE.Texture, number>();
  private nextCell = 1; // cell 0 is solid white, for the health bars
  private dirty = false;
  private capacity = 0;
  private center!: THREE.InstancedBufferAttribute;
  private scale!: THREE.InstancedBufferAttribute;
  private rot!: THREE.InstancedBufferAttribute;
  private uv!: THREE.InstancedBufferAttribute;
  private color!: THREE.InstancedBufferAttribute;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS;
    this.canvas.height = ATLAS;
    this.ctx = this.canvas.getContext('2d');
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(1, 1, ART, ART);
    }
    this.atlas = new THREE.CanvasTexture(this.canvas);
    this.atlas.magFilter = THREE.NearestFilter;
    this.atlas.minFilter = THREE.NearestFilter;
    this.atlas.generateMipmaps = false;
    this.atlas.colorSpace = THREE.SRGBColorSpace;
    this.atlas.flipY = false;

    this.geometry = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geometry.setIndex(quad.getIndex());
    this.geometry.setAttribute('position', quad.getAttribute('position'));
    this.geometry.setAttribute('uv', quad.getAttribute('uv'));
    this.grow(2048);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { map: { value: this.atlas } },
      transparent: false,
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'creatures';
  }

  private grow(capacity: number): void {
    this.capacity = capacity;
    const make = (size: number) => {
      const attribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
      attribute.setUsage(THREE.DynamicDrawUsage);
      return attribute;
    };
    this.center = make(3);
    this.scale = make(2);
    this.rot = make(1);
    this.uv = make(4);
    this.color = make(4);
    this.geometry.setAttribute('iCenter', this.center);
    this.geometry.setAttribute('iScale', this.scale);
    this.geometry.setAttribute('iRot', this.rot);
    this.geometry.setAttribute('iUV', this.uv);
    this.geometry.setAttribute('iColor', this.color);
    this.geometry.instanceCount = 0;
  }

  /** The atlas cell for a frame texture, copying it in the first time it is seen. */
  private cellFor(texture: THREE.Texture): number {
    const known = this.cells.get(texture);
    if (known !== undefined) return known;
    if (this.nextCell >= CAPACITY_CELLS) {
      // Full: start again. Whatever is on screen re-registers within a frame.
      this.cells = new WeakMap();
      this.nextCell = 1;
      this.ctx?.clearRect(CELL, 0, ATLAS - CELL, CELL);
      this.ctx?.clearRect(0, CELL, ATLAS, ATLAS - CELL);
    }
    const cell = this.nextCell++;
    const image = texture.image as CanvasImageSource | undefined;
    if (this.ctx && image) {
      const x = (cell % PER_ROW) * CELL + 1;
      const y = Math.floor(cell / PER_ROW) * CELL + 1;
      this.ctx.clearRect(x - 1, y - 1, CELL, CELL);
      this.ctx.drawImage(image, x, y, ART, ART);
      this.dirty = true;
    }
    this.cells.set(texture, cell);
    return cell;
  }

  private writeUV(i: number, cell: number): void {
    const x = (cell % PER_ROW) * CELL + 1;
    const y = Math.floor(cell / PER_ROW) * CELL + 1;
    // flipY is off, so v runs down the canvas: the quad's top samples row y.
    this.uv.setXYZW(i, x / ATLAS, (y + ART) / ATLAS, (x + ART) / ATLAS, y / ATLAS);
  }

  private count = 0;
  private push(
    x: number, y: number, z: number, sx: number, sy: number, rotation: number,
    cell: number, color: THREE.Color, alpha: number,
  ): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.center.setXYZ(i, x, y, z);
    this.scale.setXY(i, sx, sy);
    this.rot.setX(i, rotation);
    this.writeUV(i, cell);
    this.color.setXYZW(i, color.r, color.g, color.b, alpha);
  }

  /**
   * Copy every visible creature's sprite, and its health bar when showing,
   * into the instance buffers. Reads the very objects the animation code just
   * wrote to, so it must run after the entity update each frame.
   */
  update(entities: readonly Entity[]): number {
    const needed = entities.length * 3;
    if (needed > this.capacity) this.grow(Math.max(needed, this.capacity * 2));
    this.count = 0;

    for (const entity of entities) {
      const root = entity.mesh;
      if (!root || !root.visible) continue;
      for (const child of root.children) {
        if (child instanceof THREE.Sprite) {
          const material = child.material as THREE.SpriteMaterial;
          if (!material.map) continue;
          this.push(
            root.position.x + child.position.x,
            root.position.y + child.position.y,
            root.position.z + child.position.z,
            child.scale.x, child.scale.y, material.rotation,
            this.cellFor(material.map), material.color, material.opacity,
          );
        } else if (child.name === 'healthBar' && child.visible) {
          for (const part of child.children) {
            const sprite = part as THREE.Sprite;
            const material = sprite.material as THREE.SpriteMaterial;
            this.push(
              root.position.x + child.position.x + sprite.position.x,
              // The fill sits a hair above its background, as it did as a sprite.
              root.position.y + child.position.y + sprite.position.y + (sprite.position.z > 0 ? 0.002 : 0),
              root.position.z + child.position.z,
              sprite.scale.x, sprite.scale.y, 0,
              0, material.color, 1,
            );
          }
        }
      }
    }

    this.geometry.instanceCount = this.count;
    this.center.needsUpdate = true;
    this.scale.needsUpdate = true;
    this.rot.needsUpdate = true;
    this.uv.needsUpdate = true;
    this.color.needsUpdate = true;
    if (this.dirty) {
      this.atlas.needsUpdate = true;
      this.dirty = false;
    }
    return this.count;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.atlas.dispose();
  }
}
