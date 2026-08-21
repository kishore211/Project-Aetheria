import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { HerdSystem } from './herdSystem';
import { EntityManager } from './entityManagerMinimal';
import { DEFAULT_WORLD_LAWS } from '../store/gameStore';
import { publishSimulationContext, simulation } from './simulation';
import { computeScaledHeight, type Tile } from '../types/world';

const makeTile = (x: number, y: number): Tile => ({
  x, y,
  height: 0.45,
  scaledHeight: computeScaledHeight(0.45, 'grassland'),
  moisture: 0.5,
  temperature: 0.5,
  fertility: 0.4 + ((x * 7 + y * 13) % 50) / 100,
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
});

interface Harness {
  tiles: Tile[][];
  entities: EntityManager;
  herds: HerdSystem;
}

const makeHarness = (size = 60): Harness => {
  const tiles = Array.from({ length: size }, (_, x) =>
    Array.from({ length: size }, (_, y) => makeTile(x, y)));

  // A liveable world: scattered pasture and a couple of ponds. Without these
  // the animals spend the whole test in a survival crisis and the herd
  // behaviour under test never gets a look in.
  for (let x = 2; x < size - 2; x += 4) {
    for (let y = 2; y < size - 2; y += 4) {
      tiles[x][y].resources.push({ type: 'food', quantity: 8, discovered: true });
    }
  }
  for (const [cx, cy] of [[10, 10], [size - 12, size - 12]]) {
    for (let x = cx; x < cx + 3; x++) {
      for (let y = cy; y < cy + 3; y++) {
        tiles[x][y].type = 'lake';
        tiles[x][y].height = 0.26;
      }
    }
  }

  const entities = new EntityManager(tiles, new THREE.Scene());
  return { tiles, entities, herds: new HerdSystem(tiles, entities) };
};

const run = (harness: Harness, seconds: number, step = 0.5) => {
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    harness.entities.update(step);
    harness.herds.update(step);
  }
};

const spawnGroup = (harness: Harness, type: Parameters<EntityManager['spawnEntity']>[0], count: number, x: number, y: number) => {
  for (let i = 0; i < count; i++) {
    harness.entities.spawnEntity(type, x + (i % 3), y + Math.floor(i / 3));
  }
};

beforeEach(() => {
  publishSimulationContext({ ...DEFAULT_WORLD_LAWS }, 'summer', 'day');
  simulation.homePositionFor = undefined;
});

describe('forming herds', () => {
  it('gathers scattered animals of one species into a family', () => {
    const harness = makeHarness();
    spawnGroup(harness, 'sheep', 6, 20, 20);

    run(harness, 20);

    expect(harness.herds.herds.size).toBeGreaterThan(0);
    const herd = Array.from(harness.herds.herds.values())[0];
    expect(herd.species).toBe('sheep');
    expect(herd.members.size).toBeGreaterThan(1);
  });

  it('never mixes species into one herd', () => {
    const harness = makeHarness();
    spawnGroup(harness, 'sheep', 5, 20, 20);
    spawnGroup(harness, 'deer', 5, 22, 22);

    run(harness, 25);

    for (const herd of harness.herds.herds.values()) {
      for (const id of herd.members) {
        // Dead members linger in the set until the next existence sweep
        const member = harness.entities.getEntityById(id);
        if (!member) continue;
        expect(member.type).toBe(herd.species);
      }
    }
  });

  it('leaves solitary species alone', () => {
    const harness = makeHarness();
    spawnGroup(harness, 'snake', 6, 20, 20);

    run(harness, 25);

    expect(harness.herds.herds.size).toBe(0);
  });

  it('does not herd the civilised races — they have villages instead', () => {
    const harness = makeHarness();
    spawnGroup(harness, 'human', 6, 20, 20);
    spawnGroup(harness, 'orc', 6, 30, 30);

    run(harness, 25);

    expect(harness.herds.herds.size).toBe(0);
  });

  it('respects the species herd size', () => {
    const harness = makeHarness();
    // Far more bears than a bear group should hold
    spawnGroup(harness, 'bear', 8, 20, 20);

    run(harness, 25);

    for (const herd of harness.herds.herds.values()) {
      expect(herd.members.size).toBeLessThanOrEqual(2);
    }
  });
});

