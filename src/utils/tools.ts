// What a creature is holding, and what it is made of.
//
// The tool-in-hand rule (docs/project-tracker/08-MASTER-PLAN.md 16.14, 17.10):
// four shapes, tinted by one of four materials. Between them they put the whole
// labour economy and the whole tech ladder into a silhouette — you can look at
// a settlement from across the map and see that its people are cutting timber
// with iron rather than quarrying stone with flint, with no panel open and no
// number anywhere on screen.
//
// Four shapes and four materials rather than a tool per job, because sixteen
// combinations is already more states than a player can hold, and a silhouette
// only reads if the vocabulary is small.
import * as THREE from 'three';

export type ToolShape = 'axe' | 'pick' | 'hammer' | 'blade';
export type ToolMaterial = 'wood' | 'stone' | 'iron' | 'gold';

/** Sprite name in the icon atlas for each shape. */
export const TOOL_SPRITE: Record<ToolShape, string> = {
  axe: 'tool_axe',
  pick: 'tool_pick',
  hammer: 'tool_hammer',
  blade: 'tool_blade',
};

/**
 * The ladder, in colour.
 *
 * Deliberately not wood → stone → bronze → iron: bronze and wood are both warm
 * mid-browns at this size and the two rungs that matter most would have been
 * the two nobody could tell apart. Brown, grey, pale steel and gold separate at
 * a glance, which is the only property that counts for something eight pixels
 * across.
 */
export const MATERIAL_TINT: Record<ToolMaterial, THREE.Color> = {
  wood: new THREE.Color('#a9763f'),
  stone: new THREE.Color('#9aa0a6'),
  iron: new THREE.Color('#dbe2ea'),
  gold: new THREE.Color('#f2c14e'),
};

const LADDER: ToolMaterial[] = ['wood', 'stone', 'iron', 'gold'];

/** Tier 1-4 to a material, clamped so an unknown tier still draws something. */
export const materialForTier = (tier: number): ToolMaterial =>
  LADDER[Math.max(0, Math.min(LADDER.length - 1, Math.round(tier) - 1))];

/**
 * Anything you get by hitting rock. A pick, not an axe.
 */
const QUARRIED = new Set(['stone', 'iron', 'gold', 'silver', 'coal', 'crystal', 'gem']);

/**
 * What this creature would have in its hand right now.
 *
 * Driven by what it is *doing*, not by what it is — a profession is a label and
 * an activity is a fact, and the fact is the one worth drawing. Idling,
 * sleeping, eating and talking deliberately hold nothing: a village where every
 * hand is full at all hours reads as a factory floor, and the tools stop
 * meaning anything the moment they are always there.
 *
 * The load decides between axe and pick, because there is no separate mining
 * state to read — a gatherer on a mountain and a gatherer in a wood are the
 * same activity, and the only thing that distinguishes them is what comes back.
 */
export const toolFor = (
  activity: string | undefined | null,
  carrying?: { type: string } | null,
): ToolShape | null => {
  switch (activity) {
    case 'gathering':
    case 'hauling':
      return carrying && QUARRIED.has(carrying.type) ? 'pick' : 'axe';
    case 'building':
      return 'hammer';
    case 'fighting':
    case 'hunting':
    case 'marching':
      return 'blade';
    default:
      return null;
  }
};
