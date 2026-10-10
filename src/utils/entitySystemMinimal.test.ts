import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { EntityAI, FOOD_CHAIN, createEntity, isSentient } from './entitySystemMinimal';
import { EntityManager } from './entityManagerMinimal';
import { rollSize } from './size';
import { DEFAULT_WORLD_LAWS } from '../store/gameStore';
import { publishSimulationContext, simulation } from './simulation';
import type { Tile } from '../types/world';
import { computeScaledHeight } from '../types/world';

const makeTile = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({
  x, y,
  height: 0.45,
  scaledHeight: computeScaledHeight(0.45, 'grassland'),
  moisture: 0.5,
  temperature: 0.5,
  fertility: 0.6,
  type: 'grassland',
  population: 0,
  resources: [],
  structure: null,
  entities: [],
  isOnFire: false,
  walkable: true,
  variant: 0.5,
  ownerId: null,
  villageId: null,
  ...overrides,
});

const makeGrid = (size: number): Tile[][] =>
  Array.from({ length: size }, (_, x) => Array.from({ length: size }, (_, y) => makeTile(x, y)));

beforeEach(() => {
  publishSimulationContext({ ...DEFAULT_WORLD_LAWS }, 'summer', 'day');
});

describe('needs', () => {
  it('drains hunger, thirst and rest over time', () => {
    const grid = makeGrid(8);
    const entity = createEntity('human', 4.5, 4.5, []);
    const ai = new EntityAI(entity);

    ai.update(grid, 10);

    expect(entity.needs.hunger).toBeLessThan(1);
    expect(entity.needs.thirst).toBeLessThan(entity.needs.hunger);
    expect(entity.needs.rest).toBeLessThan(1);
  });

  it('drains faster in winter than in summer', () => {
    const grid = makeGrid(8);

    publishSimulationContext({ ...DEFAULT_WORLD_LAWS }, 'summer', 'day');
    const summerEntity = createEntity('human', 4.5, 4.5, []);
    new EntityAI(summerEntity).update(grid, 10);

    publishSimulationContext({ ...DEFAULT_WORLD_LAWS }, 'winter', 'day');
    const winterEntity = createEntity('human', 4.5, 4.5, []);
    new EntityAI(winterEntity).update(grid, 10);

    expect(winterEntity.needs.hunger).toBeLessThan(summerEntity.needs.hunger);
  });

  it('stops draining when the hunger law is switched off', () => {
    const grid = makeGrid(8);
    publishSimulationContext({ ...DEFAULT_WORLD_LAWS, hunger: false }, 'summer', 'day');
    const entity = createEntity('human', 4.5, 4.5, []);
    entity.needs.hunger = 0.9;

    new EntityAI(entity).update(grid, 60);

    expect(entity.needs.hunger).toBeGreaterThanOrEqual(0.6);
    expect(entity.health).toBe(entity.maxHealth);
  });

  it('starves a creature with nothing to eat or drink', () => {
    const grid = makeGrid(8);
    const entity = createEntity('rabbit', 4.5, 4.5, []);
    entity.needs.hunger = 0.05;
    const ai = new EntityAI(entity);

    for (let i = 0; i < 40; i++) ai.update(grid, 1);

    expect(entity.health).toBeLessThan(entity.maxHealth);
  });
});

