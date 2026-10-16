import { setTileBiome } from '../../utils/pathfinding';
import type { RefObject } from 'react';
import * as THREE from 'three';

import { useGameStore } from '../../store/gameStore';
import { determineBiome } from '../../utils/worldGenerator';
import { MELT, addHeat } from '../../utils/thermal';
import type { DropKind } from '../../utils/clouds';
import { FLASH_SECONDS } from '../../utils/statusEffects';
import { BORN_SAPIENT } from '../../utils/entitySystemMinimal';
import { isWaterBiome, type EntityType, type Tile } from '../../types/world';
import type { EntityManager } from '../../utils/entityManagerMinimal';
import type { EffectsManager } from '../../utils/effectsManager';
import type { SettlementSystem } from '../../utils/settlementSystem';
import { FLAMMABLE_BIOMES, type FireSystem } from '../../utils/fireSystem';
import { chronicle, toll } from '../../utils/chronicle';
import { applyScenario, type Scenario } from '../../utils/scenarios';
import { requestFlash, requestShake } from '../../utils/impactBridge';
import { magnetDrop, magnetHolding, magnetPickUp } from '../../utils/magnet';
import { runExtraPower, type PowerContext, type PowerHazards } from '../../utils/extraPowers';
import { soundManager, type TerraformVoice } from '../../utils/soundManager';
import { random } from '../../utils/random';

/**
 * Everything a god power may touch. The hook builds one of these per call;
 * the refs are the hook's own, so reading `.current` here sees live state.
 */
export interface ToolEffectContext {
  entityManagerRef: RefObject<EntityManager | null>;
  effectsManagerRef: RefObject<EffectsManager | null>;
  settlementRef: RefObject<SettlementSystem | null>;
  fireRef: RefObject<FireSystem | null>;
  hazardsRef: RefObject<PowerHazards>;
  forEachBrushTile: (center: Tile, radius: number, fn: (tile: Tile, distance: number) => void) => void;
  reshapeTile: (tile: Tile, height: number, type?: Tile['type']) => void;
  igniteTile: (tile: Tile) => void;
  extinguishTile: (tile: Tile, burned: boolean) => void;
  syncTile: (tile: Tile) => void;
  tileWorldPosition: (tile: Tile) => THREE.Vector3;
  spawnRace: (tile: Tile, type: EntityType) => boolean;
  spawnableAnimalsFor: (tile: Tile) => EntityType[];
  reactNearby: (tile: Tile, radius: number, scenario: Scenario) => void;
  summonCloud: (kind: DropKind, x: number, y: number) => void;
  inBounds: (x: number, y: number) => boolean;
  powerContext: () => PowerContext;
}


/**
 * Which material a tile sounds like under the brush.
 *
 * Grouped by what the ear expects rather than by biome family: mesa and
 * badlands are stone even though they are technically dry soil, because they
 * look like rock.
 */
const terraformVoiceFor = (tile: Tile): TerraformVoice => {
  if (isWaterBiome(tile.type)) return 'water';
  if (tile.type === 'beach' || tile.type === 'desert') return 'sand';
  if (tile.type.includes('forest') || tile.type === 'taiga') return 'forest';
  if (
    tile.type === 'mountains' || tile.type === 'hills'
    || tile.type === 'mesa' || tile.type === 'badlands' || tile.type === 'volcanic'
  ) return 'stone';
  return 'soil';
};

/** Tools that paint an area and therefore honour the brush size. */
export const BRUSH_TOOLS = new Set([
  'raise-terrain', 'lower-terrain', 'place-water', 'place-mountain',
  'place-forest', 'plant-trees', 'unearth-minerals', 'fire',
]);

/**
 * Apply one god power to a tile. Returns whether it actually did something.
 */
