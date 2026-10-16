import { describe, expect, it } from 'vitest';
import { World } from '../world';
import { TileFlag, WorldGrid } from './grid';
import { tileTypes, topLayers } from './tiles';

describe('tile types', () => {
  it('assigns dense stable indices and knows the biome set', () => {
    tileTypes.all().forEach((t, i) => expect(t.index).toBe(i));
    for (const id of ['deep_ocean', 'river', 'grassland', 'mountains', 'wasteland']) expect(tileTypes.has(id)).toBe(true);
    expect(tileTypes.get('ocean').walkable).toBe(false);
    expect(tileTypes.get('grassland').walkable).toBe(true);
    expect(topLayers.get('none').index).toBe(0);
  });
});

describe('WorldGrid', () => {
  it('keeps the coordinate surface', () => {
    const g = new WorldGrid(5, 4);
    expect(g.size).toBe(20);
    expect(g.index(3, 2)).toBe(13);
    expect([g.xOf(13), g.yOf(13)]).toEqual([3, 2]);
    expect(g.inBounds(4, 3)).toBe(true);
    expect(g.inBounds(5, 0)).toBe(false);
    expect(g.width).toBe(5);
    expect(g.height).toBe(4);
  });

  it('stores typed fields and derives flags from the type', () => {
    const g = new WorldGrid(4, 4);
    const i = g.index(1, 1);
    expect(g.typeIdOf(i)).toBe('deep_ocean');
    expect(g.isLiquid(i)).toBe(true);
    g.setType(i, 'grassland');
    expect(g.isLiquid(i)).toBe(false);
    expect(g.isWalkable(i)).toBe(true);
    g.setHeight(i, 0.5);
    expect(g.heights[i]).toBeCloseTo(0.5);
    g.setTopLayer(i, 'mature_tree');
    expect(g.topLayerOf(i)).toBe('mature_tree');
    g.setResource(i, 'iron', 7);
    expect([g.resourceOf(i), g.resourceAmounts[i]]).toEqual(['iron', 7]);
    g.setCity(i, 3);
    g.setBuilding(i, 9);
    expect([g.cityIds[i], g.buildingIds[i]]).toEqual([3, 9]);
    g.setFire(i, 40);
    expect(g.isOnFire(i)).toBe(true);
    g.setFire(i, 0);
    expect(g.isOnFire(i)).toBe(false);
    g.setRoad(i, true);
    expect(g.hasFlag(i, TileFlag.Road)).toBe(true);
    expect(() => g.setType(i, 'nope')).toThrow();
  });

  it('batches dirty indices and only marks real changes', () => {
    const g = new WorldGrid(4, 4);
    expect(g.dirtyCount).toBe(0);
    g.setHeight(5, 0.3);
    g.setHeight(5, 0.3);
    g.setHeight(5, 0.4);
    g.setType(2, 'grassland');
    g.setType(2, 'grassland');
    expect(g.drainDirty()).toEqual([5, 2]);
    expect(g.drainDirty()).toEqual([]);
    g.setHeight(5, 0.9);
    expect(g.drainDirty()).toEqual([5]);
  });

  it('emits one tile:changed per dirty tile through the events hook', () => {
    const world = new World({ seed: 1, width: 4, height: 4 });
    const seen: string[] = [];
    world.events.on('tile:changed', (d) => seen.push(`${d.x},${d.y}`));
    const owners: number[] = [];
    world.events.on('tile:owner', (d) => owners.push(d.cityId));
    world.grid.setType(5, 'grassland');
    world.grid.setHeight(5, 0.5);
    world.grid.setCity(6, 2);
    expect(seen).toEqual([]);
    expect(world.grid.emitDirty()).toBe(2);
    expect(seen).toEqual(['1,1', '2,1']);
    expect(owners).toEqual([2]);
    expect(world.grid.dirtyCount).toBe(0);
  });

  it('lists clipped neighbours', () => {
    const g = new WorldGrid(3, 3);
    expect(g.neighbors(g.index(0, 0))).toEqual([1, 3]);
    expect(g.neighbors(g.index(1, 1), true)).toHaveLength(8);
    expect(g.neighbors(g.index(0, 0), true)).toHaveLength(3);
  });

  it('labels walkable regions and relabels after terrain changes', () => {
    const g = new WorldGrid(6, 3);
    // Two land columns separated by water at x=3.
    for (let y = 0; y < 3; y++) {
      for (const x of [0, 1, 2, 4, 5]) g.setType(g.index(x, y), 'grassland');
    }
    expect(g.regionCount).toBe(2);
    const left = g.index(0, 0);
    const right = g.index(5, 2);
    expect(g.sameRegion(left, right)).toBe(false);
    expect(g.regionSize(g.regionOf(left))).toBe(9);
    expect(g.regionOf(g.index(3, 1))).toBe(0);
    g.setType(g.index(3, 1), 'beach');
    expect(g.regionCount).toBe(1);
    expect(g.sameRegion(left, right)).toBe(true);
    g.setWalkable(g.index(3, 1), false);
    expect(g.regionCount).toBe(2);
  });

  it('does not join regions across a diagonal touch', () => {
    const g = new WorldGrid(2, 2);
    g.setType(0, 'grassland');
    g.setType(3, 'grassland');
    expect(g.regionCount).toBe(2);
  });
});
