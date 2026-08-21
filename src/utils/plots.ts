// Plots.
//
// The best design idea in WorldBox, and the cheapest to state: important people
// plan things *in advance*, an icon appears above the plotter and fills as the
// scheme progresses, and the player can open it to see who is planning what and
// how far along they are — or kill them, or bless them out of it
// (06-WORLDBOX-COMPLETE-REFERENCE.md §7).
//
// What makes it good is that it converts the simulation's decisions from
// *events* into *forecasts*. A war that simply happens is a line in a log. A
// war you watched a king spend two minutes preparing, and could have prevented
// by dropping a meteor on him, is a story you were part of.
//
// Ours has six schemes rather than twenty-eight, because six is what our
// simulation can actually carry out. Every one of them ends in something the
// systems already do.

import type { Entity } from '../types/world';
import type { CivilStats } from './politics';

export type PlotKind =
  | 'rebellion'   // a governor prepares to take his province out
  | 'coup'        // a subject prepares to take the crown
  | 'war'         // a king prepares to attack a neighbour
  | 'peace'       // a king prepares to end a war
  | 'alliance'    // a king prepares to bind a neighbour to him
  | 'festival';   // somebody prepares to cheer the place up

export interface PlotDef {
  kind: PlotKind;
  label: string;
  /** Shown when the player opens it. */
  description: string;
  /** Glyph above the plotter's head. */
  glyph: string;
  /** Progress needed to fire. */
  target: number;
  /** Which civil stat drives progress. */
  driver: keyof CivilStats;
  /** True for schemes that harm whoever is being plotted against. */
  hostile: boolean;
}

export const PLOTS: Record<PlotKind, PlotDef> = {
  rebellion: {
    kind: 'rebellion', label: 'Rebellion',
    description: 'Taking this province out of the kingdom, and daring anyone to stop it.',
    glyph: '\u{1F5E1}', target: 60, driver: 'intrigue', hostile: true,
  },
  coup: {
    kind: 'coup', label: 'Coup',
    description: 'Removing the ruler and sitting down in the chair afterwards.',
    glyph: '\u{1F452}', target: 70, driver: 'intrigue', hostile: true,
  },
  war: {
    kind: 'war', label: 'War',
    description: 'Building a case for attacking a neighbour, and the army to do it.',
    glyph: '⚔', target: 55, driver: 'warfare', hostile: true,
  },
  peace: {
    kind: 'peace', label: 'Peace',
    description: 'Quietly finding out what it would take to stop the fighting.',
    glyph: '\u{1F54A}', target: 50, driver: 'diplomacy', hostile: false,
  },
  alliance: {
    kind: 'alliance', label: 'Alliance',
    description: 'Binding another crown to this one, before somebody else does.',
    glyph: '\u{1F91D}', target: 60, driver: 'diplomacy', hostile: false,
  },
  festival: {
    kind: 'festival', label: 'Festival',
    description: 'A feast, on the theory that a fed village complains less.',
    glyph: '\u{1F389}', target: 35, driver: 'stewardship', hostile: false,
  },
};

export interface Plot {
  id: string;
  kind: PlotKind;
  /** Who is scheming. */
  plotterId: string;
  /** Their village, for a rebellion; their kingdom otherwise. */
  subjectId: string;
  /** The other kingdom, for war, peace and alliance plots. */
  targetKingdomId: string | null;
  progress: number;
  /** Simulated seconds since it started, for the "planning since" readout. */
  age: number;
  /** How many people are in on it. Speeds progress. */
  conspirators: number;
}

let nextPlotId = 1;

export const createPlot = (
  kind: PlotKind,
  plotter: Entity,
  subjectId: string,
  targetKingdomId: string | null = null,
): Plot => ({
  id: `plot-${nextPlotId++}`,
  kind,
  plotterId: plotter.id,
  subjectId,
  targetKingdomId,
  progress: 0,
  age: 0,
  conspirators: 1,
});

/**
 * Extra speed from having help, capped.
 *
 * The first draft scaled linearly at 0.35 per conspirator, which looked
 * reasonable and was not: a village of fourteen uniformly wretched people gave
 * a 5.5x multiplier and got its rebellion away in five seconds. A plot that
 * fires before the player can notice the icon is just an event with extra
 * steps, so the bonus saturates — more hands still help, but they cannot skip
 * the warning.
 */
const conspiracyBonus = (conspirators: number): number =>
  1 + Math.min(1, (conspirators - 1) * 0.12);

/**
 * Progress per simulated second.
 *
 * Driven by the relevant civil stat, so a cunning governor gets his rebellion
 * away faster than a plodding one — which is what makes intrigue worth reading
 * on the inspector. Scaled so even the ablest plotter with a full village
 * behind them needs a good fifteen seconds, and a dull one alone needs a
 * couple of minutes.
 */
export const plotRate = (plot: Plot, stats: CivilStats): number => {
  const def = PLOTS[plot.kind];
  const driver = stats[def.driver];
  return (0.5 + driver * 0.12) * conspiracyBonus(plot.conspirators);
};

/** 0-1, for the ring that fills above the plotter's head. */
export const plotShare = (plot: Plot): number =>
  Math.max(0, Math.min(1, plot.progress / PLOTS[plot.kind].target));

export const plotReady = (plot: Plot): boolean =>
  plot.progress >= PLOTS[plot.kind].target;

/** Reset the id counter when a new world is built. */
export const resetPlotIds = (): void => {
  nextPlotId = 1;
};

export const PLOT_LIST: PlotDef[] = Object.values(PLOTS);
