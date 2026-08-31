import { describe, expect, it } from 'vitest';
import {
  DEEP_FREEZE, FIRE_HEAT_PER_SECOND, FREEZE, IGNITE, MELT, SCORCH, STRIP, THAW,
  addHeat, ambientOf, cascade, conduct, heatOf, relax,
} from './thermal';
import type { BiomeType, Tile } from '../types/world';

const makeTile = (type: BiomeType, temperature = 0.5): Tile => ({
  x: 0, y: 0,
  type,
  height: 0.5,
  moisture: 0.5,
  temperature,
  fertility: 0.5,
  walkable: true,
  resources: [],
  structure: null,
  ownerId: null,
  villageId: null,
  isOnFire: false,
} as unknown as Tile);

describe('the thermal scale', () => {
  it('keeps every rung clear of any climate on the map', () => {
    // The whole system falls apart if ordinary weather reaches a threshold: a
    // desert that sits above the ignition point is a desert permanently on
    // fire, which is exactly what pasting their numbers unrescaled would do.
    for (let climate = 0; climate <= 1; climate += 0.05) {
      const ambient = ambientOf(makeTile('grassland', climate));
      expect(ambient).toBeLessThan(IGNITE);
      expect(ambient).toBeGreaterThan(FREEZE);
    }
  });

  it('climbs in the order the ladder is written', () => {
    expect(THAW).toBeLessThan(IGNITE);
    expect(IGNITE).toBeLessThan(STRIP);
    expect(STRIP).toBeLessThan(SCORCH);
    expect(SCORCH).toBeLessThan(MELT);
    expect(DEEP_FREEZE).toBeLessThan(FREEZE);
  });

  it('holds a volcanic tile just under ignition', () => {
    // Near enough to be genuinely dangerous to the ground around it, not so
    // near that a volcano sets fire to itself for ever.
    const lava = ambientOf(makeTile('volcanic', 0.5));
    expect(lava).toBeLessThan(IGNITE);
    expect(lava).toBeGreaterThan(IGNITE - 20);
  });

  it('will not let the sea boil', () => {
    expect(ambientOf(makeTile('ocean', 1))).toBeLessThanOrEqual(12);
  });
});

describe('the cascade', () => {
  it('does nothing to a tile sitting at its own climate', () => {
    for (const type of ['grassland', 'desert', 'ocean', 'mountains'] as BiomeType[]) {
      expect(cascade(makeTile(type))).toBeNull();
    }
  });

  it('runs a field all the way to lava as the heat rises', () => {
    const field = makeTile('grassland');
    const seen: string[] = [];

    // One rung per call and highest first, so this walks the ladder rather
    // than skipping to the end.
    for (const heat of [IGNITE, STRIP, SCORCH, MELT]) {
      field.heat = heat;
      const change = cascade(field);
      expect(change).not.toBeNull();
      seen.push(change!.step);
      if (change!.became) field.type = change!.became;
      if (change!.ignites) field.isOnFire = true;
    }

    expect(seen).toEqual(['ignite', 'strip', 'scorch', 'melt']);
    expect(field.type).toBe('volcanic');
  });

  it('leaves ash where a forest burned, not badlands', () => {
    // The two look the same on a chart and are completely different things:
    // badlands is land that was always poor, ash is land that was rich this
    // morning. The map should be able to tell you which you are looking at.
    const wood = makeTile('deciduous_forest');
    wood.heat = STRIP;
    expect(cascade(wood)!.became).toBe('ashland');
  });

  it('boils a lake to salt and leaves the ocean alone', () => {
    const lake = makeTile('lake');
    lake.heat = STRIP + 10;
    expect(cascade(lake)!.became).toBe('salt_flat');

    // There is too much ocean, and a sea that evaporates because one meteor
    // landed in it is a sea nobody believes in.
    const sea = makeTile('deep_ocean');
    sea.heat = MELT * 2;
    expect(cascade(sea)).toBeNull();
  });

  it('runs the same ladder downward into ice', () => {
    const field = makeTile('grassland');
    field.heat = FREEZE;
    expect(cascade(field)!.became).toBe('snow');
    field.heat = DEEP_FREEZE;
    expect(cascade(field)!.became).toBe('glacier');
  });

  it('thaws snow and does not thaw a field', () => {
    const drift = makeTile('snow', 0.1);
    drift.heat = THAW + 1;
    expect(cascade(drift)!.step).toBe('thaw');

    const field = makeTile('grassland');
    field.heat = THAW + 1;
    expect(cascade(field)).toBeNull();
  });

  it('does not re-ignite a tile that is already burning', () => {
    const wood = makeTile('deciduous_forest');
    wood.heat = IGNITE + 5;
    expect(cascade(wood)!.ignites).toBe(true);
    wood.isOnFire = true;
    expect(cascade(wood)).toBeNull();
  });

  it('announces only the two ends, so an eruption is not a wall of text', () => {
    const noisy: string[] = [];
    for (const [type, heat] of [
      ['grassland', IGNITE], ['grassland', STRIP], ['grassland', SCORCH],
      ['desert', MELT], ['grassland', FREEZE], ['grassland', DEEP_FREEZE],
    ] as Array<[BiomeType, number]>) {
      const tile = makeTile(type);
      tile.heat = heat;
      const change = cascade(tile);
      if (change?.note) noisy.push(change.step);
    }
    expect(noisy).toEqual(['melt', 'deep_freeze']);
  });
});

describe('heat moving around', () => {
  it('forgets, and stops carrying a number once it has', () => {
    const field = makeTile('grassland');
    addHeat(field, 100);
    expect(field.heat).toBeGreaterThan(90);

    for (let i = 0; i < 400; i += 1) relax(field, 1);
    // Undefined rather than "close to ambient": a tile that has cooled should
    // go back to reading its climate directly, with no stale second copy.
    expect(field.heat).toBeUndefined();
    expect(heatOf(field)).toBe(ambientOf(field));
  });

  it('moves heat from the hot tile to the cold one and no further', () => {
    const hot = makeTile('grassland');
    const cold = makeTile('grassland');
    addHeat(hot, 200);
    const before = heatOf(hot) + heatOf(cold);

    for (let i = 0; i < 50; i += 1) conduct(hot, cold, 1);

    // Conduction is a transfer, not a source: the pair's total must hold.
    expect(heatOf(hot) + heatOf(cold)).toBeCloseTo(before, 6);
    // ...and it evens out rather than overshooting into a runaway swing.
    expect(Math.abs(heatOf(hot) - heatOf(cold))).toBeLessThan(1.5);
  });

  it('lets a fire actually reach the rungs above it', () => {
    // A ladder whose second rung is out of reach of the only heat source in
    // the game is a ladder with one rung. Ninety seconds of burning should
    // strip the biome; it should not melt the ground.
    const wood = makeTile('deciduous_forest');
    wood.isOnFire = true;
    for (let second = 0; second < 90; second += 1) {
      addHeat(wood, FIRE_HEAT_PER_SECOND);
      relax(wood, 1);
    }
    expect(heatOf(wood)).toBeGreaterThan(STRIP);
    expect(heatOf(wood)).toBeLessThan(SCORCH);
  });
});
