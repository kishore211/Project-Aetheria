import { describe, expect, it, beforeEach } from 'vitest';
import {
  advanceFloaters,
  clearFloaters,
  emitDamage,
  emitFloater,
  floatBridge,
} from './floatBridge';
import { LINE_COUNT, OCCASION_COUNT, speak } from './dialogue';

const live = () => floatBridge.slots.filter(slot => slot.id !== 0);

describe('floatBridge', () => {
  beforeEach(() => {
    clearFloaters();
  });

  it('holds a floater until its life runs out, then frees the slot', () => {
    emitFloater({ kind: 'damage', text: '-5', x: 4, y: 4, life: 1 });
    expect(live()).toHaveLength(1);

    advanceFloaters(0.5);
    expect(live()).toHaveLength(1);

    advanceFloaters(0.6);
    expect(live()).toHaveLength(0);
  });

  it('never grows past the pool, however hard it is pushed', () => {
    // A battle asking for hundreds a second must degrade to "show the newest
    // few dozen", not to an allocation.
    const before = floatBridge.slots.length;
    for (let index = 0; index < 500; index += 1) {
      emitFloater({ kind: 'damage', text: `-${index}`, x: 1, y: 1 });
    }
    expect(floatBridge.slots.length).toBe(before);
    expect(live().length).toBeLessThanOrEqual(before);
  });

  it('drops damage numbers that would round to nothing', () => {
    emitDamage(2, 2, 0.4);
    expect(live()).toHaveLength(0);

    emitDamage(2, 2, 1.6);
    expect(live()).toHaveLength(1);
    expect(live()[0].text).toBe('-2');
  });

  it('rations speech globally so a crowd cannot all talk at once', () => {
    // Two hundred villagers each with something to say is noise, not a world
    // with people in it. Only the budget should get through.
    let accepted = 0;
    for (let index = 0; index < 100; index += 1) {
      if (emitFloater({ kind: 'speech', text: 'hello', x: 1, y: 1, entityId: `u${index}` })) {
        accepted += 1;
      }
    }
    expect(accepted).toBeLessThanOrEqual(3);
    expect(accepted).toBeGreaterThan(0);
  });

  it('refills the speech budget over time', () => {
    // Distinct ids, or the per-unit cooldown refuses before the budget does
    // and the loop exits with the budget still full.
    let drained = 0;
    while (emitFloater({ kind: 'speech', text: 'x', x: 1, y: 1, entityId: `d${drained}` })) {
      drained += 1;
    }
    expect(drained).toBeGreaterThan(0);
    expect(emitFloater({ kind: 'speech', text: 'x', x: 1, y: 1, entityId: 'b' })).toBe(false);

    advanceFloaters(1);
    expect(emitFloater({ kind: 'speech', text: 'x', x: 1, y: 1, entityId: 'c' })).toBe(true);
  });

  it('holds one creature to a single line per cooldown', () => {
    expect(emitFloater({ kind: 'speech', text: 'first', x: 1, y: 1, entityId: 'chatty' })).toBe(true);
    // Budget is refilled so only the per-unit cooldown can refuse this.
    advanceFloaters(2);
    expect(emitFloater({ kind: 'speech', text: 'again', x: 1, y: 1, entityId: 'chatty' })).toBe(false);
    // A different creature is free to speak in the same moment.
    expect(emitFloater({ kind: 'speech', text: 'mine', x: 1, y: 1, entityId: 'other' })).toBe(true);
  });

  it('does not ration numbers — a fight should read as a fight', () => {
    for (let index = 0; index < 20; index += 1) {
      expect(emitFloater({ kind: 'damage', text: '-3', x: 1, y: 1 })).toBe(true);
    }
  });

  it('scatters numbers sideways so overlapping hits stay readable', () => {
    for (let index = 0; index < 12; index += 1) emitDamage(5, 5, 4);
    const drifts = new Set(live().map(slot => slot.drift));
    expect(drifts.size).toBeGreaterThan(1);
    // Speech is centred: a bubble that wandered off its speaker looks broken.
    emitFloater({ kind: 'speech', text: 'centred', x: 5, y: 5, entityId: 'z' });
    expect(live().find(slot => slot.kind === 'speech')?.drift).toBe(0);
  });

  it('stacks simultaneous bubbles instead of overlapping them', () => {
    clearFloaters();
    emitFloater({ kind: 'speech', text: 'first', x: 5, y: 5, entityId: 'a' });
    advanceFloaters(1);
    emitFloater({ kind: 'speech', text: 'second', x: 5, y: 5, entityId: 'b' });

    const bubbles = live().filter(slot => slot.kind === 'speech');
    expect(bubbles).toHaveLength(2);
    expect(new Set(bubbles.map(slot => slot.stack)).size).toBe(2);
    // Numbers scatter sideways instead; three rows of them would leave the screen.
    emitDamage(5, 5, 7);
    expect(live().find(slot => slot.kind === 'damage')?.stack).toBe(0);
  });

  it('clears everything for a new world', () => {
    emitDamage(1, 1, 9);
    emitFloater({ kind: 'speech', text: 'x', x: 1, y: 1, entityId: 'q' });
    clearFloaters();
    expect(live()).toHaveLength(0);
    // The cooldown table is cleared too, or a returning id would be mute.
    expect(emitFloater({ kind: 'speech', text: 'x', x: 1, y: 1, entityId: 'q' })).toBe(true);
  });
});

describe('dialogue', () => {
  it('gives every occasion more than one line', () => {
    // One fixed line per situation reads as a status label. Three read as a
    // person having a bad day, which is the entire point.
    expect(LINE_COUNT / OCCASION_COUNT).toBeGreaterThanOrEqual(3);
  });

  it('picks a line for any seed, including the edges', () => {
    for (const seed of [0, 0.5, 0.999999, 1]) {
      expect(speak('hungry', seed)).toBeTruthy();
    }
  });

  it('varies with the seed', () => {
    const lines = new Set([0.1, 0.4, 0.7, 0.95].map(seed => speak('content', seed)));
    expect(lines.size).toBeGreaterThan(1);
  });

  it('never says the same line twice in a row', () => {
    // Two creatures reacting to one event should not echo each other; with
    // three options that happens a third of the time without this.
    let previous = '';
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const line = speak('blessed', (attempt % 3) / 3);
      expect(line).not.toBe(previous);
      previous = line;
    }
  });
});
