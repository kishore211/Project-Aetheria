/**
 * Task runner, generic over the agent type.
 *
 * A task is an ordered list of actions. Each update the runner executes the
 * current action and reacts to its result code. Tasks can be defined as data
 * (action ids + params) through an ActionRegistry.
 */
import type { Asset } from '../core/library';
import { Library } from '../core/library';
import type { Rng } from '../core/rng';

export const ActionResult = {
  /** Advance to the next action on the next update. */
  CONTINUE: 'continue',
  /** End the task now. */
  STOP: 'stop',
  /** Run the same action again on the next update. */
  REPEAT: 'repeat',
  /** Go back to the first action. */
  RESTART_TASK: 'restart',
  /** Advance and run the next action within this same update (bounded). */
  SKIP: 'skip',
} as const;
export type ActionResultCode = (typeof ActionResult)[keyof typeof ActionResult];

export interface TaskContext {
  /** World time in seconds. */
  readonly now: number;
  /** Seconds since the previous update. */
  readonly dt: number;
  readonly rng: Rng;
}

export interface Action<A> {
  execute(agent: A, ctx: TaskContext): ActionResultCode;
  /** Seconds the agent waits after this action before the next one runs. */
  readonly wait?: number;
}

export interface TaskAsset<A> extends Asset {
  readonly actions: readonly Action<A>[];
}

/** Maximum SKIP chain per update, so a bad task cannot loop forever. */
export const MAX_SKIPS_PER_UPDATE = 32;
/** Id of the do-nothing task produced by a failed job guard. */
export const NOTHING_TASK = 'nothing';

// ---------------------------------------------------------------- data tasks

export interface ActionRef {
  readonly id: string;
  readonly params?: Readonly<Record<string, unknown>>;
}
export interface TaskDef {
  readonly id: string;
  readonly actions: readonly ActionRef[];
}

export class ActionRegistry<A> {
  private readonly factories = new Map<string, (params: Readonly<Record<string, unknown>>) => Action<A>>();

  register(id: string, factory: (params: Readonly<Record<string, unknown>>) => Action<A>): this {
    if (this.factories.has(id)) throw new Error(`action: duplicate id "${id}"`);
    this.factories.set(id, factory);
    return this;
  }

  create(ref: ActionRef): Action<A> {
    const f = this.factories.get(ref.id);
    if (!f) throw new Error(`action: unknown id "${ref.id}"`);
    return f(ref.params ?? {});
  }

  build(def: TaskDef): TaskAsset<A> {
    return { id: def.id, actions: def.actions.map((r) => this.create(r)) };
  }
}

/** A task that does nothing and ends immediately. */
export function nothingTask<A>(): TaskAsset<A> {
  return { id: NOTHING_TASK, actions: [{ execute: () => ActionResult.STOP }] };
}

export function createTaskLibrary<A>(): Library<TaskAsset<A>> {
  return new Library<TaskAsset<A>>('tasks');
}

// ---------------------------------------------------------------------- jobs

export interface JobCondition {
  readonly name: string;
  readonly expected: boolean;
}
export interface JobEntry {
  readonly taskId: string;
  readonly conditions?: readonly JobCondition[];
}
export interface JobAsset extends Asset {
  readonly order: 'sequential' | 'random';
  readonly tasks: readonly JobEntry[];
}

export type ConditionRegistry<A> = ReadonlyMap<string, (agent: A) => boolean>;

/** Per-agent cursor through a job. */
export class JobState {
  index = 0;
  order: number[] | null = null;
  reset(): void {
    this.index = 0;
    this.order = null;
  }
}

/**
 * Next task id for an agent from a job. A failed guard yields NOTHING_TASK
 * (and still consumes the slot). Random jobs are shuffled once per cycle.
 */
