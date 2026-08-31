import { describe, expect, it, beforeEach } from 'vitest';
import { HOTKEY_SLOTS, loadHotkeys, persistHotkeys, slotForKey } from './hotkeyBindings';
import type { Tool } from '../store/gameStore';

beforeEach(() => localStorage.clear());

describe('hotkey slots', () => {
  it('maps the number row the way every game does', () => {
    expect(slotForKey('1')).toBe(0);
    expect(slotForKey('9')).toBe(8);
    // Zero is the tenth, not the first, because that is where the key is.
    expect(slotForKey('0')).toBe(HOTKEY_SLOTS - 1);
  });

  it('ignores everything that is not a digit', () => {
    for (const key of ['a', 'Enter', '', 'Shift', '10', ' ']) {
      expect(slotForKey(key)).toBe(-1);
    }
  });

  it('starts unbound and survives a round trip', () => {
    expect(loadHotkeys()).toEqual(Array(HOTKEY_SLOTS).fill(null));

    const slots = Array(HOTKEY_SLOTS).fill(null) as (Tool | null)[];
    slots[0] = 'meteor';
    slots[9] = 'blessing';
    persistHotkeys(slots);
    expect(loadHotkeys()).toEqual(slots);
  });

  it('shrugs off anything unreadable rather than refusing to start', () => {
    // A binding written by an older build may be the wrong shape, the wrong
    // length, or not JSON at all. None of that is worth a broken game.
    for (const junk of ['not json', '{"a":1}', '[1,2,3]', '[]', 'null']) {
      localStorage.setItem('aetheria.hotkeys', junk);
      const slots = loadHotkeys();
      expect(slots).toHaveLength(HOTKEY_SLOTS);
      expect(slots.every(slot => slot === null)).toBe(true);
    }
  });

  it('keeps only the slots it can use from an over-long save', () => {
    localStorage.setItem(
      'aetheria.hotkeys',
      JSON.stringify(['meteor', ...Array(30).fill('lightning')]),
    );
    const slots = loadHotkeys();
    expect(slots).toHaveLength(HOTKEY_SLOTS);
    expect(slots[0]).toBe('meteor');
  });
});
