import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { DecisionMind, DecisionSystem, defineDecision } from './decision';
import {
  ActionRegistry,
  ActionResult as R,
  type ActionResultCode,
  JobState,
  NOTHING_TASK,
  TaskRunner,
  createTaskLibrary,
  nextJobTask,
  nothingTask,
  type Action,
  type JobAsset,
  type TaskAsset,
  type TaskContext,
} from './task';

interface Toy {
  log: string[];
}
const mk = (): Toy => ({ log: [] });
const act = (name: string, result: ActionResultCode, wait?: number): Action<Toy> => ({
  execute: (a) => (a.log.push(name), result),
  wait,
});
const ctxAt = (now: number, dt = 1): TaskContext => ({ now, dt, rng: new Rng(1) });

function runner(toy: Toy, tasks: TaskAsset<Toy>[], next: () => string | null = () => null, singles = []) {
  const lib = createTaskLibrary<Toy>();
  for (const t of tasks) lib.add(t);
  return new TaskRunner<Toy>(toy, { tasks: lib, nextTask: next, singles });
}

describe('TaskRunner result codes', () => {
  it('CONTINUE advances one action per update then asks for the next task', () => {
    const t = mk();
    let asked = 0;
    const r = runner(t, [{ id: 'x', actions: [act('a', R.CONTINUE), act('b', R.CONTINUE)] }], () => (asked++ ? null : 'x'));
    r.update(ctxAt(0));
    expect(t.log).toEqual(['a']);
    r.update(ctxAt(1));
    expect(t.log).toEqual(['a', 'b']);
    expect(r.currentTaskId).toBeNull();
    r.update(ctxAt(2));
    expect(asked).toBe(2);
    expect(t.log).toEqual(['a', 'b']);
  });

  it('STOP ends the task immediately', () => {
    const t = mk();
    const r = runner(t, [{ id: 'x', actions: [act('a', R.STOP), act('b', R.CONTINUE)] }]);
    r.setTask('x');
    r.update(ctxAt(0));
    expect(t.log).toEqual(['a']);
    expect(r.currentTaskId).toBeNull();
  });

  it('REPEAT reruns the same action', () => {
    const t = mk();
    const r = runner(t, [{ id: 'x', actions: [act('a', R.REPEAT), act('b', R.CONTINUE)] }]);
    r.setTask('x');
    r.update(ctxAt(0));
    r.update(ctxAt(1));
    expect(t.log).toEqual(['a', 'a']);
    expect(r.actionIndex).toBe(0);
  });

  it('RESTART_TASK goes back to the first action and counts', () => {
    const t = mk();
    const r = runner(t, [{ id: 'x', actions: [act('a', R.CONTINUE), act('b', R.RESTART_TASK)] }]);
    r.setTask('x');
    for (let i = 0; i < 3; i++) r.update(ctxAt(i));
    expect(t.log).toEqual(['a', 'b', 'a']);
    expect(r.restarts).toBe(1);
  });

  it('SKIP runs the next action in the same update, bounded', () => {
    const t = mk();
    const r = runner(t, [{ id: 'x', actions: [act('a', R.SKIP), act('b', R.SKIP), act('c', R.CONTINUE)] }]);
    r.setTask('x');
    r.update(ctxAt(0));
    expect(t.log).toEqual(['a', 'b', 'c']);

    const t2 = mk();
    const loop: Action<Toy> = {
      execute: (a) => (a.log.push('l'), R.SKIP),
    };
    const r2 = runner(t2, [{ id: 'y', actions: [loop] }]);
    r2.setTask('y');
    r2.update(ctxAt(0));
    expect(t2.log.length).toBeLessThan(100);
  });

  it('wait delays the next action', () => {
    const t = mk();
    const r = runner(t, [{ id: 'x', actions: [act('a', R.CONTINUE, 2.5), act('b', R.CONTINUE)] }]);
    r.setTask('x');
    r.update(ctxAt(0));
    r.update(ctxAt(1));
    r.update(ctxAt(2));
    expect(t.log).toEqual(['a']);
    r.update(ctxAt(3));
    expect(t.log).toEqual(['a', 'b']);
  });

  it('scheduled task overrides the next pick', () => {
    const t = mk();
    const r = runner(t, [
      { id: 'x', actions: [act('x', R.STOP)] },
      { id: 's', actions: [act('s', R.STOP)] },
    ], () => 'x');
    r.scheduleTask('s');
    r.update(ctxAt(0));
    r.update(ctxAt(1));
    expect(t.log).toEqual(['s', 'x']);
  });

  it('builds tasks from data via the action registry', () => {
    const reg = new ActionRegistry<Toy>().register('say', (p) => ({
      execute: (a) => (a.log.push(String(p.text)), R.CONTINUE),
    }));
    const task = reg.build({ id: 'd', actions: [{ id: 'say', params: { text: 'hi' } }, { id: 'say', params: { text: 'yo' } }] });
    const t = mk();
    const r = runner(t, [task]);
    r.setTask('d');
    r.update(ctxAt(0));
    r.update(ctxAt(1));
    expect(t.log).toEqual(['hi', 'yo']);
    expect(() => reg.create({ id: 'nope' })).toThrow();
  });

  it('single tasks fire on their own schedule, independent of the main task', () => {
    const t = mk();
    const single = { id: 's', interval: 3, action: act('tick', R.CONTINUE) };
    const r = runner(t, [{ id: 'x', actions: [act('m', R.REPEAT)] }], () => null, [single] as never);
    r.setTask('x');
    for (let i = 1; i <= 7; i++) r.update(ctxAt(i));
    expect(t.log.filter((l) => l === 'tick')).toHaveLength(2);
    expect(t.log.filter((l) => l === 'm')).toHaveLength(7);
  });

  it('is driven by the decision system for creatures', () => {
    const t = mk() as Toy & { mind: DecisionMind<Toy & { mind: never }> };
    type T = typeof t;
    const sys = new DecisionSystem<T>(() => t.mind as unknown as DecisionMind<T>).addList(() => [
      defineDecision<T>({ id: 'x', cooldown: 100 }),
    ]);
    t.mind = new DecisionMind() as never;
    const rng = new Rng(3);
    const r = runner(t, [{ id: 'x', actions: [act('x', R.STOP)] }], () => sys.choose(t, 0, rng)?.id ?? null);
    r.update(ctxAt(0));
    r.update(ctxAt(1));
    r.update(ctxAt(2));
    expect(t.log).toEqual(['x']);
  });
});

