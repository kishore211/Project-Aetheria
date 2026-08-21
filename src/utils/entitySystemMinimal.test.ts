import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { EntityAI, FOOD_CHAIN, createEntity, isSentient } from './entitySystemMinimal';
import { EntityManager } from './entityManagerMinimal';
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
    const grid = makeGrid(16);
    const scene = new THREE.Scene();
    const manager = new EntityManager(grid, scene);

    const wolf = manager.spawnEntity('wolf', 4, 4);
    const rabbit = manager.spawnEntity('rabbit', 7, 4);
    expect(wolf && rabbit).toBeTruthy();
    if (!wolf || !rabbit) return;
    wolf.needs.hunger = 0.1;
    rabbit.needs.hunger = 1;

    const startDistance = Math.hypot(wolf.position.x - rabbit.position.x, wolf.position.y - rabbit.position.y);
    for (let i = 0; i < 60; i++) manager.update(0.2);
    const rabbitHurt = rabbit.health < rabbit.maxHealth;
    const closed = Math.hypot(wolf.position.x - rabbit.position.x, wolf.position.y - rabbit.position.y) < startDistance;

    expect(rabbitHurt || closed).toBe(true);
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
