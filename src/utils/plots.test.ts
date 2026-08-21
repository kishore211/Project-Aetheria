import { describe, expect, it, beforeEach } from 'vitest';
import type { Entity } from '../types/world';
import {
  PLOTS,
  PLOT_LIST,
  createPlot,
  plotRate,
  plotReady,
  plotShare,
  resetPlotIds,
  type PlotKind,
} from './plots';
import type { CivilStats } from './politics';

const makeEntity = (id = 'p1'): Entity => ({
  id,
  type: 'human',
  name: 'Schemer',
  age: 30,
  maxAge: 70,
  health: 100,
  maxHealth: 100,
  position: { x: 0, y: 0 },
  attributes: { strength: 5, intelligence: 5, speed: 5, resilience: 5 },
  needs: { hunger: 1, thirst: 1, rest: 1, social: 1 },
  inventory: [],
  status: [],
});

const stats = (over: Partial<CivilStats> = {}): CivilStats => ({
  diplomacy: 5, warfare: 5, stewardship: 5, intrigue: 5, ...over,
});

describe('the plot table', () => {
  it('describes every scheme, with a glyph and a target', () => {
    for (const def of PLOT_LIST) {
      // "War" is three characters and none the worse for it.
      expect(def.label.length).toBeGreaterThanOrEqual(3);
      expect(def.description.length).toBeGreaterThan(20);
      expect(def.glyph.length).toBeGreaterThan(0);
      expect(def.target).toBeGreaterThan(0);
    }
  });

  it('marks the schemes that hurt somebody', () => {
    const hostile = PLOT_LIST.filter(def => def.hostile).map(def => def.kind).sort();
    expect(hostile).toEqual(['coup', 'rebellion', 'war']);
  });

  it('drives each scheme off a stat that suits it', () => {
    expect(PLOTS.rebellion.driver).toBe('intrigue');
    expect(PLOTS.coup.driver).toBe('intrigue');
    expect(PLOTS.war.driver).toBe('warfare');
    expect(PLOTS.peace.driver).toBe('diplomacy');
    expect(PLOTS.alliance.driver).toBe('diplomacy');
    expect(PLOTS.festival.driver).toBe('stewardship');
  });
});

describe('plot progress', () => {
  beforeEach(resetPlotIds);

  it('gives every plot a distinct id', () => {
    const a = createPlot('war', makeEntity('a'), 'k1', 'k2');
    const b = createPlot('war', makeEntity('b'), 'k1', 'k2');
    expect(a.id).not.toBe(b.id);
  });

  it('starts at nothing and is not ready', () => {
    const plot = createPlot('coup', makeEntity(), 'k1');
    expect(plot.progress).toBe(0);
    expect(plotShare(plot)).toBe(0);
    expect(plotReady(plot)).toBe(false);
  });

  it('runs faster for a plotter with the right talent', () => {
    const plot = createPlot('rebellion', makeEntity(), 'v1');
    const cunning = plotRate(plot, stats({ intrigue: 10 }));
    const plodding = plotRate(plot, stats({ intrigue: 1 }));
    expect(cunning).toBeGreaterThan(plodding);
  });

  it('ignores stats the scheme does not turn on', () => {
    const plot = createPlot('festival', makeEntity(), 'k1');
    const same = plotRate(plot, stats({ intrigue: 10 }));
    const base = plotRate(plot, stats({ intrigue: 1 }));
    expect(same).toBe(base);
  });

  it('runs faster with more people in on it', () => {
    const alone = createPlot('rebellion', makeEntity(), 'v1');
    const crowd = createPlot('rebellion', makeEntity('b'), 'v1');
    crowd.conspirators = 6;
    expect(plotRate(crowd, stats())).toBeGreaterThan(plotRate(alone, stats()));
  });

  it('takes long enough to be a warning rather than a notification', () => {
    // The whole value of a plot is that the player can see it coming and
    // intervene. A scheme that fires in five seconds is just an event.
    for (const def of PLOT_LIST) {
      const plot = createPlot(def.kind as PlotKind, makeEntity(), 'x');
      const seconds = def.target / plotRate(plot, stats());
      expect(seconds, def.kind).toBeGreaterThan(15);
      expect(seconds, def.kind).toBeLessThan(220);
    }
  });

  it('stays a warning even for the ablest plotter with a village behind them', () => {
    // The first draft scaled the conspiracy bonus linearly and a wretched
    // village of fourteen got its rebellion away in five seconds, which is not
    // a warning at all. Verified against the worst case rather than the
    // typical one.
    for (const def of PLOT_LIST) {
      const plot = createPlot(def.kind as PlotKind, makeEntity(), 'x');
      plot.conspirators = 40;
      const best = stats({ diplomacy: 10, warfare: 10, stewardship: 10, intrigue: 10 });
      const seconds = def.target / plotRate(plot, best);
      expect(seconds, def.kind).toBeGreaterThan(10);
    }
  });

  it('saturates the conspiracy bonus rather than letting it run away', () => {
    const few = createPlot('rebellion', makeEntity(), 'v1');
    few.conspirators = 4;
    const many = createPlot('rebellion', makeEntity('b'), 'v1');
    many.conspirators = 40;
    // More hands still help...
    expect(plotRate(many, stats())).toBeGreaterThan(plotRate(few, stats()));
    // ...but never by more than doubling.
    const alone = createPlot('rebellion', makeEntity('c'), 'v1');
    expect(plotRate(many, stats())).toBeLessThanOrEqual(plotRate(alone, stats()) * 2);
  });

  it('clamps the share, so an overshoot cannot draw past the end of the bar', () => {
    const plot = createPlot('war', makeEntity(), 'k1', 'k2');
    plot.progress = PLOTS.war.target * 5;
    expect(plotShare(plot)).toBe(1);
    expect(plotReady(plot)).toBe(true);
  });

  it('reaches ready exactly at its target, not before', () => {
    const plot = createPlot('peace', makeEntity(), 'k1', 'k2');
    plot.progress = PLOTS.peace.target - 0.01;
    expect(plotReady(plot)).toBe(false);
    plot.progress = PLOTS.peace.target;
    expect(plotReady(plot)).toBe(true);
  });
});
