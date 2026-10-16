/**
 * The tile grid. Placeholder shape: the world/grid work package replaces the
 * internals with the full tile model (types, top layers, height, fertility,
 * temperature, fire, ownership…) while keeping this surface.
 */
export class WorldGrid {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  get size(): number {
    return this.width * this.height;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Flat index of (x, y). */
  index(x: number, y: number): number {
    return y * this.width + x;
  }

  xOf(index: number): number {
    return index % this.width;
  }

  yOf(index: number): number {
    return Math.floor(index / this.width);
  }
}
