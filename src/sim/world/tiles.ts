/**
 * Tile content libraries: terrain types (biomes), top layers (vegetation and
 * other natural cover) and resource kinds.
 *
 * Each library entry also carries a small integer `index`, assigned in
 * registration order, which the grid stores in typed arrays. Index 0 is
 * reserved in the top-layer and resource libraries to mean "none". Indices are
 * stable for the life of the process; add new entries at the end so saved
 * indices stay valid.
 */
import { Library, type Asset } from '../core/library';

export type DepthClass = 'none' | 'shallow' | 'deep';

export interface TileType extends Asset {
  /** Small integer stored in the grid. Assigned by `defineTileType`. */
  readonly index: number;
  readonly liquid: boolean;
  readonly depth: DepthClass;
  /** Land walkers can stand on it. Wading across shallows is a pathfinding option. */
  readonly walkable: boolean;
  readonly buildable: boolean;
  /** Baseline fertility 0..1 (growth systems read it). */
  readonly fertility: number;
  /** 0..1 chance weight for catching fire. */
  readonly flammability: number;
  /** Multiplier on movement speed; path cost per tile is 1 / moveSpeed. */
  readonly moveSpeed: number;
  /** Damage dealt to an actor stepping on the tile. */
  readonly damageOnStep: number;
}

export type TileTypeDef = Omit<TileType, 'index'>;

export const tileTypes = new Library<TileType>('tileTypes');

export function defineTileType(def: TileTypeDef): TileType {
  return tileTypes.add({ ...def, index: tileTypes.size });
}

const water = (id: string, depth: DepthClass, moveSpeed: number): TileTypeDef => ({
  id,
  liquid: true,
  depth,
  walkable: false,
  buildable: false,
  fertility: 0,
  flammability: 0,
  moveSpeed,
  damageOnStep: 0,
});

const land = (
  id: string,
  p: { fertility: number; flammability: number; moveSpeed: number; buildable?: boolean; damageOnStep?: number },
): TileTypeDef => ({
  id,
  liquid: false,
  depth: 'none',
  walkable: true,
  buildable: p.buildable ?? true,
  fertility: p.fertility,
  flammability: p.flammability,
  moveSpeed: p.moveSpeed,
  damageOnStep: p.damageOnStep ?? 0,
});

