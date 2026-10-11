import { describe, expect, it } from 'vitest';
import { BIOME_SEEDS, PowerHazards, runExtraPower, SPAWNABLE, TERRAIN_BRUSHES, type PowerContext } from './extraPowers';
import { POWERS } from './powers';
import { isWaterBiome, type BiomeType, type Entity, type EntityType, type Tile } from '../types/world';

const makeTile = (x: number, y: number, type: BiomeType = 'grassland', height = 0.4): Tile => ({
  x, y, type, height, temperature: 0.5, moisture: 0.5, fertility: 0.5, variant: 0.5,
  structure: null, resources: [], entities: [], population: 0, isOnFire: false,
}) as unknown as Tile;

const makeCreature = (type: EntityType, x: number, y: number): Entity => ({
  id: `${type}-${x}-${y}-${Math.random()}`, type, name: type, age: 1, maxAge: 99,
  health: 100, maxHealth: 100, position: { x, y }, status: [],
  attributes: { strength: 5, intelligence: 5, speed: 5, resilience: 5 },
  needs: { hunger: 1, thirst: 1, rest: 1, social: 1 }, inventory: [],
}) as unknown as Entity;

const world = (size = 24, typeAt: (x: number, y: number) => BiomeType = () => 'grassland') => {
  const tiles = Array.from({ length: size }, (_, x) => Array.from({ length: size }, (_, y) => {
    const type = typeAt(x, y);
    return makeTile(x, y, type, isWaterBiome(type) ? 0.15 : 0.4);
  }));
  const creatures: Entity[] = [];
  const events: string[] = [];
  const diplomacyCalls: string[] = [];
  const ctx: PowerContext = {
    tiles,
    brushRadius: 0,
    inBounds: (x, y) => x >= 0 && y >= 0 && x < size && y < size,
    forEachBrushTile: (center, radius, visit) => {
      const r = Math.ceil(radius);
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          const x = center.x + dx;
          const y = center.y + dy;
          const d = Math.hypot(dx, dy);
          if (x < 0 || y < 0 || x >= size || y >= size || d > radius + 0.5) continue;
          visit(tiles[x][y], d);
        }
      }
    },
    reshape: (tile, height, type) => {
      tile.height = Math.max(0, Math.min(1, height));
      tile.type = type ?? (tile.height < 0.25 ? 'shallow_water' : tile.height > 0.8 ? 'mountains' : 'grassland');
    },
    sync: () => {},
    ignite: (tile) => { tile.isOnFire = true; return true; },
    extinguish: (tile) => { tile.isOnFire = false; },
    query: (x, y, radius) => creatures.filter(c => Math.hypot(c.position.x - x, c.position.y - y) <= radius),
    spawn: (type, x, y) => {
      const c = makeCreature(type, x, y);
      creatures.push(c);
      return c;
    },
    damageArea: (x, y, radius, damage) => {
      let kills = 0;
      for (const c of creatures) {
        if (Math.hypot(c.position.x - x, c.position.y - y) > radius) continue;
        if (c.status.includes('shielded')) continue;
        c.health -= damage;
        if (c.health <= 0) kills++;
      }
      return kills;
    },
    healArea: (x, y, radius, amount) => {
      let n = 0;
      for (const c of creatures) {
        if (Math.hypot(c.position.x - x, c.position.y - y) > radius) continue;
        c.health = Math.min(c.maxHealth, c.health + amount);
        n++;
      }
      return n;
    },
    demolishAt: () => {},
    cancelPlotsBy: () => 0,
    diplomacy: (act) => { diplomacyCalls.push(act); return act === 'friendship' ? 'peace' : null; },
    summonCloud: () => {},
    announce: (message) => { events.push(message); },
    fx: { burst: () => {}, aura: () => {}, shockwave: () => {} },
    sound: { terraform: () => {}, boom: () => {}, quake: () => {}, fire: () => {}, bless: () => {}, curse: () => {}, click: () => {} },
    shake: () => {},
    flash: () => {},
    random: () => 0.5,
  };
  return { tiles, creatures, events, diplomacyCalls, ctx, hazards: new PowerHazards() };
};

