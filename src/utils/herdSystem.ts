// Herds and packs.
//
// The single cheapest way to make a map look inhabited rather than decorated:
// animals travel in families led by an alpha, and the alpha picks somewhere far
// away to be every few minutes while the rest follow it across the world.
//
// Modelled on WorldBox's family decisions and their cooldowns
// (docs/project-tracker/05-PEOPLE-DYNAMICS-RESEARCH.md §4):
//   family_alpha_move             200 s
//   family_group_follow             5 s
//   family_group_join_or_new_herd  60 s
//   family_group_leave             20 s
//   family_check_existence         60 s
import { isWaterBiome, type Entity, type EntityType, type Tile } from '../types/world';
import type { EntityManager } from './entityManagerMinimal';
import { isAquatic, isWalkableForEntity } from './pathfinding';
import { isSentient } from './entitySystemMinimal';
import { registerOrderHandler } from './simulation';

export interface Herd {
  id: string;
  species: EntityType;
  alphaId: string;
  members: Set<string>;
  /** Where the alpha is currently leading everyone. */
  destination: { x: number; y: number } | null;
  /** Seconds until the alpha chooses somewhere new. */
  moveCooldown: number;
}

/** How many animals of each species travel together. 1 means solitary. */
const HERD_SIZE: Partial<Record<EntityType, number>> = {
  sheep: 9,
  deer: 8,
  rabbit: 6,
  chicken: 6,
  bird: 7,
  wolf: 5,
  fox: 3,
  bear: 2,
  snake: 1,
  fish: 8,
  cow: 7,
  pig: 5,
  buffalo: 10,
  penguin: 9,
  hyena: 5,
  monkey: 6,
  rat: 8,
  piranha: 10,
  frog: 4,
  dog: 3,
  crab: 4,
  rhino: 2,
  goat: 6,
  camel: 4,
  ostrich: 5,
  flamingo: 10,
  seal: 6,
  beetle: 3,
  bee: 8,
  butterfly: 4,
  grasshopper: 6,
  gummy_bear: 4,
  lil_pumpkin: 3,
  sand_spider: 2,
};

/** Species that head toward creatures rather than toward pasture. */
const PREDATORS: EntityType[] = ['wolf', 'fox', 'bear', 'snake', 'hyena', 'crocodile', 'cat', 'dog', 'piranha', 'polar_bear', 'sand_spider'];

// WorldBox's cooldowns are 60/200/5/20/60 seconds, but its days are far longer
// than ours: a full Aetheria year is about 320 seconds, so its 200-second
// migration timer would mean an alpha chose a destination twice a year. These
// are the same behaviours scaled to our clock.
const JOIN_INTERVAL = 14;
const ALPHA_MOVE_INTERVAL = 50;
const FOLLOW_INTERVAL = 4;
const LEAVE_INTERVAL = 25;
const EXISTENCE_INTERVAL = 30;

/** How far a loner will look for company. */
const JOIN_RADIUS = 12;

/** Shared id counter, so two herd systems cannot mint the same herd id. */
let nextHerdId = 1;
/** How far a herd spreads out behind its alpha before members catch up. */
const FOLLOW_SLACK = 3.5;

export class HerdSystem {
  private tiles: Tile[][];
  private entities: EntityManager;
  herds = new Map<string, Herd>();

  private joinTimer = 0;
  private followTimer = 0;
  private leaveTimer = 0;
  private existenceTimer = 0;

  private unsubscribeOrders: () => void;

  constructor(tiles: Tile[][], entities: EntityManager) {
    this.tiles = tiles;
    this.entities = entities;
    this.unsubscribeOrders = registerOrderHandler((entity, order) => {
      if (order.purpose === 'herd') this.handleArrival(entity);
    });
  }

  update(delta: number): void {
    for (const herd of this.herds.values()) {
      herd.moveCooldown -= delta;
    }

    this.followTimer += delta;
    if (this.followTimer >= FOLLOW_INTERVAL) {
      this.followTimer = 0;
      this.followRound();
    }

    this.joinTimer += delta;
    if (this.joinTimer >= JOIN_INTERVAL) {
      this.joinTimer = 0;
      this.joinRound();
    }

    this.leaveTimer += delta;
    if (this.leaveTimer >= LEAVE_INTERVAL) {
      this.leaveTimer = 0;
      this.leaveRound();
    }

    this.existenceTimer += delta;
    if (this.existenceTimer >= EXISTENCE_INTERVAL) {
      this.existenceTimer = 0;
      this.existenceRound();
    }
  }

