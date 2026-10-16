// Numeric constants and constant tables for the civilization layer: what each
// building costs, earns, holds and looks like, and how fast villages, kingdoms
// and wars move. Values only.
import * as THREE from 'three';
import type { Race } from '../../types/world';
import type { BuildingKind, BuildingRecipe, BuildingTier, Siting } from './types';

/** How much larger a building is drawn than its recipe size. */
export const BUILDING_DRAW_SCALE = 1.7;

export const RECIPES: BuildingRecipe[] = [
  { kind: 'hall', wood: 14, stone: 6, requires: 5, limit: 1, size: 0.85, priority: 100 },
  { kind: 'temple', wood: 10, stone: 12, requires: 9, limit: 1, size: 0.8, priority: 80 },
  { kind: 'tower', wood: 4, stone: 10, requires: 6, limit: 3, size: 0.78, priority: 70 },
  { kind: 'barracks', wood: 8, stone: 8, requires: 8, limit: 1, size: 0.8, priority: 65 },
  { kind: 'smithy', wood: 6, stone: 6, requires: 6, limit: 1, size: 0.72, priority: 62 },
  { kind: 'windmill', wood: 8, stone: 2, requires: 5, limit: 1, size: 0.78, priority: 55 },
  { kind: 'library', wood: 10, stone: 6, requires: 10, limit: 1, size: 0.78, priority: 40 },
  { kind: 'well', wood: 2, stone: 5, requires: 4, limit: 2, size: 0.5, priority: 52 },
  { kind: 'market', wood: 9, stone: 4, requires: 8, limit: 1, size: 0.78, priority: 48 },
  { kind: 'dock', wood: 8, stone: 0, requires: 5, limit: 1, size: 0.7, priority: 58 },
  { kind: 'mine', wood: 4, stone: 6, requires: 7, limit: 2, size: 0.6, priority: 60 },
  { kind: 'stockpile', wood: 4, stone: 0, requires: 3, limit: 1, size: 0.6, priority: 56 },
  { kind: 'dummy', wood: 3, stone: 0, requires: 9, limit: 2, size: 0.5, priority: 47, needs: 'barracks' },
  { kind: 'house', wood: 7, stone: 1, requires: 2, limit: 26, size: 0.62, priority: 50 },
  { kind: 'farm', wood: 5, stone: 0, requires: 3, limit: 4, size: 0.55, priority: 45 },
  { kind: 'statue', wood: 2, stone: 12, requires: 11, limit: 2, size: 0.7, priority: 30 },
  { kind: 'tent', wood: 3, stone: 0, requires: 0, limit: 3, size: 0.5, priority: 20 },
];

export const BUILDING_HEALTH: Record<BuildingKind, number> = {
  bonfire: 120, tent: 60, house: 140, hall: 260,
  farm: 90, tower: 240, temple: 220, statue: 180, mine: 160,
  windmill: 120, barracks: 220, smithy: 160, library: 170, well: 90, market: 140, dock: 110,
  stockpile: 80, dummy: 40,
};

/**
 * How many tiles a single building projects its kingdom's claim.
 * Scaled up from the first pass: a WorldBox village claims 3x3 zones of 8x8
 * tiles — 576 tiles — at founding, on a map the size of our 'medium'. Ours
 * claimed about 50, which is why the world looked like a few specks on a big
 * empty continent (research doc section 1).
 */
export const CLAIM_RADIUS: Record<BuildingKind, number> = {
  bonfire: 7, tent: 3, house: 4, hall: 9,
  farm: 3, tower: 7, temple: 7, statue: 5, mine: 3,
  windmill: 3, barracks: 5, smithy: 3, library: 5, well: 2, market: 4, dock: 3,
  stockpile: 2, dummy: 1,
};

/**
 * How warlike each people is by nature. Orcs want a war with everyone; elves
 * would rather be left alone. Fed to the opinion formula as 'Bloodlust'.
 */
export const TEMPERAMENT: Record<Race, number> = {
  orc: 30,
  human: 12,
  dwarf: 8,
  elf: 2,
};

/** Rounds (six seconds each) before a war is sure to end in a peace. */
export const WAR_MAX_ROUNDS = 50;
/** After this many rounds, each round may bring a negotiated peace. */
export const WAR_WEARY_ROUNDS = 20;
export const WAR_WEARY_PEACE_CHANCE = 0.05;
/** Seconds a new kingdom is left in peace before tension can build. */
export const YOUNG_REALM_PEACE = 300;
/** People a realm needs before it can field a war at all. */
export const WAR_MIN_POPULATION = 20;
/** Realms this close, village to village, notice each other without a border. */
export const CONTACT_RANGE = 40;

/**
 * How keen each race is to expand, as an offset on what its ruler can govern.
 *
 * This used to be a hard ceiling — a kingdom simply stopped founding villages
 * at the limit. That was a placeholder standing in for politics: real empires
 * do not stop growing when governing gets hard, they grow anyway and start
 * losing provinces. The number now shifts where loyalty begins to suffer
 * (see `governableVillages`), and a kingdom is free to overreach and pay for
 * it (docs/project-tracker/08-MASTER-PLAN.md 14.1).
 */
