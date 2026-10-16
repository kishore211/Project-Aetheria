// Weapons and armour as things a creature owns.
//
// WorldBox's units carry real items: a copper sword forged in one town, taken
// off its owner's corpse by an orc, renamed when it has killed enough to earn
// a name (06-WORLDBOX-COMPLETE-REFERENCE.md §9, Items). The item is the part
// that turns a battle from arithmetic into a story — "the blade Dawnmourn,
// forged in Ashby, passed through four hands" — so the record keeps where it
// was made, who has held it and what it has killed.
//
// The forge reads the craft tier the town has already built its way to
// (settlementSystem.craftTiers), so better metal is a consequence of a bigger
// town rather than a research score running beside it.

import type { Entity } from '../types/world';
import { random } from './random';

export type Material =
  | 'wood' | 'leather' | 'copper' | 'bronze' | 'silver'
  | 'iron' | 'steel' | 'mithril' | 'adamantine';

export type WeaponKind = 'sword' | 'axe' | 'spear' | 'hammer' | 'bow';
export type ItemSlot = 'weapon' | 'armor';
export type Quality = 'normal' | 'fine' | 'masterwork' | 'legendary';
export type Modifier = 'sharp' | 'swift' | 'vampiric' | 'flaming' | 'sturdy' | 'cursed';

export interface Item {
  id: string;
  slot: ItemSlot;
  /** A weapon's shape. Armour is always 'armor'. */
  kind: WeaponKind | 'armor';
  material: Material;
  quality: Quality;
  modifier: Modifier | null;
  /** Only legendary items have one, and they keep it whoever holds them. */
  name: string | null;
  kills: number;
  /** Where it came off the anvil. */
  madeIn: string;
  /** Everyone who has carried it, oldest first, capped. */
  owners: string[];
  /** 0-100. A weapon wears with each blow and armour with each one it stops. */
  durability: number;
}

export interface Equipment {
  weapon?: Item | null;
  armor?: Item | null;
}

/** How good each metal is, on one scale for both slots. */
export const MATERIAL_POWER: Record<Material, number> = {
  wood: 1, leather: 1, copper: 2, bronze: 3, silver: 3.5,
  iron: 4, steel: 5, mithril: 7, adamantine: 9,
};

/** The colour each material is drawn in, on a sprite and in the inspector. */
export const MATERIAL_COLOR: Record<Material, string> = {
  wood: '#9c6b3c',
  leather: '#8a5a32',
  copper: '#c87533',
  bronze: '#b08d57',
  silver: '#e4e6ee',
  iron: '#9aa2ad',
  steel: '#d0d7e1',
  mithril: '#8fdcff',
  adamantine: '#b071ff',
};

interface WeaponProfile {
  /** Multiplier on the material's damage. */
  damage: number;
  /** Seconds between blows. The base is 0.8. */
  cooldown: number;
  /** How far the blow reaches, in tiles. Melee is 0.7. */
  reach: number;
}

export const WEAPONS: Record<WeaponKind, WeaponProfile> = {
  sword: { damage: 1, cooldown: 0.8, reach: 0.7 },
  axe: { damage: 1.2, cooldown: 0.95, reach: 0.7 },
  spear: { damage: 0.9, cooldown: 0.8, reach: 1.25 },
  hammer: { damage: 1.45, cooldown: 1.2, reach: 0.7 },
  bow: { damage: 0.7, cooldown: 1.1, reach: 3.5 },
};

export const QUALITY_BONUS: Record<Quality, number> = {
  normal: 1, fine: 1.2, masterwork: 1.45, legendary: 1.9,
};

/** What a race likes to swing, in order. Dwarves love hammers; elves shoot. */
const RACE_WEAPONS: Record<string, WeaponKind[]> = {
  human: ['sword', 'spear', 'sword', 'bow'],
  elf: ['bow', 'bow', 'spear', 'sword'],
  dwarf: ['hammer', 'axe', 'hammer', 'axe'],
  orc: ['axe', 'axe', 'hammer', 'spear'],
};

/**
 * The metal a town of this craft tier works, for each slot. Tier 4 is the top
 * of what a town can reach by building; mithril and adamantine only ever
 * come out of a masterwork roll there, so they stay rare enough to notice.
 */
