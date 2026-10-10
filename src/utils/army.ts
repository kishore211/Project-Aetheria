// Armies as formations.
//
// A warband that is just a cloud around its captain reads as a crowd. In
// WorldBox an army marches in ranks behind its banner, and you can tell a war
// is on from across the map because the shapes moving on it are blocks, not
// smudges (06-WORLDBOX-COMPLETE-REFERENCE.md §6, Armies). This is the
// geometry for that: a slot per soldier, in ranks of four behind the captain,
// facing wherever the army is going.

/** Soldiers to a rank. */
export const RANK_WIDTH = 4;
/** Tiles between ranks, and between files within a rank. */
const RANK_GAP = 0.8;
const FILE_GAP = 0.7;

export interface Offset { x: number; y: number }

/**
 * The slot each of `count` soldiers takes, relative to the captain, for an
 * army heading along (dirX, dirY). Ranks run perpendicular to the heading and
 * stack behind the captain, so the block always trails its banner.
 */
export const formationSlots = (count: number, dirX: number, dirY: number): Offset[] => {
  const length = Math.hypot(dirX, dirY);
  const fx = length > 0 ? dirX / length : 0;
  const fy = length > 0 ? dirY / length : 1;
  // Perpendicular, to the captain's right.
  const px = -fy;
  const py = fx;
  const slots: Offset[] = [];
  for (let i = 0; i < count; i++) {
    const rank = Math.floor(i / RANK_WIDTH) + 1;
    const inRank = Math.min(RANK_WIDTH, count - (rank - 1) * RANK_WIDTH);
    const file = (i % RANK_WIDTH) - (inRank - 1) / 2;
    slots.push({
      x: -fx * rank * RANK_GAP + px * file * FILE_GAP,
      y: -fy * rank * RANK_GAP + py * file * FILE_GAP,
    });
  }
  return slots;
};

/**
 * Whether a town falls to its conqueror or is burned.
 *
 * WorldBox's kingdoms take cities rather than flatten them, which is what
 * makes a map's borders move during a war instead of just emptying. Orcs are
 * our exception — they burn what they win, so a war with orcs feels unlike a
 * war between elves. A town with nobody left in it has nothing to take either.
 */
export const conquestOutcome = (conquerorRace: string, residents: number): 'capture' | 'raze' =>
  conquerorRace === 'orc' || residents === 0 ? 'raze' : 'capture';
