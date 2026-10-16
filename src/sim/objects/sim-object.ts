/** Base for everything the sim tracks by numeric id. */
export interface SimObjectInit {
  id: number;
  kind: string;
  /** World time (seconds) at creation. */
  created: number;
}

export class SimObject {
  readonly id: number;
  readonly kind: string;
  readonly created: number;
  /** False once removed; the manager drops the object at the next tick start. */
  alive = true;

  constructor(init: SimObjectInit) {
    this.id = init.id;
    this.kind = init.kind;
    this.created = init.created;
  }

  /** Age in world seconds. */
  age(now: number): number {
    return now - this.created;
  }
}
