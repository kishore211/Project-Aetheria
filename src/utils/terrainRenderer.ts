// Terrain renderer.
//
// The world is drawn as **one picture**: a texture eight pixels to a tile,
// painted by `MapPainter`, on a single plane. That is how WorldBox draws its
// world, and it is the only way to stop the map looking like a grid of
// squares up close — a box per tile has four straight edges however its face
// is shaded, while a painted image can have round islets, meandering biome
// boundaries, foam on the waterline and overlapping tree canopies.
//
// Draw calls: the map plane, the sea apron around it, and an invisible
// instanced mesh kept only so the raycaster can still answer "which tile is
// under the cursor" with an instance id. Every mutation repaints just the
// touched tile's neighbourhood.
import * as THREE from 'three';
import {
  TILE_SIZE,
  computeScaledHeight,
  isWaterBiome,
  type Tile,
} from '../types/world';
import { getBiomeColor } from './worldGenerator';
import { drainsTerrain, isDataLayer, sampleRamp, type MapLayer } from './mapLayers';
import { MapPainter, PX } from './mapPainter';
import { DAYLIGHT, setDaylight } from './daylight';
import type { Season, TimeOfDay } from '../types/world';

/** Muted sea on data layers, so the coastline still reads. */
const DATA_WATER = new THREE.Color('#182b45');

/** Above this many dirty tiles a full repaint is cheaper than many patches. */
const FULL_REPAINT_AT = 1500;

const srgbBytes = (color: THREE.Color): [number, number, number] => {
  const hex = color.getHex();
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
};

