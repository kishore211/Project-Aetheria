// Status effects, typed.
//
// Statuses used to be bare strings pushed onto `entity.status`, with timed ones
// expiring via `setTimeout`. That had three problems, and the third is a real
// bug rather than untidiness:
//
//   1. Nothing knew what a status *was* — no icon, no duration, no flavour, so
//      nothing could show one except by matching the string.
//   2. Any typo was a silent no-op.
//   3. `setTimeout` runs on the wall clock. A status that should last "a few
//      seconds of world time" lasted the same real seconds at triple speed, and
//      kept counting down while the game was paused. Every other duration in
//      this codebase is in simulated seconds; these were the exception.
//
// So durations now tick on the game delta like everything else, and each status
// carries what the interface needs to draw it.
//
// WorldBox has 57 statuses (06-WORLDBOX-COMPLETE-REFERENCE.md §6). This is ~20,
// chosen because each one is either already simulated or changes behaviour.
import type { Entity } from '../types/world';

export type StatusId =
  // -- what the creature is physically doing --
  | 'eating' | 'drinking' | 'sleeping' | 'talking' | 'moving' | 'swimming'
  | 'attacking' | 'fighting' | 'fleeing' | 'wounded' | 'exhausted'
  | 'slain' | 'dead'
  // -- office --
  | 'leader' | 'king' | 'captain'
  // -- mood, and the contagious social ones --
  | 'happy' | 'content' | 'sad' | 'miserable'
  | 'laughing' | 'crying' | 'singing'
  | 'in_love' | 'grieving' | 'furious' | 'poked' | 'blessed' | 'cursed'
  // -- laid on by the player's powers; each one changes behaviour --
  | 'shielded' | 'caffeinated' | 'inspired' | 'confused' | 'enraged'
  | 'infected' | 'spellbound'
  // -- at sea, carried by a boat --
  | 'aboard'
  // -- held up by the divine magnet --
  | 'lifted';

export interface StatusDef {
  id: StatusId;
  label: string;
  /** Single glyph, for the inspector and the icon rail. */
  glyph: string;
  /**
   * How long it lasts in *simulated* seconds. 0 means the status is owned by
   * whatever set it and only that code removes it (`moving`, `king`).
   */
  duration: number;
  /**
   * Happiness pushed per simulated second while it holds. This is what makes
   * mood emerge from circumstance instead of being set directly everywhere.
   */
  mood: number;
  /** Spreads to nearby creatures of the same kind. */
  contagious: boolean;
  /** Shown in the inspector. Written to be worth reading. */
  flavour: string;
}

const define = (
  id: StatusId, label: string, glyph: string, duration: number,
  mood: number, contagious: boolean, flavour: string,
): StatusDef => ({ id, label, glyph, duration, mood, contagious, flavour });

export const STATUSES: Record<StatusId, StatusDef> = {
  eating: define('eating', 'Eating', '\u{1F356}', 3, 3, false, 'A meal makes most things bearable.'),
  drinking: define('drinking', 'Drinking', '\u{1F4A7}', 2.5, 2, false, 'Cold water, straight from the source.'),
  sleeping: define('sleeping', 'Asleep', '\u{1F4A4}', 0, 1.5, false, 'Out cold, and defenceless.'),
  talking: define('talking', 'Talking', '\u{1F4AC}', 0, 2.5, false, 'Company, which counts for more than it looks like.'),
  moving: define('moving', 'On the move', '→', 0, 0, false, 'Going somewhere.'),
  swimming: define('swimming', 'Swimming', '\u{1F30A}', 0, -0.5, false, 'Out of its depth, literally.'),
  attacking: define('attacking', 'Striking', '⚔', 1.2, -1, false, 'Committed now.'),
  fighting: define('fighting', 'Fighting', '⚔', 0, -3, false, 'In it, whether it wanted to be or not.'),
  fleeing: define('fleeing', 'Fleeing', '\u{1F3C3}', 0, -5, false, 'Decided, correctly, to run.'),
  wounded: define('wounded', 'Wounded', '\u{1FA79}', 0, -2, false, 'Bleeding, and thinking about it.'),
  exhausted: define('exhausted', 'Exhausted', '\u{1F975}', 0, -2.5, false, 'Running on nothing.'),
  slain: define('slain', 'Slain', '☠', 0, 0, false, 'It is over.'),
  dead: define('dead', 'Dead', '☠', 0, 0, false, 'It is over.'),

  leader: define('leader', 'Leader', '\u{1F396}', 0, 1, false, 'Somebody has to decide things.'),
  king: define('king', 'Ruler', '\u{1F451}', 0, 2, false, 'Wears the seal, sleeps badly.'),
  captain: define('captain', 'Captain', '\u{1F6E1}', 0, 0.5, false, 'Answers for the warriors.'),

  happy: define('happy', 'Happy', '\u{1F60A}', 0, 0, false, 'Things are going well and it has noticed.'),
  content: define('content', 'Content', '\u{1F642}', 0, 0, false, 'No complaints worth making.'),
  sad: define('sad', 'Unhappy', '\u{1F641}', 0, 0, false, 'Something is wrong and it cannot fix it.'),
  miserable: define('miserable', 'Miserable', '\u{1F62D}', 0, 0, false, 'Nothing about this life is working.'),

  laughing: define('laughing', 'Laughing', '\u{1F602}', 8, 6, true, 'Whatever it was, it was funny.'),
  crying: define('crying', 'Crying', '\u{1F622}', 12, -5, true, 'Not hiding it.'),
  singing: define('singing', 'Singing', '\u{1F3B5}', 10, 5, true, 'Badly, and with feeling.'),

  in_love: define('in_love', 'In love', '❤', 0, 4, false, 'Has found somebody and is unbearable about it.'),
  grieving: define('grieving', 'Grieving', '\u{1F494}', 90, -6, false, 'Lost somebody it cannot replace.'),
  furious: define('furious', 'Furious', '\u{1F621}', 30, -4, false, 'Looking for the person responsible.'),
  poked: define('poked', 'Prodded', '\u{1F449}', 6, -8, false, 'Something enormous poked it, for no reason it can see.'),
  blessed: define('blessed', 'Blessed', '✨', 60, 5, false, 'Something looked kindly on it.'),
  cursed: define('cursed', 'Cursed', '\u{1F480}', 90, -7, false, 'Something did not.'),

  shielded: define('shielded', 'Shielded', '\u{1F6E1}', 45, 1, false, 'Wrapped in something that does not let harm through.'),
  caffeinated: define('caffeinated', 'Caffeinated', '☕', 30, 2, false, 'Moving at the speed of a bad idea.'),
  inspired: define('inspired', 'Inspired', '\u{1F4A1}', 40, 4, false, 'Has had a thought, and it is a good one.'),
  confused: define('confused', 'Confused', '\u{1F635}', 15, -2, false, 'Reality has slipped a little sideways.'),
  enraged: define('enraged', 'Enraged', '\u{1F92C}', 20, -6, false, 'Blaming the gods, and settling for whoever is nearest.'),
  infected: define('infected', 'Infected', '\u{1F9DF}', 0, -6, false, 'Feeling a little peaky. It will pass, in a sense.'),
  aboard: define('aboard', 'At sea', '⛵', 0, 0, false, 'Somewhere between home and wherever this is going.'),
  lifted: define('lifted', 'Lifted', '\u{1F9F2}', 0, -1, false, 'Feet off the ground and no say in the matter.'),
  spellbound: define('spellbound', 'Spellbound', '\u{1F4AB}', 25, 2, false, 'Asleep where it stood, and dreaming of something nice.'),
};

