import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { heldDirection, isDirectionKey, possess, possession, pressKey, releaseAllKeys, releaseKey } from './possession';
import { EntityManager } from './entityManagerMinimal';
import { resetWorldState } from './resetWorldState';
import { useGameStore } from '../store/gameStore';
import { computeScaledHeight, type Tile } from '../types/world';

const makeGrid = (size: number): Tile[][] =>
  Array.from({ length: size }, (_, x) => Array.from({ length: size }, (_, y) => ({
    x, y, height: 0.45, scaledHeight: computeScaledHeight(0.45, 'grassland'), moisture: 0.5,
    temperature: 0.5, fertility: 0.6, type: 'grassland', population: 0, resources: [],
    structure: null, entities: [], walkable: true, isOnFire: false,
  }) as unknown as Tile));

afterEach(() => {
  releaseAllKeys();
  possess(null);
});

describe('held keys', () => {
  it('knows which keys steer', () => {
    for (const key of ['w', 'A', 'ArrowUp', 'arrowright']) expect(isDirectionKey(key)).toBe(true);
    expect(isDirectionKey('q')).toBe(false);
  });

  it('adds held keys into one direction, and a diagonal is no faster', () => {
    pressKey('d');
    expect(heldDirection()).toEqual({ dx: 1, dy: 0 });
    pressKey('s');
    const { dx, dy } = heldDirection();
    expect(Math.hypot(dx, dy)).toBeCloseTo(1, 5);
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeGreaterThan(0);
    releaseKey('d');
    releaseKey('s');
    expect(heldDirection()).toEqual({ dx: 0, dy: 0 });
  });

  it('cancels opposite keys rather than picking one', () => {
    pressKey('a');
    pressKey('d');
    expect(heldDirection()).toEqual({ dx: 0, dy: 0 });
  });
});

describe('wearing a creature', () => {
  it('walks where the keys point, and nowhere on its own', () => {
    const manager = new EntityManager(makeGrid(24), new THREE.Scene());
    const worn = manager.spawnEntity('human', 10, 10)!;
    possess(worn.id);
    const start = { ...worn.position };
    // No keys: it stands still, whatever its own mind wanted.
    for (let i = 0; i < 20; i++) manager.update(0.1);
    expect(worn.position).toEqual(start);
    pressKey('d');
    for (let i = 0; i < 20; i++) manager.update(0.1);
    expect(worn.position.x).toBeGreaterThan(start.x + 0.3);
    expect(worn.position.y).toBeCloseTo(start.y, 5);
  });

  it('strikes the nearest creature in reach when told to', () => {
    const manager = new EntityManager(makeGrid(24), new THREE.Scene());
    const worn = manager.spawnEntity('orc', 10, 10)!;
    const victim = manager.spawnEntity('sheep', 10, 10)!;
    victim.position = { x: worn.position.x + 0.5, y: worn.position.y };
    possess(worn.id);
    const before = victim.health;
    possession.attackQueued = true;
    manager.update(0.05);
    expect(victim.health).toBeLessThan(before);
    expect(possession.attackQueued).toBe(false);
  });
});

describe('a new world', () => {
  it('forgets which creature the god was wearing, in the store as well as the module', () => {
    useGameStore.getState().setPossessed('e-7');
    pressKey('w');
    expect(useGameStore.getState().possessedId).toBe('e-7');

    resetWorldState();

    expect(possession.id).toBeNull();
    expect(useGameStore.getState().possessedId).toBeNull();
    expect(heldDirection()).toEqual({ dx: 0, dy: 0 });
  });
});
