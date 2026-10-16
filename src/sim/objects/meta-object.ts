import { SimObject, type SimObjectInit } from './sim-object';
import { ObjectManager } from './object-manager';
import type { World } from '../world';

export interface MetaInit extends SimObjectInit {
  name: string;
  colorIndex: number;
  founderId?: number | null;
  diesWhenEmpty?: boolean;
  traits?: Iterable<string>;
}

/**
 * Social group base: kingdom, city, culture, religion, language, clan, family,
 * subspecies, alliance, army. `kind` says which.
 */
export class MetaObject extends SimObject {
  name: string;
  colorIndex: number;
  founderId: number | null;
  diesWhenEmpty: boolean;
  readonly traits: Set<string>;
  private readonly members = new Set<number>();
  private everHadMembers = false;

  constructor(init: MetaInit) {
    super(init);
    this.name = init.name;
    this.colorIndex = init.colorIndex;
    this.founderId = init.founderId ?? null;
    this.diesWhenEmpty = init.diesWhenEmpty ?? true;
    this.traits = new Set(init.traits);
  }

  get memberCount(): number {
    return this.members.size;
  }

  /** Member ids in ascending order. */
  memberIds(): number[] {
    return [...this.members].sort((a, b) => a - b);
  }

  hasMember(id: number): boolean {
    return this.members.has(id);
  }

  addMember(id: number): boolean {
    if (this.members.has(id)) return false;
    this.members.add(id);
    this.everHadMembers = true;
    return true;
  }

  removeMember(id: number): boolean {
    return this.members.delete(id);
  }

  addTrait(id: string): boolean {
    if (this.traits.has(id)) return false;
    this.traits.add(id);
    return true;
  }

  removeTrait(id: string): boolean {
    return this.traits.delete(id);
  }

  hasTrait(id: string): boolean {
    return this.traits.has(id);
  }

  /**
   * True once a "dies when empty" meta has had members and lost them all. A
   * meta that has never had a member is not dead yet (it is still being set up).
   */
  shouldDie(): boolean {
    return this.diesWhenEmpty && this.everHadMembers && this.members.size === 0;
  }
}

/** Manager for metas: removes ones that should die at each update. */
export class MetaManager<T extends MetaObject, S = unknown> extends ObjectManager<T, S> {
  protected override onUpdate(world: World): void {
    for (const m of this) if (m.shouldDie()) this.remove(world, m);
  }
}
