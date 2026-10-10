import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { clanName, givenName, hasClan, joinClan } from './families';
import { EntityManager } from './entityManagerMinimal';
import { computeScaledHeight, type Entity, type Tile } from '../types/world';

const grid = (size: number): Tile[][] => Array.from({ length: size }, (_, x) => Array.from({ length: size }, (_, y) => ({
  x, y, type: 'grassland', height: 0.45, scaledHeight: computeScaledHeight(0.45, 'grassland'),
  moisture: 0.5, temperature: 0.5, fertility: 0.7, population: 0, resources: [], structure: null,
  entities: [], isOnFire: false, walkable: true,
}) as unknown as Tile));

describe('families and clans', () => {
  it('names clans in each people’s idiom, and the same founder the same way', () => {
    expect(clanName('dwarf', 'abc')).toBe(clanName('dwarf', 'abc'));
    expect(clanName('dwarf', 'abc')).toMatch(/^[A-Z][a-z]+$/);
    expect(hasClan('wolf')).toBe(false);
  });

  it('gives every newcomer of the four peoples a surname, and beasts none', () => {
    const manager = new EntityManager(grid(12), new THREE.Scene());
    const elf = manager.spawnEntity('elf', 3, 3)!;
    const wolf = manager.spawnEntity('wolf', 5, 5)!;
    expect(elf.clan).toBeTruthy();
    expect(elf.name.endsWith(` ${elf.clan}`)).toBe(true);
    expect(wolf.clan).toBeFalsy();
  });

  it('passes the clan to children and remembers the parents', () => {
    const manager = new EntityManager(grid(12), new THREE.Scene());
    const mother = manager.spawnEntity('human', 5, 5)!;
    const father = manager.spawnEntity('human', 5, 6)!;
    mother.loverId = father.id;
    father.loverId = mother.id;
    mother.age = mother.maxAge * 0.4;
    (manager as unknown as { reproduceEntity(e: Entity): void }).reproduceEntity(mother);
    const child = manager.getAllEntities().find(e => e.parentIds?.length);
    expect(child).toBeTruthy();
    expect(child!.clan).toBe(mother.clan);
    expect(child!.parentIds).toEqual([mother.id, father.id]);
    expect(child!.name.split(' ')).toHaveLength(2);
  });

  it('swaps a surname rather than stacking two', () => {
    const e = { name: 'Riley Oakwood', clan: 'Oakwood' } as Entity;
    joinClan(e, 'Ashford');
    expect(e.name).toBe('Riley Ashford');
    expect(givenName(e)).toBe('Riley');
  });
});
