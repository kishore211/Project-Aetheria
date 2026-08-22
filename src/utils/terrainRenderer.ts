// Instanced terrain renderer.
//
// The whole world is drawn with:
//   1 InstancedMesh  — every tile as a low box, per-instance colour + height
//   1 InstancedMesh  — kingdom territory tint, one flat quad per claimed tile
//   1 SpriteCloud    — trees, rocks, reeds and other decoration
//
// That is three draw calls for a 128x128 map (16,384 tiles), replacing the
// 16,384 individual meshes the first prototype used. Every mutation
// (terraform, fire, curse, claim) touches a single instance.
import * as THREE from 'three';
import {
  TILE_SIZE,
  computeScaledHeight,
  isWaterBiome,
  type Tile,
} from '../types/world';
import { getBiomeColor } from './worldGenerator';
import { drainsTerrain, isDataLayer, isIdentityLayer, sampleRamp, type MapLayer } from './mapLayers';
import { getDetailAtlas } from './pixelAtlas';
import { SpriteCloud } from './spriteCloud';
import type { Season, TimeOfDay } from '../types/world';

const FIRE_COLOR = new THREE.Color('#ff6a1f');
/** Muted sea on data layers, so the coastline still reads. */
const DATA_WATER = new THREE.Color('#182b45');
const WHITE = new THREE.Color(0xffffff);
const OVERLAY_LIFT = 0.014;
const DETAIL_LIFT = 0.02;

/**
 * How much each kind of decoration leans in the wind.
 *
 * Rock and crystal are deliberately zero: a swaying boulder is worse than a
 * still one, and the contrast is what sells the movement on everything else.
 * Reeds get the most because they are the thinnest thing on the map.
 */
const SWAY_BY_SPRITE: Record<string, number> = {
  reed: 1,
  tree: 0.7,
  palm: 0.85,
  pine: 0.4,
  cactus: 0.12,
  deadwood: 0.3,
  rock: 0,
  crystal: 0,
};

/** Deterministic decoration for a tile, or null when the tile stays bare. */
const pickDetail = (tile: Tile): { sprite: string; size: number } | null => {
  const variant = tile.variant ?? 0.5;
  const structure = tile.structure?.type;

  if (structure) {
    // Thinned out on purpose: a solid carpet of sprites hides the biome colour,
    // which is what actually tells the player what they are looking at.
    if (structure === 'sapling' || structure === 'young_tree') {
      return variant < 0.55 ? { sprite: tile.temperature < 0.32 ? 'pine' : 'tree', size: 0.26 } : null;
    }
    if (structure === 'mature_tree' || structure === 'ancient_tree') {
      if (variant > 0.62) return null;
      const cold = tile.temperature < 0.32;
      const size = structure === 'ancient_tree' ? 0.46 : 0.38;
      if (tile.type === 'enchanted_forest') return { sprite: 'crystal', size };
      if (tile.type === 'rainforest' && variant > 0.4) return { sprite: 'palm', size };
      return { sprite: cold ? 'pine' : 'tree', size };
    }
    if (structure === 'rock_outcrop' || structure === 'boulder') {
      return variant < 0.6 ? { sprite: 'rock', size: structure === 'boulder' ? 0.4 : 0.3 } : null;
    }
    if (structure === 'bush') {
      // Only wetlands get visible undergrowth; open grassland stays open.
      if (tile.type === 'marsh' || tile.type === 'swamp') return { sprite: 'reed', size: 0.24 };
      return variant > 0.82 ? { sprite: 'reed', size: 0.2 } : null;
    }
    if (structure === 'ruins') {
      return { sprite: 'deadwood', size: 0.34 };
    }
  }

  switch (tile.type) {
    case 'desert':
      return variant > 0.9 ? { sprite: 'cactus', size: 0.3 } : null;
    case 'beach':
      return variant > 0.93 ? { sprite: 'palm', size: 0.38 } : null;
    case 'swamp':
    case 'marsh':
      return variant > 0.5 ? { sprite: 'reed', size: 0.28 } : null;
    case 'savanna':
      return variant > 0.88 ? { sprite: 'tree', size: 0.34 } : null;
    case 'badlands':
    case 'mesa':
      return variant > 0.85 ? { sprite: 'deadwood', size: 0.3 } : null;
    case 'corrupted':
      return variant > 0.6 ? { sprite: 'deadwood', size: 0.32 } : null;
    case 'volcanic':
      return variant > 0.7 ? { sprite: 'rock', size: 0.3 } : null;
    case 'snow':
    case 'tundra':
      return variant > 0.9 ? { sprite: 'pine', size: 0.3 } : null;
    default:
      return null;
  }
};

