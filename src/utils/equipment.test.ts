import { describe, expect, it } from 'vitest';
import {
  armorBlock, claimSpoils, describeItem, equip, forgeItem, itemScore, onItemEvent,
  wearAfterBlow, weaponDamage, weaponReach, type Item, type ItemEvent,
} from './equipment';
import type { Entity } from '../types/world';

const person = (name: string): Entity => ({
  id: name, type: 'human', name, age: 20, maxAge: 80, health: 100, maxHealth: 100,
  position: { x: 0, y: 0 }, status: [],
  attributes: { strength: 5, intelligence: 5, speed: 5, resilience: 5 },
  needs: { hunger: 1, thirst: 1, rest: 1, social: 1 }, inventory: [],
}) as Entity;

/** A deterministic stream, so a forge test spends a known sequence. */
const lcg = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

describe('the forge', () => {
  it('works better metal in a bigger town', () => {
    // Sampled over many pieces: the claim is about the average, not one roll.
    const average = (tier: number) => {
      const roll = lcg(tier * 31);
      let sum = 0;
      for (let i = 0; i < 400; i++) sum += itemScore(forgeItem('weapon', tier, 'human', 'Ashby', roll));
      return sum / 400;
    };
    expect(average(1)).toBeLessThan(average(2));
    expect(average(2)).toBeLessThan(average(3));
    expect(average(3)).toBeLessThan(average(4));
  });

  it('gives each race its own taste in weapons', () => {
    const roll = lcg(7);
    const kinds = (race: string) => {
      const seen = new Map<string, number>();
      for (let i = 0; i < 300; i++) {
        const kind = forgeItem('weapon', 2, race, 'X', roll).kind;
        seen.set(kind, (seen.get(kind) ?? 0) + 1);
      }
      return seen;
    };
    expect(kinds('dwarf').has('bow')).toBe(false);
    expect((kinds('elf').get('bow') ?? 0)).toBeGreaterThan(100);
  });

  it('names every legendary and never curses one', () => {
    const roll = lcg(99);
    let legends = 0;
    for (let i = 0; i < 6000; i++) {
      const item = forgeItem(i % 2 ? 'armor' : 'weapon', 4, 'orc', 'Gash', roll);
      if (item.quality !== 'legendary') {
        expect(item.name).toBeNull();
        continue;
      }
      legends++;
      expect(item.name).toMatch(/^[A-Z][a-z]+$/);
      expect(item.modifier).not.toBe('cursed');
    }
    // Rare, but it happens.
    expect(legends).toBeGreaterThan(20);
    expect(legends).toBeLessThan(6000 * 0.06);
  });

  it('only finds mithril and adamantine at the top of the ladder', () => {
    const roll = lcg(3);
    for (let i = 0; i < 3000; i++) {
      const item = forgeItem('weapon', 3, 'human', 'X', roll);
      expect(['mithril', 'adamantine']).not.toContain(item.material);
    }
  });
});

describe('carrying it into a fight', () => {
  const sword = (material: Item['material'], quality: Item['quality'] = 'normal'): Item => ({
    id: `t-${material}-${quality}`, slot: 'weapon', kind: 'sword', material, quality, modifier: null,
    name: null, kills: 0, madeIn: 'Test', owners: [], durability: 100,
  });
  const plate = (material: Item['material']): Item => ({ ...sword(material), id: `a-${material}`, slot: 'armor', kind: 'armor' });

  it('hits harder with better steel and stops more in better armour', () => {
    expect(weaponDamage(sword('steel'))).toBeGreaterThan(weaponDamage(sword('copper')));
    expect(weaponDamage(sword('iron', 'legendary'))).toBeGreaterThan(weaponDamage(sword('iron')));
    expect(armorBlock(plate('steel'))).toBeGreaterThan(armorBlock(plate('leather')));
    expect(armorBlock(plate('adamantine'))).toBeLessThanOrEqual(0.7);
    expect(weaponDamage(null)).toBe(0);
  });

  it('lets an archer reach farther than a swordsman', () => {
    expect(weaponReach({ ...sword('wood'), kind: 'bow' })).toBeGreaterThan(weaponReach(sword('wood')) * 3);
  });

  it('takes the better blade off a body, and leaves the worse one', () => {
    const victor = person('Ulf');
    const fallen = person('Bram');
    equip(victor, sword('iron'));
    equip(fallen, sword('steel'));
    equip(fallen, plate('copper'));
    fallen.equipment!.armor!.durability = 100;
    const events: ItemEvent[] = [];
    onItemEvent((e) => events.push(e));
    const taken = claimSpoils(victor, fallen, true);
    onItemEvent(null);
    expect(taken.map(i => i.material).sort()).toEqual(['copper', 'steel']);
    expect(victor.equipment?.weapon?.material).toBe('steel');
    expect(victor.equipment?.weapon?.owners).toEqual(['Bram', 'Ulf']);
    expect(fallen.equipment?.weapon).toBeNull();
    expect(events.every(e => e.kind === 'looted')).toBe(true);
  });

  it('leaves the sword in the grass when a wolf does the killing', () => {
    const wolf = { ...person('wolf'), type: 'wolf' } as Entity;
    const knight = person('Sir');
    equip(knight, sword('steel'));
    expect(claimSpoils(wolf, knight, false)).toEqual([]);
    expect(knight.equipment?.weapon?.material).toBe('steel');
  });

  it('wears out, names a masterwork that has killed enough, and breaks', () => {
    const hero = person('Hero');
    const blade = sword('iron', 'masterwork');
    equip(hero, blade);
    const events: ItemEvent[] = [];
    onItemEvent((e) => events.push(e));
    for (let i = 0; i < 10; i++) wearAfterBlow(hero, person(`v${i}`), true, () => 0.5);
    expect(blade.name).not.toBeNull();
    expect(events.some(e => e.kind === 'named')).toBe(true);
    for (let i = 0; i < 400 && hero.equipment?.weapon; i++) wearAfterBlow(hero, person('x'), false);
    onItemEvent(null);
    expect(hero.equipment?.weapon).toBeNull();
    expect(events.at(-1)?.kind).toBe('broke');
  });

  it('describes items the way the inspector shows them', () => {
    expect(describeItem(sword('copper'))).toBe('Copper sword');
    expect(describeItem({ ...sword('steel', 'fine'), modifier: 'sharp' })).toBe('Sharp fine steel sword');
    expect(describeItem({ ...sword('mithril', 'legendary'), name: 'Dawnmourn' })).toBe('Dawnmourn, mithril sword');
  });
});
