// The creature registry must reproduce the tables it replaced, exactly.
// creatures.golden.json holds those tables as they were before the refactor,
// captured from the original source. Its arrays keep the original key order.
// Only regenerate it when a creature's value is changed on purpose.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import golden from './creatures.golden.json';
import { CREATURES } from './creatures';
import { FOOD_CHAIN, MONSTERS, RANGED, STRUCTURES, profileOf } from '../utils/entitySystemMinimal';
import { EntityManager } from '../utils/entityManagerMinimal';
import { baseSizeOf } from '../utils/size';
import { HERD_SIZE } from '../utils/herdSystem';
import type { EntityType } from '../types/world';

const types = golden.foodChain.map(([type]) => type as EntityType);

describe('creature registry', () => {
  it('lists creatures in the original food-chain order', () => {
    expect(Object.keys(CREATURES)).toEqual(types);
  });

  it('derives FOOD_CHAIN exactly, key order included', () => {
    expect(Object.entries(FOOD_CHAIN)).toStrictEqual(golden.foodChain);
  });

  it('derives the base stats exactly', () => {
    expect(types.map(type => [type, profileOf(type)])).toStrictEqual(golden.profiles);
  });

  it('derives the size table exactly', () => {
    expect(types.map(type => [type, baseSizeOf(type)])).toStrictEqual(golden.baseSize);
  });

  it('derives the ranged attacks exactly', () => {
    expect(RANGED).toStrictEqual(Object.fromEntries(golden.ranged));
  });

  it('derives the herd sizes exactly', () => {
    expect(HERD_SIZE).toStrictEqual(Object.fromEntries(golden.herdSize));
  });

  it('derives the monster and structure sets exactly', () => {
    expect([...MONSTERS].sort()).toEqual([...golden.monsters].sort());
    expect([...STRUCTURES].sort()).toEqual([...golden.structures].sort());
  });

  it('derives the population caps exactly at every density', () => {
    const manager = new EntityManager([], new THREE.Scene()) as unknown as {
      setPopulationDensity: (density: 'low' | 'medium' | 'high') => void;
      getMaxEntityCount: (type: EntityType) => number;
    };
    const caps = (density: 'low' | 'medium' | 'high') => {
      manager.setPopulationDensity(density);
      return types.map(type => [type, manager.getMaxEntityCount(type)]);
    };
    expect(caps('low')).toStrictEqual(golden.maxLow);
    expect(caps('medium')).toStrictEqual(golden.maxMedium);
    expect(caps('high')).toStrictEqual(golden.maxHigh);
  });
});
