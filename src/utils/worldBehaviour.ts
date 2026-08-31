// Everything the world does when nobody is touching it.
//
// One table, one scheduler (docs/project-tracker/08-MASTER-PLAN.md 18.1). Every
// ambient process — vegetation spreading, ore surfacing, wildlife appearing,
// roads going back to grass, corruption creeping — is a row of
// `{name, minInterval, maxInterval, action}` rather than another timer ref and
// another `if (t >= 2.5)` buried in the render loop.
//
// The reason to do this is not tidiness. It is that a world's ambient life is
// the sum of its processes, and while they were scattered across a
// two-thousand-line hook there was nowhere you could *look* at that sum: no way
// to see that nothing at all happened on a mountain, or that two things fired
// on the same beat every time. A table you can read down is a world you can
// tune.
//
// Each row draws its own next interval uniformly from its range when it fires,
// so processes drift apart instead of locking into a rhythm. Everything runs on
// simulated seconds: at triple speed the world should get three times as busy,
// and a paused world should be still.
import {
  isWaterBiome,
  type BiomeType,
  type EntityType,
  type Season,
  type Tile,
} from '../types/world';
import { determineBiome } from './worldGenerator';
import { FIRE_HEAT_PER_SECOND, addHeat, cascade, conduct, relax } from './thermal';

/** What a process is allowed to touch. Deliberately small and injectable. */
export interface WorldContext {
  tiles: Tile[][];
  size: number;
  season: Season;
  /** Growth multiplier from the current age: Wonders nearly doubles, Ash stops. */
  growth: number;
  /** World laws the player has switched off. */
  laws: { biomeGrowth: boolean; disasters: boolean };
  inBounds(x: number, y: number): boolean;
  /** Push a changed tile to the renderer. */
  syncTile(tile: Tile): void;
  /** Set a tile alight. Owned by the fire system, which tracks its own front. */
  ignite(tile: Tile): void;
  /** Put a creature into the world. Returns false if it could not be placed. */
  spawn(type: EntityType, x: number, y: number): boolean;
  /** How many creatures are already alive, so wildlife does not run away. */
  population(): number;
  announce(message: string, at?: { x: number; y: number }): void;
  random(): number;
}

export interface WorldProcess {
  name: string;
  /** Simulated seconds. The next gap is drawn uniformly between the two. */
  minInterval: number;
  maxInterval: number;
  action: (ctx: WorldContext) => void;
}

const FORESTS: BiomeType[] = [
  'deciduous_forest', 'coniferous_forest', 'rainforest',
  'tropical_forest', 'taiga', 'enchanted_forest',
];

/** Forests that spread. The enchanted one does not: it is placed, not grown. */
const SPREADING_FORESTS: BiomeType[] = [
  'deciduous_forest', 'coniferous_forest', 'rainforest', 'tropical_forest', 'taiga',
];

/** What lives where, for the wildlife row. */
const NATIVES: Partial<Record<BiomeType, EntityType[]>> = {
  grassland: ['sheep', 'rabbit', 'chicken'],
  savanna: ['sheep', 'snake'],
  hills: ['sheep', 'rabbit'],
  deciduous_forest: ['deer', 'rabbit', 'fox'],
  coniferous_forest: ['deer', 'wolf', 'bear'],
  taiga: ['wolf', 'bear'],
  tundra: ['wolf'],
  snow: ['wolf'],
  rainforest: ['deer', 'bird', 'snake'],
  tropical_forest: ['deer', 'bird'],
  swamp: ['snake'],
  marsh: ['bird'],
};

/** Roughly one creature per this many land tiles before wildlife stops. */
const WILDLIFE_DENSITY = 120;

/** Pick a random tile. Sampling beats sweeping: the map is 16,384 tiles. */
const sampleTile = (ctx: WorldContext): { tile: Tile; x: number; y: number } => {
  const x = Math.floor(ctx.random() * ctx.size);
  const y = Math.floor(ctx.random() * ctx.size);
  return { tile: ctx.tiles[x][y], x, y };
};

/** One of the eight neighbours, or the tile itself. Cheap and good enough. */
const neighbourOf = (ctx: WorldContext, x: number, y: number): Tile | null => {
  const nx = x + Math.floor(ctx.random() * 3) - 1;
  const ny = y + Math.floor(ctx.random() * 3) - 1;
  if (!ctx.inBounds(nx, ny)) return null;
  return ctx.tiles[nx][ny];
};

const addResource = (tile: Tile, type: 'food' | 'wood' | 'stone', cap = 10): void => {
  const existing = tile.resources.find(r => r.type === type);
  if (existing) {
    existing.quantity = Math.min(cap, existing.quantity + 1);
    existing.discovered = true;
  } else {
    tile.resources.push({ type, quantity: 2, discovered: true });
  }
};

