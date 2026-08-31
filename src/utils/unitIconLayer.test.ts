import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { UnitIconLayer } from './unitIconLayer';
import { MATERIAL_TINT } from './tools';
import type { Entity } from '../types/world';

/** A creature with just enough on it for the rail to have something to draw. */
const makeUnit = (overrides: Partial<Entity> = {}): Entity => {
  const mesh = new THREE.Object3D();
  mesh.position.set(1, 0, 2);
  return {
    id: 'u1',
    type: 'human',
    position: { x: 1, y: 2 },
    health: 100,
    status: [],
    mesh,
    facing: 1,
    ...overrides,
  } as unknown as Entity;
};

/** Which sprite slots the layer actually drew, by geometry index. */
const drawn = (layer: UnitIconLayer) => {
  const geometry = (layer as unknown as {
    cloud: { points: THREE.Points };
  }).cloud.points.geometry;
  const size = geometry.getAttribute('aSize');
  const slot = geometry.getAttribute('aSlot');
  const tint = geometry.getAttribute('aTint');
  const out: Array<{ index: number; slot: number; tint: [number, number, number] }> = [];
  for (let i = 0; i < size.count; i += 1) {
    if (size.getX(i) <= 0) continue;
    out.push({
      index: i,
      slot: slot.getX(i),
      tint: [tint.getX(i), tint.getY(i), tint.getZ(i)],
    });
  }
  return out;
};

/** Rows per unit, mirroring the layer's own layout. */
const ROWS = 4;
const ROW_TOOL = 3;

describe('the tool row', () => {
  it('draws nothing beside a creature that is not working', () => {
    const layer = new UnitIconLayer(new THREE.Scene(), 8);
    layer.update([makeUnit({ activity: 'idle' })], 1);
    expect(drawn(layer).some(d => d.index % ROWS === ROW_TOOL)).toBe(false);
  });

  it('puts a tool beside a working creature, on the side it faces', () => {
    const layer = new UnitIconLayer(new THREE.Scene(), 8);
    const unit = makeUnit({ activity: 'building' });
    layer.update([unit], 1);

    const tools = drawn(layer).filter(d => d.index % ROWS === ROW_TOOL);
    expect(tools).toHaveLength(1);

    const geometry = (layer as unknown as {
      cloud: { points: THREE.Points };
    }).cloud.points.geometry;
    const position = geometry.getAttribute('position');
    // Offset from the unit toward its facing, not sitting on top of it: a tool
    // drawn at the creature's own centre is a tool nobody can see.
    expect(position.getX(tools[0].index)).toBeGreaterThan(unit.mesh!.position.x);

    // ...and mirrored when it turns around.
    unit.facing = -1;
    layer.update([unit], 1);
    expect(position.getX(tools[0].index)).toBeLessThan(unit.mesh!.position.x);
  });

  it('colours the tool by the village that made it, not by the creature', () => {
    const layer = new UnitIconLayer(new THREE.Scene(), 8);
    const unit = makeUnit({ activity: 'gathering', villageId: 'v1' });

    const tintOf = () => {
      const tools = drawn(layer).filter(d => d.index % ROWS === ROW_TOOL);
      expect(tools).toHaveLength(1);
      return tools[0].tint;
    };

    // The buffer is float32 and a THREE.Color is not, so these are compared
    // to a tolerance rather than exactly.
    const expectTint = (expected: THREE.Color) => {
      const [r, g, b] = tintOf();
      expect(r).toBeCloseTo(expected.r, 5);
      expect(g).toBeCloseTo(expected.g, 5);
      expect(b).toBeCloseTo(expected.b, 5);
    };

    // No village, no forge: the fallback has to be the bottom of the ladder
    // rather than an untinted white tool that reads as the top of it.
    layer.update([makeUnit({ activity: 'gathering' })], 1);
    expectTint(MATERIAL_TINT.wood);

    layer.update([unit], 1, undefined, new Map([['v1', 4]]));
    expectTint(MATERIAL_TINT.gold);

    // Lose the hall, lose the forge. The tier is read off the town every time
    // rather than remembered, so this has to go back down.
    layer.update([unit], 1, undefined, new Map([['v1', 2]]));
    expectTint(MATERIAL_TINT.stone);
  });

  it('clears the tool when the work stops', () => {
    const layer = new UnitIconLayer(new THREE.Scene(), 8);
    const unit = makeUnit({ activity: 'fighting' });
    layer.update([unit], 1);
    expect(drawn(layer).some(d => d.index % ROWS === ROW_TOOL)).toBe(true);

    unit.activity = 'sleeping';
    layer.update([unit], 1);
    expect(drawn(layer).some(d => d.index % ROWS === ROW_TOOL)).toBe(false);
  });
});