const VERTEX = /* glsl */ `
  uniform float uMapSize;
  varying vec2 vTile;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    // Continuous tile coordinates, tile (0,0) spanning [0,1).
    vTile = world.xz / ${TILE_SIZE.toFixed(6)} + uMapSize * 0.5;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uOwner;
  uniform float uMapSize;
  uniform float uTime;
  uniform float uDetail;
  uniform float uFill;
  uniform float uBorder;
  uniform vec3 uTintK;
  uniform vec3 uTintO;
  uniform vec3 uDay;
  varying vec2 vTile;

  vec4 ownerAt(vec2 tile) {
    vec2 cell = clamp(floor(tile), vec2(0.0), vec2(uMapSize - 1.0));
    return texture2D(uOwner, (cell + 0.5) / uMapSize);
  }

  void main() {
    vec4 texel = texture2D(uMap, vTile / uMapSize);
    vec3 col = texel.rgb;
    float surface = texel.a;
    vec2 pix = floor(vTile * ${PX.toFixed(1)});

    if (surface > 0.94 && surface < 0.98) {
      // Fire. Each flame pixel flickers on its own beat, between ember yellow
      // and a dark red, which is what makes a burning wood read as burning
      // rather than as an orange patch.
      float flick = fract(sin(dot(pix, vec2(12.9898, 78.233))) * 43758.5453);
      float beat = 0.5 + 0.5 * sin(uTime * (7.0 + flick * 6.0) + flick * 40.0);
      col = mix(col * vec3(0.55, 0.25, 0.12), col * 1.25 + vec3(0.12, 0.08, 0.0), beat);
    } else if (surface < 0.93) {
      // The sea moves. Two crossed waves, sampled per map pixel, cut to a
      // threshold so the highlights are pixels that wink on and off rather
      // than an airbrushed shimmer. Strongest in the shallows, absent in the
      // deep — the same falloff their art has.
      float swell = sin(uTime * 1.1 + pix.x * 0.61 + pix.y * 0.37)
                  + sin(uTime * 0.73 - pix.x * 0.29 + pix.y * 0.83);
      float shallow = smoothstep(0.25, 0.72, surface);
      col += vec3(0.05, 0.07, 0.08) * step(1.45, swell) * shallow * uDetail;
      if (surface > 0.86) {
        // Foam breathes in and out along the coast.
        float breathe = 0.5 + 0.5 * sin(uTime * 1.8 + pix.x * 0.9 + pix.y * 1.3);
        col = mix(col, col * 0.86, breathe * 0.5 * uDetail);
      }
    }

    // Territory: a wash over owned ground and a one-pixel line where the owner
    // changes, drawn inside each realm so two neighbours show both colours.
    vec2 centre = (pix + 0.5) / ${PX.toFixed(1)};
    vec4 own = ownerAt(centre);
    if (own.a > 0.5) {
      float step1 = 1.0 / ${PX.toFixed(1)};
      bool edge = false;
      vec4 o;
      o = ownerAt(centre + vec2(step1, 0.0)); edge = edge || any(notEqual(o, own));
      o = ownerAt(centre - vec2(step1, 0.0)); edge = edge || any(notEqual(o, own));
      o = ownerAt(centre + vec2(0.0, step1)); edge = edge || any(notEqual(o, own));
      o = ownerAt(centre - vec2(0.0, step1)); edge = edge || any(notEqual(o, own));
      if (edge) col = mix(col, mix(own.rgb, vec3(1.0), 0.3), uBorder);
      else col = mix(col, own.rgb, uFill);
    }

    // Dawn and dusk lean the world warm. Applied at full strength to blue
    // water it lerps navy toward orange and the sea turns lavender, so water
    // takes half of it.
    // Fire is its own light: it does not darken at night.
    // Water takes the light multiplicatively — what white becomes under it —
    // so dusk dims and warms the sea instead of adding orange to navy, which
    // came out a grey lilac.
    if (surface < 0.93) col *= uDay;
    else if (surface >= 0.98) col = col * uTintK + uTintO;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export class TerrainRenderer {
  readonly group = new THREE.Group();
  readonly mapSize: number;

  private tiles: Tile[][];
  /** Invisible: kept so picking still returns an instance id per tile. */
  private terrain: THREE.InstancedMesh;
  private plane: THREE.Mesh;
  private apron: THREE.Mesh;
  private painter: MapPainter;
  private mapTexture: THREE.DataTexture;
  /**
   * The same pixels, wrapped as a texture that is never drawn. It is only
   * ever the *source* of a partial upload: three copies a sub-rectangle of
   * its buffer straight into the real texture, so editing one tile of a
   * 3072-pixel map uploads a few thousand bytes rather than 37 megabytes.
   */
  private uploadSource: THREE.DataTexture;
  private renderer: THREE.WebGLRenderer | null = null;
  private uploadRegion = new THREE.Box2();
  private uploadAt = new THREE.Vector2();
  private ownerData: Uint8Array;
  private ownerTexture: THREE.DataTexture;
  private matrix = new THREE.Matrix4();
  private scratchPosition = new THREE.Vector3();
  private uniforms: Record<string, THREE.IUniform>;
  /** Tiles whose pixels are stale. */
  private dirty = new Set<number>();
  private depthDirty = true;
  /** Which question the map is currently answering. */
  private layer: MapLayer = 'natural';
  private season: Season;
  private timeOfDay: TimeOfDay;

  constructor(tiles: Tile[][], timeOfDay: TimeOfDay, season: Season) {
    this.tiles = tiles;
    this.mapSize = tiles.length;
    this.season = season;
    this.timeOfDay = timeOfDay;
    const count = this.mapSize * this.mapSize;
    const worldUnits = this.mapSize * TILE_SIZE;

    this.painter = new MapPainter(this.mapSize);
    this.painter.setWater(this.waterPalette(season));
    this.painter.setWinter(season === 'winter');
    this.mapTexture = new THREE.DataTexture(this.painter.data, this.painter.width, this.painter.width);
    this.mapTexture.colorSpace = THREE.SRGBColorSpace;
    // Crisp pixels up close, averaged when a pixel is smaller than a screen
    // pixel — otherwise the zoomed-out map shimmers with aliasing.
    this.mapTexture.magFilter = THREE.NearestFilter;
    this.mapTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.mapTexture.generateMipmaps = true;
    this.mapTexture.needsUpdate = true;
    this.uploadSource = new THREE.DataTexture(this.painter.data, this.painter.width, this.painter.width);

    this.ownerData = new Uint8Array(count * 4);
    this.ownerTexture = new THREE.DataTexture(this.ownerData, this.mapSize, this.mapSize);
    this.ownerTexture.colorSpace = THREE.SRGBColorSpace;
    this.ownerTexture.magFilter = THREE.NearestFilter;
    this.ownerTexture.minFilter = THREE.NearestFilter;
    this.ownerTexture.needsUpdate = true;

    this.uniforms = {
      uMap: { value: this.mapTexture },
      uOwner: { value: this.ownerTexture },
      uMapSize: { value: this.mapSize },
      uTime: { value: 0 },
      uDetail: { value: 1 },
      uFill: { value: 0.24 },
      uBorder: { value: 0.85 },
      uTintK: { value: DAYLIGHT.k },
      uTintO: { value: DAYLIGHT.o },
      uDay: { value: DAYLIGHT.color },
    };

    // --- the picture ---
    const planeGeometry = new THREE.PlaneGeometry(worldUnits, worldUnits);
    planeGeometry.rotateX(-Math.PI / 2);
    this.plane = new THREE.Mesh(planeGeometry, new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    }));
    // Under every creature and building, all of which stand at a tile's
    // scaled height (never below MIN_TILE_HEIGHT).
    this.plane.position.y = 0.04;
    this.plane.name = 'terrain-map';
    this.group.add(this.plane);

    // --- the sea beyond the edge of the world ---
    const apronGeometry = new THREE.PlaneGeometry(worldUnits * 8, worldUnits * 8);
    apronGeometry.rotateX(-Math.PI / 2);
    this.apron = new THREE.Mesh(apronGeometry, new THREE.MeshBasicMaterial({ color: 0x1b4a72 }));
    this.apron.position.y = 0.02;
    this.apron.name = 'terrain-apron';
    this.group.add(this.apron);

    // --- picking ---
    const boxGeometry = new THREE.BoxGeometry(TILE_SIZE, 1, TILE_SIZE);
    boxGeometry.translate(0, 0.5, 0);
    this.terrain = new THREE.InstancedMesh(boxGeometry, new THREE.MeshBasicMaterial(), count);
    this.terrain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Never drawn — the raycaster tests it regardless of visibility.
    this.terrain.visible = false;
    this.terrain.name = 'terrain';
    this.group.add(this.terrain);

    this.syncAll(timeOfDay, season);
    this.applyTint(timeOfDay);
  }

  // -- coordinate helpers ------------------------------------------------

  instanceIdFor(x: number, y: number): number {
    return x * this.mapSize + y;
  }

  tileCoordsFromInstanceId(instanceId: number): { x: number; y: number } {
    return {
      x: Math.floor(instanceId / this.mapSize),
      y: instanceId % this.mapSize,
    };
  }

  /** Centre of the tile's top face in world space. */
  worldPosition(tile: Tile, target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(
      (tile.x - this.mapSize / 2 + 0.5) * TILE_SIZE,
      tile.scaledHeight,
      (tile.y - this.mapSize / 2 + 0.5) * TILE_SIZE,
    );
  }

  /**
   * Tell the shader how large a tile currently is on screen, in pixels.
   *
   * The water's winking pixels switch off when a map pixel is smaller than a
   * screen pixel, and territory fades from a fill to an outline as the camera
   * comes down: zoomed out a kingdom is an *area*, zoomed in the wash is a
   * colour cast over the very ground you came down to look at.
   */
  setTilePixels(pixels: number): void {
    const detail = Math.max(0, Math.min(1, (pixels - 6) / 10));
    this.uniforms.uDetail.value = detail;
    const close = Math.max(0, Math.min(1, (pixels - 9) / 13));
    this.uniforms.uFill.value = 0.3 - close * 0.22;
    this.uniforms.uBorder.value = 0.8 + close * 0.18;
  }

  /**
   * Advance the water and flush any repainting. Called once per frame by the
   * engine, whether or not the game is paused: a frozen sea is the most
   * obvious tell that a place is a diagram.
   */
  advanceWater(delta: number): void {
    this.uniforms.uTime.value = (this.uniforms.uTime.value + delta) % 10000;
    this.flush();
  }

  /** Hand over the renderer, so edits can upload only what they touched. */
  setRenderer(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
  }

  /** Repaint whatever changed since the last frame, then upload once. */
  flush(): void {
    if (this.depthDirty) {
      this.depthDirty = false;
      const changed = this.painter.recomputeDepth();
      if (changed.length > FULL_REPAINT_AT) {
        this.markAllDirty();
      } else {
        for (const index of changed) this.dirty.add(index);
      }
    }
    if (this.dirty.size === 0) return;
    const n = this.mapSize;
    let full = this.dirty.size > FULL_REPAINT_AT;
    let minX = n;
    let minY = n;
    let maxX = -1;
    let maxY = -1;
    if (full) {
      this.painter.paintAll();
    } else {
      for (const index of this.dirty) {
        const x = index % n;
        const y = (index - x) / n;
        this.painter.paintRegion(x - 1, y - 1, x + 1, y + 1);
        minX = Math.min(minX, x - 1);
        minY = Math.min(minY, y - 1);
        maxX = Math.max(maxX, x + 1);
        maxY = Math.max(maxY, y + 1);
      }
    }
    this.dirty.clear();

    // A partial upload when the change is a patch and the texture is already
    // on the GPU; otherwise the whole thing, which is also the first upload.
    const renderer = this.renderer;
    const patchTiles = (maxX - minX + 1) * (maxY - minY + 1);
    if (!full && renderer && renderer.properties.has(this.mapTexture) && patchTiles < (n * n) / 3) {
      const x0 = Math.max(0, minX) * PX;
      const y0 = Math.max(0, minY) * PX;
      const x1 = (Math.min(n - 1, maxX) + 1) * PX;
      const y1 = (Math.min(n - 1, maxY) + 1) * PX;
      this.uploadRegion.min.set(x0, y0);
      this.uploadRegion.max.set(x1, y1);
      this.uploadAt.set(x0, y0);
      renderer.copyTextureToTexture(this.uploadSource, this.mapTexture, this.uploadRegion, this.uploadAt);
    } else {
      full = true;
    }
    if (full) this.mapTexture.needsUpdate = true;
  }

  private markAllDirty(): void {
    for (let i = 0; i < this.mapSize * this.mapSize; i++) this.dirty.add(i);
  }

  /** Object the raycaster should test to pick tiles. */
  get pickTarget(): THREE.Object3D {
    return this.terrain;
  }

  // -- per-tile updates --------------------------------------------------

  /** Push a tile's height, colour, decoration and ownership to the GPU. */
  syncTile(tile: Tile, timeOfDay: TimeOfDay, season: Season): void {
    const id = tile.instanceId ?? this.instanceIdFor(tile.x, tile.y);
    tile.instanceId = id;
    tile.scaledHeight = computeScaledHeight(tile.height, tile.type);

    const position = this.worldPosition(tile, this.scratchPosition);
    this.matrix.makeScale(1, tile.scaledHeight, 1);
    this.matrix.setPosition(position.x, 0, position.z);
    this.terrain.setMatrixAt(id, this.matrix);
    this.terrain.instanceMatrix.needsUpdate = true;

    if (timeOfDay !== this.timeOfDay) this.applyTint(timeOfDay);
    this.applyColor(tile, season);
  }

  /**
   * Work out a tile's colour and hand it to the painter.
   *
   * Always painted in daylight. Time of day is a tint the shader applies to
   * the finished picture, so dawn and dusk cost a uniform rather than a
   * repaint of a million pixels.
   */
  private applyColor(tile: Tile, season: Season): void {
    const color = getBiomeColor(tile.type, 'day', season, tile.shade ?? tile.variant, tile.height);

    if (isDataLayer(this.layer)) {
      if (this.layer !== 'height' && isWaterBiome(tile.type)) {
        color.copy(DATA_WATER);
      } else {
        sampleRamp(this.layer, this.layerValue(tile), color);
      }
    } else if (drainsTerrain(this.layer)) {
      // Drain the world so the overlay is the only saturated thing on screen.
      const grey = (color.r + color.g + color.b) / 3;
      color.setRGB(grey * 0.82 + 0.05, grey * 0.84 + 0.05, grey * 0.9 + 0.06);
    }

    tile.color = color;
    if (this.painter.setTile(tile, srgbBytes(color))) this.depthDirty = true;
    this.dirty.add(tile.y * this.mapSize + tile.x);
  }

  private layerValue(tile: Tile): number {
    switch (this.layer) {
      case 'height': return tile.height;
      case 'rainfall': return tile.moisture;
      case 'temperature': return tile.temperature;
      case 'fertility': return tile.fertility;
      default: return 0;
    }
  }

  private waterPalette(season: Season) {
    return {
      shallow: srgbBytes(getBiomeColor('shallow_water', 'day', season)),
      ocean: srgbBytes(getBiomeColor('ocean', 'day', season)),
      deep: srgbBytes(getBiomeColor('deep_ocean', 'day', season)),
    };
  }

  /**
   * Express a time of day as `colour * k + o`, per channel.
   *
   * `getBiomeColor` lerps toward a tint and then scales, which is affine in
   * the input colour — so two reference biomes are enough to recover the
   * exact transform, without this file having to know the tint table.
   */
  private applyTint(timeOfDay: TimeOfDay): void {
    this.timeOfDay = timeOfDay;
    const a = getBiomeColor('snow', 'day', 'summer');
    const b = getBiomeColor('deep_ocean', 'day', 'summer');
    const a2 = getBiomeColor('snow', timeOfDay, 'summer');
    const b2 = getBiomeColor('deep_ocean', timeOfDay, 'summer');
    const solve = (x: number, y: number, x2: number, y2: number) => {
      const k = Math.abs(x - y) > 1e-4 ? (x2 - y2) / (x - y) : 1;
      return [k, x2 - x * k];
    };
    const [kr, or] = solve(a.r, b.r, a2.r, b2.r);
    const [kg, og] = solve(a.g, b.g, a2.g, b2.g);
    const [kb, ob] = solve(a.b, b.b, a2.b, b2.b);
    setDaylight(new THREE.Vector3(kr, kg, kb), new THREE.Vector3(or, og, ob));
    // The sea beyond the edge darkens with everything else.
    // Multiplied by the light, like the sea on the map, so it never goes lilac.
    const deep = getBiomeColor('deep_ocean', 'day', this.season);
    deep.multiply(DAYLIGHT.color).multiplyScalar(0.82);
    (this.apron.material as THREE.MeshBasicMaterial).color.copy(deep);
  }

  /**
   * Switch layers and repaint. Returns false when nothing changed, so callers
   * can skip a full-map recolour they do not need.
   */
  setMapLayer(layer: MapLayer, timeOfDay: TimeOfDay, season: Season): boolean {
    if (layer === this.layer) return false;
    this.layer = layer;
    this.painter.setStyle(!isDataLayer(layer));
    this.recolorAll(season);
    this.applyTint(timeOfDay);
    return true;
  }

  /** Recolour a single tile (fire, corruption). */
  refreshTileColor(tile: Tile, _timeOfDay: TimeOfDay, season: Season): void {
    this.applyColor(tile, season);
  }

  /** Show or hide the kingdom tint on a tile. */
  syncOwnership(tile: Tile, kingdomColor?: THREE.Color | null): void {
    const offset = (tile.y * this.mapSize + tile.x) * 4;
    if (!tile.ownerId || !kingdomColor) {
      this.ownerData[offset + 3] = 0;
      this.ownerData[offset] = 0;
      this.ownerData[offset + 1] = 0;
      this.ownerData[offset + 2] = 0;
    } else {
      const [r, g, b] = srgbBytes(kingdomColor);
      this.ownerData[offset] = r;
      this.ownerData[offset + 1] = g;
      this.ownerData[offset + 2] = b;
      this.ownerData[offset + 3] = 255;
    }
    this.ownerTexture.needsUpdate = true;
  }

  /** A building now stands here, so the trees on it go. */
  clearDetail(tile: Tile): void {
    this.applyColor(tile, this.season);
  }

  // -- bulk updates ------------------------------------------------------

  syncAll(timeOfDay: TimeOfDay, season: Season): void {
    for (let x = 0; x < this.mapSize; x++) {
      for (let y = 0; y < this.mapSize; y++) {
        this.syncTile(this.tiles[x][y], timeOfDay, season);
      }
    }
  }

  private recolorAll(season: Season): void {
    this.season = season;
    this.painter.setWater(this.waterPalette(season));
    this.painter.setWinter(season === 'winter');
    for (let x = 0; x < this.mapSize; x++) {
      for (let y = 0; y < this.mapSize; y++) this.applyColor(this.tiles[x][y], season);
    }
  }

  /**
   * Re-tint after a time-of-day or season change. Only a change of season
   * repaints — time of day is a uniform.
   */
  refreshColors(timeOfDay: TimeOfDay, season: Season): void {
    if (season !== this.season) this.recolorAll(season);
    this.applyTint(timeOfDay);
  }

  /** Kept for the engine's call; the map has no sprites to scale any more. */
  setViewportScale(_scale: number, _orthographic = false): void {}

  dispose(): void {
    this.group.removeFromParent();
    this.terrain.geometry.dispose();
    (this.terrain.material as THREE.Material).dispose();
    this.terrain.dispose();
    for (const mesh of [this.plane, this.apron]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.mapTexture.dispose();
    this.ownerTexture.dispose();
  }
}
