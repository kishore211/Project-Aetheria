// Held keys, and the creature the player is wearing.
//
// WorldBox lets you possess a unit: the camera rides along, WASD walks it,
// Space swings at whatever is in reach, and the creature's own mind steps
// aside until you let go (06-WORLDBOX-COMPLETE-REFERENCE.md §8, Hotkeys).
// The same keys pan the map when nobody is possessed, which they also do in
// WorldBox and did not do here at all.
//
// Module state rather than store state: the creature AI reads it every frame
// for one entity, and going through React for that would be absurd. The
// store mirrors `possessedId` for the interface.

const held = new Set<string>();

/** The creature being worn, and a swing waiting to happen. */
export const possession = {
  id: null as string | null,
  attackQueued: false,
};

const DIRECTION_KEYS: Record<string, [number, number]> = {
  w: [0, -1], arrowup: [0, -1],
  s: [0, 1], arrowdown: [0, 1],
  a: [-1, 0], arrowleft: [-1, 0],
  d: [1, 0], arrowright: [1, 0],
};

/** True for the keys this module cares about, so the hotkey handler leaves them alone. */
export const isDirectionKey = (key: string): boolean => key.toLowerCase() in DIRECTION_KEYS;

/**
 * Which way the held keys point, in tile axes (y grows down the screen),
 * normalised so a diagonal is not faster than a straight line.
 */
export const heldDirection = (): { dx: number; dy: number } => {
  let dx = 0;
  let dy = 0;
  for (const key of held) {
    const step = DIRECTION_KEYS[key];
    if (!step) continue;
    dx += step[0];
    dy += step[1];
  }
  const length = Math.hypot(dx, dy);
  return length > 0 ? { dx: dx / length, dy: dy / length } : { dx: 0, dy: 0 };
};

export const pressKey = (key: string): void => {
  held.add(key.toLowerCase());
};

export const releaseKey = (key: string): void => {
  held.delete(key.toLowerCase());
};

/** Forget every held key — on blur, so a key released in another window does not stick. */
export const releaseAllKeys = (): void => {
  held.clear();
};

/** Let go of the creature being worn and every held key. Called when a new world is built. */
export const resetPossession = (): void => {
  held.clear();
  possession.id = null;
  possession.attackQueued = false;
};

export const possess = (id: string | null): void => {
  possession.id = id;
  possession.attackQueued = false;
};