const TIER_MATERIAL: Record<ItemSlot, Material[]> = {
  weapon: ['wood', 'copper', 'bronze', 'iron', 'steel'],
  armor: ['leather', 'leather', 'copper', 'iron', 'steel'],
};

/**
 * What a piece costs, by material: wood and stone for the forge, gold for
 * the smith, and metal from the mines for anything better than wood and
 * leather. Mithril and adamantine take an ingot of the rare metal itself.
 */
export const MATERIAL_COST: Record<Material, { wood: number; stone: number; gold: number; metal: number; rare?: 'mithril' | 'adamantine' }> = {
  wood: { wood: 2, stone: 0, gold: 0, metal: 0 },
  leather: { wood: 1, stone: 0, gold: 1, metal: 0 },
  copper: { wood: 1, stone: 2, gold: 1, metal: 1 },
  bronze: { wood: 1, stone: 3, gold: 2, metal: 2 },
  silver: { wood: 1, stone: 3, gold: 4, metal: 2 },
  iron: { wood: 1, stone: 4, gold: 3, metal: 3 },
  steel: { wood: 2, stone: 5, gold: 5, metal: 4 },
  mithril: { wood: 2, stone: 6, gold: 8, metal: 2, rare: 'mithril' },
  adamantine: { wood: 2, stone: 8, gold: 12, metal: 2, rare: 'adamantine' },
};

const NAME_HEADS = [
  'Dawn', 'Ash', 'Grim', 'Storm', 'Frost', 'Blood', 'Star', 'Gloom', 'Oath', 'Wolf',
  'Iron', 'Sun', 'Night', 'Thorn', 'Bright', 'Doom', 'Ember', 'Raven', 'Hollow', 'Grief',
];
const NAME_TAILS: Record<WeaponKind | 'armor', string[]> = {
  sword: ['bringer', 'mourn', 'fang', 'edge', 'brand', 'song'],
  axe: ['cleaver', 'bite', 'hew', 'splitter', 'maw', 'reaver'],
  spear: ['reach', 'thorn', 'lance', 'sting', 'pike', 'needle'],
  hammer: ['fall', 'maul', 'breaker', 'crush', 'anvil', 'quake'],
  bow: ['whisper', 'string', 'flight', 'song', 'wind', 'sight'],
  armor: ['ward', 'shell', 'mantle', 'aegis', 'bulwark', 'hide'],
};

const MODIFIERS: Record<ItemSlot, Modifier[]> = {
  weapon: ['sharp', 'swift', 'vampiric', 'flaming', 'cursed'],
  armor: ['sturdy', 'sturdy', 'swift', 'cursed'],
};

const MODIFIER_LABEL: Record<Modifier, string> = {
  sharp: 'Sharp', swift: 'Swift', vampiric: 'Vampiric', flaming: 'Flaming', sturdy: 'Sturdy', cursed: 'Cursed',
};

let nextItemId = 1;
/** Start item ids again from 1. Called when a new world is built. */
export const resetItemIds = (): void => {
  nextItemId = 1;
};

/** One draw, so a forge spends a known amount of the shared random stream. */
type Roll = () => number;

const rollQuality = (roll: Roll, tier: number): Quality => {
  const r = roll();
  // A bigger town has better smiths; a legendary is never more than 1 in 40.
  const lift = Math.max(0, tier - 1) * 0.012;
  if (r < 0.006 + lift) return 'legendary';
  if (r < 0.05 + lift * 2) return 'masterwork';
  if (r < 0.25 + lift * 2) return 'fine';
  return 'normal';
};

/** A legendary item's name, which it keeps whoever holds it. */
export const legendName = (kind: WeaponKind | 'armor', roll: Roll): string => {
  const head = NAME_HEADS[Math.floor(roll() * NAME_HEADS.length)];
  const tails = NAME_TAILS[kind];
  return head + tails[Math.floor(roll() * tails.length)];
};

/**
 * Make one item.
 *
 * `tier` is the town's craft tier, 1-4 (0 for a smith with no metal). Materials are picked off the tier,
 * shapes off the race's taste, and quality off one roll; a masterwork at the
 * top tier has a chance of being worked in mithril or adamantine.
 */
