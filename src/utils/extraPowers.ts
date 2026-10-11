// The rest of the power bar.
//
// WorldBox's bar is the game's whole vocabulary: terrain painted by height, a
// seed for every biome, weather you can aim, explosives that escalate from a
// grenade to a mushroom cloud, plagues, madness, shields, coffee, and the
// quiet diplomatic powers that start wars with a whisper
// (06-WORLDBOX-COMPLETE-REFERENCE.md §2). The first twenty-odd powers live in
// the engine hook; everything here is written against a small context instead,
// so the hook does not grow by another thousand lines and each power can be
// exercised in a test without a renderer.
//
// Every power returns whether it did anything, so a click on the wrong ground
// gets the refusal cue instead of looking like a broken game.
import { isWaterBiome, type BiomeType, type Entity, type EntityType, type Tile } from '../types/world';
import { addHeat, MELT, SCORCH } from './thermal';
import { applyStatus, clearStatus, type StatusId } from './statusEffects';
import { isSapient } from './entitySystemMinimal';
import { isAquatic } from './pathfinding';
import { grantTrait, TRAITS } from './traits';
import { equip, forgeItem, describeItem } from './equipment';
import { wieldsGear } from './pixelSprites';
import type { TraitId } from '../types/world';
import type { DropKind } from './clouds';
import type { DiplomacyAct } from './settlementSystem';
import type { FlashTone } from './impactBridge';
import type { TerraformVoice } from './soundManager';

export interface PowerContext {
  tiles: Tile[][];
  brushRadius: number;
  inBounds: (x: number, y: number) => boolean;
  /** Visit every tile within `radius` of `center`, with its distance. */
  forEachBrushTile: (center: Tile, radius: number, visit: (tile: Tile, distance: number) => void) => void;
  /** Set a tile's height (and optionally its biome), keeping it consistent. */
  reshape: (tile: Tile, height: number, type?: BiomeType) => void;
  sync: (tile: Tile) => void;
  ignite: (tile: Tile) => boolean;
  extinguish: (tile: Tile) => void;
  query: (x: number, y: number, radius: number) => Entity[];
  spawn: (type: EntityType, x: number, y: number, subspecies?: string | null) => Entity | null;
  damageArea: (x: number, y: number, radius: number, damage: number) => number;
  healArea: (x: number, y: number, radius: number, amount: number) => number;
  demolishAt: (x: number, y: number) => void;
  cancelPlotsBy: (entityId: string) => number;
  diplomacy: (act: DiplomacyAct, x: number, y: number) => string | null;
  summonCloud: (kind: DropKind, x: number, y: number) => void;
  announce: (message: string, kind: 'divine' | 'disaster' | 'info', at?: { x: number; y: number }) => void;
  fx: {
    burst: (tile: Tile, color: number, count?: number, speed?: number) => void;
    aura: (tile: Tile, color: number) => void;
    shockwave: (tile: Tile, color: number, radius: number) => void;
  };
  sound: {
    terraform: (voice: TerraformVoice) => void;
    boom: () => void;
    quake: () => void;
    fire: () => void;
    bless: () => void;
    curse: () => void;
    click: () => void;
  };
  shake: (amplitude: number, duration: number) => void;
  flash: (tone: FlashTone, strength: number) => void;
  random: () => number;
}

// -- the catalogue's tool ids ---------------------------------------------

export const TERRAIN_BRUSHES = {
  'paint-deep': { height: 0.06, type: 'deep_ocean' as BiomeType },
  'paint-ocean': { height: 0.16, type: 'ocean' as BiomeType },
  'paint-shallow': { height: 0.23, type: 'shallow_water' as BiomeType },
  'paint-sand': { height: 0.27, type: 'beach' as BiomeType },
  'paint-soil': { height: 0.4, type: undefined },
  'paint-hills': { height: 0.64, type: undefined },
  'paint-summit': { height: 0.94, type: 'mountains' as BiomeType },
} as const;

interface BiomeSeed {
  type: BiomeType;
  temperature?: number;
  moisture?: number;
  /** Chance a seeded tile also grows a tree. */
  trees?: number;
  /** Strip existing trees: a desert does not keep its oaks. */
  clear?: boolean;
  color: number;
}

export const BIOME_SEEDS: Record<string, BiomeSeed> = {
  'seed-desert': { type: 'desert', moisture: 0.08, temperature: 0.85, clear: true, color: 0xe8c878 },
  'seed-savanna': { type: 'savanna', moisture: 0.3, temperature: 0.75, trees: 0.08, clear: true, color: 0xc8b860 },
  'seed-jungle': { type: 'rainforest', moisture: 0.9, temperature: 0.8, trees: 0.75, color: 0x3c9a48 },
  'seed-swamp': { type: 'swamp', moisture: 0.92, clear: true, color: 0x4f6b3a },
  'seed-tundra': { type: 'tundra', temperature: 0.12, clear: true, color: 0xc8d0c0 },
  'seed-snow': { type: 'snow', temperature: 0.04, clear: true, color: 0xf0f4f8 },
  'seed-enchanted': { type: 'enchanted_forest', moisture: 0.7, trees: 0.6, color: 0x60d0d0 },
  'seed-bloom': { type: 'bloom', moisture: 0.65, clear: true, color: 0xb8e070 },
  'seed-grass': { type: 'grassland', moisture: 0.55, temperature: 0.5, clear: true, color: 0x88c058 },
  'seed-corrupt': { type: 'corrupted', clear: true, color: 0x8040a0 },
  'seed-candy': { type: 'candy', clear: true, color: 0xf0a8c8 },
  'seed-crystal': { type: 'crystal', clear: true, color: 0x8ad8e8 },
  'seed-mushroom': { type: 'mushroom', moisture: 0.85, clear: true, color: 0x9a6aaa },
  'seed-infernal': { type: 'infernal', temperature: 0.95, clear: true, color: 0xc83a1e },
  'seed-wasteland': { type: 'wasteland', moisture: 0.1, clear: true, color: 0x8a8460 },
};

