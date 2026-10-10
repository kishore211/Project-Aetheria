// The map, painted as a picture.
//
// Every earlier attempt at "it looks like squares" worked on the wrong thing.
// The terrain was one box per tile, and however its top face was shaded a box
// has four straight edges — so up close the world was always a grid of flat
// coloured squares with dithering along the seams. WorldBox does not draw
// boxes. It draws *one image of the whole world*, eight pixels to a tile, and
// every one of those pixels is chosen: grass speckle, sand grain, a band of
// foam on the waterline, shaded rock with snow on it, trees whose canopies
// overlap into a wood.
//
// This module is that image. It is pure: tiles in, RGBA bytes out, no three.js
// scene and no GPU, so it can be tested and it can repaint a single tile's
// neighbourhood when a power touches it.
//
// Three ideas do most of the work:
//
// 1. **Fields, not cells.** Land-ness, height and depth are stored per tile
//    and *bilinearly interpolated* per pixel, then thresholded with a little
//    coherent noise. A lone land tile becomes a round islet, a diagonal coast
//    becomes a diagonal, and nothing has a straight edge it did not earn.
// 2. **Hill shading.** The gradient of the interpolated height, lit from the
//    top left and quantised into steps, gives mountains faces and valleys
//    depth from straight above — relief WorldBox gets from its rock tiles.
// 3. **Decoration is painted, not stuck on.** Trees, rocks and reeds are small
//    pixel stamps with a cast shadow, drawn bottom-to-top so nearer canopies
//    overlap farther ones. A forest is a texture of canopy, not a lattice of
//    billboards.
import { isWaterBiome, type BiomeType, type Tile } from '../types/world';

/** Pixels per tile edge. Their tiles are 8x8, and so are ours. */
export const PX = 8;

/** What kind of surface a biome paints as. */
const enum Mat {
  Grass, Forest, Sand, Desert, Rock, Hills, Snow, Ice, Swamp, Volcanic,
  Corrupt, Enchanted, Savanna, Tundra, Strata, Ash, Salt, Bloom, Water,
  Candy, Crystal, Mushroom, Infernal, Waste,
}

const MATERIAL: Record<BiomeType, Mat> = {
  deep_ocean: Mat.Water, ocean: Mat.Water, shallow_water: Mat.Water, river: Mat.Water, lake: Mat.Water,
  beach: Mat.Sand, rocky_shore: Mat.Rock,
  grassland: Mat.Grass, deciduous_forest: Mat.Forest, coniferous_forest: Mat.Forest,
  hills: Mat.Hills, mountains: Mat.Rock, taiga: Mat.Forest, tundra: Mat.Tundra,
  snow: Mat.Snow, ice: Mat.Ice, glacier: Mat.Ice,
  desert: Mat.Desert, savanna: Mat.Savanna, mesa: Mat.Strata, badlands: Mat.Strata,
  swamp: Mat.Swamp, marsh: Mat.Swamp, rainforest: Mat.Forest, tropical_forest: Mat.Forest,
  ashland: Mat.Ash, salt_flat: Mat.Salt, bloom: Mat.Bloom,
  volcanic: Mat.Volcanic, corrupted: Mat.Corrupt, enchanted_forest: Mat.Enchanted,
  sky_island: Mat.Grass,
  candy: Mat.Candy, crystal: Mat.Crystal, mushroom: Mat.Mushroom, infernal: Mat.Infernal, wasteland: Mat.Waste,
};

/**
 * How strongly each surface takes the hill shade. Rock is lit hardest because
 * that is what makes a mountain range read as ranges; grass only gently, or a
 * rolling plain turns into corduroy.
 */
const RELIEF: Record<Mat, number> = {
  [Mat.Grass]: 1.1, [Mat.Forest]: 1.0, [Mat.Sand]: 0.6, [Mat.Desert]: 1.0, [Mat.Rock]: 3.2,
  [Mat.Hills]: 2.2, [Mat.Snow]: 1.6, [Mat.Ice]: 0.8, [Mat.Swamp]: 0.4, [Mat.Volcanic]: 2.4,
  [Mat.Corrupt]: 1.2, [Mat.Enchanted]: 1.0, [Mat.Savanna]: 1.0, [Mat.Tundra]: 1.4,
  [Mat.Strata]: 2.4, [Mat.Ash]: 1.2, [Mat.Salt]: 0.4, [Mat.Bloom]: 1.0, [Mat.Water]: 0,
  [Mat.Candy]: 0.9, [Mat.Crystal]: 1.6, [Mat.Mushroom]: 1.0, [Mat.Infernal]: 2.0, [Mat.Waste]: 1.3,
};

// -- noise ---------------------------------------------------------------

/** Integer hash to 0-1. Deterministic, so the map paints the same every time. */
const hash = (x: number, y: number, salt: number): number => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/** Smooth value noise, 0-1, with features about one unit across. */
const noise = (x: number, y: number, salt: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, salt);
  const b = hash(xi + 1, yi, salt);
  const c = hash(xi, yi + 1, salt);
  const d = hash(xi + 1, yi + 1, salt);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

