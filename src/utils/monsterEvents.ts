// Monsters that come to you.
//
// WorldBox does not wait for the player to drop a dragon: dragons descend,
// UFOs arrive for the cattle, Crabzilla walks up out of the sea, and in a cold
// age the Cold Ones come down from the north. Each is aimed at something —
// a town, a coast, a winter — so like the building disasters it happens to a
// world that has grown something worth threatening, and never to an empty one.

import type { Entity, EntityType, Season, Tile } from '../types/world';
import { applyStatus } from './statusEffects';
import { isWaterBiome } from '../types/world';
import type { DisasterTarget } from './disasters';

export interface MonsterWorld {
  tiles: Tile[][];
  size: number;
  season: Season;
  buildings(): DisasterTarget[];
  spawn(type: EntityType, x: number, y: number): boolean;
  announce(message: string, at?: { x: number; y: number }): void;
  random(): number;
  /** Creatures near a point, for the events that work on the people already there. */
  near?(x: number, y: number, radius: number): Entity[];
}

interface MonsterEvent {
  id: string;
  weight: number;
  /** Where it lands and what it says, or null when this world offers it no way in. */
  run(world: MonsterWorld, town: DisasterTarget): boolean;
}

const land = (world: MonsterWorld, x: number, y: number): Tile | null => {
  const tile = world.tiles[x]?.[y];
  return tile && !isWaterBiome(tile.type) && tile.walkable !== false ? tile : null;
};

/** A walkable tile some distance from a town, in a random direction. */
const approach = (world: MonsterWorld, town: DisasterTarget, distance: number): Tile | null => {
  for (let attempt = 0; attempt < 12; attempt++) {
    const angle = world.random() * Math.PI * 2;
    const x = Math.round(town.x + Math.cos(angle) * distance);
    const y = Math.round(town.y + Math.sin(angle) * distance);
    const tile = land(world, x, y);
    if (tile) return tile;
  }
  return null;
};

/** The nearest stretch of sea to a town, within reach, landing on the shore beside it. */
const shoreNear = (world: MonsterWorld, town: DisasterTarget, reach: number): Tile | null => {
  for (let r = 3; r <= reach; r++) {
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const x = Math.round(town.x + Math.cos(angle) * r);
      const y = Math.round(town.y + Math.sin(angle) * r);
      const here = world.tiles[x]?.[y];
      if (!here || !isWaterBiome(here.type)) continue;
      // Step back toward the town until there is ground underfoot.
      for (let back = 1; back <= 3; back++) {
        const lx = Math.round(town.x + Math.cos(angle) * (r - back));
        const ly = Math.round(town.y + Math.sin(angle) * (r - back));
        const tile = land(world, lx, ly);
        if (tile) return tile;
      }
    }
  }
  return null;
};

