import { describe, expect, it } from 'vitest';
import {
  PHRASING_COUNT,
  TOPIC_COUNT,
  chronicle,
  deathTopic,
  matchesTopic,
  toll,
} from './chronicle';

describe('chronicle', () => {
  it('writes every topic more than one way', () => {
    // One fixed phrasing per event turns a chronicle into a machine log.
    // Twelve wolves dying of old age in a row reads as twelve identical lines
    // and the eye stops going there.
    expect(PHRASING_COUNT / TOPIC_COUNT).toBeGreaterThanOrEqual(2.5);
  });

  it('fills in every variable it is given', () => {
    const line = chronicle('war_declared', { a: 'Aldenmoor', b: 'Grakzul' }, 0);
    expect(line).toContain('Aldenmoor');
    expect(line).toContain('Grakzul');
    expect(line).not.toContain('{');
  });

  it('leaves no placeholders behind on any topic', () => {
    // A missing variable must degrade to a gap, never to a visible "{name}".
    const topics = [
      'born', 'died_old', 'died_combat', 'village_founded', 'kingdom_founded',
      'village_settled', 'village_settled_from', 'village_abandoned',
      'settlers_leave', 'hall_raised', 'monument_raised', 'peace',
      'kingdom_fallen', 'meteor', 'quake', 'lightning', 'blessing', 'curse',
    ] as const;
    for (const topic of topics) {
      for (let step = 0; step < 6; step += 1) {
        const line = chronicle(topic, { name: 'N', type: 't', a: 'A', b: 'B' }, step / 6);
        expect(line).not.toMatch(/[{}]/);
        expect(line.trim().length).toBeGreaterThan(3);
      }
    }
  });

  it('never repeats a phrasing back to back', () => {
    let previous = '';
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const line = chronicle('died_old', { name: 'Wolf', type: 'wolf' }, (attempt % 2) / 2);
      expect(line).not.toBe(previous);
      previous = line;
    }
  });

  it('rotates independently per topic', () => {
    // A birth must not be able to suppress the next death's phrasing.
    const birth = chronicle('born', { name: 'A', type: 'human' }, 0);
    chronicle('died_old', { name: 'B', type: 'human' }, 0);
    expect(chronicle('born', { name: 'A', type: 'human' }, 0)).not.toBe(birth);
  });

  it('maps every death cause to a topic, and unknown causes to a safe one', () => {
    expect(deathTopic('old_age')).toBe('died_old');
    expect(deathTopic('combat')).toBe('died_combat');
    expect(deathTopic('starvation')).toBe('died_starved');
    expect(deathTopic('burned')).toBe('died_burned');
    expect(deathTopic('divine')).toBe('died_divine');
    expect(deathTopic('health')).toBe('died_health');
    expect(deathTopic('random')).toBe('died_sudden');
    expect(deathTopic('something-new-later')).toBe('died_sudden');
  });

  it('clamps out-of-range seeds rather than reading off the end', () => {
    for (const seed of [0, 1, 1.5, -0.5, 99]) {
      expect(chronicle('meteor', {}, seed)).toBeTruthy();
    }
  });
});

describe('matchesTopic', () => {
  it('recognises every phrasing of a topic', () => {
    for (let step = 0; step < 8; step += 1) {
      const line = chronicle('village_settled_from', { name: 'Westmere', a: 'Aldford' }, step / 8);
      expect(matchesTopic(line, 'village_settled_from')).toBe(true);
    }
  });

  it('does not confuse two topics that share a shape', () => {
    const settled = chronicle('village_settled', { name: 'Westmere', a: 'Aldenmoor' }, 0);
    expect(matchesTopic(settled, 'village_settled')).toBe(true);
    expect(matchesTopic(settled, 'kingdom_fallen')).toBe(false);
    expect(matchesTopic('a totally unrelated line', 'peace')).toBe(false);
  });

  it('still matches when the caller appended a suffix', () => {
    // Disaster lines get "— 3 perished" glued on by the caller.
    expect(matchesTopic(`${chronicle('meteor', {}, 0)} — 3 perished`, 'meteor')).toBe(true);
  });
});

describe('the toll on a disaster line', () => {
  it('says nothing when nothing happened', () => {
    // A caller appends this unconditionally, so "A meteor devastates the
    // region — 0 perished" has to be impossible by construction.
    expect(toll('dead', 0)).toBe('');
    expect(toll('healed', -1)).toBe('');
  });

  it('carries the count', () => {
    expect(toll('dead', 7, 0)).toContain('7');
  });

  it('varies, so every meteor in history does not end the same four words', () => {
    const seen = new Set<string>();
    for (let step = 0; step < 12; step += 1) {
      seen.add(toll('dead', 3, (step % 3) / 3).replace('3', 'N'));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('never repeats a phrasing back to back', () => {
    let previous = '';
    for (let step = 0; step < 20; step += 1) {
      const line = toll('slain', 2, (step % 2) / 2);
      expect(line).not.toBe(previous);
      previous = line;
    }
  });

  it('rotates independently per kind', () => {
    const first = toll('healed', 5, 0);
    toll('dead', 5, 0);
    expect(toll('healed', 5, 0)).not.toBe(first);
  });

  it('leaves no placeholder behind for any kind or seed', () => {
    for (const kind of ['dead', 'slain', 'claimed', 'healed'] as const) {
      for (const seed of [0, 0.4, 0.9, 1]) {
        expect(toll(kind, 4, seed)).not.toMatch(/[{}]/);
      }
    }
  });
});