const DETAIL_TINTS: Partial<Record<string, THREE.Color>> = {
  corrupted: new THREE.Color('#8f6fa8'),
  volcanic: new THREE.Color('#6d5a55'),
  snow: new THREE.Color('#cfe0e8'),
  tundra: new THREE.Color('#c3cdbc'),
};

export class TerrainRenderer {
  readonly group = new THREE.Group();
  readonly mapSize: number;

  private tiles: Tile[][];
  private terrain: THREE.InstancedMesh;
  /** Soft wash over every claimed tile. */
  private overlayFill: THREE.InstancedMesh;
  /** Bright outline on tiles at the edge of a claim — the border you watch. */
  private overlayBorder: THREE.InstancedMesh;
  private details: SpriteCloud;
  private matrix = new THREE.Matrix4();
  /** 1 per water instance, 0 per land instance. Drives the wave in the shader. */
  private waterFlags!: THREE.InstancedBufferAttribute;
  /** Shared clock uniform, so every water tile moves together. */
  private waveTime = { value: 0 };
  /** Which question the map is currently answering. */
  private layer: MapLayer = 'natural';
  private scratchColor = new THREE.Color();
  private scratchPosition = new THREE.Vector3();

  constructor(tiles: Tile[][], timeOfDay: TimeOfDay, season: Season) {
    this.tiles = tiles;
    this.mapSize = tiles.length;
    const count = this.mapSize * this.mapSize;

    // --- terrain boxes ---
    const boxGeometry = new THREE.BoxGeometry(TILE_SIZE, 1, TILE_SIZE);
    // Shift the pivot to the bottom face so the instance's Y scale grows upward.
    boxGeometry.translate(0, 0.5, 0);
    const terrainMaterial = this.createTerrainMaterial();
    this.terrain = new THREE.InstancedMesh(boxGeometry, terrainMaterial, count);
    // Per-instance flag: 1 for water, 0 for land. Read by the shader below.
    this.waterFlags = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    boxGeometry.setAttribute('aWater', this.waterFlags);
    this.terrain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.terrain.castShadow = false;
    this.terrain.receiveShadow = false;
    this.terrain.name = 'terrain';
    this.group.add(this.terrain);

    // --- territory overlay: a soft fill plus a strong border ---
    this.overlayFill = this.createOverlayLayer(count, 0.26, 'territory-fill', 1);
    this.overlayBorder = this.createOverlayLayer(count, 0.92, 'territory-border', 2);
    this.group.add(this.overlayFill);
    this.group.add(this.overlayBorder);

    // --- decoration ---
    this.details = new SpriteCloud(getDetailAtlas(), count);
    this.group.add(this.details.points);

    this.syncAll(timeOfDay, season);
  }