export function applyToolEffect(ctx: ToolEffectContext, tile: Tile, tool: string | null): boolean {
  const {
    entityManagerRef,
    effectsManagerRef,
    settlementRef,
    fireRef,
    hazardsRef,
    forEachBrushTile,
    reshapeTile,
    igniteTile,
    extinguishTile,
    syncTile,
    tileWorldPosition,
    spawnRace,
    spawnableAnimalsFor,
    reactNearby,
    summonCloud,
    inBounds,
    powerContext,
  } = ctx;
  if (!tile || !tool) return false;
  const store = useGameStore.getState();
  const radius = BRUSH_TOOLS.has(tool) ? store.brushRadius : 0;
  // Powers report whether they actually did something, so a refused click can
  // say so instead of looking like a broken game.
  let acted = true;

  switch (tool) {
    case 'raise-terrain':
      forEachBrushTile(tile, radius, (target, distance) => {
        const amount = 0.1 * (1 - distance / (radius + 1));
        if (target.height < 0.98) reshapeTile(target, target.height + amount);
      });
      // The voice comes from the ground actually under the brush, so dragging
      // across a coastline audibly changes material. That is the whole point
      // of having more than one — a fixed voice would just be a second click.
      soundManager.terraform(terraformVoiceFor(tile));
      break;

    case 'lower-terrain':
      forEachBrushTile(tile, radius, (target, distance) => {
        const amount = 0.1 * (1 - distance / (radius + 1));
        if (target.height > 0.02) reshapeTile(target, target.height - amount);
      });
      soundManager.terraform(terraformVoiceFor(tile));
      break;

    case 'place-water':
      forEachBrushTile(tile, radius, (target) => {
        if (target.height > 0.1) reshapeTile(target, 0.24, 'shallow_water');
      });
      soundManager.terraform('water');
      break;

    case 'place-mountain':
      forEachBrushTile(tile, radius, (target, distance) => {
        reshapeTile(target, 0.9 - distance * 0.12, 'mountains');
      });
      soundManager.terraform('stone');
      break;

    case 'place-forest':
    case 'plant-trees':
      acted = false;
      forEachBrushTile(tile, radius, (target) => {
        if (target.height <= 0.28 || target.height >= 0.78 || isWaterBiome(target.type)) return;
        acted = true;
        setTileBiome(target, target.temperature < 0.32 ? 'coniferous_forest' : 'deciduous_forest');
        target.structure = { type: 'mature_tree', health: 100, level: 2 };
        if (!target.resources.some(r => r.type === 'wood')) {
          target.resources.push({ type: 'wood', quantity: 6, discovered: true });
        }
        if (!target.resources.some(r => r.type === 'food')) {
          target.resources.push({ type: 'food', quantity: 4, discovered: true });
        }
        syncTile(target);
      });
      if (!acted) break;
      effectsManagerRef.current?.spawnBurst(tileWorldPosition(tile), 0x55cc55, 14, 1.5);
      soundManager.terraform('forest');
      break;

    case 'spawn-human': acted = spawnRace(tile, 'human'); break;
    case 'spawn-elf': acted = spawnRace(tile, 'elf'); break;
    case 'spawn-dwarf': acted = spawnRace(tile, 'dwarf'); break;
    case 'spawn-orc': acted = spawnRace(tile, 'orc'); break;

    case 'uplift': {
      // One power, both directions. Making waking and un-waking two separate
      // buttons would be two entries on a bar that is already long, and it
      // would hide the thing that makes this interesting — that it is
      // reversible, and that you can take it back.
      const radius = 1 + store.brushRadius;
      const near = entityManagerRef.current?.query(tile.x, tile.y, radius) ?? [];
      const animals = near.filter(creature => !BORN_SAPIENT.has(creature.type));
      if (animals.length === 0) { acted = false; break; }

      // Whichever way the majority needs to go, so a second click on the
      // same spot undoes the first rather than flickering half of them.
      const woken = animals.filter(creature => creature.uplifted).length;
      const waking = woken * 2 < animals.length;
      for (const creature of animals) {
        creature.uplifted = waking;
        if (waking && !creature.happiness) creature.happiness = 0;
        creature.flashFor = FLASH_SECONDS;
      }
      effectsManagerRef.current?.spawnAura(tileWorldPosition(tile), waking ? 0x9fe8ff : 0x8f7a5a);
      soundManager.bless();
      store.addEvent(
        waking
          ? `${animals.length === 1 ? 'A creature wakes' : `${animals.length} creatures wake`} into something that can wonder about it`
          : `${animals.length === 1 ? 'A mind is' : `${animals.length} minds are`} laid gently back down`,
        'divine',
        { x: tile.x, y: tile.y },
      );
      break;
    }

    case 'spawn-animal': {
      const candidates = spawnableAnimalsFor(tile);
      const chosen = candidates[Math.floor(random() * candidates.length)];
      acted = Boolean(entityManagerRef.current?.spawnEntity(chosen, tile.x, tile.y));
      break;
    }

    case 'spawn-monster': {
      let monsterType: EntityType;
      if (tile.type === 'volcanic' || tile.type === 'infernal') monsterType = random() < 0.5 ? 'dragon' : random() < 0.5 ? 'demon' : 'fire_skull';
      else if (tile.type === 'corrupted') monsterType = random() < 0.4 ? 'zombie' : random() < 0.5 ? 'skeleton' : 'necromancer';
      else if (['snow', 'tundra', 'ice', 'glacier'].includes(tile.type)) monsterType = 'cold_one';
      else if (tile.type === 'desert') monsterType = 'sand_spider';
      else if (tile.height > 0.7) monsterType = 'dragon';
      else {
        const monsters: EntityType[] = ['zombie', 'skeleton', 'demon', 'bandit', 'ghost', 'mage', 'alien', 'acid_blob', 'fire_skull', 'necromancer'];
        monsterType = monsters[Math.floor(random() * monsters.length)];
      }
      acted = Boolean(entityManagerRef.current?.spawnEntity(monsterType, tile.x, tile.y));
      break;
    }

    case 'unearth-minerals': {
      const mineralTypes = ['iron', 'gold', 'stone', 'coal', 'gem'] as const;
      forEachBrushTile(tile, radius, (target) => {
        const mineral = mineralTypes[Math.floor(random() * mineralTypes.length)];
        target.resources.push({
          type: mineral,
          quantity: 5 + Math.floor(random() * 10),
          discovered: true,
        });
      });
      effectsManagerRef.current?.spawnBurst(tileWorldPosition(tile), 0xffdd55, 16, 2);
      store.addEvent(`A vein of ore surfaced at (${tile.x}, ${tile.y})`, 'divine', { x: tile.x, y: tile.y });
      break;
    }

    case 'summon-rain': {
      if (store.weather === 'clear') {
        store.setWeather('rain');
        store.addEvent('Rain begins to fall across the land', 'divine');
      } else {
        store.setWeather('clear');
        store.addEvent('The skies clear', 'divine');
      }
      break;
    }

    case 'fire': {
      acted = false;
      forEachBrushTile(tile, radius, (target) => {
        if (fireRef.current?.ignite(target)) acted = true;
      });
      if (!acted) break;
      soundManager.fire();
      store.addEvent(`Divine fire ignites (${tile.x}, ${tile.y})`, 'disaster', { x: tile.x, y: tile.y });
      break;
    }

    case 'earthquake': {
      const quakeRadius = 4 + store.brushRadius * 2;
      forEachBrushTile(tile, quakeRadius, (target, distance) => {
        const shift = (random() - 0.5) * 0.25 * (1 - distance / quakeRadius);
        target.structure = null;
        reshapeTile(target, target.height + shift);
      });
      const kills = entityManagerRef.current?.damageArea(tile.x, tile.y, quakeRadius, 35) ?? 0;
      requestShake(18 + store.brushRadius * 8, 1.1);
      effectsManagerRef.current?.spawnShockwave(tileWorldPosition(tile), 0xaa8855, 6);
      soundManager.earthquake();
      store.addEvent(
        chronicle('quake') + toll('dead', kills),
        'disaster',
        { x: tile.x, y: tile.y },
      );
      break;
    }

    case 'meteor': {
      const impact = tileWorldPosition(tile);
      const craterRadius = 3 + store.brushRadius;
      effectsManagerRef.current?.spawnMeteor(impact, () => {
        forEachBrushTile(tile, craterRadius, (target, distance) => {
          target.structure = null;
          const drop = 0.3 * (1 - distance / craterRadius);
          reshapeTile(target, target.height - drop, distance < 1.5 ? 'volcanic' : undefined);
          if (distance < 2.2 && FLAMMABLE_BIOMES.includes(target.type)) igniteTile(target);
          // Heat, dumped in rather than applied: the thermal ladder then
          // decides what that means for each tile, so the crater cooks its
          // way outward over the following seconds and cools back over the
          // following minutes without any of that being written here.
          //
          // This is the only source in the game that arrives all at once and
          // can therefore reach the top rung. A fire settles below it by
          // design; a meteor is supposed to leave lava behind.
          addHeat(target, MELT * 1.4 * (1 - distance / (craterRadius + 1)));
        });
        const kills = entityManagerRef.current?.damageArea(tile.x, tile.y, craterRadius + 1, 80) ?? 0;
        soundManager.meteor();
        // Scaled to the crater, so a 5x5 meteor lands harder than a 1x1
        requestShake(26 + store.brushRadius * 10, 0.7);
        requestFlash('impact', 0.9);
        store.addEvent(
          chronicle('meteor') + toll('dead', kills),
          'disaster',
          { x: tile.x, y: tile.y },
        );
      });
      break;
    }

    case 'lightning': {
      effectsManagerRef.current?.spawnLightning(tileWorldPosition(tile));
      soundManager.lightning();
      requestShake(9, 0.3);
      requestFlash('impact', 0.55);
      const kills = entityManagerRef.current?.damageArea(tile.x, tile.y, 1.2, 60) ?? 0;
      if (FLAMMABLE_BIOMES.includes(tile.type) && random() < 0.6) igniteTile(tile);
      store.addEvent(
        chronicle('lightning') + toll('slain', kills),
        'disaster',
        { x: tile.x, y: tile.y },
      );
      break;
    }

    case 'blessing': {
      const blessRadius = 3 + store.brushRadius;
      const healed = entityManagerRef.current?.healArea(tile.x, tile.y, blessRadius + 1, 50) ?? 0;
      forEachBrushTile(tile, blessRadius, (target) => {
        target.fertility = Math.min(1, target.fertility + 0.3);
        if (target.type === 'corrupted' || target.type === 'badlands') {
          setTileBiome(target, determineBiome(target.height, target.moisture, target.temperature));
        }
        if (target.isOnFire) extinguishTile(target, false);
        if (random() < 0.35 && target.height > 0.25 && !target.resources.some(r => r.type === 'food')) {
          target.resources.push({ type: 'food', quantity: 5, discovered: true });
        }
        syncTile(target);
      });
      effectsManagerRef.current?.spawnAura(tileWorldPosition(tile), 0xffee88);
      // ...and a cloud that stays behind afterwards. The flash is the act;
      // the cloud is the consequence, and it is the part that is worth
      // watching — it drifts, it keeps working, and the people under it can
      // walk out from under it.
      summonCloud('blessing', tile.x, tile.y);
      soundManager.bless();
      reactNearby(tile, blessRadius, 'blessed');
      // Divine light is the non-violent way to stop a scheme. Without a way
      // to intervene, a plot is a countdown rather than a decision.
      {
        const settled = entityManagerRef.current?.query(tile.x, tile.y, blessRadius + 1) ?? [];
        let calmed = 0;
        for (const witness of settled) {
          calmed += settlementRef.current?.cancelPlotsBy(witness.id, 'blessed') ?? 0;
        }
        if (calmed > 0) requestFlash('divine', 0.7);
      }
      requestFlash('divine', 0.5);
      store.addEvent(
        chronicle('blessing') + toll('healed', healed),
        'divine',
        { x: tile.x, y: tile.y },
      );
      break;
    }

    // -- erasers ------------------------------------------------------
    //
    // Every creative power in this switch needed an inverse. Building
    // something you cannot unbuild makes a sandbox feel like a form you are
    // filling in rather than a place you are shaping.

    case 'erase-forest': {
      acted = false;
      forEachBrushTile(tile, radius, (target) => {
        if (!target.structure && !target.resources.some(r => r.type === 'wood')) return;
        acted = true;
        target.structure = null;
        target.resources = target.resources.filter(r => r.type !== 'wood');
        if (target.type.includes('forest') || target.type === 'taiga') {
          // Back to whatever the climate would have grown without trees.
          setTileBiome(target, target.moisture > 0.55 ? 'grassland' : 'savanna');
        }
        syncTile(target);
      });
      if (acted) soundManager.uiClick();
      break;
    }

    case 'erase-buildings': {
      acted = false;
      forEachBrushTile(tile, radius, (target) => {
        if (!target.villageId && !target.structure) return;
        acted = true;
        // The settlement system owns village tiles, so ask it to let go
        // rather than clearing the tile behind its back and leaving it with
        // a building it still believes in.
        settlementRef.current?.demolishAt(target.x, target.y);
        target.structure = null;
        syncTile(target);
      });
      if (acted) {
        effectsManagerRef.current?.spawnBurst(tileWorldPosition(tile), 0x9aa4b5, 14, 1.6);
        requestShake(6, 0.25);
      }
      break;
    }

    case 'douse': {
      acted = false;
      forEachBrushTile(tile, radius + 1, (target) => {
        if (!target.isOnFire) return;
        acted = true;
        extinguishTile(target, false);
      });
      if (acted) {
        effectsManagerRef.current?.spawnBurst(tileWorldPosition(tile), 0x8ec5ff, 18, 1.8);
        soundManager.uiClick();
      }
      break;
    }

    case 'erase-life': {
      const doomed = entityManagerRef.current?.query(tile.x, tile.y, radius + 0.8) ?? [];
      if (doomed.length === 0) return false;
      for (const victim of doomed) {
        // Erased, not killed: no chronicle entry, no grief, no statistics.
        // That distinction is the whole character of the tool.
        entityManagerRef.current?.eraseEntity(victim);
      }
      effectsManagerRef.current?.spawnBurst(tileWorldPosition(tile), 0xd8b4fe, 12, 1.4);
      break;
    }

    case 'poke': {
      // WorldBox's sharpest bit of writing is that the player is *felt*. A
      // creature prodded by something enormous and unseen does not shrug it
      // off, and it cannot name what did it. One point of damage; eighteen
      // points of mood.
      const victims = entityManagerRef.current?.query(tile.x, tile.y, 1.2) ?? [];
      if (victims.length === 0) return false;
      for (const victim of victims) {
        victim.health = Math.max(1, victim.health - 1);
        applyScenario(victim, 'poked');
      }
      soundManager.uiClick();
      break;
    }

    case 'curse': {
      const curseRadius = 3 + store.brushRadius;
      forEachBrushTile(tile, curseRadius, (target) => {
        if (target.height <= 0.25) return;
        setTileBiome(target, 'corrupted');
        target.fertility = Math.max(0, target.fertility - 0.5);
        target.structure = null;
        syncTile(target);
      });
      const kills = entityManagerRef.current?.damageArea(tile.x, tile.y, curseRadius, 25) ?? 0;
      effectsManagerRef.current?.spawnAura(tileWorldPosition(tile), 0x9922cc);
      summonCloud('plague', tile.x, tile.y);
      soundManager.curse();
      reactNearby(tile, curseRadius, 'cursed');
      requestFlash('plague', 0.7);
      store.addEvent(
        chronicle('curse') + toll('claimed', kills),
        'disaster',
        { x: tile.x, y: tile.y },
      );
      break;
    }
    case 'magnet': {
      const manager = entityManagerRef.current;
      if (!manager) break;
      if (magnetHolding().length === 0) {
        const lifted = magnetPickUp(manager.query(tile.x + 0.5, tile.y + 0.5, 1.5 + store.brushRadius));
        acted = lifted > 0;
        if (acted) soundManager.uiClick();
      } else {
        const dropped = magnetDrop(tile.x + 0.5, tile.y + 0.5, (id) => manager.getEntityById(id), inBounds);
        acted = dropped.length > 0;
        if (acted) {
          effectsManagerRef.current?.spawnBurst(tileWorldPosition(tile), 0xe8e0ff, 10, 1);
          soundManager.uiClick();
        }
      }
      break;
    }
    default: {
      const result = runExtraPower(tool, tile, powerContext(), hazardsRef.current);
      acted = result === true;
      break;
    }
  }

  if (!acted) {
    effectsManagerRef.current?.spawnRefusal(tileWorldPosition(tile));
    soundManager.refused();
  }
  return acted;
}
