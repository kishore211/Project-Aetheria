// Creature ids for the simulation, minted from a per-world counter.
//
// Ids used to come from a random uuid. Politics and family names hash the id,
// so a random id made a second world, or a reload, diverge from its seed. A
// counter makes ids the same every time the same world is built: `e-1`, `e-2`,
// and so on, in the order creatures are created.
//
// resetWorldState() restarts the counter when a world is built. Restoring a
// save moves it past every id the save mentions (keepEntityIdAhead), so a
// creature born after loading never reuses a restored id. Ids from older saves
// (uuids) do not match the counter format and never collide with new ones.

let nextEntityNumber = 1;

const COUNTER_ID = /^e-(\d+)$/;

/** A new creature id, unique within the current world. */
export const nextEntityId = (): string => `e-${nextEntityNumber++}`;

/** Start creature ids again from e-1. Called when a new world is built. */
export const resetEntityIds = (): void => {
  nextEntityNumber = 1;
};

/** Moves the counter past an id restored from a save. Ids not in counter form are ignored. */
export const keepEntityIdAhead = (id: string): void => {
  const match = COUNTER_ID.exec(id);
  if (!match) return;
  const numeric = Number(match[1]);
  if (numeric >= nextEntityNumber) nextEntityNumber = numeric + 1;
};