export const forgeItem = (
  slot: ItemSlot, tier: number, race: string, madeIn: string, roll: Roll = random,
): Item => {
  // Tier 0 is wood and leather: what a town with no metal can still make.
  const t = Math.max(0, Math.min(4, Math.round(tier)));
  const quality = rollQuality(roll, t);
  let material = TIER_MATERIAL[slot][t];
  if (t >= 4 && (quality === 'masterwork' || quality === 'legendary')) {
    const r = roll();
    if (r < 0.15) material = 'adamantine';
    else if (r < 0.5) material = 'mithril';
  } else if (t === 3 && quality !== 'normal' && slot === 'weapon' && roll() < 0.3) {
    material = 'silver';
  }
  const choices = RACE_WEAPONS[race] ?? RACE_WEAPONS.human;
  const kind: WeaponKind | 'armor' = slot === 'armor' ? 'armor' : choices[Math.floor(roll() * choices.length)];
  const modifier = quality === 'normal' ? null
    : (quality === 'legendary' || roll() < 0.35)
      ? MODIFIERS[slot][Math.floor(roll() * MODIFIERS[slot].length)]
      : null;
  // A legendary is never cursed: a god's gift with a sting reads as a bug.
  const settled = quality === 'legendary' && modifier === 'cursed' ? (slot === 'weapon' ? 'sharp' : 'sturdy') : modifier;
  return {
    id: `item-${nextItemId++}`,
    slot,
    kind,
    material,
    quality,
    modifier: settled,
    name: quality === 'legendary' ? legendName(kind, roll) : null,
    kills: 0,
    madeIn,
    owners: [],
    durability: 100,
  };
};

/** How much a whole item is worth, for comparing two of them. */
export const itemScore = (item: Item | null | undefined): number => {
  if (!item) return 0;
  const mod = item.modifier === 'cursed' ? 0.7 : item.modifier ? 1.15 : 1;
  const shape = item.slot === 'weapon' ? WEAPONS[item.kind as WeaponKind].damage : 1;
  return MATERIAL_POWER[item.material] * QUALITY_BONUS[item.quality] * mod * shape * (0.5 + item.durability / 200);
};

/** Extra damage a weapon adds to its wielder's blow. */
export const weaponDamage = (item: Item | null | undefined): number => {
  if (!item || item.slot !== 'weapon') return 0;
  const sharp = item.modifier === 'sharp' ? 1.25 : item.modifier === 'cursed' ? 0.75 : 1;
  return MATERIAL_POWER[item.material] * 1.6 * WEAPONS[item.kind as WeaponKind].damage * QUALITY_BONUS[item.quality] * sharp;
};

/** Seconds between blows with this weapon in hand (bare hands are 0.8). */
export const weaponCooldown = (item: Item | null | undefined): number => {
  if (!item || item.slot !== 'weapon') return 0.8;
  const base = WEAPONS[item.kind as WeaponKind].cooldown;
  return item.modifier === 'swift' ? base * 0.75 : base;
};

/** How far a blow reaches with this weapon. */
export const weaponReach = (item: Item | null | undefined): number =>
  !item || item.slot !== 'weapon' ? 0.7 : WEAPONS[item.kind as WeaponKind].reach;

/** The share of a blow armour stops, 0-0.7. */
export const armorBlock = (item: Item | null | undefined): number => {
  if (!item || item.slot !== 'armor') return 0;
  const sturdy = item.modifier === 'sturdy' ? 1.3 : item.modifier === 'cursed' ? 0.6 : 1;
  return Math.min(0.7, MATERIAL_POWER[item.material] * 0.055 * QUALITY_BONUS[item.quality] * sturdy);
};

/** Speed multiplier from what a creature carries: heavy metal slows, swift quickens. */
export const gearSpeed = (gear: Equipment | undefined): number => {
  if (!gear) return 1;
  let k = 1;
  if (gear.armor) {
    const heavy = gear.armor.material === 'iron' || gear.armor.material === 'steel' || gear.armor.material === 'adamantine';
    if (heavy) k *= 0.92;
    if (gear.armor.modifier === 'swift') k *= 1.12;
  }
  if (gear.weapon?.modifier === 'swift') k *= 1.05;
  return k;
};

