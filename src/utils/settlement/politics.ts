// Politics: succession, loyalty, secession and the plots that come of them.
//
// Every realm has a crown and every town a leader and a loyalty score. This
// subsystem keeps the throne filled, weighs each province's loyalty every five
// seconds, lets the unhappy towns secede, and runs the schemes that governors,
// kings and priests hatch against one another. It keeps its own clocks and sees
// the rest of the world only through `SettlementHost`.

import type { Entity } from '../../types/world';
import type { PlotSummary } from '../../store/gameStore';
import type { SettlementHost } from './host';
import type { Kingdom, Village } from './types';
import { chronicle } from '../chronicle';
import { applyStatus } from '../statusEffects';
import { applyScenario } from '../scenarios';
import {
  civilStats,
  governableVillages,
  leadership,
  loyaltyFor,
  REBELLION_THRESHOLD,
} from '../politics';
import {
  groupHasCultureTrait,
  groupMetas,
  metaById,
  mintMeta,
  setGroupMetas,
  setMetaOf,
  type MetaKind,
} from '../identity';
import {
  PLOTS,
  createPlot,
  plotRate,
  plotReady,
  plotShare,
  type Plot,
  type PlotKind,
} from '../plots';
import { foundFaith } from '../religion';
import { EXPANSION_APPETITE, REBELLION_PATIENCE } from './constants';
import { random } from '../random';

export type ActivePlot = Plot & { plotterName: string; subjectName: string; targetName: string | null };

export class Politics {
  private loyaltyTimer = 0;
  private plotTimer = 0;
  /** Live schemes, keyed by id. */
  private plots = new Map<string, Plot>();
  private plotterIds = new Map<string, number>();

  constructor(private readonly host: SettlementHost) {}

  /** Advance the loyalty and plot clocks: crowns and loyalty every five seconds, schemes every two. */
  update(delta: number): void {
    this.loyaltyTimer += delta;
    if (this.loyaltyTimer >= 5) {
      // The pass is handed the *elapsed* time rather than its own interval, so
      // a province's patience runs down in simulated seconds no matter how
      // often this happens to be called.
      const elapsed = this.loyaltyTimer;
      this.loyaltyTimer = 0;
      this.succession();
      this.loyaltyRound(elapsed);
    }

    this.plotTimer += delta;
    if (this.plotTimer >= 2) {
      const elapsed = this.plotTimer;
      this.plotTimer = 0;
      this.plotRound(elapsed);
    }
  }

  /**
   * Make sure every kingdom has somebody on the throne.
   *
   * When a king dies the crown goes to the ablest village leader in the realm,
   * which is a succession rule with a consequence: an heir with poor
   * stewardship immediately drags loyalty down across every province, so a
   * king dying can be the thing that starts a rebellion. That is the whole
   * point of tying loyalty to the ruler's stats.
   */
  private succession(): void {
    for (const kingdom of this.host.kingdoms.values()) {
      const sitting = kingdom.kingId ? this.host.entities.getEntityById(kingdom.kingId) : null;
      if (sitting && sitting.health > 0 && sitting.kingdomId === kingdom.id) continue;

      const candidates: Entity[] = [];
      for (const villageId of kingdom.villageIds) {
        const leader = this.host.villages.get(villageId) && this.villageLeader(this.host.villages.get(villageId)!);
        if (leader) candidates.push(leader);
      }

      if (candidates.length === 0) {
        if (kingdom.kingId) {
          kingdom.kingId = null;
          this.host.events.onEvent(chronicle('succession_none', { a: kingdom.name }), 'kingdom');
        }
        continue;
      }

      // The ablest governor, not the nearest — a realm choosing its worst
      // available heir makes for a funnier story but a duller simulation,
      // because loyalty would collapse every time anybody died.
      const heir = candidates.reduce((best, candidate) => (
        leadership(civilStats(candidate)) > leadership(civilStats(best)) ? candidate : best
      ), candidates[0]);

      const contested = Boolean(kingdom.kingId) && candidates.length >= 3;
      kingdom.kingId = heir.id;
      kingdom.ruler = heir.name;
      applyStatus(heir, 'king');
      applyScenario(heir, 'crowned');
      this.host.events.onEvent(
        chronicle('crowned_king', { name: heir.name, a: kingdom.name }),
        'kingdom',
        { x: Math.floor(heir.position.x), y: Math.floor(heir.position.y) },
      );

      // A war of succession. When a crown passes in a big realm, the
      // runner-up does not always bend the knee: if its claim was nearly as
      // good, its town may go its own way, and WorldBox's great empires break
      // up exactly like this, on a death rather than a grievance.
      if (contested && this.host.laws.rebellions) {
        const heirClaim = leadership(civilStats(heir));
        const rival = candidates
          .filter(c => c.id !== heir.id && c.villageId)
          .sort((p, q) => leadership(civilStats(q)) - leadership(civilStats(p)))[0];
        const rivalTown = rival?.villageId ? this.host.villages.get(rival.villageId) : null;
        if (rival && rivalTown && !rivalTown.capital
          && leadership(civilStats(rival)) >= heirClaim * 0.85 && random() < 0.35) {
          this.host.events.onEvent(
            `${rival.name} will not kneel to ${heir.name}. ${rivalTown.name} goes to war over the crown of ${kingdom.name}`,
            'war',
            { x: rivalTown.centerX, y: rivalTown.centerY },
          );
          this.secede(rivalTown, kingdom);
        }
      }
    }
  }

