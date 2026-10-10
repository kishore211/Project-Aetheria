// Lines from the selected creature to the people and places in its life.
//
// WorldBox draws relationship arrows from a selected unit: to its lover, its
// family, its house, whatever it is attacking (06-WORLDBOX-COMPLETE-REFERENCE
// §3). It is the cheapest possible way to turn a population into a set of
// individuals — click one villager and you can see who it loves and where it
// sleeps without opening a single panel.
import * as THREE from 'three';
import type { Entity } from '../types/world';

/** Lover, friend, home. One segment each. */
const MAX_SEGMENTS = 3;
const LIFT = 0.12;

const COLOURS = {
  lover: new THREE.Color('#ff6fa8'),
  friend: new THREE.Color('#ffd34d'),
  home: new THREE.Color('#e8f0ff'),
};

export interface RelationLookup {
  entity: (id: string) => Entity | undefined;
  home: (entity: Entity) => { x: number; y: number } | null;
  /** Tile coordinates to world space. */
  toWorld: (x: number, y: number, target: THREE.Vector3) => THREE.Vector3;
}

export class RelationLines {
  readonly lines: THREE.LineSegments;
  private positions: THREE.BufferAttribute;
  private colours: THREE.BufferAttribute;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();

  constructor() {
    const geometry = new THREE.BufferGeometry();
    this.positions = new THREE.BufferAttribute(new Float32Array(MAX_SEGMENTS * 2 * 3), 3);
    this.colours = new THREE.BufferAttribute(new Float32Array(MAX_SEGMENTS * 2 * 3), 3);
    this.positions.setUsage(THREE.DynamicDrawUsage);
    this.colours.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('color', this.colours);
    geometry.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 5;
    this.lines.name = 'relation-lines';
  }

  /**
   * Redraw for a creature, or hide everything for null. Returns how many
   * lines are showing, which is mostly for tests.
   */
  update(subject: Entity | null, lookup: RelationLookup): number {
    let count = 0;
    if (subject?.mesh) {
      this.from.copy(subject.mesh.position);
      this.from.y += LIFT;
      const add = (point: THREE.Vector3, colour: THREE.Color) => {
        this.positions.setXYZ(count * 2, this.from.x, this.from.y, this.from.z);
        this.positions.setXYZ(count * 2 + 1, point.x, point.y + LIFT, point.z);
        this.colours.setXYZ(count * 2, colour.r, colour.g, colour.b);
        this.colours.setXYZ(count * 2 + 1, colour.r, colour.g, colour.b);
        count += 1;
      };
      const toEntity = (id: string | null | undefined, colour: THREE.Color) => {
        if (!id) return;
        const other = lookup.entity(id);
        if (other?.mesh) add(other.mesh.position, colour);
      };
      toEntity(subject.loverId, COLOURS.lover);
      toEntity(subject.friendId, COLOURS.friend);
      const home = lookup.home(subject);
      if (home) add(lookup.toWorld(home.x, home.y, this.to), COLOURS.home);
    }
    this.lines.geometry.setDrawRange(0, count * 2);
    this.positions.needsUpdate = true;
    this.colours.needsUpdate = true;
    return count;
  }

  dispose(): void {
    this.lines.removeFromParent();
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}