/** The invented heightfield that gives rock its faces. 0-1. */
const crag = (X: number, Y: number): number =>
  noise(X / 4.5, Y / 4.5, 41) * 0.65 + noise(X / 2, Y / 2, 42) * 0.35;

// -- stamps --------------------------------------------------------------
//
// Seen slightly from the south, as WorldBox draws them: a trunk peeping out
// under the canopy, the canopy lit from the top left, and a shadow thrown down
// and to the right onto the ground. Letters are palette slots; `.` is empty.
//   L light   M mid   D dark   T trunk   W white   R red   Y yellow

const STAMPS = {
  tree: [
    '.LLM.',
    'LLMMD',
    'LMMMD',
    'MMMDD',
    '.MDD.',
    '..T..',
  ],
  bigtree: [
    '..LLM..',
    '.LLLMM.',
    'LLMMMMD',
    'LMMMMDD',
    'MMMMDDD',
    '.MMDDD.',
    '..DTD..',
    '...T...',
  ],
  pine: [
    '..L..',
    '.LMD.',
    '.LMD.',
    'LMMDD',
    'LMMDD',
    'MMDDD',
    '..T..',
  ],
  sapling: [
    '.L.',
    'LMD',
    '.T.',
  ],
  palm: [
    'L.M.D',
    '.LMD.',
    'LMMMD',
    '..T..',
    '..T..',
  ],
  acacia: [
    'LLMMMD',
    '.MMDD.',
    '..T...',
    '..T...',
  ],
  cactus: [
    '.M.',
    'LMD',
    'LMD',
    'LMD',
  ],
  bush: [
    'LM',
    'MD',
  ],
  rock: [
    '.LM.',
    'LMMD',
    'MMDD',
  ],
  boulder: [
    '.LLM.',
    'LLMMD',
    'LMMDD',
    '.MDD.',
  ],
  reed: [
    'L.M',
    'M.D',
    'MMD',
  ],
  deadwood: [
    'T.T',
    '.T.',
    '.T.',
  ],
  crystal: [
    '.W.',
    'LMD',
    'LMD',
    '.D.',
  ],
  toadstool: [
    '.RRR.',
    'RWRRR',
    'RRRWR',
    '..T..',
    '..T..',
  ],
  candycane: [
    'WR.',
    'R.W',
    'W..',
    'R..',
    'W..',
  ],
  spire: [
    '.D.',
    'LMD',
    'LMD',
    'LMD',
  ],
  rubble: [
    'L.M',
    'MMD',
  ],
} as const;

type StampKind = keyof typeof STAMPS;

interface Stamp {
  kind: StampKind;
  /** Centre, in pixels, within the tile. */
  cx: number;
  cy: number;
}

/** Fixed colours for stamps whose material is not the ground's. */
const ROCK_RGB: [number, number, number] = [138, 132, 124];
const TRUNK_RGB: [number, number, number] = [92, 64, 40];
const CACTUS_RGB: [number, number, number] = [86, 140, 64];
const CRYSTAL_RGB: [number, number, number] = [112, 214, 220];
const DEADWOOD_RGB: [number, number, number] = [96, 78, 62];
const FLOWERS: [number, number, number][] = [
  [244, 236, 208], [240, 206, 78], [214, 82, 72], [176, 120, 214],
];
const SNOW_RGB: [number, number, number] = [222, 230, 238];
const FOAM_RGB: [number, number, number] = [214, 238, 240];
const ROAD_RGB: [number, number, number] = [158, 132, 96];
const PUDDLE_RGB: [number, number, number] = [58, 92, 84];
const LAVA_RGB: [number, number, number] = [255, 112, 36];
const EMBER_RGB: [number, number, number] = [255, 206, 64];
const FIRE_RGB: [number, number, number] = [255, 106, 31];

/** The water's own colours. The painter cannot know the season, so it is told. */
export interface WaterPalette {
  shallow: [number, number, number];
  ocean: [number, number, number];
  deep: [number, number, number];
}

/**
 * Alpha byte per surface. The shader animates water by it: land is opaque,
 * foam winks, shallows sparkle, the deep stays still.
 */
export const SURFACE = { land: 255, fire: 245, foam: 230, shallow: 180, mid: 130, ocean: 80, deep: 20 } as const;

const clampByte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

export class MapPainter {
  readonly size: number;
  readonly width: number;
  /** RGBA, row-major, row = tile y * PX + pixel y. */
  readonly data: Uint8Array;

  private land: Float32Array;
  private height: Float32Array;
  private depth: Float32Array;
  private rgb: Float32Array;
  private mat: Uint8Array;
  private inland: Uint8Array;
  private road: Uint8Array;
  private fire: Uint8Array;
  private stamps: (Stamp[] | null)[];
  private decorated = true;
  private plain = false;
  private water: WaterPalette = {
    shallow: [58, 134, 171], ocean: [36, 97, 137], deep: [27, 74, 114],
  };

  constructor(size: number) {
    this.size = size;
    this.width = size * PX;
    this.data = new Uint8Array(this.width * this.width * 4);
    const n = size * size;
    this.land = new Float32Array(n);
    this.height = new Float32Array(n);
    this.depth = new Float32Array(n);
    this.rgb = new Float32Array(n * 3);
    this.mat = new Uint8Array(n);
    this.inland = new Uint8Array(n);
    this.road = new Uint8Array(n);
    this.fire = new Uint8Array(n);
    this.stamps = new Array(n).fill(null);
  }