describe('jobs', () => {
  const conds = new Map<string, (a: Toy) => boolean>([['yes', () => true]]);

  it('sequential job cycles and failed guards give the nothing task', () => {
    const job: JobAsset = {
      id: 'j',
      order: 'sequential',
      tasks: [
        { taskId: 'a' },
        { taskId: 'b', conditions: [{ name: 'yes', expected: false }] },
        { taskId: 'c', conditions: [{ name: 'yes', expected: true }] },
      ],
    };
    const st = new JobState();
    const rng = new Rng(1);
    const seq = Array.from({ length: 6 }, () => nextJobTask(job, st, mk(), conds, rng));
    expect(seq).toEqual(['a', NOTHING_TASK, 'c', 'a', NOTHING_TASK, 'c']);
  });

  it('random job visits each entry once per cycle, deterministically', () => {
    const job: JobAsset = { id: 'j', order: 'random', tasks: ['a', 'b', 'c', 'd'].map((taskId) => ({ taskId })) };
    const draw = (seed: number) => {
      const st = new JobState();
      const rng = new Rng(seed);
      return Array.from({ length: 8 }, () => nextJobTask(job, st, mk(), conds, rng));
    };
    const s = draw(5);
    expect([...s.slice(0, 4)].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect([...s.slice(4)].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(draw(5)).toEqual(s);
  });

  it('runner can use a job as its next-task provider', () => {
    const job: JobAsset = { id: 'j', order: 'sequential', tasks: [{ taskId: 'a' }, { taskId: 'b', conditions: [{ name: 'yes', expected: false }] }] };
    const st = new JobState();
    const rng = new Rng(1);
    const t = mk();
    const r = runner(t, [{ id: 'a', actions: [act('a', R.STOP)] }, nothingTask<Toy>()], () => nextJobTask(job, st, t, conds, rng));
    for (let i = 0; i < 3; i++) r.update(ctxAt(i));
    expect(t.log).toEqual(['a', 'a']);
  });
});
