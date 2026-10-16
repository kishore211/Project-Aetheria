// Floating text and speech.
//
// The single loudest difference between our world and WorldBox's is that
// theirs *answers*. Hit something and a red number lifts off it; heal it and a
// green one does; a villager who is starving says so, out loud, in a little
// bubble. Nothing in that list is simulation — it is all the simulation
// admitting out loud what it already decided
// (docs/project-tracker/07-UI-TEARDOWN-AND-SPEC.md, W2).
//
// Same split as labelBridge: the engine owns projection because only it has
// the camera, the DOM owns text because only the DOM renders crisp type. Here
// the churn is much higher — a battle emits dozens of numbers a second — so
// the DOM side recycles a fixed pool of nodes and React never sees an update.

export type FloaterKind =
  | 'damage'   // red, small, fast
  | 'heal'     // green
  | 'gain'     // amber, a resource or a coin arriving
  | 'emote'    // a single glyph: a heart, a skull, a note
  | 'speech';  // a line of dialogue in a bubble

export interface Floater {
  /** Non-zero while alive. Zero means the slot is free. */
  id: number;
  kind: FloaterKind;
  text: string;
  /** Tile coordinates. Followed live when `entityId` is set. */
  x: number;
  y: number;
  entityId: string | null;
  age: number;
  life: number;
  /** Horizontal drift, so two numbers on one tile do not overlap exactly. */
  drift: number;
  /**
   * Rows to lift a speech bubble by. Two villagers reacting to the same event
   * stand on adjacent tiles and project to almost the same point, so without
   * this the second bubble sits on top of the first and clips its text.
   */
  stack: number;
  /** Written by the engine each frame. */
  screenX: number;
  screenY: number;
  opacity: number;
}

/**
 * How many can be on screen at once. A pool rather than a list: a battle can
 * ask for hundreds a second and the honest answer is to show the newest few
 * dozen and drop the rest, not to allocate.
 */
const POOL = 64;

const makeSlot = (): Floater => ({
  id: 0, kind: 'damage', text: '', x: 0, y: 0, entityId: null,
  age: 0, life: 0, drift: 0, stack: 0, screenX: 0, screenY: 0, opacity: 0,
});

export const floatBridge = {
  slots: Array.from({ length: POOL }, makeSlot),
  /** Bumped when the pool is resized; the DOM layer watches it to rebuild nodes. */
  version: 1,
};

let nextId = 1;
let cursor = 0;

/**
 * Speech is rationed globally, not per unit. Two hundred villagers each with
 * something to say once a minute is three lines a second, which reads as noise
 * rather than as a world with people in it. WorldBox's own bubbles are sparse
 * for the same reason.
 */
let speechBudget = 2;
let speechRefill = 0;
const SPEECH_PER_SECOND = 1.6;

/** Per-unit cooldown, so one talkative creature cannot hold the floor. */
const lastSpoke = new Map<string, number>();
let clock = 0;
const SPEECH_COOLDOWN = 14;

export interface FloaterSpec {
  kind: FloaterKind;
  text: string;
  x: number;
  y: number;
  entityId?: string | null;
  life?: number;
}

const DEFAULT_LIFE: Record<FloaterKind, number> = {
  damage: 0.9, heal: 1.1, gain: 1.2, emote: 1.4, speech: 3.2,
};

const liveSpeechCount = (): number => {
  let count = 0;
  for (const slot of floatBridge.slots) {
    if (slot.id !== 0 && slot.kind === 'speech') count += 1;
  }
  return count;
};

/** Claim a slot, replacing the oldest if all are busy. */
const claim = (): Floater => {
  for (let attempt = 0; attempt < POOL; attempt += 1) {
    const slot = floatBridge.slots[cursor];
    cursor = (cursor + 1) % POOL;
    if (slot.id === 0) return slot;
  }
  // Everything is alive: take whichever has least life left.
  let oldest = floatBridge.slots[0];
  for (const slot of floatBridge.slots) {
    if (slot.life - slot.age < oldest.life - oldest.age) oldest = slot;
  }
  return oldest;
};

export const emitFloater = (spec: FloaterSpec): boolean => {
  if (spec.kind === 'speech') {
    if (speechBudget < 1) return false;
    const speaker = spec.entityId;
    if (speaker) {
      const last = lastSpoke.get(speaker);
      if (last !== undefined && clock - last < SPEECH_COOLDOWN) return false;
      lastSpoke.set(speaker, clock);
    }
    speechBudget -= 1;
  }

  const slot = claim();
  slot.id = nextId++;
  slot.kind = spec.kind;
  slot.text = spec.text;
  slot.x = spec.x;
  slot.y = spec.y;
  slot.entityId = spec.entityId ?? null;
  slot.age = 0;
  slot.life = spec.life ?? DEFAULT_LIFE[spec.kind];
  // Numbers stack up on a tile during a fight; a little sideways scatter is
  // what makes three of them readable instead of one bold blur.
  slot.drift = spec.kind === 'speech' ? 0 : (Math.random() - 0.5) * 26;
  // Bubbles queue upward; numbers do not, because they scatter sideways
  // instead and three rows of them would leave the screen.
  slot.stack = spec.kind === 'speech' ? liveSpeechCount() % 3 : 0;
  slot.screenX = 0;
  slot.screenY = 0;
  slot.opacity = 0;
  return true;
};

/** Convenience: a damage number, skipped when it would round to nothing. */
export const emitDamage = (x: number, y: number, amount: number, entityId?: string): void => {
  const rounded = Math.round(amount);
  if (rounded < 1) return;
  emitFloater({ kind: 'damage', text: `-${rounded}`, x, y, entityId });
};

export const advanceFloaters = (delta: number): void => {
  clock += delta;
  speechRefill += delta;
  if (speechRefill >= 1 / SPEECH_PER_SECOND) {
    speechRefill = 0;
    speechBudget = Math.min(3, speechBudget + 1);
  }

  for (const slot of floatBridge.slots) {
    if (slot.id === 0) continue;
    slot.age += delta;
    if (slot.age >= slot.life) {
      slot.id = 0;
      slot.opacity = 0;
      slot.text = '';
    }
  }

  // Speakers who left the world should not hold a cooldown forever.
  if (lastSpoke.size > 512) lastSpoke.clear();
};

/** Wipe everything. Called when a new world is built. */
export const clearFloaters = (): void => {
  for (const slot of floatBridge.slots) {
    slot.id = 0;
    slot.text = '';
    slot.opacity = 0;
  }
  lastSpoke.clear();
  speechBudget = 2;
  speechRefill = 0;
  clock = 0;
  cursor = 0;
  nextId = 1;
};
