// Shared, mutable simulation context.
//
// The AI runs thousands of times per second and needs to know a handful of
// global facts (season, active world laws). Threading them through every call
// site costs more than it buys, so the engine publishes them here once per
// frame and the systems read them.
import type { Entity, Season, TimeOfDay } from '../types/world';
import type { AIOrder } from './entitySystemMinimal';
import { DEFAULT_WORLD_LAWS, type WorldLaws } from '../store/gameStore';

/** Something that wants to know when a unit finished walking somewhere. */
export type OrderHandler = (entity: Entity, order: AIOrder) => void;

export interface SimulationContext {
  laws: WorldLaws;
  season: Season;
  timeOfDay: TimeOfDay;
  /** Scales how fast needs drain — winter is harsher. */
  needsMultiplier: number;
  /** Set a tile alight (pyromaniac trait, raids burning buildings). */
  igniteTile?: (x: number, y: number) => void;
  /** A unit reached the tile a village sent it to. */
  onOrderComplete?: (entity: Entity, order: AIOrder) => void;
  /** Where a unit's home village is, if it has one. Used to rescue strays. */
  homePositionFor?: (entity: Entity) => { x: number; y: number } | null;
}

export const simulation: SimulationContext = {
  laws: { ...DEFAULT_WORLD_LAWS },
  season: 'spring',
  timeOfDay: 'day',
  needsMultiplier: 1,
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
): void => {
  simulation.laws = laws;
  simulation.season = season;
  simulation.timeOfDay = timeOfDay;
  simulation.needsMultiplier = season === 'winter' ? 1.45 : season === 'autumn' ? 1.1 : 1;
};
