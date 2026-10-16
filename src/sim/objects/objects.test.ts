import { describe, expect, it } from 'vitest';
import { World } from '../world';
import { Rng } from '../core/rng';
import { MetaManager, MetaObject, ObjectManager, SimObject, SpatialHash, type Spatial } from './index';

const mkWorld = () => new World({ seed: 1, width: 8, height: 8 });

class Thing extends SimObject {
  hp = 5;
}
const codec = {
  serialize: (t: Thing) => ({ id: t.id, created: t.created, hp: t.hp }),
  deserialize: (d: { id: number; created: number; hp: number }) => {
    const t = new Thing({ id: d.id, kind: 'thing', created: d.created });
    t.hp = d.hp;
    return t;
  },
};

describe('ObjectManager', () => {
  it('mints ids per kind, iterates in id order, counts', () => {
    const w = mkWorld();
    const m = new ObjectManager<Thing>('things', 'thing');
    const a = m.create(w, (i) => new Thing(i));
    const b = m.create(w, (i) => new Thing(i));
    expect([a.id, b.id]).toEqual([1, 2]);
    expect(m.count).toBe(2);
    expect([...m].map((o) => o.id)).toEqual([1, 2]);
    expect(m.get(2)).toBe(b);
  });

  it('removal fires hooks, hides object, and cleans up at next update', () => {
    const w = mkWorld();
    const m = new ObjectManager<Thing>('things', 'thing');
    w.addSystem(m);
    const seen: number[] = [];
    const off = m.onRemoved((o) => seen.push(o.id));
    const a = m.create(w, (i) => new Thing(i));
    const b = m.create(w, (i) => new Thing(i));
    for (const o of m) m.remove(w, o); // removal while iterating is safe
    expect(seen).toEqual([1, 2]);
    expect(m.count).toBe(0);
    expect(m.get(a.id)).toBeUndefined();
    expect(a.alive).toBe(false);
    expect(m.remove(w, b)).toBe(false);
    w.tick();
    off();
    const c = m.create(w, (i) => new Thing(i));
    m.remove(w, c);
    expect(seen).toEqual([1, 2]);
  });

  it('snapshots and restores, keeping id order', () => {
    const w = mkWorld();
    const m = new ObjectManager<Thing, ReturnType<typeof codec.serialize>>('things', 'thing', codec);
    for (let i = 0; i < 3; i++) m.create(w, (init) => new Thing(init)).hp = i;
    const snap = m.snapshot();
    const m2 = new ObjectManager<Thing, ReturnType<typeof codec.serialize>>('things', 'thing', codec);
    m2.restore({ objects: [...snap.objects].reverse() });
    expect([...m2].map((o) => [o.id, o.hp])).toEqual([[1, 0], [2, 1], [3, 2]]);
    expect(m2.count).toBe(3);
  });

  it('runs as a world system', () => {
    const w = mkWorld();
    let ticks = 0;
    class M extends ObjectManager<Thing> {
      protected override onUpdate(): void {
        ticks++;
      }
    }
    w.addSystem(new M('m', 'thing'));
    w.tick();
    w.tick();
    expect(ticks).toBe(2);
  });
});

describe('MetaObject', () => {
  it('tracks members and traits', () => {
    const m = new MetaObject({ id: 1, kind: 'clan', created: 0, name: 'x', colorIndex: 3, founderId: 9 });
    expect(m.addMember(5)).toBe(true);
    expect(m.addMember(5)).toBe(false);
    m.addMember(2);
    expect(m.memberCount).toBe(2);
    expect(m.memberIds()).toEqual([2, 5]);
    expect(m.removeMember(5)).toBe(true);
    expect(m.removeMember(5)).toBe(false);
    expect(m.addTrait('brave')).toBe(true);
    expect(m.hasTrait('brave')).toBe(true);
    expect(m.age(10)).toBe(10);
  });

  it('dies when empty only after having had members, and only if flagged', () => {
    const w = mkWorld();
    const mm = new MetaManager<MetaObject>('clans', 'clan');
    w.addSystem(mm);
    const a = mm.create(w, (i) => new MetaObject({ ...i, name: 'a', colorIndex: 0 }));
    const keep = mm.create(w, (i) => new MetaObject({ ...i, name: 'k', colorIndex: 1, diesWhenEmpty: false }));
    w.tick();
    expect(a.alive).toBe(true); // never had members yet
    a.addMember(1);
    keep.addMember(1);
    w.tick();
    expect(a.alive).toBe(true);
    a.removeMember(1);
    keep.removeMember(1);
    w.tick();
    expect(a.alive).toBe(false);
    expect(keep.alive).toBe(true);
    expect(mm.count).toBe(1);
  });
});

class P implements Spatial {
  constructor(readonly id: number, public x: number, public y: number) {}
}

describe('SpatialHash', () => {
  it('matches brute force with moves and removals', () => {
    const rng = new Rng(123);
    const h = new SpatialHash<P>(7);
    const pts: P[] = [];
    for (let i = 1; i <= 300; i++) {
      const p = new P(i, rng.next() * 100 - 20, rng.next() * 100 - 20);
      pts.push(p);
      h.insert(p);
    }
    for (let i = 0; i < 100; i++) {
      const p = pts[rng.int(0, pts.length - 1)];
      p.x = rng.next() * 100;
      p.y = rng.next() * 100;
      h.update(p);
    }
    for (let i = 0; i < 40; i++) h.remove(pts.pop()!);
    expect(h.size).toBe(pts.length);
    for (let q = 0; q < 50; q++) {
      const x = rng.next() * 100;
      const y = rng.next() * 100;
      const r = rng.next() * 30;
      const expected = pts.filter((p) => (p.x - x) ** 2 + (p.y - y) ** 2 <= r * r).map((p) => p.id);
      expect(h.queryRadius(x, y, r).map((p) => p.id)).toEqual(expected);
    }
  });
});
