// Clears every piece of module-level state that belongs to one world.
//
// A page load starts every module from scratch, so a fresh world replays
// exactly from its seed. A second world built in the same session would
// otherwise inherit id counters, dice, registries and cooldown tables from the
// first, and the same seed would give a different history. Call this before
// seedRandom(seed) at the start of world creation.
//
// Deliberately not reset here:
// - knowledge.ts (the codex of creatures met): it is kept across worlds on purpose.
// - gameStore.ts event and camera counters: interface keys, not simulation state.
// - Rendering caches (pixelAtlas, pixelSprites, heraldry) and the pathfinding
//   generation counter: they do not change any result.

import { resetChronicle } from './chronicle';
import { resetDialogue } from './dialogue';
import { clearAllStatusTimers } from './statusEffects';
import { clearFloaters } from './floatBridge';
import { clearImpacts } from './impactBridge';
import { clearShots } from './shotBridge';
import { magnetReset } from './magnet';
import { setEntanglewood } from './biomeEffects';
import { resetThermalNotes } from './worldBehaviour';
import { resetHerdIds } from './herdSystem';
import { resetBoatIds } from './boats';
import { resetItemIds } from './equipment';
import { resetPossession } from './possession';
import { resetKingdomColors } from './nameGenerator';
import { resetIdentity } from './identity';
import { resetPlotIds } from './plots';
import { resetFaiths } from './religion';
import { resetStats } from './worldStats';
import { resetIdentifiers } from './settlement/helpers';
import { resetOrderHandlers } from './simulation';
import { resetEntityIds } from './ids';

export const resetWorldState = (): void => {
  resetOrderHandlers();
  resetEntityIds();
  resetIdentifiers();
  resetPlotIds();
  resetIdentity();
  resetFaiths();
  resetKingdomColors();
  resetHerdIds();
  resetBoatIds();
  resetItemIds();
  resetChronicle();
  resetDialogue();
  resetThermalNotes();
  resetPossession();
  clearAllStatusTimers();
  clearFloaters();
  clearShots();
  clearImpacts();
  magnetReset();
  resetStats();
  setEntanglewood(false);
};