describe('the rest of the power bar', () => {
  it('has a catalogue entry for every power it implements, and the reverse', () => {
    const ids = new Set(POWERS.map(p => p.id as string));
    for (const id of Object.keys(TERRAIN_BRUSHES)) expect(ids.has(id), id).toBe(true);
    for (const id of Object.keys(BIOME_SEEDS)) expect(ids.has(id), id).toBe(true);
    for (const type of SPAWNABLE) expect(ids.has(`spawn-${type}`), type).toBe(true);
    // Every catalogue entry must actually do something when used somewhere
    // sensible — an unknown id falls through to `null`.
    const { ctx, hazards, tiles } = world();
    const handledByEngine = new Set([
      'select', 'raise-terrain', 'lower-terrain', 'place-water', 'place-mountain', 'place-forest',
      'spawn-human', 'spawn-elf', 'spawn-dwarf', 'spawn-orc', 'uplift', 'spawn-animal', 'spawn-monster',
      'plant-trees', 'unearth-minerals', 'summon-rain', 'earthquake', 'meteor', 'lightning', 'fire',
      'blessing', 'curse', 'poke', 'erase-forest', 'erase-life', 'erase-buildings', 'douse', 'magnet',
    ]);
    for (const power of POWERS) {
      if (handledByEngine.has(power.id)) continue;
      expect(runExtraPower(power.id, tiles[12][12], ctx, hazards), power.id).not.toBeNull();
    }
  });

  it('paints terrain by height', () => {
    const { ctx, hazards, tiles } = world();
    runExtraPower('paint-deep', tiles[5][5], ctx, hazards);
    expect(tiles[5][5].type).toBe('deep_ocean');
    runExtraPower('paint-summit', tiles[6][6], ctx, hazards);
    expect(tiles[6][6].type).toBe('mountains');
    expect(tiles[6][6].height).toBeGreaterThan(0.9);
  });

  it('seeds a biome on land and leaves the sea alone', () => {
    const { ctx, hazards, tiles } = world(24, (x) => (x < 12 ? 'grassland' : 'ocean'));
    expect(runExtraPower('seed-desert', tiles[5][5], ctx, hazards)).toBe(true);
    expect(tiles[5][5].type).toBe('desert');
    expect(runExtraPower('seed-desert', tiles[20][5], ctx, hazards)).toBe(false);
    expect(tiles[20][5].type).toBe('ocean');
  });

  it('refuses to put a fish on dry land or a wolf in the sea', () => {
    const { ctx, hazards, tiles, creatures } = world(24, (x) => (x < 12 ? 'grassland' : 'ocean'));
    expect(runExtraPower('spawn-fish', tiles[5][5], ctx, hazards)).toBe(false);
    expect(runExtraPower('spawn-wolf', tiles[20][5], ctx, hazards)).toBe(false);
    expect(runExtraPower('spawn-fish', tiles[20][5], ctx, hazards)).toBe(true);
    expect(runExtraPower('spawn-wolf', tiles[5][5], ctx, hazards)).toBe(true);
    expect(creatures.map(c => c.type).sort()).toEqual(['fish', 'wolf']);
  });

  it('infects people with plague and leaves animals alone', () => {
    const { ctx, hazards, tiles, creatures } = world();
    creatures.push(makeCreature('human', 12, 12), makeCreature('sheep', 12, 12.5));
    expect(runExtraPower('plague', tiles[12][12], ctx, hazards)).toBe(true);
    expect(creatures[0].status).toContain('infected');
    expect(creatures[1].status).not.toContain('infected');
  });

  it('shields creatures from a bomb', () => {
    const { ctx, hazards, tiles, creatures } = world();
    const shielded = makeCreature('human', 12, 12);
    const exposed = makeCreature('human', 12.4, 12);
    creatures.push(shielded, exposed);
    runExtraPower('shield', tiles[12][12], { ...ctx, query: () => [shielded] }, hazards);
    runExtraPower('bomb', tiles[12][12], ctx, hazards);
    expect(shielded.health).toBe(100);
    expect(exposed.health).toBeLessThanOrEqual(0);
  });

  it('cures plague and madness with divine light', () => {
    const { ctx, hazards, tiles, creatures } = world();
    const sick = makeCreature('human', 12, 12);
    sick.status.push('infected', 'enraged');
    creatures.push(sick);
    runExtraPower('divine-light', tiles[12][12], ctx, hazards);
    expect(sick.status).not.toContain('infected');
    expect(sick.status).not.toContain('enraged');
  });

  it('refuses when status powers have nobody to touch', () => {
    const { ctx, hazards, tiles } = world();
    expect(runExtraPower('coffee', tiles[3][3], ctx, hazards)).toBe(false);
    expect(runExtraPower('clone', tiles[3][3], ctx, hazards)).toBe(false);
  });

  it('leaves an atomic crater of ash', () => {
    const { ctx, hazards, tiles, events } = world();
    expect(runExtraPower('atomic', tiles[12][12], ctx, hazards)).toBe(true);
    expect(tiles[12][12].type === 'ashland' || isWaterBiome(tiles[12][12].type)).toBe(true);
    expect(tiles[12][16].type).not.toBe('grassland');
    // No "0 gone" when the blast found nobody.
    expect(events.at(-1)).not.toMatch(/\b0 gone/);
  });

  it('sends a tornado walking, and it uproots what it crosses', () => {
    const { ctx, hazards, tiles } = world();
    for (const column of tiles) for (const tile of column) tile.structure = { type: 'mature_tree', health: 100 };
    runExtraPower('tornado', tiles[12][12], ctx, hazards);
    expect(hazards.active).toBe(1);
    for (let i = 0; i < 40; i++) hazards.update(0.1, ctx);
    const uprooted = tiles.flat().filter(t => t.structure === null).length;
    expect(uprooted).toBeGreaterThan(5);
    for (let i = 0; i < 200; i++) hazards.update(0.1, ctx);
    expect(hazards.active).toBe(0);
  });

  it('asks the realm for diplomacy and reports when there is nobody to ask', () => {
    const { ctx, hazards, tiles, diplomacyCalls } = world();
    expect(runExtraPower('diplo-friendship', tiles[4][4], ctx, hazards)).toBe(true);
    expect(runExtraPower('diplo-whisper', tiles[4][4], ctx, hazards)).toBe(false);
    expect(diplomacyCalls).toEqual(['friendship', 'whisper']);
  });

  it('leaves tools it does not own to the engine', () => {
    const { ctx, hazards, tiles } = world();
    expect(runExtraPower('meteor', tiles[1][1], ctx, hazards)).toBeNull();
    expect(runExtraPower('spawn-human', tiles[1][1], ctx, hazards)).toBeNull();
  });
});