  /**
   * One transparent quad per tile. Instances stay scaled to zero until a
   * kingdom claims the tile, so an unclaimed world costs nothing to draw.
   */
  private createOverlayLayer(count: number, opacity: number, name: string, renderOrder: number): THREE.InstancedMesh {
    const quad = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
    quad.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(quad, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.name = name;
    mesh.renderOrder = renderOrder;
    // Allocate the colour buffer up front: three only compiles the
    // instance-colour shader path when the attribute already exists.
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < count; i++) {
      mesh.setMatrixAt(i, hidden);
      mesh.setColorAt(i, white);
    }
    return mesh;
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
   * The terrain material, with a water wave injected into it.
   *
   * On the GPU rather than on the CPU, and that is the whole reason this is
   * worth doing at all. The alternative — rewriting the instance colour of
   * every water tile each frame — means thousands of float writes and a buffer
   * upload per frame, for something the vertex shader can do for free. A 128²
   * world is 16,384 instances and roughly a third of them are sea.
   *
   * Two overlapping sines at different frequencies, because a single sine reads
   * as a mechanical ripple; two that do not divide evenly read as water. The
   * vertical displacement is deliberately tiny — this is a swell, not a storm,
   * and at this tile size anything larger makes the coastline pull apart.
   */
  private createTerrainMaterial(): THREE.Material {
    const material = new THREE.MeshLambertMaterial();

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uWaveTime = this.waveTime;

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aWater;
          uniform float uWaveTime;
          varying float vWater;
          varying float vWave;
        `)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vWater = aWater;
          vWave = 0.0;
          if (aWater > 0.5) {
            // World-space position of this instance, so neighbouring tiles are
            // offset from each other and the swell travels across the sea
            // instead of every tile bobbing in place.
            vec3 tileOrigin = instanceMatrix[3].xyz;
            float phase = tileOrigin.x * 1.7 + tileOrigin.z * 1.1;
            float swell = sin(uWaveTime * 1.15 + phase) * 0.6
                        + sin(uWaveTime * 0.63 - phase * 1.9) * 0.4;
            vWave = swell;
            // Only the top face moves; the sides stay put so the tile does not
            // detach from its neighbours.
            if (position.y > 0.5) {
              transformed.y += swell * 0.035;
            }
          }
        `);

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vWater;
          varying float vWave;
        `)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          if (vWater > 0.5) {
            // A glint on the crests. Sharpened with a power curve so it reads
            // as scattered highlights rather than as the whole sea pulsing.
            //
            // Tuned by eye against two forced phases: the first pass at half
            // these numbers was technically correct and visually almost
            // invisible, which for the one surface covering a third of the map
            // is the same as not having done it.
            float crest = pow(max(vWave, 0.0), 3.0);
            gl_FragColor.rgb += vec3(0.10, 0.13, 0.17) * crest;
            gl_FragColor.rgb *= 0.93 + vWave * 0.07;
          }
        `);
    };

    // Two materials that compile to different programs must not share a cache
    // key, and three.js keys partly on this.
    material.customProgramCacheKey = () => 'aetheria-terrain-water';
    return material;
  }

  /**
   * Advance the water swell and the wind. Called once per frame by the engine,
   * and deliberately not gated on the game being unpaused: a frozen sea and a
   * frozen forest are the two most obvious tells that a place is a diagram.
   */
  advanceWater(delta: number): void {
    this.waveTime.value = (this.waveTime.value + delta) % 10000;
    this.details.advanceWind(delta);
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

    this.applyColor(tile, id, timeOfDay, season);
    this.syncWaterFlag(tile, id);
    this.syncDetail(tile, id);
    this.syncOwnership(tile);
  }

  private applyColor(tile: Tile, id: number, timeOfDay: TimeOfDay, season: Season): void {
    const color = getBiomeColor(tile.type, timeOfDay, season, tile.variant, tile.height);

    if (isDataLayer(this.layer)) {
      // Data layers ignore the biome entirely — that is the point of them —
      // but keep a whisper of the tile's variant so the surface still has
      // grain rather than looking like a flat chart.
      if (this.layer !== 'height' && isWaterBiome(tile.type)) {
        // Sea painted with land data loses the coastline, and a heat map you
        // cannot find the continents on is not much use. Height is the
        // exception: there, depth is exactly what the layer is measuring.
        color.copy(DATA_WATER);
      } else {
        sampleRamp(this.layer, this.layerValue(tile), color);
      }
      color.offsetHSL(0, 0, ((tile.variant ?? 0.5) - 0.5) * 0.03);
    } else if (drainsTerrain(this.layer)) {
      // Drain the world so the overlay is the only saturated thing on screen.
      // Borders you have to hunt for are borders you do not read — and the same
      // is true of a culture boundary.
      const grey = (color.r + color.g + color.b) / 3;
      color.setRGB(
        grey * 0.82 + 0.05,
        grey * 0.84 + 0.05,
        grey * 0.9 + 0.06,
      );
    }

    if (tile.isOnFire) {
      color.lerp(FIRE_COLOR, 0.65);
    }
    tile.color = color;
    this.terrain.setColorAt(id, color);
    if (this.terrain.instanceColor) this.terrain.instanceColor.needsUpdate = true;
  }

  /**
   * Mark this instance as sea or land for the wave shader.
   *
   * Kept in `syncTile` rather than computed in the shader from colour, because
   * terraforming changes a tile's type at runtime and a river carved through a
   * hill has to start moving immediately.
   */
  private syncWaterFlag(tile: Tile, id: number): void {
    const wanted = isWaterBiome(tile.type) ? 1 : 0;
    if (this.waterFlags.array[id] === wanted) return;
    this.waterFlags.setX(id, wanted);
    this.waterFlags.needsUpdate = true;
  }

  /** The 0-1 quantity a data layer paints. */
  private layerValue(tile: Tile): number {
    switch (this.layer) {
      case 'height': return tile.height;
      case 'rainfall': return tile.moisture;
      case 'temperature': return tile.temperature;
      case 'fertility': return tile.fertility;
      default: return 0;
    }
  }

  /**
   * Switch layers and repaint. Returns false when nothing changed, so callers
   * can skip a full-map recolour they do not need.
   */
  setMapLayer(layer: MapLayer, timeOfDay: TimeOfDay, season: Season): boolean {
    if (layer === this.layer) return false;
    const wasClean = isDataLayer(this.layer);
    this.layer = layer;
    this.refreshColors(timeOfDay, season);
    // Decoration only needs rebuilding when crossing between a data layer and
    // a normal one; switching between two data layers leaves it hidden either
    // way, and this pass costs a full sweep of the map.
    if (wasClean !== isDataLayer(layer)) this.refreshDetails();
    return true;
  }

  private refreshDetails(): void {
    for (let x = 0; x < this.mapSize; x++) {
      for (let y = 0; y < this.mapSize; y++) {
        const tile = this.tiles[x][y];
        this.syncDetail(tile, tile.instanceId ?? this.instanceIdFor(x, y));
      }
    }
  }

  /** Recolour a single tile (fire, time of day, corruption). */
  refreshTileColor(tile: Tile, timeOfDay: TimeOfDay, season: Season): void {
    const id = tile.instanceId ?? this.instanceIdFor(tile.x, tile.y);
    this.applyColor(tile, id, timeOfDay, season);
  }

  private syncDetail(tile: Tile, id: number): void {
    // Data layers want a clean surface. Trees and rocks scattered over a
    // topographic reading obscure the very thing the layer was opened to show.
    if (isDataLayer(this.layer)) {
      this.details.clear(id);
      return;
    }
    // Identity layers keep their decoration: unlike a heat map, a culture map
    // is still a picture of a *place*, and stripping the trees makes it much
    // harder to tell where you are.
    if (isIdentityLayer(this.layer)) { /* fall through to the normal rules */ }
    // A building on the tile takes visual priority over natural decoration.
    if (tile.villageId) {
      this.details.clear(id);
      return;
    }
    const detail = pickDetail(tile);
    if (!detail || tile.isOnFire || isWaterBiome(tile.type)) {
      this.details.clear(id);
      return;
    }
    const position = this.worldPosition(tile, this.scratchPosition).clone();
    position.y += DETAIL_LIFT + detail.size * 0.5;
    this.details.set(id, {
      position,
      sprite: detail.sprite,
      size: detail.size,
      tint: DETAIL_TINTS[tile.type],
      sway: SWAY_BY_SPRITE[detail.sprite] ?? 0,
    });
  }

  /** Show or hide the kingdom tint on a tile. */
  syncOwnership(tile: Tile, kingdomColor?: THREE.Color | null): void {
    const id = tile.instanceId ?? this.instanceIdFor(tile.x, tile.y);

    if (!tile.ownerId || !kingdomColor) {
      this.hideOverlay(this.overlayFill, id);
      this.hideOverlay(this.overlayBorder, id);
      return;
    }

    const position = this.worldPosition(tile, this.scratchPosition);
    this.matrix.makeScale(1, 1, 1);
    this.matrix.setPosition(position.x, position.y + OVERLAY_LIFT, position.z);
    this.overlayFill.setMatrixAt(id, this.matrix);
    this.overlayFill.instanceMatrix.needsUpdate = true;
    this.scratchColor.copy(kingdomColor);
    this.overlayFill.setColorAt(id, this.scratchColor);
    if (this.overlayFill.instanceColor) this.overlayFill.instanceColor.needsUpdate = true;

    if (this.isBorderTile(tile)) {
      this.matrix.setPosition(position.x, position.y + OVERLAY_LIFT * 2, position.z);
      this.overlayBorder.setMatrixAt(id, this.matrix);
      this.overlayBorder.instanceMatrix.needsUpdate = true;
      // Lighten the border so it reads as a drawn line, not a shadow
      this.scratchColor.copy(kingdomColor).lerp(WHITE, 0.35);
      this.overlayBorder.setColorAt(id, this.scratchColor);
      if (this.overlayBorder.instanceColor) this.overlayBorder.instanceColor.needsUpdate = true;
    } else {
      this.hideOverlay(this.overlayBorder, id);
    }
  }

  private hideOverlay(layer: THREE.InstancedMesh, id: number): void {
    this.matrix.makeScale(0, 0, 0);
    layer.setMatrixAt(id, this.matrix);
    layer.instanceMatrix.needsUpdate = true;
  }

  private isBorderTile(tile: Tile): boolean {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        if (nx < 0 || nx >= this.mapSize || ny < 0 || ny >= this.mapSize) return true;
        if (this.tiles[nx][ny].ownerId !== tile.ownerId) return true;
      }
    }
    return false;
  }

  /** Hide the decoration on a tile (a building was placed there). */
  clearDetail(tile: Tile): void {
    this.details.clear(tile.instanceId ?? this.instanceIdFor(tile.x, tile.y));
  }

  // -- bulk updates ------------------------------------------------------

  syncAll(timeOfDay: TimeOfDay, season: Season): void {
    for (let x = 0; x < this.mapSize; x++) {
      for (let y = 0; y < this.mapSize; y++) {
        this.syncTile(this.tiles[x][y], timeOfDay, season);
      }
    }
  }

  /** Re-tint every tile after a time-of-day or season change. */
  refreshColors(timeOfDay: TimeOfDay, season: Season): void {
    for (let x = 0; x < this.mapSize; x++) {
      for (let y = 0; y < this.mapSize; y++) {
        const tile = this.tiles[x][y];
        this.applyColor(tile, tile.instanceId ?? this.instanceIdFor(x, y), timeOfDay, season);
      }
    }
  }

  setViewportScale(scale: number): void {
    this.details.setViewportScale(scale);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.terrain.geometry.dispose();
    (this.terrain.material as THREE.Material).dispose();
    this.terrain.dispose();
    for (const layer of [this.overlayFill, this.overlayBorder]) {
      layer.geometry.dispose();
      (layer.material as THREE.Material).dispose();
      layer.dispose();
    }
    this.details.dispose();
  }
}
