import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SettlementSystem } from './settlementSystem';
import { TerrainRenderer } from './terrainRenderer';
import { EntityManager } from './entityManagerMinimal';
import { generateWorld } from './worldGenerator';
import { DEFAULT_WORLD_LAWS } from '../store/gameStore';
import { applyStatus } from './statusEffects';
import { possess } from './possession';
import type { EntityType } from '../types/world';

/**
 * Everything at once, for a long time.
 *
 * Each system has its own tests. This one exists because the bugs that
 * matter now live *between* them — a boat landing settlers the plague is
 * busy raising, a possessed creature whose village is abandoned, a tornado
 * flinging somebody who is aboard. It runs a populated world for ten
 * simulated minutes and asserts the invariants that have to hold whatever
 * happened: nothing throws, nobody ends up at NaN or off the map, nobody is
 * stuck aboard a boat that does not exist, and the population stays finite.
 */
describe('a long soak with everything switched on', () => {
  it('keeps its invariants for ten simulated minutes', () => {
    const { tilesData } = generateWorld({ seed: 77, mapSize: 64 });
    const scene = new THREE.Scene();
    const terrain = new TerrainRenderer(tilesData, 'day', 'summer');
    const entities = new EntityManager(tilesData, scene);
    entities.setWorldLaws({ ...DEFAULT_WORLD_LAWS, populationCap: true, entanglewood: true });
    const settlements = new SettlementSystem(tilesData, terrain, entities, scene, {
      onEvent: () => undefined,
      onKingdomsChanged: () => undefined,
    });
    settlements.setWorldLaws({ ...DEFAULT_WORLD_LAWS, populationCap: true, entanglewood: true });

    // A cluster of every race on dry land, wildlife, and some monsters.
    const land = tilesData.flat().filter(t => t.walkable !== false && t.height > 0.3);
    const at = (i: number) => land[Math.floor((i * 7919) % land.length)];
    const races: EntityType[] = ['human', 'elf', 'dwarf', 'orc'];
    races.forEach((race, r) => {
      const home = at(r * 131 + 17);
      for (let i = 0; i < 8; i++) entities.spawnEntity(race, home.x + (i % 3), home.y + Math.floor(i / 3));
    });
    const wild: EntityType[] = ['wolf', 'sheep', 'deer', 'rabbit', 'cow', 'hyena', 'crab', 'monkey', 'zombie', 'ghost'];
    wild.forEach((type, i) => {
      const tile = at(i * 53 + 401);
      for (let k = 0; k < 3; k++) entities.spawnEntity(type, tile.x, tile.y);
    });

    // Lay a few spells on, and wear somebody, so those paths run too.
    const people = entities.getAllEntities().filter(e => races.includes(e.type));
    applyStatus(people[0], 'infected');
    applyStatus(people[1], 'shielded');
    applyStatus(people[2], 'caffeinated');
    applyStatus(people[3], 'confused');
    possess(people[4].id);

    const size = tilesData.length;
    let peak = 0;
    try {
      for (let elapsed = 0; elapsed < 600; elapsed += 0.5) {
        entities.update(0.5);
        settlements.update(0.5);
        if (elapsed % 30 === 0) terrain.flush();

        const all = entities.getAllEntities();
        peak = Math.max(peak, all.length);
        for (const creature of all) {
          const { x, y } = creature.position;
          expect(Number.isFinite(x) && Number.isFinite(y), `${creature.type} at ${x},${y}`).toBe(true);
          expect(x >= -1 && y >= -1 && x <= size + 1 && y <= size + 1, `${creature.type} off the map`).toBe(true);
        }
      }
    } finally {
      possess(null);
    }

    const all = entities.getAllEntities();
    // Nobody is aboard a boat that is not on the water (the fleet round cleans
    // orphans every six seconds, so allow the last one in flight).
    const atSea = (settlements as unknown as { boats: { passengersAtSea(): Set<string> } }).boats.passengersAtSea();
    for (const creature of all) {
      if (creature.status.includes('aboard')) expect(atSea.has(creature.id)).toBe(true);
    }
    expect(peak).toBeLessThan(2000);
    // It has to have actually exercised civilisation, or it proves nothing.
    expect(settlements.snapshot().villages.length).toBeGreaterThan(0);
    // ...and the world is still a world.
    expect(all.length).toBeGreaterThan(0);
  }, 60_000);
});
