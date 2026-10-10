import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RelationLines } from './relationLines';
import type { Entity } from '../types/world';

const creature = (id: string, x: number, extra: Partial<Entity> = {}): Entity => {
  const mesh = new THREE.Object3D();
  mesh.position.set(x, 0, 0);
  return { id, mesh, position: { x, y: 0 }, ...extra } as unknown as Entity;
};

describe('relationship lines', () => {
  it('draws one line per relationship that exists, and none for a loner', () => {
    const lover = creature('lover', 3);
    const friend = creature('friend', -2);
    const subject = creature('me', 0, { loverId: 'lover', friendId: 'friend' });
    const others = new Map([['lover', lover], ['friend', friend]]);
    const lines = new RelationLines();
    const lookup = {
      entity: (id: string) => others.get(id),
      home: () => ({ x: 4, y: 4 }),
      toWorld: (x: number, y: number, target: THREE.Vector3) => target.set(x, 0, y),
    };
    expect(lines.update(subject, lookup)).toBe(3);
    expect(lines.update(creature('loner', 1), { ...lookup, home: () => null })).toBe(0);
    expect(lines.update(null, lookup)).toBe(0);
    // A partner who has died is not drawn as a line to nowhere.
    expect(lines.update(subject, { ...lookup, entity: () => undefined, home: () => null })).toBe(0);
    lines.dispose();
  });
});
