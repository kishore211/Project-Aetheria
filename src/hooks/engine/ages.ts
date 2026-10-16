import type { RefObject } from 'react';

import { useGameStore } from '../../store/gameStore';
import { isWaterBiome, type Tile } from '../../types/world';
import type { EntityManager } from '../../utils/entityManagerMinimal';
import type { FireSystem } from '../../utils/fireSystem';
import { applyScenario } from '../../utils/scenarios';
import { requestFlash } from '../../utils/impactBridge';
import { nudgeMood } from '../../utils/mood';
import { AGES, AGE_LENGTH, nextAge, type AgeAction } from '../../utils/ages';
import { ageBridge } from '../../utils/ageBridge';

/** What an age's world-altering action reads and writes. */
export interface AgeActionContext {
  tilesRef: RefObject<Tile[][]>;
  fireRef: RefObject<FireSystem | null>;
  entityManagerRef: RefObject<EntityManager | null>;
  syncTile: (tile: Tile) => void;
  extinguishTile: (tile: Tile, burned: boolean) => void;
}

/** What the age clock reads and writes: its own countdowns, and the living population. */
export interface AgeClockContext {
  entityManagerRef: RefObject<EntityManager | null>;
  ageTimerRef: RefObject<number>;
  ageActionTimerRef: RefObject<number>;
  ageSlotRef: RefObject<number>;
  runAgeAction: (action: AgeAction) => void;
}


/**
 * Do whatever the current era does to the world.
 *
 * These are the reason an age matters rather than merely tinting the screen.
 * Each is deliberately small and frequent instead of one large event: a
 * drought that kills a few trees every twenty-odd seconds reads as a
 * *condition*, where one that razes a forest at once reads as a disaster
 * somebody triggered.
 */
export function runAgeAction(ctx: AgeActionContext, action: AgeAction): void {
  const {
    tilesRef,
    fireRef,
    entityManagerRef,
    syncTile,
    extinguishTile,
  } = ctx;
  const tiles = tilesRef.current;
  const size = tiles.length;
  if (size === 0 || action === 'none') return;
  const store = useGameStore.getState();
  const samples = Math.max(20, Math.floor((size * size) / 260));

  switch (action) {
    case 'drought': {
      for (let attempt = 0; attempt < samples; attempt += 1) {
        const tile = tiles[Math.floor(Math.random() * size)][Math.floor(Math.random() * size)];
        if (isWaterBiome(tile.type)) continue;
        tile.moisture = Math.max(0, tile.moisture - 0.05);
        if (tile.structure && Math.random() < 0.25) {
          tile.structure = null;
          tile.resources = tile.resources.filter(r => r.type !== 'food');
          syncTile(tile);
        }
      }
      break;
    }
    case 'downpour': {
      if (store.weather === 'clear') store.setWeather('rain');
      // Rain in an Age of Tears is relentless enough to put fires out
      // wherever it finds them, not merely to slow them down.
      fireRef.current?.extinguishAll();
      break;
    }
    case 'frost': {
      for (let attempt = 0; attempt < samples; attempt += 1) {
        const tile = tiles[Math.floor(Math.random() * size)][Math.floor(Math.random() * size)];
        if (isWaterBiome(tile.type)) continue;
        tile.temperature = Math.max(0, tile.temperature - 0.04);
        const food = tile.resources.find(r => r.type === 'food');
        if (food && Math.random() < 0.5) {
          food.quantity = Math.max(0, food.quantity - 2);
        }
        if (tile.isOnFire) extinguishTile(tile, false);
      }
      break;
    }
    case 'derangement': {
      // Chaos turns creatures on each other. Picked at random across the
      // whole population rather than in one place, so it feels like the age
      // rather than like an attack.
      const all = entityManagerRef.current?.getAllEntities() ?? [];
      if (all.length === 0) break;
      for (let attempt = 0; attempt < Math.max(1, Math.floor(all.length * 0.04)); attempt += 1) {
        const victim = all[Math.floor(Math.random() * all.length)];
        applyScenario(victim, 'lostFight');
      }
      break;
    }
    case 'ashfall': {
      for (let attempt = 0; attempt < samples; attempt += 1) {
        const tile = tiles[Math.floor(Math.random() * size)][Math.floor(Math.random() * size)];
        if (isWaterBiome(tile.type)) continue;
        tile.fertility = Math.max(0, tile.fertility - 0.03);
      }
      const living = entityManagerRef.current?.getAllEntities() ?? [];
      for (const creature of living) {
        if (Math.random() < 0.05) creature.health = Math.max(1, creature.health - 2);
      }
      break;
    }
    case 'flourish': {
      for (let attempt = 0; attempt < samples; attempt += 1) {
        const tile = tiles[Math.floor(Math.random() * size)][Math.floor(Math.random() * size)];
        if (isWaterBiome(tile.type)) continue;
        tile.fertility = Math.min(1, tile.fertility + 0.03);
        const food = tile.resources.find(r => r.type === 'food');
        if (food) food.quantity = Math.min(10, food.quantity + 1);
        else if (tile.fertility > 0.4) {
          tile.resources.push({ type: 'food', quantity: 2, discovered: true });
        }
      }
      break;
    }
    default: break;
  }
}

/** Move the age clock along and let the current era act on the world. */
export function advanceAge(ctx: AgeClockContext, delta: number): void {
  const {
    entityManagerRef,
    ageTimerRef,
    ageActionTimerRef,
    ageSlotRef,
    runAgeAction,
  } = ctx;
  const store = useGameStore.getState();
  if (!store.worldLaws.ages) {
    // Held in Hope rather than frozen mid-era: switching the law off should
    // give a temperate world, not leave an Age of Ash running for ever.
    if (store.age !== 'hope') store.setAge('hope');
    ageBridge.age = 'hope';
    ageBridge.strength = 0;
    return;
  }

  const current = AGES[store.age] ?? AGES.hope;
  ageBridge.age = current.id;
  ageBridge.strength = current.tintStrength;

  // Everything alive feels the era, which is our stand-in for their
  // per-age loyalty and opinion bonuses.
  if (current.mood !== 0) {
    for (const creature of entityManagerRef.current?.getAllEntities() ?? []) {
      nudgeMood(creature, current.mood * delta);
    }
  }

  if (current.action !== 'none' && current.actionEvery > 0) {
    ageActionTimerRef.current += delta;
    if (ageActionTimerRef.current >= current.actionEvery) {
      ageActionTimerRef.current = 0;
      runAgeAction(current.action);
    }
  }

  ageTimerRef.current += delta;
  store.setAgeProgress(Math.min(1, ageTimerRef.current / AGE_LENGTH));
  if (ageTimerRef.current < AGE_LENGTH) return;

  ageTimerRef.current = 0;
  ageActionTimerRef.current = 0;
  ageSlotRef.current += 1;
  const chosen = nextAge(ageSlotRef.current, current.id, Math.random());
  store.setAge(chosen);
  store.setAgeProgress(0);
  store.addEvent(AGES[chosen].herald, 'info');
  requestFlash(chosen === 'hope' || chosen === 'wonders' ? 'divine' : 'plague', 0.55);
}
