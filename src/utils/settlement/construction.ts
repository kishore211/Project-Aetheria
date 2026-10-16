// Construction: the towns' builders, their sites and streets, and the upgrades
// that grow a town up once it has stone and a hall.
//
// A round lays each new building down as a site, scaffolding that counts for
// nothing until builders finish it (the core's order handler calls
// `finishBuilding`). Houses and halls are upgraded on the core's twelve-second
// clock, which calls `upgradeRound` between the armoury's forge and drill.
// This subsystem sees the rest of the world only through `SettlementHost`.

import { isWaterBiome } from '../../types/world';
import { chronicle } from '../chronicle';
import { groupHasCultureTrait, groupLayout, groupMetas, writeBook } from '../identity';
import {
  BUILDING_HEALTH, BUILD_EASE, HALL_UPGRADE, HOUSE_UPGRADE, MAX_SITES, RECIPES,
  SITE_SELF_PROGRESS, SITING, ZONE_SIZE,
} from './constants';
import { adjacentZonesFilled, fitsLayout, footprintOf, zoneKey } from './helpers';
import type { SettlementHost } from './host';
import type { Building, BuildingKind, BuildingRecipe, Village } from './types';

export class Construction {
  /** Seconds since the last build round; a round runs every three. */
  private buildTimer = 0;

  constructor(private readonly host: SettlementHost) {}

  /** Advance the building clock: a build round every three seconds. */
  update(delta: number): void {
    this.buildTimer += delta;
    if (this.buildTimer >= 3) {
      this.buildTimer = 0;
      this.buildRound();
    }
  }

  private buildRound(): void {
    for (const village of this.host.villages.values()) {
      // Industrious towns get an extra attempt each round; everyone else
      // occasionally skips one. Expressed as a chance rather than a separate
      // timer so the two traits stay symmetrical and there is one place to
      // read the rule.
      // Sites creep up on their own, slowly; builders are what make them fly.
      this.advanceSites(village, SITE_SELF_PROGRESS);
      if (!groupHasCultureTrait(village.id, 'industrious') && Math.random() < 0.25) continue;
      // A town works on a couple of things at once, not on every plot it owns.
      const sites = village.buildings.filter(b => b.progress !== undefined).length;
      if (sites >= MAX_SITES) continue;

      const recipe = this.nextRecipe(village);
      if (!recipe) continue;
      const spot = this.findBuildSpot(village, recipe.kind);
      if (!spot) continue;

      village.store.wood -= recipe.wood;
      village.store.stone -= recipe.stone;
      // Raised as a site: the builders walk over and put it up, and it only
      // counts once they have. The bonfire and a founding's first tents are
      // the exceptions, placed whole by createVillage.
      this.host.placeBuilding(village, recipe.kind, spot.x, spot.y, true);
      const raised = village.buildings[village.buildings.length - 1];
      if (raised) this.layRoads(village, raised);
      this.host.claimTerritory(village);
    }
  }


  /** Builders' work, and what the weather and the passers-by add on their own. */
  private advanceSites(village: Village, amount: number): void {
    for (const building of village.buildings) {
      if (building.progress === undefined) continue;
      building.progress += amount * (BUILD_EASE[building.kind] ?? 1);
      if (building.progress >= 1) this.finishBuilding(village, building);
    }
  }


  /** The scaffolding comes down. Monuments and halls are news. */
  finishBuilding(village: Village, building: Building): void {
    delete building.progress;
    building.health = building.maxHealth;
    this.host.paintBuilding(village, building);
    const { kind, x, y } = building;
    if (kind === 'hall') {
      this.host.events.onEvent(chronicle('hall_raised', { name: village.name }), 'kingdom', { x, y });
    } else if (kind === 'temple' || kind === 'statue' || kind === 'library') {
      // A temple or a library is where a people writes itself down.
      const identity = groupMetas(village.id);
      if (identity) {
        const book = writeBook(x, y, identity);
        this.host.events.onEvent(chronicle('book_written', { name: book.title, a: village.name }), 'kingdom', { x, y });
      }
      this.host.events.onEvent(chronicle('monument_raised', { name: village.name, type: kind }), 'kingdom', { x, y });
    }
  }