/**
 * Traits the player can hand out, one power each. WorldBox's unit window has a
 * trait editor; a brush that blesses a whole crowd with Strong is the same
 * idea at the scale this game is played at.
 */
export const TRAIT_GIFTS: Partial<Record<string, TraitId>> = {
  'gift-strong': 'strong', 'gift-swift': 'swift', 'gift-tough': 'tough', 'gift-genius': 'genius',
  'gift-immortal': 'immortal', 'gift-regeneration': 'regeneration', 'gift-lucky': 'lucky',
  'gift-giant': 'giant', 'gift-tiny': 'tiny', 'gift-fireproof': 'fireproof',
  'gift-bloodthirsty': 'bloodthirsty', 'gift-peaceful': 'peaceful',
};

/** Creatures with a spawner of their own. The four races have theirs already. */
export const SPAWNABLE: EntityType[] = [
  'wolf', 'bear', 'deer', 'rabbit', 'sheep', 'chicken', 'fox', 'snake', 'bird', 'fish',
  'cat', 'dog', 'cow', 'pig', 'crab', 'frog', 'penguin', 'turtle', 'monkey', 'rat',
  'crocodile', 'piranha', 'hyena', 'rhino', 'buffalo',
  'unicorn', 'fairy', 'ghost', 'mage', 'druid', 'alien', 'snowman',
  'dragon', 'demon', 'zombie', 'skeleton', 'elemental', 'bandit',
  'goat', 'camel', 'ostrich', 'flamingo', 'seal', 'polar_bear',
  'beetle', 'bee', 'butterfly', 'grasshopper',
  'necromancer', 'plague_doctor', 'fire_skull', 'cold_one', 'ufo',
  'sand_spider', 'acid_blob', 'lil_pumpkin', 'gummy_bear', 'crabzilla',
  'flame_tower', 'ice_tower',
  'white_mage', 'angel', 'sandworm', 'langton_ant', 'tumor', 'treant',
  'candy_man', 'jumpy_skull', 'robot_santa', 'yeti',
  'monolith', 'grey_goo',
];

const STATUS_POWERS: Record<string, { status: StatusId; color: number; persons?: boolean; line: string }> = {
  shield: { status: 'shielded', color: 0x9fd8ff, line: 'wrapped in something nothing gets through' },
  coffee: { status: 'caffeinated', color: 0x8a5a2b, line: 'suddenly very, very awake' },
  inspire: { status: 'inspired', color: 0xffe066, line: 'struck by a good idea all at once' },
  sleep: { status: 'spellbound', color: 0xb8a0ff, line: 'asleep where they stood' },
  madness: { status: 'enraged', color: 0xd03030, line: 'seized by a rage with no object' },
  confusion: { status: 'confused', color: 0xd0a0ff, line: 'no longer sure which way is up' },
  plague: { status: 'infected', color: 0x80b040, persons: true, line: 'feeling a little peaky' },
};

const DIPLOMACY: Record<string, DiplomacyAct> = {
  'diplo-spite': 'spite',
  'diplo-friendship': 'friendship',
  'diplo-whisper': 'whisper',
  'diplo-unity': 'unity',
  'diplo-discord': 'discord',
  'diplo-inspiration': 'inspiration',
};

/**
 * WorldBox's dusts of forgetting. A creature that forgets its culture is not
 * left blank for ever: the next conversation pulls it toward whoever it is
 * talking to, by the same pot that spread the culture in the first place. So
 * a dusted village does not lose its identity, it *reconverges* — sometimes on
 * the one it had, sometimes on the neighbours'.
 */
const DUSTS: Record<string, Array<'cultureId' | 'languageId' | 'religionId'>> = {
  'dust-culture': ['cultureId'],
  'dust-language': ['languageId'],
  'dust-religion': ['religionId'],
  'dust-everything': ['cultureId', 'languageId', 'religionId'],
};

const CLOUDS: Record<string, DropKind> = {
  'rain-cloud': 'rain',
  'snow-cloud': 'snow',
  'seed-cloud': 'seed',
  'thunder-cloud': 'thunder',
  'hell-cloud': 'hellfire',
  'acid-cloud': 'acid',
  'magic-cloud': 'magic',
  'blood-rain': 'rage',
  'life-cloud': 'life',
};

const BURNABLE: BiomeType[] = [
  'grassland', 'deciduous_forest', 'coniferous_forest', 'taiga', 'savanna', 'rainforest',
  'tropical_forest', 'enchanted_forest', 'bloom', 'hills', 'marsh',
];

const at = (tile: Tile) => ({ x: tile.x, y: tile.y });
const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

// -- ongoing hazards --------------------------------------------------------

interface Hazard {
  kind: 'tornado' | 'eruption' | 'geyser';
  x: number;
  y: number;
  heading: number;
  life: number;
  /** Seconds until the next thing it does. */
  beat: number;
}

/**
 * Powers that keep happening after the click: a tornado wandering across the
 * map, a volcano throwing fire for a while, a geyser spouting. Advanced on
 * simulated time from the game tick, so pausing the world pauses them too.
 */
export class PowerHazards {
  private hazards: Hazard[] = [];

