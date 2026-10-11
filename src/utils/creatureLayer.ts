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

const SHADOW_VERTEX = /* glsl */ `
  attribute vec3 iCenter;
  attribute vec2 iScale;
  varying vec2 vUv;
  void main() {
    vec4 mv = modelViewMatrix * vec4(iCenter, 1.0);
    mv.xy += position.xy * iScale;
    gl_Position = projectionMatrix * mv;
    vUv = uv;
  }
`;

const SHADOW_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float d = dot(p, p);
    if (d > 1.0) discard;
    gl_FragColor = vec4(0.05, 0.06, 0.04, 0.32 * (1.0 - d * 0.55));
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
  /** The creatures and, beneath them, their shadows. */
  readonly mesh: THREE.Group;
  private sprites: THREE.Mesh;
  private shadowGeometry: THREE.InstancedBufferGeometry;
  private shadowMaterial: THREE.ShaderMaterial;
  private shadowCenter!: THREE.InstancedBufferAttribute;
  private shadowScale!: THREE.InstancedBufferAttribute;
  private shadowCapacity = 0;
  private shadowCount = 0;
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
    this.sprites = new THREE.Mesh(this.geometry, this.material);
    this.sprites.frustumCulled = false;
    this.sprites.name = 'creatures';

    // Shadows: a soft dark ellipse at every creature's feet, thrown down and
    // to the right like everything else on the map. It is most of what keeps
    // a green orc readable in a green wood — WorldBox's units all have one.
    this.shadowGeometry = new THREE.InstancedBufferGeometry();
    this.shadowGeometry.setIndex(quad.getIndex());
    this.shadowGeometry.setAttribute('position', quad.getAttribute('position'));
    this.shadowGeometry.setAttribute('uv', quad.getAttribute('uv'));
    this.growShadows(1024);
    this.shadowMaterial = new THREE.ShaderMaterial({
      vertexShader: SHADOW_VERTEX,
      fragmentShader: SHADOW_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    const shadows = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
    shadows.frustumCulled = false;
    shadows.renderOrder = -1;
    shadows.name = 'creature-shadows';

    this.mesh = new THREE.Group();
    this.mesh.name = 'creature-layer';
    this.mesh.add(shadows, this.sprites);
  }

  private growShadows(capacity: number): void {
    this.shadowCapacity = capacity;
    this.shadowCenter = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.shadowScale = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    this.shadowCenter.setUsage(THREE.DynamicDrawUsage);
    this.shadowScale.setUsage(THREE.DynamicDrawUsage);
    this.shadowGeometry.setAttribute('iCenter', this.shadowCenter);
    this.shadowGeometry.setAttribute('iScale', this.shadowScale);
    this.shadowGeometry.instanceCount = 0;
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
  update(entities: readonly Entity[], minSize = 0): number {
    const needed = entities.length * 3;
    if (needed > this.capacity) this.grow(Math.max(needed, this.capacity * 2));
    if (entities.length > this.shadowCapacity) this.growShadows(Math.max(entities.length, this.shadowCapacity * 2));
    this.count = 0;
    this.shadowCount = 0;

    for (const entity of entities) {
      const root = entity.mesh;
      if (!root || !root.visible) continue;
      for (const child of root.children) {
        if (child instanceof THREE.Sprite) {
          const material = child.material as THREE.SpriteMaterial;
          if (!material.map) continue;
          // Never smaller than a few pixels on screen: zoomed right out a
          // crowd should still read as people, not vanish under its icons.
          const tall = Math.abs(child.scale.y);
          const grow = tall > 0 && tall < minSize ? minSize / tall : 1;
          const width = Math.abs(child.scale.x) * grow;
          if (this.shadowCount < this.shadowCapacity) {
            const s = this.shadowCount++;
            this.shadowCenter.setXYZ(s, root.position.x + width * 0.08, root.position.y + 0.01, root.position.z + width * 0.18);
            this.shadowScale.setXY(s, width * 0.62, width * 0.24);
          }
          this.push(
            root.position.x + child.position.x,
            root.position.y + child.position.y,
            // A grown sprite stands on its feet rather than sinking into them.
            root.position.z + child.position.z - (grow > 1 ? (tall * grow - tall) * 0.5 : 0),
            child.scale.x * grow, child.scale.y * grow, material.rotation,
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
    this.shadowGeometry.instanceCount = this.shadowCount;
    this.shadowCenter.needsUpdate = true;
    this.shadowScale.needsUpdate = true;
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
    this.shadowGeometry.dispose();
    this.shadowMaterial.dispose();
    this.atlas.dispose();
  }
}
