import { describe, expect, it } from 'vitest';
import { Rng, RngStreams } from './rng';
import { Interval, SimClock } from './clock';
import { Library } from './library';
import { SimEvents } from './events';
import { IdAllocator } from './ids';

describe('Rng', () => {
  it('is reproducible from a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('streams are independent: drawing from one does not move another', () => {
    const s1 = new RngStreams(7);
    const s2 = new RngStreams(7);
    for (let i = 0; i < 50; i++) s1.get('noise').next();
    expect(s1.get('ai').next()).toBe(s2.get('ai').next());
  });

  it('weighted picks follow weights', () => {
    const rng = new Rng(1);
    const counts = [0, 0, 0];
    for (let i = 0; i < 6000; i++) counts[rng.weighted([1, 2, 3])]++;
    expect(counts[2] / counts[0]).toBeGreaterThan(2.4);
    expect(counts[2] / counts[0]).toBeLessThan(3.6);
    expect(rng.weighted([0, 0])).toBe(-1);
  });

  it('snapshot/restore resumes the same sequence', () => {
    const s = new RngStreams(3);
    s.get('x').next();
    const snap = s.snapshot();
    const expected = s.get('x').next();
    const t = new RngStreams(3);
    t.restore(snap);
    expect(t.get('x').next()).toBe(expected);
  });
});

describe('SimClock', () => {
  it('derives calendar from world seconds', () => {
    const c = new SimClock({ secondsPerMonth: 5, monthsPerYear: 12 }, 0.5);
    expect(c.year).toBe(1);
    expect(c.month).toBe(1);
    for (let i = 0; i < 130; i++) c.advance(); // 65 s
    expect(c.year).toBe(2);
    expect(c.month).toBe(2);
  });

  it('speed sets ticks per frame; paused runs none', () => {
    const c = new SimClock();
    c.speed = 3;
    expect(c.ticksThisFrame()).toBe(4);
    c.paused = true;
    expect(c.ticksThisFrame()).toBe(0);
  });

  it('Interval fires once per period', () => {
    const iv = new Interval(1);
    let fired = 0;
    for (let i = 0; i < 100; i++) if (iv.tick(0.1)) fired++;
    expect(fired).toBe(10);
  });
});

describe('Library', () => {
  it('rejects duplicates and unknown ids, supports clone and freeze', () => {
    const lib = new Library<{ id: string; hp: number }>('test');
    lib.add({ id: 'wolf', hp: 10 });
    expect(() => lib.add({ id: 'wolf', hp: 1 })).toThrow(/duplicate/);
    expect(() => lib.get('nope')).toThrow(/unknown/);
    expect(lib.clone('dire_wolf', 'wolf', { hp: 20 })).toEqual({ id: 'dire_wolf', hp: 20 });
    lib.freeze();
    expect(() => lib.add({ id: 'x', hp: 0 })).toThrow(/frozen/);
    expect(lib.size).toBe(2);
  });
});

describe('SimEvents and ids', () => {
  it('delivers typed events with world time', () => {
    const ev = new SimEvents();
    ev.now = 12;
    const seen: number[] = [];
    const off = ev.on('tile:changed', (d, t) => seen.push(d.x, t));
    ev.emit('tile:changed', { x: 3, y: 4 });
    off();
    ev.emit('tile:changed', { x: 5, y: 4 });
    expect(seen).toEqual([3, 12]);
  });

  it('ids are per kind and survive snapshot', () => {
    const ids = new IdAllocator();
    expect(ids.mint('actor')).toBe(1);
    expect(ids.mint('actor')).toBe(2);
    expect(ids.mint('city')).toBe(1);
    const again = new IdAllocator();
    again.restore(ids.snapshot());
    expect(again.mint('actor')).toBe(3);
  });
});
