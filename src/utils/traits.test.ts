import { describe, expect, it, vi } from 'vitest';
import { TRAITS, applyTraits, hasTrait, inheritTraits, rollTraits } from './traits';
import { createEntity } from './entitySystemMinimal';

describe('trait effects', () => {
  it('makes a swift, strong, tough creature measurably better', () => {
    const plain = createEntity('wolf', 0, 0, []);
    const gifted = createEntity('wolf', 0, 0, ['swift', 'strong', 'tough']);

    expect(gifted.attributes.speed).toBeGreaterThan(plain.attributes.speed);
    expect(gifted.attributes.strength).toBeGreaterThan(plain.attributes.strength);
    expect(gifted.maxHealth).toBeGreaterThan(plain.maxHealth);
    expect(gifted.health).toBe(gifted.maxHealth);
  });

  it('extends lifespan for the long-lived', () => {
    const plain = createEntity('human', 0, 0, []);
    const elder = createEntity('human', 0, 0, ['longevity']);
    expect(elder.maxAge).toBeGreaterThan(plain.maxAge);
  });

  it('leaves behaviour-only traits off the stat sheet', () => {
    const arsonist = createEntity('human', 0, 0, ['pyromaniac']);
    const plain = createEntity('human', 0, 0, []);
    expect(arsonist.attributes.strength).toBe(plain.attributes.strength);
    expect(hasTrait(arsonist, 'pyromaniac')).toBe(true);
  });

  it('rolls each trait at most once per creature', () => {
    for (let i = 0; i < 500; i++) {
      const rolled = rollTraits();
      expect(new Set(rolled).size).toBe(rolled.length);
      expect(rolled.length).toBeLessThanOrEqual(2);
    }
  });

  it('stacks a trait applied twice, so callers must not duplicate them', () => {
    const entity = createEntity('bear', 0, 0, []);
    const once = entity.attributes.strength;
    entity.traits = ['strong'];
    applyTraits(entity);
    expect(entity.attributes.strength).toBeGreaterThan(once);
  });
});

describe('inheritance', () => {
  it('usually passes a parent trait to the child', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(inheritTraits(['swift'])).toEqual(['swift']);
    random.mockRestore();
  });

  it('drops a trait when the roll goes against it', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(inheritTraits(['swift'])).toEqual([]);
    random.mockRestore();
  });

  it('only ever produces known traits', () => {
    for (let i = 0; i < 200; i++) {
      for (const trait of rollTraits()) {
        expect(TRAITS[trait]).toBeDefined();
      }
    }
  });
});