  private villageLeader(village: Village): Entity | null {
    const id = this.host.leaderIdOf(village.id);
    if (!id) return null;
    const leader = this.host.entities.getEntityById(id);
    return leader && leader.villageId === village.id ? leader : null;
  }

  /**
   * Recompute loyalty for every village, and let the unhappy ones go.
   *
   * Done in one pass per kingdom rather than per village, because every factor
   * is relative to the capital and looking that up once per village would walk
   * the same data N times.
   */
  private loyaltyRound(delta: number): void {
    const members = this.host.entities.getEntitiesByVillage();

    for (const kingdom of this.host.kingdoms.values()) {
      const king = this.host.kingCivilStats(kingdom);
      const kingEntity = kingdom.kingId
        ? this.host.entities.getEntityById(kingdom.kingId) : null;
      const governable = governableVillages(king) + (EXPANSION_APPETITE[kingdom.race] ?? 0);
      const over = Math.max(0, kingdom.villageIds.length - governable);

      const capital = kingdom.villageIds
        .map(id => this.host.villages.get(id))
        .find(village => village?.capital) ?? null;
      const capitalPopulation = capital ? (members.get(capital.id)?.length ?? 0) : 0;
      const capitalTerritory = capital?.territory.size ?? 0;

      // Losing a war is measured by held land rather than by casualties: it is
      // the thing a villager would actually notice.
      const losingWar = Array.from(kingdom.atWar).some(enemyId => {
        const enemy = this.host.kingdoms.get(enemyId);
        if (!enemy) return false;
        return this.host.landOf(enemy) > this.host.landOf(kingdom) * 1.25;
      });

      for (const villageId of [...kingdom.villageIds]) {
        const village = this.host.villages.get(villageId);
        if (!village) continue;

        const residents = members.get(village.id) ?? [];
        const leader = this.villageLeader(village);
        const mood = residents.length === 0
          ? 0
          : residents.reduce(
            (sum: number, resident: Entity) => sum + (resident.happiness ?? 0), 0,
          ) / residents.length;

        village.loyalty = loyaltyFor({
          isCapital: village.capital,
          king,
          leader: leader ? civilStats(leader) : null,
          leaderTraits: leader?.traits ?? [],
          population: residents.length,
          capitalPopulation,
          territory: village.territory.size,
          capitalTerritory,
          distanceToCapital: capital
            ? Math.hypot(village.centerX - capital.centerX, village.centerY - capital.centerY)
            : 0,
          bordersCapital: capital ? this.bordersCapital(village, capital) : false,
          villageAge: village.age,
          kingdomAge: kingdom.age,
          villagesOverLimit: over,
          losingWar,
          sameSpeciesAsKing: !kingEntity || kingEntity.type === village.race,
          averageMood: mood,
          ...this.identityFactorsFor(village, kingdom),
        });

        if (village.loyalty.score < REBELLION_THRESHOLD && !village.capital) {
          village.restless += delta;
          // A province has to stay unhappy for a while before it goes. A single
          // bad harvest should not cost you a city, and the delay is what makes
          // a rebellion something the player can see coming and prevent.
          if (village.restless >= REBELLION_PATIENCE) this.secede(village, kingdom);
        } else {
          village.restless = Math.max(0, village.restless - delta * 2);
        }
      }
    }
  }

