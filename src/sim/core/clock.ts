/**
 * Simulated world time.
 *
 * The simulation advances in fixed steps. Each rendered frame runs a number
 * of steps set by the speed, so a faster world simulates more and does not
 * just take bigger steps (which would change outcomes).
 *
 * World time is counted in seconds; months and years are derived from it.
 * The calendar constants are set once from the world spec.
 */

export interface CalendarConfig {
  /** Seconds of world time in one month. */
  secondsPerMonth: number;
  monthsPerYear: number;
}

export const DEFAULT_CALENDAR: CalendarConfig = {
  secondsPerMonth: 5,
  monthsPerYear: 12,
};

/** Ticks per frame for each speed setting. 0 = paused. */
export const SPEED_TICKS: readonly number[] = [0, 1, 2, 4, 8, 16];

export class SimClock {
  /** Fixed step, in world seconds. */
  readonly step: number;
  /** Total simulated world seconds. */
  time = 0;
  /** Total ticks run. */
  ticks = 0;
  speed = 1;
  paused = false;

  constructor(
    readonly calendar: CalendarConfig = DEFAULT_CALENDAR,
    step = 1 / 30,
  ) {
    this.step = step;
  }

  get secondsPerYear(): number {
    return this.calendar.secondsPerMonth * this.calendar.monthsPerYear;
  }

  /** Whole months since the world began. */
  get totalMonths(): number {
    return Math.floor(this.time / this.calendar.secondsPerMonth);
  }

  /** 1-based year. */
  get year(): number {
    return Math.floor(this.time / this.secondsPerYear) + 1;
  }

  /** 1-based month within the year. */
  get month(): number {
    return (this.totalMonths % this.calendar.monthsPerYear) + 1;
  }

  /** Fraction through the current year, 0..1. */
  get yearProgress(): number {
    return (this.time % this.secondsPerYear) / this.secondsPerYear;
  }

  /** How many fixed steps to run this frame. */
  ticksThisFrame(): number {
    if (this.paused) return 0;
    return SPEED_TICKS[Math.max(0, Math.min(SPEED_TICKS.length - 1, this.speed))] ?? 1;
  }

  advance(): void {
    this.time += this.step;
    this.ticks++;
  }

  /** Convert a duration in years to world seconds. */
  years(n: number): number {
    return n * this.secondsPerYear;
  }

  /** Convert a duration in months to world seconds. */
  months(n: number): number {
    return n * this.calendar.secondsPerMonth;
  }
}

/** A countdown that fires every `interval` world seconds. */
export class Interval {
  private left: number;

  constructor(
    public interval: number,
    offset = 0,
  ) {
    this.left = interval - offset;
  }

  /** Advance by dt; true when the interval elapsed (at most once per call). */
  tick(dt: number): boolean {
    this.left -= dt;
    // Tolerance: summed fixed steps drift (10 × 0.1 ≠ 1 in floating point).
    if (this.left > 1e-9) return false;
    this.left += this.interval;
    if (this.left <= 0) this.left = this.interval;
    return true;
  }

  reset(interval = this.interval): void {
    this.interval = interval;
    this.left = interval;
  }
}
