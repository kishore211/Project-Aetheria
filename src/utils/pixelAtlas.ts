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

// Redrawn the way WorldBox draws its buildings: a dark outline round every
// shape, roofs split into a lit left half and a shaded right half (the light
// comes from the top left, as it does on the painted map), walls with a shaded
// side, and warm lit windows. Flat single-colour shapes read as icons; an
// outline and two tones read as a *building* at eight pixels a tile.
const OUTLINE = '#24180f';
const FIRE: Palette = { f: '#ff8a2b', o: '#ffe066', r: '#6b4a2a', k: OUTLINE };
const CLOTH: Palette = { c: '#e6dcc0', d: '#b8a882', e: '#4a3f2c', k: OUTLINE };
const BUILD: Palette = {
  R: '#d0683e', r: '#923e26', w: '#eee3c8', v: '#bfae8a', y: '#ffd76a', d: '#4a3220', b: '#c8452f', k: OUTLINE,
};
const CROP: Palette = { r: '#7a5434', g: '#86b443', y: '#ecd35e', k: '#5a3e24' };
const MASON: Palette = { s: '#c4c7cc', d: '#8a8f97', n: '#1d1f24', b: '#c8452f', k: OUTLINE };
const HOLY: Palette = { O: '#f6eccc', o: '#cdbd92', w: '#ece6d4', v: '#bdb59c', y: '#f4c430', k: OUTLINE };
const MONUMENT: Palette = { s: '#d2d5da', d: '#8e9299', k: OUTLINE };
const HULL: Palette = { w: '#f4f0e4', r: '#8a5a32', y: '#ffd76a', k: OUTLINE };
const SHAFT: Palette = { s: '#a8aeb4', d: '#737980', r: '#7a5432', n: '#121215', k: OUTLINE };