export const EXPANSION_APPETITE: Record<Race, number> = {
  human: 2,
  orc: 2,
  elf: 0,
  dwarf: 0,
};

/**
 * Tiles per side of a placement zone.
 *
 * Theirs is 8x8 on an 8px tile map; ours is 3x3 because a whole town here is
 * only six or seven tiles across, and an 8-tile zone would swallow it whole.
 */
export const ZONE_SIZE = 3;

/**
 * What a building *is*, in one number, and how much ground that takes.
 *
 * Tier 1 is shelter, tier 2 is work, tier 3 is the things a town builds once it
 * has stopped merely surviving — and a tier-3 building stands on four tiles
 * rather than one. That is the whole of it, and it does a surprising amount:
 * a hall is now visibly the largest thing in a settlement without a label, a
 * skyline has a hierarchy in it, and the ground a civic building costs is a
 * real decision rather than a rounding error. It also gives towns their first
 * genuine sense of scale, because the footprint pushes the houses outward.
 */
export const TIERS: Record<string, BuildingTier> = {
  tent: { tier: 1, footprint: 1 },
  bonfire: { tier: 1, footprint: 1 },
  house: { tier: 1, footprint: 1 },
  farm: { tier: 2, footprint: 1 },
  mine: { tier: 2, footprint: 1 },
  tower: { tier: 2, footprint: 1 },
  statue: { tier: 3, footprint: 2 },
  temple: { tier: 3, footprint: 2 },
  hall: { tier: 3, footprint: 2 },
  windmill: { tier: 2, footprint: 1 },
  barracks: { tier: 2, footprint: 1 },
  smithy: { tier: 2, footprint: 1 },
  library: { tier: 3, footprint: 1 },
  well: { tier: 1, footprint: 1 },
  market: { tier: 2, footprint: 1 },
  dock: { tier: 1, footprint: 1 },
  stockpile: { tier: 1, footprint: 1 },
  dummy: { tier: 2, footprint: 1 },
};

export const SITING: Record<string, Siting> = {
  bonfire: 'anchor',
  hall: 'anchor',
  house: 'cluster',
  farm: 'cluster',
  mine: 'solitary',
  temple: 'solitary',
  statue: 'solitary',
  tower: 'border',
  windmill: 'cluster',
  barracks: 'border',
  smithy: 'cluster',
  library: 'solitary',
  well: 'cluster',
  market: 'cluster',
  dock: 'shore',
  stockpile: 'cluster',
  dummy: 'border',
};

/**
 * How long a province must sit below zero loyalty before it goes.
 *
 * A single bad harvest should not cost you a city, and the delay is the whole
 * reason a rebellion is something the player can see coming and head off —
 * which is what makes the loyalty breakdown worth opening.
 */
export const REBELLION_PATIENCE = 45;

/** What a meal costs a villager who has to pay for one. */
export const MEAL_PRICE = 5;

/** The lord's cut of every wage, before it becomes spendable. */
export const TAX_RATE = 0.25;

/**
 * What each building earns per round.
 *
 * The architecture *is* the income graph — a town's wealth is legible from its
 * skyline rather than from a panel. Their tiers run a T1 house at 1 up to a T6
 * at 6, with a town hall at 10; ours has no tiers yet, so these are the
 * single-tier equivalents.
 */
export const BUILDING_YIELD: Record<string, number> = {
  hall: 6,
  house: 2,
  farm: 3,
  mine: 4,
  temple: 2,
  statue: 1,
  tower: 1,
  bonfire: 0,
  windmill: 2,
  barracks: 0,
  smithy: 3,
  library: 2,
  well: 0,
  // A market is where the town's money changes hands, and some of it stays.
  market: 5,
  dock: 2,
  stockpile: 1,
  dummy: 0,
};

/** How far a watchtower's archers reach, and how hard an arrow hits. */
export const TOWER_RANGE = 5;
export const TOWER_DAMAGE = 9;

export const HALL_UPGRADE: Record<number, { wood: number; stone: number; gold: number }> = {
  2: { wood: 12, stone: 18, gold: 0 },
  3: { wood: 16, stone: 36, gold: 30 },
};

/** What it costs to rebuild a house at the next level. */
export const HOUSE_UPGRADE: Record<number, { wood: number; stone: number; gold: number }> = {
  2: { wood: 6, stone: 6, gold: 0 },
  3: { wood: 8, stone: 12, gold: 10 },
};

/** How many residents each building houses, for the homelessness term. */
export const HOUSING: Record<string, number> = {
  house: 4,
  hall: 3,
  farm: 1,
};

