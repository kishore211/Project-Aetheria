import { describe, expect, it } from 'vitest';
import { BIOME_LINES, CREATURE_LINES, biomeLine, creatureLine } from './flavour';
import { FOOD_CHAIN } from './entitySystemMinimal';
import type { BiomeType, EntityType } from '../types/world';

/** Every biome the game can actually put on the map. */
const ALL_BIOMES = Object.keys(BIOME_LINES) as BiomeType[];

describe('the game having a voice', () => {
  it('gives every biome a line', () => {
    // The plan calls this a shipping requirement rather than polish, so it is
    // asserted rather than trusted: a biome added without a line should fail
    // here and not ship silent.
    for (const biome of ALL_BIOMES) {
      const line = biomeLine(biome);
      expect(line, `${biome} has nothing to say`).toBeTruthy();
      expect(line.length).toBeGreaterThan(20);
      expect(line.endsWith('.')).toBe(true);
    }
  });

  it('gives every creature in the food chain something to say', () => {
    for (const type of Object.keys(FOOD_CHAIN) as EntityType[]) {
      const lines = CREATURE_LINES[type];
      expect(lines, `${type} has nothing to say`).toBeTruthy();
      expect(lines!.length).toBeGreaterThan(0);
      for (const line of lines!) {
        expect(line.length).toBeGreaterThan(20);
        expect(line.endsWith('.')).toBe(true);
      }
    }
  });

  it('never repeats a line between two biomes', () => {
    const lines = Object.values(BIOME_LINES);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('never repeats a line between two creatures', () => {
    const all = Object.values(CREATURE_LINES).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('says the same thing about the same creature every time', () => {
    // A line that changes each time you look is noise. One that does not
    // becomes *that creature's* line, and you learn it.
    const first = creatureLine('wolf', 'entity-17');
    for (let i = 0; i < 20; i += 1) {
      expect(creatureLine('wolf', 'entity-17')).toBe(first);
    }
  });

  it('spreads its lines across a crowd rather than giving them all one', () => {
    const said = new Set<string | null>();
    for (let i = 0; i < 200; i += 1) said.add(creatureLine('human', `entity-${i}`));
    expect(said.size).toBe(CREATURE_LINES.human!.length);
  });

  it('stays quiet for a kind with nothing written for it', () => {
    expect(creatureLine('fish' as EntityType, 'x')).toBeTruthy();
    // The lookup must tolerate a kind that has no entry rather than throwing
    // in the middle of painting a panel.
    expect(creatureLine('nonesuch' as EntityType, 'x')).toBeNull();
  });
});