  add(kind: Hazard['kind'], x: number, y: number, life: number, heading = 0): void {
    // A cap, because a player holding the mouse down on a tornado brush would
    // otherwise queue a few hundred of them.
    if (this.hazards.length >= 12) this.hazards.shift();
    this.hazards.push({ kind, x, y, heading, life, beat: 0 });
  }

  get active(): number {
    return this.hazards.length;
  }

  clear(): void {
    this.hazards = [];
  }

  update(delta: number, ctx: PowerContext): void {
    for (const hazard of this.hazards) {
      hazard.life -= delta;
      hazard.beat -= delta;
      if (hazard.kind === 'tornado') this.tornado(hazard, delta, ctx);
      else if (hazard.beat <= 0) {
        if (hazard.kind === 'eruption') this.erupt(hazard, ctx);
        else this.spout(hazard, ctx);
      }
    }
    this.hazards = this.hazards.filter(h => h.life > 0);
  }

  private tornado(hazard: Hazard, delta: number, ctx: PowerContext): void {
    // A drunkard's walk with momentum: it wanders, but it goes somewhere.
    hazard.heading += (ctx.random() - 0.5) * 2.4 * delta;
    hazard.x += Math.cos(hazard.heading) * 2.2 * delta;
    hazard.y += Math.sin(hazard.heading) * 2.2 * delta;
    const size = ctx.tiles.length;
    if (hazard.x < 1 || hazard.y < 1 || hazard.x > size - 2 || hazard.y > size - 2) {
      hazard.heading += Math.PI;
      hazard.x = Math.max(1, Math.min(size - 2, hazard.x));
      hazard.y = Math.max(1, Math.min(size - 2, hazard.y));
    }
    if (hazard.beat > 0) return;
    hazard.beat = 0.2;
    const tx = Math.floor(hazard.x);
    const ty = Math.floor(hazard.y);
    if (!ctx.inBounds(tx, ty)) return;
    const tile = ctx.tiles[tx][ty];
    ctx.fx.burst(tile, isWaterBiome(tile.type) ? 0xbfe4ff : 0xa89c8c, 14, 2.6);
    ctx.forEachBrushTile(tile, 1, (target) => {
      if (target.structure && !target.villageId) {
        target.structure = null;
        target.resources = target.resources.filter(r => r.type !== 'wood');
        ctx.sync(target);
      }
      if (target.villageId) ctx.demolishAt(target.x, target.y);
    });
    for (const victim of ctx.query(hazard.x, hazard.y, 1.4)) {
      // Picked up and put down somewhere else, slightly worse for it.
      victim.position = {
        x: Math.max(0, Math.min(size - 1, victim.position.x + (ctx.random() - 0.5) * 4)),
        y: Math.max(0, Math.min(size - 1, victim.position.y + (ctx.random() - 0.5) * 4)),
      };
    }
    ctx.damageArea(hazard.x, hazard.y, 1.4, 6);
  }

  private erupt(hazard: Hazard, ctx: PowerContext): void {
    hazard.beat = 0.7;
    const angle = ctx.random() * Math.PI * 2;
    const reach = 1.5 + ctx.random() * 4;
    const x = Math.round(hazard.x + Math.cos(angle) * reach);
    const y = Math.round(hazard.y + Math.sin(angle) * reach);
    if (!ctx.inBounds(x, y)) return;
    const target = ctx.tiles[x][y];
    addHeat(target, MELT * 0.7);
    if (BURNABLE.includes(target.type)) ctx.ignite(target);
    ctx.fx.burst(target, 0xff6a20, 18, 2.4);
    ctx.damageArea(x, y, 1, 25);
    ctx.shake(5, 0.2);
  }

  private spout(hazard: Hazard, ctx: PowerContext): void {
    hazard.beat = 1.1;
    const x = Math.round(hazard.x);
    const y = Math.round(hazard.y);
    if (!ctx.inBounds(x, y)) return;
    ctx.fx.burst(ctx.tiles[x][y], 0xe8f6ff, 26, 3.2);
  }
}

// -- the powers ------------------------------------------------------------

/**
 * Run one of the powers in this file. Returns whether it acted, or null when
 * the tool is not one of these and the engine should handle it itself.
 */
