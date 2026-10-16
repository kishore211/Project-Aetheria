// Faith: the priests of the temples and the religions they keep.
//
// Every town with a temple keeps a priest, and the priest works the religion's
// traits on the people around the temple. The core calls `update` once a step
// and this subsystem keeps its own four-second clock. It sees the rest of the
// world only through `SettlementHost`.

import { emitDamage, emitFloater } from '../floatBridge';
import { emitShot } from '../shotBridge';
import { speak } from '../dialogue';
import { MONSTERS, isSapient } from '../entitySystemMinimal';
import { applyStatus, clearStatus } from '../statusEffects';
import { groupMetas, setMetaOf } from '../identity';
import { faithOf, faithRoll } from '../religion';
import type { SettlementHost } from './host';

export class FaithService {
  private timer = 0;

  constructor(private readonly host: SettlementHost) {}

  /** Advance the faith clock; the temples pray every four seconds. */
  update(delta: number): void {
    this.timer += delta;
    if (this.timer >= 4) {
      this.timer = 0;
      this.faithRound();
    }
  }

  /**
   * Faith at work. Every town with a temple keeps a priest — its sharpest
   * mind who holds no other office — and the priest works the religion's
   * traits on the people around the temple: healing, holy fire, shields,
   * blessed harvests, converts and fasting.
   */
  private faithRound(): void {
    const { entities, kingdoms, villages } = this.host;
    const byVillage = entities.getEntitiesByVillage();
    for (const village of villages.values()) {
      const residents = byVillage.get(village.id) ?? [];
      const temple = village.buildings.find(b => b.kind === 'temple');
      if (!temple) {
        for (const resident of residents) if (resident.status.includes('priest')) clearStatus(resident, 'priest');
        continue;
      }
      const religion = groupMetas(village.id)?.religion ?? null;
      const faith = faithOf(religion);
      if (!religion || !faith) continue;

      let priest = residents.find(e => e.status.includes('priest') && e.health > 0) ?? null;
      if (!priest) {
        const candidates = residents.filter(e => e.health > 0 && e.religionId === religion
          && !e.status.includes('king') && !e.status.includes('leader') && !e.status.includes('captain') && e.job !== 'warrior');
        candidates.sort((x, y) => y.attributes.intelligence - x.attributes.intelligence);
        priest = candidates[0] ?? null;
        if (priest) {
          applyStatus(priest, 'priest');
          emitFloater({ kind: 'speech', text: speak('blessed', faithRoll()), x: priest.position.x, y: priest.position.y, entityId: priest.id });
        }
      }

      const kingdom = kingdoms.get(village.kingdomId);
      const cx = priest ? priest.position.x : temple.x + 0.5;
      const cy = priest ? priest.position.y : temple.y + 0.5;
      const near = entities.query(cx, cy, 6);

      for (const trait of faith.traits) {
        switch (trait) {
          case 'harvest_blessing':
            village.store.food += 3;
            break;
          case 'ascetic':
            for (const e of residents) if (e.religionId === religion) e.needs.hunger = Math.min(1, e.needs.hunger + 0.03);
            break;
          case 'divine_shield':
            for (const e of residents) {
              if (e.religionId === religion && e.status.includes('fighting')) applyStatus(e, 'shielded');
            }
            break;
          case 'mending_prayer':
            if (!priest) break;
            for (const e of near) {
              if (e.religionId !== religion || e.health <= 0 || e.health >= e.maxHealth) continue;
              const healed = Math.min(8, e.maxHealth - e.health);
              e.health += healed;
              emitFloater({ kind: 'heal', text: `+${Math.round(healed)}`, x: e.position.x, y: e.position.y, entityId: e.id });
            }
            break;
          case 'holy_fire': {
            if (!priest) break;
            const foe = near.find(e => e.health > 0 && (MONSTERS.has(e.type)
              || (e.kingdomId != null && kingdom != null && kingdom.atWar.has(e.kingdomId))));
            if (!foe) break;
            emitShot({ position: { x: priest.position.x, y: priest.position.y } }, foe);
            foe.health -= 18;
            emitDamage(foe.position.x, foe.position.y, 18, foe.id);
            applyStatus(foe, 'wounded');
            if (foe.health <= 0) applyStatus(foe, 'slain');
            break;
          }
          case 'missionaries':
            if (!priest) break;
            for (const e of near) {
              if (!isSapient(e) || e.religionId === religion || faithRoll() > 0.2) continue;
              setMetaOf(e, 'religion', religion);
              emitFloater({ kind: 'speech', text: 'I have seen the light.', x: e.position.x, y: e.position.y, entityId: e.id });
            }
            break;
          default:
            break;
        }
      }
    }
  }
}