  // -- membership --------------------------------------------------------

  /** Can this creature travel in a group at all? */
  private herdable(entity: Entity): boolean {
    if (isSentient(entity.type)) return false;
    return (HERD_SIZE[entity.type] ?? 1) > 1;
  }

  /** Loners look for company, and pair up into a new herd if they find none. */
  private joinRound(): void {
    const loners = this.entities.getAllEntities()
      .filter(entity => this.herdable(entity) && !this.herdOf(entity));

    for (const loner of loners) {
      if (this.herdOf(loner)) continue;

      const neighbours = this.entities
        .query(loner.position.x, loner.position.y, JOIN_RADIUS)
        .filter(other => other.id !== loner.id && other.type === loner.type);

      // Join whatever herd is already nearby, if it has room
      const existing = neighbours
        .map(other => this.herdOf(other))
        .find((herd): herd is Herd => Boolean(herd) && herd!.members.size < this.capacity(loner.type));
      if (existing) {
        this.addMember(existing, loner);
        continue;
      }

      // Otherwise start one, if there is anyone to start it with
      const companions = neighbours.filter(other => !this.herdOf(other));
      if (companions.length === 0) continue;
      this.createHerd(loner, companions.slice(0, this.capacity(loner.type) - 1));
    }
  }

  private capacity(species: EntityType): number {
    return HERD_SIZE[species] ?? 1;
  }

  private createHerd(founder: Entity, companions: Entity[]): Herd {
    const herd: Herd = {
      id: `herd-${nextHerdId++}`,
      species: founder.type,
      alphaId: founder.id,
      members: new Set<string>(),
      destination: null,
      // A newly gathered herd sets off soon rather than standing about for up
      // to a full migration interval — that first move is what tells the
      // player the animals are going somewhere.
      moveCooldown: Math.random() * 12,
    };
    this.herds.set(herd.id, herd);
    this.addMember(herd, founder);
    for (const companion of companions) this.addMember(herd, companion);
    this.electAlpha(herd);
    return herd;
  }

  private addMember(herd: Herd, entity: Entity): void {
    herd.members.add(entity.id);
    entity.herdId = herd.id;
    // The eldest leads, so a newcomer older than the current alpha takes over
    this.electAlpha(herd);
  }

  private removeMember(herd: Herd, entityId: string): void {
    herd.members.delete(entityId);
    const entity = this.entities.getEntityById(entityId);
    if (entity && entity.herdId === herd.id) {
      entity.herdId = null;
      this.entities.setHerdAnchor(entity, null);
    }
    if (herd.alphaId === entityId) this.electAlpha(herd);
  }

  /** The oldest surviving member leads. */
  private electAlpha(herd: Herd): void {
    let best: Entity | null = null;
    for (const id of herd.members) {
      const member = this.entities.getEntityById(id);
      if (!member) continue;
      if (!best || member.age > best.age) best = member;
    }
    if (best) {
      herd.alphaId = best.id;
      this.entities.setHerdAnchor(best, null);
    }
  }

  private herdOf(entity: Entity): Herd | null {
    if (!entity.herdId) return null;
    const herd = this.herds.get(entity.herdId);
    if (!herd) {
      entity.herdId = null;
      return null;
    }
    return herd;
  }

  // -- movement ----------------------------------------------------------

  /**
   * Point the alpha at somewhere worth going, and hang everyone else off it.
   */
  private followRound(): void {
    for (const herd of Array.from(this.herds.values())) {
      const alpha = this.entities.getEntityById(herd.alphaId);
      if (!alpha) {
        this.electAlpha(herd);
        continue;
      }

      if (herd.moveCooldown <= 0) {
        herd.moveCooldown = ALPHA_MOVE_INTERVAL * (0.6 + Math.random() * 0.8);
        herd.destination = this.pickDestination(alpha);
        if (herd.destination) {
          this.entities.giveOrder(alpha, {
            kind: 'goto',
            x: herd.destination.x,
            y: herd.destination.y,
            purpose: 'herd',
          });
        }
      }

      for (const id of herd.members) {
        if (id === herd.alphaId) continue;
        const member = this.entities.getEntityById(id);
        if (!member) continue;
        // Followers trail the alpha directly rather than pathing to a tile:
        // the destination moves every frame, so a route would be stale at once.
        this.entities.setHerdAnchor(member, alpha, FOLLOW_SLACK);
      }
    }
  }

