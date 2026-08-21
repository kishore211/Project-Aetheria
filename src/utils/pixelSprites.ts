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

const TEMPLATES: Record<string, string[]> = {
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

const drawGrid = (grid: string[], palette: Palette, mirrorLegRows: boolean): HTMLCanvasElement => {
  const rows = grid.length;
  const cols = grid[0].length;
  const scale = 8;
  const canvas = document.createElement('canvas');
  canvas.width = cols * scale;
  canvas.height = rows * scale;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const legStart = rows - 3; // bottom rows hold legs/feet
    for (let y = 0; y < rows; y++) {
      const mirrored = mirrorLegRows && y >= legStart;
      for (let x = 0; x < cols; x++) {
        const sourceX = mirrored ? cols - 1 - x : x;
        const key = grid[y][sourceX];
        if (key === '.') continue;
        ctx.fillStyle = palette[key] ?? '#ff00ff';
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
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

/** Two-frame walk cycle: frame 0 rest pose, frame 1 alternate gait. */
export function getPixelSpriteFrames(type: EntityType): [THREE.CanvasTexture, THREE.CanvasTexture] {
  const cachedA = textureCache.get(`${type}:0`);
  const cachedB = textureCache.get(`${type}:1`);
  if (cachedA && cachedB) return [cachedA, cachedB];

  const spec = SPECS[type] ?? SPECS.human;
  const grid = TEMPLATES[spec.template];

  const frameA = makeTexture(drawGrid(grid, spec.palette, false));
  const frameB = makeTexture(drawGrid(grid, spec.palette, true));
  textureCache.set(`${type}:0`, frameA);
  textureCache.set(`${type}:1`, frameB);
  return [frameA, frameB];
}