  /**
   * How the province's identity compares with the realm's.
   *
   * A village's *institutional* identity is what counts here, not the shifting
   * opinions of whoever happens to live there — a town does not secede because
   * one resident converted, it secedes because the town itself has drifted.
   */
  private identityFactorsFor(village: Village, kingdom: Kingdom): {
    sameCulture: boolean | null;
    sameLanguage: boolean | null;
    sameReligion: boolean | null;
    xenophobic: boolean;
  } {
    const mine = groupMetas(village.id);
    const theirs = groupMetas(kingdom.id);
    const compare = (kind: MetaKind): boolean | null => {
      const a = mine ? mine[kind] : null;
      const b = theirs ? theirs[kind] : null;
      // Skipped rather than counted as a mismatch: a village with no culture
      // is not estranged, it simply has not been asked.
      if (!a || !b) return null;
      return a === b;
    };
    return {
      sameCulture: compare('culture'),
      sameLanguage: compare('language'),
      sameReligion: compare('religion'),
      xenophobic: metaById(mine?.culture)?.traits.includes('xenophobic') ?? false,
    };
  }

  /** Do these two villages' claims touch? */
  private bordersCapital(village: Village, capital: Village): boolean {
    if (village.id === capital.id) return false;
    const reach = 3;
    return Math.abs(village.centerX - capital.centerX) <= capital.claimBonus + reach + 6
      && Math.abs(village.centerY - capital.centerY) <= capital.claimBonus + reach + 6;
  }

  /**
   * A province declares itself a kingdom, and its former ruler declares war.
   *
   * The immediate war is WorldBox's rule and it is what turns a number going
   * negative into a story: the map splits, and then the two halves fight over
   * the seam.
   */
  secede(village: Village, from: Kingdom, forced = false): void {
    // The player's Independence power overrides the law; nothing else does.
    if (!forced && !this.host.laws.rebellions) return;
    const residents = this.host.entities.getEntitiesByVillage().get(village.id) ?? [];
    if (residents.length === 0) return;

    // Leave the old kingdom.
    const index = from.villageIds.indexOf(village.id);
    if (index !== -1) from.villageIds.splice(index, 1);

    const kingdom = this.host.createKingdom(village.race);
    village.kingdomId = kingdom.id;
    village.capital = true;
    village.restless = 0;
    kingdom.villageIds.push(village.id);
    // New realm, new roofs.
    for (const building of village.buildings) this.host.paintBuilding(village, building);

    for (const resident of residents) {
      resident.kingdomId = kingdom.id;
      this.host.clearOffices(resident);
    }

    // Territory changes hands with the town that holds it. Cleared first so
    // claimTerritory sees the tiles as newly gained and repaints them in the
    // new colours — otherwise the border keeps the old kingdom's paint.
    for (const id of village.territory) {
      const tile = this.host.tileFromInstanceId(id);
      if (tile) tile.ownerId = null;
    }
    village.territory.clear();
    this.host.claimTerritory(village);

    if (this.host.laws.warfare) this.host.beginWar(from, kingdom);

    this.host.events.onEvent(
      chronicle('secession', { name: village.name, a: from.name, b: kingdom.name }),
      'war',
      { x: village.centerX, y: village.centerY },
    );
    for (const resident of residents.slice(0, 3)) applyScenario(resident, 'crowned');
    this.host.publishSummaries();
  }

  private averageMoodOf(kingdom: Kingdom): number {
    let total = 0;
    let count = 0;
    for (const entity of this.host.entities.getAllEntities()) {
      if (entity.kingdomId !== kingdom.id) continue;
      total += entity.happiness ?? 0;
      count += 1;
    }
    return count === 0 ? 0 : total / count;
  }

  private mostTenseNeighbour(kingdom: Kingdom): Kingdom | null {
    let best: Kingdom | null = null;
    let bestTension = 0.25;
    for (const [id, tension] of kingdom.tension) {
      if (kingdom.allies.has(id)) continue;
      if (tension <= bestTension) continue;
      const other = this.host.kingdoms.get(id);
      if (!other) continue;
      best = other;
      bestTension = tension;
    }
    return best;
  }