  /**
   * Whether decoration and texture are drawn.
   *
   * Off on a data layer: trees scattered over a heat map hide the reading the
   * layer was opened for, and so does grass speckle.
   */
  setStyle(decorated: boolean): void {
    this.decorated = decorated;
    this.plain = !decorated;
  }

  setWater(palette: WaterPalette): void {
    this.water = palette;
  }

  /**
   * Winter dusts every canopy and rock with snow. The ground already turns
   * with the season; without this the woods stayed summer-green on a white
   * field, which read as a painting error rather than as winter.
   */
  setWinter(on: boolean): void {
    this.winter = on;
  }
  private winter = false;

  /**
   * Record what a tile is. Returns true when its land-ness changed, which is
   * the caller's cue to recompute depth (`recomputeDepth`).
   */
  setTile(tile: Tile, srgb: [number, number, number]): boolean {
    const i = tile.y * this.size + tile.x;
    const wet = isWaterBiome(tile.type);
    const wasLand = this.land[i] > 0.5;
    // Rivers and lakes count as *more* than water in the land field. A river
    // is one tile wide and often runs diagonally, and at plain 0 two
    // diagonal river tiles meet at a corner the field calls half land — so
    // the noise broke every river into a string of beads. Pulling inland
    // water below zero keeps it joined up.
    const inland = tile.type === 'river' || tile.type === 'lake';
    this.land[i] = wet ? (inland ? -0.45 : 0) : 1;
    this.height[i] = tile.height;
    this.rgb[i * 3] = srgb[0];
    this.rgb[i * 3 + 1] = srgb[1];
    this.rgb[i * 3 + 2] = srgb[2];
    this.mat[i] = MATERIAL[tile.type] ?? Mat.Grass;
    this.inland[i] = inland ? 1 : 0;
    this.road[i] = tile.road ? 1 : 0;
    this.fire[i] = tile.isOnFire ? 1 : 0;
    this.stamps[i] = wet || tile.villageId || tile.isOnFire ? null : stampsFor(tile);
    return wasLand !== (this.land[i] > 0.5);
  }

  /**
   * Distance from every water tile to the nearest land, in tiles.
   *
   * A breadth-first flood from the coast. Cheap — one pass over the map — and
   * it is what gives the sea WorldBox's look: concentric bands from turquoise
   * shallows out to navy deep, following the coastline rather than the
   * generator's height noise.
   *
   * Returns the tiles whose depth changed, so only they need repainting.
   */
  recomputeDepth(): number[] {
    const n = this.size;
    const next = new Float32Array(n * n).fill(99);
    const queue = new Int32Array(n * n);
    let head = 0;
    let tail = 0;
    for (let i = 0; i < n * n; i++) {
      if (this.land[i] > 0.5) {
        next[i] = 0;
        queue[tail++] = i;
      }
    }
    while (head < tail) {
      const i = queue[head++];
      const x = i % n;
      const y = (i - x) / n;
      const d = next[i] + 1;
      if (d > 9) continue;
      if (x > 0 && next[i - 1] > d) { next[i - 1] = d; queue[tail++] = i - 1; }
      if (x < n - 1 && next[i + 1] > d) { next[i + 1] = d; queue[tail++] = i + 1; }
      if (y > 0 && next[i - n] > d) { next[i - n] = d; queue[tail++] = i - n; }
      if (y < n - 1 && next[i + n] > d) { next[i + n] = d; queue[tail++] = i + n; }
    }
    const changed: number[] = [];
    for (let i = 0; i < n * n; i++) {
      const d = Math.min(next[i], 10);
      if (d !== this.depth[i]) {
        this.depth[i] = d;
        changed.push(i);
      }
    }
    return changed;
  }

  paintAll(): void {
    this.paintRegion(0, 0, this.size - 1, this.size - 1);
  }