  /**
   * Pick what to build next: the highest-priority thing the village can afford
   * right now. RECIPES is kept in priority order, so a first match wins.
   */
  private nextRecipe(village: Village): BuildingRecipe | null {
    const count = village.buildings.length;
    for (const recipe of RECIPES) {
      if (count < recipe.requires) continue;
      const existing = village.buildings.filter(b => b.kind === recipe.kind).length;
      if (existing >= recipe.limit) continue;
      if (recipe.needs && !village.buildings.some(b => b.kind === recipe.needs)) continue;
      if (village.store.wood < recipe.wood || village.store.stone < recipe.stone) continue;
      // Mines only make sense on or beside stone
      if (recipe.kind === 'mine' && !this.hasRockNearby(village)) continue;
      // ...and docks beside the sea. Without this an inland town would pick a
      // dock every round, find nowhere for it, and never build anything else.
      if (recipe.kind === 'dock' && !this.findShoreSpot(village)) continue;
      return recipe;
    }
    return null;
  }


  private hasRockNearby(village: Village): boolean {
    for (let dx = -5; dx <= 5; dx++) {
      for (let dy = -5; dy <= 5; dy++) {
        const tile = this.host.tileAt(village.centerX + dx, village.centerY + dy);
        if (tile && (tile.type === 'mountains' || tile.type === 'hills')) return true;
      }
    }
    return false;
  }


  /**
   * Where the next building goes.
   *
   * Two stages, which is how WorldBox gets towns that look designed without a
   * city planner (09-WORLDBOX-VISUAL-RESEARCH.md §6): choose a *zone*, then
   * choose a tile inside it by the culture's layout rule. Regular spacing falls
   * out of the zone grid for free, and the layout rule makes two towns of
   * different peoples distinguishable at a glance.
   *
   * Replaces a ring-walk that picked the first free tile outward from the
   * centre, which produced a solid blob with no streets and looked identical
   * for every culture.
   */
  private findBuildSpot(village: Village, kind: BuildingKind): { x: number; y: number } | null {
    if (SITING[kind] === 'shore') return this.findShoreSpot(village);
    const reach = kind === 'farm' ? 7 : 6;
    const occupied = this.occupiedTiles(village);
    const siting = SITING[kind] ?? 'cluster';
    const layout = groupLayout(village.id);

    // Which zones already hold something of ours, so the siting rules below
    // have neighbours to test against.
    const filledZones = new Set<string>();
    for (const building of village.buildings) {
      filledZones.add(zoneKey(building.x, building.y));
    }

    const candidates: Array<{ x: number; y: number; score: number }> = [];

    for (let dx = -reach; dx <= reach; dx += 1) {
      for (let dy = -reach; dy <= reach; dy += 1) {
        const x = village.centerX + dx;
        const y = village.centerY + dy;
        if (!this.footprintFits(x, y, kind, occupied)) continue;

        // Stage two: does this tile suit the culture's street pattern?
        if (!fitsLayout(layout, x, y, village)) continue;

        // Stage one, expressed as a filter on the tile's zone.
        const neighbours = adjacentZonesFilled(x, y, filledZones);
        if (siting === 'cluster' && filledZones.size > 0 && neighbours === 0) continue;
        if (siting === 'solitary' && neighbours > 0) continue;
        if (siting === 'border' && !this.zoneTouchesForeignLand(x, y, village)) continue;

        // Prefer close to the centre, so a town grows outward rather than
        // sprinkling itself across its whole claim.
        candidates.push({ x, y, score: Math.abs(dx) + Math.abs(dy) + Math.random() * 3 });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.score - b.score);
      return { x: candidates[0].x, y: candidates[0].y };
    }

    // Nothing satisfied the rules. Relax them rather than never building.
    //
    // A `solitary` temple in a town that has filled every zone would otherwise
    // find nowhere for ever, and the failure is silent — the village simply
    // stops progressing and nothing says why. A siting class is a preference
    // about where a building looks right, not a law about whether it may exist.
    if (siting !== 'cluster' || layout !== 'scattered') {
      return this.findBuildSpotRelaxed(village, kind, occupied);
    }
    return null;
  }