  private plotRound(delta: number): void {
    // Advance and resolve what is already running, before starting anything
    // new — otherwise a plot could be created and fire in the same pass, which
    // defeats the entire purpose of a plot being visible in advance.
    for (const [id, plot] of [...this.plots]) {
      const plotter = this.host.entities.getEntityById(plot.plotterId);
      if (!plotter || plotter.health <= 0) {
        this.plots.delete(id);
        continue;
      }

      plot.age += delta;
      const learned = groupHasCultureTrait(plotter.villageId, 'scholarly') ? 1.4 : 1;
      plot.progress += plotRate(plot, civilStats(plotter)) * learned * delta;

      if (plotReady(plot)) {
        this.plots.delete(id);
        this.resolvePlot(plot, plotter);
      }
    }

    this.considerNewPlots();

    this.plotterIds.clear();
    for (const plot of this.plots.values()) {
      // The furthest-along scheme wins when someone is running more than one:
      // the icon is a warning, and a warning should show the nearest threat.
      const share = plotShare(plot);
      const known = this.plotterIds.get(plot.plotterId);
      if (known === undefined || share > known) this.plotterIds.set(plot.plotterId, share);
    }
  }

  /** Who has a reason to be scheming, and about what. */
  private considerNewPlots(): void {
    const plotting = new Set(Array.from(this.plots.values()).map(plot => plot.plotterId));
    const members = this.host.entities.getEntitiesByVillage();

    for (const kingdom of this.host.kingdoms.values()) {
      // A governor with an unhappy province starts thinking about leaving.
      for (const villageId of kingdom.villageIds) {
        const village = this.host.villages.get(villageId);
        if (!village || village.capital) continue;
        const leader = this.villageLeader(village);
        if (!leader || plotting.has(leader.id)) continue;

        const loyalty = village.loyalty?.score ?? 100;
        // Started well above the rebellion threshold, so the icon appears
        // before the province is already lost. This is the whole point: a
        // warning, not an obituary.
        if (loyalty < 25 && random() < 0.4) {
          this.startPlot('rebellion', leader, village.id, null);
          plotting.add(leader.id);
          continue;
        }

        // A town far from the capital, or one whose culture encourages thinking
        // for itself, may decide it is its own people. This is the only way a
        // *new* identity comes into the world after founding — the pot mechanic
        // can spread cultures but cannot invent them.
        const residents = members.get(village.id)?.length ?? 0;
        const inclined = groupHasCultureTrait(village.id, 'scholarly');
        if (
          residents >= 6
          && (loyalty < 55 || inclined)
          && random() < (inclined ? 0.18 : 0.08)
        ) {
          this.startPlot('schism', leader, village.id, null);
          plotting.add(leader.id);
        }
      }

      const king = kingdom.kingId ? this.host.entities.getEntityById(kingdom.kingId) : null;
      if (!king || plotting.has(king.id)) continue;
      const stats = civilStats(king);

      // A king at war looks for a way out if he is not a fighter, and presses
      // on if he is.
      const enemies = Array.from(kingdom.atWar);
      if (enemies.length > 0) {
        if (stats.diplomacy > stats.warfare && random() < 0.5) {
          this.startPlot('peace', king, kingdom.id, enemies[0]);
          plotting.add(king.id);
          continue;
        }
      } else if (this.host.laws.warfare) {
        // Otherwise a warlike king finds somebody to resent, and a diplomat
        // finds somebody to bind.
        const neighbour = this.mostTenseNeighbour(kingdom);
        if (neighbour) {
          if (stats.warfare >= 7 && random() < 0.3) {
            this.startPlot('war', king, kingdom.id, neighbour.id);
            plotting.add(king.id);
            continue;
          }
          if (stats.diplomacy >= 7 && this.host.laws.diplomacy && random() < 0.3) {
            this.startPlot('alliance', king, kingdom.id, neighbour.id);
            plotting.add(king.id);
            continue;
          }
        }
      }

      // A capable steward with a miserable realm throws a party instead.
      const misery = this.averageMoodOf(kingdom);
      if (misery < -20 && stats.stewardship >= 6 && random() < 0.35) {
        this.startPlot('festival', king, kingdom.id, null);
        plotting.add(king.id);
      }
    }
  }