  /**
   * Where the alpha heads next. Grazers look for open pasture, hunters look for
   * something to hunt, and otherwise it is somewhere new and far away — which
   * is what actually makes the map feel travelled.
   */
  private pickDestination(alpha: Entity): { x: number; y: number } | null {
    const size = this.tiles.length;
    const range = Math.max(14, Math.floor(size * 0.28));

    if (PREDATORS.includes(alpha.type)) {
      const prey = this.entities
        .query(alpha.position.x, alpha.position.y, range)
        .find(other => other.type !== alpha.type && !PREDATORS.includes(other.type));
      if (prey) {
        return { x: Math.floor(prey.position.x), y: Math.floor(prey.position.y) };
      }
    } else {
      // Grazers aim for the most fertile spot in a handful of samples
      let best: Tile | null = null;
      for (let attempt = 0; attempt < 12; attempt++) {
        const candidate = this.randomTileNear(alpha, range);
        if (!candidate) continue;
        if (!best || candidate.fertility > best.fertility) best = candidate;
      }
      if (best) return { x: best.x, y: best.y };
    }

    const wander = this.randomTileNear(alpha, range);
    return wander ? { x: wander.x, y: wander.y } : null;
  }

  private randomTileNear(entity: Entity, range: number): Tile | null {
    const size = this.tiles.length;
    for (let attempt = 0; attempt < 14; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = range * (0.45 + Math.random() * 0.55);
      const x = Math.round(entity.position.x + Math.cos(angle) * distance);
      const y = Math.round(entity.position.y + Math.sin(angle) * distance);
      if (x < 1 || x >= size - 1 || y < 1 || y >= size - 1) continue;
      const tile = this.tiles[x][y];
      if (isWaterBiome(tile.type) && !isAquatic(entity.type)) continue;
      if (!isWalkableForEntity(tile, entity.type)) continue;
      return tile;
    }
    return null;
  }

  // -- churn -------------------------------------------------------------

  /** Grown animals peel off from a full herd, which is how new ones start. */
  private leaveRound(): void {
    for (const herd of this.herds.values()) {
      if (herd.members.size < this.capacity(herd.species)) continue;
      for (const id of Array.from(herd.members)) {
        if (id === herd.alphaId) continue;
        const member = this.entities.getEntityById(id);
        if (!member) continue;
        if (member.age < member.maxAge * 0.3) continue;
        if (member.status.includes('fleeing') || member.status.includes('wounded')) continue;
        if (Math.random() < 0.35) {
          this.removeMember(herd, id);
          break;
        }
      }
    }
  }

  /** Prune the dead, and dissolve herds that are down to one animal. */
  private existenceRound(): void {
    for (const herd of Array.from(this.herds.values())) {
      for (const id of Array.from(herd.members)) {
        if (!this.entities.getEntityById(id)) herd.members.delete(id);
      }
      if (herd.members.size <= 1) {
        for (const id of Array.from(herd.members)) this.removeMember(herd, id);
        this.herds.delete(herd.id);
        continue;
      }
      if (!this.entities.getEntityById(herd.alphaId)) this.electAlpha(herd);
    }
  }

  /** The alpha reached where it was heading; the herd settles until next time. */
  handleArrival(entity: Entity): void {
    const herd = this.herdOf(entity);
    if (!herd || herd.alphaId !== entity.id) return;
    herd.destination = null;
  }

  /**
   * Herd a creature belongs to, for the inspector. Counts living members only:
   * dead ids linger in the set until the next existence sweep, and reporting
   * them would show the player a herd larger than the one on screen.
   */
  describe(entity: Entity): { size: number; isAlpha: boolean } | null {
    const herd = this.herdOf(entity);
    if (!herd) return null;
    let living = 0;
    for (const id of herd.members) {
      if (this.entities.getEntityById(id)) living++;
    }
    return { size: living, isAlpha: herd.alphaId === entity.id };
  }

  dispose(): void {
    this.unsubscribeOrders();
    this.herds.clear();
  }
}