  /**
   * Land with sea beside it, nearest the centre: where a dock goes. Street
   * patterns do not apply — the coast decides where a harbour can be.
   */
  findShoreSpot(village: Village): { x: number; y: number } | null {
    const occupied = this.occupiedTiles(village);
    let best: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    for (let dx = -7; dx <= 7; dx += 1) {
      for (let dy = -7; dy <= 7; dy += 1) {
        const x = village.centerX + dx;
        const y = village.centerY + dy;
        if (!this.footprintFits(x, y, 'dock', occupied)) continue;
        const wet = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => {
          const tile = this.host.tileAt(x + ox, y + oy);
          return tile ? isWaterBiome(tile.type) : false;
        });
        if (!wet) continue;
        const score = Math.abs(dx) + Math.abs(dy);
        if (score < bestScore) { bestScore = score; best = { x, y }; }
      }
    }
    return best;
  }


  /** Any legal tile at all, ignoring zone and layout rules. */
  private findBuildSpotRelaxed(
    village: Village, kind: BuildingKind, occupied: ReadonlySet<string>,
  ): { x: number; y: number } | null {
    const reach = kind === 'farm' ? 7 : 6;
    for (let radius = 1; radius <= reach; radius += 1) {
      const ring: Array<{ x: number; y: number }> = [];
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = village.centerX + dx;
          const y = village.centerY + dy;
          if (!this.footprintFits(x, y, kind, occupied)) continue;
          ring.push({ x, y });
        }
      }
      if (ring.length > 0) return ring[Math.floor(Math.random() * ring.length)];
    }
    return null;
  }


  /** Every tile a village's buildings already stand on, footprints included. */
  private occupiedTiles(village: Village): Set<string> {
    const taken = new Set<string>();
    for (const building of village.buildings) {
      const span = footprintOf(building.kind);
      for (let dx = 0; dx < span; dx += 1) {
        for (let dy = 0; dy < span; dy += 1) {
          taken.add(`${building.x + dx},${building.y + dy}`);
        }
      }
    }
    return taken;
  }


  /**
   * Could this kind of building stand with its corner here?
   *
   * Every tile of the footprint has to pass, not just the anchor — a hall whose
   * corner is on good ground and whose far side is in a lake is a hall in a
   * lake. The terrain rules were duplicated between the strict and the relaxed
   * search before this, which is exactly the sort of pair that drifts apart.
   */
  private footprintFits(
    x: number, y: number, kind: BuildingKind, occupied: ReadonlySet<string>,
  ): boolean {
    const span = footprintOf(kind);
    for (let dx = 0; dx < span; dx += 1) {
      for (let dy = 0; dy < span; dy += 1) {
        const tx = x + dx;
        const ty = y + dy;
        if (occupied.has(`${tx},${ty}`)) return false;
        const tile = this.host.tileAt(tx, ty);
        if (!tile || tile.villageId) return false;
        if (isWaterBiome(tile.type) || tile.height < 0.28) return false;
        if (tile.type === 'mountains' && kind !== 'mine') return false;
        if (kind === 'farm' && tile.fertility < 0.3) return false;
        if (kind === 'mine' && tile.type !== 'mountains' && tile.type !== 'hills') return false;
      }
    }
    return true;
  }


  /**
   * Does this tile's zone border land that is not ours?
   *
   * Used by watchtowers, which is what makes them appear on the frontier rather
   * than in the middle of town — with no code that mentions frontiers.
   */
  private zoneTouchesForeignLand(x: number, y: number, village: Village): boolean {
    const kingdom = this.host.kingdoms.get(village.kingdomId);
    if (!kingdom) return false;
    for (let dx = -ZONE_SIZE; dx <= ZONE_SIZE; dx += ZONE_SIZE) {
      for (let dy = -ZONE_SIZE; dy <= ZONE_SIZE; dy += ZONE_SIZE) {
        if (dx === 0 && dy === 0) continue;
        const tile = this.host.tileAt(x + dx, y + dy);
        if (!tile) continue;
        if (tile.ownerId && tile.ownerId !== kingdom.id) return true;
        if (!tile.ownerId) return true;
      }
    }
    return false;
  }


  /**
   * A town grows up as well as out. Once it has a hall its houses can be
   * rebuilt in stone, and once it has a temple or a library, as manors —
   * WorldBox's building tiers, which are most of why an old capital looks
   * nothing like a new village. One house a round, cheapest first.
   */
  upgradeRound(): void {
    for (const village of this.host.villages.values()) {
      const has = (kind: BuildingKind) => village.buildings.some(b => b.kind === kind);
      this.upgradeHall(village, has);
      const ceiling = !has('hall') ? 1 : has('temple') || has('library') ? 3 : 2;
      if (ceiling === 1) continue;
      const house = village.buildings
        .filter(b => b.kind === 'house' && b.progress === undefined && (b.level ?? 1) < ceiling)
        .sort((a, b) => (a.level ?? 1) - (b.level ?? 1))[0];
      if (!house) continue;
      const next = (house.level ?? 1) + 1;
      const cost = HOUSE_UPGRADE[next];
      if (!cost) continue;
      if (village.store.wood < cost.wood || village.store.stone < cost.stone || village.store.gold < cost.gold) continue;
      village.store.wood -= cost.wood;
      village.store.stone -= cost.stone;
      village.store.gold -= cost.gold;
      house.level = next;
      house.maxHealth = Math.round(BUILDING_HEALTH.house * (1 + (next - 1) * 0.5));
      house.health = house.maxHealth;
      this.host.paintBuilding(village, house);
    }
  }


  /**
   * The hall grows with the town: rebuilt in stone once there are houses to
   * govern, and raised into a castle once the town keeps a temple and a
   * barracks. A castle stands stronger, claims further and shoots.
   */
  private upgradeHall(village: Village, has: (kind: BuildingKind) => boolean): void {
    const hall = village.buildings.find(b => b.kind === 'hall');
    if (!hall) return;
    const level = hall.level ?? 1;
    const houses = village.buildings.filter(b => b.kind === 'house').length;
    const next = level === 1 && houses >= 5 ? 2
      : level === 2 && has('temple') && has('barracks') ? 3 : 0;
    if (!next) return;
    const cost = HALL_UPGRADE[next];
    if (village.store.wood < cost.wood || village.store.stone < cost.stone || village.store.gold < cost.gold) return;
    village.store.wood -= cost.wood;
    village.store.stone -= cost.stone;
    village.store.gold -= cost.gold;
    hall.level = next;
    hall.maxHealth = Math.round(BUILDING_HEALTH.hall * (1 + (next - 1) * 0.75));
    hall.health = hall.maxHealth;
    this.host.paintBuilding(village, hall);
    this.host.events.onEvent(
      next === 3 ? `${village.name} raises a castle` : `${village.name} rebuilds its hall in stone`,
      'kingdom',
      { x: hall.x, y: hall.y },
    );
  }


  /**
   * Lay a path from a new building to the two nearest ones already standing.
   *
   * Their trick, and it is almost free: connect each new building to its two
   * nearest neighbours as it is planned, at no resource cost. Two rather than
   * one, because one gives you a tree with no loops and a real village has
   * junctions. The result is a plausible organic street mesh that nobody
   * designed (09-WORLDBOX-VISUAL-RESEARCH.md §6).
   *
   * Roads are drawn as an L — along x, then along y. A* would be prettier and
   * would also make roads bend around ponds and pick their way uphill, which
   * costs a pathfind per building for a difference nobody would notice at this
   * tile size.
   */
  private layRoads(village: Village, from: Building): void {
    const others = village.buildings.filter(b => b.id !== from.id);
    if (others.length === 0) return;

    const nearest = others
      .map(b => ({ b, d: Math.abs(b.x - from.x) + Math.abs(b.y - from.y) }))
      .sort((p, q) => p.d - q.d)
      .slice(0, 2);

    for (const { b } of nearest) {
      const stepX = Math.sign(b.x - from.x);
      for (let x = from.x; x !== b.x; x += stepX) this.pave(x, from.y);
      const stepY = Math.sign(b.y - from.y);
      for (let y = from.y; y !== b.y; y += stepY) this.pave(b.x, y);
    }
  }


  /** Mark one tile as road, if it is somewhere a road could go. */
  private pave(x: number, y: number): void {
    const tile = this.host.tileAt(x, y);
    if (!tile || tile.road) return;
    // No roads across water or through a building's own tile — a bridge is a
    // different feature and a path under a house is invisible anyway.
    if (isWaterBiome(tile.type) || tile.villageId) return;
    tile.road = true;
    this.host.syncTerrain(tile);
  }

}