  /** Repaint every pixel of the tiles in an inclusive rectangle. */
  paintRegion(tx0: number, ty0: number, tx1: number, ty1: number): void {
    const n = this.size;
    tx0 = Math.max(0, tx0); ty0 = Math.max(0, ty0);
    tx1 = Math.min(n - 1, tx1); ty1 = Math.min(n - 1, ty1);
    const x0 = tx0 * PX;
    const y0 = ty0 * PX;
    const x1 = (tx1 + 1) * PX;
    const y1 = (ty1 + 1) * PX;
    for (let Y = y0; Y < y1; Y++) {
      for (let X = x0; X < x1; X++) this.paintGround(X, Y);
    }
    if (!this.decorated) return;
    // Stamps from one tile beyond the region too, clipped, because a canopy
    // overhangs its own tile. Row by row from the top so that nearer things
    // (further down the screen) are drawn over farther ones.
    for (let ty = ty0 - 1; ty <= ty1 + 1; ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = tx0 - 1; tx <= tx1 + 1; tx++) {
        if (tx < 0 || tx >= n) continue;
        const list = this.stamps[ty * n + tx];
        if (!list) continue;
        for (const stamp of list) this.drawStamp(tx, ty, stamp, x0, y0, x1, y1);
      }
    }
  }

  // -- ground ------------------------------------------------------------

  private paintGround(X: number, Y: number): void {
    const n = this.size;
    // Pixel centre in tile units, with tile centres on integers.
    const fx = (X + 0.5) / PX - 0.5;
    const fy = (Y + 0.5) / PX - 0.5;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    // Smoothstepped, not linear. Plain bilinear weights draw the contour
    // round a lone tile as a diamond — every one-tile pond came out as a
    // rhombus. Easing the weights rounds it into a blob.
    const lx = fx - ix;
    const ly = fy - iy;
    const ax = lx * lx * (3 - 2 * lx);
    const ay = ly * ly * (3 - 2 * ly);
    const x0 = ix < 0 ? 0 : ix;
    const y0 = iy < 0 ? 0 : iy;
    const x1 = ix + 1 > n - 1 ? n - 1 : ix + 1;
    const y1 = iy + 1 > n - 1 ? n - 1 : iy + 1;
    const i00 = y0 * n + x0;
    const i10 = y0 * n + x1;
    const i01 = y1 * n + x0;
    const i11 = y1 * n + x1;
    const w00 = (1 - ax) * (1 - ay);
    const w10 = ax * (1 - ay);
    const w01 = (1 - ax) * ay;
    const w11 = ax * ay;

    const landField = this.land[i00] * w00 + this.land[i10] * w10 + this.land[i01] * w01 + this.land[i11] * w11;
    const wobble = this.plain ? 0 : (noise(X / 6, Y / 6, 1) - 0.5) * 0.34 + (hash(X, Y, 2) - 0.5) * 0.05;
    const landness = landField + wobble;
    const o = (Y * this.width + X) * 4;

    if (landness <= 0.5) {
      this.paintWater(o, X, Y, landness, [i00, i10, i01, i11], [w00, w10, w01, w11]);
      return;
    }

    // Which tile this pixel belongs to: the nearest one, *after* bending the
    // pixel's coordinates with coherent noise.
    //
    // Domain warping is what finally kills the grid. Any rule that picks
    // between neighbours by weight still has a seam running along the tile
    // edge — noise can push the seam about, but along its length it stays a
    // ruled line, and a lone tile of badlands stays a square. Warping the
    // space first means the grid itself is wavy: a lone tile becomes a blob,
    // and a biome edge wanders like a real one.
    let best = i00;
    if (this.plain) {
      best = (fy - iy < 0.5 ? y0 : y1) * n + (fx - ix < 0.5 ? x0 : x1);
    } else {
      const wx = fx + (noise(X / 7, Y / 7, 51) - 0.5) * 0.95 + (noise(X / 2.5, Y / 2.5, 52) - 0.5) * 0.35;
      const wy = fy + (noise(X / 7, Y / 7, 53) - 0.5) * 0.95 + (noise(X / 2.5, Y / 2.5, 54) - 0.5) * 0.35;
      const cx = Math.max(0, Math.min(n - 1, Math.round(wx)));
      const cy = Math.max(0, Math.min(n - 1, Math.round(wy)));
      best = cy * n + cx;
      if (this.land[best] < 0.5) {
        // Warped onto water while the land field says land: fall back to the
        // heaviest land corner.
        const ids = [i00, i10, i01, i11];
        const ws = [w00, w10, w01, w11];
        let bw = -1;
        for (let k = 0; k < 4; k++) {
          if (this.land[ids[k]] >= 0.5 && ws[k] > bw) { bw = ws[k]; best = ids[k]; }
        }
      }
    }

    let r = this.rgb[best * 3];
    let g = this.rgb[best * 3 + 1];
    let b = this.rgb[best * 3 + 2];
    const mat = this.mat[best] as Mat;

    if (this.plain) {
      // A data layer: flat colour with the barest grain, so it still reads
      // as a surface and not a chart.
      const s = 0.985 + hash(X, Y, 3) * 0.03;
      this.write(o, r * s, g * s, b * s, SURFACE.land);
      return;
    }

    // -- relief -----------------------------------------------------------
    const h00 = this.height[i00]; const h10 = this.height[i10];
    const h01 = this.height[i01]; const h11 = this.height[i11];
    const h = h00 * w00 + h10 * w10 + h01 * w01 + h11 * w11;
    // Analytic gradient of the bilinear patch, per tile.
    const gx = (h10 - h00) * (1 - ay) + (h11 - h01) * ay;
    const gy = (h01 - h00) * (1 - ax) + (h11 - h10) * ax;
    // Lit from the top left: ground rising to the right or downward faces
    // the light. Rock gets a little crag noise on top so a slope is not a
    // flat ramp.
    let light = (gx + gy) * RELIEF[mat] * 0.9;
    // Crags. The tile heights are far too smooth to give a mountain any
    // faces from straight above, so rough ground carries a small invented
    // heightfield of its own and is lit by *its* slope: ridges lit on the
    // top-left, dark on the bottom-right, which is how their rock tiles are
    // drawn.
    const craggy = mat === Mat.Rock ? 1.5 : mat === Mat.Volcanic ? 1.2 : mat === Mat.Hills ? 0.4 : mat === Mat.Strata ? 0.5 : 0;
    let ridge = 0.5;
    if (craggy > 0) {
      ridge = crag(X, Y);
      light += ((crag(X + 1, Y) - crag(X - 1, Y)) + (crag(X, Y + 1) - crag(X, Y - 1))) * craggy;
    }
    light = light < -0.32 ? -0.32 : light > 0.32 ? 0.32 : light;
    // Stepped, not smooth: banded shading is what reads as pixel art.
    light = Math.round(light / 0.08) * 0.08;

    // -- material ---------------------------------------------------------
    const pick = hash(X, Y, 5);
    const clump = noise(X / 2.2, Y / 2.2, 9);
    let s = 1;
    let alpha: number = SURFACE.land;

    switch (mat) {
      case Mat.Grass:
      case Mat.Bloom:
      case Mat.Hills:
        s = clump > 0.64 ? 0.93 : clump < 0.3 ? 1.05 : 1;
        if (pick > 0.965) s = 1.1;
        break;
      case Mat.Forest:
      case Mat.Enchanted:
        s = clump > 0.6 ? 0.9 : clump < 0.32 ? 1.04 : 0.97;
        break;
      case Mat.Savanna:
        s = clump > 0.62 ? 0.94 : 1.02;
        if (pick > 0.93) { r = r * 0.6 + 216 * 0.4; g = g * 0.6 + 192 * 0.4; b = b * 0.6 + 112 * 0.4; }
        break;
      case Mat.Sand:
      case Mat.Salt:
        s = pick < 0.1 ? 0.92 : pick > 0.9 ? 1.06 : 1;
        break;
      case Mat.Desert: {
        const ripple = Math.sin(X * 0.55 + Y * 0.22 + noise(X / 7, Y / 7, 11) * 6);
        s = ripple > 0.62 ? 1.06 : ripple < -0.72 ? 0.93 : 1;
        if (pick > 0.97) s = 0.9;
        break;
      }
      case Mat.Rock: {
        s = clump > 0.66 ? 1.07 : clump < 0.32 ? 0.9 : 1;
        if (pick > 0.94) s = 0.82;
        // Snow on the summits, edged by the noise so the snowline is ragged.
        // Riding on the crag field rather than its own noise, so snow lies
        // on the ridges and leaves the gullies dark.
        const peak = h + (ridge - 0.5) * 0.16;
        if (peak > 0.83) {
          [r, g, b] = SNOW_RGB;
          s = 0.94;
          // The snowline gets an edge, as theirs does: one of the few places
          // WorldBox spends an outline colour, and the reason a cap reads as
          // lying *on* the rock rather than being a white patch in it.
          if (peak < 0.85) { r = 168; g = 182; b = 198; s = 1; }
        }
        break;
      }
      case Mat.Snow:
        s = clump > 0.62 ? 0.95 : 1;
        if (pick > 0.97) { s = 1.03; b += 6; }
        break;
      case Mat.Ice:
        s = pick > 0.95 ? 1.1 : clump > 0.66 ? 0.95 : 1;
        break;
      case Mat.Tundra:
        s = clump > 0.6 ? 0.94 : 1;
        if (noise(X / 2.6, Y / 2.6, 14) > 0.74) { r = 222; g = 230; b = 232; }
        break;
      case Mat.Swamp:
        s = clump > 0.6 ? 0.9 : 1.02;
        if (noise(X / 2.4, Y / 2.4, 15) > 0.66) {
          [r, g, b] = PUDDLE_RGB;
          s = pick > 0.9 ? 1.15 : 1;
        }
        break;
      case Mat.Volcanic:
        s = clump > 0.6 ? 0.85 : 1;
        if (noise(X / 1.8, Y / 1.8, 17) > 0.8) { [r, g, b] = LAVA_RGB; light = 0; }
        break;
      case Mat.Corrupt:
        s = pick > 0.9 ? 0.72 : clump > 0.62 ? 0.9 : 1.04;
        break;
      case Mat.Strata: {
        const band = Math.floor((Y + noise(X / 8, Y / 8, 19) * 5) / 2) % 3;
        s = band === 0 ? 0.9 : band === 1 ? 1 : 1.08;
        break;
      }
      case Mat.Ash:
        s = pick < 0.15 ? 0.85 : pick > 0.94 ? 1.2 : 1;
        break;
      case Mat.Candy: {
        // Frosting swirls: a pink ground with cream stripes and sprinkles.
        const swirl = Math.sin((X + Y) * 0.7 + noise(X / 5, Y / 5, 61) * 5);
        if (swirl > 0.75) { r = 250; g = 236; b = 240; }
        if (pick > 0.97) [r, g, b] = FLOWERS[Math.floor(hash(X, Y, 62) * FLOWERS.length)];
        break;
      }
      case Mat.Crystal:
        // Facets: hard light and dark planes rather than a soft clump.
        s = clump > 0.6 ? 1.18 : clump < 0.3 ? 0.84 : 1;
        if (pick > 0.96) { r = 240; g = 252; b = 255; }
        break;
      case Mat.Mushroom:
        s = clump > 0.62 ? 0.88 : 1.04;
        if (pick > 0.975) { r = 214; g = 236; b = 180; }
        break;
      case Mat.Infernal:
        s = clump > 0.6 ? 0.78 : 1;
        if (noise(X / 1.8, Y / 1.8, 63) > 0.72) { [r, g, b] = LAVA_RGB; light = 0; }
        break;
      case Mat.Waste:
        s = pick < 0.12 ? 0.82 : clump > 0.65 ? 0.92 : 1.03;
        if (pick > 0.985) { r = 120; g = 150; b = 60; }
        break;
      default:
        break;
    }

    r *= s * (1 + light);
    g *= s * (1 + light);
    b *= s * (1 + light);

    // Flowers: the cheapest charm in the palette. A meadow stops being a
    // colour and becomes a meadow.
    if ((mat === Mat.Grass || mat === Mat.Bloom || mat === Mat.Savanna)
      && hash(X, Y, 21) > (mat === Mat.Bloom ? 0.93 : 0.988)
      && noise(X / 9, Y / 9, 22) > 0.45) {
      [r, g, b] = FLOWERS[Math.floor(hash(X, Y, 23) * FLOWERS.length)];
    }

    // The tile the pixel actually sits in, for things that belong to a tile
    // rather than to a material: a road, a fire.
    const tx = Math.floor(X / PX);
    const ty = Math.floor(Y / PX);
    const own = ty * n + tx;
    if (this.road[own] && this.onRoad(tx, ty, X - tx * PX, Y - ty * PX)) {
      const sp = hash(X, Y, 25);
      const k = sp > 0.85 ? 0.92 : sp < 0.1 ? 1.08 : 1;
      r = ROAD_RGB[0] * k; g = ROAD_RGB[1] * k; b = ROAD_RGB[2] * k;
    }
    if (this.fire[own]) {
      // Flame pixels are tagged so the shader can make them flicker; the
      // charred ground between them stays still.
      const f = hash(X, Y, 27);
      if (f < 0.22) { [r, g, b] = EMBER_RGB; alpha = SURFACE.fire; }
      else if (f < 0.55) { [r, g, b] = FIRE_RGB; alpha = SURFACE.fire; }
      else { r *= 0.35; g *= 0.3; b *= 0.28; }
    }

    this.write(o, r, g, b, alpha);
  }

  /**
   * Whether a pixel is on the path across a road tile.
   *
   * A square in the middle, plus an arm reaching out towards every
   * neighbouring road tile, so roads join up into lines rather than a chain
   * of separate squares.
   */
  private onRoad(tx: number, ty: number, px: number, py: number): boolean {
    const n = this.size;
    const lo = 2;
    const hi = 5;
    const inX = px >= lo && px <= hi;
    const inY = py >= lo && py <= hi;
    if (inX && inY) return true;
    if (inY && px > hi && tx < n - 1 && this.road[ty * n + tx + 1]) return true;
    if (inY && px < lo && tx > 0 && this.road[ty * n + tx - 1]) return true;
    if (inX && py > hi && ty < n - 1 && this.road[(ty + 1) * n + tx]) return true;
    if (inX && py < lo && ty > 0 && this.road[(ty - 1) * n + tx]) return true;
    return false;
  }

  private paintWater(o: number, X: number, Y: number, landness: number, ids: number[], ws: number[]): void {
    // The water tile with the most say over this pixel.
    let best = ids[0];
    let bw = -1;
    let depth = 0;
    for (let k = 0; k < 4; k++) {
      depth += this.depth[ids[k]] * ws[k];
      if (this.land[ids[k]] < 0.5 && ws[k] > bw) { bw = ws[k]; best = ids[k]; }
    }

    if (this.plain) {
      this.write(o, this.rgb[best * 3], this.rgb[best * 3 + 1], this.rgb[best * 3 + 2], SURFACE.ocean);
      return;
    }

    // A line of foam on the waterline, a pixel or two wide.
    if (landness > 0.43) {
      const f = hash(X, Y, 31) > 0.3 ? 1 : 0.94;
      this.write(o, FOAM_RGB[0] * f, FOAM_RGB[1] * f, FOAM_RGB[2] * f, SURFACE.foam);
      return;
    }

    let rgb: [number, number, number];
    let alpha: number;
    if (this.inland[best]) {
      // Rivers and lakes keep their own colour; they are not the sea.
      rgb = [this.rgb[best * 3], this.rgb[best * 3 + 1], this.rgb[best * 3 + 2]];
      alpha = SURFACE.shallow;
    } else {
      const d = depth + (noise(X / 5, Y / 5, 33) - 0.5) * 0.8;
      const { shallow, ocean, deep } = this.water;
      if (d < 0.85) { rgb = mixRgb(shallow, FOAM_RGB, 0.18); alpha = SURFACE.shallow; }
      else if (d < 1.7) { rgb = shallow; alpha = SURFACE.shallow; }
      else if (d < 2.7) { rgb = mixRgb(shallow, ocean, 0.5); alpha = SURFACE.mid; }
      else if (d < 4.2) { rgb = ocean; alpha = SURFACE.ocean; }
      else if (d < 6.2) { rgb = mixRgb(ocean, deep, 0.5); alpha = SURFACE.ocean; }
      else { rgb = deep; alpha = SURFACE.deep; }
    }
    // A little mottle in the shallows; the deep stays flat.
    const mottle = alpha >= SURFACE.mid ? (hash(X, Y, 35) > 0.8 ? 1.04 : 1) : 1;
    this.write(o, rgb[0] * mottle, rgb[1] * mottle, rgb[2] * mottle, alpha);
  }

  // -- decoration --------------------------------------------------------

  private drawStamp(tx: number, ty: number, stamp: Stamp, x0: number, y0: number, x1: number, y1: number): void {
    const rows = STAMPS[stamp.kind];
    const h = rows.length;
    const w = rows[0].length;
    const left = tx * PX + Math.round(stamp.cx - w / 2);
    const top = ty * PX + Math.round(stamp.cy - h / 2);
    const i = ty * this.size + tx;
    const base: [number, number, number] = [this.rgb[i * 3], this.rgb[i * 3 + 1], this.rgb[i * 3 + 2]];
    const palette = this.winter ? frosted(paletteFor(stamp.kind, base), stamp.kind) : paletteFor(stamp.kind, base);

    // The shadow first, one pixel down and to the right, so the canopy that
    // follows sits on top of it.
    for (let sy = 0; sy < h; sy++) {
      const row = rows[sy];
      for (let sx = 0; sx < w; sx++) {
        if (row[sx] === '.' || row[sx] === 'T') continue;
        const X = left + sx + 1;
        const Y = top + sy + 1;
        if (X < x0 || X >= x1 || Y < y0 || Y >= y1) continue;
        const o = (Y * this.width + X) * 4;
        if (this.data[o + 3] !== SURFACE.land) continue;
        this.data[o] *= 0.66; this.data[o + 1] *= 0.66; this.data[o + 2] *= 0.7;
      }
    }
    for (let sy = 0; sy < h; sy++) {
      const row = rows[sy];
      for (let sx = 0; sx < w; sx++) {
        const key = row[sx];
        if (key === '.') continue;
        const X = left + sx;
        const Y = top + sy;
        if (X < x0 || X >= x1 || Y < y0 || Y >= y1) continue;
        const o = (Y * this.width + X) * 4;
        // Never paint a tree into the sea, even where a canopy overhangs a
        // coast that the noise pulled inland.
        if (this.data[o + 3] !== SURFACE.land) continue;
        const c = palette[key as keyof typeof palette] ?? palette.M;
        this.write(o, c[0], c[1], c[2], SURFACE.land);
      }
    }
  }

  private write(o: number, r: number, g: number, b: number, a: number): void {
    this.data[o] = clampByte(r);
    this.data[o + 1] = clampByte(g);
    this.data[o + 2] = clampByte(b);
    this.data[o + 3] = a;
  }
}

