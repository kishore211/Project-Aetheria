import { describe, expect, it } from 'vitest';
import { StatContainer, createDefaultStatLibrary, createStatLibrary } from './index';

const lib = createStatLibrary([
  { id: 'a', default: 10, min: 0, max: 100 },
  { id: 'b', default: 0, min: -5, max: 5 },
]);

describe('StatContainer', () => {
  it('uses defaults when empty', () => {
    expect(new StatContainer(lib).get('a')).toBe(10);
  });

  it('aggregates (default + flat) * (1 + mult)', () => {
    const c = new StatContainer(lib);
    c.set('asset', { flat: { a: 10 } });
    c.set('trait:x', { flat: { a: 10 }, mult: { a: 0.5 } });
    c.set('item:1', { mult: { a: 0.5 } });
    expect(c.get('a')).toBe((10 + 20) * 2);
  });

  it('clamps and reports it in the breakdown', () => {
    const c = new StatContainer(lib);
    c.set('s', { flat: { a: 500, b: -50 } });
    expect(c.get('a')).toBe(100);
    expect(c.get('b')).toBe(-5);
    const bd = c.breakdown('a');
    expect(bd.clamped).toBe(true);
    expect(bd.raw).toBe(510);
    expect(bd.entries).toEqual([{ source: 's', flat: 500, mult: 0 }]);
  });

  it('removes and replaces sources', () => {
    const c = new StatContainer(lib);
    c.set('s', { flat: { a: 5 } });
    expect(c.get('a')).toBe(15);
    c.set('s', { flat: { a: 1 } });
    expect(c.get('a')).toBe(11);
    expect(c.remove('s')).toBe(true);
    expect(c.remove('s')).toBe(false);
    expect(c.get('a')).toBe(10);
    c.set('trait:a', { flat: { a: 1 } });
    c.set('trait:b', { flat: { a: 1 } });
    c.set('item:1', { flat: { a: 1 } });
    expect(c.removeWhere('trait:')).toBe(2);
    expect(c.sourceNames()).toEqual(['item:1']);
  });

  it('recomputes lazily, once per batch of edits', () => {
    const c = new StatContainer(lib);
    c.set('x', { flat: { a: 1 } });
    c.set('y', { flat: { a: 1 } });
    c.set('z', { flat: { b: 1 } });
    expect(c.recomputes).toBe(0);
    c.get('a');
    c.get('b');
    c.snapshot();
    expect(c.recomputes).toBe(1);
    c.remove('x');
    expect(c.recomputes).toBe(1);
    c.get('a');
    expect(c.recomputes).toBe(2);
  });

  it('snapshot covers all stats; unknown ids throw', () => {
    const c = new StatContainer(lib);
    expect(c.snapshot()).toEqual({ a: 10, b: 0 });
    expect(() => c.get('nope')).toThrow();
    c.set('bad', { flat: { nope: 1 } });
    expect(() => c.get('a')).toThrow();
  });

  it('breakdown sums per source', () => {
    const c = new StatContainer(lib);
    c.set('p', { flat: { a: 5 }, mult: { a: 0.2 } });
    c.set('q', { mult: { a: 0.3 } });
    const bd = c.breakdown('a');
    expect(bd).toMatchObject({ base: 10, flat: 5, mult: 0.5, raw: 22.5, value: 22.5, clamped: false });
    expect(bd.entries).toHaveLength(2);
  });
});

describe('default stat library', () => {
  const d = createDefaultStatLibrary();
  it('has the starter ids with sane ranges', () => {
    for (const id of ['health', 'damage', 'armor', 'speed', 'attack_speed', 'critical_chance',
      'critical_damage_multiplier', 'knockback', 'knockback_reduction', 'accuracy', 'dodge', 'range',
      'size', 'lifespan', 'fertility', 'offspring', 'mass', 'stamina', 'mana', 'diplomacy', 'warfare',
      'stewardship', 'intrigue', 'loyalty_traits', 'opinion']) {
      expect(d.has(id), id).toBe(true);
    }
    expect(d.filter((s) => s.id.startsWith('personality_')).length).toBeGreaterThan(0);
    for (const s of d.all()) {
      expect(s.min).toBeLessThanOrEqual(s.default);
      expect(s.max).toBeGreaterThanOrEqual(s.default);
    }
  });
  it('a container over it snapshots every stat', () => {
    const c = new StatContainer(d);
    c.set('asset', { flat: { health: 99 } });
    expect(c.get('health')).toBe(100);
    expect(Object.keys(c.snapshot())).toHaveLength(d.size);
  });
});
