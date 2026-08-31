import { describe, expect, it } from 'vitest';
import { DISASTERS, strikeDisaster, type DisasterTarget, type DisasterWorld } from './disasters';
import type { Tile } from '../types/world';

const makeWorld = (
  buildings: DisasterTarget[],
  random: () => number = () => 0.5,
): DisasterWorld & { destroyed: string[]; burnt: Tile[]; hurt: number; events: string[] } => {
  const destroyed: string[] = [];
  const burnt: Tile[] = [];
  const events: string[] = [];
  let hurt = 0;
  const world = {
    buildings: () => buildings.filter(b => !destroyed.includes(b.id)),
    destroyBuilding: (id: string) => {
      if (destroyed.includes(id)) return false;
      destroyed.push(id);
      return true;
    },
    damageArea: (_x: number, _y: number, _r: number, damage: number) => {
      hurt += damage;
      return 0;
    },
    ignite: (tile: Tile) => { burnt.push(tile); },
    tileAt: (x: number, y: number) => ({ x, y } as unknown as Tile),
    announce: (message: string) => { events.push(message); },
    random,
    destroyed,
    burnt,
    get hurt() { return hurt; },
    events,
  };
  return world as unknown as DisasterWorld & {
    destroyed: string[]; burnt: Tile[]; hurt: number; events: string[];
  };
};

const building = (kind: string, id = kind): DisasterTarget => ({
  id, kind, x: 10, y: 10, villageId: 'v1', villageName: 'Ashford',
});

describe('disasters that eat a building', () => {
  it('cannot happen at all in a world nobody has built in', () => {
    // The whole design: no works, no attack surface. This has to be a plain
    // "nothing happened" rather than a disaster firing uselessly into the sea.
    const empty = makeWorld([]);
    for (let i = 0; i < 50; i += 1) expect(strikeDisaster(empty)).toBeNull();
    expect(empty.events).toHaveLength(0);
  });

  it('only fires the ones something in the world can host', () => {
    // A world with nothing but mines can only have mine collapses, however
    // heavily the other rows are weighted.
    const mines = makeWorld([building('mine', 'm1'), building('mine', 'm2')], Math.random);
    const fired = new Set<string>();
    for (let i = 0; i < 2; i += 1) {
      const id = strikeDisaster(mines);
      if (id) fired.add(id);
    }
    expect([...fired]).toEqual(['mine_collapse']);
  });

  it('consumes the building it needed', () => {
    const world = makeWorld([building('farm', 'f1')]);
    expect(strikeDisaster(world)).toBe('granary_fire');
    expect(world.destroyed).toEqual(['f1']);
    // ...and cannot happen twice to the same one.
    expect(strikeDisaster(world)).toBeNull();
  });

  it('does what it says beyond taking the building', () => {
    const fire = makeWorld([building('farm', 'f1')]);
    strikeDisaster(fire);
    expect(fire.burnt.length).toBeGreaterThan(0);
    expect(fire.hurt).toBeGreaterThan(0);

    // A collapse is tight and lethal; a desecration is wide and weak. If a
    // collapse were survivable it would just be a building disappearing.
    const collapse = DISASTERS.find(d => d.id === 'mine_collapse')!;
    const desecration = DISASTERS.find(d => d.id === 'temple_desecration')!;
    const collapseDamage: number[] = [];
    const desecrationDamage: number[] = [];
    collapse.act({
      ...makeWorld([]),
      damageArea: (_x: number, _y: number, radius: number, damage: number) => { collapseDamage.push(radius, damage); return 0; },
    } as unknown as DisasterWorld, building('mine'));
    desecration.act({
      ...makeWorld([]),
      damageArea: (_x: number, _y: number, radius: number, damage: number) => { desecrationDamage.push(radius, damage); return 0; },
    } as unknown as DisasterWorld, building('temple'));
    expect(collapseDamage[0]).toBeLessThan(desecrationDamage[0]);
    expect(collapseDamage[1]).toBeGreaterThan(desecrationDamage[1]);
  });

  it('names the village that lost something', () => {
    const world = makeWorld([building('hall', 'h1')]);
    strikeDisaster(world);
    expect(world.events).toHaveLength(1);
    expect(world.events[0]).toContain('Ashford');
  });

  it('spends the strike rather than retrying until something lands', () => {
    // A disaster that falls through to a neighbour when its target has already
    // gone is a disaster that always lands, and then the weights are a lie.
    const world = makeWorld([building('mine', 'm1'), building('farm', 'f1')]);
    world.destroyBuilding = () => false;
    expect(strikeDisaster(world)).toBeNull();
  });

  it('gives every row a target kind, a weight and a line', () => {
    const ids = DISASTERS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const def of DISASTERS) {
      expect(def.weight).toBeGreaterThan(0);
      expect(def.needs.length).toBeGreaterThan(0);
      const line = def.headline(building(def.needs));
      expect(line).toContain('Ashford');
      expect(line.length).toBeGreaterThan(20);
    }
  });
});
