// Colour ramps, and the variety you get for almost nothing.
//
// Phase 19.1, and by some distance the best variety-per-byte on the plan.
// WorldBox got its entire creature range out of 52 From→To colour pairs
// applied to greyscale art: one wolf sprite, a dozen wolves. This does the
// same thing to sprites that are already coloured, by *relighting* rather than
// recolouring — every palette entry is reduced to its brightness and that
// brightness is then read off a two-stop ramp. The shading survives, the hue
// is replaced, and one drawing becomes a species.
//
// Eyes are the one thing held back. Remap them too and a creature loses the
// only high-contrast feature it has, and a field of wolves stops being wolves
// and becomes a field of coloured smudges. That single exception is most of
// what makes this read as art rather than as a filter.
import type { EntityType, Tile } from '../types/world';

type Palette = Record<string, string>;

export interface Ramp {
  id: string;
  /** Adjective, used to name the creature: "a snow wolf". */
  label: string;
  /** Darkest and lightest stop, as hex. Everything between is interpolated. */
  from: string;
  to: string;
  /**
   * The climate this colouring belongs in, 0-1 on the tile's own temperature
   * scale. A white coat is not a random choice; it is a cold one.
   */
  climate: number;
}

export const RAMPS: Ramp[] = [
  { id: 'snow', label: 'snow', from: '#7d8794', to: '#f6f9fc', climate: 0.05 },
  { id: 'ashen', label: 'ashen', from: '#4a4f58', to: '#c2c8d1', climate: 0.18 },
  { id: 'grey', label: 'grey', from: '#3f434a', to: '#a9aeb6', climate: 0.35 },
  { id: 'sable', label: 'sable', from: '#1c1d22', to: '#6b6d76', climate: 0.4 },
  { id: 'roan', label: 'roan', from: '#5a4048', to: '#c2a3a8', climate: 0.45 },
  { id: 'chestnut', label: 'chestnut', from: '#4a2a15', to: '#c98a52', climate: 0.55 },
  { id: 'russet', label: 'russet', from: '#5c2a12', to: '#d97a3c', climate: 0.6 },
  { id: 'dun', label: 'dun', from: '#6b5730', to: '#e0cb96', climate: 0.72 },
  { id: 'golden', label: 'golden', from: '#7a5c14', to: '#f2cf62', climate: 0.8 },
  { id: 'ochre', label: 'ochre', from: '#6d4212', to: '#ddaa4c', climate: 0.85 },
  { id: 'verdant', label: 'verdant', from: '#1f3d1c', to: '#7fbf5a', climate: 0.65 },
  { id: 'azure', label: 'azure', from: '#16324f', to: '#6fb3e8', climate: 0.3 },
  { id: 'crimson', label: 'crimson', from: '#4a0f12', to: '#d8434a', climate: 0.9 },
  { id: 'violet', label: 'violet', from: '#2e1a44', to: '#a276d6', climate: 0.5 },
];

const RAMP_BY_ID = new Map(RAMPS.map(ramp => [ramp.id, ramp]));

export const rampById = (id: string | null | undefined): Ramp | null =>
  (id ? RAMP_BY_ID.get(id) ?? null : null);

/**
 * Which colourings each creature can come in.
 *
 * Not every ramp on every creature: a violet sheep is a joke that stops being
 * funny the second time, and the whole point is that a colour should tell you
 * something. Monsters get the strange ones because on a monster the strange
 * ones are information.
 */