export const runExtraPower = (
  tool: string,
  tile: Tile,
  ctx: PowerContext,
  hazards: PowerHazards,
): boolean | null => {
  const brush = ctx.brushRadius;

  // -- terrain by height ---------------------------------------------------
  if (tool in TERRAIN_BRUSHES) {
    const { height, type } = TERRAIN_BRUSHES[tool as keyof typeof TERRAIN_BRUSHES];
    ctx.forEachBrushTile(tile, brush, (target) => ctx.reshape(target, height, type));
    ctx.sound.terraform(height < 0.25 ? 'water' : height > 0.8 ? 'stone' : 'soil');
    return true;
  }

  // -- biome seeds ---------------------------------------------------------
  const seed = BIOME_SEEDS[tool];
  if (seed) {
    let acted = false;
    ctx.forEachBrushTile(tile, 1 + brush, (target) => {
      if (isWaterBiome(target.type) || target.height <= 0.25 || target.villageId) return;
      acted = true;
      target.type = seed.type;
      if (seed.temperature !== undefined) target.temperature = seed.temperature;
      if (seed.moisture !== undefined) target.moisture = seed.moisture;
      if (seed.clear) target.structure = null;
      if (seed.trees && ctx.random() < seed.trees) {
        target.structure = { type: 'mature_tree', health: 100, level: 2 };
        if (!target.resources.some(r => r.type === 'wood')) {
          target.resources.push({ type: 'wood', quantity: 6, discovered: true });
        }
      }
      ctx.sync(target);
    });
    if (acted) {
      ctx.fx.burst(tile, seed.color, 16, 1.6);
      ctx.sound.terraform('forest');
    }
    return acted;
  }

  // -- weather you can aim -------------------------------------------------
  const cloud = CLOUDS[tool];
  if (cloud) {
    ctx.summonCloud(cloud, tile.x, tile.y);
    return true;
  }

  // -- statuses laid on creatures -----------------------------------------
  const spell = STATUS_POWERS[tool];
  if (spell) {
    const radius = 1 + brush;
    const touched = ctx.query(tile.x, tile.y, radius + 0.5)
      .filter(c => !spell.persons || (isSapient(c) && c.type !== 'zombie' && c.type !== 'skeleton'));
    if (touched.length === 0) return false;
    for (const creature of touched) applyStatus(creature, spell.status);
    ctx.fx.aura(tile, spell.color);
    if (spell.status === 'infected' || spell.status === 'enraged') {
      ctx.sound.curse();
      ctx.flash(spell.status === 'infected' ? 'plague' : 'blood', 0.5);
    } else {
      ctx.sound.bless();
    }
    ctx.announce(
      `${plural(touched.length, 'A creature is', 'creatures are')} ${spell.line}`,
      spell.status === 'infected' || spell.status === 'enraged' ? 'disaster' : 'divine',
      at(tile),
    );
    return true;
  }

  // -- forgetting ------------------------------------------------------------
  const dust = DUSTS[tool];
  if (dust) {
    const touched = ctx.query(tile.x, tile.y, 1.5 + brush).filter(c => isSapient(c));
    if (touched.length === 0) return false;
    for (const creature of touched) {
      for (const field of dust) creature[field] = null;
      applyStatus(creature, 'confused');
    }
    ctx.fx.aura(tile, 0xc8b8ff);
    ctx.sound.bless();
    ctx.announce(
      `${plural(touched.length, 'Somebody blinks', 'people blink')} and cannot quite remember who they were`,
      'divine',
      at(tile),
    );
    return true;
  }

  // -- diplomacy -----------------------------------------------------------
  const act = DIPLOMACY[tool];
  if (act) {
    const line = ctx.diplomacy(act, tile.x, tile.y);
    if (!line) return false;
    ctx.fx.aura(tile, act === 'friendship' || act === 'unity' ? 0xffe8a0 : 0xc04040);
    ctx.sound.click();
    return true;
  }

  // -- traits, handed out ----------------------------------------------------
  const gift = TRAIT_GIFTS[tool];
  if (gift) {
    let given = 0;
    for (const creature of ctx.query(tile.x, tile.y, 1 + brush + 0.5)) {
      if (grantTrait(creature, gift)) given += 1;
    }
    if (given === 0) return false;
    const bad = gift === 'bloodthirsty' || gift === 'tiny';
    ctx.fx.aura(tile, bad ? 0xd04040 : 0xffe080);
    if (bad) ctx.sound.curse(); else ctx.sound.bless();
    ctx.announce(`${plural(given, 'A creature is', 'creatures are')} now ${TRAITS[gift].label.toLowerCase()}`, 'divine', at(tile));
    return true;
  }

  // -- creatures, one spawner each ----------------------------------------
  if (tool.startsWith('spawn-')) {
    const type = tool.slice('spawn-'.length) as EntityType;
    if (!SPAWNABLE.includes(type)) return null;
    const wet = isWaterBiome(tile.type);
    if (isAquatic(type) !== wet && type !== 'bird') return false;
    return Boolean(ctx.spawn(type, tile.x, tile.y));
  }

  switch (tool) {
    // -- shaping -------------------------------------------------------------
    case 'sponge': {
      let acted = false;
      ctx.forEachBrushTile(tile, 1 + brush, (target) => {
        if (!isWaterBiome(target.type)) return;
        acted = true;
        ctx.reshape(target, 0.3);
      });
      if (acted) ctx.sound.terraform('soil');
      return acted;
    }

    case 'stamp-island': {
      const radius = 4 + brush * 2;
      ctx.forEachBrushTile(tile, radius, (target, distance) => {
        const edge = radius * (0.75 + ctx.random() * 0.25);
        if (distance > edge) return;
        ctx.reshape(target, Math.max(target.height, 0.3 + 0.4 * (1 - distance / radius)));
      });
      ctx.fx.burst(tile, 0x88c058, 20, 2);
      ctx.sound.terraform('soil');
      ctx.announce('Land rises out of the water, still dripping', 'divine', at(tile));
      return true;
    }

    case 'stamp-lake': {
      const radius = 2 + brush;
      ctx.forEachBrushTile(tile, radius, (target, distance) => {
        if (distance > radius * (0.8 + ctx.random() * 0.2)) return;
        ctx.reshape(target, 0.2, distance < radius * 0.5 ? 'lake' : 'shallow_water');
      });
      ctx.sound.terraform('water');
      return true;
    }

    case 'stamp-atoll': {
      const radius = 4 + brush * 2;
      ctx.forEachBrushTile(tile, radius, (target, distance) => {
        if (distance > radius) return;
        if (distance > radius - 1.4) ctx.reshape(target, 0.3, 'beach');
        else ctx.reshape(target, 0.22, 'shallow_water');
      });
      ctx.fx.burst(tile, 0xf0e0a8, 20, 2);
      ctx.sound.terraform('water');
      return true;
    }

    // -- temperature ---------------------------------------------------------
    case 'heat':
    case 'cold': {
      const sign = tool === 'heat' ? 1 : -1;
      const radius = 1 + brush;
      ctx.forEachBrushTile(tile, radius, (target, distance) => {
        addHeat(target, sign * 75 * (1 - distance / (radius + 1)));
      });
      ctx.fx.burst(tile, sign > 0 ? 0xff9040 : 0x9fd8ff, 14, 1.4);
      return true;
    }

    // -- nature's own disasters ---------------------------------------------
    case 'tornado': {
      hazards.add('tornado', tile.x + 0.5, tile.y + 0.5, 14, ctx.random() * Math.PI * 2);
      ctx.shake(6, 0.4);
      ctx.announce('A tornado drops out of a clear sky and starts walking', 'disaster', at(tile));
      return true;
    }

    case 'volcano': {
      if (isWaterBiome(tile.type) && tile.height < 0.15) return false;
      ctx.forEachBrushTile(tile, 3, (target, distance) => {
        target.structure = null;
        // Kept below the snowline: a volcano wearing a snow cap reads as a
        // painting mistake, not a mountain with a temper.
        ctx.reshape(target, Math.max(target.height, 0.78 - distance * 0.08), distance < 1.6 ? 'volcanic' : 'mountains');
      });
      addHeat(tile, MELT * 1.6);
      hazards.add('eruption', tile.x, tile.y, 12);
      ctx.sound.quake();
      ctx.shake(22, 1.2);
      ctx.flash('impact', 0.6);
      ctx.announce('The ground splits and a mountain climbs out of it, burning', 'disaster', at(tile));
      return true;
    }

    case 'geyser': {
      if (isWaterBiome(tile.type)) return false;
      ctx.reshape(tile, 0.2, 'lake');
      ctx.forEachBrushTile(tile, 2, (target) => {
        target.moisture = Math.min(1, target.moisture + 0.3);
        target.fertility = Math.min(1, target.fertility + 0.2);
        ctx.sync(target);
      });
      hazards.add('geyser', tile.x, tile.y, 10);
      ctx.sound.terraform('water');
      return true;
    }

    case 'lava': {
      let acted = false;
      ctx.forEachBrushTile(tile, brush, (target) => {
        if (isWaterBiome(target.type) && target.height < 0.15) return;
        acted = true;
        target.structure = null;
        ctx.reshape(target, Math.max(target.height, 0.3), 'volcanic');
        addHeat(target, MELT * 1.2);
      });
      if (acted) {
        ctx.fx.burst(tile, 0xff6020, 18, 1.8);
        ctx.sound.fire();
      }
      return acted;
    }

    case 'acid': {
      const radius = 1 + brush;
      ctx.forEachBrushTile(tile, radius, (target) => {
        if (isWaterBiome(target.type)) return;
        target.structure = null;
        target.resources = target.resources.filter(r => r.type !== 'wood' && r.type !== 'food');
        target.fertility = Math.max(0, target.fertility - 0.5);
        if (BURNABLE.includes(target.type)) target.type = 'badlands';
        ctx.sync(target);
      });
      const kills = ctx.damageArea(tile.x, tile.y, radius + 0.5, 35);
      ctx.fx.burst(tile, 0xa0e040, 24, 1.8);
      ctx.sound.curse();
      ctx.announce(`Acid hisses down onto (${tile.x}, ${tile.y})${kills ? ` — ${kills} dissolved` : ''}`, 'disaster', at(tile));
      return true;
    }

    // -- explosives, in order of regret ---------------------------------------
    case 'grenade':
      return explode(tile, ctx, { radius: 1.5, damage: 45, crater: 0.04, fire: 0, shake: 8, label: 'A grenade goes off' });
    case 'bomb':
      return explode(tile, ctx, { radius: 3, damage: 120, crater: 0.12, fire: 2, shake: 20, label: 'A bomb levels the ground' });
    case 'napalm': {
      const radius = 3 + brush;
      ctx.forEachBrushTile(tile, radius, (target) => {
        if (!isWaterBiome(target.type)) {
          ctx.ignite(target);
          addHeat(target, SCORCH);
        }
      });
      const kills = ctx.damageArea(tile.x, tile.y, radius, 30);
      ctx.fx.burst(tile, 0xff7020, 40, 3);
      ctx.sound.fire();
      ctx.shake(10, 0.5);
      ctx.announce(`Napalm rolls across (${tile.x}, ${tile.y})${kills ? ` — ${kills} burned` : ''}`, 'disaster', at(tile));
      return true;
    }
    case 'tsar-bomba':
    case 'atomic': {
      // The Tsar Bomba is the atomic bomb with nobody holding back.
      const radius = tool === 'tsar-bomba' ? 17 : 9;
      ctx.forEachBrushTile(tile, radius, (target, distance) => {
        const k = 1 - distance / radius;
        target.structure = null;
        if (target.villageId) ctx.demolishAt(target.x, target.y);
        ctx.reshape(target, target.height - 0.25 * k * k);
        if (!isWaterBiome(target.type)) {
          target.type = distance < radius * 0.6 ? 'ashland' : 'badlands';
          target.fertility = 0;
          ctx.sync(target);
        }
        addHeat(target, distance < 3 ? MELT : SCORCH * k);
        if (distance > radius * 0.6 && BURNABLE.includes(target.type)) ctx.ignite(target);
      });
      const kills = ctx.damageArea(tile.x, tile.y, radius + 2, 999);
      ctx.fx.shockwave(tile, 0xfff4d0, radius);
      ctx.fx.burst(tile, 0xffd080, 80, 5);
      ctx.fx.burst(tile, 0x6a5a50, 60, 3);
      ctx.sound.boom();
      ctx.shake(42, 1.8);
      ctx.flash('impact', 1);
      ctx.announce(
        tool === 'tsar-bomba'
          ? `The largest thing anyone ever built goes off over (${tile.x}, ${tile.y})${kills ? `. ${kills} gone` : ''}`
          : `A second sun opens over (${tile.x}, ${tile.y}) and closes again${kills ? `. ${kills} gone` : ''}`,
        'disaster', at(tile));
      return true;
    }
    case 'dynamite':
      return explode(tile, ctx, { radius: 1, damage: 35, crater: 0.03, fire: 0, shake: 5, label: 'A stick of dynamite goes off' });
    case 'antimatter': {
      // Not a crater: a hole in the world, which the sea fills.
      const radius = 6 + brush;
      ctx.forEachBrushTile(tile, radius, (target, distance) => {
        if (target.villageId) ctx.demolishAt(target.x, target.y);
        target.structure = null;
        ctx.reshape(target, 0.04 + (distance / radius) * 0.18, distance < radius - 1.5 ? 'deep_ocean' : 'ocean');
      });
      const kills = ctx.damageArea(tile.x, tile.y, radius + 1, 999);
      ctx.fx.shockwave(tile, 0xe0d0ff, radius + 2);
      ctx.fx.burst(tile, 0xffffff, 60, 4);
      ctx.sound.boom();
      ctx.shake(36, 1.4);
      ctx.flash('divine', 0.9);
      ctx.announce(`Matter meets its opposite at (${tile.x}, ${tile.y}), and the sea pours into the hole${kills ? `. ${kills} gone` : ''}`, 'disaster', at(tile));
      return true;
    }
    case 'heat-ray': {
      const radius = 1.5 + brush;
      ctx.forEachBrushTile(tile, Math.ceil(radius), (target, distance) => {
        if (distance > radius) return;
        addHeat(target, distance < 1 ? MELT : SCORCH);
        if (BURNABLE.includes(target.type)) ctx.ignite(target);
      });
      const kills = ctx.damageArea(tile.x, tile.y, radius + 0.5, 70);
      ctx.fx.shockwave(tile, 0xff4020, radius + 1);
      ctx.fx.burst(tile, 0xff8040, 24, 2);
      ctx.sound.fire();
      ctx.flash('impact', 0.3);
      ctx.announce(`A beam of heat comes down on (${tile.x}, ${tile.y})${kills ? ` — ${kills} burned away` : ''}`, 'disaster', at(tile));
      return true;
    }

    // -- editing tools ---------------------------------------------------------
    case 'pickaxe': {
      let acted = false;
      ctx.forEachBrushTile(tile, brush, (target) => {
        if (target.height < 0.62 || isWaterBiome(target.type)) return;
        acted = true;
        target.structure = null;
        ctx.reshape(target, Math.max(0.5, target.height - 0.15));
      });
      if (acted) ctx.sound.terraform('stone');
      return acted;
    }
    case 'spade': {
      let acted = false;
      ctx.forEachBrushTile(tile, brush, (target) => {
        if (isWaterBiome(target.type) || target.villageId) return;
        acted = true;
        target.structure = null;
        ctx.reshape(target, 0.45, 'grassland');
      });
      if (acted) ctx.sound.terraform('soil');
      return acted;
    }
    case 'sickle': {
      let cut = 0;
      ctx.forEachBrushTile(tile, 1 + brush, (target) => {
        const kind = target.structure?.type;
        if (kind !== 'bush' && kind !== 'sapling' && kind !== 'young_tree') return;
        target.structure = null;
        ctx.sync(target);
        cut += 1;
      });
      if (cut > 0) ctx.sound.terraform('forest');
      return cut > 0;
    }
    case 'wall-stone':
    case 'wall-wood': {
      let built = 0;
      ctx.forEachBrushTile(tile, brush, (target) => {
        if (isWaterBiome(target.type) || target.villageId) return;
        target.structure = { type: 'wall', health: tool === 'wall-stone' ? 400 : 160, level: tool === 'wall-stone' ? 1 : 2 };
        target.walkable = false;
        ctx.sync(target);
        built += 1;
      });
      if (built > 0) ctx.sound.terraform('stone');
      return built > 0;
    }
    case 'stamp-maze':
    case 'stamp-spiral':
    case 'stamp-fort': {
      const pattern = PRINTS[tool];
      const half = Math.floor(pattern.length / 2);
      let drew = false;
      pattern.forEach((row, py) => {
        for (let px = 0; px < row.length; px++) {
          const x = tile.x + px - half;
          const y = tile.y + py - half;
          if (!ctx.inBounds(x, y)) continue;
          const target = ctx.tiles[x][y];
          if (target.villageId) continue;
          const cell = row[px];
          if (cell === '#') { target.structure = null; ctx.reshape(target, 0.88, 'mountains'); drew = true; }
          else if (cell === '~') { target.structure = null; ctx.reshape(target, 0.2, 'shallow_water'); drew = true; }
          else if (cell === '.') { target.structure = null; ctx.reshape(target, 0.45, 'grassland'); drew = true; }
        }
      });
      if (drew) {
        ctx.sound.terraform('stone');
        ctx.fx.burst(tile, 0xd0c8b0, 20, 2);
      }
      return drew;
    }
    case 'void-bomb': {
      const radius = 4 + brush;
      ctx.forEachBrushTile(tile, radius, (target, distance) => {
        if (target.villageId) ctx.demolishAt(target.x, target.y);
        target.structure = null;
        ctx.reshape(target, 0.05 + distance * 0.02, distance < radius - 1 ? 'deep_ocean' : 'ocean');
      });
      const kills = ctx.damageArea(tile.x, tile.y, radius, 999);
      ctx.fx.shockwave(tile, 0x9070ff, radius);
      ctx.sound.boom();
      ctx.shake(30, 1);
      ctx.flash('plague', 0.8);
      ctx.announce(`A piece of the world is simply no longer there${kills ? `, nor are ${kills} who stood on it` : ''}`, 'disaster', at(tile));
      return true;
    }

    // -- mercy ---------------------------------------------------------------
    case 'divine-light': {
      const radius = 2 + brush;
      const touched = ctx.query(tile.x, tile.y, radius + 0.5);
      const healed = ctx.healArea(tile.x, tile.y, radius + 0.5, 60);
      let calmed = 0;
      for (const creature of touched) {
        for (const bad of ['infected', 'enraged', 'confused', 'cursed', 'furious'] as StatusId[]) {
          clearStatus(creature, bad);
        }
        calmed += ctx.cancelPlotsBy(creature.id);
      }
      ctx.forEachBrushTile(tile, radius, (target) => {
        if (target.isOnFire) ctx.extinguish(target);
      });
      ctx.fx.aura(tile, 0xfff8d0);
      ctx.sound.bless();
      ctx.flash('divine', 0.6);
      ctx.announce(
        `Light falls on (${tile.x}, ${tile.y})${healed ? `: ${healed} mended` : ''}${calmed ? `, ${calmed} schemes forgotten` : ''}`,
        'divine',
        at(tile),
      );
      return true;
    }

    case 'trait-eraser': {
      let wiped = 0;
      for (const creature of ctx.query(tile.x, tile.y, 1 + brush + 0.5)) {
        if ((creature.traits?.length ?? 0) === 0) continue;
        // Stats stay where the traits left them; only the nature is forgotten,
        // so its children are born plain.
        creature.traits = [];
        wiped += 1;
      }
      if (wiped === 0) return false;
      ctx.fx.aura(tile, 0xd8d8e8);
      ctx.sound.click();
      ctx.announce(`${plural(wiped, 'A creature forgets', 'creatures forget')} what made them unusual`, 'divine', at(tile));
      return true;
    }

    case 'gift-arms': {
      let armed = 0;
      for (const creature of ctx.query(tile.x, tile.y, 1.5 + brush)) {
        if (!wieldsGear(creature.type) || creature.health <= 0) continue;
        const slot = creature.equipment?.weapon ? 'armor' : 'weapon';
        if (creature.equipment?.weapon && creature.equipment?.armor) continue;
        const item = forgeItem(slot, 4, creature.type, 'the heavens', ctx.random);
        equip(creature, item);
        armed += 1;
        if (item.name) ctx.announce(`${creature.name} catches ${describeItem(item)} as it falls from the sky`, 'divine', at(tile));
      }
      if (armed === 0) return false;
      ctx.fx.burst(tile, 0xd0d8e8, 24, 1.8);
      ctx.sound.bless();
      ctx.announce(`Weapons rain down on (${tile.x}, ${tile.y}): ${armed} armed`, 'divine', at(tile));
      return true;
    }

    case 'gold-rain': {
      const touched = ctx.query(tile.x, tile.y, 1.5 + brush).filter(c => isSapient(c));
      if (touched.length === 0) return false;
      for (const creature of touched) creature.coins = (creature.coins ?? 0) + 25;
      ctx.fx.burst(tile, 0xffd040, 30, 1.6);
      ctx.sound.bless();
      ctx.announce(`Gold falls like rain on ${plural(touched.length, 'a lucky soul', 'lucky souls')}`, 'divine', at(tile));
      return true;
    }

    case 'youth': {
      let restored = 0;
      for (const creature of ctx.query(tile.x, tile.y, 1 + brush + 0.5)) {
        const young = creature.maxAge * 0.2;
        if (creature.age <= young) continue;
        creature.age = young;
        creature.health = creature.maxHealth;
        restored += 1;
      }
      if (restored === 0) return false;
      ctx.fx.aura(tile, 0x9fffe0);
      ctx.sound.bless();
      ctx.announce(`${plural(restored, 'A creature wakes', 'creatures wake')} young again`, 'divine', at(tile));
      return true;
    }

    case 'love-potion': {
      const singles = ctx.query(tile.x, tile.y, 2 + brush).filter(c => isSapient(c) && !c.loverId && c.age > c.maxAge * 0.15);
      let pairs = 0;
      const taken = new Set<string>();
      for (const a of singles) {
        if (taken.has(a.id)) continue;
        const b = singles.find(o => o.id !== a.id && !taken.has(o.id) && o.type === a.type);
        if (!b) continue;
        a.loverId = b.id;
        b.loverId = a.id;
        applyStatus(a, 'in_love');
        applyStatus(b, 'in_love');
        taken.add(a.id).add(b.id);
        pairs += 1;
      }
      if (pairs === 0) return false;
      ctx.fx.aura(tile, 0xff80b0);
      ctx.sound.bless();
      ctx.announce(`${plural(pairs, 'A pair falls', 'pairs fall')} in love at first sight`, 'divine', at(tile));
      return true;
    }

    case 'swarm': {
      if (isWaterBiome(tile.type)) return false;
      let made = 0;
      for (let i = 0; i < 10 + brush * 4; i++) {
        const x = tile.x + Math.round((ctx.random() - 0.5) * 4);
        const y = tile.y + Math.round((ctx.random() - 0.5) * 4);
        if (!ctx.inBounds(x, y)) continue;
        if (ctx.spawn('grasshopper', x, y)) made += 1;
      }
      // A swarm strips the green: farmland and meadow lose their richness.
      ctx.forEachBrushTile(tile, 2 + brush, (target) => {
        target.fertility = Math.max(0, target.fertility - 0.25);
      });
      ctx.sound.curse();
      ctx.announce(`A cloud of locusts settles on (${tile.x}, ${tile.y})${made ? '' : ', and finds nothing to eat'}`, 'disaster', at(tile));
      return true;
    }

    case 'cluster-bomb': {
      const count = 5 + brush * 2;
      for (let i = 0; i < count; i++) {
        const x = tile.x + Math.round((ctx.random() - 0.5) * 8);
        const y = tile.y + Math.round((ctx.random() - 0.5) * 8);
        if (!ctx.inBounds(x, y)) continue;
        explode(ctx.tiles[x][y], ctx, { radius: 1.2, damage: 50, crater: 0.03, fire: 1, shake: 6, label: '', quiet: true });
      }
      ctx.shake(18, 0.8);
      ctx.announce(`A cluster bomb scatters fire across (${tile.x}, ${tile.y})`, 'disaster', at(tile));
      return true;
    }

    case 'clone': {
      const originals = ctx.query(tile.x, tile.y, 1 + brush).slice(0, 8);
      if (originals.length === 0) return false;
      let made = 0;
      for (const original of originals) {
        const copy = ctx.spawn(original.type, original.position.x + 0.4, original.position.y + 0.4, original.subspecies ?? null);
        if (copy) made += 1;
      }
      if (made === 0) return false;
      ctx.fx.aura(tile, 0x9fffd0);
      ctx.sound.bless();
      ctx.announce(`${plural(made, 'A creature finds', 'creatures find')} a second of itself standing beside it`, 'divine', at(tile));
      return true;
    }

    default:
      return null;
  }
};

