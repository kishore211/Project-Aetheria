// Icons above units: what each creature is doing, and who it is.
//
// This is the cheapest and largest "the world is alive" signal in the game.
// WorldBox lets you read a whole village at a glance — who is hauling wood, who
// carries the banner, who is scheming — without clicking anything, and it does
// it entirely with small icons above heads (docs/project-tracker/07-UI-TEARDOWN-AND-SPEC.md).
//
// Drawn through the same one-draw-call SpriteCloud as terrain decoration and
// buildings: two icon rows per unit, addressed by a stable slot so a unit's
// icons can be updated or cleared in O(1).
import * as THREE from 'three';
import type { Entity } from '../types/world';
import { getIconAtlas } from './pixelAtlas';
import { moodFace } from './mood';
import { SpriteCloud } from './spriteCloud';

/** Rows per unit: profession on top, then activity, then mood. */
const ROWS = 3;
const ROW_PROFESSION = 0;
const ROW_ACTIVITY = 1;
const ROW_MOOD = 2;

const ICON_SIZE = 0.22;
/** Height above the unit's feet for the first row. */
const BASE_LIFT = 0.5;
const ROW_SPACING = 0.2;

/**
 * Activities worth an icon. Idle gets none, and neither does plain travelling:
 * when almost every creature is walking somewhere, an arrow over every head is
 * noise rather than information. Only purposeful journeys — hauling a load,
 * marching to war, leaving to settle — earn a marker.
 */
const ACTIVITY_ICONS: Record<string, string> = {
  gathering: 'gathering',
  hauling: 'hauling',
  building: 'building',
  fighting: 'fighting',
  hunting: 'hunting',
  fleeing: 'fleeing',
  sleeping: 'sleeping',
  talking: 'talking',
  drinking: 'drinking',
  eating: 'eating',
  marching: 'marching',
  settling: 'settling',
};

/**
 * Faces worth drawing above a head.
 *
 * Only the strong moods. A face over every creature at all times is wallpaper
 * — and with two hundred of them the eye stops reading any of it. The two
 * middle bands map to nothing here on purpose; the inspector shows all six.
 */
const MOOD_ICONS: Record<string, string> = {
  delighted: 'mood_delighted',
  happy: 'mood_happy',
  sad: 'mood_sad',
  miserable: 'mood_miserable',
};

/** Tints that make an icon's meaning readable before you resolve the glyph. */
const ACTIVITY_TINTS: Record<string, THREE.Color> = {
  fighting: new THREE.Color('#ff9a8a'),
  hunting: new THREE.Color('#ffb08a'),
  fleeing: new THREE.Color('#ffd98a'),
  marching: new THREE.Color('#ff9a8a'),
  talking: new THREE.Color('#bfe3ff'),
  sleeping: new THREE.Color('#c9c2e8'),
};

export class UnitIconLayer {
  private cloud: SpriteCloud;
  private slots = new Map<string, number>();
  private freeSlots: number[] = [];
  private nextSlot = 0;
  private capacityUnits: number;
  private scratch = new THREE.Vector3();
  private live = new Set<string>();

  /** Turned off by the player, or when zoomed too far out to read them. */
  visible = true;

  constructor(scene: THREE.Scene, maxUnits = 1200) {
    this.capacityUnits = maxUnits;
    this.cloud = new SpriteCloud(getIconAtlas(), maxUnits * ROWS);
    this.cloud.points.renderOrder = 3;
    scene.add(this.cloud.points);
  }

  setViewportScale(scale: number): void {
    this.cloud.setViewportScale(scale);
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.cloud.points.visible = visible;
  }

  /**
   * Refresh every unit's icons. Called a few times a second rather than every
   * frame: icons change on the scale of seconds, and the positions are lerped
   * from the unit meshes anyway.
   */
  update(entities: Entity[], detailLevel: number): void {
    if (!this.visible) return;

    // Icons are unreadable when the map is zoomed right out, and drawing a
    // thousand of them there is pure cost.
    if (detailLevel < 0.3) {
      this.cloud.points.visible = false;
      return;
    }
    this.cloud.points.visible = true;

    this.live.clear();

    for (const entity of entities) {
      if (!entity.mesh) continue;
      const slot = this.slotFor(entity.id);
      if (slot === null) continue;
      this.live.add(entity.id);

      const base = entity.mesh.position;
      const profession = this.professionIcon(entity);
      const activity = ACTIVITY_ICONS[entity.activity ?? ''] ?? null;
      const mood = entity.happiness === undefined
        ? null
        : MOOD_ICONS[moodFace(entity.happiness).step] ?? null;

      // Rows are packed from the head upward in whatever order they exist, so
      // a creature with only a mood never floats a lone icon two rows high
      // with a gap under it.
      let tier = 0;
      const stack = (row: number, sprite: string | null, tint?: THREE.Color) => {
        const index = slot * ROWS + row;
        if (!sprite) {
          this.cloud.clear(index);
          return;
        }
        this.place(index, base, tier, sprite, tint);
        tier += 1;
      };

      stack(ROW_MOOD, mood);
      stack(ROW_ACTIVITY, activity, activity ? ACTIVITY_TINTS[activity] : undefined);
      stack(ROW_PROFESSION, profession);
    }

    this.releaseMissing();
  }

  private place(
    row: number,
    base: THREE.Vector3,
    tier: number,
    sprite: string,
    tint?: THREE.Color,
  ): void {
    this.scratch.set(base.x, base.y + BASE_LIFT + tier * ROW_SPACING, base.z);
    this.cloud.set(row, { position: this.scratch, sprite, size: ICON_SIZE, tint });
  }

  private professionIcon(entity: Entity): string | null {
    if (entity.status.includes('king')) return 'king';
    if (entity.status.includes('leader')) return 'leader';
    if (entity.status.includes('captain')) return 'captain';
    if (entity.job === 'warrior') return 'warrior';
    return null;
  }

  /** Stable per-unit slot, recycled when a unit dies. */
  private slotFor(id: string): number | null {
    const existing = this.slots.get(id);
    if (existing !== undefined) return existing;

    const slot = this.freeSlots.pop() ?? this.nextSlot++;
    if (slot >= this.capacityUnits) {
      this.nextSlot = this.capacityUnits;
      return null;
    }
    this.slots.set(id, slot);
    return slot;
  }

  /** Free the slots of units that were not in this update's list. */
  private releaseMissing(): void {
    for (const [id, slot] of this.slots) {
      if (this.live.has(id)) continue;
      this.cloud.clear(slot * ROWS + ROW_PROFESSION);
      this.cloud.clear(slot * ROWS + ROW_ACTIVITY);
      this.cloud.clear(slot * ROWS + ROW_MOOD);
      this.slots.delete(id);
      this.freeSlots.push(slot);
    }
  }

  dispose(): void {
    this.cloud.points.removeFromParent();
    this.cloud.dispose();
    this.slots.clear();
    this.freeSlots = [];
    this.nextSlot = 0;
  }
}