/**
 * How much each building breathes, 0-1.
 *
 * A settlement that is perfectly still reads as a set of props. WorldBox syncs
 * these little scale animations to the game-speed setting, which is why a
 * paused world still looks alive and a fast one looks frantic — ours ride the
 * same clock the wind does, which the engine advances every frame.
 */
export const PULSE_BY_BUILDING: Record<string, number> = {
  bonfire: 1,
  farm: 0.7,
  house: 0.45,
  hall: 0.3,
  temple: 0.35,
  statue: 0.2,
  tower: 0.25,
  mine: 0.4,
  windmill: 0.6,
  barracks: 0.25,
  smithy: 0.5,
  library: 0.3,
  well: 0.2,
  market: 0.45,
  dock: 0.15,
  stockpile: 0.2,
  dummy: 0.6,
};

/** Claimed land whose village has no identity yet, on an identity layer. */
export const UNKNOWN_IDENTITY_COLOR = new THREE.Color('#64748b');

/**
 * Villages beyond the governable count that a kingdom will still *try* for.
 * Past this even the keenest race stops, because a realm with six seceding
 * provinces is noise rather than drama.
 */
export const OVERREACH_ALLOWANCE = 2;

/**
 * How far from the centre a villager can be and still eat from the granary.
 * It was eleven tiles, and woodcutters and miners working the edge of the
 * territory starved beside a full store.
 */
export const FEEDING_RADIUS = 26;

/** Seconds between towns sending out traders. */
export const CARAVAN_INTERVAL = 8;
/** How far a trader will walk to sell. */
export const CARAVAN_RANGE = 55;
/** Gold a caravan earns each end of its route. */
export const CARAVAN_PROFIT = 4;
/** Give up on a trader who never arrives. */
export const CARAVAN_TIMEOUT = 150;
/** Caravan rounds a trade tie keeps warming opinion after the last trader. */
export const TRADE_TIE_MEMORY = 30;

/** What one builder's visit adds to a site. Five visits put up a house. */
export const BUILDER_STROKE = 0.2;
/** What a site gains each build round with nobody working on it. */
export const SITE_SELF_PROGRESS = 0.04;

/** How quickly each kind goes up: a tent in moments, a temple over a season. */
export const BUILD_EASE: Partial<Record<BuildingKind, number>> = {
  tent: 3, well: 2.5, farm: 2.5, stockpile: 2.5, dummy: 2.5, bonfire: 3,
  house: 1.3, windmill: 1.2, dock: 1.2, mine: 1.2,
  hall: 0.6, temple: 0.6, library: 0.7, statue: 0.8, barracks: 0.8, tower: 0.9,
};

/** Most builders one town keeps on its sites. */
export const MAX_BUILDERS = 6;
/** Sites one town will have open at once. */
export const MAX_SITES = 2;

/** Most miners and woodcutters one town keeps, however large. */
export const MAX_MINERS = 8;
export const MAX_WOODCUTTERS = 10;
/** Food a farmer brings in from one spell of work on a field. */
export const FARM_HARVEST = 2;

/** Seconds between a town's chances to raise a child. */
export const BIRTH_INTERVAL = 2.5;
/** Chance per adult, per round, that the town gains a child. Capped below. */
export const BIRTH_CHANCE_PER_ADULT = 0.035;
/** Food the granary spends on each new mouth. */
export const BIRTH_FOOD = 4;
/** Room a town finds beyond its roofs: people double up before they go without. */
export const HOUSING_SLACK = 4;

/** Adults a village needs before it can spare anyone to settle elsewhere. */
export const SETTLER_SOURCE_POPULATION = 9;
/** How many leave together. */
export const SETTLER_PARTY_MIN = 3;
export const SETTLER_PARTY_MAX = 5;
/** How far a settler party will walk to found a new home. */
export const SETTLE_RANGE = 34;
/** Give up on a party that never arrives. */
export const SETTLE_TIMEOUT = 180;

export const SENTIENT_RACES: Race[] = ['human', 'elf', 'dwarf', 'orc'];

/** Minimum unaffiliated adults of one race in one place to found a village. */
export const FOUNDING_CLUSTER = 3;
export const FOUNDING_RADIUS = 5;
export const MIN_VILLAGE_SPACING = 16;
export const BUILDING_CLOUD_CAPACITY = 2048;
/** Roofs are lifted a little toward white so a dark realm's houses still read. */
export const ROOF_LIGHT = new THREE.Color(0xffffff);
/** Most boats on the water at once, across every kingdom. */
export const BOAT_CAPACITY = 96;
/** A village needs this many people before it can spare a crew. */
export const FISHING_MIN_POPULATION = 6;
/** How far across the sea a kingdom will look for a new home. */
export const OVERSEAS_RANGE = 60;
/** An island smaller than this is a rock, not somewhere to found a town. */
export const MIN_COLONY_ISLAND = 24;
/** Gold a merchant brings into port per run. */
export const TRADE_PROFIT = 3;
/** A town needs this many people before it runs a trade route. */
export const TRADE_MIN_POPULATION = 10;
