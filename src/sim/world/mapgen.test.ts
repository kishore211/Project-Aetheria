import { describe, expect, it } from 'vitest';
import { World } from '../world';
import { WorldGrid } from './grid';
import { WORLD_TEMPLATES, determineBiome, generateMap, type WorldTemplate } from './mapgen';
import { SimplexNoise } from './noise';

const SIZE = 64;
const make = (seed: number, template?: WorldTemplate, size = SIZE): WorldGrid => {
  const g = new WorldGrid(size, size);
  generateMap(g, { seed, template });
  return g;
};
const waterFraction = (g: WorldGrid): number => {
  let w = 0;
  for (let i = 0; i < g.size; i++) if (g.typeOf(i).liquid) w++;
  return w / g.size;
};
const same = (a: WorldGrid, b: WorldGrid): boolean => {
  for (const k of ['heights', 'moistures', 'fertilities', 'temperatures', 'typeIds', 'topLayerIds', 'resourceIds', 'resourceAmounts', 'fuel', 'flags'] as const) {
    const x = a[k];
    const y = b[k];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  }
  return true;
};

describe('determineBiome', () => {
  it.each([
    [0.1, 0.5, 0.5, 'deep_ocean'],
    [0.2, 0.5, 0.5, 'ocean'],
    [0.26, 0.5, 0.8, 'beach'],
    [0.9, 0.5, 0.1, 'snow'],
    [0.9, 0.5, 0.8, 'volcanic'],
    [0.5, 0.1, 0.8, 'desert'],
    [0.5, 0.8, 0.8, 'rainforest'],
    [0.5, 0.7, 0.5, 'deciduous_forest'],
  ] as const)('maps %s/%s/%s to %s', (h, m, t, expected) => {
    expect(determineBiome(h, m, t)).toBe(expected);
  });
});

describe('SimplexNoise', () => {
  it('is seeded and bounded', () => {
    const a = new SimplexNoise(5);
    const b = new SimplexNoise(5);
    const c = new SimplexNoise(6);
    let differs = false;
    for (let i = 0; i < 50; i++) {
      const v = a.noise2D(i * 0.37, i * 0.11);
      expect(v).toBe(b.noise2D(i * 0.37, i * 0.11));
      expect(Math.abs(v)).toBeLessThanOrEqual(1.01);
      if (v !== c.noise2D(i * 0.37, i * 0.11)) differs = true;
    }
    expect(differs).toBe(true);
  });
});

describe('generateMap', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    expect(same(make(99), make(99))).toBe(true);
    const a = make(1);
    const b = make(2);
    let diff = 0;
    for (let i = 0; i < a.size; i++) if (a.typeIds[i] !== b.typeIds[i]) diff++;
    expect(diff).toBeGreaterThan(300);
  });

  it('leaves no pending dirty tiles and consistent flags', () => {
    const g = make(3);
    expect(g.dirtyCount).toBe(0);
    for (let i = 0; i < g.size; i++) {
      expect(g.isWalkable(i)).toBe(g.typeOf(i).walkable);
      expect(g.isLiquid(i)).toBe(g.typeOf(i).liquid);
    }
  });

  it('gives every template sensible land and water', () => {
    for (const template of Object.keys(WORLD_TEMPLATES) as WorldTemplate[]) {
      const water = waterFraction(make(1234, template));
      expect(water, template).toBeGreaterThan(0.05);
      expect(water, template).toBeLessThan(0.95);
    }
  });

  it('makes archipelagos wetter than pangaea', () => {
    expect(waterFraction(make(1234, 'archipelago'))).toBeGreaterThan(waterFraction(make(1234, 'pangaea')));
  });

  it('carves fresh water inland on highlands', () => {
    const g = make(7, 'highlands');
    let fresh = 0;
    for (let i = 0; i < g.size; i++) {
      const id = g.typeIdOf(i);
      if (id === 'river' || id === 'lake') fresh++;
    }
    expect(fresh).toBeGreaterThan(0);
  });

  it('grades coasts: deep water never touches shallow, open ocean is unwalkable', () => {
    const g = make(11, 'highlands');
    for (let i = 0; i < g.size; i++) {
      const id = g.typeIdOf(i);
      if (id === 'ocean' || id === 'deep_ocean') expect(g.isWalkable(i)).toBe(false);
      if (id === 'deep_ocean') for (const j of g.neighbors(i)) expect(g.typeIdOf(j)).not.toBe('shallow_water');
    }
  });

  it('populates cover and resources and labels islands', () => {
    const g = make(5, 'continents');
    let cover = 0;
    let res = 0;
    for (let i = 0; i < g.size; i++) {
      if (g.topLayerIds[i]) cover++;
      if (g.resourceIds[i]) res++;
      expect(g.heights[i]).toBeGreaterThanOrEqual(0);
      expect(g.heights[i]).toBeLessThanOrEqual(1);
    }
    expect(cover).toBeGreaterThan(50);
    expect(res).toBeGreaterThan(50);
    expect(g.regionCount).toBeGreaterThan(0);
  });

  it('matches when generating from a world rng seeded the same way', () => {
    const world = new World({ seed: 42, width: SIZE, height: SIZE });
    generateMap(world.grid, { seed: 42, template: 'islands', rng: world.rng });
    expect(same(world.grid, make(42, 'islands'))).toBe(true);
  });
});
