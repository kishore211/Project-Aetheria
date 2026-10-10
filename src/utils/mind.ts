// The mind editor.
//
// WorldBox lets the player open a unit's mind and switch individual neurons
// off — a wolf that never hunts, a king who never sleeps, a villager who will
// not work (06-WORLDBOX-COMPLETE-REFERENCE.md §3, The mind). Ours is the same
// idea at the grain our AI actually decides at: eight drives, each one a
// branch of the creature's idle decision. Everything is on until the player
// says otherwise, so a creature with no `mind` is a whole one.

import type { Entity } from '../types/world';

export type Drive = 'hunt' | 'flee' | 'sleep' | 'work' | 'socialise' | 'wander' | 'breed' | 'fight';

export const DRIVES: Array<{ id: Drive; label: string; hint: string }> = [
  { id: 'hunt', label: 'Hunt', hint: 'Go after prey when hungry' },
  { id: 'fight', label: 'Fight', hint: 'Take on enemies and answer attacks' },
  { id: 'flee', label: 'Flee', hint: 'Run from whatever hunts it' },
  { id: 'sleep', label: 'Sleep', hint: 'Rest when tired' },
  { id: 'work', label: 'Work', hint: 'Carry out village orders and gather' },
  { id: 'socialise', label: 'Talk', hint: 'Seek out company at the fire' },
  { id: 'wander', label: 'Wander', hint: 'Stroll about when there is nothing to do' },
  { id: 'breed', label: 'Breed', hint: 'Have young' },
];

/** Is this drive switched on? Everything is, until the player switches it off. */
export const wants = (entity: Pick<Entity, 'mind'>, drive: Drive): boolean => entity.mind?.[drive] !== false;

/** Flip one drive. Returns the new state. */
export const toggleDrive = (entity: Entity, drive: Drive): boolean => {
  const on = !wants(entity, drive);
  if (on) {
    if (entity.mind) {
      delete entity.mind[drive];
      if (Object.keys(entity.mind).length === 0) entity.mind = undefined;
    }
  } else {
    entity.mind = { ...(entity.mind ?? {}), [drive]: false };
  }
  return on;
};