/** Guard for the many places that still hand us plain strings. */
export const isStatusId = (value: string): value is StatusId => value in STATUSES;

export const statusDef = (value: string): StatusDef | null =>
  (isStatusId(value) ? STATUSES[value] : null);

/**
 * Live timers for statuses that expire, keyed by entity then status.
 *
 * Held here rather than on the entity so a save file does not have to carry
 * half-elapsed timers, and so the whole table can be dropped when a new world
 * is built.
 */
const timers = new Map<string, Map<StatusId, number>>();

/**
 * How long a creature flashes white when something happens to it.
 *
 * WorldBox flashes a unit for a few frames on every status gain, and it is how
 * a thousand simultaneous agents stay readable — you see *that* something
 * happened before you work out *what*
 * (09-WORLDBOX-VISUAL-RESEARCH.md §10). In simulated seconds, so it survives
 * a speed change like everything else.
 */
export const FLASH_SECONDS = 0.22;

export const applyStatus = (entity: Entity, id: StatusId): void => {
  if (!entity.status.includes(id)) {
    entity.status.push(id);
    // Only on a *new* status. Re-applying an existing one (a creature standing
    // in a fire, refreshing 'burning' every tick) must not strobe.
    entity.flashFor = FLASH_SECONDS;
  }

  const duration = STATUSES[id].duration;
  if (duration <= 0) return;

  // Re-applying refreshes rather than stacks. A creature standing in a fire
  // should stay burnt for a while after it leaves, not for a while after it
  // first caught.
  let entityTimers = timers.get(entity.id);
  if (!entityTimers) {
    entityTimers = new Map();
    timers.set(entity.id, entityTimers);
  }
  entityTimers.set(id, duration);
};

export const clearStatus = (entity: Entity, id: StatusId): void => {
  const index = entity.status.indexOf(id);
  if (index !== -1) entity.status.splice(index, 1);
  timers.get(entity.id)?.delete(id);
};

export const hasStatus = (entity: Entity, id: StatusId): boolean =>
  entity.status.includes(id);

/**
 * Tick one creature's timed statuses. Returns the total mood push per second
 * from everything it is currently under, so the caller can apply it in the same
 * pass rather than walking the status list twice.
 */
export const tickStatuses = (entity: Entity, delta: number): number => {
  let mood = 0;
  for (const value of entity.status) {
    const def = statusDef(value);
    if (def) mood += def.mood;
  }

  const entityTimers = timers.get(entity.id);
  if (!entityTimers || entityTimers.size === 0) return mood;

  for (const [id, remaining] of entityTimers) {
    const left = remaining - delta;
    if (left <= 0) {
      entityTimers.delete(id);
      const index = entity.status.indexOf(id);
      if (index !== -1) entity.status.splice(index, 1);
    } else {
      entityTimers.set(id, left);
    }
  }
  if (entityTimers.size === 0) timers.delete(entity.id);
  return mood;
};

/** Forget a dead creature's timers. */
export const forgetStatuses = (entityId: string): void => {
  timers.delete(entityId);
};

export const clearAllStatusTimers = (): void => {
  timers.clear();
};

/** For tests and diagnostics. */
export const statusTimerCount = (): number => timers.size;
