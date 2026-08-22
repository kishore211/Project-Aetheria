// Procedural pixel-art sprites drawn on canvas textures (no external assets).
import * as THREE from 'three';
import type { EntityType } from '../types/world';

type Palette = Record<string, string>;

// Humanoid template: s=skin, h=hair, b=body/shirt, p=pants, e=eye
const HUMANOID = [
  '....hhhh....',
  '...hhhhhh...',
  '...hssssh...',
  '...ssesse...',
  '...ssssss...',
  '....ssss....',
  '..bbbbbbbb..',
  '.b.bbbbbb.b.',
  '.s.bbbbbb.s.',
  '...pppppp...',
  '...pp..pp...',
  '...ss..ss...',
];

// Quadruped template: f=fur, d=dark fur, e=eye, t=tail
const QUADRUPED = [
  '............',
  '.tt.........',
  '..t.ffffff..',
  '...fffffff..',
  '...ffffffff.',
  '...fffffefd.',
  '...ffffffdd.',
  '...ff..ff...',
  '...ff..ff...',
  '...dd..dd...',
  '............',
  '............',
];

// Small critter template (rabbit/bird): f=fur, e=eye, w=accent
const CRITTER = [
  '............',
  '....w..w....',
  '....ff.ff...',
  '....ffff....',
  '...ffeff....',
  '...ffffff...',
  '..ffffffff..',
  '..ffffffff..',
  '...ffffff...',
  '....f..f....',
  '............',
  '............',
];

// Fish template: f=body, d=fin, e=eye
const FISH = [
  '............',
  '............',
  '....ffff....',
  '..dffffffd..',
  '.dfffeffffd.',
  '..dffffffd..',
  '....ffff....',
  '............',
  '............',
  '............',
  '............',
  '............',
];

// Dragon template: f=body, w=wing, e=eye, d=belly
const DRAGON = [
  '..w......w..',
  '.www....www.',
  '.wwww..wwww.',
  '..wffffffw..',
  '...ffffff...',
  '..ffeffeff..',
  '..ffffffff..',
  '...fddddf...',
  '...fddddf...',
  '..ff....ff..',
  '.f........f.',
  '............',
];

// Serpent template: f=body, d=pattern, e=eye
const SERPENT = [
  '............',
  '............',
  '............',
  '..ffd.......',
  '.ffeff......',
  '..fddff.....',
  '....ffdff...',
  '.....fddff..',
  '.......fdff.',
  '........fff.',
  '............',
  '............',
];

// Bird template: f=body, w=wing, e=eye, d=beak
const FOWL = [
  '............',
  '....ddd.....',
  '...fffff....',
  '..ffefff....',
  '..fffffff...',
  '.wwfffffff..',
  '.wwffffffff.',
  '..ffffffff..',
  '...ff..ff...',
  '...dd..dd...',
  '............',
  '............',
];

/** Exported so the frame generator can be tested against every template. */
export const TEMPLATES: Record<string, string[]> = {
  humanoid: HUMANOID,
  quadruped: QUADRUPED,
  critter: CRITTER,
  fish: FISH,
  dragon: DRAGON,
  serpent: SERPENT,
  fowl: FOWL,
};

interface SpriteSpec {
  template: keyof typeof TEMPLATES;
  palette: Palette;
}