/** How many tiles a row looks at per firing, scaled to the map. */
const samplesFor = (ctx: WorldContext, per = 220): number =>
  Math.max(12, Math.floor((ctx.size * ctx.size) / per));

export const WORLD_PROCESSES: WorldProcess[] = [
  {
    // The one that has to be frequent: everything that eats depends on it.
    name: 'regrowth',
    minInterval: 2,
    maxInterval: 3.5,
    action: (ctx) => {
      const winter = ctx.season === 'winter';
      for (let i = 0; i < samplesFor(ctx); i += 1) {
        const { tile } = sampleTile(ctx);
        if (tile.isOnFire || isWaterBiome(tile.type)) continue;

        if (ctx.random() < tile.fertility * (winter ? 0.12 : 0.55) * ctx.growth) {
          if (tile.resources.some(r => r.type === 'food') || tile.fertility > 0.35) {
            addResource(tile, 'food');
          }
        }
        // Standing timber and exposed rock replenish, so a village that manages
        // its land can keep building rather than stripping the map bare once.
        if (FORESTS.includes(tile.type) && !winter && ctx.random() < 0.3 * ctx.growth) {
          addResource(tile, 'wood');
        }
        if ((tile.type === 'mountains' || tile.type === 'hills') && ctx.random() < 0.2) {
          addResource(tile, 'stone');
        }
      }
    },
  },
  {
    name: 'vegetation',
    minInterval: 6,
    maxInterval: 11,
    action: (ctx) => {
      if (!ctx.laws.biomeGrowth) return;
      for (let i = 0; i < samplesFor(ctx, 400); i += 1) {
        const { tile, x, y } = sampleTile(ctx);
        if (tile.isOnFire || !SPREADING_FORESTS.includes(tile.type)) continue;
        const neighbour = neighbourOf(ctx, x, y);
        if (!neighbour) continue;
        if (neighbour.type !== 'grassland' && neighbour.type !== 'hills') continue;
        if (neighbour.moisture <= 0.45 || neighbour.fertility <= 0.4) continue;
        if (neighbour.villageId) continue;
        if (ctx.random() >= 0.25 * ctx.growth) continue;

        neighbour.type = tile.type;
        neighbour.structure = { type: 'young_tree', health: 100, level: 1 };
        neighbour.resources.push({ type: 'wood', quantity: 4, discovered: true });
        ctx.syncTile(neighbour);
      }
    },
  },
  {
    name: 'corruption',
    minInterval: 8,
    maxInterval: 16,
    action: (ctx) => {
      if (!ctx.laws.biomeGrowth) return;
      for (let i = 0; i < samplesFor(ctx, 600); i += 1) {
        const { tile, x, y } = sampleTile(ctx);
        if (tile.type !== 'corrupted' || ctx.random() >= 0.12) continue;
        const neighbour = neighbourOf(ctx, x, y);
        if (!neighbour || neighbour.height <= 0.25) continue;
        if (isWaterBiome(neighbour.type) || neighbour.type === 'corrupted') continue;

        neighbour.type = 'corrupted';
        neighbour.structure = null;
        neighbour.fertility = Math.max(0, neighbour.fertility - 0.3);
        ctx.syncTile(neighbour);
      }
    },
  },
  {
    // Land recovering, which is the only thing on this table that undoes
    // another row. Without it the map only ever gets worse, and a world that
    // only decays is one you stop watching.
    name: 'healing',
    minInterval: 9,
    maxInterval: 18,
    action: (ctx) => {
      for (let i = 0; i < samplesFor(ctx, 500); i += 1) {
        const { tile } = sampleTile(ctx);
        if (tile.type !== 'badlands' || tile.moisture <= 0.4) continue;
        if (ctx.random() >= 0.18) continue;
        tile.fertility = Math.min(1, tile.fertility + 0.15);
        if (tile.fertility > 0.5) {
          tile.type = determineBiome(tile.height, tile.moisture, tile.temperature);
          ctx.syncTile(tile);
        }
      }
    },
  },
  {
    // Heat, and the ladder hanging off it.
    //
    // Frequent, because this is the row that carries a fire front, a lava
    // flow and an ice age across the map, and all three want to be watchable.
    // Every sampled tile relaxes toward its climate, shares with a neighbour,
    // and then runs the ladder — so a continent goes over in a visible wave
    // rather than all at once, and stops on its own when the source is gone.
    name: 'thermal',
    minInterval: 1.2,
    maxInterval: 2.2,
    action: (ctx) => {
      const samples = samplesFor(ctx, 90);
      // The elapsed time this row stands in for. Using a fixed figure rather
      // than the real gap keeps a slow frame from flash-freezing a coastline.
      const step = 1.7;
      for (let i = 0; i < samples; i += 1) {
        const { tile, x, y } = sampleTile(ctx);

        if (tile.isOnFire) addHeat(tile, FIRE_HEAT_PER_SECOND * step);
        relax(tile, step);

        const neighbour = neighbourOf(ctx, x, y);
        if (neighbour && neighbour !== tile) conduct(tile, neighbour, step);

        const change = cascade(tile);
        if (!change) continue;
        if (change.became) {
          tile.type = change.became;
          tile.structure = null;
          if (change.step === 'scorch' || change.step === 'strip' || change.step === 'melt') {
            tile.fertility = Math.max(0, tile.fertility - 0.4);
            tile.resources = tile.resources.filter(r => r.type !== 'food' && r.type !== 'wood');
          }
          tile.walkable = !isWaterBiome(tile.type) && tile.height >= 0.25;
          ctx.syncTile(tile);
        }
        if (change.ignites) ctx.ignite(tile);
        // Only the two ends of the ladder are worth a chronicle line. The
        // rungs in between fire hundreds of times during one eruption, and a
        // chronicle nobody can read is a chronicle nobody reads.
        if (change.note) ctx.announce(change.note, { x, y });
      }
    },
  },
  {
    // Ore working its way up. Rare on purpose: a mineral you trip over is not
    // a find, and the whole value of a vein is that somebody has to go looking.
    name: 'minerals',
    minInterval: 25,
    maxInterval: 60,
    action: (ctx) => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { tile, x, y } = sampleTile(ctx);
        if (tile.type !== 'mountains' && tile.type !== 'hills' && tile.type !== 'volcanic') continue;
        if (tile.resources.some(r => r.type === 'iron' || r.type === 'gold' || r.type === 'gem')) continue;

        const roll = ctx.random();
        const ore = roll < 0.6 ? 'iron' : roll < 0.9 ? 'gold' : 'gem';
        tile.resources.push({ type: ore, quantity: 4 + Math.floor(ctx.random() * 8), discovered: true });
        ctx.syncTile(tile);
        ctx.announce(`A seam of ${ore} works its way to the surface`, { x, y });
        return;
      }
    },
  },
  {
    // Wildlife arriving on its own, so an emptied continent refills and a
    // hunted-out forest is a temporary state rather than a permanent one.
    name: 'wildlife',
    minInterval: 18,
    maxInterval: 40,
    action: (ctx) => {
      const ceiling = Math.floor((ctx.size * ctx.size) / WILDLIFE_DENSITY);
      if (ctx.population() >= ceiling) return;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const { tile, x, y } = sampleTile(ctx);
        if (tile.villageId || tile.isOnFire || !tile.walkable) continue;
        const natives = NATIVES[tile.type];
        if (!natives || natives.length === 0) continue;
        const type = natives[Math.floor(ctx.random() * natives.length)];
        if (ctx.spawn(type, x, y)) return;
      }
    },
  },
  {
    // Roads going back to grass. A village's roads are re-laid every time it
    // builds, so this only ever eats the ones nobody is using any more — which
    // makes an abandoned settlement fade out of the map on its own.
    name: 'roads',
    minInterval: 30,
    maxInterval: 70,
    action: (ctx) => {
      for (let i = 0; i < samplesFor(ctx, 900); i += 1) {
        const { tile } = sampleTile(ctx);
        if (!tile.road || tile.villageId) continue;
        if (ctx.random() >= 0.3) continue;
        tile.road = false;
        ctx.syncTile(tile);
      }
    },
  },
];

