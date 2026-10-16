// Ore you can see.
//
// The generator used to sprinkle minerals across a third of the land as
// invisible numbers on tiles — iron under every second meadow, gold in the
// marsh — and nothing drew them, so a world rich in ore looked like a world
// with none. WorldBox does the opposite: ore sits in a few visible patches in
// the hills and mountains, gold and gems are rare enough to be worth walking
// to, and mithril and adamantine are found only where the land is extreme.
//
// So the scattered minerals are swept up and laid back down as veins: small
// clusters of deposits, picked by biome, that the map paints and miners dig.

import { biomeTable } from '../content/biomes';
import type { BiomeType, ResourceType, Tile } from '../types/world';

/** The minerals that form veins. Stone, wood and food are not deposits. */
export const ORE_TYPES = ['iron', 'silver', 'gold', 'gem', 'crystal', 'mithril', 'adamantine'] as const;
export type OreType = typeof ORE_TYPES[number];

const ORE_SET = new Set<string>(ORE_TYPES);
/** The old scattered minerals, swept up before the veins are laid. */
const SCATTERED = new Set<string>(['iron', 'silver', 'gold', 'gem', 'crystal', 'coal', 'mana', 'mithril', 'adamantine']);

export const isOre = (type: string): type is OreType => ORE_SET.has(type);

/** A deposit worth drawing: anything with ore still in it. */
export const depositOf = (tile: Tile): OreType | null => {
  for (const resource of tile.resources) {
    if (resource.quantity > 0 && isOre(resource.type)) return resource.type;
  }
  return null;
};

/** What each biome yields, as weighted choices. Absent biomes grow no ore. */
const VEIN_TABLE: Partial<Record<BiomeType, Array<[OreType, number]>>> = biomeTable(def => def.ore);

/** How much each deposit holds: rare metal comes in small seams. */
const RICHNESS: Record<OreType, [number, number]> = {
  iron: [14, 28],
  silver: [10, 20],
  gold: [8, 16],
  gem: [5, 10],
  crystal: [8, 16],
  mithril: [5, 9],
  adamantine: [3, 7],
};

/** About one vein per this many land tiles. */
const LAND_PER_VEIN = 140;

/** The vein layer's own dice, so laying ore never moves anyone else's rolls. */
const dice = (seed: number): (() => number) => {
  let state = (seed ^ 0x0e5e1e5) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = (table: Array<[OreType, number]>, roll: number): OreType => {
  const total = table.reduce((sum, [, w]) => sum + w, 0);
  let left = roll * total;
  for (const [ore, weight] of table) {
    left -= weight;
    if (left <= 0) return ore;
  }
  return table[table.length - 1][0];
};

/**
 * Sweep the scattered minerals off every tile and lay veins instead. Returns
 * how many deposits were placed. Deterministic in `seed`, so a save that
 * regenerates the world from its seed gets the same ore back.
 */
export const seedOreVeins = (tiles: Tile[][], seed: number): number => {
  const random = dice(seed);
  const size = tiles.length;
  const candidates: Tile[] = [];
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      const tile = tiles[x][y];
      tile.resources = tile.resources.filter(r => !SCATTERED.has(r.type));
      if (VEIN_TABLE[tile.type]) candidates.push(tile);
    }
  }
  if (candidates.length === 0) return 0;

  let land = 0;
  for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) if (tiles[x][y].height > 0.3) land++;
  const veins = Math.max(4, Math.round(land / LAND_PER_VEIN));

  let placed = 0;
  for (let v = 0; v < veins; v++) {
    const heart = candidates[Math.floor(random() * candidates.length)];
    const table = VEIN_TABLE[heart.type];
    if (!table) continue;
    const ore = pick(table, random());
    const [lo, hi] = RICHNESS[ore];
    // A vein is a few deposits in a clump; rarer ore, smaller clump.
    const length = ore === 'adamantine' || ore === 'mithril' ? 2 + Math.floor(random() * 2) : 3 + Math.floor(random() * 4);
    let x = heart.x;
    let y = heart.y;
    for (let step = 0; step < length; step++) {
      const tile = tiles[x]?.[y];
      if (tile && VEIN_TABLE[tile.type] && !tile.resources.some(r => isOre(r.type))) {
        tile.resources.push({ type: ore as ResourceType, quantity: lo + Math.floor(random() * (hi - lo + 1)), discovered: false });
        placed++;
      }
      x = Math.max(0, Math.min(size - 1, x + Math.floor(random() * 3) - 1));
      y = Math.max(0, Math.min(size - 1, y + Math.floor(random() * 3) - 1));
    }
  }
  return placed;
};

/** What a load of each ore is worth to a town, by where it goes. */
export const ORE_VALUE: Record<OreType, { metal?: number; gold?: number; gems?: number; mithril?: number; adamantine?: number }> = {
  iron: { metal: 2 },
  silver: { metal: 1, gold: 2 },
  gold: { gold: 6 },
  gem: { gems: 1, gold: 4 },
  crystal: { gems: 1, gold: 2 },
  mithril: { mithril: 1 },
  adamantine: { adamantine: 1 },
};
