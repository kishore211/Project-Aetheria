import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD_LAWS } from '../store/gameStore';
import { EntityManager } from './entityManagerMinimal';
import { nextEntityId } from './ids';
import { resetWorldState } from './resetWorldState';
import type { SavedEntity } from './saveSystem';
import { generateWorld } from './worldGenerator';

/** A saved human standing at (x, y), as a save file would hold it. */
const savedHuman = (id: string, x: number, y: number): SavedEntity => ({
  id,
  type: 'human',
  name: `Saved ${id}`,
  age: 40,
  maxAge: 100,
  health: 100,
  maxHealth: 100,
  x,
  y,
  attributes: { strength: 10, intelligence: 10, speed: 10, resilience: 10 },
  needs: { hunger: 1, thirst: 1, rest: 1, social: 1 },
  traits: [],
  kills: 0,
  kingdomId: null,
  villageId: null,
  job: null,
});

describe('creature ids', () => {
  it('are counter ids that restart with each world', () => {
    resetWorldState();
    expect(nextEntityId()).toBe('e-1');
    expect(nextEntityId()).toBe('e-2');

    resetWorldState();
    expect(nextEntityId()).toBe('e-1');
  });

  it('a creature restored from a save with high ids does not collide with a new one', () => {
    resetWorldState();
    const { tilesData } = generateWorld({ seed: 7, mapSize: 64 });
    const manager = new EntityManager(tilesData, new THREE.Scene());
    manager.setWorldLaws({ ...DEFAULT_WORLD_LAWS });

    const restoredIds = ['e-3', 'e-41', 'e-900'];
    restoredIds.forEach((id, i) => manager.restoreEntity(savedHuman(id, 10 + i, 10)));

    // A new creature must go on past the highest restored id, not restart at e-1.
    const land = tilesData.flat().find(t => t.walkable !== false && t.height > 0.3 && !String(t.type).includes('water'));
    expect(land).toBeDefined();
    const spawned = manager.spawnEntity('human', land!.x, land!.y);
    expect(spawned).not.toBeNull();

    expect(restoredIds).not.toContain(spawned!.id);
    expect(Number(spawned!.id.slice(2))).toBeGreaterThan(900);

    const ids = manager.getAllEntities().map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a restored id from an older save, which is not a counter id, leaves the counter alone', () => {
    resetWorldState();
    const { tilesData } = generateWorld({ seed: 7, mapSize: 64 });
    const manager = new EntityManager(tilesData, new THREE.Scene());
    manager.setWorldLaws({ ...DEFAULT_WORLD_LAWS });

    manager.restoreEntity(savedHuman('3f2a9c1e-7b4d-4e8a-9f10-0a1b2c3d4e5f', 10, 10));

    const land = tilesData.flat().find(t => t.walkable !== false && t.height > 0.3 && !String(t.type).includes('water'));
    const spawned = manager.spawnEntity('human', land!.x, land!.y);
    expect(spawned?.id).toBe('e-1');
  });
});
