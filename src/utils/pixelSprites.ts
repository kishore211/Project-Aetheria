// Procedural pixel-art sprites drawn on canvas textures (no external assets).
import * as THREE from 'three';
import { applyRamp, rampById } from './subspecies';
import type { EntityType } from '../types/world';
import { MATERIAL_COLOR, type Equipment, type Material, type WeaponKind } from './equipment';

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

// Crab template: f=shell, d=claw, e=eye
const CRAB = [
  '............',
  '............',
  '.d........d.',
  'dd.d....d.dd',
  '.d.ffffff.d.',
  '..fffefeff..',
  '.ffffffffff.',
  '..ffffffff..',
  '.f.f....f.f.',
  '............',
  '............',
  '............',
];

// Turtle template: f=shell, d=shell pattern, s=skin, e=eye
const TURTLE = [
  '............',
  '............',
  '............',
  '....dddd....',
  '...dfdfdd...',
  '..dfdfdfdd..',
  '..ddddddddss',
  '..s.s..s.sse',
  '............',
  '............',
  '............',
  '............',
];

// Ghost template: f=sheet, e=eye, d=mouth
const GHOST = [
  '....ffff....',
  '...ffffff...',
  '..ffffffff..',
  '..fefffeff..',
  '..ffffffff..',
  '..fffddfff..',
  '..ffffffff..',
  '..ffffffff..',
  '..ffffffff..',
  '..f.ff.ff.f.',
  '............',
  '............',
];

// Fairy template: w=wing, h=hair, s=skin, e=eye, b=dress
const FAIRY = [
  '............',
  '.ww..hh..ww.',
  'www.hssh.www',
  '.ww.sess.ww.',
  '..w.ssss.w..',
  '.....bb.....',
  '....bbbb....',
  '....bbbb....',
  '.....bb.....',
  '.....ss.....',
  '............',
  '............',
];

// Snowman template: h=hat, f=snow, e=coal eye, o=carrot, b=stick arm, d=button
const SNOWMAN = [
  '....hhhh....',
  '....hhhh....',
  '...hhhhhh...',
  '....ffff....',
  '...fefeff...',
  '...ffoooo...',
  '....ffff....',
  '.b.ffffff.b.',
  '..bffdfffb..',
  '..ffffffff..',
  '..fffdffff..',
  '...ffffff...',
];

