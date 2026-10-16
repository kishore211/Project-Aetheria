// Things that happen to a creature, and what they do to it.
//
// WorldBox pairs roughly twenty situations with a happiness change and three or
// four lines of dialogue (06-WORLDBOX-COMPLETE-REFERENCE.md §5). The table is
// the interesting part, not the mechanism: it is where the game decides that
// losing a child is worth six times as much as a bad night's sleep, and that
// being poked by a god is an insult rather than an injury.
//
// Having it in one table also means every emotional event goes through one
// door, so mood, status, dialogue and the floating glyph can never disagree
// about what just happened.
import type { Entity } from '../types/world';
import { nudgeMood } from './mood';
import { applyStatus, type StatusId } from './statusEffects';
import { emitFloater } from './floatBridge';
import { speak, type Occasion } from './dialogue';
import { random } from './random';

export type Scenario =
  // -- the day-to-day --
  | 'ateWell'
  | 'drankWell'
  | 'sleptRough'
  | 'restedWell'
  | 'hurt'
  | 'healed'
  | 'gotHome'
  | 'turnedOut'
  // -- other people --
  | 'madeFriend'
  | 'fellInLove'
  | 'lostFriend'
  | 'lostLover'
  | 'lostChild'
  | 'childBorn'
  | 'sawDeath'
  // -- standing --
  | 'crowned'
  | 'villageFounded'
  // -- violence --
  | 'wonFight'
  | 'lostFight'
  | 'raided'
  // -- the player --
  | 'poked'
  | 'blessed'
  | 'cursed';

interface ScenarioDef {
  /** One-off happiness change, -100..+100. */
  mood: number;
  /** Status to apply alongside it. */
  status?: StatusId;
  /**
   * Glyph to float above the creature, for events big enough to show.
   *
   * Declared per scenario rather than derived from the resulting mood. Using
   * the mood face was the obvious approach and it read wrong: poke a
   * well-fed villager and its mood lands at +66, so the feedback for hurting
   * somebody was a smiling face. The glyph has to describe what *happened*,
   * not where the creature ended up.
   */
  glyph?: string;
  /** Dialogue occasion, if the creature might say something. */
  occasion?: Occasion;
  /** Odds of it saying anything. The speech budget still has final say. */
  voice?: number;
}

/**
 * The table.
 *
 * The numbers are relative to each other, and that is the only thing about
 * them that matters. A meal is small and frequent; losing a child is enormous
 * and rare. If everything were worth 20 then nothing would be.
 */
const SCENARIOS: Record<Scenario, ScenarioDef> = {
  ateWell: { mood: 6, occasion: 'content', voice: 0.05 },
  drankWell: { mood: 4 },
  sleptRough: { mood: -14, occasion: 'exhausted', voice: 0.2 },
  restedWell: { mood: 8 },
  hurt: { mood: -10, status: 'wounded', occasion: 'wounded', voice: 0.25 },
  healed: { mood: 12, occasion: 'blessed', voice: 0.15 },
  gotHome: { mood: 16, glyph: '\u{1F3E1}', occasion: 'content', voice: 0.3 },
  turnedOut: { mood: -22, glyph: '\u{1F5FA}', occasion: 'lonely', voice: 0.3 },

  madeFriend: { mood: 20, glyph: '\u{1F91D}', occasion: 'bonfire', voice: 0.4 },
  fellInLove: { mood: 35, glyph: '\u2764', status: 'in_love', occasion: 'inLove', voice: 0.8 },
  lostFriend: { mood: -34, glyph: '\u{1F494}', status: 'grieving', occasion: 'grieving', voice: 0.5 },
  lostLover: { mood: -55, glyph: '\u{1F494}', status: 'grieving', occasion: 'grieving', voice: 0.8 },
  lostChild: { mood: -60, glyph: '\u{1F494}', status: 'grieving', occasion: 'grieving', voice: 0.9 },
  childBorn: { mood: 30, glyph: '\u{1F476}', occasion: 'newborn', voice: 0.5 },
  sawDeath: { mood: -12, occasion: 'afraid', voice: 0.12 },

  crowned: { mood: 25, glyph: '\u{1F451}', occasion: 'crowned', voice: 0.9 },
  villageFounded: { mood: 22, glyph: '\u{1F3E0}', occasion: 'newVillage', voice: 0.6 },

  wonFight: { mood: 14, occasion: 'fighting', voice: 0.25 },
  lostFight: { mood: -20, glyph: '\u{1F621}', status: 'furious', occasion: 'wounded', voice: 0.3 },
  raided: { mood: -30, glyph: '\u{1F621}', status: 'furious', occasion: 'raiding', voice: 0.4 },

  // The sharpest bit of WorldBox's writing is that the player is *felt*. A
  // creature that gets prodded by something enormous and unseen does not
  // shrug it off, and it does not blame anybody it can name.
  poked: { mood: -18, glyph: '\u{1F449}', status: 'poked', occasion: 'poked', voice: 0.85 },
  blessed: { mood: 30, glyph: '\u2728', status: 'blessed', occasion: 'blessed', voice: 0.4 },
  cursed: { mood: -40, glyph: '\u{1F480}', status: 'cursed', occasion: 'cursed', voice: 0.6 },
};

/** Below this, a mood change is not worth a glyph over the creature's head. */
const GLYPH_THRESHOLD = 18;

/** Fallbacks for scenarios with nothing more specific to show. */
const GOOD_GLYPH = '\u{1F60A}';
const BAD_GLYPH = '\u{1F623}';

/**
 * Something happened. Apply all of it.
 *
 * One door for every emotional event, so mood, status, dialogue and the
 * floating glyph can never end up telling three different stories about the
 * same moment.
 */
export const applyScenario = (entity: Entity, scenario: Scenario): void => {
  const def = SCENARIOS[scenario];

  nudgeMood(entity, def.mood);
  if (def.status) applyStatus(entity, def.status);

  // A glyph only for events big enough that a player watching would want to
  // know without clicking. Scenarios that name their own glyph get it; the
  // rest fall back to a plain good/bad marker, never to the resulting mood
  // face (see the `glyph` field for why that was wrong).
  if (Math.abs(def.mood) >= GLYPH_THRESHOLD) {
    emitFloater({
      kind: 'emote',
      text: def.glyph ?? (def.mood > 0 ? GOOD_GLYPH : BAD_GLYPH),
      x: entity.position.x,
      y: entity.position.y,
      entityId: entity.id,
    });
  }

  if (def.occasion && def.voice !== undefined && random() < def.voice) {
    emitFloater({
      kind: 'speech',
      text: speak(def.occasion, random()),
      x: entity.position.x,
      y: entity.position.y,
      entityId: entity.id,
    });
  }
};

/** For tests: the table itself, so the writing can be kept honest. */
export const SCENARIO_TABLE: Readonly<Record<Scenario, ScenarioDef>> = SCENARIOS;