/**
 * Runs the table on simulated time.
 *
 * Each row keeps its own countdown, redrawn from its range every time it fires.
 * The alternative — one shared clock and a modulo per row — makes every process
 * with a common factor fire on the same beat, and a world where four things
 * always happen at once and then nothing happens reads as a machine.
 */
export class WorldBehaviour {
  private countdown = new Map<string, number>();

  constructor(
    private readonly processes: WorldProcess[] = WORLD_PROCESSES,
    private readonly random: () => number = Math.random,
  ) {
    for (const process of processes) this.countdown.set(process.name, this.nextGap(process));
  }

  private nextGap(process: WorldProcess): number {
    return process.minInterval
      + this.random() * (process.maxInterval - process.minInterval);
  }

  /**
   * Advance by simulated seconds and run whatever came due. Returns the names
   * that fired, which is what the tests assert on and what a debug overlay
   * would show.
   */
  advance(delta: number, ctx: WorldContext): string[] {
    const fired: string[] = [];
    for (const process of this.processes) {
      const remaining = (this.countdown.get(process.name) ?? 0) - delta;
      if (remaining > 0) {
        this.countdown.set(process.name, remaining);
        continue;
      }
      // Reset before running: an action that throws must not leave its row
      // stuck at zero and firing every frame for the rest of the session.
      this.countdown.set(process.name, this.nextGap(process));
      process.action(ctx);
      fired.push(process.name);
    }
    return fired;
  }
}