/**
 * The printer: whole landscapes stamped in one click. `#` is mountain, `~`
 * shallow water, `.` cleared grass, and a space leaves the ground alone.
 * WorldBox's printer powers are pure toys; so are these.
 */
const PRINTS: Record<string, string[]> = {
  'stamp-maze': [
    '#################',
    '#.......#.......#',
    '#.#####.#.#####.#',
    '#.#...#...#...#.#',
    '#.#.#.#####.#.#.#',
    '#...#.......#...#',
    '###.#########.###',
    '#...#.......#...#',
    '#.###.#.#.#.###.#',
    '#.....#...#.....#',
    '#.#####.#.#####.#',
    '#.#.....#.....#.#',
    '#.#.#########.#.#',
    '#...#.......#...#',
    '#.###.#####.###.#',
    '#.......#........',
    '#################',
  ],
  'stamp-spiral': [
    '~~~~~~~~~~~~~~~',
    '~.............~',
    '~.~~~~~~~~~~~.~',
    '~.~.........~.~',
    '~.~.~~~~~~~.~.~',
    '~.~.~.....~.~.~',
    '~.~.~.~~~.~.~.~',
    '~.~.~.~.~.~.~.~',
    '~.~.~...~.~.~.~',
    '~.~.~~~~~.~.~.~',
    '~.~.......~.~.~',
    '~.~~~~~~~~~.~.~',
    '~...........~.~',
    '~~~~~~~~~~~~~.~',
    '..............~',
  ],
  'stamp-fort': [
    '      ~~~~~      ',
    '    ~~~###~~~    ',
    '   ~~##...##~~   ',
    '  ~~#.......#~~  ',
    ' ~~#.........#~~ ',
    ' ~#...........#~ ',
    '~~#...........#~~',
    '~#.............#~',
    '~#.............#~',
    '~#.............#~',
    '~~#...........#~~',
    ' ~#...........#~ ',
    ' ~~#.........#~~ ',
    '  ~~#.......#~~  ',
    '   ~~##...##~~   ',
    '    ~~~#.#~~~    ',
    '      ~~.~~      ',
  ],
};

