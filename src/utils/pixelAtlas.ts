// Procedural pixel-art texture atlases, drawn on canvas at runtime.
// Nothing here loads a file: every sprite in Aetheria is authored as a small
// character grid and rasterised into one atlas so it can be drawn by a single
// GPU point cloud (see spriteCloud.ts).
import * as THREE from 'three';

type Palette = Record<string, string>;

interface AtlasEntry {
  grid: string[];
  palette: Palette;
}

export interface Atlas {
  texture: THREE.Texture;
  /** Atlas grid dimensions in cells. */
  cols: number;
  rows: number;
  /** Slot index by name. */
  slots: Record<string, number>;
}

const PIXEL = 4; // canvas pixels per art pixel

/** Rasterise a set of named sprites into one nearest-filtered atlas texture. */
const buildAtlas = (entries: Record<string, AtlasEntry>): Atlas => {
  const names = Object.keys(entries);
  const cols = Math.ceil(Math.sqrt(names.length));
  const rows = Math.ceil(names.length / cols);
  const cell = 12 * PIXEL; // every grid is 12x12

  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d');

  const slots: Record<string, number> = {};
  names.forEach((name, index) => {
    slots[name] = index;
    if (!ctx) return;
    const { grid, palette } = entries[name];
    const originX = (index % cols) * cell;
    const originY = Math.floor(index / cols) * cell;
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const key = grid[y][x];
        if (key === '.') continue;
        ctx.fillStyle = palette[key] ?? '#ff00ff';
        ctx.fillRect(originX + x * PIXEL, originY + y * PIXEL, PIXEL, PIXEL);
      }
    }
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  // Sampled with gl_PointCoord, which runs top-down like the canvas.
  texture.flipY = false;

  return { texture, cols, rows, slots };
};

// ---------------------------------------------------------------------------
// Terrain decoration: what makes a flat colour map read as a living landscape.
// ---------------------------------------------------------------------------

const FOLIAGE: Palette = { g: '#3f7d34', d: '#2b5a24', r: '#5b3d24', y: '#9fc45a' };
const CONIFER: Palette = { g: '#2f6136', d: '#1f4325', r: '#4a3320' };
const STONE: Palette = { s: '#9aa0a6', d: '#6d7378' };
const SAND_LIFE: Palette = { g: '#5f9e46', d: '#3f7030' };
const WETLAND: Palette = { g: '#7ba03f', d: '#4c6b26' };
const PALM_PAL: Palette = { g: '#4f9e4a', r: '#7a5a32' };
const DEAD: Palette = { r: '#7d6448' };
const ARCANE: Palette = { c: '#4fd8d0', w: '#d9fbff' };

const DETAIL_ART: Record<string, AtlasEntry> = {
  tree: {
    palette: FOLIAGE,
    grid: [
      '....gggg....',
      '...gggggg...',
      '..gggddggg..',
      '..gggggggg..',
      '.gggddggggg.',
      '..gggggggg..',
      '...gggggg...',
      '....grrg....',
      '.....rr.....',
      '.....rr.....',
      '....rrrr....',
      '............',
    ],
  },
  pine: {
    palette: CONIFER,
    grid: [
      '.....gg.....',
      '....gggg....',
      '.....gg.....',
      '....gggg....',
      '...gggggg...',
      '....dddd....',
      '...gggggg...',
      '..gggggggg..',
      '...dddddd...',
      '.....rr.....',
      '....rrrr....',
      '............',
    ],
  },
  rock: {
    palette: STONE,
    grid: [
      '............',
      '............',
      '....ssss....',
      '...ssssss...',
      '..ssddssss..',
      '..ssssssdd..',
      '.dssssssdd..',
      '.ddssssdddd.',
      '..dddddddd..',
      '............',
      '............',
      '............',
    ],
  },
  cactus: {
    palette: SAND_LIFE,
    grid: [
      '............',
      '.....gg.....',
      '..g..gg..g..',
      '..g..gg..g..',
      '..ggggggg...',
      '.....gg.....',
      '.....gg.....',
      '....gggg....',
      '....dddd....',
      '............',
      '............',
      '............',
    ],
  },
  reed: {
    palette: WETLAND,
    grid: [
      '............',
      '............',
      '..g...g..g..',
      '..g..gd..g..',
      '.gd..gd.gd..',
      '.gd.dgd.gd..',
      '.gd.dgd.gd..',
      'ddd.ddd.ddd.',
      '............',
      '............',
      '............',
      '............',
    ],
  },
  palm: {
    palette: PALM_PAL,
    grid: [
      '..gg....gg..',
      '.gggg..gggg.',
      '..ggggggg...',
      '....grg.....',
      '.....rr.....',
      '.....rr.....',
      '.....rr.....',
      '....rr......',
      '....rr......',
      '...rrr......',
      '............',
      '............',
    ],
  },
  deadwood: {
    palette: DEAD,
    grid: [
      '............',
      '..r......r..',
      '...r....r...',
      '....r..r....',
      '.....rr.....',
      '..r..rr..r..',
      '...r.rr.r...',
      '....rrrr....',
      '.....rr.....',
      '.....rr.....',
      '....rrrr....',
      '............',
    ],
  },
  crystal: {
    palette: ARCANE,
    grid: [
      '............',
      '.....w......',
      '....wcw.....',
      '...wccw.....',
      '...wcccw....',
      '..wcccw.....',
      '..wcccw..w..',
      '..wccw..wcw.',
      '..wccw..wcw.',
      '...ww...ww..',
      '............',
      '............',
    ],
  },
};