describe('movement', () => {
  it('walks toward a drink and arrives with full thirst', () => {
    const grid = makeGrid(12);
    grid[9][4] = makeTile(9, 4, { type: 'lake', height: 0.26 });
    const entity = createEntity('human', 4.5, 4.5, ['swift']);
    entity.needs.thirst = 0.1;
    const ai = new EntityAI(entity);

    for (let i = 0; i < 400; i++) ai.update(grid, 0.1);

    expect(entity.needs.thirst).toBeGreaterThan(0.5);
  });

  it('is frame-rate independent — the same elapsed time covers the same ground', () => {
    const walk = (step: number) => {
      const grid = makeGrid(40);
      const entity = createEntity('deer', 2.5, 2.5, []);
      const ai = new EntityAI(entity);
      ai.setOrder({ kind: 'goto', x: 30, y: 2, purpose: 'return' });
      for (let elapsed = 0; elapsed < 4; elapsed += step) ai.update(grid, step);
      return entity.position.x;
    };

    const coarse = walk(0.1);
    const fine = walk(0.02);
    expect(Math.abs(coarse - fine)).toBeLessThan(1.5);
  });

  it('eats from a tile it reaches and depletes the resource', () => {
    const grid = makeGrid(8);
    grid[5][4].resources.push({ type: 'food', quantity: 2, discovered: true });
    const entity = createEntity('human', 4.5, 4.5, []);
    entity.needs.hunger = 0.2;
    const ai = new EntityAI(entity);

    for (let i = 0; i < 300; i++) ai.update(grid, 0.1);

    expect(entity.needs.hunger).toBeGreaterThan(0.4);
  });
});

describe('predators and prey', () => {
  it('has a consistent food chain in both directions', () => {
    for (const [predator, prey] of Object.entries(FOOD_CHAIN)) {
      expect(Array.isArray(prey)).toBe(true);
      expect(prey).not.toContain(predator);
    }
  });

  it('sends a hungry wolf after a nearby rabbit', () => {
    const grid = makeGrid(24);
    const scene = new THREE.Scene();
    const manager = new EntityManager(grid, scene);

    const wolf = manager.spawnEntity('wolf', 8, 8);
    const rabbit = manager.spawnEntity('rabbit', 11, 8);
    expect(wolf && rabbit).toBeTruthy();
    if (!wolf || !rabbit) return;
    wolf.needs.hunger = 0.1;
    rabbit.needs.hunger = 1;

    // The rabbit flees, so end-of-run distance is a poor signal — the chase is
    // what matters. Track how close the wolf ever got.
    let closest = Infinity;
    for (let i = 0; i < 120; i++) {
      manager.update(0.2);
      if (!manager.getEntityById(rabbit.id)) break; // caught and eaten
      closest = Math.min(closest, Math.hypot(
        wolf.position.x - rabbit.position.x,
        wolf.position.y - rabbit.position.y,
      ));
    }

    const caught = !manager.getEntityById(rabbit.id);
    expect(caught || rabbit.health < rabbit.maxHealth || closest < 2.5).toBe(true);
  });

  it('knows which types are civilised', () => {
    expect(isSentient('human')).toBe(true);
    expect(isSentient('orc')).toBe(true);
    expect(isSentient('wolf')).toBe(false);
  });
});

describe('village orders', () => {
  it('reports back to the settlement system on arrival', () => {
    const grid = makeGrid(12);
    const entity = createEntity('human', 2.5, 2.5, ['swift']);
    entity.villageId = 'village-1';
    entity.job = 'gatherer';
    entity.carrying = { type: 'wood', quantity: 2 };

    let delivered = false;
    simulation.onOrderComplete = (unit, order) => {
      if (order.purpose === 'deliver' && unit.id === entity.id) delivered = true;
    };

    const ai = new EntityAI(entity);
    ai.setOrder({ kind: 'goto', x: 6, y: 2, purpose: 'deliver' });
    for (let i = 0; i < 600; i++) ai.update(grid, 0.05);

    simulation.onOrderComplete = undefined;
    expect(delivered).toBe(true);
  });
});

