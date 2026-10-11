// Map labels.
//
// Names drawn on the world are what turn a coloured surface into a *map* — it
// is the difference between looking at terrain and looking at a place. Ours had
// no labels at all.
//
// The engine owns the projection because only it has the camera; the DOM
// component owns the text because only the DOM renders crisp type. They meet
// here: the engine mutates these objects in place every frame, and the
// component reads x/y off the very same objects in its own animation loop, so
// following the camera never goes through React.
export type LabelKind = 'kingdom' | 'village' | 'battle';

export interface MapLabel {
  id: string;
  kind: LabelKind;
  text: string;
  /** Kingdom colour, for the swatch and the text tint. */
  color: string;
  /** Tile coordinates, the source of truth the engine projects from. */
  tileX: number;
  tileY: number;
  /** Screen position in CSS pixels, written by the engine each frame. */
  screenX: number;
  screenY: number;
  /** 0 when the label should be hidden, up to 1 when fully shown. */
  opacity: number;
  /** Marks a kingdom's first settlement. */
  capital: boolean;
  /** Whose banner to fly beside the name. */
  kingdomId: string | null;
  race: string;
}

/**
 * The live label set. `version` changes only when labels are added or removed,
 * which is what the React component watches; positions change every frame and
 * deliberately do not.
 */
export const labelBridge: { labels: MapLabel[]; version: number } = {
  labels: [],
  version: 0,
};

/** Replace the label set. Called when villages or kingdoms change, not per frame. */
export const publishLabels = (labels: MapLabel[]): void => {
  labelBridge.labels = labels;
  labelBridge.version += 1;
};