  private startPlot(
    kind: PlotKind, plotter: Entity, subjectId: string, targetKingdomId: string | null,
  ): void {
    const plot = createPlot(kind, plotter, subjectId, targetKingdomId);
    // Anybody nearby who feels the same way joins in, which speeds it up. This
    // is why a village that is uniformly wretched rebels faster than one with
    // a single disgruntled governor.
    const mood = plotter.happiness ?? 0;
    plot.conspirators = 1 + this.host.entities
      .query(plotter.position.x, plotter.position.y, 6)
      .filter(other => other.id !== plotter.id
        && other.villageId === plotter.villageId
        && Math.abs((other.happiness ?? 0) - mood) < 30).length;

    this.plots.set(plot.id, plot);
  }

  private resolvePlot(plot: Plot, plotter: Entity): void {
    const def = PLOTS[plot.kind];
    switch (plot.kind) {
      case 'rebellion': {
        const village = this.host.villages.get(plot.subjectId);
        const kingdom = village ? this.host.kingdoms.get(village.kingdomId) : null;
        // A plot that comes off skips the patience timer entirely: the whole
        // point of scheming is that it is faster than waiting to be unhappy.
        if (village && kingdom && !village.capital) this.secede(village, kingdom);
        return;
      }
      case 'coup': {
        const kingdom = this.host.kingdoms.get(plot.subjectId);
        if (!kingdom) return;
        const deposed = kingdom.kingId ? this.host.entities.getEntityById(kingdom.kingId) : null;
        if (deposed) this.host.clearOffices(deposed);
        kingdom.kingId = plotter.id;
        kingdom.ruler = plotter.name;
        applyStatus(plotter, 'king');
        applyScenario(plotter, 'crowned');
        this.host.events.onEvent(
          chronicle('coup', { name: plotter.name, a: kingdom.name, b: deposed?.name ?? 'the throne' }),
          'kingdom',
          { x: Math.floor(plotter.position.x), y: Math.floor(plotter.position.y) },
        );
        return;
      }
      case 'war': {
        const a = this.host.kingdoms.get(plot.subjectId);
        const b = plot.targetKingdomId ? this.host.kingdoms.get(plot.targetKingdomId) : null;
        if (a && b && !a.atWar.has(b.id)) this.host.declareWar(a, b);
        return;
      }
      case 'peace': {
        const a = this.host.kingdoms.get(plot.subjectId);
        const b = plot.targetKingdomId ? this.host.kingdoms.get(plot.targetKingdomId) : null;
        if (a && b && a.atWar.has(b.id)) this.host.makePeace(a, b);
        return;
      }
      case 'alliance': {
        const a = this.host.kingdoms.get(plot.subjectId);
        const b = plot.targetKingdomId ? this.host.kingdoms.get(plot.targetKingdomId) : null;
        if (!a || !b) return;
        a.allies.add(b.id);
        b.allies.add(a.id);
        a.tension.set(b.id, 0);
        b.tension.set(a.id, 0);
        this.host.events.onEvent(chronicle('alliance', { a: a.name, b: b.name }), 'kingdom');
        return;
      }
      case 'schism': {
        const village = this.host.villages.get(plot.subjectId);
        if (!village) return;
        const before = groupMetas(village.id);
        if (!before) return;

        // A new culture always; a new faith only sometimes, because a people
        // splitting off usually keeps its gods for a while.
        const culture = mintMeta('culture');
        const religion = random() < 0.45 ? mintMeta('religion') : null;
        if (religion) {
          const prophet = this.host.entities.getAllEntities().find(e => e.villageId === village.id && e.status.includes('priest'));
          foundFaith(religion, prophet?.name ?? null, village.name);
        }
        const after = {
          culture: culture.id,
          language: before.language,
          religion: religion?.id ?? before.religion,
        };
        setGroupMetas(village.id, after);

        for (const resident of this.host.entities.getAllEntities()) {
          if (resident.villageId !== village.id) continue;
          setMetaOf(resident, 'culture', after.culture);
          if (religion) setMetaOf(resident, 'religion', after.religion);
        }

        this.host.events.onEvent(
          chronicle('schism', { name: village.name, a: culture.name }),
          'kingdom',
          { x: village.centerX, y: village.centerY },
        );
        // The map is now showing something different, if the player is looking
        // through an identity layer.
        this.host.repaintAllTerritory();
        this.host.publishSummaries();
        return;
      }

      case 'festival': {
        const kingdom = this.host.kingdoms.get(plot.subjectId);
        if (!kingdom) return;
        for (const resident of this.host.entities.getAllEntities()) {
          if (resident.kingdomId !== kingdom.id) continue;
          applyScenario(resident, 'healed');
        }
        this.host.events.onEvent(
          chronicle('festival', { a: kingdom.name, name: plotter.name }), 'kingdom',
        );
        return;
      }
      default: {
        // Exhaustive above; this keeps a new PlotKind from failing silently.
        void def;
        return;
      }
    }
  }

