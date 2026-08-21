import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { SettlementSystem } from './settlementSystem';
import { TerrainRenderer } from './terrainRenderer';
import { EntityManager } from './entityManagerMinimal';
import { generateWorld } from './worldGenerator';
import { DEFAULT_WORLD_LAWS } from '../store/gameStore';
import type { Tile } from '../types/world';

interface Harness {
  tiles: Tile[][];
  terrain: TerrainRenderer;
  entities: EntityManager;
  settlements: SettlementSystem;
  events: string[];
}

/** A small, deliberately habitable world so founding is predictable. */
const makeHarness = (mapSize = 40): Harness => {
  const { tilesData } = generateWorld({ seed: 2024, mapSize });

  // Flatten the middle into good farmland so founding does not depend on noise
  for (let x = 5; x < mapSize - 5; x++) {
    for (let y = 5; y < mapSize - 5; y++) {
      const tile = tilesData[x][y];
      tile.height = 0.45;
      tile.type = 'grassland';
      tile.fertility = 0.8;
      tile.moisture = 0.5;
      tile.walkable = true;
      tile.structure = null;
      tile.ownerId = null;
      tile.villageId = null;
    }
  }

  const scene = new THREE.Scene();
  const terrain = new TerrainRenderer(tilesData, 'day', 'summer');
  const entities = new EntityManager(tilesData, scene);
  const events: string[] = [];
  const settlements = new SettlementSystem(tilesData, terrain, entities, scene, {
    onEvent: (message) => events.push(message),
    onKingdomsChanged: () => undefined,
  });
  settlements.setWorldLaws({ ...DEFAULT_WORLD_LAWS });

  return { tiles: tilesData, terrain, entities, settlements, events };
};

/** Drive the systems forward in fixed steps, like the engine does. */
const run = (harness: Harness, seconds: number, step = 0.5) => {
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    harness.entities.update(step);
    harness.settlements.update(step);
  }
};

describe('village founding', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = makeHarness();
  });

  it('turns a cluster of one race into a named village and kingdom', () => {
    for (let i = 0; i < 5; i++) {
      harness.entities.spawnEntity('human', 20 + (i % 3), 20 + Math.floor(i / 3));
    }

    run(harness, 6);

    expect(harness.settlements.villages.size).toBe(1);
    expect(harness.settlements.kingdoms.size).toBe(1);

    const village = Array.from(harness.settlements.villages.values())[0];
    expect(village.name.length).toBeGreaterThan(2);
    expect(village.buildings.some((building) => building.kind === 'bonfire')).toBe(true);
    expect(harness.events.some((message) => message.includes('is founded'))).toBe(true);
  });

  it('does not found anything from a lone wanderer', () => {
    harness.entities.spawnEntity('human', 20, 20);
    run(harness, 6);
    expect(harness.settlements.villages.size).toBe(0);
  });

  it('claims territory outward from its buildings', () => {
    for (let i = 0; i < 5; i++) {
      harness.entities.spawnEntity('elf', 15 + (i % 3), 15 + Math.floor(i / 3));
    }
    run(harness, 6);

    const village = Array.from(harness.settlements.villages.values())[0];
    expect(village.territory.size).toBeGreaterThan(20);

    // Every claimed tile must actually point back at the owning kingdom
    for (const instanceId of village.territory) {
      const { x, y } = harness.terrain.tileCoordsFromInstanceId(instanceId);
      expect(harness.tiles[x][y].ownerId).toBe(village.kingdomId);
    }
  });

  it('keeps villages apart instead of stacking them', () => {
    for (let i = 0; i < 5; i++) harness.entities.spawnEntity('human', 12 + (i % 3), 12);
    for (let i = 0; i < 5; i++) harness.entities.spawnEntity('human', 14 + (i % 3), 14);
    run(harness, 8);

    const centres = Array.from(harness.settlements.villages.values());
    for (let a = 0; a < centres.length; a++) {
      for (let b = a + 1; b < centres.length; b++) {
        const distance = Math.hypot(
          centres[a].centerX - centres[b].centerX,
          centres[a].centerY - centres[b].centerY,
        );
        expect(distance).toBeGreaterThanOrEqual(11);
      }
    }
  });
});