describe('the alpha leads', () => {
  it('elects the oldest animal and gives it somewhere to go', () => {
    const harness = makeHarness();
    spawnGroup(harness, 'deer', 6, 20, 20);
    const all = harness.entities.getAllEntities();
    all[3].age = all[3].maxAge * 0.9; // clearly the eldest

    run(harness, 20);

    const herd = Array.from(harness.herds.herds.values())[0];
    expect(herd).toBeDefined();
    const alpha = harness.entities.getEntityById(herd.alphaId);
    expect(alpha).toBeDefined();
    for (const id of herd.members) {
      const member = harness.entities.getEntityById(id);
      if (member) expect(alpha!.age).toBeGreaterThanOrEqual(member.age - 1e-6);
    }
  });

  it('moves the whole herd a long way, together', () => {
    const harness = makeHarness(80);
    spawnGroup(harness, 'deer', 8, 40, 40);
    const start = harness.entities.getAllEntities().map(e => ({ ...e.position }));

    run(harness, 120);

    const now = harness.entities.getAllEntities();
    const travelled = now.map((e, i) => Math.hypot(
      e.position.x - (start[i]?.x ?? e.position.x),
      e.position.y - (start[i]?.y ?? e.position.y),
    ));
    const farthest = Math.max(...travelled);
    expect(farthest).toBeGreaterThan(8);

    // And they are still recognisably a group, not scattered singletons
    const herd = Array.from(harness.herds.herds.values())
      .sort((a, b) => b.members.size - a.members.size)[0];
    expect(herd.members.size).toBeGreaterThan(2);
  });

  it('promotes a new alpha when the leader dies', () => {
    const harness = makeHarness();
    spawnGroup(harness, 'sheep', 6, 20, 20);
    run(harness, 20);

    const herd = Array.from(harness.herds.herds.values())[0];
    const oldAlpha = herd.alphaId;
    const alpha = harness.entities.getEntityById(oldAlpha);
    expect(alpha).toBeDefined();
    harness.entities.killEntity(alpha!, 'divine');

    run(harness, 45);

    const survivor = harness.herds.herds.get(herd.id);
    if (survivor) {
      expect(survivor.alphaId).not.toBe(oldAlpha);
      expect(harness.entities.getEntityById(survivor.alphaId)).toBeDefined();
    }
  });

  it('dissolves a herd that dwindles to one animal', () => {
    const harness = makeHarness();
    spawnGroup(harness, 'sheep', 3, 20, 20);
    run(harness, 20);
    expect(harness.herds.herds.size).toBeGreaterThan(0);

    const members = harness.entities.getAllEntities();
    for (let i = 0; i < members.length - 1; i++) {
      harness.entities.killEntity(members[i], 'divine');
    }

    run(harness, 45);

    expect(harness.herds.herds.size).toBe(0);
    expect(harness.entities.getAllEntities()[0]?.herdId ?? null).toBeNull();
  });
});

describe('inspection', () => {
  it('reports herd size and whether this animal leads it', () => {
    const harness = makeHarness();
    spawnGroup(harness, 'sheep', 5, 20, 20);
    run(harness, 20);

    const herd = Array.from(harness.herds.herds.values())[0];
    const alpha = harness.entities.getEntityById(herd.alphaId)!;
    const living = Array.from(herd.members)
      .map(id => harness.entities.getEntityById(id))
      .filter((member): member is NonNullable<typeof member> => Boolean(member));

    expect(harness.herds.describe(alpha)).toEqual({ size: living.length, isAlpha: true });

    const follower = living.find(member => member.id !== herd.alphaId);
    if (follower) expect(harness.herds.describe(follower)?.isAlpha).toBe(false);
  });
});

/** A stream of our own, so a run can be repeated at a chosen seed. */
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('survival while travelling', () => {
  /**
   * Measured over many seeds rather than one.
   *
   * A single run makes this an assertion about one path through the random
   * stream, which means any new `Math.random()` call anywhere in the AI
   * silently re-rolls it — and a test that fails because unrelated code got a
   * new coin flip is a tripwire, not a test. Sampling also states the real
   * claim honestly: a herd that wanders into barren ground *should* sometimes
   * starve. What must hold is that starving is the exception.
   */
  it('lets a grazing herd feed itself on the move instead of starving', () => {
    const RUNS = 14;
    let healthyRuns = 0;
    let totalSurvivors = 0;

    for (let run_ = 0; run_ < RUNS; run_ += 1) {
      Math.random = mulberry32(1000 + run_ * 7919);

      const harness = makeHarness(60);
      spawnGroup(harness, 'sheep', 8, 25, 25);
      for (const animal of harness.entities.getAllEntities()) {
        animal.needs.hunger = 0.5;
      }

      run(harness, 200, 1);

      const survivors = harness.entities.getAllEntities().filter(e => e.type === 'sheep');
      totalSurvivors += survivors.length;
      const fed = survivors.filter(sheep => sheep.needs.hunger > 0.3).length;
      if (survivors.length > 4 && fed > survivors.length / 2) healthyRuns += 1;
    }

    // Before grazing-on-the-move existed this was 0 healthy runs out of 14.
    expect(healthyRuns).toBeGreaterThanOrEqual(RUNS - 4);
    expect(totalSurvivors / RUNS).toBeGreaterThan(5);
  });
});
