import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntityManager } from './entityManagerMinimal';
import type { SettlementSystem } from './settlementSystem';
import { DEFAULT_WORLD_LAWS } from '../store/gameStore';
import type { EntityType } from '../types/world';

/**
 * A world replays exactly from its seed.
 *
 * Every simulation draw goes through random(), seeded at world creation.
 * Math.random is replaced by a function that throws, so a simulation call that
 * still reaches for it fails this test instead of quietly making a run differ
 * from its seed. Cosmetic code keeps Math.random on purpose; the allowlist
 * below names the only direct callers let through.
 *
 * Each world is built from a fresh module graph and a fresh id counter, as a
 * page load would give it. Module-level counters (plots, herds, items,
 * settlement ids, religion dice) and uuid ids feed into decisions, so a second
 * world built in the same module graph inherits them and no longer matches its
 * seed. Ids are used inside the simulation here, so they cannot simply be left
 * out of the fingerprint; they are reset instead.
 */

const realMathRandom = Math.random;

const COSMETIC_CALLER = /[/\\](effectsManager|soundManager|floatBridge|impactBridge)\.ts:|three\.core\.js:/;

/**
 * Frame 0 is the Error, frame 1 is this function, frame 2 is the direct caller.
 * Cosmetic draws (float-text drift, particles, sound, sprite textures) and
 * three.js's uuid draws are rendering scaffolding: no simulation code reads
 * their results back.
 */
const sealedMathRandom = (): number => {
  const caller = (new Error().stack ?? '').split('\n')[2] ?? '';
  if (COSMETIC_CALLER.test(caller)) return realMathRandom();
  throw new Error(`Math.random was called from the simulation at ${caller.trim()}; route the draw through random()`);
};

const SIM_SECONDS = 120;
const STEP = 0.5;

const runWorld = async (seed: number): Promise<string> => {
  vi.resetModules();
  let minted = 0;
  vi.doMock('uuid', () => ({ v4: () => `world-${(minted++).toString(36)}` }));

  const { seedRandom, unseedRandom } = await import('./random');
  const { generateWorld } = await import('./worldGenerator');
  const { TerrainRenderer } = await import('./terrainRenderer');
  const { EntityManager } = await import('./entityManagerMinimal');
  const { SettlementSystem } = await import('./settlementSystem');

  seedRandom(seed);
  try {
    // The scene graph is built on the ordinary Math.random: three.js gives
    // every Object3D a uuid from it, which is scaffolding, not history.
    const { tilesData } = generateWorld({ seed: 7, mapSize: 64 });
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(tilesData, 'day', 'summer');
    const entities = new EntityManager(tilesData, scene);
    entities.setWorldLaws({ ...DEFAULT_WORLD_LAWS });
    const settlements = new SettlementSystem(tilesData, terrain, entities, scene, {
      onEvent: () => undefined,
      onKingdomsChanged: () => undefined,
    });
    settlements.setWorldLaws({ ...DEFAULT_WORLD_LAWS });

    const land = tilesData.flat().filter(t => t.walkable !== false && t.height > 0.3 && !String(t.type).includes('water'));
    const races: EntityType[] = ['human', 'orc'];
    races.forEach((race, r) => {
      const home = land[Math.floor(((r + 1) * 0.37) * land.length) % land.length];
      for (let i = 0; i < 6; i++) entities.spawnEntity(race, home.x + (i % 3), home.y + Math.floor(i / 3));
    });

    Math.random = sealedMathRandom;
    try {
      for (let t = 0; t < SIM_SECONDS; t += STEP) {
        entities.update(STEP);
        settlements.update(STEP);
      }
      return fingerprint(entities, settlements);
    } finally {
      Math.random = realMathRandom;
    }
  } finally {
    unseedRandom();
  }
};

type Entities = Pick<EntityManager, 'getAllEntities'>;
type Settlements = Pick<SettlementSystem, 'snapshot'>;

/**
 * What the world looks like at the end: population per type, every village
 * (name, race, centre, store, buildings, territory), every kingdom (name,
 * ruler, race, villages, wars) and every entity position rounded to 0.01.
 * Ids are not included; the things they lead to are.
 */
const fingerprint = (entities: Entities, settlements: Settlements): string => {
  const population: Record<string, number> = {};
  const positions: string[] = [];
  for (const e of entities.getAllEntities()) {
    population[e.type] = (population[e.type] ?? 0) + 1;
    const x = (Math.round(e.position.x * 100) / 100).toFixed(2);
    const y = (Math.round(e.position.y * 100) / 100).toFixed(2);
    positions.push(`${e.type}@${x},${y}`);
  }
  positions.sort();

  const { villages, kingdoms } = settlements.snapshot();
  return JSON.stringify({
    population: Object.fromEntries(Object.entries(population).sort(([a], [b]) => a.localeCompare(b))),
    villages: villages.map(v => ({
      name: v.name,
      race: v.race,
      centre: [v.centerX, v.centerY],
      store: { ...v.store },
      buildings: v.buildings.map(b => b.kind).sort(),
      territory: v.territory.size,
    })),
    kingdoms: kingdoms.map(k => ({
      name: k.name,
      ruler: k.ruler,
      race: k.race,
      villages: k.villageIds.length,
      atWar: k.atWar.size,
    })),
    positions,
  });
};

describe('a world replays exactly from its seed', () => {
  afterEach(() => {
    Math.random = realMathRandom;
    vi.doUnmock('uuid');
    vi.resetModules();
  });

  it('gives the same history twice from one seed, and a different one from another', async () => {
    const first = await runWorld(1234);
    const again = await runWorld(1234);
    const other = await runWorld(99);

    expect(again).toBe(first);
    expect(other).not.toBe(first);
  }, 120_000);
});
