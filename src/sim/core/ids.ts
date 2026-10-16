/**
 * Numeric ids, unique per world and per kind of object. Saved with the
 * world so a reloaded world keeps minting from where it left off.
 */
export class IdAllocator {
  private readonly next = new Map<string, number>();

  mint(kind: string): number {
    const id = this.next.get(kind) ?? 1;
    this.next.set(kind, id + 1);
    return id;
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.next);
  }

  restore(state: Record<string, number>): void {
    this.next.clear();
    for (const [kind, n] of Object.entries(state)) this.next.set(kind, n);
  }
}