// Water.
defineTileType(water('deep_ocean', 'deep', 0.05));
defineTileType(water('ocean', 'deep', 0.05));
defineTileType(water('shallow_water', 'shallow', 0.125));
defineTileType(water('river', 'shallow', 0.125));
defineTileType(water('lake', 'shallow', 0.125));
// Coast.
defineTileType(land('beach', { fertility: 0.1, flammability: 0, moveSpeed: 0.67 }));
defineTileType(land('rocky_shore', { fertility: 0, flammability: 0, moveSpeed: 0.67, buildable: false }));
// Temperate.
defineTileType(land('grassland', { fertility: 0.8, flammability: 0.5, moveSpeed: 1 }));
defineTileType(land('deciduous_forest', { fertility: 0.7, flammability: 0.7, moveSpeed: 0.77 }));
defineTileType(land('coniferous_forest', { fertility: 0.5, flammability: 0.8, moveSpeed: 0.77 }));
defineTileType(land('hills', { fertility: 0.5, flammability: 0.3, moveSpeed: 0.5 }));
defineTileType(land('mountains', { fertility: 0.1, flammability: 0, moveSpeed: 0.33, buildable: false }));
// Cold.
defineTileType(land('taiga', { fertility: 0.4, flammability: 0.6, moveSpeed: 0.77 }));
defineTileType(land('tundra', { fertility: 0.2, flammability: 0.2, moveSpeed: 0.8 }));
defineTileType(land('snow', { fertility: 0, flammability: 0, moveSpeed: 0.33, buildable: false }));
defineTileType(land('ice', { fertility: 0, flammability: 0, moveSpeed: 0.8, buildable: false }));
defineTileType(land('glacier', { fertility: 0, flammability: 0, moveSpeed: 0.33, buildable: false }));
// Dry.
defineTileType(land('desert', { fertility: 0.05, flammability: 0.1, moveSpeed: 0.67 }));
defineTileType(land('savanna', { fertility: 0.5, flammability: 0.7, moveSpeed: 1 }));
defineTileType(land('mesa', { fertility: 0.05, flammability: 0, moveSpeed: 0.6 }));
defineTileType(land('badlands', { fertility: 0.05, flammability: 0, moveSpeed: 0.67 }));
// Wet.
defineTileType(land('swamp', { fertility: 0.6, flammability: 0.2, moveSpeed: 0.4 }));
defineTileType(land('marsh', { fertility: 0.6, flammability: 0.2, moveSpeed: 0.4 }));
defineTileType(land('rainforest', { fertility: 0.9, flammability: 0.5, moveSpeed: 0.77 }));
defineTileType(land('tropical_forest', { fertility: 0.8, flammability: 0.6, moveSpeed: 0.77 }));
// Made by the world rather than generated.
defineTileType(land('ashland', { fertility: 0.1, flammability: 0, moveSpeed: 1 }));
defineTileType(land('salt_flat', { fertility: 0, flammability: 0, moveSpeed: 0.9 }));
defineTileType(land('bloom', { fertility: 1, flammability: 0.5, moveSpeed: 1 }));
defineTileType(land('volcanic', { fertility: 0.2, flammability: 0, moveSpeed: 0.5, buildable: false }));
defineTileType(land('corrupted', { fertility: 0, flammability: 0.2, moveSpeed: 0.8 }));
defineTileType(land('enchanted_forest', { fertility: 0.8, flammability: 0.4, moveSpeed: 0.77 }));
defineTileType(land('sky_island', { fertility: 0.5, flammability: 0.3, moveSpeed: 1 }));
// Seeded lands, only planted by a god.
defineTileType(land('candy', { fertility: 0.6, flammability: 0.3, moveSpeed: 1 }));
defineTileType(land('crystal', { fertility: 0, flammability: 0, moveSpeed: 0.7 }));
defineTileType(land('mushroom', { fertility: 0.7, flammability: 0.4, moveSpeed: 0.9 }));
defineTileType(land('infernal', { fertility: 0, flammability: 0, moveSpeed: 0.7, damageOnStep: 2 }));
defineTileType(land('wasteland', { fertility: 0.05, flammability: 0.1, moveSpeed: 0.9 }));

/** Natural cover on top of the terrain. Index 0 is "no layer". */
export interface TopLayerType extends Asset {
  readonly index: number;
  /** Initial burnable fuel (0..255) when the layer is placed by generation. */
  readonly fuel: number;
  readonly flammability: number;
}

export const topLayers = new Library<TopLayerType>('topLayers');
topLayers.add({ id: 'none', index: 0, fuel: 0, flammability: 0 });
export function defineTopLayer(def: Omit<TopLayerType, 'index'>): TopLayerType {
  return topLayers.add({ ...def, index: topLayers.size });
}
defineTopLayer({ id: 'sapling', fuel: 20, flammability: 0.6 });
defineTopLayer({ id: 'young_tree', fuel: 60, flammability: 0.7 });
defineTopLayer({ id: 'mature_tree', fuel: 120, flammability: 0.8 });
defineTopLayer({ id: 'ancient_tree', fuel: 200, flammability: 0.6 });
defineTopLayer({ id: 'bush', fuel: 30, flammability: 0.8 });
defineTopLayer({ id: 'rock_outcrop', fuel: 0, flammability: 0 });
defineTopLayer({ id: 'boulder', fuel: 0, flammability: 0 });
defineTopLayer({ id: 'ruins', fuel: 10, flammability: 0.1 });

/** Resource kinds a tile can hold. Index 0 is "none". */
export interface ResourceKind extends Asset {
  readonly index: number;
}

export const resourceKinds = new Library<ResourceKind>('resourceKinds');
resourceKinds.add({ id: 'none', index: 0 });
export function defineResourceKind(id: string): ResourceKind {
  return resourceKinds.add({ id, index: resourceKinds.size });
}
for (const id of [
  'wood', 'stone', 'food', 'water', 'iron', 'gold', 'silver', 'coal', 'crystal', 'gem',
  'mithril', 'adamantine', 'mana', 'ancient_artifact',
]) {
  defineResourceKind(id);
}
