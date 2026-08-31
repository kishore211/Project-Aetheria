// Disasters that eat a building.
//
// Phase 18.5, and the one idea in it: a disaster with a *precondition* turns
// the player's own works into the attack surface. A random fire is weather —
// you watch it and you feel nothing, because nothing you did caused it and
// nothing you own is at stake. A mine collapse can only happen to someone who
// dug a mine, and the moment that is true, building the mine is a decision
// with two sides to it.
//
// It also solves the oldest problem with random disasters, which is that they
// have nothing to aim at in an empty world and so either fire uselessly into
// the sea or have to be suppressed by a rule about population. Here the
// targeting falls out: no buildings, no disasters, and a sprawling kingdom is
// a target-rich one.
import type { Tile } from '../types/world';

/** A building, as much of it as a disaster needs to know. */
export interface DisasterTarget {
  id: string;
  kind: string;
  x: number;
  y: number;
  villageId: string;
  villageName: string;
}

/** What a disaster is allowed to reach. */
export interface DisasterWorld {
  buildings(): DisasterTarget[];
  /** Take a building down. False if something else already had it. */
  destroyBuilding(id: string): boolean;
  damageArea(x: number, y: number, radius: number, damage: number): number;
  ignite(tile: Tile): void;
  tileAt(x: number, y: number): Tile | null;
  announce(message: string, at?: { x: number; y: number }): void;
  random(): number;
}

export interface DisasterDef {
  id: string;
  /** The building it consumes. Without one of these it cannot happen at all. */
  needs: string;
  /** Relative likelihood among the disasters that currently have a target. */
  weight: number;
  /** What it does, beyond eating the building. */
  act(world: DisasterWorld, target: DisasterTarget): void;
  /** The line, given the village that lost something. */
  headline(target: DisasterTarget): string;
}

/** Set fire to a small ring of ground around a point. */
const burnAround = (world: DisasterWorld, x: number, y: number, radius: number): void => {
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const tile = world.tileAt(x + dx, y + dy);
      if (tile) world.ignite(tile);
    }
  }
};

export const DISASTERS: DisasterDef[] = [
  {
    id: 'mine_collapse',
    needs: 'mine',
    weight: 3,
    headline: (target) => `The mine at ${target.villageName} comes down on the shift inside it`,
    act: (world, target) => {
      // Tight and lethal rather than wide and survivable: the horror of a
      // collapse is that it happens to the people who were underground, and a
      // gentle version of it is just a building disappearing.
      world.damageArea(target.x, target.y, 2, 70);
    },
  },
  {
    id: 'granary_fire',
    needs: 'farm',
    weight: 4,
    headline: (target) => `Fire takes the harvest at ${target.villageName}`,
    act: (world, target) => {
      burnAround(world, target.x, target.y, 2);
      world.damageArea(target.x, target.y, 2, 20);
    },
  },
  {
    id: 'tower_fall',
    needs: 'tower',
    weight: 2,
    headline: (target) => `The watchtower at ${target.villageName} falls in the night`,
    act: (world, target) => {
      world.damageArea(target.x, target.y, 1.5, 45);
    },
  },
  {
    id: 'temple_desecration',
    needs: 'temple',
    weight: 2,
    headline: (target) => `Something walks through the temple at ${target.villageName}`,
    act: (world, target) => {
      // Wide, weak and frightening. A desecration should cost a village its
      // nerve rather than its people.
      world.damageArea(target.x, target.y, 5, 12);
    },
  },
  {
    id: 'hall_burns',
    needs: 'hall',
    weight: 1,
    headline: (target) => `The great hall of ${target.villageName} burns to its foundations`,
    act: (world, target) => {
      burnAround(world, target.x, target.y, 3);
      world.damageArea(target.x, target.y, 3, 35);
    },
  },
];

/**
 * Fire one disaster, if anything in the world can host one.
 *
 * Returns the id that fired, or null. Null is the common case and is not a
 * failure: an unbuilt world simply has nothing that can go wrong yet, and that
 * is the point of the design rather than a gap in it.
 *
 * The target is chosen first and the disaster second. Doing it the other way
 * round — pick a disaster, then look for somewhere to put it — means the
 * common disasters keep coming up empty in a world that has only ever built
 * one kind of thing, and the weights stop meaning anything.
 */
export const strikeDisaster = (world: DisasterWorld): string | null => {
  const standing = world.buildings();
  if (standing.length === 0) return null;

  const possible: Array<{ def: DisasterDef; target: DisasterTarget }> = [];
  for (const def of DISASTERS) {
    for (const target of standing) {
      if (target.kind === def.needs) possible.push({ def, target });
    }
  }
  if (possible.length === 0) return null;

  const total = possible.reduce((sum, option) => sum + option.def.weight, 0);
  let roll = world.random() * total;
  for (const option of possible) {
    roll -= option.def.weight;
    if (roll > 0) continue;
    // The building goes first. If something else already took it, this strike
    // is spent rather than falling through to a neighbour — a disaster that
    // retries until it lands is a disaster that always lands.
    if (!world.destroyBuilding(option.target.id)) return null;
    option.def.act(world, option.target);
    world.announce(option.def.headline(option.target), { x: option.target.x, y: option.target.y });
    return option.def.id;
  }
  return null;
};