  /** Live schemes, flattened for the register. */
  plotSummaries(): PlotSummary[] {
    const rows: PlotSummary[] = [];
    for (const plot of this.plots.values()) {
      const plotter = this.host.entities.getEntityById(plot.plotterId);
      if (!plotter) continue;
      const def = PLOTS[plot.kind];
      rows.push({
        id: plot.id,
        kind: plot.kind,
        label: def.label,
        description: def.description,
        glyph: def.glyph,
        plotterName: plotter.name,
        subjectName: this.host.villages.get(plot.subjectId)?.name
          ?? this.host.kingdoms.get(plot.subjectId)?.name
          ?? 'somewhere',
        targetName: plot.targetKingdomId
          ? this.host.kingdoms.get(plot.targetKingdomId)?.name ?? null
          : null,
        share: Math.max(0, Math.min(1, plot.progress / def.target)),
        age: plot.age,
        conspirators: plot.conspirators,
        hostile: def.hostile,
        x: Math.floor(plotter.position.x),
        y: Math.floor(plotter.position.y),
      });
    }
    // Furthest along first: the one about to fire is the one worth acting on.
    return rows.sort((a, b) => b.share - a.share);
  }

  /** Every live scheme, for the interface. */
  activePlots(): ActivePlot[] {
    const rows = [];
    for (const plot of this.plots.values()) {
      const plotter = this.host.entities.getEntityById(plot.plotterId);
      if (!plotter) continue;
      rows.push({
        ...plot,
        plotterName: plotter.name,
        subjectName: this.host.villages.get(plot.subjectId)?.name
          ?? this.host.kingdoms.get(plot.subjectId)?.name
          ?? 'somewhere',
        targetName: plot.targetKingdomId
          ? this.host.kingdoms.get(plot.targetKingdomId)?.name ?? null
          : null,
      });
    }
    return rows.sort((a, b) => b.progress / PLOTS[b.kind].target - a.progress / PLOTS[a.kind].target);
  }

  /** Plots this creature is running, for the inspector. */
  plotsBy(entityId: string): Plot[] {
    return Array.from(this.plots.values()).filter(plot => plot.plotterId === entityId);
  }

  /**
   * Break up a scheme.
   *
   * Public because the player is meant to be able to stop one — blessing the
   * plotter is the non-violent option, and killing them is the other. Without
   * a way to intervene, a plot is a countdown rather than a decision.
   */
  cancelPlotsBy(entityId: string, reason: 'dead' | 'blessed'): number {
    let cancelled = 0;
    for (const [id, plot] of this.plots) {
      if (plot.plotterId !== entityId) continue;
      this.plots.delete(id);
      cancelled += 1;
      if (reason === 'blessed') {
        const plotter = this.host.entities.getEntityById(entityId);
        this.host.events.onEvent(
          chronicle('plot_abandoned', {
            name: plotter?.name ?? 'Someone', type: PLOTS[plot.kind].label.toLowerCase(),
          }),
          'kingdom',
        );
      }
    }
    return cancelled;
  }

  /**
   * Drop the schemes of a creature that has died.
   *
   * `plotRound` already skips plots whose plotter is gone, but leaving them in
   * the map means the interface lists a conspiracy nobody is running — and the
   * player's most direct way of stopping a plot should visibly work.
   */
  forgetPlotter(entityId: string): void {
    this.cancelPlotsBy(entityId, 'dead');
  }

  /**
   * Everyone currently scheming, mapped to how far along they are, refreshed
   * once per plot round.
   *
   * The icon rail asks this every frame for every visible unit, so it must not
   * walk the plot map each time — a map built when plots change is the whole
   * difference between "free" and "quadratic in the population". It carries
   * the progress share as well as the id so the rail can colour the icon by
   * it: "someone is plotting" and "someone is about to move" are very
   * different pieces of news, and only one of them is worth interrupting for.
   */
  plottingIds(): ReadonlyMap<string, number> {
    return this.plotterIds;
  }
}
