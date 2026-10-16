/**
 * The simulated world: one object that owns time, randomness, ids, events,
 * the tile grid and the ordered list of systems that advance it.
 *
 * Systems run in a fixed order every tick (see 11-REA-REWRITE-PLAN.md,
 * "Update order"). Nothing here knows about rendering.
 */
import { SimClock, type CalendarConfig } from './core/clock';
import { RngStreams } from './core/rng';
import { IdAllocator } from './core/ids';
import { SimEvents } from './core/events';
import { WorldGrid } from './world/grid';

export interface SimSystem {
  /** Stable id, used for ordering diagnostics and saves. */
  readonly id: string;
  update(world: World, dt: number): void;
}

export interface WorldOptions {
  seed: number;
  width: number;
  height: number;
  calendar?: CalendarConfig;
}

export class World {
  readonly seed: number;
  readonly clock: SimClock;
  readonly rng: RngStreams;
  readonly ids = new IdAllocator();
  readonly events = new SimEvents();
  readonly grid: WorldGrid;
  private readonly systems: SimSystem[] = [];

  constructor(options: WorldOptions) {
    this.seed = options.seed;
    this.clock = new SimClock(options.calendar);
    this.rng = new RngStreams(options.seed);
    this.grid = new WorldGrid(options.width, options.height);
  }

  /** Append a system; systems run in registration order. */
  addSystem(system: SimSystem): void {
    if (this.systems.some((s) => s.id === system.id)) throw new Error(`duplicate system ${system.id}`);
    this.systems.push(system);
  }

  getSystem<T extends SimSystem>(id: string): T | undefined {
    return this.systems.find((s) => s.id === id) as T | undefined;
  }

  /** Run one fixed step of every system. */
  tick(): void {
    const dt = this.clock.step;
    this.events.now = this.clock.time;
    for (const system of this.systems) system.update(this, dt);
    this.clock.advance();
  }

  /** Run as many ticks as the current speed asks for; returns ticks run. */
  frame(): number {
    const n = this.clock.ticksThisFrame();
    for (let i = 0; i < n; i++) this.tick();
    return n;
  }

  /** Run for a span of world seconds (headless tests and soak runs). */
  runFor(seconds: number): void {
    const end = this.clock.time + seconds;
    while (this.clock.time < end - 1e-9) this.tick();
  }
}
