import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { SettlementSystem, footprintOf, tierOf } from './settlementSystem';
import { matchesTopic } from './chronicle';
import { TerrainRenderer } from './terrainRenderer';
import { EntityManager } from './entityManagerMinimal';
import { generateWorld } from './worldGenerator';
import { DEFAULT_WORLD_LAWS } from '../store/gameStore';
import type { Tile } from '../types/world';

/**
 * The same generator the test setup seeds `Math.random` with, so a test that
 * samples several streams can pick its own rather than reruns of one.
 */
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

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
    // Asserted by topic, not by prose: the chronicle writes each event
    // several ways, and pinning a test to one wording makes it break when the
    // writing grows rather than when the behaviour does.
    expect(harness.events.some((message) => matchesTopic(message, 'kingdom_founded'))).toBe(true);
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

  // Villages need residents or the decay pass will (correctly) abandon them
  for (const village of villages) {
    for (let i = 0; i < 6; i++) {
      const resident = harness.entities.spawnEntity(
        village.race,
        village.centerX + (i % 3),
        village.centerY + 1 + Math.floor(i / 3),
      );
      if (resident) {
        resident.villageId = village.id;
        resident.kingdomId = village.kingdomId;
        resident.job = 'gatherer';
      }
    }
  }
};

describe('kingdoms at war', () => {

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

    // Sample as it runs: by the end one side may have conquered the other, and
    // a fallen kingdom's grudges are wiped from the survivor's ledger.
    let peakTension = 0;
    for (let elapsed = 0; elapsed < 200; elapsed++) {
      harness.entities.update(1);
      harness.settlements.update(1);
      for (const kingdom of harness.settlements.kingdoms.values()) {
        for (const value of kingdom.tension.values()) {
          peakTension = Math.max(peakTension, value);
        }
      }
    }

    expect(peakTension).toBeGreaterThan(0);
    expect(harness.events.some((message) => matchesTopic(message, 'war_declared'))).toBe(true);
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

  it('captures a town rather than burning it when the victors are not orcs', () => {
    const harness = makeHarness();
    seatTwoRivals(harness);
    harness.settlements.kingdoms.get('kingdom-a')?.atWar.add('kingdom-b');
    harness.settlements.kingdoms.get('kingdom-b')?.atWar.add('kingdom-a');

    const raiders = [];
    for (let i = 0; i < 4; i++) {
      const raider = harness.entities.spawnEntity('human', 28, 20);
      if (!raider) continue;
      raider.kingdomId = 'kingdom-a';
      raider.job = 'warrior';
      raiders.push(raider);
    }
    for (let t = 0; t < 120; t++) {
      // Hold them on the bonfire: this is about the siege, not the march.
      for (const raider of raiders) raider.position = { x: 28.5, y: 20.5 };
      harness.entities.update(1);
      harness.settlements.update(1);
      if (harness.settlements.villages.get('village-b')?.kingdomId === 'kingdom-a') break;
    }

    const town = harness.settlements.villages.get('village-b');
    expect(town?.kingdomId).toBe('kingdom-a');
    expect(harness.events.some((message) => message.includes('falls to Aldreach'))).toBe(true);
    // The land and the people went with it.
    expect(harness.tiles[28][20].ownerId).toBe('kingdom-a');
    const people = harness.entities.getAllEntities().filter(e => e.villageId === 'village-b');
    expect(people.length).toBeGreaterThan(0);
    expect(people.every(e => e.kingdomId === 'kingdom-a')).toBe(true);
  });
});