const SPECS: Record<EntityType, SpriteSpec> = {
  human: {
    template: 'humanoid',
    palette: { s: '#e8b58a', h: '#5b3a1e', b: '#3468c2', p: '#5a4632', e: '#1a1a1a' },
  },
  elf: {
    template: 'humanoid',
    palette: { s: '#f2d4ae', h: '#e5d68a', b: '#2f7d4f', p: '#274a33', e: '#173a2a' },
  },
  dwarf: {
    template: 'humanoid',
    palette: { s: '#dfa173', h: '#a8542c', b: '#7a4a24', p: '#3f3f46', e: '#161616' },
  },
  orc: {
    template: 'humanoid',
    palette: { s: '#6e8f3f', h: '#2f3b1d', b: '#54432c', p: '#33291b', e: '#c92c2c' },
  },
  bandit: {
    template: 'humanoid',
    palette: { s: '#d9a172', h: '#1f1f24', b: '#42424c', p: '#26262c', e: '#d13b3b' },
  },
  zombie: {
    template: 'humanoid',
    palette: { s: '#8faf6f', h: '#4c5c3a', b: '#5d6b52', p: '#3c4437', e: '#dfe3d0' },
  },
  skeleton: {
    template: 'humanoid',
    palette: { s: '#e8e4d4', h: '#e8e4d4', b: '#cfc9b4', p: '#b7b19c', e: '#101010' },
  },
  demon: {
    template: 'humanoid',
    palette: { s: '#b03030', h: '#601515', b: '#7d1f1f', p: '#4a1010', e: '#ffd23e' },
  },
  elemental: {
    template: 'humanoid',
    palette: { s: '#59e0c8', h: '#2ab4a2', b: '#3ecbb7', p: '#1f8b7d', e: '#eafffa' },
  },
  wolf: {
    template: 'quadruped',
    palette: { f: '#8a8f98', d: '#565b63', e: '#e8c33b', t: '#565b63' },
  },
  bear: {
    template: 'quadruped',
    palette: { f: '#7a4f2c', d: '#54351d', e: '#1c1c1c', t: '#54351d' },
  },
  deer: {
    template: 'quadruped',
    palette: { f: '#c49a63', d: '#8f6c41', e: '#241a10', t: '#e6d9c2' },
  },
  rabbit: {
    template: 'critter',
    palette: { f: '#e9e4da', e: '#2a2a2a', w: '#e9e4da' },
  },
  bird: {
    template: 'critter',
    palette: { f: '#4f9fdf', e: '#111111', w: '#2c6ea8' },
  },
  fish: {
    template: 'fish',
    palette: { f: '#6fc4bc', d: '#3d8b84', e: '#0f2a28' },
  },
  sheep: {
    template: 'quadruped',
    palette: { f: '#f2efe6', d: '#cfc7b6', e: '#2a2a2a', t: '#e6e0d2' },
  },
  chicken: {
    template: 'fowl',
    palette: { f: '#f4f1e4', w: '#ddd6c2', e: '#1c1c1c', d: '#e2a33c' },
  },
  fox: {
    template: 'quadruped',
    palette: { f: '#d3752c', d: '#8f4a17', e: '#2a1a0c', t: '#f0e4d4' },
  },
  snake: {
    template: 'serpent',
    palette: { f: '#5f9e46', d: '#33622a', e: '#e8c33b' },
  },
  dragon: {
    template: 'dragon',
    palette: { f: '#c03a2b', w: '#7c1f16', d: '#e8b34b', e: '#ffe94d' },
  },
};

const textureCache = new Map<string, THREE.CanvasTexture>();

/**
 * Walk-cycle frames, as a transform on the template rather than hand-authored art.
 *
 * The previous version claimed a "two-frame walk cycle" by mirroring the bottom
 * three rows of the grid. Every template's leg rows are horizontally symmetric
 * — `...pp..pp...` mirrors to itself — so the mirror was a pixel-identical
 * no-op for six of the seven templates. There has never actually been a walk
 * animation in this game; creatures have been static sprites sliding across the
 * ground, which is most of why the world reads as a diorama.
 *
 * A transform rather than art because it applies to all seven templates at
 * once, and because the templates are the source of truth for what a creature
 * looks like — hand-authored frames would drift out of step with them the first
 * time one was edited.
 *
 * Four frames, the standard front-view walk: legs together, left lifted,
 * together, right lifted. The lift is one pixel, which at 8x scale is a clear
 * 8px step.
 */
export const WALK_FRAMES = 4;

/**
 * The lowest row with any pixel in it — where the creature meets the ground.
 *
 * Not simply the last row: most templates are 12x12 with the art floating one
 * or two rows above the bottom (a quadruped's hooves sit on row 9 of 12). The
 * first version of this assumed bottom-alignment and found feet on only two of
 * the seven templates, which would have left five of them still unanimated —
 * the same bug in a new place.
 */
const groundRow = (grid: string[]): number => {
  for (let y = grid.length - 1; y >= 0; y -= 1) {
    if (grid[y].includes('.') === false || /[^.]/.test(grid[y])) return y;
  }
  return grid.length - 1;
};

