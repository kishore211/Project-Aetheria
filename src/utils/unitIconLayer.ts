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
import { isSapient } from './entitySystemMinimal';
import { SpriteCloud } from './spriteCloud';
import { MATERIAL_TINT, TOOL_SPRITE, materialForTier, toolFor } from './tools';

/**
 * Rows per unit: profession on top, then activity, then mood — and the tool,
 * which is not a row at all but a sprite beside the hand. It shares the slot
 * machinery because everything else about it is the same problem.
 */
const ROWS = 4;
const ROW_PROFESSION = 0;
const ROW_ACTIVITY = 1;
const ROW_MOOD = 2;
const ROW_TOOL = 3;

const ICON_SIZE = 0.22;
/** Tools are smaller than icons: they are part of the creature, not a label. */
const TOOL_SIZE = 0.17;
/** Sideways from the unit's centre, in the direction it is facing. */
const TOOL_REACH = 0.15;
/** Roughly hand height, well below the icon stack over the head. */
const TOOL_LIFT = 0.2;
/** Height above the unit's feet for the first row. */
const BASE_LIFT = 0.36;
const ROW_SPACING = 0.17;

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

/** Reused, so colouring a plotter does not allocate a colour every frame. */
const PLOT_PROGRESS_TINT = new THREE.Color();

export class UnitIconLayer {
  private cloud: SpriteCloud;
  private slots = new Map<string, number>();
  /** Ids currently running a plot, mapped to progress, refreshed by the caller. */
  private plotters: ReadonlyMap<string, number> | null = null;
  /** Village id to craft tier 1-4, for what the tools are made of. */
  private craftTiers: ReadonlyMap<string, number> | null = null;
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

  setViewportScale(scale: number, orthographic = false): void {
    this.cloud.setViewportScale(scale, orthographic);
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
  update(
    entities: Entity[],
    detailLevel: number,
    plotters?: ReadonlyMap<string, number>,
    craftTiers?: ReadonlyMap<string, number>,
  ): void {
    this.plotters = plotters ?? null;
    this.craftTiers = craftTiers ?? null;
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
      // No body on screen, no badges: a creature aboard a boat used to leave
      // its icons hanging over the water with nothing under them.
      if (!entity.mesh || !entity.mesh.visible) continue;
      const slot = this.slotFor(entity.id);
      if (slot === null) continue;
      this.live.add(entity.id);

      const base = entity.mesh.position;
      const profession = this.professionIcon(entity);
      const activity = ACTIVITY_ICONS[entity.activity ?? ''] ?? null;
      // People only. A sheep with a smiley face over it is a cartoon, and a
      // field of them is noise.
      const mood = entity.happiness === undefined || !isSapient(entity)
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
      stack(ROW_PROFESSION, profession, this.professionTint(entity, profession));
      this.placeTool(slot, entity, base);
    }

    this.releaseMissing();
  }

  /**
   * The thing in the creature's hand.
   *
   * Beside the unit rather than above it, because a tool is part of the
   * silhouette and the space over a head is already carrying three rows of
   * label. It flips with facing for the same reason a walk cycle does: a
   * woodcutter holding an axe behind itself is holding it wrong.
   */
  private placeTool(slot: number, entity: Entity, base: THREE.Vector3): void {
    const index = slot * ROWS + ROW_TOOL;
    const shape = toolFor(entity.activity, entity.carrying);
    if (!shape) {
      this.cloud.clear(index);
      return;
    }
    const tier = (entity.villageId && this.craftTiers?.get(entity.villageId)) || 1;
    this.scratch.set(
      base.x + TOOL_REACH * (entity.facing ?? 1),
      base.y + TOOL_LIFT,
      base.z,
    );
    this.cloud.set(index, {
      position: this.scratch,
      sprite: TOOL_SPRITE[shape],
      size: TOOL_SIZE,
      tint: MATERIAL_TINT[materialForTier(tier)],
    });
  }

  private place(
    row: number,
    base: THREE.Vector3,
    tier: number,
    sprite: string,
    tint?: THREE.Color,
  ): void {
    // Up the *screen*, which under the top-down camera is -z. Lifting in y
    // alone moved the icon straight toward the lens and changed nothing you
    // could see, so every face and badge sat on the creature's chest. The y
    // lift stays so the icon still draws in front of the sprite.
    const lift = BASE_LIFT + tier * ROW_SPACING;
    this.scratch.set(base.x, base.y + lift, base.z - lift);
    this.cloud.set(row, { position: this.scratch, sprite, size: ICON_SIZE, tint });
  }

  /**
   * How far along a scheme is, said in saturation.
   *
   * A dagger over a head tells you someone is plotting; it does not tell you
   * whether they started thinking about it this morning or are one decision
   * from acting, and those are the two things you would actually want to know
   * apart. Saturation carries it without a second glyph, a number or a panel:
   * a fresh plot is nearly grey and reads as background, a ripe one is blood
   * red and pulls the eye across the map. Progress is the icon.
   */
  private professionTint(entity: Entity, profession: string | null): THREE.Color | undefined {
    if (profession !== 'plotting') return undefined;
    const share = this.plotters?.get(entity.id);
    if (share === undefined) return undefined;
    // Lightness drops as well as saturation rising, because a pale wash on a
    // bright map is invisible however saturated it is.
    return PLOT_PROGRESS_TINT.setHSL(0.015, 0.12 + share * 0.78, 0.78 - share * 0.20);
  }

  private professionIcon(entity: Entity): string | null {
    // Scheming outranks office: a plotting king is a more urgent thing to know
    // about than a king.
    if (this.plotters?.has(entity.id)) return 'plotting';
    // Above office, below scheming. An uplifted animal is the rarest thing on
    // the map and the one you most want to be able to find again.
    if (entity.uplifted) return 'uplifted';
    if (entity.status.includes('king')) return 'king';
    if (entity.status.includes('leader')) return 'leader';
    if (entity.status.includes('captain')) return 'captain';
    if (entity.status.includes('priest')) return 'priest';
    if (entity.job === 'warrior') return 'warrior';
    if (entity.job === 'trader') return 'trader';
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
