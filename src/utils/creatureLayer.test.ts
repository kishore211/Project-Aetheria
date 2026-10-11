import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CreatureLayer } from './creatureLayer';
import type { Entity } from '../types/world';

const creature = (facing: 1 | -1): Entity => {
  const root = new THREE.Object3D();
  const texture = new THREE.Texture();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
  sprite.scale.set(0.5 * facing, 0.5, 1);
  root.add(sprite);
  return { mesh: root } as unknown as Entity;
};

describe('CreatureLayer', () => {
  it('draws mirrored (left-facing) creatures rather than culling them', () => {
    const layer = new CreatureLayer();
    const sprites = layer.mesh.getObjectByName('creatures') as THREE.Mesh;
    // A negative x scale reverses the quad's winding; a front-side-only
    // material would cull it and leave only the health bar and icons.
    expect((sprites.material as THREE.Material).side).toBe(THREE.DoubleSide);
    expect(layer.update([creature(1), creature(-1)])).toBe(2);
    layer.dispose();
  });
});