/** Columns holding pixels in the bottom two occupied rows — the feet. */
const footColumns = (grid: string[]): number[] => {
  const ground = groundRow(grid);
  const bottom = grid[ground];
  const above = grid[ground - 1] ?? bottom;
  const columns: number[] = [];
  for (let x = 0; x < bottom.length; x += 1) {
    if (bottom[x] !== '.' || above[x] !== '.') columns.push(x);
  }
  return columns;
};

/**
 * Which foot columns move on this frame.
 *
 * Split at the midpoint of the feet rather than of the sprite, so a creature
 * whose legs sit off-centre still lifts one side at a time. Frames 0 and 2 are
 * the passing poses and lift nothing.
 */
const liftedColumns = (grid: string[], frame: number): Set<number> => {
  if (frame === 0 || frame === 2) return new Set();
  const feet = footColumns(grid);
  if (feet.length === 0) return new Set();
  const midpoint = (feet[0] + feet[feet.length - 1]) / 2;
  const wanted = frame === 1
    ? feet.filter(x => x <= midpoint)
    : feet.filter(x => x > midpoint);
  return new Set(wanted);
};

/**
 * Rows that count as leg. Two is enough for a visible step and keeps the body
 * still, which is what makes the motion read as walking rather than as the
 * whole creature juddering.
 */
const LEG_ROWS = 2;

/**
 * The grid for one frame of the walk cycle.
 *
 * Separated from drawing and exported so it can be tested without a canvas —
 * the bug this replaces was invisible precisely because nothing could look at
 * the frames. The pose logic is the part with the bug in it, so the pose logic
 * is the part with the test on it.
 */
export const poseGrid = (grid: string[], frame: number): string[] => {
  const rows = grid.length;
  const lifted = liftedColumns(grid, frame);
  if (lifted.size === 0) return grid;
  const ground = groundRow(grid);
  const legStart = ground - LEG_ROWS + 1;

  return grid.map((row, y) => {
    if (y < legStart || y > ground) return row;
    let out = '';
    for (let x = 0; x < row.length; x += 1) {
      // A lifted leg reads its pixel from one row lower, so the whole leg moves
      // up by one and the bottom row of that leg goes empty.
      if (!lifted.has(x)) { out += row[x]; continue; }
      out += y + 1 < rows ? grid[y + 1][x] : '.';
    }
    return out;
  });
};

const drawGrid = (grid: string[], palette: Palette, frame: number): HTMLCanvasElement => {
  const posed = poseGrid(grid, frame);
  const rows = posed.length;
  const cols = posed[0].length;
  const scale = 8;
  const canvas = document.createElement('canvas');
  canvas.width = cols * scale;
  canvas.height = rows * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const key = posed[y][x];
      if (key === '.') continue;
      ctx.fillStyle = palette[key] ?? '#ff00ff';
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return canvas;
};

const makeTexture = (canvas: HTMLCanvasElement): THREE.CanvasTexture => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/** Build (and cache) a crisp pixel-art texture for an entity type. */
export function getPixelSpriteTexture(type: EntityType): THREE.CanvasTexture {
  return getPixelSpriteFrames(type)[0];
}

/**
 * The four-frame walk cycle for a creature type, built once and cached.
 *
 * Frame 0 is the standing pose, so anything that wants a single still image can
 * take the first entry and be right.
 */
export function getPixelSpriteFrames(type: EntityType): THREE.CanvasTexture[] {
  const cached: THREE.CanvasTexture[] = [];
  for (let frame = 0; frame < WALK_FRAMES; frame += 1) {
    const hit = textureCache.get(`${type}:${frame}`);
    if (!hit) break;
    cached.push(hit);
  }
  if (cached.length === WALK_FRAMES) return cached;

  const spec = SPECS[type] ?? SPECS.human;
  const grid = TEMPLATES[spec.template];

  const frames: THREE.CanvasTexture[] = [];
  for (let frame = 0; frame < WALK_FRAMES; frame += 1) {
    const texture = makeTexture(drawGrid(grid, spec.palette, frame));
    textureCache.set(`${type}:${frame}`, texture);
    frames.push(texture);
  }
  return frames;
}
