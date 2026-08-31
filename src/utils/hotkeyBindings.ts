// Ten power slots the player owns.
//
// Phase 19.6. The digits already picked the nth power of the open tab, which
// is fine until you have a way of playing — and then you want *your* four
// powers under your fingers rather than whichever four happen to be third in
// their tabs. Binding one takes it over; leaving it unbound leaves the old
// behaviour exactly where it was, so nothing anyone has already learned stops
// working.
//
// Persisted, because a binding you have to redo every session is not a binding.
import type { Tool } from '../store/gameStore';

export const HOTKEY_SLOTS = 10;

const STORAGE_KEY = 'aetheria.hotkeys';

const empty = (): (Tool | null)[] => Array(HOTKEY_SLOTS).fill(null);

/**
 * Read the saved bindings.
 *
 * Tolerant of anything: a stored value from an older build may name a power
 * that no longer exists, be the wrong length, or not be an array at all, and
 * none of that is worth refusing to start the game over. Anything unreadable
 * comes back as unbound, which is the same as never having set it.
 */
export const loadHotkeys = (): (Tool | null)[] => {
  if (typeof localStorage === 'undefined') return empty();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return empty();
    const slots = empty();
    for (let i = 0; i < HOTKEY_SLOTS; i += 1) {
      const value = parsed[i];
      if (typeof value === 'string' && value.length > 0) slots[i] = value as Tool;
    }
    return slots;
  } catch {
    return empty();
  }
};

export const persistHotkeys = (slots: (Tool | null)[]): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
  } catch {
    // A full or blocked store is not a reason to interrupt anyone's game.
  }
};

/**
 * Which slot a digit means.
 *
 * `1`-`9` are slots 0-8 and `0` is the tenth, because that is where a row of
 * number keys puts them and every game that has ever used this row does it
 * this way. Returns -1 for anything else.
 */
export const slotForKey = (key: string): number => {
  if (key.length !== 1 || key < '0' || key > '9') return -1;
  return key === '0' ? HOTKEY_SLOTS - 1 : Number(key) - 1;
};
