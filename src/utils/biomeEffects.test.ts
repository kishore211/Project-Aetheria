import { describe, expect, it } from 'vitest';
import { BIOME_STEPS, groundSpeed, setEntanglewood, stepOnGround } from './biomeEffects';
import { clearAllStatusTimers } from './statusEffects';
import type { BiomeType, Entity } from '../types/world';

const makeCreature = (): Entity => ({
  id: 'e1',
  type: 'human',
  position: { x: 0, y: 0 },
  health: 100,
  maxHealth: 100,
  status: [],
} as unknown as Entity);

describe('what the ground does to you', () => {
  it('leaves most of the map at full speed and harmless', () => {
    // If everywhere is difficult then nowhere is, and the swamp stops meaning
    // anything. Open ground has to be genuinely free.
    for (const open of ['grassland', 'savanna', 'ocean'] as BiomeType[]) {
      expect(groundSpeed(open)).toBe(1);
      expect(BIOME_STEPS[open]).toBeUndefined();
    }
  });

  it('slows a swamp more than a wood, and a mountain most of all', () => {
    expect(groundSpeed('swamp')).toBeLessThan(groundSpeed('deciduous_forest'));
    expect(groundSpeed('mountains')).toBeLessThan(groundSpeed('hills'));
    for (const biome of Object.keys(BIOME_STEPS) as BiomeType[]) {
      // Nothing may stop a creature dead or speed it up: both turn a slope
      // into a bug report.
      expect(groundSpeed(biome)).toBeGreaterThan(0.4);
      expect(groundSpeed(biome)).toBeLessThanOrEqual(1);
    }
  });

  it('does not touch the random stream on ground that cannot hurt anything', () => {
    // The rule that has bitten this codebase three times: a subsystem a
    // creature cannot participate in must not consume its randomness, or every
    // other random decision in the game shifts with the terrain under it.
    let draws = 0;
    const counted = () => { draws += 1; return 0; };

    stepOnGround(makeCreature(), 'grassland', 1, counted);
    stepOnGround(makeCreature(), 'swamp', 1, counted);
    stepOnGround(makeCreature(), 'hills', 1, counted);
    expect(draws).toBe(0);

    stepOnGround(makeCreature(), 'badlands', 1, counted);
    expect(draws).toBe(1);
  });

  it('parches a creature crossing the badlands', () => {
    clearAllStatusTimers();
    const walker = makeCreature();
    // A roll that always lands, so this is about the effect and not the odds.
    stepOnGround(walker, 'badlands', 1, () => 0);
    expect(walker.status).toContain('exhausted');
    expect(walker.health).toBe(100);
  });

  it('burns a creature standing on lava, and reports the damage', () => {
    const walker = makeCreature();
    const dealt = stepOnGround(walker, 'volcanic', 1, () => 0);
    expect(dealt).toBeGreaterThan(0);
    expect(walker.health).toBe(100 - dealt);
  });

  it('scales with the delta, so speed does not change the odds', () => {
    // A hazard rolled per frame rather than per second means the world hurts
    // more the faster your machine is, which is the worst kind of difficulty.
    const ground = BIOME_STEPS.volcanic!;
    let landed = 0;
    const roll = (value: number) => () => value;
    for (const value of [0.001, 0.01, 0.05, 0.2]) {
      const walker = makeCreature();
      if (stepOnGround(walker, 'volcanic', 1 / 60, roll(value)) > 0) landed += 1;
    }
    // At a sixtieth of a second only the smallest roll should land.
    expect(landed).toBe(ground.hazard / 60 > 0.001 ? 1 : 0);
  });

  it('leaves the dead alone', () => {
    const corpse = makeCreature();
    corpse.health = 0;
    expect(stepOnGround(corpse, 'volcanic', 1, () => 0)).toBe(0);
    expect(corpse.health).toBe(0);
  });

  it('gives every listed biome a line worth reading', () => {
    for (const biome of Object.keys(BIOME_STEPS) as BiomeType[]) {
      const note = BIOME_STEPS[biome]!.note;
      expect(note.length).toBeGreaterThan(12);
      expect(note.endsWith('.')).toBe(true);
    }
  });
});

describe('entanglewood', () => {
  it('slows the woods by a fifth while the law holds, and nothing else', () => {
    const wood = groundSpeed('deciduous_forest');
    const grass = groundSpeed('grassland');
    setEntanglewood(true);
    expect(groundSpeed('deciduous_forest')).toBeCloseTo(wood * 0.8, 6);
    expect(groundSpeed('grassland')).toBe(grass);
    setEntanglewood(false);
    expect(groundSpeed('deciduous_forest')).toBe(wood);
  });
});