// Horned quadruped (unicorn, rhino, buffalo): f=body, d=dark, e=eye, t=tail, h=horn
const HORNED = [
  '..........h.',
  '.tt......h..',
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

// Long low reptile (crocodile): f=body, d=scutes, e=eye, t=tail
const LONG = [
  '............',
  '............',
  '............',
  '............',
  '.........fe.',
  'tffffffffffd',
  'ddfdfdfdffff',
  '..d..d..d.d.',
  '............',
  '............',
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
  crab: CRAB,
  turtle: TURTLE,
  ghost: GHOST,
  fairy: FAIRY,
  snowman: SNOWMAN,
  horned: HORNED,
  long: LONG,
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
  cat: { template: 'quadruped', palette: { f: '#e0a050', d: '#a86a2a', e: '#3fbf4f', t: '#a86a2a' } },
  dog: { template: 'quadruped', palette: { f: '#b88a5a', d: '#7a5530', e: '#1c1c1c', t: '#7a5530' } },
  cow: { template: 'horned', palette: { f: '#f2efe6', d: '#2c2622', e: '#1c1c1c', t: '#2c2622', h: '#e8dcc0' } },
  pig: { template: 'quadruped', palette: { f: '#f0a8b0', d: '#c8747e', e: '#1c1c1c', t: '#c8747e' } },
  crab: { template: 'crab', palette: { f: '#d8503a', d: '#a83224', e: '#111111' } },
  frog: { template: 'critter', palette: { f: '#5cae3a', e: '#111111', w: '#3c7a24' } },
  penguin: { template: 'fowl', palette: { f: '#26262e', w: '#f2f2f2', e: '#f2f2f2', d: '#f0a830' } },
  turtle: { template: 'turtle', palette: { f: '#6a8a3a', d: '#3e5a22', s: '#a8b860', e: '#111111' } },
  monkey: { template: 'humanoid', palette: { s: '#d8a878', h: '#7a4a24', b: '#8a5a2e', p: '#6a4020', e: '#1a1a1a' } },
  rat: { template: 'critter', palette: { f: '#8a8478', e: '#d03030', w: '#e8a0a8' } },
  crocodile: { template: 'long', palette: { f: '#4c7a3a', d: '#2e4e22', e: '#e8c33b', t: '#4c7a3a' } },
  piranha: { template: 'fish', palette: { f: '#c84a3a', d: '#7a2a20', e: '#f0e040' } },
  hyena: { template: 'quadruped', palette: { f: '#c8a870', d: '#5a4630', e: '#1c1c1c', t: '#5a4630' } },
  rhino: { template: 'horned', palette: { f: '#8a8a8e', d: '#5c5c60', e: '#1c1c1c', t: '#5c5c60', h: '#e8e0cc' } },
  buffalo: { template: 'horned', palette: { f: '#5a3e2a', d: '#3a281a', e: '#1c1c1c', t: '#3a281a', h: '#d8ccb0' } },
  unicorn: { template: 'horned', palette: { f: '#f6f2ff', d: '#c8b8f0', e: '#5a3aa8', t: '#e8a0f0', h: '#ffd84a' } },
  fairy: { template: 'fairy', palette: { w: '#c8f0ff', h: '#f0d060', s: '#f6d6c0', e: '#2a6ab0', b: '#7ad08a' } },
  ghost: { template: 'ghost', palette: { f: '#dfe8f0', e: '#20283a', d: '#20283a' } },
  mage: { template: 'humanoid', palette: { s: '#c8a890', h: '#3a1a5a', b: '#5a2a8a', p: '#3a1a5a', e: '#ff5ae0' } },
  druid: { template: 'humanoid', palette: { s: '#d8b088', h: '#e8e4d4', b: '#4a7a3a', p: '#3a5a2a', e: '#1a3a1a' } },
  alien: { template: 'humanoid', palette: { s: '#8ae06a', h: '#5ab04a', b: '#9aa8b8', p: '#6a7888', e: '#101010' } },
  snowman: { template: 'snowman', palette: { h: '#22222a', f: '#f4f8fc', e: '#1a1a1a', o: '#f08a2a', b: '#6a4a2a', d: '#1a1a1a' } },
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

/** The outline every creature wears. Near-black with a little warmth. */
const SPRITE_OUTLINE = '#1c130d';

/** Lighten (k > 1) or darken (k < 1) a #rrggbb colour. */
const shadeHex = (hex: string, k: number): string => {
  const n = parseInt(hex.slice(1, 7), 16);
  const channel = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

/**
 * The colour of every cell of a posed sprite, outline and shading included.
 *
 * Two things WorldBox does to every unit and the templates never did:
 *
 * A one-pixel dark outline round the silhouette. It is the single thing that
 * keeps a creature readable against any ground — a green orc on grass, a white
 * sheep on snow — and the painted map is now busy enough that without it the
 * sprites dissolved into the texture.
 *
 * Light on top, shade underneath and on the right, matching the map's light
 * from the top left. A flat fill reads as a sticker; two tones read as a body.
 *
 * Derived from the template rather than drawn into it, so every creature,
 * every colour ramp and every walk frame gets it with no art to maintain.
 * Exported so it can be tested without a canvas.
 */
export const shadedCells = (posed: string[], palette: Palette): (string | null)[][] => {
  const rows = posed.length;
  const cols = posed[0].length;
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < cols && y < rows && posed[y][x] !== '.';
  const cells: (string | null)[][] = [];
  for (let y = 0; y < rows; y += 1) {
    const row: (string | null)[] = [];
    for (let x = 0; x < cols; x += 1) {
      if (!solid(x, y)) {
        const touches = solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
        row.push(touches ? SPRITE_OUTLINE : null);
        continue;
      }
      const base = palette[posed[y][x]] ?? '#ff00ff';
      let k = 1;
      if (!solid(x, y - 1)) k = 1.14;
      else if (!solid(x, y + 1)) k = 0.8;
      else if (!solid(x + 1, y)) k = 0.88;
      row.push(k === 1 ? base : shadeHex(base, k));
    }
    cells.push(row);
  }
  return cells;
};

const drawGrid = (grid: string[], palette: Palette, frame: number): HTMLCanvasElement => {
  const cells = shadedCells(poseGrid(grid, frame), palette);
  const rows = cells.length;
  const cols = cells[0].length;
  const scale = 8;
  const canvas = document.createElement('canvas');
  canvas.width = cols * scale;
  canvas.height = rows * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const colour = cells[y][x];
      if (!colour) continue;
      ctx.fillStyle = colour;
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
export function getPixelSpriteTexture(
  type: EntityType, subspecies?: string | null,
): THREE.CanvasTexture {
  return getPixelSpriteFrames(type, subspecies)[0];
}

/**
 * The four-frame walk cycle for a creature type, built once and cached.
 *
 * Frame 0 is the standing pose, so anything that wants a single still image can
 * take the first entry and be right.
 */
/**
 * What a person is wearing, which changes their sprite.
 *
 * WorldBox's soldiers wear their trade: a helmet and mail, so an army reads
 * as an army before you read a single icon. Rulers wear a crown.
 */
export type Outfit = 'warrior' | 'ruler' | null;

/** Colours an outfit paints over the humanoid template's hair and shirt. */
const OUTFITS: Record<'warrior' | 'ruler', Palette> = {
  warrior: { h: '#9aa2ad', b: '#6f7884' },
  ruler: { h: '#f2c230' },
};

/** True for creatures whose body can hold a sword: anything on the humanoid frame. */
export const wieldsGear = (type: EntityType): boolean => (SPECS[type] ?? SPECS.human).template === 'humanoid';

/**
 * Where each weapon sits on the humanoid frame, as [x, y, cell]. The right
 * hand is at (10, 8), so every shape is held there and stands up the empty
 * column beside the body. `w` is the working part, drawn in the item's
 * material; `g` is the grip.
 */
const WEAPON_PIXELS: Record<WeaponKind, Array<[number, number, string]>> = {
  sword: [[11, 2, 'w'], [11, 3, 'w'], [11, 4, 'w'], [11, 5, 'w'], [11, 6, 'w'], [10, 7, 'g'], [11, 7, 'g'], [11, 8, 'g']],
  axe: [[11, 2, 'g'], [11, 3, 'g'], [11, 4, 'g'], [11, 5, 'g'], [11, 6, 'g'], [11, 7, 'g'], [11, 8, 'g'], [10, 2, 'w'], [10, 3, 'w'], [10, 4, 'w']],
  spear: [[11, 0, 'w'], [11, 1, 'w'], [11, 2, 'g'], [11, 3, 'g'], [11, 4, 'g'], [11, 5, 'g'], [11, 6, 'g'], [11, 7, 'g'], [11, 8, 'g']],
  hammer: [[10, 2, 'w'], [11, 2, 'w'], [10, 3, 'w'], [11, 3, 'w'], [11, 4, 'g'], [11, 5, 'g'], [11, 6, 'g'], [11, 7, 'g'], [11, 8, 'g']],
  bow: [[10, 3, 'w'], [11, 4, 'w'], [11, 5, 'w'], [11, 6, 'w'], [11, 7, 'w'], [10, 8, 'w']],
};

/** What a creature's gear looks like: only the parts that change the sprite. */
export interface GearLook {
  weapon: WeaponKind | null;
  weaponMaterial: Material | null;
  armor: Material | null;
}

export const gearLook = (gear: Equipment | undefined): GearLook | null => {
  if (!gear || (!gear.weapon && !gear.armor)) return null;
  return {
    weapon: gear.weapon ? gear.weapon.kind as WeaponKind : null,
    weaponMaterial: gear.weapon?.material ?? null,
    armor: gear.armor?.material ?? null,
  };
};

const lookKey = (look: GearLook | null): string =>
  look ? `|${look.weapon ?? ''}.${look.weaponMaterial ?? ''}.${look.armor ?? ''}` : '';

/** Darken a hex colour for the helmet, which sits in shadow under the light. */
const helmOf = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  const k = 0.8;
  const c = (v: number) => Math.round(v * k).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
};

const withWeapon = (grid: string[], kind: WeaponKind): string[] => {
  const rows = grid.map(row => row.split(''));
  for (const [x, y, cell] of WEAPON_PIXELS[kind]) {
    if (rows[y] && rows[y][x] === '.') rows[y][x] = cell;
  }
  return rows.map(row => row.join(''));
};

export function getPixelSpriteFrames(
  type: EntityType, subspecies?: string | null, outfit: Outfit = null, gear: GearLook | null = null,
): THREE.CanvasTexture[] {
  // Keyed on the colouring as well as the kind, so a snow wolf and a sable one
  // are two cached sets of four rather than one set repainted per creature.
  // With fourteen ramps and twenty kinds the whole cache is still small enough
  // to be worth never evicting.
  const ramp = rampById(subspecies);
  const spec = SPECS[type] ?? SPECS.human;
  // Outfits only fit the humanoid template; on anything else they are ignored.
  const worn = outfit && spec.template === 'humanoid' ? outfit : null;
  const look = spec.template === 'humanoid' ? gear : null;
  const key = `${ramp ? `${type}:${ramp.id}` : type}${worn ? `+${worn}` : ''}${lookKey(look)}`;

  const cached: THREE.CanvasTexture[] = [];
  for (let frame = 0; frame < WALK_FRAMES; frame += 1) {
    const hit = textureCache.get(`${key}:${frame}`);
    if (!hit) break;
    cached.push(hit);
  }
  if (cached.length === WALK_FRAMES) return cached;

  const grid = look?.weapon ? withWeapon(TEMPLATES[spec.template], look.weapon) : TEMPLATES[spec.template];
  const coloured = ramp ? applyRamp(spec.palette, ramp) : spec.palette;
  let palette = worn ? { ...coloured, ...OUTFITS[worn] } : coloured;
  if (look) {
    palette = { ...palette, g: '#5e3b1f' };
    if (look.weaponMaterial) palette.w = MATERIAL_COLOR[look.weaponMaterial];
    // Armour shows as the body in its metal, and a helmet unless a crown is worn.
    if (look.armor) {
      palette.b = MATERIAL_COLOR[look.armor];
      if (worn !== 'ruler') palette.h = helmOf(MATERIAL_COLOR[look.armor]);
    }
  }

  const frames: THREE.CanvasTexture[] = [];
  for (let frame = 0; frame < WALK_FRAMES; frame += 1) {
    const texture = makeTexture(drawGrid(grid, palette, frame));
    textureCache.set(`${key}:${frame}`, texture);
    frames.push(texture);
  }
  return frames;
}