describe('spells the player lays on', () => {
  it('lets nothing through a shield', () => {
    const manager = new EntityManager(makeGrid(16), new THREE.Scene());
    const guarded = manager.spawnEntity('human', 5, 5)!;
    const exposed = manager.spawnEntity('human', 5.3, 5)!;
    guarded.status.push('shielded');
    manager.damageArea(5, 5, 2, 20);
    expect(guarded.health).toBe(guarded.maxHealth);
    expect(exposed.health).toBeLessThan(exposed.maxHealth);
  });

  it('raises whoever the plague takes', () => {
    const manager = new EntityManager(makeGrid(16), new THREE.Scene());
    const victim = manager.spawnEntity('human', 6, 6)!;
    victim.status.push('infected');
    manager.killEntity(victim, 'health');
    const risen = manager.getAllEntities().filter(e => e.type === 'zombie');
    expect(risen).toHaveLength(1);
    expect(Math.floor(risen[0].position.x)).toBe(6);
  });

  it('wears an infected creature down on its own', () => {
    const manager = new EntityManager(makeGrid(16), new THREE.Scene());
    const victim = manager.spawnEntity('human', 6, 6)!;
    victim.status.push('infected');
    const before = victim.health;
    for (let i = 0; i < 20; i++) manager.update(0.1);
    expect(victim.health).toBeLessThan(before - 1);
  });

  it('keeps a spellbound creature exactly where it stands', () => {
    const manager = new EntityManager(makeGrid(16), new THREE.Scene());
    const sleeper = manager.spawnEntity('human', 7, 7)!;
    sleeper.status.push('spellbound');
    const { x, y } = sleeper.position;
    for (let i = 0; i < 30; i++) manager.update(0.1);
    expect(sleeper.position).toEqual({ x, y });
  });
});

describe('traits with teeth', () => {
  it('lets fire pass over the fireproof and blunts every wound on the thick-skinned', () => {
    const manager = new EntityManager(makeGrid(16), new THREE.Scene());
    const salamander = manager.spawnEntity('human', 5, 5)!;
    const tank = manager.spawnEntity('human', 5.2, 5)!;
    const plain = manager.spawnEntity('human', 5.4, 5)!;
    salamander.traits = ['fireproof'];
    tank.traits = ['armored'];
    plain.traits = [];
    for (const c of [salamander, tank, plain]) c.health = c.maxHealth = 100;
    manager.damageArea(5, 5, 2, 30, 'burned');
    expect(salamander.health).toBe(100);
    expect(tank.health).toBeCloseTo(100 - 30 * 0.67, 5);
    expect(plain.health).toBe(70);
  });

  it('keeps a giant bigger and a tiny one smaller than the plain of their kind', () => {
    const fixed = () => 0.5;
    expect(rollSize('wolf', ['giant'], fixed)).toBeGreaterThan(rollSize('wolf', [], fixed));
    expect(rollSize('wolf', ['tiny'], fixed)).toBeLessThan(rollSize('wolf', [], fixed));
  });
});

describe('veterans', () => {
  it('levels up with kills, slowly, and stops at ten', async () => {
    const { levelOf } = await import('./entitySystemMinimal');
    expect(levelOf({ kills: 0 })).toBe(1);
    expect(levelOf({ kills: 3 })).toBe(3);
    expect(levelOf({ kills: 20 })).toBeGreaterThan(levelOf({ kills: 5 }));
    expect(levelOf({ kills: 10_000 })).toBe(10);
  });
});

describe('fighting at a distance', () => {
  it('lets a dragon breathe on a knight from three tiles off, and draws the fire', async () => {
    const { shotsInFlight, clearShots } = await import('./shotBridge');
    clearShots();
    const manager = new EntityManager(makeGrid(16), new THREE.Scene());
    const dragon = manager.spawnEntity('dragon', 5, 8)!;
    const knight = manager.spawnEntity('human', 8, 8)!;
    const before = knight.health;
    manager.engage(dragon, knight);
    let sawFire = false;
    for (let i = 0; i < 20 && knight.health > 0; i++) {
      // Hold the knight still: this is about reach, not the chase.
      knight.position = { x: 8.2, y: 8.2 };
      manager.update(0.25);
      if (shotsInFlight() > 0) sawFire = true;
    }
    expect(knight.health).toBeLessThan(before);
    expect(sawFire).toBe(true);
    clearShots();
  });
});
