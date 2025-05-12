import seedrandom from 'seedrandom';

/**
 * A high-quality 2D/3D Simplex Noise implementation
 * Based on the algorithm by Ken Perlin
 */
export default class SimplexNoise {
  private grad3: number[][];
  private p: number[];
  private perm: number[];
  private permMod12: number[];

  constructor(seed: number | undefined = undefined) {
    // Gradient vectors for 3D
    this.grad3 = [
      [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
      [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
      [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
    ];

    // Initialize permutation table
    this.p = [];
    for (let i = 0; i < 256; i++) {
      this.p[i] = Math.floor(i);
    }

    // If a seed is provided, use it to shuffle the permutation table
    if (seed !== undefined) {
      this.shuffle(this.p, seed);
    } else {
      this.shuffle(this.p);
    }

    // Extended permutation tables
    this.perm = new Array(512);
    this.permMod12 = new Array(512);
    
    for (let i = 0; i < 512; i++) {
      this.perm[i] = this.p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  /**
   * Fisher-Yates shuffle with optional seed
   */
  private shuffle(array: number[], seed?: number): void {
    const random = seed !== undefined ? seedrandom(seed.toString()) : Math.random;
    
    let currentIndex = array.length;
    let temporaryValue, randomIndex;

    // While there remain elements to shuffle
    while (0 !== currentIndex) {
      // Pick a remaining element
      randomIndex = Math.floor(random() * currentIndex);
      currentIndex -= 1;

      // Swap with the current element
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }
  }

  /**
   * Helper dot product function for gradient calculations
   */
  private dot(g: number[], x: number, y: number): number {
    return g[0] * x + g[1] * y;
  }

  /**
   * 2D Simplex Noise
   */
  public noise2D(xin: number, yin: number): number {
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    
    let n0, n1, n2; // Noise contributions from the three corners
    
    // Skew the input space to determine which simplex cell we're in
    const s = (xin + yin) * F2; // Hairy factor for 2D
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    
    const t = (i + j) * G2;
    const X0 = i - t; // Unskew the cell origin back to (x,y) space
    const Y0 = j - t;
    const x0 = xin - X0; // The x,y distances from the cell origin
    const y0 = yin - Y0;
    
    // For the 2D case, the simplex shape is an equilateral triangle.
    // Determine which simplex we are in.
    let i1, j1; // Offsets for second (middle) corner of simplex in (i,j) coords
    if (x0 > y0) { 
      i1 = 1; j1 = 0; // lower triangle, XY order: (0,0)->(1,0)->(1,1)
    } else { 
      i1 = 0; j1 = 1; // upper triangle, YX order: (0,0)->(0,1)->(1,1)
    }
    
    // A step of (1,0) in (i,j) means a step of (1-c,-c) in (x,y), and
    // a step of (0,1) in (i,j) means a step of (-c,1-c) in (x,y), where
    // c = (3-sqrt(3))/6
    
    const x1 = x0 - i1 + G2; // Offsets for middle corner in (x,y) unskewed coords
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2; // Offsets for last corner in (x,y) unskewed coords
    const y2 = y0 - 1.0 + 2.0 * G2;
    
    // Work out the hashed gradient indices of the three simplex corners
    const ii = i & 255;
    const jj = j & 255;
    
    // Calculate the contribution from the three corners
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 < 0) {
      n0 = 0.0;
    } else {
      t0 *= t0;
      n0 = t0 * t0 * this.dot(this.grad3[this.permMod12[ii + this.perm[jj]]], x0, y0);
    }
    
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 < 0) {
      n1 = 0.0;
    } else {
      t1 *= t1;
      n1 = t1 * t1 * this.dot(this.grad3[this.permMod12[ii + i1 + this.perm[jj + j1]]], x1, y1);
    }
    
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 < 0) {
      n2 = 0.0;
    } else {
      t2 *= t2;
      n2 = t2 * t2 * this.dot(this.grad3[this.permMod12[ii + 1 + this.perm[jj + 1]]], x2, y2);
    }
    
    // Add contributions from each corner to get the final noise value.
    // The result is scaled to return values in the interval [-1,1].
    return 70.0 * (n0 + n1 + n2);
  }

  /**
   * Fractional Brownian Motion (fBm) for creating natural-looking terrain
   * @param x X coordinate
   * @param y Y coordinate
   * @param octaves Number of octaves to compute
   * @param persistence How much each octave contributes to the final value
   * @param lacunarity How much detail is added in each octave
   * @returns A value between -1 and 1
   */
  public fbm(
    x: number, 
    y: number, 
    octaves: number = 6, 
    persistence: number = 0.5, 
    lacunarity: number = 2.0
  ): number {
    let total = 0;
    let frequency = 1.0;
    let amplitude = 1.0;
    let maxValue = 0;  // Used for normalizing result to -1.0 - 1.0
    
    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude;
      
      maxValue += amplitude;
      
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    
    // Normalize the result
    return total / maxValue;
  }
}