export function nextJobTask<A>(
  job: JobAsset,
  state: JobState,
  agent: A,
  conditions: ConditionRegistry<A>,
  rng: Rng,
): string {
  const n = job.tasks.length;
  if (n === 0) return NOTHING_TASK;
  if (state.index >= n) state.reset();
  if (job.order === 'random' && !state.order) {
    state.order = rng.shuffle(Array.from({ length: n }, (_, i) => i));
  }
  const entry = job.tasks[state.order ? state.order[state.index] : state.index];
  state.index++;
  for (const c of entry.conditions ?? []) {
    const fn = conditions.get(c.name);
    if (!fn) throw new Error(`job "${job.id}": unknown condition "${c.name}"`);
    if (fn(agent) !== c.expected) return NOTHING_TASK;
  }
  return entry.taskId;
}

// -------------------------------------------------------------- single tasks

/** A periodic task that fires on its own timer, independent of the main task. */
export interface SingleTask<A> {
  readonly id: string;
  /** Seconds between firings. */
  readonly interval: number;
  readonly action: Action<A>;
}

// -------------------------------------------------------------------- runner

export interface TaskRunnerOptions<A> {
  readonly tasks: Library<TaskAsset<A>>;
  /** Asked for the next task id when the current one ends (decision system or job). */
  readonly nextTask: (agent: A, ctx: TaskContext) => string | null;
  readonly singles?: readonly SingleTask<A>[];
}

export class TaskRunner<A> {
  currentTaskId: string | null = null;
  jobId: string | null = null;
  actionIndex = 0;
  /** Overrides the next pick once. */
  scheduledTaskId: string | null = null;
  restarts = 0;
  private waitLeft = 0;
  private readonly singleTimers: number[];

  constructor(
    private readonly agent: A,
    private readonly options: TaskRunnerOptions<A>,
  ) {
    this.singleTimers = (options.singles ?? []).map((s) => s.interval);
  }

  /** Start a task now, abandoning the current one. */
  setTask(id: string): void {
    this.options.tasks.get(id);
    this.currentTaskId = id;
    this.actionIndex = 0;
    this.restarts = 0;
    this.waitLeft = 0;
  }

  /** Make `id` the next task picked, ahead of the next-task provider. */
  scheduleTask(id: string): void {
    this.scheduledTaskId = id;
  }

  private finish(): void {
    this.currentTaskId = null;
    this.actionIndex = 0;
    this.waitLeft = 0;
  }

  update(ctx: TaskContext): void {
    this.runSingles(ctx);
    if (this.waitLeft > 0) {
      this.waitLeft -= ctx.dt;
      if (this.waitLeft > 0) return;
      this.waitLeft = 0;
    }
    if (this.currentTaskId === null) {
      const next = this.scheduledTaskId ?? this.options.nextTask(this.agent, ctx);
      this.scheduledTaskId = null;
      if (next === null) return;
      this.setTask(next);
    }
    const task = this.options.tasks.get(this.currentTaskId!);
    for (let skips = 0; skips <= MAX_SKIPS_PER_UPDATE; skips++) {
      if (this.actionIndex >= task.actions.length) return this.finish();
      const action = task.actions[this.actionIndex];
      const result = action.execute(this.agent, ctx);
      if (result === ActionResult.SKIP) {
        this.actionIndex++;
        continue;
      }
      this.waitLeft = action.wait ?? 0;
      switch (result) {
        case ActionResult.CONTINUE:
          this.actionIndex++;
          if (this.actionIndex >= task.actions.length) this.finish();
          break;
        case ActionResult.STOP:
          this.finish();
          break;
        case ActionResult.RESTART_TASK:
          this.actionIndex = 0;
          this.restarts++;
          break;
        case ActionResult.REPEAT:
          break;
      }
      return;
    }
    // SKIP chain exceeded its bound: yield and resume on the next update.
  }

  private runSingles(ctx: TaskContext): void {
    const singles = this.options.singles;
    if (!singles) return;
    for (let i = 0; i < singles.length; i++) {
      this.singleTimers[i] -= ctx.dt;
      if (this.singleTimers[i] <= 0) {
        this.singleTimers[i] += singles[i].interval;
        singles[i].action.execute(this.agent, ctx);
      }
    }
  }
}