export const RAMPS_FOR: Partial<Record<EntityType, string[]>> = {
  wolf: ['snow', 'ashen', 'grey', 'sable', 'russet'],
  bear: ['sable', 'chestnut', 'russet', 'snow', 'ashen'],
  deer: ['chestnut', 'russet', 'dun', 'ashen'],
  rabbit: ['snow', 'ashen', 'grey', 'dun', 'chestnut'],
  fox: ['russet', 'snow', 'ashen', 'golden'],
  sheep: ['snow', 'ashen', 'grey', 'sable'],
  chicken: ['snow', 'russet', 'golden', 'sable'],
  bird: ['azure', 'ashen', 'golden', 'crimson', 'sable'],
  snake: ['verdant', 'sable', 'dun', 'crimson'],
  fish: ['azure', 'ashen', 'golden'],
  dragon: ['crimson', 'sable', 'verdant', 'azure', 'golden', 'violet'],
  demon: ['crimson', 'violet', 'sable'],
  zombie: ['verdant', 'ashen', 'violet'],
  skeleton: ['snow', 'ashen', 'dun'],
  elemental: ['azure', 'crimson', 'verdant', 'violet'],
  bandit: ['sable', 'ashen', 'chestnut'],
};

/** Perceived brightness, 0-1. The whole ramp turns on getting this right. */
const luminance = (hex: string): number => {
  const value = parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  // Rec. 601 weights: green carries most of what the eye calls brightness, and
  // an unweighted average turns a red creature and a green one into the same
  // grey, which collapses exactly the distinctions this is trying to preserve.
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

const mix = (from: string, to: string, t: number): string => {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const lerp = (shift: number) => {
    const low = (a >> shift) & 255;
    const high = (b >> shift) & 255;
    return Math.round(low + (high - low) * t);
  };
  const hex = (lerp(16) << 16) | (lerp(8) << 8) | lerp(0);
  return `#${hex.toString(16).padStart(6, '0')}`;
};

/** Keys never remapped, because they carry the silhouette rather than colour. */
const KEEP = new Set(['e']);

/**
 * Relight a palette along a ramp.
 *
 * The brightness range is stretched to fill the ramp rather than used raw:
 * most of these palettes live in the middle of the scale, and mapping them
 * straight through gives a creature made of one flat mid-tone with all its
 * shading gone.
 */
export const applyRamp = (palette: Palette, ramp: Ramp): Palette => {
  const keys = Object.keys(palette).filter(key => !KEEP.has(key));
  if (keys.length === 0) return { ...palette };

  const levels = keys.map(key => luminance(palette[key]));
  const low = Math.min(...levels);
  const high = Math.max(...levels);
  const span = high - low;

  const out: Palette = { ...palette };
  keys.forEach((key, index) => {
    const t = span < 0.01 ? 0.5 : (levels[index] - low) / span;
    out[key] = mix(ramp.from, ramp.to, t);
  });
  return out;
};

/**
 * Pick a colouring for a creature being born somewhere.
 *
 * Weighted by how well the ramp suits the climate, so white coats turn up in
 * the snow and russet ones in the woods — but only weighted, never forced. A
 * black wolf in the snow should be uncommon and not impossible, and the ones
 * that turn up in the wrong place are the ones you remember.
 */
export const pickRamp = (
  type: EntityType,
  tile: Pick<Tile, 'temperature' | 'type'> | null,
  random: () => number = Math.random,
): string | null => {
  const allowed = RAMPS_FOR[type];
  if (!allowed || allowed.length === 0) return null;

  const climate = tile ? tile.temperature : 0.5;
  const weights = allowed.map((id) => {
    const ramp = RAMP_BY_ID.get(id);
    if (!ramp) return 0;
    // A floor of 0.15 is what keeps the unlikely ones possible.
    return 0.15 + Math.max(0, 1 - Math.abs(ramp.climate - climate) * 2);
  });

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return allowed[0];
  let roll = random() * total;
  for (let i = 0; i < allowed.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return allowed[i];
  }
  return allowed[allowed.length - 1];
};

/** "snow wolf", or just "wolf" for the kinds that do not vary. */
export const describeCreature = (type: EntityType, subspecies?: string | null): string => {
  const ramp = rampById(subspecies);
  const name = type.replace(/_/g, ' ');
  return ramp ? `${ramp.label} ${name}` : name;
};
