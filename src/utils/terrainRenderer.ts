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

/**
 * A stable 0-1 value from a tile coordinate and a salt.
 *
 * The same shape as the shader's `cellHash`, and for the same reason: the map
 * has to look identically scattered every time it is drawn or reloaded, so
 * nothing here may reach for `Math.random`.
 */
const tileHash = (x: number, y: number, salt: number): number => {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453123;
  return n - Math.floor(n);
};

/** Packed earth, for village paths. */
const ROAD_COLOR = new THREE.Color('#9a8260');

/**
 * What the ground is, as the alpha byte of the field texture.
 *
 * Land is 255 and water darkens with depth, which does double duty: it is
 * both the water test the shoreline needs and the amount of pixel grain the
 * surface carries. Measured on their art, shallow water is mottled across 22
 * of its 28 interior pixels, close ocean across 2, and deep ocean is a single
 * flat colour — detail falling away with depth is what stops a big sea
 * reading as static. Anything not listed is land.
 */
const SURFACE_ALPHA: Partial<Record<string, number>> = {
  deep_ocean: 0,
  ocean: 80,
  shallow_water: 160,
  river: 160,
  lake: 160,
};

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
    // Still thinned, but far less than it was.
    //
    // Two in five trees were drawn, which was the right call for a tilted
    // camera where a wood was read from its silhouette. Straight down there is
    // no silhouette: a forest is only as dense as the canopy on it, and at two
    // in five it read as scrubland with a tree problem. The ground under it
    // carries its own grain now, so it does not need the gaps to stay legible.
    if (structure === 'sapling' || structure === 'young_tree') {
      return variant < 0.75 ? { sprite: tile.temperature < 0.32 ? 'pine' : 'tree', size: 0.3 } : null;
    }
    if (structure === 'mature_tree' || structure === 'ancient_tree') {
      if (variant > 0.85) return null;
      const cold = tile.temperature < 0.32;
      const size = structure === 'ancient_tree' ? 0.52 : 0.44;
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
  /**
   * Every tile's colour and surface, as a texture the fragment shader reads.
   *
   * RGB is the tile's painted colour in sRGB; alpha is the surface — land, or
   * one of three depths of water. Both live here rather than in per-instance
   * attributes because a fragment that has bled across a tile boundary has to
   * read the surface of the tile it is *showing*, not the one it belongs to. A shader cannot see a neighbouring instance, which is what left the
   * map a grid of hard squares: with the whole map in a texture, a fragment
   * can read any tile it likes, and the boundary between two of them can be
   * dithered instead of drawn as a straight line. It is also what lets the
   * coastline be found per pixel rather than per tile edge.
   */
  private field!: THREE.DataTexture;
  private fieldData!: Uint8Array;
  /** Shared clock uniform, so every water tile moves together. */
  private waveTime = { value: 0 };
  /**
   * How many screen pixels one tile currently covers. Drives the grain's
   * level of detail — see `setTilePixels`.
   */
  private tilePixels = { value: 32 };
  /**
   * 1 on a map of a place, 0 on a map of a number.
   *
   * `syncDetail` already strips trees and rocks from a data layer, because
   * decoration scattered over a topographic reading obscures the very thing
   * the layer was opened to show. The flower pixels are decoration too, and
   * were still being stamped over the heat maps.
   */
  private decorated = { value: 1 };
  /** Which question the map is currently answering. */
  private layer: MapLayer = 'natural';
  private scratchColor = new THREE.Color();
  private scratchPosition = new THREE.Vector3();

  constructor(tiles: Tile[][], timeOfDay: TimeOfDay, season: Season) {
    this.tiles = tiles;
    this.mapSize = tiles.length;
    const count = this.mapSize * this.mapSize;

    // Built before the first paint: `applyColor` writes into it.
    this.fieldData = new Uint8Array(count * 4);
    this.field = new THREE.DataTexture(this.fieldData, this.mapSize, this.mapSize);
    this.field.magFilter = THREE.NearestFilter;
    this.field.minFilter = THREE.NearestFilter;
    this.field.needsUpdate = true;

    // --- terrain boxes ---
    const boxGeometry = new THREE.BoxGeometry(TILE_SIZE, 1, TILE_SIZE);
    // Shift the pivot to the bottom face so the instance's Y scale grows upward.
    boxGeometry.translate(0, 0.5, 0);
    const terrainMaterial = this.createTerrainMaterial();
    this.terrain = new THREE.InstancedMesh(boxGeometry, terrainMaterial, count);
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
      shader.uniforms.uTilePixels = this.tilePixels;
      shader.uniforms.uDecorated = this.decorated;
      shader.uniforms.uField = { value: this.field };
      shader.uniforms.uMapSize = { value: this.mapSize };

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec2 vWorldXZ;
          varying vec3 vLocalNormal;
        `)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vLocalNormal = normal;
          // Where this fragment lands on the map, which is what lets the
          // fragment shader look tiles up in the field texture.
          vWorldXZ = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xz;
        `);

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec2 vWorldXZ;
          varying vec3 vLocalNormal;
          uniform float uTilePixels;
          uniform float uDecorated;
          uniform float uWaveTime;
          uniform sampler2D uField;
          uniform float uMapSize;

          const float TILE = ${TILE_SIZE.toFixed(6)};
          /** Sub-tile resolution of the pixel art: 8x8, as their tiles are. */
          const float GRID = 8.0;

          /** The off-hue pixels stamped on a decorated ground tile. */
          const vec3 FLOWER_TINT = vec3(0.92, 0.86, 0.42);

          // Stable hash from a 2D cell. One multiply-and-fract; good enough to
          // look like hand-scattered pixels and cheap enough for every fragment.
          float cellHash(vec2 cell) {
            return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453123);
          }

          // The field texture stores sRGB bytes, because eight bits of *linear*
          // colour bands badly in the dark half and a third of this map is deep
          // ocean. Decoded explicitly rather than by asking three for an sRGB
          // internal format, so the result does not depend on which texture
          // format the backend picked.
          vec3 decodeField(vec3 c) {
            return mix(
              c / 12.92,
              pow((c + 0.055) / 1.055, vec3(2.4)),
              step(vec3(0.04045), c)
            );
          }

          /**
           * Read the map at a point, with the tile boundary dithered.
           *
           * This is the answer to "it still looks like squares". Each tile is
           * its own instance, so a shader that only knows its own tile draws
           * four perfectly straight, axis-aligned boundaries — and the eye
           * assembles a plane of those into a grid however pretty the tile
           * interiors are. Pixel-art tilesets solve it by drawing interlocking
           * transitions into the art itself; with every tile's colour in a
           * texture we can do the same thing without any art, by letting a
           * fragment near an edge sometimes read its *neighbour's* tile.
           *
           * The roll is quantised to the 8x8 sub-tile grid and keyed off world
           * position, so the result is a stable interlock of chunky pixels
           * rather than a fizzing per-fragment fringe, and it does not crawl
           * when the camera moves.
           */
          vec4 sampleField(vec2 tf, float bleed, out vec2 cellOut) {
            vec2 cell = floor(tf);
            vec2 within = fract(tf);
            // Which neighbour each axis leans towards.
            vec2 dir = step(0.5, within) * 2.0 - 1.0;
            // Distance to the nearest edge on each axis, in sub-tile pixels.
            vec2 edge = min(within, 1.0 - within) * GRID;
            vec2 pixel = floor(tf * GRID);
            // Two decorrelated draws, so the two axes do not bleed in lockstep.
            vec2 roll = vec2(cellHash(pixel), cellHash(pixel + 37.0));
            // Held to about a pixel and a half. Wider than that and the
            // boundary stops being an interlock and becomes a band of static:
            // every pair of neighbouring tiles differs slightly, so a soft
            // dither speckles the *whole* map rather than just its seams.
            vec2 chance = smoothstep(1.7, 0.0, edge) * bleed;
            cell += dir * step(roll, chance);
            cell = clamp(cell, vec2(0.0), vec2(uMapSize - 1.0));
            cellOut = cell;
            vec4 texel = texture2D(uField, (cell + 0.5) / uMapSize);
            return vec4(decodeField(texel.rgb), texel.a);
          }

          /** Land is 1.0; water darkens with depth. See SURFACE_ALPHA. */
          bool isWet(float surface) { return surface < 0.9; }

          /** How much pixel grain a surface carries. */
          float grainOf(float surface) {
            if (surface > 0.9) return 1.0;
            if (surface > 0.47) return 0.8;
            if (surface > 0.16) return 0.25;
            return 0.0;
          }
        `)
        // The ground colour comes from the field, not from this instance, so
        // that it can be a neighbour's colour. Done before lighting rather
        // than after, so the Lambert term still applies to it.
        .replace('#include <color_fragment>', `#include <color_fragment>
          // Continuous tile coordinates: tile centres land on integers + 0.5.
          vec2 tileCoord = vWorldXZ / TILE + uMapSize * 0.5;
          // Below a handful of screen pixels a tile the dither is smaller than
          // a pixel, and all it can do there is soften a coastline that should
          // stay crisp. It fades in as the tiles grow.
          float detail = smoothstep(12.0, 26.0, uTilePixels);
          float bleed = smoothstep(6.0, 16.0, uTilePixels) * 0.5;
          vec2 groundCell;
          vec4 ground = sampleField(tileCoord, bleed, groundCell);
          if (vLocalNormal.y > 0.5) {
            diffuseColor.rgb = ground.rgb;
          }
        `)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          if (vLocalNormal.y > 0.5) {
            // The pixel grain on the top face.
            //
            // Decoding a real WorldBox grass tile showed an 8x8 sprite whose
            // interior is noise between three greens about 4% apart — so
            // zooming in on their map reveals *pixels*, where zooming in on
            // ours revealed a large smooth square. Same recipe here, generated
            // per fragment instead of from a texture atlas: no atlas to author
            // or manage, and it applies to all 28 biomes automatically.
            //
            // Keyed off the sampled cell rather than this instance, so a
            // fragment that bled across a boundary carries the grain of the
            // tile it is showing and the transition stays seamless.
            vec2 pixel = floor(tileCoord * GRID);
            float tileNoise = cellHash(groundCell * 1.7 + 3.3);
            float pick = cellHash(pixel + vec2(tileNoise * 71.0, tileNoise * 113.0));

            // Three shades, chosen not blended: a smooth gradient reads as
            // lighting, discrete steps read as pixel art. About 3% apart,
            // matching what their art measures at (interior spread a median
            // 6.9%, never past ~12% or the tile stops reading as one
            // material), and distributed 39/39/22 rather than evenly — their
            // most common measured layout is 11/11/6 of 28 interior pixels,
            // and an even third each is the one distribution that reads as
            // noise rather than as a material with a dominant tone.
            float shade = pick < 0.39 ? 0.968 : (pick < 0.78 ? 1.0 : 1.032);
            // Depth flattens detail. Shallow water is mottled across 22 of 28
            // interior pixels; close ocean 2 of 28; deep ocean is a single flat
            // colour. Land keeps its full grain.
            float grain = grainOf(ground.a);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * shade, grain * detail);

            // Roughly one land tile in four carries two to four off-hue pixels
            // — their flower tiles, which are the plain ground tile with a few
            // pixels stamped over it. It is the cheapest charm in the whole
            // palette: a field stops being a colour and becomes a field.
            if (uDecorated > 0.5 && !isWet(ground.a) && detail > 0.5) {
              float tuft = cellHash(pixel * 3.7 + vec2(tileNoise * 211.0, 17.0));
              // Rarer than the first pass, which put a few off-hue pixels on
              // roughly a quarter of all land and left the whole map fizzing.
              // Their flower tiles are an occasional find, not a texture.
              if (tileNoise > 0.88 && tuft > 0.93) {
                gl_FragColor.rgb = mix(gl_FragColor.rgb, FLOWER_TINT, 0.5);
              }
            }

            // The shoreline.
            //
            // Four taps around this fragment, through the same dithered
            // lookup, so the outline follows the interlocked coast exactly
            // instead of tracing the square tile underneath it. The tap
            // distance is held at roughly one screen pixel at every zoom:
            // fixed at an eighth of a tile it would thin to nothing on the
            // world map, and the coastline is the last thing that should stop
            // reading when you zoom out.
            //
            // Their art spends an edge colour on only 12 of 185 tiles, and
            // only on the waterline, the snowline and player-built walls
            // (09-WORLDBOX-VISUAL-RESEARCH.md §3). That restraint is the whole
            // reason their silhouettes read, so this is the waterline alone.
            float tap = max(1.0 / GRID, 1.0 / max(uTilePixels, 1.0));
            vec2 ignored;
            float wetNear = 0.0;
            float dryNear = 0.0;
            for (int i = 0; i < 4; i++) {
              vec2 dir = i == 0 ? vec2(tap, 0.0)
                       : i == 1 ? vec2(-tap, 0.0)
                       : i == 2 ? vec2(0.0, tap)
                                : vec2(0.0, -tap);
              float a = sampleField(tileCoord + dir, bleed, ignored).a;
              wetNear = max(wetNear, isWet(a) ? 1.0 : 0.0);
              dryNear = max(dryNear, isWet(a) ? 0.0 : 1.0);
            }
            if (isWet(ground.a)) {
              // Sea against a shore: the dark rim that makes a coast a coast.
              gl_FragColor.rgb *= mix(1.0, 0.70, dryNear);
            } else {
              // Land against the sea: a much softer lip, so the strong line
              // stays on one side of the boundary and reads as one edge.
              gl_FragColor.rgb *= mix(1.0, 0.90, wetNear);
            }
          } else {
            // Sides read as thickness, not as faces. Darkening them is what
            // stops a field of tiles looking like a field of blocks.
            gl_FragColor.rgb *= 0.72;
          }

          if (isWet(ground.a) && vLocalNormal.y > 0.5) {
            // The swell, evaluated per fragment rather than per instance.
            //
            // One brightness per tile turns the sea into a chequerboard of
            // lighter and darker squares — the same "it looks like boxes"
            // complaint wearing a different coat, and on the one surface that
            // covers a third of the map. And the two waves cross rather than
            // one being a harmonic of the other: phases that stay in step
            // paint the whole ocean with parallel diagonal stripes, which is
            // what the world map showed. Crossed waves interfere, and
            // interference reads as water.
            //
            // Quantised to the sub-tile grid, so the shimmer is made of the
            // same pixels as everything else rather than being the one
            // airbrushed thing on a pixel map.
            // Phased per sub-tile pixel rather than per tile, so a wave is
            // about a tile long. The first pass ran the phase in tile units,
            // which put the wavelength at four tiles: quantising a thirty-pixel
            // gradient to eight-pixel steps changes nothing you can see, and
            // the sea came out covered in soft airbrushed circles.
            vec2 wave = floor(tileCoord * GRID);
            float phaseA = wave.x * 0.70 + wave.y * 0.45;
            float phaseB = wave.y * 0.80 - wave.x * 0.55;
            float swell = sin(uWaveTime * 1.15 + phaseA) * 0.55
                        + sin(uWaveTime * 0.63 + phaseB) * 0.45;
            // Cut, not faded: a threshold gives scattered pixels that wink on
            // and off, which is what a pixel sea does. A smoothstep here gives
            // a gradient, and a gradient on a pixel map reads as a smudge.
            float crest = step(0.66, swell) * detail;
            gl_FragColor.rgb += vec3(0.075, 0.095, 0.115) * crest;
            gl_FragColor.rgb *= 1.0 + swell * 0.015 * detail;
          }
        `);
    };

    // Two materials that compile to different programs must not share a cache
    // key, and three.js keys partly on this.
    material.customProgramCacheKey = () => 'aetheria-terrain-field';
    return material;
  }

  /**
   * Tell the shader how large a tile currently is on screen, in pixels.
   *
   * Everything the grain does has to switch off when a tile is too small to
   * resolve it, or the map fills with aliasing patterns that look like a
   * rendering fault. Pushed once per frame from the engine, which is the only
   * thing that knows the camera and the viewport.
   */
  setTilePixels(pixels: number): void {
    this.tilePixels.value = pixels;
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
    this.syncDetail(tile, id);
    this.syncOwnership(tile);
  }

  private applyColor(tile: Tile, id: number, timeOfDay: TimeOfDay, season: Season): void {
    const color = getBiomeColor(tile.type, timeOfDay, season, tile.shade ?? tile.variant, tile.height);

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

    // A path worn across the tile. Blended over whatever the biome painted
    // rather than replacing it, so a road through a forest still reads as
    // forest and comes back on its own when the village that laid it is gone.
    if (tile.road && !isDataLayer(this.layer)) {
      color.lerp(ROAD_COLOR, 0.5);
    }

    if (tile.isOnFire) {
      color.lerp(FIRE_COLOR, 0.65);
    }
    tile.color = color;
    this.terrain.setColorAt(id, color);
    if (this.terrain.instanceColor) this.terrain.instanceColor.needsUpdate = true;
    this.writeField(tile, color);
  }

  /**
   * Publish a tile's colour and wetness into the field texture.
   *
   * Indexed by map position rather than by instance id: the shader finds a
   * tile by turning a world coordinate into a texel, so the layout has to be
   * a straight translation of the map.
   */
  private writeField(tile: Tile, color: THREE.Color): void {
    const offset = (tile.y * this.mapSize + tile.x) * 4;
    // sRGB bytes, not linear ones — see `decodeField` in the shader.
    const hex = color.getHex();
    this.fieldData[offset] = (hex >> 16) & 255;
    this.fieldData[offset + 1] = (hex >> 8) & 255;
    this.fieldData[offset + 2] = hex & 255;
    this.fieldData[offset + 3] = SURFACE_ALPHA[tile.type] ?? 255;
    // One upload per frame however many tiles changed.
    this.field.needsUpdate = true;
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

  /**
   * Switch layers and repaint. Returns false when nothing changed, so callers
   * can skip a full-map recolour they do not need.
   */
  setMapLayer(layer: MapLayer, timeOfDay: TimeOfDay, season: Season): boolean {
    if (layer === this.layer) return false;
    const wasClean = isDataLayer(this.layer);
    this.layer = layer;
    this.decorated.value = isDataLayer(layer) ? 0 : 1;
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
    // Nudged off the tile centre, and sized a little differently each time.
    //
    // One sprite per tile, centred, is a lattice — and a lattice of trees
    // reads as a plantation. With the tile boundaries themselves now dithered,
    // this was the loudest remaining tell that the map is a grid: the
    // *decoration* was still drawing it.
    const spread = TILE_SIZE * 0.34;
    position.x += (tileHash(tile.x, tile.y, 1) - 0.5) * 2 * spread;
    position.z += (tileHash(tile.x, tile.y, 2) - 0.5) * 2 * spread;
    const size = detail.size * (0.82 + tileHash(tile.x, tile.y, 3) * 0.36);
    position.y += DETAIL_LIFT + size * 0.5;
    this.details.set(id, {
      position,
      sprite: detail.sprite,
      size,
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

  setViewportScale(scale: number, orthographic = false): void {
    this.details.setViewportScale(scale, orthographic);
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
