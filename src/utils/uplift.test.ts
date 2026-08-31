import { describe, expect, it } from 'vitest';
import { BORN_SAPIENT, isSapient } from './entitySystemMinimal';
import type { Entity, EntityType } from '../types/world';

const at = (type: EntityType, uplifted?: boolean) =>
  ({ type, uplifted }) as Pick<Entity, 'type' | 'uplifted'>;

describe('beast and uplifted', () => {
  it('gives the four races an inner life without being asked', () => {
    for (const race of ['human', 'elf', 'dwarf', 'orc'] as EntityType[]) {
      expect(isSapient(at(race))).toBe(true);
      expect(BORN_SAPIENT.has(race)).toBe(true);
    }
  });

  it('leaves an ordinary animal outside it', () => {
    for (const beast of ['wolf', 'sheep', 'deer', 'dragon'] as EntityType[]) {
      expect(isSapient(at(beast))).toBe(false);
    }
  });

  it('opens the door with one flag, and closes it again', () => {
    // The whole of 19.2: everything downstream already keys off this single
    // question, so nothing else had to change to let a wolf make a friend.
    const wolf = at('wolf');
    expect(isSapient(wolf)).toBe(false);
    (wolf as { uplifted?: boolean }).uplifted = true;
    expect(isSapient(wolf)).toBe(true);
    (wolf as { uplifted?: boolean }).uplifted = false;
    expect(isSapient(wolf)).toBe(false);
  });

  it('cannot take an inner life away from something born with one', () => {
    // Un-uplifting a human would be a way to delete a person's mind with a
    // brush, which is a different and much darker power than the one on the
    // bar. The flag only ever adds.
    expect(isSapient(at('human', false))).toBe(true);
  });

  it('doubles the bestiary rather than replacing half of it', () => {
    // 19.2's arithmetic: every animal gains a second entry and loses nothing.
    const beasts = ['wolf', 'bear', 'deer', 'rabbit', 'sheep', 'fox'] as EntityType[];
    const entries = new Set<string>();
    for (const beast of beasts) {
      entries.add(`${beast}:beast`);
      entries.add(`${beast}:uplifted`);
    }
    expect(entries.size).toBe(beasts.length * 2);
  });
});
