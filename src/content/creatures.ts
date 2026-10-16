// src/content/creatures.ts
//
// The creature registry: one record per kind, holding everything the
// simulation knows about a kind as data. What it eats, its base stats and
// size, how many may live at once, its ranged attack, how large its herds
// are, and whether it is a monster or a built structure.
//
// The per-kind tables the simulation indexes (FOOD_CHAIN, PROFILES, RANGED,
// size BASE, HERD_SIZE, the population caps, MONSTERS, STRUCTURES) are derived
// from this file with the helpers at the bottom. To add a creature, add one
// record here.
//
// This module imports types only, so the simulation modules can import it
// without a cycle.
import type { EntityType } from '../types/world';
import type { ShotKind } from '../utils/shotBridge';

/** Base stats for a kind. Copied onto every new creature of that kind. */
export interface CreatureStats {
  /** Maximum age. */
  maxAge: number;
  /** Health a new creature starts with, and its ceiling. */
  maxHealth: number;
  /** Strength attribute. */
  strength: number;
  /** Intelligence attribute. */
  intelligence: number;
  /** Speed attribute. */
  speed: number;
  /** Resilience attribute. */
  resilience: number;
}

/** A creature that fights at a distance without needing a bow. */
export interface RangedAttack {
  /** How far the attack reaches. */
  reach: number;
  /** The kind of shot it fires. */
  kind: ShotKind;
  /** Whether the attack can start fires. */
  ignite?: boolean;
}

/** Everything the registry records about one kind of creature. */
export interface CreatureDef {
  /** Predator-prey relationships: the kinds this creature hunts for food. */
  eats: EntityType[];
  /** Base stats. */
  stats: CreatureStats;
  /** Base size in world units. Half of what the sprite ends up as. */
  size: number;
  /**
   * Population cap at medium density. The peoples are the point of the
   * world. WorldBox runs thousands of them; drawing a creature is now nearly
   * free, so these are set by what the simulation can carry rather than what
   * the renderer could. Low density halves the cap, high density doubles it.
   */
  maxPopulation: number;
  /** How many animals travel together. 1 means solitary. Absent means solitary. */
  herdSize?: number;
  /**
   * Creatures that fight at a distance without needing a bow: the dragon's
   * breath, a mage's bolt, a UFO's beam. WorldBox draws every one of these,
   * and a dragon that has to walk up and nibble a knight is not a dragon.
   */
  ranged?: RangedAttack;
  /** What the Peaceful Monsters law calms down. */
  monster: boolean;
  /**
   * Things that are built rather than born. They stand where they were put, do
   * not eat or sleep or wander, and act only through their aura
   * (creatureAbilities.ts), but they have health and can be torn down.
   */
  structure: boolean;
}

