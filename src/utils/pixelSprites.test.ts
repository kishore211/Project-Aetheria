import { describe, expect, it } from 'vitest';
import { TEMPLATES, WALK_FRAMES, poseGrid, shadedCells } from './pixelSprites';

/**
 * These tests exist because of a defect that survived three rounds of "the
 * animations do not feel right".
 *
 * The old generator produced a "two-frame walk cycle" by mirroring the bottom
 * three rows of the sprite grid. Every template's leg rows are horizontally
 * symmetric — `...pp..pp...` mirrors to itself — so the two frames came out
 * pixel-identical for six of the seven templates. There was no walk animation
 * in the game at all, and nothing in the codebase could have told us, because
 * the frames were only ever compared by object identity.
 *
 * So what is under test is not "does it produce frames" but "are the frames
 * different from each other, and different in the right way".
 */

const NAMES = Object.keys(TEMPLATES);

/** Templates whose grid actually has feet to lift. */
const withFeet = NAMES.filter((name) => {
  const grid = TEMPLATES[name];
  return poseGrid(grid, 1).join('\n') !== grid.join('\n');
});

describe('the walk cycle pose', () => {
  it('covers four frames', () => {
    expect(WALK_FRAMES).toBe(4);
  });

  it('keeps every frame the same shape as the template', () => {
    for (const name of NAMES) {
      const grid = TEMPLATES[name];
      for (let frame = 0; frame < WALK_FRAMES; frame += 1) {
        const posed = poseGrid(grid, frame);
        expect(posed, name).toHaveLength(grid.length);
        for (let row = 0; row < posed.length; row += 1) {
          expect(posed[row].length, `${name} frame ${frame} row ${row}`)
            .toBe(grid[row].length);
        }
      }
    }
  });

  it('changes something on the lifted frames — the bug that started all this', () => {
    // Six of seven templates used to come out identical here.
    expect(withFeet.length).toBeGreaterThanOrEqual(6);
    for (const name of withFeet) {
      const grid = TEMPLATES[name];
      expect(poseGrid(grid, 1).join('\n'), `${name} frame 1`).not.toBe(grid.join('\n'));
      expect(poseGrid(grid, 3).join('\n'), `${name} frame 3`).not.toBe(grid.join('\n'));
    }
  });

  it('lifts a different side on frame 1 than on frame 3', () => {
    for (const name of withFeet) {
      const grid = TEMPLATES[name];
      expect(poseGrid(grid, 1).join('\n'), `${name} lifts the same side twice`)
        .not.toBe(poseGrid(grid, 3).join('\n'));
    }
  });

  it('leaves frames 0 and 2 as the standing pose', () => {
    // They are the passing poses; a still image should be the standing one.
    for (const name of NAMES) {
      const grid = TEMPLATES[name];
      expect(poseGrid(grid, 0)).toEqual(grid);
      expect(poseGrid(grid, 2)).toEqual(grid);
    }
  });

  it('touches only the leg rows, so the body stays still', () => {
    // A whole-sprite offset reads as juddering rather than as walking.
    for (const name of withFeet) {
      const grid = TEMPLATES[name];
      const posed = poseGrid(grid, 1);
      // Anything more than two rows above the lowest change must be untouched.
      const changed = posed.map((row, index) => row !== grid[index]);
      const lowest = changed.lastIndexOf(true);
      const highest = changed.indexOf(true);
      expect(lowest - highest, `${name} moved too many rows`).toBeLessThan(2);
    }
  });

  it('never invents a pixel — a lifted leg only ever loses ground', () => {
    const ink = (rows: string[]) =>
      rows.join('').split('').filter((cell) => cell !== '.').length;
    for (const name of withFeet) {
      const grid = TEMPLATES[name];
      for (const frame of [1, 3]) {
        expect(ink(poseGrid(grid, frame)), `${name} frame ${frame}`)
          .toBeLessThanOrEqual(ink(grid));
      }
    }
  });

  it('leaves a footless template alone rather than mangling it', () => {
    // A fish has nothing to lift; the right answer is the template unchanged.
    const footless = NAMES.filter((name) => !withFeet.includes(name));
    for (const name of footless) {
      for (let frame = 0; frame < WALK_FRAMES; frame += 1) {
        expect(poseGrid(TEMPLATES[name], frame), name).toEqual(TEMPLATES[name]);
      }
    }
  });
});

describe('outline and shading', () => {
  it('rings every silhouette with a dark outline', () => {
    for (const [name, grid] of Object.entries(TEMPLATES)) {
      const palette = new Proxy({}, { get: () => '#808080' }) as Record<string, string>;
      const cells = shadedCells(grid, palette);
      let outlined = 0;
      for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[y].length; x++) {
          if (grid[y][x] === '.' && cells[y][x] === '#1c130d') outlined++;
          // A pixel of the creature itself is never overwritten by outline.
          if (grid[y][x] !== '.') expect(cells[y][x], `${name} ${x},${y}`).not.toBe('#1c130d');
        }
      }
      expect(outlined, name).toBeGreaterThan(8);
    }
  });

  it('lights the top of a body and shades its underside', () => {
    const cells = shadedCells(['...', '.f.', '.f.', '...'], { f: '#808080' });
    expect(cells[1][1]).not.toBe('#808080');
    expect(parseInt(cells[1][1]!.slice(1, 3), 16)).toBeGreaterThan(0x80);
    expect(parseInt(cells[2][1]!.slice(1, 3), 16)).toBeLessThan(0x80);
  });
});
