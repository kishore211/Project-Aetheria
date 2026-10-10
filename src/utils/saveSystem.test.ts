import { describe, expect, it } from 'vitest';
import { buildSave, parseSaveFile, SAVE_VERSION } from './saveSystem';
import { generateWorld } from './worldGenerator';
import type { WorldLaws } from '../store/gameStore';
import { DEFAULT_WORLD_LAWS } from '../store/gameStore';
import { createEntity } from './entitySystemMinimal';

const laws: WorldLaws = { ...DEFAULT_WORLD_LAWS };

const world = () => ({
  seed: 777,
  size: 'custom' as const,
  customSize: 24,
  template: 'continents' as const,
  timeOfDay: 'day' as const,
  season: 'summer' as const,
  year: 3,
  day: 2,
  weather: 'clear' as const,
  laws,
});

const twoWorlds = () => ({
  live: generateWorld({ seed: 777, mapSize: 24 }).tilesData,
  pristine: generateWorld({ seed: 777, mapSize: 24 }).tilesData,
});

describe('buildSave', () => {
  it('stores nothing for an untouched world', () => {
    const { live, pristine } = twoWorlds();
    const save = buildSave({
      label: 'fresh', world: world(), liveTiles: live, pristineTiles: pristine,
      entities: [], villages: [], kingdoms: [],
    });

    expect(save.version).toBe(SAVE_VERSION);
    expect(save.tiles).toHaveLength(0);
  });

  it('records only the tiles the player changed', () => {
    const { live, pristine } = twoWorlds();
    live[5][7].height = 0.95;
    live[5][7].type = 'mountains';
    live[11][2].ownerId = 'kingdom-9';

    const save = buildSave({
      label: 'edited', world: world(), liveTiles: live, pristineTiles: pristine,
      entities: [], villages: [], kingdoms: [],
    });

    expect(save.tiles).toHaveLength(2);
    const mountain = save.tiles.find((delta) => delta.i === 5 * 24 + 7);
    expect(mountain?.t).toBe('mountains');
    expect(mountain?.h).toBeCloseTo(0.95, 4);
    const claimed = save.tiles.find((delta) => delta.i === 11 * 24 + 2);
    expect(claimed?.o).toBe('kingdom-9');
  });

  it('captures creatures with their traits and lineage intact', () => {
    const { live, pristine } = twoWorlds();
    const wolf = createEntity('wolf', 3.5, 4.5, ['swift', 'strong']);
    wolf.kills = 4;

    const save = buildSave({
      label: 'wolves', world: world(), liveTiles: live, pristineTiles: pristine,
      entities: [wolf], villages: [], kingdoms: [],
    });

    expect(save.entities).toHaveLength(1);
    expect(save.entities[0]).toMatchObject({
      type: 'wolf', x: 3.5, y: 4.5, kills: 4, traits: ['swift', 'strong'],
    });
  });

  it('survives a JSON round trip', () => {
    const { live, pristine } = twoWorlds();
    live[1][1].type = 'corrupted';
    const save = buildSave({
      label: 'trip', world: world(), liveTiles: live, pristineTiles: pristine,
      entities: [createEntity('human', 1, 1)], villages: [], kingdoms: [],
    });

    const restored = parseSaveFile(JSON.stringify(save));
    expect(restored).not.toBeNull();
    expect(restored?.tiles).toEqual(save.tiles);
    expect(restored?.entities[0].name).toBe(save.entities[0].name);
  });
});

describe('parseSaveFile', () => {
  it('rejects junk and mismatched versions', () => {
    expect(parseSaveFile('not json')).toBeNull();
    expect(parseSaveFile('null')).toBeNull();
    expect(parseSaveFile(JSON.stringify({ version: SAVE_VERSION + 1 }))).toBeNull();
    expect(parseSaveFile(JSON.stringify({ version: SAVE_VERSION }))).toBeNull();
  });
});

describe('everything phase 21 added to a creature', () => {
  it('goes into the save and comes back out of a fresh manager intact', async () => {
    const THREE = await import('three');
    const { EntityManager } = await import('./entityManagerMinimal');
    const { equip, forgeItem } = await import('./equipment');
    const { live, pristine } = twoWorlds();
    const knight = createEntity('human', 5.5, 5.5);
    equip(knight, forgeItem('weapon', 4, 'human', 'Ashby', () => 0.001));
    knight.clan = 'Oakwood';
    knight.parentIds = ['mum', 'dad'];
    knight.mind = { sleep: false };
    knight.favourite = true;
    const save = parseSaveFile(JSON.stringify(buildSave({
      label: 'knight', world: world(), liveTiles: live, pristineTiles: pristine,
      entities: [knight], villages: [], kingdoms: [],
    })))!;
    const manager = new EntityManager(generateWorld({ seed: 777, mapSize: 24 }).tilesData, new THREE.Scene());
    const back = manager.restoreEntity(save.entities[0])!;
    expect(back.equipment?.weapon?.material).toBe(knight.equipment?.weapon?.material);
    expect(back.equipment?.weapon?.name).toBe(knight.equipment?.weapon?.name);
    expect(back.equipment?.weapon).not.toBe(knight.equipment?.weapon);
    expect(back.clan).toBe('Oakwood');
    expect(back.parentIds).toEqual(['mum', 'dad']);
    expect(back.mind).toEqual({ sleep: false });
    expect(back.favourite).toBe(true);
  });
});