const mixRgb = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
];

const scale = (c: readonly number[], k: number): [number, number, number] => [c[0] * k, c[1] * k, c[2] * k];

type Palette = Record<'L' | 'M' | 'D' | 'T' | 'W' | 'R' | 'Y', [number, number, number]>;

/**
 * Colours for a stamp. Vegetation takes the ground's own colour and lifts it,
 * so a wood follows the season the ground is in — autumn canopies, snowy
 * pines — without a second palette per season.
 */
const paletteFor = (kind: StampKind, ground: [number, number, number]): Palette => {
  const fixed = (c: readonly number[]): Palette => ({
    L: scale(c, 1.25), M: [c[0], c[1], c[2]], D: scale(c, 0.72),
    T: TRUNK_RGB, W: [250, 250, 255], R: [214, 82, 72], Y: [240, 206, 78],
  });
  switch (kind) {
    case 'rock':
    case 'boulder':
    case 'rubble':
      return fixed(ROCK_RGB);
    case 'cactus':
      return fixed(CACTUS_RGB);
    case 'crystal':
      return fixed(CRYSTAL_RGB);
    case 'toadstool':
      return { ...fixed([200, 60, 60]), R: [212, 58, 52], W: [248, 244, 236], T: [236, 228, 208] };
    case 'candycane':
      return { ...fixed([240, 240, 240]), R: [220, 50, 60], W: [252, 252, 252] };
    case 'spire':
      return fixed([96, 40, 30]);
    case 'deadwood':
      return { ...fixed(DEADWOOD_RGB), T: DEADWOOD_RGB };
    case 'pine': {
      const m = mixRgb(scale(ground, 1.05), [40, 90, 70], 0.25);
      return { ...fixed(m), L: mixRgb(m, [180, 220, 160], 0.3), D: scale(m, 0.6) };
    }
    default: {
      const m = scale(ground, 1.28);
      return { ...fixed(m), L: mixRgb(m, [214, 232, 120], 0.32), D: scale(ground, 0.74) };
    }
  }
};

