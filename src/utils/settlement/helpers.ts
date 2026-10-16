// Small pure helpers for the civilization layer: id minting, the town colour
// hash, the placement and siting rules, and tier and footprint lookups.
import * as THREE from 'three';
import type { Race, Tile } from '../../types/world';
import type { LayoutId } from '../identity';
import type { Village } from './types';
import { SENTIENT_RACES, TIERS, ZONE_SIZE } from './constants';

/** A stable, saturated colour for a town, from its id. */
export const townColour = (id: string): string => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `#${new THREE.Color().setHSL(((h >>> 0) % 360) / 360, 0.65, 0.55).getHexString()}`;
};

export const zoneKey = (x: number, y: number): string =>
  `${Math.floor(x / ZONE_SIZE)},${Math.floor(y / ZONE_SIZE)}`;

/** How many of the eight neighbouring zones already hold one of our buildings. */
export const adjacentZonesFilled = (
  x: number, y: number, filled: ReadonlySet<string>,
): number => {
  let count = 0;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      if (filled.has(zoneKey(x + dx * ZONE_SIZE, y + dy * ZONE_SIZE))) count += 1;
    }
  }
  return count;
};

/** Tiles on a side. Derived from the kind, so no save has to carry it. */
export const footprintOf = (kind: string): number => TIERS[kind]?.footprint ?? 1;

/** 1-3. Drives the tool a builder carries, and how much ground the thing takes. */
export const tierOf = (kind: string): number => TIERS[kind]?.tier ?? 1;

/**
 * Does a tile sit where this culture would put a building?
 *
 * Stage two of placement, and the reason two towns of different peoples look
 * different. Each rule is a cheap predicate on the tile's offset from the town
 * centre — no pathing, no street graph, just a shape.
 */
export const fitsLayout = (
  layout: LayoutId, x: number, y: number, village: Village,
): boolean => {
  const dx = x - village.centerX;
  const dy = y - village.centerY;
  switch (layout) {
    // Streets on the even lines, buildings on the odd ones.
    case 'grid': return Math.abs(dx) % 2 === 1 && Math.abs(dy) % 2 === 1;
    // Concentric bands with a gap between them.
    case 'rings': return Math.max(Math.abs(dx), Math.abs(dy)) % 2 === 1;
    // Two columns built, one skipped, and the skip walks along each row —
    // a staggered comb with a period of three rather than a checkerboard.
    // The first version offset alternate rows by one, which reduces to exactly
    // the diagonal rule below: two cultures, one silhouette.
    case 'honeycomb': return (dx + Math.abs(dy)) % 3 !== 0;
    // Diagonal lanes.
    case 'diagonal': return (dx + dy) % 2 === 0;
    // No rule at all, which is itself a look.
    default: return true;
  }
};

/**
 * How much the ground under a building is worth.
 *
 * Terrain visibly matters to income, which is most of what makes siting a town
 * on good land feel like a decision rather than a formality.
 */
export const groundBonus = (tile: Tile): number => {
  if (tile.type === 'badlands' || tile.type === 'desert' || tile.type === 'mesa') return 0.6;
  if (tile.type === 'volcanic' || tile.type === 'corrupted') return 0.4;
  if (tile.fertility > 0.65) return 1.4;
  return 1;
};

/**
 * Ids are minted from a module-level counter, not a per-instance one. Two
 * settlement systems each numbering their villages from 1 produce colliding
 * ids, and anything that looks a village up by id — order completion, saves —
 * can then match the wrong world's village.
 */
let nextIdentifier = 1;
export const mintId = (prefix: string): string => `${prefix}-${nextIdentifier++}`;

/** Stable key for a pair of kingdoms, order-independent. */
export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const isRace = (value: string): value is Race => SENTIENT_RACES.includes(value as Race);

/**
 * Moves the shared counter past an id restored from a save, so a village founded
 * after loading can never reuse a restored number.
 */
export const keepIdentifierAhead = (numeric: number): void => {
  if (numeric >= nextIdentifier) nextIdentifier = numeric + 1;
};