/** "Legendary steel sword Dawnmourn", "Sharp copper axe", "leather armour". */
export const describeItem = (item: Item): string => {
  const shape = item.kind === 'armor' ? 'armour' : item.kind;
  const base = `${item.material} ${shape}`;
  const mod = item.modifier ? `${MODIFIER_LABEL[item.modifier]} ` : '';
  if (item.name) return `${item.name}, ${mod.toLowerCase()}${base}`;
  const q = item.quality === 'normal' ? '' : `${item.quality} `;
  const text = `${mod}${q}${base}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Put an item in a creature's hands, recording it in the item's history. */
export const equip = (entity: Entity, item: Item): void => {
  const gear = (entity.equipment ??= {});
  gear[item.slot] = item;
  if (item.owners.at(-1) !== entity.name) {
    item.owners.push(entity.name);
    if (item.owners.length > 8) item.owners.shift();
  }
};

/** Who wants what the forge makes, most deserving first. */
export const forgePriority = (entity: Entity): number => {
  let p = 0;
  if (entity.status.includes('king')) p += 40;
  if (entity.status.includes('captain')) p += 30;
  if (entity.status.includes('leader')) p += 15;
  if (entity.job === 'warrior') p += 20;
  return p;
};

/** What happened to an item worth telling the world about. */
export type ItemEvent =
  | { kind: 'forged'; item: Item; owner: Entity }
  | { kind: 'looted'; item: Item; owner: Entity; from: Entity }
  | { kind: 'broke'; item: Item; owner: Entity }
  | { kind: 'named'; item: Item; owner: Entity };

let listener: ((event: ItemEvent) => void) | null = null;

/** The engine listens here and writes the interesting ones into the chronicle. */
export const onItemEvent = (fn: ((event: ItemEvent) => void) | null): void => {
  listener = fn;
};

export const emitItemEvent = (event: ItemEvent): void => {
  listener?.(event);
};

/** Kills before a masterwork earns its own name. */
const NAMING_KILLS = 10;

/**
 * Bookkeeping after a blow lands: the weapon wears, the armour on the other
 * side wears, and a kill counts on the blade. A masterwork that reaches ten
 * kills is given a name, which is how a legend starts here rather than at the
 * anvil only.
 */
export const wearAfterBlow = (attacker: Entity, target: Entity, killed: boolean, roll: Roll = random): void => {
  const weapon = attacker.equipment?.weapon;
  if (weapon) {
    weapon.durability -= weapon.material === 'adamantine' ? 0.15 : 0.6;
    if (killed) {
      weapon.kills += 1;
      if (!weapon.name && weapon.quality === 'masterwork' && weapon.kills >= NAMING_KILLS) {
        weapon.name = legendName(weapon.kind, roll);
        emitItemEvent({ kind: 'named', item: weapon, owner: attacker });
      }
    }
    if (weapon.durability <= 0) {
      attacker.equipment!.weapon = null;
      emitItemEvent({ kind: 'broke', item: weapon, owner: attacker });
    }
  }
  const armor = target.equipment?.armor;
  if (armor) {
    armor.durability -= armor.material === 'adamantine' ? 0.15 : 0.5;
    if (armor.durability <= 0) {
      target.equipment!.armor = null;
      emitItemEvent({ kind: 'broke', item: armor, owner: target });
    }
  }
};

/**
 * The winner takes anything the fallen carried that beats its own.
 *
 * Only creatures that can hold a sword pick one up — a wolf that kills a
 * knight leaves the knight's sword in the grass.
 */
export const claimSpoils = (victor: Entity, fallen: Entity, canWield: boolean): Item[] => {
  const taken: Item[] = [];
  const gear = fallen.equipment;
  if (!gear || !canWield) return taken;
  for (const slot of ['weapon', 'armor'] as const) {
    const item = gear[slot];
    if (!item) continue;
    if (itemScore(item) <= itemScore(victor.equipment?.[slot])) continue;
    gear[slot] = null;
    equip(victor, item);
    taken.push(item);
    emitItemEvent({ kind: 'looted', item, owner: victor, from: fallen });
  }
  return taken;
};

/** Copy for a save. Items are plain data, so this is a deep clone. */
export const cloneEquipment = (gear: Equipment | undefined): Equipment | undefined =>
  gear ? JSON.parse(JSON.stringify(gear)) as Equipment : undefined;

/** Keep fresh ids clear of the ones a loaded save already uses. */
export const reserveItemIds = (gear: Equipment | undefined): void => {
  for (const item of [gear?.weapon, gear?.armor]) {
    const n = item ? Number(item.id.replace('item-', '')) : NaN;
    if (Number.isFinite(n) && n >= nextItemId) nextItemId = n + 1;
  }
};