const FROST_RGB: [number, number, number] = [238, 244, 250];

/** Snow on the lit side of a stamp: canopies, pines and rocks, not cacti or crystals. */
const frosted = (palette: Palette, kind: StampKind): Palette => {
  if (kind === 'cactus' || kind === 'crystal' || kind === 'candycane' || kind === 'toadstool') return palette;
  return {
    ...palette,
    L: mixRgb(palette.L, FROST_RGB, 0.85),
    M: mixRgb(palette.M, FROST_RGB, kind === 'pine' ? 0.25 : 0.35),
  };
};

/** A stable 0-1 value for a tile and salt. */
const tileRoll = (tile: Tile, salt: number): number => hash(tile.x, tile.y, salt + 700);

/**
 * What grows on a tile, as stamps at positions within it.
 *
 * Two trees on a mature forest tile rather than one, placed in opposite
 * halves with jitter, so canopies overlap into a continuous wood. One big tree
 * on an ancient tile. Open ground gets the occasional plant, never a lattice.
 */
export const stampsFor = (tile: Tile): Stamp[] | null => {
  const v = tile.variant ?? tileRoll(tile, 0);
  const structure = tile.structure?.type;
  const cold = tile.temperature < 0.32;
  const at = (salt: number, lo = 1.5, hi = 6.5) => lo + tileRoll(tile, salt) * (hi - lo);
  const treeKind = (): StampKind => {
    if (tile.type === 'enchanted_forest') return 'crystal';
    if ((tile.type === 'rainforest' || tile.type === 'tropical_forest') && v > 0.45) return 'palm';
    if (tile.type === 'savanna') return 'acacia';
    return cold || tile.type === 'coniferous_forest' || tile.type === 'taiga' ? 'pine' : 'tree';
  };

  if (structure === 'mature_tree') {
    // Two or three trees in shuffled quadrants, jittered well off-centre, so
    // the edge of a wood is ragged rather than following the tile line.
    const kind = treeKind();
    const count = tileRoll(tile, 30) > 0.55 ? 3 : 2;
    const slots = [[2, 2], [6, 2], [2, 6], [6, 6]];
    const start = Math.floor(tileRoll(tile, 31) * 4);
    const list: Stamp[] = [];
    for (let k = 0; k < count; k++) {
      const [sx, sy] = slots[(start + k * (count === 2 ? 3 : 1)) % 4];
      list.push({ kind, cx: sx + (tileRoll(tile, 32 + k) - 0.5) * 3, cy: sy + (tileRoll(tile, 40 + k) - 0.5) * 3 });
    }
    // Drawn top to bottom so the lower canopy overlaps the upper.
    return list.sort((a, b) => a.cy - b.cy);
  }
  if (structure === 'ancient_tree') {
    const kind = treeKind();
    return [{ kind: kind === 'tree' ? 'bigtree' : kind, cx: at(5, 3, 5), cy: at(6, 3, 5) }];
  }
  if (structure === 'sapling' || structure === 'young_tree') {
    return [{ kind: structure === 'young_tree' ? treeKind() : 'sapling', cx: at(7), cy: at(8) }];
  }
  // Rocks thinned hard. Every outcrop drawn turned whole hillsides into a
  // field of grey pebbles; one in four is a feature.
  if (structure === 'rock_outcrop') return v < 0.25 ? [{ kind: 'rock', cx: at(9), cy: at(10) }] : null;
  if (structure === 'boulder') return v < 0.4 ? [{ kind: 'boulder', cx: at(11, 3, 5), cy: at(12, 3, 5) }] : null;
  if (structure === 'bush') {
    if (tile.type === 'marsh' || tile.type === 'swamp') return [{ kind: 'reed', cx: at(13), cy: at(14) }];
    return [{ kind: 'bush', cx: at(13), cy: at(14) }];
  }
  if (structure === 'ruins') return [{ kind: 'rubble', cx: at(15), cy: at(16) }];

  switch (tile.type) {
    case 'desert': return v > 0.9 ? [{ kind: 'cactus', cx: at(17), cy: at(18) }] : null;
    case 'beach': return v > 0.94 ? [{ kind: 'palm', cx: at(17), cy: at(18) }] : null;
    case 'swamp':
    case 'marsh': return v > 0.45 ? [{ kind: 'reed', cx: at(17), cy: at(18) }] : null;
    case 'savanna': return v > 0.88 ? [{ kind: 'acacia', cx: at(17), cy: at(18) }] : null;
    case 'badlands':
    case 'mesa':
    case 'corrupted':
    case 'ashland': return v > 0.82 ? [{ kind: 'deadwood', cx: at(17), cy: at(18) }] : null;
    case 'volcanic':
    case 'mountains': return v > 0.92 ? [{ kind: 'rock', cx: at(17), cy: at(18) }] : null;
    case 'grassland':
    case 'bloom': return v > 0.93 ? [{ kind: 'bush', cx: at(17), cy: at(18) }] : null;
    case 'snow':
    case 'tundra': return v > 0.9 ? [{ kind: 'pine', cx: at(17), cy: at(18) }] : null;
    case 'candy': return v > 0.7 ? [{ kind: 'candycane', cx: at(17), cy: at(18) }] : null;
    case 'crystal': return v > 0.55 ? [{ kind: 'crystal', cx: at(17), cy: at(18) }] : null;
    case 'mushroom': return v > 0.4 ? [{ kind: 'toadstool', cx: at(17), cy: at(18) }] : null;
    case 'infernal': return v > 0.75 ? [{ kind: 'spire', cx: at(17), cy: at(18) }] : null;
    case 'wasteland': return v > 0.85 ? [{ kind: 'deadwood', cx: at(17), cy: at(18) }] : null;
    default: return null;
  }
};
