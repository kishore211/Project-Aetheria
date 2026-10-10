// Kingdom banners.
//
// A WorldBox kingdom is a flag before it is a name: a field, a division and a
// charge, generated once and carried everywhere the kingdom appears
// (06-WORLDBOX-COMPLETE-REFERENCE.md §5, Kingdoms). A coloured square tells
// you two realms are different; a banner with a wolf's head on a split field
// tells you which one is which after you have seen it twice.
//
// Everything is derived from the kingdom's id, so a banner never needs saving
// and is the same every time the world is loaded.

/** 5x5 charges. `#` is drawn in the secondary colour. */
export const CHARGES: Record<string, string[]> = {
  crown: ['#.#.#', '#####', '#####', '.....', '#####'],
  sword: ['..#..', '..#..', '..#..', '#####', '..#..'],
  tree: ['.###.', '#####', '.###.', '..#..', '.###.'],
  star: ['..#..', '#####', '.###.', '.#.#.', '#...#'],
  moon: ['.###.', '##...', '#....', '##...', '.###.'],
  skull: ['.###.', '#.#.#', '#####', '.###.', '.#.#.'],
  tower: ['#.#.#', '#####', '.###.', '.#.#.', '.###.'],
  axe: ['.##..', '###..', '.##..', '..#..', '..#..'],
  sun: ['#.#.#', '.###.', '##.##', '.###.', '#.#.#'],
  hammer: ['#####', '#####', '..#..', '..#..', '..#..'],
};

/** Which charges suit which people, so a dwarf realm tends to hammers and towers. */
const RACE_CHARGES: Record<string, string[]> = {
  human: ['crown', 'sword', 'tower', 'sun', 'star'],
  elf: ['tree', 'moon', 'star', 'sun'],
  dwarf: ['hammer', 'axe', 'tower', 'crown'],
  orc: ['skull', 'axe', 'sword', 'moon'],
};

/** The metal each people favours for its charges. */
const RACE_METAL: Record<string, string> = {
  human: '#f2c230', elf: '#e8eef2', dwarf: '#d09a4a', orc: '#e6dcc6',
};

export type Division = 'plain' | 'pale' | 'fess' | 'chevron' | 'cross' | 'bend' | 'bordure';
const DIVISIONS: Division[] = ['plain', 'pale', 'fess', 'chevron', 'cross', 'bend', 'bordure'];

export interface Banner {
  field: string;
  /** The second tincture, used by the division. */
  second: string;
  metal: string;
  division: Division;
  charge: string;
}

/** FNV-1a, enough to spread kingdom ids over a handful of choices. */
const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const shade = (hex: string, k: number): string => {
  const n = parseInt(hex.slice(1, 7), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
};

/** The banner for a kingdom. Pure: the same id always gives the same flag. */
export const bannerFor = (id: string, color: string, race: string): Banner => {
  const h = hash(id);
  const charges = RACE_CHARGES[race] ?? Object.keys(CHARGES);
  return {
    field: color,
    second: shade(color, 0.55),
    metal: RACE_METAL[race] ?? '#f2ead8',
    division: DIVISIONS[h % DIVISIONS.length],
    charge: charges[(h >>> 8) % charges.length],
  };
};

const W = 12;
const H = 16;

/**
 * The banner as a grid of colours (null is transparent), 12 wide and 16 tall:
 * a crossbar, a field with a swallowtail, and the charge in the middle.
 */
export const bannerPixels = (banner: Banner): (string | null)[][] => {
  const ink = '#1c130d';
  const rows: (string | null)[][] = [];
  for (let y = 0; y < H; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < W; x++) {
      // The crossbar and its finials.
      if (y === 0) { row.push(x === 0 || x === W - 1 ? banner.metal : ink); continue; }
      // The field occupies columns 1-10, rows 1-15, with a notch cut up the bottom.
      const inField = x >= 1 && x <= W - 2 && y >= 1 && y <= H - 1;
      const notch = y >= H - 3 && Math.abs(x - (W - 1) / 2) < (y - (H - 4)) * 0.9;
      if (!inField || notch) { row.push(null); continue; }
      const edge = x === 1 || x === W - 2 || y === H - 1
        || (y >= H - 3 && Math.abs(x - (W - 1) / 2) < (y - (H - 4)) * 0.9 + 1);
      if (edge) { row.push(ink); continue; }
      const fx = (x - 2) / (W - 5);
      const fy = (y - 1) / (H - 3);
      let second = false;
      switch (banner.division) {
        case 'pale': second = fx >= 0.5; break;
        case 'fess': second = fy >= 0.5; break;
        case 'chevron': second = fy > 0.55 - Math.abs(fx - 0.5) * 0.7 && fy < 0.85 - Math.abs(fx - 0.5) * 0.7; break;
        case 'cross': second = Math.abs(fx - 0.5) < 0.14 || Math.abs(fy - 0.42) < 0.1; break;
        case 'bend': second = Math.abs(fx - fy) < 0.18; break;
        case 'bordure': second = x === 2 || x === W - 3 || y === 2; break;
        default: break;
      }
      row.push(second ? banner.second : banner.field);
    }
    rows.push(row);
  }
  // The charge, centred in the upper field.
  const glyph = CHARGES[banner.charge] ?? CHARGES.star;
  const ox = Math.floor((W - 5) / 2);
  const oy = 4;
  glyph.forEach((line, gy) => {
    for (let gx = 0; gx < line.length; gx++) {
      if (line[gx] === '#') rows[oy + gy][ox + gx] = banner.metal;
    }
  });
  return rows;
};

const cache = new Map<string, string>();

/**
 * A data URL of the banner at `scale` canvas pixels per art pixel, cached.
 * Empty when there is no 2D canvas (tests), and the UI falls back to a swatch.
 */
export const bannerDataUrl = (id: string, color: string, race: string, scale = 3): string => {
  const key = `${id}|${color}|${race}|${scale}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let url = '';
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      bannerPixels(bannerFor(id, color, race)).forEach((row, y) => row.forEach((c, x) => {
        if (!c) return;
        ctx.fillStyle = c;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }));
      url = canvas.toDataURL();
    }
  }
  cache.set(key, url);
  return url;
};
