import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { toggleDrive, wants } from './mind';
import { EntityManager } from './entityManagerMinimal';
import { computeScaledHeight, type Entity, type Tile } from '../types/world';

const grid = (size: number): Tile[][] => Array.from({ length: size }, (_, x) => Array.from({ length: size }, (_, y) => ({
  x, y, type: 'grassland', height: 0.45, scaledHeight: computeScaledHeight(0.45, 'grassland'),
  moisture: 0.5, temperature: 0.5, fertility: 0.7, population: 0, resources: [], structure: null,
  entities: [], isOnFire: false, walkable: true,
}) as unknown as Tile));

describe('the mind editor', () => {
  it('starts with every drive on and flips them one at a time', () => {
    const e = { mind: undefined } as Entity;
    expect(wants(e, 'hunt')).toBe(true);
    expect(toggleDrive(e, 'hunt')).toBe(false);
    expect(wants(e, 'hunt')).toBe(false);
    expect(wants(e, 'sleep')).toBe(true);
    expect(toggleDrive(e, 'hunt')).toBe(true);
    // Switched back to whole, it carries nothing.
    expect(e.mind).toBeUndefined();
  });

  it('keeps a wolf with no hunt in it from hunting, however hungry', () => {
    const run = (hunts: boolean) => {
      const manager = new EntityManager(grid(14), new THREE.Scene());
      const wolf = manager.spawnEntity('wolf', 5, 5)!;
      const rabbit = manager.spawnEntity('rabbit', 6, 5)!;
      if (!hunts) toggleDrive(wolf, 'hunt');
      wolf.needs.hunger = 0.1;
      const start = rabbit.health;
      for (let i = 0; i < 40; i++) {
        rabbit.position = { x: 6.5, y: 5.5 };
        wolf.needs.hunger = 0.1;
        manager.update(0.25);
      }
      return rabbit.health < start || !manager.getEntityById(rabbit.id);
    };
    expect(run(true)).toBe(true);
    expect(run(false)).toBe(false);
  });

  it('will not let a creature with no fight in it start one', () => {
    const manager = new EntityManager(grid(14), new THREE.Scene());
    const a = manager.spawnEntity('orc', 5, 5)!;
    const b = manager.spawnEntity('human', 5.5, 5)!;
    toggleDrive(a, 'fight');
    manager.engage(a, b);
    for (let i = 0; i < 10; i++) manager.update(0.25);
    expect(b.health).toBe(b.maxHealth);
  });
});