describe('dusts of forgetting', () => {
  it('wipes what it says and leaves the rest, on people only', () => {
    const { ctx, hazards, tiles, creatures } = world();
    const person = makeCreature('human', 12, 12);
    Object.assign(person, { cultureId: 'c1', languageId: 'l1', religionId: 'r1' });
    const sheep = makeCreature('sheep', 12, 12.3);
    creatures.push(person, sheep);
    expect(runExtraPower('dust-language', tiles[12][12], ctx, hazards)).toBe(true);
    expect(person.languageId).toBeNull();
    expect(person.cultureId).toBe('c1');
    expect(person.status).toContain('confused');
    expect(sheep.status).not.toContain('confused');
    runExtraPower('dust-everything', tiles[12][12], ctx, hazards);
    expect([person.cultureId, person.languageId, person.religionId]).toEqual([null, null, null]);
  });
});

describe('gifts and their opposites', () => {
  it('hands out a trait once, with its stats, and never doubles it', () => {
    const { ctx, hazards, tiles, creatures } = world();
    const a = makeCreature('human', 12, 12);
    creatures.push(a);
    expect(runExtraPower('gift-strong', tiles[12][12], ctx, hazards)).toBe(true);
    const strength = a.attributes.strength;
    expect(a.traits).toContain('strong');
    expect(strength).toBeGreaterThan(5);
    // A second blessing finds nobody new to bless.
    expect(runExtraPower('gift-strong', tiles[12][12], ctx, hazards)).toBe(false);
    expect(a.attributes.strength).toBe(strength);
  });

  it('lets a giant made tiny be merely ordinary', () => {
    const { ctx, hazards, tiles, creatures } = world();
    const a = makeCreature('human', 12, 12);
    creatures.push(a);
    runExtraPower('gift-giant', tiles[12][12], ctx, hazards);
    runExtraPower('gift-tiny', tiles[12][12], ctx, hazards);
    expect(a.traits).toEqual(['tiny']);
  });

  it('wipes traits with the eraser', () => {
    const { ctx, hazards, tiles, creatures } = world();
    const a = makeCreature('human', 12, 12);
    a.traits = ['lucky', 'swift'];
    creatures.push(a);
    expect(runExtraPower('trait-eraser', tiles[12][12], ctx, hazards)).toBe(true);
    expect(a.traits).toEqual([]);
  });

  it('arms people from the sky, and leaves the sheep unarmed', () => {
    const { ctx, hazards, tiles, creatures } = world();
    const person = makeCreature('human', 12, 12);
    const sheep = makeCreature('sheep', 12.4, 12);
    creatures.push(person, sheep);
    expect(runExtraPower('gift-arms', tiles[12][12], ctx, hazards)).toBe(true);
    expect(person.equipment?.weapon).toBeTruthy();
    expect(sheep.equipment).toBeUndefined();
  });

  it('makes the old young and pairs the lonely', () => {
    const { ctx, hazards, tiles, creatures } = world();
    const a = makeCreature('elf', 12, 12);
    const b = makeCreature('elf', 12.5, 12);
    a.age = 90;
    b.age = 50;
    creatures.push(a, b);
    expect(runExtraPower('youth', tiles[12][12], ctx, hazards)).toBe(true);
    expect(a.age).toBeLessThan(25);
    expect(runExtraPower('love-potion', tiles[12][12], ctx, hazards)).toBe(true);
    expect(a.loverId).toBe(b.id);
    expect(b.loverId).toBe(a.id);
  });

  it('writes one chronicle line for a whole cluster bomb', () => {
    const { ctx, hazards, tiles, events } = world();
    runExtraPower('cluster-bomb', tiles[12][12], ctx, hazards);
    expect(events.filter(e => /cluster/i.test(e))).toHaveLength(1);
    expect(events.some(e => /bomblet/i.test(e))).toBe(false);
  });
});

