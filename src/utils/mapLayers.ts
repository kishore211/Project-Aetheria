// Ways of looking at the world.
//
// WorldBox's Noosphere tab is sixty-odd "powers" that are really one idea:
// every kind of meta the simulation tracks can be painted onto the map, and
// you flip between them. It is the single biggest gap between their interface
// and ours (06-WORLDBOX-COMPLETE-REFERENCE.md §3), because it turns the map
// from a picture of the world into an instrument for asking it questions.
//
// Ours paints what our simulation actually knows. Every layer here answers a
// question a player has genuinely asked while looking at this game: why is
// nobody living there, why did that kingdom grow that way, where is the good
// land.
import * as THREE from 'three';

export type MapLayer =
  | 'natural'
  | 'political'
  | 'alliance'
  | 'village'
  | 'culture'
  | 'language'
  | 'religion'
  | 'height'
  | 'rainfall'
  | 'temperature'
  | 'fertility';

/** Layers that paint a group identity rather than a quantity. */
export type IdentityLayer = 'culture' | 'language' | 'religion';

export const isIdentityLayer = (layer: MapLayer): layer is IdentityLayer =>
  layer === 'culture' || layer === 'language' || layer === 'religion';

export interface MapLayerInfo {
  id: MapLayer;
  label: string;
  /** What question it answers. */
  hint: string;
  /** Legend, low value first. */
  legend: [string, string];
}

export const MAP_LAYERS: MapLayerInfo[] = [
  {
    id: 'natural', label: 'Natural', hint: 'The world as it looks.',
    legend: ['', ''],
  },
  {
    id: 'political', label: 'Borders', hint: 'Whose land is whose — the world drains to grey so the claims read.',
    legend: ['unclaimed', 'claimed'],
  },
  {
    id: 'alliance', label: 'Alliances', hint: 'Who stands with whom — allied realms share one colour.',
    legend: ['', ''],
  },
  {
    id: 'village', label: 'Towns', hint: 'Which town each stretch of land answers to.',
    legend: ['', ''],
  },
  {
    id: 'culture', label: 'Culture', hint: 'Who thinks of themselves as the same people.',
    legend: ['', ''],
  },
  {
    id: 'language', label: 'Tongue', hint: 'Who can understand whom.',
    legend: ['', ''],
  },
  {
    id: 'religion', label: 'Faith', hint: 'Who prays to the same thing.',
    legend: ['', ''],
  },
  {
    id: 'height', label: 'Height', hint: 'Elevation, from trench to peak.',
    legend: ['deep', 'peak'],
  },
  {
    id: 'rainfall', label: 'Rainfall', hint: 'Where the water falls. Forests follow it.',
    legend: ['arid', 'soaked'],
  },
  {
    id: 'temperature', label: 'Warmth', hint: 'Cold poles, hot middle. Decides who can live where.',
    legend: ['frozen', 'scorching'],
  },
  {
    id: 'fertility', label: 'Fertility', hint: 'Where food grows. Villages are founded on this.',
    legend: ['barren', 'lush'],
  },
];

/**
 * Colour ramps, as stops sampled at even intervals.
 *
 * Deliberately not rainbow, and deliberately monotonic in lightness. A rainbow
 * has no natural ordering, so the reader keeps consulting the legend; worse, a
 * ramp that brightens in the middle makes its two extremes look alike, which
 * is exactly the confusion a legend cannot fix. The first draft of the
 * fertility ramp did that — barren grey-brown and lush green landed within
 * 0.013 lightness of each other — and the test below now catches it.
 *
 * Running light-to-dark or dark-to-light throughout also means these stay
 * readable in greyscale, which is most of what colour-blind accessibility
 * amounts to for a heat map.
 *
 * Temperature is the one exception, and it is a hue ramp on purpose: cold blue
 * to hot red is established strongly enough that fighting it would be the
 * confusing choice.
 */
/** Only the four quantity layers have ramps; identity layers use meta colours. */
const RAMPS: Record<'height' | 'rainfall' | 'temperature' | 'fertility', string[]> = {
  // Trench to snowline: dark water up through land to bright peaks.
  height: ['#0b1a3a', '#1a3f68', '#2f6b8e', '#5c8f72', '#8fa762', '#c2bd93', '#f2f2f5'],
  // Bleached dry ground down to deep water.
  rainfall: ['#efe4c4', '#dbcf9f', '#b9c98d', '#86bb96', '#4fa8a6', '#2b7f9e', '#1b4f79'],
  // Hue ramp, see above.
  temperature: ['#9ad3f0', '#6fb2e0', '#8fd0a8', '#ddd08a', '#e59a52', '#cf5b3a', '#8f2020'],
  // Dead soil up to bright growth.
  fertility: ['#332f2b', '#46423a', '#5f6142', '#7c8a4c', '#9aae55', '#b6cf62', '#d6ef79'],
};

const parsed = Object.fromEntries(
  Object.entries(RAMPS).map(([layer, stops]) => [layer, stops.map(hex => new THREE.Color(hex))]),
) as Record<keyof typeof RAMPS, THREE.Color[]>;

/**
 * Sample a layer's ramp at `value` (0-1) into `target`.
 *
 * Interpolates between neighbouring stops rather than snapping to the nearest.
 * Snapping produces visible contour bands, which look like the data is
 * quantised when it is not.
 */
export const sampleRamp = (
  layer: keyof typeof RAMPS,
  value: number,
  target: THREE.Color,
): THREE.Color => {
  const stops = parsed[layer];
  const clamped = Math.max(0, Math.min(1, value));
  const scaled = clamped * (stops.length - 1);
  const low = Math.floor(scaled);
  const high = Math.min(stops.length - 1, low + 1);
  return target.copy(stops[low]).lerp(stops[high], scaled - low);
};

/** Does this layer replace the terrain colours with a ramp? */
export const isDataLayer = (layer: MapLayer): layer is keyof typeof RAMPS =>
  layer === 'height' || layer === 'rainfall'
  || layer === 'temperature' || layer === 'fertility';

/** Does this layer drain the terrain so an overlay can be read on top? */
export const drainsTerrain = (layer: MapLayer): boolean =>
  layer === 'political' || layer === 'alliance' || layer === 'village' || isIdentityLayer(layer);

export const nextLayer = (current: MapLayer, step: number): MapLayer => {
  const order = MAP_LAYERS.map(entry => entry.id);
  const at = Math.max(0, order.indexOf(current));
  return order[(at + step + order.length) % order.length];
};
