/**
 * Seeded 2D simplex noise for map generation. Adapted from Aetheria's
 * original `src/utils/simplexNoise.ts`; the permutation table is shuffled
 * with the sim's own `Rng`, so a seed always yields the same field.
 */
import { Rng } from '../core/rng';

const GRAD3: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [1, 0], [-1, 0],
  [0, 1], [0, -1], [0, 1], [0, -1],
];
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

export class SimplexNoise {
  private readonly perm = new Uint8Array(512);

  constructor(seed: number) {
    const p = Array.from({ length: 256 }, (_, i) => i);
    new Rng(seed).shuffle(p);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  /** Noise in [-1, 1]. */
  noise2D(xin: number, yin: number): number {
    const perm = this.perm;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;

    const corner = (x: number, y: number, gi: number): number => {
      let c = 0.5 - x * x - y * y;
      if (c < 0) return 0;
      c *= c;
      const g = GRAD3[gi % 12];
      return c * c * (g[0] * x + g[1] * y);
    };
    return 70 * (
      corner(x0, y0, perm[ii + perm[jj]]) +
      corner(x1, y1, perm[ii + i1 + perm[jj + j1]]) +
      corner(x2, y2, perm[ii + 1 + perm[jj + 1]])
    );
  }
}
