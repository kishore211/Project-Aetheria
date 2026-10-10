import { afterEach, describe, expect, it } from 'vitest';
import { MAGNET_LIMIT, magnetDrop, magnetFollow, magnetHolding, magnetPickUp, magnetReset } from './magnet';
import type { Entity } from '../types/world';

const creature = (id: string, x = 5, y = 5): Entity => ({
  id, type: 'human', name: id, age: 1, maxAge: 80, health: 100, maxHealth: 100,
  position: { x, y }, status: [], attributes: { strength: 5, intelligence: 5, speed: 5, resilience: 5 },
  needs: { hunger: 1, thirst: 1, rest: 1, social: 1 }, inventory: [],
}) as unknown as Entity;

afterEach(() => magnetReset());

describe('the divine magnet', () => {
  it('lifts, carries and sets down a crowd', () => {
    const crowd = [creature('a'), creature('b'), creature('c')];
    const byId = new Map(crowd.map(c => [c.id, c]));
    expect(magnetPickUp(crowd)).toBe(3);
    expect(crowd.every(c => c.status.includes('lifted'))).toBe(true);
    magnetFollow(40, 30, id => byId.get(id));
    for (const c of crowd) expect(Math.hypot(c.position.x - 40, c.position.y - 30)).toBeLessThan(1.5);
    const dropped = magnetDrop(20, 20, id => byId.get(id), () => true);
    expect(dropped).toHaveLength(3);
    expect(magnetHolding()).toHaveLength(0);
    expect(crowd.some(c => c.status.includes('lifted'))).toBe(false);
    for (const c of crowd) expect(Math.hypot(c.position.x - 20, c.position.y - 20)).toBeLessThan(1.5);
  });

  it('holds no more than its limit, and nobody twice', () => {
    const many = Array.from({ length: MAGNET_LIMIT + 10 }, (_, i) => creature(`c${i}`));
    expect(magnetPickUp(many)).toBe(MAGNET_LIMIT);
    expect(magnetPickUp(many)).toBe(MAGNET_LIMIT);
  });

  it('lets the dead fall out of its hand', () => {
    const crowd = [creature('a'), creature('b')];
    magnetPickUp(crowd);
    magnetFollow(1, 1, id => (id === 'a' ? crowd[0] : undefined));
    expect(magnetHolding()).toEqual(['a']);
  });

  it('never drops anyone off the edge of the world', () => {
    const c = creature('a');
    const byId = new Map([[c.id, c]]);
    magnetPickUp([c]);
    const dropped = magnetDrop(0.5, 0.5, id => byId.get(id), (x, y) => x >= 1 && y >= 1);
    expect(dropped[0].position).toEqual({ x: 1, y: 1 });
  });
});