/** One record per creature kind, in predator-prey table order. */
export const CREATURES: Record<EntityType, CreatureDef> = {
  human: {
    eats: ['rabbit', 'deer', 'fish', 'sheep', 'chicken'],
    stats: { maxAge: 80, maxHealth: 100, strength: 10, intelligence: 15, speed: 10, resilience: 10 },
    size: 0.15,
    maxPopulation: 600,
    monster: false,
    structure: false,
  },
  elf: {
    eats: ['fish', 'deer'],
    stats: { maxAge: 500, maxHealth: 90, strength: 8, intelligence: 18, speed: 12, resilience: 8 },
    size: 0.17,
    maxPopulation: 450,
    monster: false,
    structure: false,
  },
  dwarf: {
    eats: ['fish'],
    stats: { maxAge: 250, maxHealth: 120, strength: 15, intelligence: 12, speed: 8, resilience: 15 },
    size: 0.12,
    maxPopulation: 400,
    monster: false,
    structure: false,
  },
  orc: {
    eats: ['rabbit', 'deer', 'fish', 'sheep', 'pig', 'cow'],
    stats: { maxAge: 60, maxHealth: 115, strength: 18, intelligence: 8, speed: 10, resilience: 12 },
    size: 0.18,
    maxPopulation: 450,
    monster: false,
    structure: false,
  },
  wolf: {
    eats: ['rabbit', 'deer', 'sheep', 'chicken', 'goat'],
    stats: { maxAge: 15, maxHealth: 80, strength: 12, intelligence: 8, speed: 15, resilience: 10 },
    size: 0.12,
    maxPopulation: 30,
    herdSize: 5,
    monster: false,
    structure: false,
  },
  bear: {
    eats: ['fish', 'rabbit', 'deer', 'human', 'sheep'],
    stats: { maxAge: 25, maxHealth: 150, strength: 18, intelligence: 7, speed: 8, resilience: 15 },
    size: 0.2,
    maxPopulation: 15,
    herdSize: 2,
    monster: false,
    structure: false,
  },
  deer: {
    eats: [],
    stats: { maxAge: 12, maxHealth: 70, strength: 5, intelligence: 6, speed: 16, resilience: 8 },
    size: 0.15,
    maxPopulation: 40,
    herdSize: 8,
    monster: false,
    structure: false,
  },
  rabbit: {
    eats: [],
    stats: { maxAge: 5, maxHealth: 30, strength: 2, intelligence: 5, speed: 18, resilience: 4 },
    size: 0.08,
    maxPopulation: 60,
    herdSize: 6,
    monster: false,
    structure: false,
  },
  bird: {
    eats: ['beetle', 'grasshopper', 'butterfly'],
    stats: { maxAge: 6, maxHealth: 25, strength: 2, intelligence: 6, speed: 20, resilience: 4 },
    size: 0.07,
    maxPopulation: 60,
    herdSize: 7,
    monster: false,
    structure: false,
  },
  fish: {
    eats: [],
    stats: { maxAge: 6, maxHealth: 25, strength: 2, intelligence: 3, speed: 12, resilience: 4 },
    size: 0.09,
    maxPopulation: 90,
    herdSize: 8,
    monster: false,
    structure: false,
  },
  sheep: {
    eats: [],
    stats: { maxAge: 12, maxHealth: 60, strength: 4, intelligence: 4, speed: 8, resilience: 8 },
    size: 0.12,
    maxPopulation: 50,
    herdSize: 9,
    monster: false,
    structure: false,
  },
  chicken: {
    eats: ['grasshopper', 'beetle'],
    stats: { maxAge: 6, maxHealth: 20, strength: 1, intelligence: 3, speed: 9, resilience: 3 },
    size: 0.08,
    maxPopulation: 60,
    herdSize: 6,
    monster: false,
    structure: false,
  },
  fox: {
    eats: ['rabbit', 'chicken'],
    stats: { maxAge: 10, maxHealth: 50, strength: 8, intelligence: 10, speed: 16, resilience: 7 },
    size: 0.11,
    maxPopulation: 25,
    herdSize: 3,
    monster: false,
    structure: false,
  },
  snake: {
    eats: ['rabbit', 'chicken'],
    stats: { maxAge: 12, maxHealth: 35, strength: 10, intelligence: 4, speed: 7, resilience: 6 },
    size: 0.11,
    maxPopulation: 25,
    herdSize: 1,
    monster: false,
    structure: false,
  },
  dragon: {
    eats: ['human', 'elf', 'dwarf', 'orc', 'wolf', 'bear', 'deer', 'rabbit', 'sheep'],
    stats: { maxAge: 900, maxHealth: 600, strength: 45, intelligence: 20, speed: 14, resilience: 35 },
    size: 0.35,
    maxPopulation: 3,
    ranged: { reach: 3.2, kind: 'fire', ignite: true },
    monster: true,
    structure: false,
  },
  demon: {
    eats: ['human', 'elf', 'dwarf', 'orc'],
    stats: { maxAge: 400, maxHealth: 260, strength: 30, intelligence: 16, speed: 12, resilience: 22 },
    size: 0.25,
    maxPopulation: 5,
    ranged: { reach: 2.4, kind: 'fire', ignite: true },
    monster: true,
    structure: false,
  },
  zombie: {
    eats: ['human', 'elf', 'dwarf', 'orc'],
    stats: { maxAge: 9999, maxHealth: 70, strength: 12, intelligence: 2, speed: 5, resilience: 12 },
    size: 0.16,
    maxPopulation: 60,
    monster: true,
    structure: false,
  },
  skeleton: {
    eats: ['human', 'elf', 'dwarf'],
    stats: { maxAge: 9999, maxHealth: 60, strength: 11, intelligence: 3, speed: 8, resilience: 10 },
    size: 0.16,
    maxPopulation: 70,
    monster: true,
    structure: false,
  },
  elemental: {
    eats: [],
    stats: { maxAge: 600, maxHealth: 180, strength: 20, intelligence: 12, speed: 11, resilience: 25 },
    size: 0.2,
    maxPopulation: 10,
    ranged: { reach: 2.6, kind: 'magic' },
    monster: true,
    structure: false,
  },
  bandit: {
    eats: ['human', 'elf'],
    stats: { maxAge: 60, maxHealth: 105, strength: 14, intelligence: 11, speed: 12, resilience: 10 },
    size: 0.15,
    maxPopulation: 25,
    monster: true,
    structure: false,
  },
  cat: {
    eats: ['rat', 'chicken', 'fish'],
    stats: { maxAge: 14, maxHealth: 35, strength: 5, intelligence: 9, speed: 16, resilience: 5 },
    size: 0.08,
    maxPopulation: 25,
    monster: false,
    structure: false,
  },
  dog: {
    eats: ['rabbit', 'rat', 'chicken'],
    stats: { maxAge: 14, maxHealth: 60, strength: 9, intelligence: 9, speed: 15, resilience: 8 },
    size: 0.1,
    maxPopulation: 25,
    herdSize: 3,
    monster: false,
    structure: false,
  },
  cow: {
    eats: [],
    stats: { maxAge: 20, maxHealth: 110, strength: 6, intelligence: 4, speed: 6, resilience: 12 },
    size: 0.17,
    maxPopulation: 40,
    herdSize: 7,
    monster: false,
    structure: false,
  },
  pig: {
    eats: [],
    stats: { maxAge: 15, maxHealth: 70, strength: 5, intelligence: 7, speed: 7, resilience: 9 },
    size: 0.12,
    maxPopulation: 40,
    herdSize: 5,
    monster: false,
    structure: false,
  },
  crab: {
    eats: [],
    stats: { maxAge: 8, maxHealth: 30, strength: 4, intelligence: 2, speed: 6, resilience: 10 },
    size: 0.07,
    maxPopulation: 40,
    herdSize: 4,
    monster: false,
    structure: false,
  },
  frog: {
    eats: ['bee', 'grasshopper', 'beetle', 'butterfly'],
    stats: { maxAge: 6, maxHealth: 18, strength: 1, intelligence: 3, speed: 12, resilience: 3 },
    size: 0.06,
    maxPopulation: 40,
    herdSize: 4,
    monster: false,
    structure: false,
  },
  penguin: {
    eats: ['fish'],
    stats: { maxAge: 18, maxHealth: 40, strength: 3, intelligence: 5, speed: 7, resilience: 7 },
    size: 0.09,
    maxPopulation: 40,
    herdSize: 9,
    monster: false,
    structure: false,
  },
  turtle: {
    eats: [],
    stats: { maxAge: 150, maxHealth: 90, strength: 3, intelligence: 6, speed: 3, resilience: 25 },
    size: 0.1,
    maxPopulation: 20,
    monster: false,
    structure: false,
  },
  monkey: {
    eats: [],
    stats: { maxAge: 25, maxHealth: 45, strength: 5, intelligence: 12, speed: 15, resilience: 5 },
    size: 0.11,
    maxPopulation: 30,
    herdSize: 6,
    monster: false,
    structure: false,
  },
  rat: {
    eats: [],
    stats: { maxAge: 3, maxHealth: 12, strength: 1, intelligence: 6, speed: 14, resilience: 2 },
    size: 0.05,
    maxPopulation: 60,
    herdSize: 8,
    monster: false,
    structure: false,
  },
  crocodile: {
    eats: ['deer', 'sheep', 'fish', 'human', 'buffalo', 'pig', 'frog', 'flamingo', 'camel'],
    stats: { maxAge: 70, maxHealth: 170, strength: 20, intelligence: 4, speed: 7, resilience: 18 },
    size: 0.2,
    maxPopulation: 12,
    monster: false,
    structure: false,
  },
  piranha: {
    eats: ['fish'],
    stats: { maxAge: 8, maxHealth: 20, strength: 6, intelligence: 2, speed: 15, resilience: 3 },
    size: 0.07,
    maxPopulation: 60,
    herdSize: 10,
    monster: false,
    structure: false,
  },
  hyena: {
    eats: ['rabbit', 'deer', 'sheep', 'pig', 'ostrich', 'goat'],
    stats: { maxAge: 16, maxHealth: 70, strength: 11, intelligence: 7, speed: 15, resilience: 9 },
    size: 0.12,
    maxPopulation: 25,
    herdSize: 5,
    monster: false,
    structure: false,
  },
  rhino: {
    eats: [],
    stats: { maxAge: 45, maxHealth: 220, strength: 22, intelligence: 4, speed: 9, resilience: 24 },
    size: 0.24,
    maxPopulation: 10,
    herdSize: 2,
    monster: false,
    structure: false,
  },
  buffalo: {
    eats: [],
    stats: { maxAge: 25, maxHealth: 140, strength: 14, intelligence: 4, speed: 9, resilience: 14 },
    size: 0.19,
    maxPopulation: 40,
    herdSize: 10,
    monster: false,
    structure: false,
  },
  unicorn: {
    eats: [],
    stats: { maxAge: 1000, maxHealth: 160, strength: 12, intelligence: 16, speed: 18, resilience: 14 },
    size: 0.18,
    maxPopulation: 4,
    monster: false,
    structure: false,
  },
  fairy: {
    eats: [],
    stats: { maxAge: 300, maxHealth: 30, strength: 2, intelligence: 18, speed: 18, resilience: 4 },
    size: 0.07,
    maxPopulation: 15,
    monster: false,
    structure: false,
  },
  ghost: {
    eats: ['human', 'elf', 'dwarf', 'orc'],
    stats: { maxAge: 9999, maxHealth: 50, strength: 8, intelligence: 10, speed: 9, resilience: 30 },
    size: 0.15,
    maxPopulation: 15,
    monster: true,
    structure: false,
  },
  mage: {
    eats: ['human', 'elf', 'dwarf', 'orc'],
    stats: { maxAge: 200, maxHealth: 120, strength: 22, intelligence: 22, speed: 9, resilience: 12 },
    size: 0.16,
    maxPopulation: 4,
    ranged: { reach: 3.5, kind: 'magic' },
    monster: true,
    structure: false,
  },
  druid: {
    eats: [],
    stats: { maxAge: 300, maxHealth: 110, strength: 10, intelligence: 20, speed: 10, resilience: 14 },
    size: 0.16,
    maxPopulation: 6,
    monster: false,
    structure: false,
  },
  alien: {
    eats: ['human', 'cow', 'sheep'],
    stats: { maxAge: 400, maxHealth: 120, strength: 16, intelligence: 24, speed: 12, resilience: 12 },
    size: 0.14,
    maxPopulation: 8,
    monster: true,
    structure: false,
  },
  snowman: {
    eats: [],
    stats: { maxAge: 40, maxHealth: 60, strength: 6, intelligence: 4, speed: 5, resilience: 6 },
    size: 0.15,
    maxPopulation: 20,
    monster: false,
    structure: false,
  },
  goat: {
    eats: [],
    stats: { maxAge: 14, maxHealth: 55, strength: 6, intelligence: 5, speed: 13, resilience: 8 },
    size: 0.11,
    maxPopulation: 40,
    herdSize: 6,
    monster: false,
    structure: false,
  },
  camel: {
    eats: [],
    stats: { maxAge: 25, maxHealth: 120, strength: 8, intelligence: 5, speed: 9, resilience: 14 },
    size: 0.19,
    maxPopulation: 25,
    herdSize: 4,
    monster: false,
    structure: false,
  },
  ostrich: {
    eats: ['grasshopper', 'beetle'],
    stats: { maxAge: 20, maxHealth: 70, strength: 7, intelligence: 3, speed: 19, resilience: 7 },
    size: 0.16,
    maxPopulation: 25,
    herdSize: 5,
    monster: false,
    structure: false,
  },
  flamingo: {
    eats: ['fish'],
    stats: { maxAge: 20, maxHealth: 35, strength: 2, intelligence: 4, speed: 9, resilience: 4 },
    size: 0.13,
    maxPopulation: 40,
    herdSize: 10,
    monster: false,
    structure: false,
  },
  seal: {
    eats: ['fish', 'piranha'],
    stats: { maxAge: 25, maxHealth: 70, strength: 5, intelligence: 6, speed: 10, resilience: 10 },
    size: 0.13,
    maxPopulation: 30,
    herdSize: 6,
    monster: false,
    structure: false,
  },
  polar_bear: {
    eats: ['seal', 'penguin', 'fish', 'human'],
    stats: { maxAge: 25, maxHealth: 170, strength: 19, intelligence: 7, speed: 9, resilience: 16 },
    size: 0.21,
    maxPopulation: 10,
    monster: false,
    structure: false,
  },
  beetle: {
    eats: [],
    stats: { maxAge: 2, maxHealth: 10, strength: 2, intelligence: 1, speed: 6, resilience: 6 },
    size: 0.05,
    maxPopulation: 40,
    herdSize: 3,
    monster: false,
    structure: false,
  },
  bee: {
    eats: [],
    stats: { maxAge: 1, maxHealth: 6, strength: 2, intelligence: 3, speed: 16, resilience: 1 },
    size: 0.04,
    maxPopulation: 50,
    herdSize: 8,
    monster: false,
    structure: false,
  },
  butterfly: {
    eats: [],
    stats: { maxAge: 1, maxHealth: 5, strength: 0, intelligence: 2, speed: 12, resilience: 1 },
    size: 0.05,
    maxPopulation: 40,
    herdSize: 4,
    monster: false,
    structure: false,
  },
  grasshopper: {
    eats: [],
    stats: { maxAge: 1, maxHealth: 8, strength: 1, intelligence: 1, speed: 14, resilience: 2 },
    size: 0.05,
    maxPopulation: 50,
    herdSize: 6,
    monster: false,
    structure: false,
  },
  necromancer: {
    eats: ['human', 'elf', 'dwarf', 'orc'],
    stats: { maxAge: 300, maxHealth: 140, strength: 14, intelligence: 22, speed: 8, resilience: 12 },
    size: 0.16,
    maxPopulation: 3,
    ranged: { reach: 3, kind: 'dark' },
    monster: true,
    structure: false,
  },
  plague_doctor: {
    eats: [],
    stats: { maxAge: 70, maxHealth: 100, strength: 8, intelligence: 18, speed: 10, resilience: 12 },
    size: 0.15,
    maxPopulation: 6,
    monster: false,
    structure: false,
  },
  fire_skull: {
    eats: [],
    stats: { maxAge: 9999, maxHealth: 40, strength: 9, intelligence: 4, speed: 16, resilience: 8 },
    size: 0.09,
    maxPopulation: 12,
    monster: true,
    structure: false,
  },
  cold_one: {
    eats: ['human', 'elf', 'dwarf', 'orc', 'deer'],
    stats: { maxAge: 500, maxHealth: 160, strength: 18, intelligence: 8, speed: 8, resilience: 20 },
    size: 0.2,
    maxPopulation: 6,
    monster: true,
    structure: false,
  },
  ufo: {
    eats: ['cow', 'sheep', 'human'],
    stats: { maxAge: 9999, maxHealth: 200, strength: 12, intelligence: 30, speed: 16, resilience: 18 },
    size: 0.2,
    maxPopulation: 3,
    ranged: { reach: 3.5, kind: 'laser' },
    monster: true,
    structure: false,
  },
  sand_spider: {
    eats: ['rabbit', 'rat', 'beetle', 'grasshopper', 'human'],
    stats: { maxAge: 12, maxHealth: 60, strength: 12, intelligence: 3, speed: 14, resilience: 8 },
    size: 0.13,
    maxPopulation: 20,
    herdSize: 2,
    monster: true,
    structure: false,
  },
  acid_blob: {
    eats: ['human', 'elf', 'dwarf', 'orc'],
    stats: { maxAge: 30, maxHealth: 90, strength: 10, intelligence: 2, speed: 5, resilience: 14 },
    size: 0.14,
    maxPopulation: 10,
    monster: true,
    structure: false,
  },
  lil_pumpkin: {
    eats: [],
    stats: { maxAge: 10, maxHealth: 25, strength: 3, intelligence: 3, speed: 9, resilience: 4 },
    size: 0.08,
    maxPopulation: 25,
    herdSize: 3,
    monster: false,
    structure: false,
  },
  gummy_bear: {
    eats: [],
    stats: { maxAge: 12, maxHealth: 40, strength: 4, intelligence: 4, speed: 10, resilience: 6 },
    size: 0.09,
    maxPopulation: 30,
    herdSize: 4,
    monster: false,
    structure: false,
  },
  crabzilla: {
    eats: ['human', 'elf', 'dwarf', 'orc', 'cow', 'buffalo', 'rhino'],
    stats: { maxAge: 400, maxHealth: 900, strength: 50, intelligence: 6, speed: 7, resilience: 40 },
    size: 0.4,
    maxPopulation: 1,
    monster: true,
    structure: false,
  },
  flame_tower: {
    eats: [],
    stats: { maxAge: 9999, maxHealth: 500, strength: 0, intelligence: 0, speed: 0, resilience: 30 },
    size: 0.26,
    maxPopulation: 12,
    monster: true,
    structure: true,
  },
  ice_tower: {
    eats: [],
    stats: { maxAge: 9999, maxHealth: 500, strength: 0, intelligence: 0, speed: 0, resilience: 30 },
    size: 0.26,
    maxPopulation: 12,
    monster: true,
    structure: true,
  },
  white_mage: {
    eats: ['zombie', 'skeleton', 'demon', 'ghost'],
    stats: { maxAge: 220, maxHealth: 120, strength: 14, intelligence: 24, speed: 9, resilience: 12 },
    size: 0.16,
    maxPopulation: 4,
    ranged: { reach: 3.5, kind: 'magic' },
    monster: false,
    structure: false,
  },
  angel: {
    eats: ['demon', 'zombie', 'skeleton', 'ghost', 'necromancer'],
    stats: { maxAge: 9999, maxHealth: 260, strength: 26, intelligence: 22, speed: 15, resilience: 24 },
    size: 0.18,
    maxPopulation: 4,
    ranged: { reach: 3, kind: 'magic' },
    monster: false,
    structure: false,
  },
  sandworm: {
    eats: ['camel', 'human', 'elf', 'dwarf', 'orc', 'goat', 'ostrich'],
    stats: { maxAge: 300, maxHealth: 700, strength: 40, intelligence: 4, speed: 9, resilience: 30 },
    size: 0.38,
    maxPopulation: 2,
    monster: true,
    structure: false,
  },
  langton_ant: {
    eats: [],
    stats: { maxAge: 9999, maxHealth: 40, strength: 0, intelligence: 1, speed: 0, resilience: 6 },
    size: 0.07,
    maxPopulation: 6,
    monster: false,
    structure: true,
  },
  tumor: {
    eats: [],
    stats: { maxAge: 9999, maxHealth: 160, strength: 0, intelligence: 0, speed: 0, resilience: 18 },
    size: 0.12,
    maxPopulation: 30,
    monster: true,
    structure: true,
  },
  treant: {
    eats: [],
    stats: { maxAge: 2000, maxHealth: 420, strength: 24, intelligence: 14, speed: 5, resilience: 32 },
    size: 0.28,
    maxPopulation: 6,
    monster: false,
    structure: false,
  },
  candy_man: {
    eats: [],
    stats: { maxAge: 40, maxHealth: 60, strength: 5, intelligence: 6, speed: 9, resilience: 6 },
    size: 0.14,
    maxPopulation: 25,
    herdSize: 3,
    monster: false,
    structure: false,
  },
  jumpy_skull: {
    eats: ['human', 'elf', 'dwarf', 'rabbit', 'chicken'],
    stats: { maxAge: 9999, maxHealth: 35, strength: 9, intelligence: 3, speed: 19, resilience: 6 },
    size: 0.1,
    maxPopulation: 15,
    herdSize: 3,
    monster: true,
    structure: false,
  },
  robot_santa: {
    eats: [],
    stats: { maxAge: 9999, maxHealth: 300, strength: 10, intelligence: 20, speed: 10, resilience: 30 },
    size: 0.18,
    maxPopulation: 2,
    monster: false,
    structure: false,
  },
  yeti: {
    eats: ['human', 'elf', 'dwarf', 'orc', 'penguin', 'seal', 'goat'],
    stats: { maxAge: 120, maxHealth: 320, strength: 30, intelligence: 8, speed: 10, resilience: 22 },
    size: 0.24,
    maxPopulation: 6,
    monster: true,
    structure: false,
  },
  monolith: {
    eats: [],
    stats: { maxAge: 9999, maxHealth: 2000, strength: 0, intelligence: 50, speed: 0, resilience: 60 },
    size: 0.3,
    maxPopulation: 3,
    monster: false,
    structure: true,
  },
  grey_goo: {
    eats: [],
    stats: { maxAge: 9999, maxHealth: 60, strength: 0, intelligence: 0, speed: 0, resilience: 10 },
    size: 0.12,
    maxPopulation: 120,
    monster: true,
    structure: true,
  },
};

/** One value per creature, in registry order. */
export function mapAll<T>(pick: (def: CreatureDef) => T): Record<EntityType, T> {
  const table = {} as Record<EntityType, T>;
  for (const type of Object.keys(CREATURES) as EntityType[]) {
    table[type] = pick(CREATURES[type]);
  }
  return table;
}

/** Like mapAll, but creatures whose pick is undefined are left out. */
export function mapSome<T>(pick: (def: CreatureDef) => T | undefined): Partial<Record<EntityType, T>> {
  const table: Partial<Record<EntityType, T>> = {};
  for (const type of Object.keys(CREATURES) as EntityType[]) {
    const value = pick(CREATURES[type]);
    if (value !== undefined) table[type] = value;
  }
  return table;
}

/** The kinds whose record passes a test, in registry order. */
export function typesWhere(test: (def: CreatureDef) => boolean): EntityType[] {
  return (Object.keys(CREATURES) as EntityType[]).filter(type => test(CREATURES[type]));
}
