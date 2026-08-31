import { describe, expect, it } from 'vitest';
import {
  RAMPS, RAMPS_FOR, applyRamp, describeCreature, pickRamp, rampById,
} from './subspecies';
import type { EntityType, Tile } from '../types/world';

const hexes = (palette: Record<string, string>) => Object.values(palette);

const climate = (temperature: number) =>
  ({ temperature, type: 'grassland' } as Pick<Tile, 'temperature' | 'type'>);

describe('colour ramps', () => {
  it('gives every ramp a unique id, two valid stops and a climate', () => {
    const ids = RAMPS.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const ramp of RAMPS) {
      // A malformed hex silently renders magenta, which is the kind of bug
      // that survives review and then ships.
      expect(ramp.from).toMatch(/^#[0-9a-f]{6}$/);
      expect(ramp.to).toMatch(/^#[0-9a-f]{6}$/);
      expect(ramp.climate).toBeGreaterThanOrEqual(0);
      expect(ramp.climate).toBeLessThanOrEqual(1);
      expect(ramp.label.length).toBeGreaterThan(2);
    }
  });

  it('only names ramps that exist', () => {
    for (const [type, allowed] of Object.entries(RAMPS_FOR)) {
      for (const id of allowed ?? []) {
        expect(rampById(id), `${type} wants a ramp called ${id}`).not.toBeNull();
      }
    }
  });

  it('replaces the hue and keeps the shading', () => {
    const wolf = { f: '#8a8f98', d: '#565b63', e: '#e8c33b', t: '#565b63' };
    const snow = applyRamp(wolf, rampById('snow')!);

    // Everything moved...
    expect(snow.f).not.toBe(wolf.f);
    // ...but the light part is still lighter than the dark part, which is the
    // whole trick. A ramp that flattens the shading is a silhouette.
    expect(parseInt(snow.f.slice(1), 16)).toBeGreaterThan(parseInt(snow.d.slice(1), 16));
    // ...and the two keys that were the same colour still are.
    expect(snow.d).toBe(snow.t);
  });

  it('leaves the eyes alone', () => {
    // Remap the eyes too and a creature loses its only high-contrast feature,
    // and a field of wolves becomes a field of coloured smudges.
    const wolf = { f: '#8a8f98', d: '#565b63', e: '#e8c33b' };
    for (const ramp of RAMPS) {
      expect(applyRamp(wolf, ramp).e).toBe('#e8c33b');
    }
  });

  it('produces a different palette for every ramp', () => {
    const wolf = { f: '#8a8f98', d: '#565b63', e: '#e8c33b' };
    const seen = new Set(RAMPS.map(ramp => hexes(applyRamp(wolf, ramp)).join()));
    expect(seen.size).toBe(RAMPS.length);
  });

  it('survives a palette whose colours are all the same brightness', () => {
    // The stretch divides by the brightness span, so a flat palette is the
    // division by zero waiting to happen.
    const flat = { a: '#808080', b: '#808080', e: '#000000' };
    const out = applyRamp(flat, rampById('crimson')!);
    for (const value of [out.a, out.b]) expect(value).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('choosing a colouring', () => {
  it('leaves kinds with no ramps uncoloured', () => {
    // People are not colour-ramped: a violet human is a costume, not a species.
    for (const type of ['human', 'elf', 'dwarf', 'orc'] as EntityType[]) {
      expect(pickRamp(type, climate(0.5))).toBeNull();
    }
  });

  it('favours cold colourings in the cold and warm ones in the heat', () => {
    // Sampled rather than asserted on one roll: this is a weighting, and a
    // single draw of a weighted choice tests nothing.
    const count = (temperature: number, id: string) => {
      let hits = 0;
      for (let i = 0; i < 400; i += 1) {
        if (pickRamp('wolf', climate(temperature)) === id) hits += 1;
      }
      return hits;
    };
    expect(count(0.05, 'snow')).toBeGreaterThan(count(0.9, 'snow'));
    expect(count(0.9, 'russet')).toBeGreaterThan(count(0.05, 'russet'));
  });

  it('never makes the unlikely one impossible', () => {
    // A black wolf in the snow should be uncommon, not absent — the ones that
    // turn up in the wrong place are the ones you remember.
    let sable = 0;
    for (let i = 0; i < 600; i += 1) {
      if (pickRamp('wolf', climate(0)) === 'sable') sable += 1;
    }
    expect(sable).toBeGreaterThan(0);
  });

  it('always returns something the creature is allowed to be', () => {
    for (const type of Object.keys(RAMPS_FOR) as EntityType[]) {
      for (let i = 0; i < 40; i += 1) {
        const picked = pickRamp(type, climate(Math.random()));
        expect(RAMPS_FOR[type]).toContain(picked);
      }
    }
  });
});

describe('naming', () => {
  it('says the colouring when there is one and stays quiet when there is not', () => {
    expect(describeCreature('wolf', 'snow')).toBe('snow wolf');
    expect(describeCreature('human', null)).toBe('human');
    // An id that no longer exists must not print itself into the name.
    expect(describeCreature('wolf', 'chartreuse')).toBe('wolf');
  });
});
