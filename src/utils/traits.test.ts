import { describe, expect, it, vi } from 'vitest';
import { TRAITS, applyTraits, earnTraits, grantTrait, hasTrait, inheritTraits, rollTraits, traitDamageFactor } from './traits';
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

describe('the wider trait list', () => {
  it('weakens the weak, the fragile and the slow', () => {
    const plain = createEntity('human', 0, 0, []);
    const poor = createEntity('human', 0, 0, ['weak', 'fragile', 'slow']);
    expect(poor.attributes.strength).toBeLessThan(plain.attributes.strength);
    expect(poor.maxHealth).toBeLessThan(plain.maxHealth);
    expect(poor.attributes.speed).toBeLessThan(plain.attributes.speed);
  });

  it('cancels an opposite rather than stacking it', () => {
    const e = createEntity('human', 0, 0, ['strong']);
    grantTrait(e, 'weak');
    expect(hasTrait(e, 'strong')).toBe(false);
    expect(hasTrait(e, 'weak')).toBe(true);
  });

  it('makes a hurt berserker and a night child hit harder when it counts', () => {
    const berserker = createEntity('orc', 0, 0, ['berserker']);
    expect(traitDamageFactor(berserker, false)).toBe(1);
    berserker.health = berserker.maxHealth * 0.2;
    expect(traitDamageFactor(berserker, false)).toBeGreaterThan(1);
    const night = createEntity('elf', 0, 0, ['nightchild']);
    expect(traitDamageFactor(night, true)).toBeGreaterThan(traitDamageFactor(night, false));
  });

  it('earns veteran at ten kills and a scar from near death, once each', () => {
    const e = createEntity('human', 0, 0, []);
    e.kills = 10;
    expect(earnTraits(e)).toBe('veteran');
    expect(earnTraits(e)).toBeNull();
    e.health = e.maxHealth * 0.1;
    expect(earnTraits(e)).toBe('scarred');
    expect(earnTraits(e)).toBeNull();
  });

  it('never rolls an earned trait at birth', () => {
    for (let i = 0; i < 2000; i++) {
      const rolled = rollTraits();
      expect(rolled).not.toContain('veteran');
      expect(rolled).not.toContain('scarred');
    }
  });
});