describe('the forge', () => {
  it('arms the captain and the warriors first, from the town store', () => {
    const harness = makeHarness();
    seatTwoRivals(harness);
    const town = harness.settlements.villages.get('village-a')!;
    town.store.wood = 200;
    town.store.stone = 200;
    town.store.gold = 200;
    const folk = harness.entities.getAllEntities().filter(e => e.villageId === 'village-a');
    for (const f of folk.slice(0, 3)) f.job = 'warrior';
    run(harness, 60, 1);
    const armed = harness.entities.getAllEntities().filter(e => e.villageId === 'village-a' && e.equipment?.weapon);
    expect(armed.length).toBeGreaterThan(0);
    // Nobody without a martial claim is handed a sword ahead of those with one.
    for (const e of armed) {
      expect(e.job === 'warrior' || e.status.some(s => s === 'captain' || s === 'leader' || s === 'king')).toBe(true);
    }
    expect(town.store.wood).toBeLessThan(200);
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

describe('colonisation', () => {
  // Sampled across streams rather than asserted on one, because whether a
  // village can spare a party in the time given is emergent: it depends on
  // births, food, and where the wandering settlers happen to stop. Pinned to a
  // single stream this passed for the wrong reason — any unrelated change that
  // consumed a different amount of randomness (one more `THREE.Texture`, whose
  // uuid costs four draws) flipped it, and a red test that means nothing is
  // worse than no test.
  it('sends settlers out and founds a second village from them', () => {
    const STREAMS = 12;
    let colonised = 0;
    let announced = 0;

    for (let stream = 0; stream < STREAMS; stream++) {
      Math.random = mulberry32(1000 + stream * 7919);
      const harness = makeHarness(70);
      // A healthy starting population: enough to spare a party
      for (let i = 0; i < 14; i++) {
        harness.entities.spawnEntity('human', 30 + (i % 4), 30 + Math.floor(i / 4));
      }

      run(harness, 20);
      expect(harness.settlements.villages.size).toBe(1);

      // Give the founding village time to settle in, then colonise
      run(harness, 160, 1);

      const kingdom = Array.from(harness.settlements.kingdoms.values())[0];
      if (kingdom.villageIds.length > 1) {
        colonised++;
        // A daughter village nobody hears about is a daughter village the
        // chronicle cannot tell a story from, so the events are checked on
        // exactly the runs that produced one.
        if (
          harness.events.some((message) => matchesTopic(message, 'settlers_leave'))
          && harness.events.some((message) => matchesTopic(message, 'village_settled_from'))
        ) {
          announced++;
        }
      }
    }

    expect(colonised).toBeGreaterThanOrEqual(8);
    expect(announced).toBe(colonised);
  });

  it('marks exactly one capital per kingdom', () => {
    const harness = makeHarness(70);
    for (let i = 0; i < 14; i++) {
      harness.entities.spawnEntity('human', 30 + (i % 4), 30 + Math.floor(i / 4));
    }
    run(harness, 180, 1);

    for (const kingdom of harness.settlements.kingdoms.values()) {
      const capitals = kingdom.villageIds
        .map((id) => harness.settlements.villages.get(id))
        .filter((village) => village?.capital);
      expect(capitals.length).toBe(1);
    }
  });

  it('keeps new villages a decent distance apart', () => {
    const harness = makeHarness(70);
    for (let i = 0; i < 14; i++) {
      harness.entities.spawnEntity('human', 30 + (i % 4), 30 + Math.floor(i / 4));
    }
    run(harness, 200, 1);

    const villages = Array.from(harness.settlements.villages.values());
    for (let a = 0; a < villages.length; a++) {
      for (let b = a + 1; b < villages.length; b++) {
        expect(Math.hypot(
          villages[a].centerX - villages[b].centerX,
          villages[a].centerY - villages[b].centerY,
        )).toBeGreaterThanOrEqual(16);
      }
    }
  });
});

describe('territory', () => {
  it('claims a village-sized area, not a handful of tiles', () => {
    const harness = makeHarness();
    for (let i = 0; i < 6; i++) harness.entities.spawnEntity('human', 20 + (i % 3), 20);
    run(harness, 30);

    const village = Array.from(harness.settlements.villages.values())[0];
    // A WorldBox village starts at 3x3 zones of 8x8 tiles; ours should be in
    // the same league rather than the ~50 tiles it used to claim.
    expect(village.territory.size).toBeGreaterThan(120);
  });

  it('creeps outward as the village builds up', () => {
    const harness = makeHarness();
    for (let i = 0; i < 8; i++) harness.entities.spawnEntity('human', 20 + (i % 3), 20 + Math.floor(i / 3));
    run(harness, 30);

    const village = Array.from(harness.settlements.villages.values())[0];
    const early = village.territory.size;

    run(harness, 120, 1);
    expect(village.claimBonus).toBeGreaterThan(0);
    expect(village.territory.size).toBeGreaterThan(early);
  });
});

describe('decay', () => {
  it('abandons a village whose people are all gone and frees its land', () => {
    const harness = makeHarness();
    for (let i = 0; i < 6; i++) harness.entities.spawnEntity('human', 20 + (i % 3), 20);
    run(harness, 30);

    const village = Array.from(harness.settlements.villages.values())[0];
    expect(village).toBeDefined();
    const claimed = Array.from(village.territory);
    expect(claimed.length).toBeGreaterThan(0);

    for (const entity of harness.entities.getAllEntities()) {
      harness.entities.killEntity(entity, 'divine');
    }

    run(harness, 60, 1);

    expect(harness.settlements.villages.has(village.id)).toBe(false);
    for (const instanceId of claimed) {
      const { x, y } = harness.terrain.tileCoordsFromInstanceId(instanceId);
      expect(harness.tiles[x][y].ownerId).toBeNull();
    }
    expect(harness.events.some((message) => matchesTopic(message, 'village_abandoned'))).toBe(true);
  });
});

describe('village life', () => {
  it('gives villagers somewhere to be — they stay near home', () => {
    const harness = makeHarness(60);
    for (let i = 0; i < 10; i++) harness.entities.spawnEntity('human', 30 + (i % 3), 30 + Math.floor(i / 3));
    run(harness, 30);

    const village = Array.from(harness.settlements.villages.values())[0];
    expect(village).toBeDefined();

    run(harness, 120, 1);

    const residents = harness.entities.getAllEntities().filter(e => e.villageId === village.id);
    expect(residents.length).toBeGreaterThan(0);
    // Nobody should have drifted to the far side of the map
    for (const resident of residents) {
      expect(Math.hypot(
        resident.position.x - village.centerX,
        resident.position.y - village.centerY,
      )).toBeLessThan(26);
    }
  });

  it('satisfies the social need at the bonfire instead of letting it drain away', () => {
    const harness = makeHarness(60);
    for (let i = 0; i < 10; i++) harness.entities.spawnEntity('human', 30 + (i % 3), 30 + Math.floor(i / 3));
    run(harness, 30);

    // Empty everyone out socially and let the village get on with it
    for (const entity of harness.entities.getAllEntities()) entity.needs.social = 0.05;
    run(harness, 90, 1);

    const residents = harness.entities.getAllEntities().filter(e => e.villageId);
    expect(residents.length).toBeGreaterThan(0);
    const best = Math.max(...residents.map(r => r.needs.social));
    expect(best).toBeGreaterThan(0.3);
  });

  it('staffs fewer gatherers once the granary is full', () => {
    const harness = makeHarness(60);
    for (let i = 0; i < 12; i++) harness.entities.spawnEntity('human', 30 + (i % 4), 30 + Math.floor(i / 4));
    run(harness, 40);

    const village = Array.from(harness.settlements.villages.values())[0];
    village.store.food = 200;
    run(harness, 10, 1);

    const gatherers = harness.entities.getAllEntities()
      .filter(e => e.villageId === village.id && e.job === 'gatherer');
    expect(gatherers.length).toBeLessThanOrEqual(1);
  });

  it('appoints one captain per village once there are warriors', () => {
    const harness = makeHarness(60);
    for (let i = 0; i < 14; i++) harness.entities.spawnEntity('human', 30 + (i % 4), 30 + Math.floor(i / 4));
    run(harness, 40);

    const village = Array.from(harness.settlements.villages.values())[0];
    const residents = harness.entities.getAllEntities().filter(e => e.villageId === village.id);
    const warriors = residents.filter(e => e.job === 'warrior');
    expect(warriors.length).toBeGreaterThan(0);

    const captains = residents.filter(e => e.status.includes('captain'));
    expect(captains.length).toBe(1);
    expect(captains[0].job).toBe('warrior');
  });
});

describe('building tiers', () => {
  /** Grow a village until it can afford the one thing that outgrows its tile. */
  const raiseAHall = (harness: Harness) => {
    for (let i = 0; i < 10; i++) {
      harness.entities.spawnEntity('human', 20 + (i % 4), 20 + Math.floor(i / 4));
    }
    run(harness, 30);
    for (let round = 0; round < 12; round += 1) {
      const village = Array.from(harness.settlements.villages.values())[0];
      if (!village) break;
      // Hand them the timber rather than waiting out a forestry economy: what
      // is under test is where a hall stands, not how long it takes to pay for.
      village.store.wood = 200;
      village.store.stone = 200;
      run(harness, 40, 1);
      if (village.buildings.some(b => footprintOf(b.kind) > 1)) break;
    }
    const village = Array.from(harness.settlements.villages.values())[0];
    return village.buildings.find(b => footprintOf(b.kind) > 1);
  };

  it('gives every recipe a tier, and only tier three outgrows its tile', () => {
    for (const kind of ['tent', 'house', 'farm', 'mine', 'tower', 'statue', 'temple', 'hall']) {
      expect(tierOf(kind)).toBeGreaterThanOrEqual(1);
      expect(footprintOf(kind)).toBe(tierOf(kind) === 3 ? 2 : 1);
    }
  });

  it('stands a tier-three building on all four of its tiles', () => {
    const harness = makeHarness();
    const big = raiseAHall(harness);
    expect(big).toBeDefined();
    if (!big) return;

    const village = Array.from(harness.settlements.villages.values())[0];
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const tile = harness.tiles[big.x + dx][big.y + dy];
      expect(tile.villageId).toBe(village.id);
    }
  });

  it('comes down when its far corner is demolished, not just its anchor', () => {
    const harness = makeHarness();
    const big = raiseAHall(harness);
    expect(big).toBeDefined();
    if (!big) return;

    const village = Array.from(harness.settlements.villages.values())[0];
    const before = village.buildings.length;
    // The opposite corner from the anchor: a footprint search that only ever
    // matched the anchor tile would silently miss this and leave the village
    // believing in a building that is no longer drawn.
    expect(harness.settlements.demolishAt(big.x + 1, big.y + 1)).toBe(true);
    expect(village.buildings.length).toBe(before - 1);
    expect(harness.tiles[big.x][big.y].villageId).toBeNull();
    expect(harness.tiles[big.x + 1][big.y + 1].villageId).toBeNull();
  });
});

describe('a town growing up', () => {
  it('rebuilds its houses in stone once it has a hall, and as manors once it has a temple', () => {
    const harness = makeHarness();
    seatTwoRivals(harness);
    const town = harness.settlements.villages.get('village-a')!;
    town.store.wood = 500;
    town.store.stone = 500;
    town.store.gold = 500;
    const inner = harness.settlements as unknown as {
      placeBuilding(v: unknown, k: string, x: number, y: number): void;
      upgradeRound(): void;
    };
    inner.placeBuilding(town, 'house', 14, 22);
    inner.placeBuilding(town, 'house', 18, 22);
    const levels = () => town.buildings.filter(b => b.kind === 'house').map(b => b.level ?? 1).sort();
    const houses = () => town.buildings.filter(b => b.kind === 'house');

    // One house a round, lowest first: two rounds raise both to stone, and
    // with only a hall that is as far as it goes.
    for (let i = 0; i < 5; i++) inner.upgradeRound();
    expect(levels()).toEqual([2, 2]);
    const stoneHealth = houses()[0].maxHealth;

    inner.placeBuilding(town, 'temple', 16, 24);
    for (let i = 0; i < 5; i++) inner.upgradeRound();
    expect(levels()).toEqual([3, 3]);
    expect(houses()[0].maxHealth).toBeGreaterThan(stoneHealth);
    expect(town.store.stone).toBe(500 - 2 * 6 - 2 * 12);
  });
});

describe('watchtowers', () => {
  it('shoot the monster at the gate and leave the townsfolk alone', () => {
    const harness = makeHarness();
    seatTwoRivals(harness);
    const town = harness.settlements.villages.get('village-a')!;
    (harness.settlements as unknown as { placeBuilding(v: unknown, k: string, x: number, y: number): void })
      .placeBuilding(town, 'tower', 16, 23);
    const zombie = harness.entities.spawnEntity('zombie', 17, 24)!;
    const local = harness.entities.getAllEntities().find(e => e.villageId === 'village-a')!;
    const zombieStart = zombie.health;
    const localStart = local.health;
    for (let i = 0; i < 6; i++) {
      zombie.position = { x: 17.5, y: 24.5 };
      harness.settlements.update(0.5);
    }
    expect(zombie.health).toBeLessThan(zombieStart);
    expect(local.health).toBe(localStart);
  });
});