// ---------------------------------------------------------------------------
// Civilization: village buildings, drawn in the owning kingdom's colour tint.
// ---------------------------------------------------------------------------

const FIRE: Palette = { f: '#ff8a2b', o: '#ffe066', r: '#6b4a2a' };
const CLOTH: Palette = { c: '#d8cfb8', d: '#b3a889', e: '#4a3f2c' };
const BUILD: Palette = { o: '#8c4a2f', w: '#d9cdb4', y: '#f2d98b', d: '#3a2c1e', b: '#c8452f' };
const CROP: Palette = { r: '#6b4a30', g: '#7fae3f', y: '#e8cf5c' };
const MASON: Palette = { s: '#b9bcc2', d: '#7c8189', b: '#c8452f' };
const HOLY: Palette = { o: '#e8e2d0', w: '#cfc9b6', y: '#f4d35e' };
const MONUMENT: Palette = { s: '#c6c9cf', d: '#82868d' };
const SHAFT: Palette = { s: '#9aa0a6', r: '#6b4a2a', k: '#1b1b20' };

const BUILDING_ART: Record<string, AtlasEntry> = {
  bonfire: {
    palette: FIRE,
    grid: [
      '............',
      '.....f......',
      '....fof.....',
      '...ffoff....',
      '...ffoof....',
      '....fff.....',
      '..r.....r...',
      '..rrrrrrr...',
      '...rrrrr....',
      '..r.....r...',
      '............',
      '............',
    ],
  },
  tent: {
    palette: CLOTH,
    grid: [
      '............',
      '.....d......',
      '....ddd.....',
      '...ccddc....',
      '..cccddcc...',
      '..cccddcc...',
      '.ccccddcccc.',
      '.cccceeeccc.',
      'ccccceeeeccc',
      '............',
      '............',
      '............',
    ],
  },
  house: {
    palette: BUILD,
    grid: [
      '............',
      '............',
      '....oooo....',
      '...oooooo...',
      '..oooooooo..',
      '.oooooooooo.',
      '..wwwwwwww..',
      '..wyywwyyw..',
      '..wwwwwwww..',
      '..wwwddwww..',
      '..wwwddwww..',
      '............',
    ],
  },
  hall: {
    palette: BUILD,
    grid: [
      '.....b......',
      '.....b......',
      '...oooooo...',
      '..oooooooo..',
      '.oooooooooo.',
      'oooooooooooo',
      '.wwwwwwwwww.',
      '.wyywwwwyyw.',
      '.wwwwwwwwww.',
      '.wwwwddwwww.',
      '.wwwwddwwww.',
      '............',
    ],
  },
  farm: {
    palette: CROP,
    grid: [
      '............',
      '............',
      '............',
      '..y.y.y.y...',
      '..g.g.g.g...',
      '..g.g.g.g...',
      '.rrrrrrrrr..',
      '.rrrrrrrrr..',
      '.rrrrrrrrr..',
      '............',
      '............',
      '............',
    ],
  },
  tower: {
    palette: MASON,
    grid: [
      '...b....b...',
      '...ssssss...',
      '...ssddss...',
      '...ssssss...',
      '....ssss....',
      '....sdds....',
      '....ssss....',
      '....sdds....',
      '....ssss....',
      '...ssssss...',
      '............',
      '............',
    ],
  },
  temple: {
    palette: HOLY,
    grid: [
      '............',
      '.....y......',
      '....ooo.....',
      '...ooooo....',
      '..ooooooo...',
      '.ooooooooo..',
      '..w.w.w.w...',
      '..w.w.w.w...',
      '..w.w.w.w...',
      '.wwwwwwwww..',
      '............',
      '............',
    ],
  },
  statue: {
    palette: MONUMENT,
    grid: [
      '............',
      '.....ss.....',
      '....ssss....',
      '.....ss.....',
      '..s.ssss.s..',
      '..sssssss...',
      '....ssss....',
      '....ssss....',
      '....ssss....',
      '...dddddd...',
      '..dddddddd..',
      '............',
    ],
  },
  mine: {
    palette: SHAFT,
    grid: [
      '............',
      '............',
      '...ssssss...',
      '..ssssssss..',
      '..srrrrrrs..',
      '..srkkkkrs..',
      '..srkkkkrs..',
      '..srkkkkrs..',
      '.ssrkkkkrss.',
      '............',
      '............',
      '............',
    ],
  },
  ruins: {
    palette: MASON,
    grid: [
      '............',
      '............',
      '..s......s..',
      '..s.s..s.s..',
      '..s.s..s.s..',
      '..d.d..d.d..',
      '.ss.....ss..',
      '.dd..d..dd..',
      '.dddddddddd.',
      '............',
      '............',
      '............',
    ],
  },
};

