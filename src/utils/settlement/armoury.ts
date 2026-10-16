// Armoury: the smiths who arm the town, and the drill yard that hardens its warriors.
//
// Both run on the core's twelve-second clock, which also upgrades the halls in
// between. So the core keeps that timer and calls `forge`, then its own
// upgrade, then `drill`, in that order. This subsystem sees the rest of the
// world only through `SettlementHost`.

import { emitFloater } from '../floatBridge';
import { speak } from '../dialogue';
import {
  emitItemEvent, equip, forgeItem, forgePriority, MATERIAL_COST, type Material
} from '../equipment';
import type { Entity } from '../../types/world';
import type { SettlementHost } from './host';
import type { Village } from './types';

export class Armoury {
  constructor(private readonly host: SettlementHost) {}

  /**
   * Each town's smith makes one piece a round, for whoever most deserves it
   * and has least: the king, then the captain, the headman, then the
   * warriors, a weapon before armour. The metal is whatever the town's craft
   * tier works and its store can pay for, so a town that loses its hall goes
   * back to arming people in copper.
   */
  forge(): void {
    const { entities, laws, villages } = this.host;
    if (villages.size === 0 || laws.forging === false) return;
    const tiers = this.host.craftTiers();
    const byVillage = new Map<string, Entity[]>();
    for (const entity of entities.getAllEntities()) {
      if (!entity.villageId || entity.health <= 0 || forgePriority(entity) <= 0) continue;
      const list = byVillage.get(entity.villageId);
      if (list) list.push(entity);
      else byVillage.set(entity.villageId, [entity]);
    }
    for (const village of villages.values()) {
      const people = byVillage.get(village.id);
      if (!people) continue;
      people.sort((a, b) => forgePriority(b) - forgePriority(a));
      // A smithy is a second pair of hands at the anvil.
      const pieces = village.buildings.some(b => b.kind === 'smithy') ? 2 : 1;
      for (let piece = 0; piece < pieces; piece++) this.forgeOne(village, people, tiers);
    }
  }

  private forgeOne(village: Village, people: Entity[], tiers: ReadonlyMap<string, number>): void {
    const needy = people.find(p => !p.equipment?.weapon) ?? people.find(p => !p.equipment?.armor);
    if (!needy) return;
    const slot = needy.equipment?.weapon ? 'armor' : 'weapon';
    const store = village.store;
    const affordable = (material: Material): boolean => {
      const cost = MATERIAL_COST[material];
      return store.wood >= cost.wood && store.stone >= cost.stone && store.gold >= cost.gold
        && (store.metal ?? 0) >= cost.metal && (!cost.rare || (store[cost.rare] ?? 0) >= 1);
    };
    // The smith works the best metal the town has: a town with no mine in
    // reach arms its people in wood and leather until a trader brings ore.
    let item = forgeItem(slot, tiers.get(village.id) ?? 1, village.race, village.name);
    for (let tier = (tiers.get(village.id) ?? 1) - 1; !affordable(item.material) && tier >= 0; tier--) {
      item = forgeItem(slot, tier, village.race, village.name);
    }
    if (!affordable(item.material)) return;
    const cost = MATERIAL_COST[item.material];
    store.wood -= cost.wood;
    store.stone -= cost.stone;
    store.gold -= cost.gold;
    store.metal = (store.metal ?? 0) - cost.metal;
    if (cost.rare) store[cost.rare] = (store[cost.rare] ?? 0) - 1;
    equip(needy, item);
    if (item.quality === 'legendary') emitItemEvent({ kind: 'forged', item, owner: needy });
    // Most pieces go unremarked; a legend never does.
    if (item.quality === 'legendary' || Math.random() < 0.3) {
      emitFloater({
        kind: 'speech', text: speak(item.quality === 'legendary' ? 'legendary' : 'armed', Math.random()),
        x: needy.position.x, y: needy.position.y, entityId: needy.id,
      });
    }
  }

  /**
   * Drill. Warriors of a town with training dummies grow a little stronger
   * each round, up to a point: WorldBox's dummies are why a garrison town's
   * soldiers beat a fresh levy.
   */
  drill(): void {
    const { entities, villages } = this.host;
    const byVillage = entities.getEntitiesByVillage();
    for (const village of villages.values()) {
      const dummies = village.buildings.filter(b => b.kind === 'dummy').length;
      if (dummies === 0) continue;
      for (const warrior of byVillage.get(village.id) ?? []) {
        if (warrior.job !== 'warrior') continue;
        const drilled = warrior.drilled ?? 0;
        if (drilled >= 4 * dummies) continue;
        warrior.drilled = drilled + 1;
        warrior.attributes.strength += 1;
      }
    }
  }
}