const BUILDING_ART: Record<string, AtlasEntry> = {
  bonfire: {
    palette: FIRE,
    grid: [
      '............',
      '.....f......',
      '....fof.....',
      '...ffoff....',
      '...foooff...',
      '....ffff....',
      '..kr.kk.rk..',
      '..krrrrrrk..',
      '...krrrrk...',
      '..kr.kk.rk..',
      '............',
      '............',
    ],
  },
  tent: {
    palette: CLOTH,
    grid: [
      '............',
      '.....k......',
      '....kck.....',
      '...kccdk....',
      '...kccddk...',
      '..kcccdddk..',
      '..kcccdddk..',
      '.kcccedddk..',
      '.kcceeeddk..',
      '.kkkkkkkkkk.',
      '............',
      '............',
    ],
  },
  house: {
    palette: BUILD,
    grid: [
      '............',
      '.....kk.....',
      '....kRrk....',
      '...kRRrrk...',
      '..kRRRrrrk..',
      '.kRRRRrrrrk.',
      '.kkkkkkkkkk.',
      '..kwwwwvvk..',
      '..kwyywvyk..',
      '..kwwddvvk..',
      '..kwwddvvk..',
      '..kkkkkkkk..',
    ],
  },
  hall: {
    palette: BUILD,
    grid: [
      '.....kb.....',
      '.....kbb....',
      '...kkkkkk...',
      '..kRRRRrrk..',
      '.kRRRRRrrrk.',
      'kRRRRRRrrrrk',
      'kkkkkkkkkkkk',
      '.kwywwwvyvk.',
      '.kwywwwvyvk.',
      '.kwwwddvvvk.',
      '.kwwwddvvvk.',
      '.kkkkkkkkkk.',
    ],
  },
  farm: {
    palette: CROP,
    grid: [
      '............',
      '............',
      '.kkkkkkkkkk.',
      '.krgrgrgrgk.',
      '.kgygygygyk.',
      '.krgrgrgrgk.',
      '.kgygygygyk.',
      '.krgrgrgrgk.',
      '.kgygygygyk.',
      '.kkkkkkkkkk.',
      '............',
      '............',
    ],
  },
  tower: {
    palette: MASON,
    grid: [
      '..ksksksdk..',
      '..kssssddk..',
      '..kkkkkkkk..',
      '...kssddk...',
      '...ksnndk...',
      '...kssddk...',
      '...kssddk...',
      '...ksnndk...',
      '...kssddk...',
      '..ksssdddk..',
      '..kkkkkkkk..',
      '............',
    ],
  },
  temple: {
    palette: HOLY,
    grid: [
      '.....y......',
      '....kyk.....',
      '...kOOok....',
      '..kOOOook...',
      '.kOOOOoook..',
      'kkkkkkkkkkk.',
      '.kwkwkvkvk..',
      '.kwkwkvkvk..',
      '.kwkwkvkvk..',
      'kkkkkkkkkkk.',
      'kwwwwwvvvvk.',
      'kkkkkkkkkkk.',
    ],
  },
  statue: {
    palette: MONUMENT,
    grid: [
      '.....kk.....',
      '....kssk....',
      '....ksdk....',
      '..kkksdkkk..',
      '..kssssddk..',
      '...kkssdkk..',
      '....kssdk...',
      '....ksk.dk..',
      '...kkkkkkk..',
      '..ksssssddk.',
      '..kkkkkkkkk.',
      '............',
    ],
  },
  mine: {
    palette: SHAFT,
    grid: [
      '............',
      '....kkkk....',
      '...ksssdk...',
      '..kssssddk..',
      '.ksssrrrddk.',
      '.kssrnnnrdk.',
      'kssrnnnnnrdk',
      'kssrnnnnnrdk',
      'kkkkkkkkkkkk',
      '............',
      '............',
      '............',
    ],
  },
  boat: {
    palette: HULL,
    grid: [
      '............',
      '.....k......',
      '.....kw.....',
      '.....kww....',
      '.....kwww...',
      '.....kwwww..',
      '.....k......',
      '.kkkkkkkkkk.',
      '.krrrrrrrrk.',
      '..krrrrrrk..',
      '...kkkkkk...',
      '............',
    ],
  },
  transport: {
    palette: HULL,
    grid: [
      '............',
      '..k....k....',
      '..kw...kw...',
      '..kww..kww..',
      '..kwww.kwww.',
      '..k....k....',
      'kkkkkkkkkkkk',
      'krrrrrrrrrrk',
      '.krryrryrrk.',
      '..krrrrrrk..',
      '...kkkkkk...',
      '............',
    ],
  },
  ruins: {
    palette: MASON,
    grid: [
      '............',
      '............',
      '..k......k..',
      '.ksk.kk.kdk.',
      '.ksk.kdkkdk.',
      '.ksdkkdkkdk.',
      '.ksdk.....k.',
      'kkdkk.k..kdk',
      'ksssddddsdk.',
      'kkkkkkkkkkk.',
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
  // A spark over the head: something in there is awake that was not before.
  uplifted: {
    palette: ICON_INK,
    grid: [
      '.....oo.....',
      '....oyyo....',
      '....oyyo....',
      '..o.oyyo.o..',
      '.oyooyyooyo.',
      '..oyyyyyyo..',
      '.oyooyyooyo.',
      '..o.oyyo.o..',
      '....oyyo....',
      '....oyyo....',
      '.....oo.....',
      '............',
    ],
  },
  // -- tools in hand --
  //
  // Drawn head-light and haft-brown, because the material tint is
  // multiplicative: a near-white head takes the colour cleanly and the haft
  // stays wood whatever the head is made of, which is also true of the object.
  // Shape carries the job and colour carries the tier, so the two never have to
  // compete for the same pixels.
  tool_axe: {
    palette: ICON_INK,
    grid: [
      '............',
      '..oooo......',
      '.owwwwo.....',
      '.owwwwwo....',
      '.owwwwo.....',
      '..oono......',
      '...onno.....',
      '....onno....',
      '.....onno...',
      '......oo....',
      '............',
      '............',
    ],
  },
  tool_pick: {
    palette: ICON_INK,
    grid: [
      '............',
      '.oo......oo.',
      '.owo....owo.',
      '..owoooowo..',
      '...owwwwo...',
      '....onno....',
      '....onno....',
      '....onno....',
      '....onno....',
      '.....oo.....',
      '............',
      '............',
    ],
  },
  tool_hammer: {
    palette: ICON_INK,
    grid: [
      '............',
      '..oooooo....',
      '.owwwwwwo...',
      '.owwwwwwo...',
      '.owwwwwwo...',
      '..ooonoo....',
      '....onno....',
      '....onno....',
      '....onno....',
      '.....oo.....',
      '............',
      '............',
    ],
  },
  tool_blade: {
    palette: ICON_INK,
    grid: [
      '.....oo.....',
      '....owwo....',
      '....owwo....',
      '....owwo....',
      '....owwo....',
      '....owwo....',
      '..oooooooo..',
      '..onnnnnno..',
      '....onno....',
      '....onno....',
      '.....oo.....',
      '............',
    ],
  },
  // -- mood --
  //
  // Only the four strong moods get a pixel face. The two middle bands (content
  // and glum) deliberately have none: a face over every head at all times is
  // wallpaper, and the point of an icon is that noticing one means something.
  // The inspector shows all six.
  mood_delighted: {
    palette: ICON_INK,
    grid: [
      '...oooooo...',
      '..oyyyyyyo..',
      '.oyyyyyyyyo.',
      'oyyoyyyyoyyo',
      'oyyoyyyyoyyo',
      'oyyyyyyyyyyo',
      'oyooooooooyo',
      'oyywwwwwwyyo',
      '.oyyooooyyo.',
      '..oyyyyyyo..',
      '...oooooo...',
      '............',
    ],
  },
  mood_happy: {
    palette: ICON_INK,
    grid: [
      '...oooooo...',
      '..oyyyyyyo..',
      '.oyyyyyyyyo.',
      'oyyoyyyyoyyo',
      'oyyoyyyyoyyo',
      'oyyyyyyyyyyo',
      'oyoyyyyyyoyo',
      'oyyooooooyyo',
      '.oyyyyyyyyo.',
      '..oyyyyyyo..',
      '...oooooo...',
      '............',
    ],
  },
  mood_sad: {
    palette: ICON_INK,
    grid: [
      '...oooooo...',
      '..obbbbbbo..',
      '.obbbbbbbbo.',
      'obbobbbbobbo',
      'obbobbbbobbo',
      'obbbbbbbbbbo',
      'obbbbbbbbbbo',
      'obbboooobbbo',
      '.obboooobbo.',
      '..obbbbbbo..',
      '...oooooo...',
      '............',
    ],
  },
  mood_miserable: {
    palette: ICON_INK,
    grid: [
      '...oooooo...',
      '..oppppppo..',
      '.opppppppppo',
      'oppoppppoppo',
      'opbopppppbpo',
      'opbpppppppbo',
      'oppboooobppo',
      'oppbooooobpo',
      '.oppooooopo.',
      '..oppppppo..',
      '...oooooo...',
      '............',
    ],
  },
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
