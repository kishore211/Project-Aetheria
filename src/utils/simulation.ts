// Shared, mutable simulation context.
//
// The AI runs thousands of times per second and needs to know a handful of
// global facts (season, active world laws). Threading them through every call
// site costs more than it buys, so the engine publishes them here once per
// frame and the systems read them.
import type { Entity, Season, TimeOfDay } from '../types/world';
import type { AIOrder } from './entitySystemMinimal';
import { DEFAULT_WORLD_LAWS, type WorldLaws } from '../store/gameStore';
import { AGES, type AgeDef, type AgeId } from './ages';
import type { MapLayer } from './mapLayers';

/** Something that wants to know when a unit finished walking somewhere. */
export type OrderHandler = (entity: Entity, order: AIOrder) => void;

export interface SimulationContext {
  laws: WorldLaws;
  season: Season;
  timeOfDay: TimeOfDay;
  /** Scales how fast needs drain — winter is harsher, and so is an Age of Ice. */
  needsMultiplier: number;
  /**
   * The era the world is in. Published here rather than passed around because
   * fire, ecology and needs all read it and none of them should have to know
   * where ages come from.
   */
  age: AgeDef;
  /**
   * Which question the map is painted to answer. Read by the settlement system
   * to decide whether territory is tinted by kingdom or by identity — the one
   * piece of view state a simulation system legitimately needs, because the
   * overlay it paints *is* the view.
   */
  mapLayer: MapLayer;
  /** Set a tile alight (pyromaniac trait, raids burning buildings). */
  igniteTile?: (x: number, y: number) => void;
  /** A unit reached the tile a village sent it to. */
  onOrderComplete?: (entity: Entity, order: AIOrder) => void;
  /** Where a unit's home village is, if it has one. Used to rescue strays. */
  homePositionFor?: (entity: Entity) => { x: number; y: number } | null;
  /**
   * The bonfire its village gathers around. WorldBox villagers socialise there,
   * and it is what makes a settlement look inhabited rather than like a set of
   * buildings with people walking past.
   */
  gatheringPointFor?: (entity: Entity) => { x: number; y: number } | null;
}

export const simulation: SimulationContext = {
  laws: { ...DEFAULT_WORLD_LAWS },
  season: 'spring',
  timeOfDay: 'day',
  needsMultiplier: 1,
  age: AGES.hope,
  mapLayer: 'natural',
};

/**
 * Systems subscribe here rather than having the engine remember to wire them
 * up. Order completion is how a villager's errand actually pays off — a
 * settlement system that is constructed without it looks like it works and
 * quietly never receives a single delivery.
 */
const orderHandlers = new Set<OrderHandler>();

export const registerOrderHandler = (handler: OrderHandler): (() => void) => {
  orderHandlers.add(handler);
  return () => orderHandlers.delete(handler);
};

simulation.onOrderComplete = (entity, order) => {
  for (const handler of orderHandlers) handler(entity, order);
};

export const publishSimulationContext = (
  laws: WorldLaws,
  season: Season,
  timeOfDay: TimeOfDay,
  age: AgeId = 'hope',
  mapLayer: MapLayer = 'natural',
): void => {
  simulation.laws = laws;
  simulation.season = season;
  simulation.timeOfDay = timeOfDay;
  simulation.age = AGES[age] ?? AGES.hope;
  simulation.mapLayer = mapLayer;
  // Season and age compound. An Age of Ice in winter should be worse than
  // either alone, which is the kind of thing a player remembers.
  const seasonal = season === 'winter' ? 1.45 : season === 'autumn' ? 1.1 : 1;
  simulation.needsMultiplier = seasonal * simulation.age.harshness;
};