export const MONSTER_EVENTS: MonsterEvent[] = [
  {
    id: 'dragon',
    weight: 3,
    run: (world, town) => {
      const tile = approach(world, town, 6);
      if (!tile || !world.spawn('dragon', tile.x, tile.y)) return false;
      world.announce(`A dragon comes down out of the clouds over ${town.villageName}`, { x: tile.x, y: tile.y });
      return true;
    },
  },
  {
    id: 'ufo',
    weight: 2,
    run: (world, town) => {
      const tile = approach(world, town, 5);
      if (!tile || !world.spawn('ufo', tile.x, tile.y)) return false;
      world.spawn('alien', tile.x + 1, tile.y);
      world.announce(`Lights hang over ${town.villageName}, and something has come for the cattle`, { x: tile.x, y: tile.y });
      return true;
    },
  },
  {
    id: 'crabzilla',
    weight: 1,
    run: (world, town) => {
      const tile = shoreNear(world, town, 14);
      if (!tile || !world.spawn('crabzilla', tile.x, tile.y)) return false;
      world.announce(`The sea off ${town.villageName} stands up, and it is a crab`, { x: tile.x, y: tile.y });
      return true;
    },
  },
  {
    id: 'cold_ones',
    weight: 2,
    run: (world, town) => {
      if (world.season !== 'winter') return false;
      let came = 0;
      for (let i = 0; i < 3; i++) {
        const tile = approach(world, town, 8);
        if (tile && world.spawn('cold_one', tile.x, tile.y)) came++;
      }
      if (came === 0) return false;
      world.announce(`The Cold Ones walk out of the winter toward ${town.villageName}`, { x: town.x, y: town.y });
      return true;
    },
  },
  {
    id: 'bandits',
    weight: 3,
    run: (world, town) => {
      const tile = approach(world, town, 7);
      if (!tile) return false;
      let came = 0;
      for (let i = 0; i < 4; i++) if (world.spawn('bandit', tile.x + (i % 2), tile.y + Math.floor(i / 2))) came++;
      if (came === 0) return false;
      world.announce(`Bandits make camp in the hills outside ${town.villageName}`, { x: tile.x, y: tile.y });
      return true;
    },
  },
  {
    id: 'mad_thoughts',
    weight: 2,
    run: (world, town) => {
      const people = (world.near?.(town.x, town.y, 6) ?? []).filter(e => ['human', 'elf', 'dwarf', 'orc'].includes(e.type));
      if (people.length < 3) return false;
      const struck = people.slice(0, Math.max(2, Math.floor(people.length / 3)));
      for (const person of struck) applyStatus(person, 'enraged');
      world.announce(`Mad thoughts pass through ${town.villageName}, and neighbours turn on neighbours`, { x: town.x, y: town.y });
      return true;
    },
  },
  {
    id: 'snowmen',
    weight: 1,
    run: (world, town) => {
      if (world.season !== 'winter') return false;
      let made = 0;
      for (let i = 0; i < 5; i++) {
        const tile = approach(world, town, 3 + i);
        if (tile && world.spawn('snowman', tile.x, tile.y)) made++;
      }
      if (made === 0) return false;
      world.announce(`Snowmen stand up in the fields around ${town.villageName}. Nobody built them`, { x: town.x, y: town.y });
      return true;
    },
  },
  {
    id: 'hellspawn',
    weight: 1,
    run: (world, town) => {
      const tile = approach(world, town, 8);
      if (!tile) return false;
      let came = 0;
      for (let i = 0; i < 3; i++) if (world.spawn(i === 0 ? 'demon' : 'fire_skull', tile.x + i, tile.y)) came++;
      if (came === 0) return false;
      world.announce(`The ground splits outside ${town.villageName}, and something climbs out`, { x: tile.x, y: tile.y });
      return true;
    },
  },
  {
    id: 'alien_invasion',
    weight: 1,
    run: (world, town) => {
      const tile = approach(world, town, 7);
      if (!tile || !world.spawn('ufo', tile.x, tile.y)) return false;
      for (let i = 0; i < 4; i++) world.spawn('alien', tile.x + (i % 2) - 1, tile.y + Math.floor(i / 2));
      world.announce(`They have come in force: an invasion lands beside ${town.villageName}`, { x: tile.x, y: tile.y });
      return true;
    },
  },
  {
    id: 'evil_mage',
    weight: 1,
    run: (world, town) => {
      const tile = approach(world, town, 8);
      if (!tile || !world.spawn('mage', tile.x, tile.y)) return false;
      world.announce(`A mage with a grudge walks out of the woods toward ${town.villageName}`, { x: tile.x, y: tile.y });
      return true;
    },
  },
  {
    id: 'necromancer',
    weight: 1,
    run: (world, town) => {
      const tile = approach(world, town, 9);
      if (!tile || !world.spawn('necromancer', tile.x, tile.y)) return false;
      world.announce(`The graves around ${town.villageName} begin to stir`, { x: tile.x, y: tile.y });
      return true;
    },
  },
];

/**
 * Send something. Picks a town, then an event by weight, and falls through to
 * the next if this world gives it no way in (no coast for Crabzilla, no
 * winter for the Cold Ones). Returns the event that happened, if any.
 */
export const sendMonster = (world: MonsterWorld): string | null => {
  const towns = world.buildings().filter(b => b.kind === 'bonfire');
  if (towns.length === 0) return null;
  const town = towns[Math.floor(world.random() * towns.length)];
  const total = MONSTER_EVENTS.reduce((sum, e) => sum + e.weight, 0);
  let roll = world.random() * total;
  const start = MONSTER_EVENTS.findIndex((event) => (roll -= event.weight) < 0);
  for (let i = 0; i < MONSTER_EVENTS.length; i++) {
    const event = MONSTER_EVENTS[(Math.max(0, start) + i) % MONSTER_EVENTS.length];
    if (event.run(world, town)) return event.id;
  }
  return null;
};
