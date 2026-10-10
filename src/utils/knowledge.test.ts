import { beforeEach, describe, expect, it } from 'vitest';
import { creatureFacts, discover, discoveredCount, isDiscovered, resetKnowledge } from './knowledge';

beforeEach(() => resetKnowledge());

describe('the Knowledge book', () => {
  it('records a creature the first time it is met, and only then', () => {
    expect(isDiscovered('wolf')).toBe(false);
    expect(discover('wolf')).toBe(true);
    expect(discover('wolf')).toBe(false);
    expect(isDiscovered('wolf')).toBe(true);
    expect(discoveredCount()).toBe(1);
  });

  it('gathers what the systems know about a kind', () => {
    const wolf = creatureFacts('wolf');
    expect(wolf.eats).toContain('sheep');
    expect(wolf.health).toBeGreaterThan(0);
    const sheep = creatureFacts('sheep');
    expect(sheep.eatenBy).toContain('wolf');
    expect(sheep.lives).toContain('grassland');
    expect(creatureFacts('dragon').powers.join(' ')).toMatch(/fire/);
    expect(creatureFacts('cold_one').powers.join(' ')).toMatch(/snow/);
    expect(creatureFacts('fish').moves).toBe('Swims');
    expect(creatureFacts('human').people).toBe(true);
  });
});