let detailAtlas: Atlas | null = null;
let buildingAtlas: Atlas | null = null;

/** Atlas of natural decorations (trees, rocks, reeds…). */
export const getDetailAtlas = (): Atlas => {
  if (!detailAtlas) detailAtlas = buildAtlas(DETAIL_ART);
  return detailAtlas;
};

/** Atlas of civilization structures (bonfire, houses, towers…). */
export const getBuildingAtlas = (): Atlas => {
  if (!buildingAtlas) buildingAtlas = buildAtlas(BUILDING_ART);
  return buildingAtlas;
};


// ---------------------------------------------------------------------------
// HUD icons drawn above units: what they are doing, and who they are.
// These are the single biggest "the world is alive" signal in WorldBox — you
// can read a whole village at a glance without clicking anything.
// ---------------------------------------------------------------------------

const ICON_INK: Palette = {
  o: '#12161d', // outline
  w: '#f4f1e6', // light fill
  y: '#f2c14e', // gold
  r: '#c8452f', // red
  g: '#5aa64f', // green
  b: '#4f8fd6', // blue
  p: '#a86fd0', // violet
  s: '#9aa0a6', // steel
  n: '#7a5a32', // wood/brown
};

const ICON_ART: Record<string, AtlasEntry> = {
  // -- tasks --
  gathering: {
    palette: ICON_INK,
    grid: [
      '............',
      '....gg......',
      '...grrg.....',
      '..grrrrg....',
      '..grrrrg....',
      '...grrg.....',
      '..oooooo....',
      '..onnnno....',
      '..onnnno....',
      '..oooooo....',
      '............',
      '............',
    ],
  },
  hauling: {
    palette: ICON_INK,
    grid: [
      '............',
      '..oooooooo..',
      '..onnnnnno..',
      '..onoooono..',
      '..onoyyono..',
      '..onoyyono..',
      '..onoooono..',
      '..onnnnnno..',
      '..oooooooo..',
      '............',
      '............',
      '............',
    ],
  },
  building: {
    palette: ICON_INK,
    grid: [
      '............',
      '.......ooo..',
      '......ossso.',
      '.....osssso.',
      '.....ossso..',
      '....onno....',
      '...onno.....',
      '..onno......',
      '..ono.......',
      '..oo........',
      '............',
      '............',
    ],
  },
  fighting: {
    palette: ICON_INK,
    grid: [
      '..o......o..',
      '..so....os..',
      '...so..os...',
      '....soos....',
      '.....ss.....',
      '....syys....',
      '...so..os...',
      '..so....os..',
      '..o......o..',
      '............',
      '............',
      '............',
    ],
  },
  hunting: {
    palette: ICON_INK,
    grid: [
      '.........oo.',
      '........orro',
      '.......orro.',
      '..o...orro..',
      '..oo.orro...',
      '..ooooro....',
      '..oo.oo.....',
      '..o.........',
      '............',
      '............',
      '............',
      '............',
    ],
  },
  fleeing: {
    palette: ICON_INK,
    grid: [
      '....oooo....',
      '...oyyyyo...',
      '...oyooyo...',
      '...oyooyo...',
      '...oyooyo...',
      '...oyyyyo...',
      '...oyooyo...',
      '....oooo....',
      '...oyyyyo...',
      '....oooo....',
      '............',
      '............',
    ],
  },
  sleeping: {
    palette: ICON_INK,
    grid: [
      '............',
      '..oooooo....',
      '..oowwwo....',
      '.....owo....',
      '....owo.....',
      '...owo......',
      '..owwwoo....',
      '..oooooo....',
      '............',
      '.......oo...',
      '......owwo..',
      '.......oo...',
    ],
  },
  talking: {
    palette: ICON_INK,
    grid: [
      '..oooooooo..',
      '.owwwwwwwwo.',
      '.owoowoowwo.',
      '.owwwwwwwwo.',
      '.owwwwwwwwo.',
      '.owwwwwwwwo.',
      '.oooowwwwoo.',
      '....owwwo...',
      '...owwo.....',
      '...oo.......',
      '............',
      '............',
    ],
  },
  drinking: {
    palette: ICON_INK,
    grid: [
      '.....oo.....',
      '.....oo.....',
      '....obbo....',
      '....obbo....',
      '...obbbbo...',
      '...obbbbo...',
      '..obbbbbbo..',
      '..obbbbbbo..',
      '...obbbbo...',
      '....oooo....',
      '............',
      '............',
    ],
  },
  eating: {
    palette: ICON_INK,
    grid: [
      '............',
      '.....gg.....',
      '....ogo.....',
      '...orrro....',
      '..orrrrro...',
      '..orrrrro...',
      '..orrrrro...',
      '..orrrrro...',
      '...orrro....',
      '....ooo.....',
      '............',
      '............',
    ],
  },
  travelling: {
    palette: ICON_INK,
    grid: [
      '............',
      '............',
      '.....o......',
      '.....oo.....',
      '..oooooo....',
      '..owwwwoo...',
      '..oooooo....',
      '.....oo.....',
      '.....o......',
      '............',
      '............',
      '............',
    ],
  },
  marching: {
    palette: ICON_INK,
    grid: [
      '..o.........',
      '..oo........',
      '..orro......',
      '..orrrro....',
      '..orrrrrro..',
      '..orrrro....',
      '..orro......',
      '..oo........',
      '..o.........',
      '..o.........',
      '............',
      '............',
    ],
  },
  settling: {
    palette: ICON_INK,
    grid: [
      '............',
      '.....o......',
      '....ooo.....',
      '...ooyoo....',
      '..ooyyyoo...',
      '.ooyyyyyoo..',
      '..onnnnno...',
      '..onwwwno...',
      '..onwwwno...',
      '..ooooooo...',
      '............',
      '............',
    ],
  },
  // -- professions --
  king: {
    palette: ICON_INK,
    grid: [
      '............',
      '..o......o..',
      '..oo....oo..',
      '..oyo..oyo..',
      '..oyyoooyo..',
      '..oyyyyyyo..',
      '..oyyryyyo..',
      '..oyyyyyyo..',
      '..oooooooo..',
      '............',
      '............',
      '............',
    ],
  },
  leader: {
    palette: ICON_INK,
    grid: [
      '............',
      '..o......o..',
      '..oo....oo..',
      '..oso..oso..',
      '..ossoooso..',
      '..osssssso..',
      '..osssssso..',
      '..oooooooo..',
      '............',
      '............',
      '............',
      '............',
    ],
  },
  captain: {
    palette: ICON_INK,
    grid: [
      '..oooooooo..',
      '..orrrrrro..',
      '..orwwwrro..',
      '..orrrrrro..',
      '..orrrrrro..',
      '..oooooooo..',
      '..oo........',
      '..oo........',
      '..oo........',
      '..oo........',
      '............',
      '............',
    ],
  },
  warrior: {
    palette: ICON_INK,
    grid: [
      '.....oo.....',
      '.....so.....',
      '.....so.....',
      '.....so.....',
      '.....so.....',
      '..oooooooo..',
      '.....so.....',
      '.....so.....',
      '.....oo.....',
      '............',
      '............',
      '............',
    ],
  },
  // -- flags --
  favourite: {
    palette: ICON_INK,
    grid: [
      '............',
      '.....o......',
      '....oyo.....',
      '....oyo.....',
      'oooooyooooo.',
      '.oyyyyyyyo..',
      '..oyyyyyo...',
      '..oyyoyyo...',
      '.oyyo.oyyo..',
      '.oo....oo...',
      '............',
      '............',
    ],
  },
  plotting: {
    palette: ICON_INK,
    grid: [
      '..oooooooo..',
      '..owwwwwwo..',
      '..opwwwwpo..',
      '..owwwwwwo..',
      '..owppwwwo..',
      '..owwwwppo..',
      '..opwwwwwo..',
      '..owwwwwwo..',
      '..oooooooo..',
      '............',
      '............',
      '............',
    ],
  },
};

let iconAtlas: Atlas | null = null;

/** Atlas of HUD icons drawn above units (task, profession, flags). */
export const getIconAtlas = (): Atlas => {
  if (!iconAtlas) iconAtlas = buildAtlas(ICON_ART);
  return iconAtlas;
};

export type IconName = keyof typeof ICON_ART;

export type DetailName = keyof typeof DETAIL_ART;
export type BuildingArtName = keyof typeof BUILDING_ART;
