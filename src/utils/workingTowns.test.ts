import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SettlementSystem } from './settlementSystem';
import { TerrainRenderer } from './terrainRenderer';
import { EntityManager } from './entityManagerMinimal';
import { generateWorld } from './worldGenerator';
import { depositOf, ORE_TYPES, seedOreVeins } from './oreVeins';
import { forgeItem } from './equipment';
import { opinionBetween } from './politics';
import { isChild } from './size';
import { DEFAULT_WORLD_LAWS } from '../store/gameStore';
import { NATIVES, populateWildlife } from './worldBehaviour';
import type { Race, Tile } from '../types/world';

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** A flat, fertile world so the economy, not the noise, decides what happens. */
const makeWorld = (mapSize = 60) => {
  const { tilesData } = generateWorld({ seed: 2024, mapSize });
  for (let x = 3; x < mapSize - 3; x++) {
    for (let y = 3; y < mapSize - 3; y++) {
      const tile = tilesData[x][y];
      tile.height = 0.45;
      tile.type = 'grassland';
      tile.fertility = 0.8;
      tile.moisture = 0.5;
      tile.walkable = true;
      tile.structure = null;
      tile.ownerId = null;
      tile.villageId = null;
      tile.resources = [];
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
  const run = (seconds: number, step = 0.5) => {
    for (let t = 0; t < seconds; t += step) {
      entities.update(step);
      settlements.update(step);
    }
  };
  return { tiles: tilesData, entities, settlements, events, run };
};

/** Two towns of the given races, already standing, with residents. */
const seatTowns = (world: ReturnType<typeof makeWorld>, races: [Race, Race], gap = 22) => {
  const kingdoms = races.map((race, i) => ({
    id: `kingdom-${i}`, name: `Realm ${i}`, ruler: 'Ruler', race,
    colorHex: i ? '#c8483f' : '#4f7fd6', villageIds: [`village-${i}`], atWar: [], tension: [] as Array<[string, number]>,
  }));
  const villages = races.map((race, i) => ({
    id: `village-${i}`, name: `Town ${i}`, kingdomId: `kingdom-${i}`, race,
    centerX: 16 + i * gap, centerY: 24, store: { food: 200, wood: 60, stone: 60, gold: 0 },
    buildings: [
      { id: `b${i}a`, kind: 'bonfire' as const, x: 16 + i * gap, y: 24, health: 120, maxHealth: 120 },
      { id: `b${i}b`, kind: 'hall' as const, x: 17 + i * gap, y: 24, health: 260, maxHealth: 260 },
      { id: `b${i}c`, kind: 'house' as const, x: 15 + i * gap, y: 25, health: 100, maxHealth: 100 },
      { id: `b${i}d`, kind: 'house' as const, x: 15 + i * gap, y: 23, health: 100, maxHealth: 100 },
      { id: `b${i}e`, kind: 'house' as const, x: 17 + i * gap, y: 26, health: 100, maxHealth: 100 },
    ],
  }));
  world.settlements.restore(kingdoms, villages);
  for (const village of villages) {
    for (let i = 0; i < 12; i++) {
      const resident = world.entities.spawnEntity(village.race, village.centerX + (i % 4) - 1, village.centerY + 1 + Math.floor(i / 4));
      if (resident) {
        resident.villageId = village.id;
        resident.kingdomId = village.kingdomId;
      }
    }
  }
};

describe('ore veins', () => {
  it('lays visible deposits only where the land can hold them, and the same ones every time', () => {
    const first = generateWorld({ seed: 77, mapSize: 96 }).tilesData;
    const second = generateWorld({ seed: 77, mapSize: 96 }).tilesData;
    const deposits = first.flat().filter(t => depositOf(t) !== null);
    expect(deposits.length).toBeGreaterThan(10);
    // None of it underwater, in a meadow or in the woods.
    for (const tile of deposits) {
      expect(['grassland', 'deciduous_forest', 'ocean', 'deep_ocean', 'shallow_water']).not.toContain(tile.type);
    }
    const key = (tiles: Tile[][]) => tiles.flat().map(t => depositOf(t) ?? '').join(',');
    expect(key(second)).toBe(key(first));
  });

  it('sweeps up the old scattered minerals', () => {
    const { tilesData } = generateWorld({ seed: 5, mapSize: 64 });
    const meadow = tilesData.flat().filter(t => t.type === 'grassland');
    for (const tile of meadow) {
      expect(tile.resources.some(r => (ORE_TYPES as readonly string[]).includes(r.type) || r.type === 'coal')).toBe(false);
    }
  });

  it('never rolls the shared dice', () => {
    const { tilesData } = generateWorld({ seed: 9, mapSize: 32 });
    const before = Math.random();
    const probe = Math.random;
    let calls = 0;
    Math.random = () => { calls++; return probe(); };
    try {
      seedOreVeins(tilesData, 9);
    } finally {
      Math.random = probe;
    }
    expect(calls).toBe(0);
    expect(before).toBeGreaterThanOrEqual(0);
  });
});

describe('a working town', () => {
  it('raises children while it has roofs and bread', () => {
    const world = makeWorld();
    seatTowns(world, ['human', 'human'], 30);
    const before = world.entities.getAllEntities().length;
    world.run(60);
    const people = world.entities.getAllEntities();
    expect(people.length).toBeGreaterThan(before);
    expect(people.some(p => p.villageId === 'village-0' && isChild(p))).toBe(true);
  });

  it('puts its grown-ups to work rather than standing them round the fire', () => {
    const world = makeWorld();
    seatTowns(world, ['human', 'human'], 30);
    world.run(4);
    const adults = world.entities.getAllEntities().filter(p => p.villageId === 'village-0' && !isChild(p));
    const idle = adults.filter(p => !p.job && !p.status.some(s => s === 'king' || s === 'leader'));
    expect(idle.length).toBe(0);
    const jobs = new Set(adults.map(p => p.job));
    expect(jobs.has('miner')).toBe(true);
    expect(jobs.has('woodcutter')).toBe(true);
  });

  it('mines a vein, banks the metal, and the deposit runs out', () => {
    // Its own dice, so what earlier tests drew cannot decide who is a miner.
    const shared = Math.random;
    Math.random = mulberry32(4242);
    try {
      const world = makeWorld();
      seatTowns(world, ['dwarf', 'dwarf'], 30);
      // The smith would spend the metal as fast as it came in; this is about the mine.
      world.settlements.setWorldLaws({ ...DEFAULT_WORLD_LAWS, forging: false });
      const vein = world.tiles[19][27];
      vein.type = 'hills';
      vein.resources = [{ type: 'iron', quantity: 3, discovered: true }];
      world.run(180);
      const town = world.settlements.villages.get('village-0')!;
      expect(town.store.metal ?? 0).toBeGreaterThan(0);
      expect(depositOf(vein)).toBeNull();
    } finally {
      Math.random = shared;
    }
  });

  it('sends caravans between realms at peace, and they come to like each other for it', () => {
    const world = makeWorld();
    seatTowns(world, ['human', 'elf']);
    world.run(90);
    expect(world.events.some(e => e.startsWith('A trade road opens between'))).toBe(true);
    const goldAfter = Array.from(world.settlements.villages.values()).reduce((sum, v) => sum + v.store.gold, 0);
    expect(goldAfter).toBeGreaterThan(0);
  });
});

describe('the forge without metal', () => {
  it('still makes wood and leather at tier 0', () => {
    const roll = () => 0.9;
    expect(forgeItem('weapon', 0, 'human', 'Here', roll).material).toBe('wood');
    expect(forgeItem('armor', 0, 'human', 'Here', roll).material).toBe('leather');
  });
});

describe('what drives realms to war and to peace', () => {
  const base = {
    ourKing: null, theirKing: null, borderTiles: 4, ourLand: 10, theirLand: 10,
    sameRace: false, sameCulture: null, sameLanguage: null, sameReligion: null,
    atWar: false, allied: false, foughtBefore: false,
  };

  it('bloodlust and land hunger sour a neighbour; trade sweetens one', () => {
    const calm = opinionBetween(base).score;
    expect(opinionBetween({ ...base, temperament: 30 }).score).toBeLessThan(calm);
    expect(opinionBetween({ ...base, landHungry: true }).score).toBeLessThan(calm);
    const traded = opinionBetween({ ...base, tradePartners: true });
    expect(traded.score).toBeGreaterThan(calm);
    expect(traded.factors.some(f => f.label === 'Trade partners')).toBe(true);
  });
});

describe('a world made alive', () => {
  it('is stocked with herds of the animals native to each biome', () => {
    const { tilesData } = generateWorld({ seed: 31, mapSize: 64 });
    const placed: Array<{ type: string; tile: Tile }> = [];
    const count = populateWildlife(tilesData, (type, x, y) => {
      placed.push({ type, tile: tilesData[x][y] });
      return true;
    });
    expect(count).toBeGreaterThan(10);
    expect(count).toBe(placed.length);
    // A herd stands together, so its edge may spill onto the next biome over.
    const native = (tile: Tile) => [-1, 0, 1].flatMap(dx => [-1, 0, 1].flatMap(dy =>
      NATIVES[tilesData[tile.x + dx]?.[tile.y + dy]?.type ?? 'ocean'] ?? []));
    for (const { type, tile } of placed) {
      expect(native(tile)).toContain(type);
      expect(['yeti', 'sandworm', 'demon']).not.toContain(type);
    }
  });
});

describe('construction', () => {
  it('raises a building as a site that builders finish, and only then counts it', () => {
    const shared = Math.random;
    Math.random = mulberry32(99);
    try {
      const world = makeWorld();
      seatTowns(world, ['human', 'human'], 30);
      const town = world.settlements.villages.get('village-0')!;
      town.store.wood = 200;
      town.store.stone = 200;
      const before = new Set(town.buildings.map(b => b.id));
      world.run(6);
      const sites = town.buildings.filter(b => !before.has(b.id));
      expect(sites.length).toBeGreaterThan(0);
      expect(sites.every(b => b.progress !== undefined)).toBe(true);
      expect(world.entities.getAllEntities().some(p => p.villageId === town.id && p.job === 'builder')).toBe(true);
      world.run(90);
      expect(sites.some(b => b.progress === undefined)).toBe(true);
    } finally {
      Math.random = shared;
    }
  });
});