describe('kingdoms at war', () => {
  /**
   * Founding a village organically depends on wood and stone turning up in the
   * right place, so the diplomacy test builds two neighbouring realms directly
   * and then lets the same code path that runs in game decide what happens.
   */
  const seatTwoRivals = (harness: Harness) => {
    const kingdoms = [
      {
        id: 'kingdom-a', name: 'Aldreach', ruler: 'King Aldric', race: 'human' as const,
        colorHex: '#4f7fd6', villageIds: ['village-a'], atWar: [], tension: [] as Array<[string, number]>,
      },
      {
        id: 'kingdom-b', name: 'Grakhorde', ruler: 'Warchief Grak', race: 'orc' as const,
        colorHex: '#c8483f', villageIds: ['village-b'], atWar: [], tension: [] as Array<[string, number]>,
      },
    ];
    const villages = [
      {
        id: 'village-a', name: 'Aldford', kingdomId: 'kingdom-a', race: 'human' as const,
        centerX: 16, centerY: 20, store: { food: 20, wood: 20, stone: 20 },
        buildings: [
          { id: 'b1', kind: 'bonfire' as const, x: 16, y: 20, health: 120, maxHealth: 120 },
          { id: 'b2', kind: 'hall' as const, x: 17, y: 20, health: 260, maxHealth: 260 },
        ],
      },
      {
        id: 'village-b', name: 'Grakpit', kingdomId: 'kingdom-b', race: 'orc' as const,
        centerX: 28, centerY: 20, store: { food: 20, wood: 20, stone: 20 },
        buildings: [
          { id: 'b3', kind: 'bonfire' as const, x: 28, y: 20, health: 120, maxHealth: 120 },
          { id: 'b4', kind: 'hall' as const, x: 27, y: 20, health: 260, maxHealth: 260 },
        ],
      },
    ];
    harness.settlements.restore(kingdoms, villages);
  };

  it('grows friction along a shared border and eventually declares war', () => {
    const harness = makeHarness();
    seatTwoRivals(harness);

    // Border tiles must actually meet, otherwise there is nothing to argue over
    let contact = 0;
    for (let x = 1; x < harness.tiles.length - 1; x++) {
      for (let y = 1; y < harness.tiles.length - 1; y++) {
        const owner = harness.tiles[x][y].ownerId;
        if (!owner) continue;
        for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
          const other = harness.tiles[x + dx][y + dy].ownerId;
          if (other && other !== owner) contact++;
        }
      }
    }
    expect(contact).toBeGreaterThan(0);

    run(harness, 200, 1);

    const kingdoms = Array.from(harness.settlements.kingdoms.values());
    const tension = Math.max(...kingdoms.map((kingdom) => Math.max(0, ...kingdom.tension.values())));
    expect(tension).toBeGreaterThan(0);
    expect(harness.events.some((message) => message.includes('declares war'))).toBe(true);
  });

  it('razes a village when its bonfire falls', () => {
    const harness = makeHarness();
    seatTwoRivals(harness);

    const attackerA = harness.settlements.kingdoms.get('kingdom-a');
    const attackerB = harness.settlements.kingdoms.get('kingdom-b');
    attackerA?.atWar.add('kingdom-b');
    attackerB?.atWar.add('kingdom-a');

    // Park a warband on the enemy bonfire
    for (let i = 0; i < 4; i++) {
      const raider = harness.entities.spawnEntity('orc', 28, 20);
      if (raider) {
        raider.kingdomId = 'kingdom-b';
        raider.job = 'warrior';
      }
    }
    const bonfireTile = harness.tiles[16][20];
    for (const raider of harness.entities.getAllEntities()) {
      raider.position = { x: bonfireTile.x + 0.5, y: bonfireTile.y + 0.5 };
    }

    run(harness, 120, 1);

    expect(harness.settlements.villages.has('village-a')).toBe(false);
    expect(harness.events.some((message) => message.includes('razed'))).toBe(true);
    // The land is released, and the victor is free to claim it — which it does.
    expect(harness.tiles[16][20].ownerId).not.toBe('kingdom-a');
  });
});

describe('save round trip', () => {
  it('restores villages, buildings and kingdoms', () => {
    const harness = makeHarness();
    for (let i = 0; i < 5; i++) harness.entities.spawnEntity('dwarf', 20 + (i % 3), 20 + Math.floor(i / 3));
    run(harness, 10);

    const snapshot = harness.settlements.snapshot();
    expect(snapshot.villages.length).toBe(1);

    const savedKingdoms = snapshot.kingdoms.map((kingdom) => ({
      id: kingdom.id,
      name: kingdom.name,
      ruler: kingdom.ruler,
      race: kingdom.race,
      colorHex: kingdom.colorHex,
      villageIds: [...kingdom.villageIds],
      atWar: Array.from(kingdom.atWar),
      tension: Array.from(kingdom.tension.entries()),
    }));
    const savedVillages = snapshot.villages.map((village) => ({
      id: village.id,
      name: village.name,
      kingdomId: village.kingdomId,
      race: village.race,
      centerX: village.centerX,
      centerY: village.centerY,
      store: { ...village.store },
      buildings: village.buildings.map((building) => ({
        id: building.id,
        kind: building.kind,
        x: building.x,
        y: building.y,
        health: building.health,
        maxHealth: building.maxHealth,
      })),
    }));

    // A fresh world, then restore into it
    const fresh = makeHarness();
    fresh.settlements.restore(savedKingdoms, savedVillages);

    expect(fresh.settlements.villages.size).toBe(1);
    const restored = Array.from(fresh.settlements.villages.values())[0];
    expect(restored.name).toBe(savedVillages[0].name);
    expect(restored.buildings).toHaveLength(savedVillages[0].buildings.length);
    expect(restored.territory.size).toBeGreaterThan(0);
    expect(fresh.settlements.kingdomColorFor(restored.kingdomId)).toBe(savedKingdoms[0].colorHex);
  });
});