interface Blast {
  radius: number;
  damage: number;
  crater: number;
  /** Radius within which flammable ground catches. */
  fire: number;
  shake: number;
  label: string;
  /** Leave the chronicle alone: a cluster of blasts writes one line, not six. */
  quiet?: boolean;
}

const explode = (tile: Tile, ctx: PowerContext, blast: Blast): boolean => {
  ctx.forEachBrushTile(tile, Math.ceil(blast.radius), (target, distance) => {
    if (distance > blast.radius) return;
    target.structure = null;
    if (target.villageId) ctx.demolishAt(target.x, target.y);
    ctx.reshape(target, target.height - blast.crater * (1 - distance / (blast.radius + 1)));
    if (distance <= blast.fire && BURNABLE.includes(target.type)) ctx.ignite(target);
  });
  const kills = ctx.damageArea(tile.x, tile.y, blast.radius + 0.5, blast.damage);
  ctx.fx.burst(tile, 0xffb040, Math.round(20 + blast.radius * 10), 2 + blast.radius * 0.6);
  ctx.fx.shockwave(tile, 0xffe0a0, blast.radius + 1);
  ctx.sound.boom();
  ctx.shake(blast.shake, 0.5);
  if (blast.radius >= 3) ctx.flash('impact', 0.6);
  if (blast.quiet) return true;
  ctx.announce(`${blast.label} at (${tile.x}, ${tile.y})${kills ? ` — ${kills} killed` : ''}`, 'disaster', at(tile));
  return true;
};