describe('the second batch of powers', () => {
  it('builds walls nothing can walk through', () => {
    const { ctx, hazards, tiles } = world();
    expect(runExtraPower('wall-stone', tiles[5][5], ctx, hazards)).toBe(true);
    expect(tiles[5][5].structure?.type).toBe('wall');
    expect(tiles[5][5].walkable).toBe(false);
  });

  it('prints a maze of mountain walls', () => {
    const { ctx, hazards, tiles } = world(30);
    expect(runExtraPower('stamp-maze', tiles[15][15], ctx, hazards)).toBe(true);
    expect(tiles.flat().filter(t => t.type === 'mountains').length).toBeGreaterThan(60);
  });

  it('opens a sea where antimatter lands', () => {
    const { ctx, hazards, tiles } = world();
    runExtraPower('antimatter', tiles[12][12], ctx, hazards);
    expect(isWaterBiome(tiles[12][12].type)).toBe(true);
  });

  it('chips a mountain down with the pickaxe, and leaves the meadow alone', () => {
    const { ctx, hazards, tiles } = world();
    tiles[4][4].height = 0.9; tiles[4][4].type = 'mountains';
    expect(runExtraPower('pickaxe', tiles[4][4], ctx, hazards)).toBe(true);
    expect(tiles[4][4].height).toBeLessThan(0.9);
    expect(runExtraPower('pickaxe', tiles[8][8], ctx, hazards)).toBe(false);
  });
});
