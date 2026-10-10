// The divine magnet: pick creatures up and put them down somewhere else.
//
// The single most WorldBox thing a player does is grab a handful of people and
// drop them on the wrong continent (06-WORLDBOX-COMPLETE-REFERENCE.md §2,
// Other). Here it is two clicks rather than a drag, because a drag on this map
// already pans the camera: the first click lifts everything under the brush,
// the held crowd follows the cursor, and the second click lets go.

import type { Entity } from '../types/world';

/** Most the hand will hold at once. More than this is a migration, not a lift. */
export const MAGNET_LIMIT = 40;

const held: string[] = [];

export const magnetHolding = (): readonly string[] => held;

/** Lift up to MAGNET_LIMIT creatures. Returns how many came up. */
export const magnetPickUp = (creatures: Entity[]): number => {
  for (const creature of creatures) {
    if (held.length >= MAGNET_LIMIT) break;
    if (creature.health <= 0 || creature.status.includes('aboard') || creature.status.includes('lifted')) continue;
    creature.status.push('lifted');
    held.push(creature.id);
  }
  return held.length;
};

/**
 * Hold the crowd under the cursor: a loose ring around the point, so twenty
 * people do not become one sprite. `lookup` resolves ids that may have died
 * while held; the dead fall out of the hand.
 */
export const magnetFollow = (x: number, y: number, lookup: (id: string) => Entity | undefined): void => {
  for (let i = held.length - 1; i >= 0; i--) {
    if (!lookup(held[i])) held.splice(i, 1);
  }
  held.forEach((id, i) => {
    const creature = lookup(id)!;
    const ring = Math.floor(Math.sqrt(i));
    const angle = i * 2.399963;
    const r = ring * 0.45;
    creature.lastPosition = { ...creature.position };
    creature.position = { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r };
  });
};

/**
 * Let go. Creatures land around (x, y) on whatever is there; `inBounds`
 * keeps anyone from being dropped off the edge of the world.
 */
export const magnetDrop = (
  x: number, y: number,
  lookup: (id: string) => Entity | undefined,
  inBounds: (x: number, y: number) => boolean,
): Entity[] => {
  const dropped: Entity[] = [];
  magnetFollow(x, y, lookup);
  for (const id of held) {
    const creature = lookup(id);
    if (!creature) continue;
    const i = creature.status.indexOf('lifted');
    if (i !== -1) creature.status.splice(i, 1);
    if (!inBounds(Math.floor(creature.position.x), Math.floor(creature.position.y))) {
      creature.position = { x: x + 0.5, y: y + 0.5 };
    }
    dropped.push(creature);
  }
  held.length = 0;
  return dropped;
};

/** Forget the hand, on a new world. Statuses go with the creatures. */
export const magnetReset = (): void => {
  held.length = 0;
};
