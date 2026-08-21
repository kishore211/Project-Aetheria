import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  MAP_LAYERS,
  isDataLayer,
  nextLayer,
  sampleRamp,
  type MapLayer,
} from './mapLayers';

const target = new THREE.Color();

describe('map layers', () => {
  it('describes every layer it offers', () => {
    for (const entry of MAP_LAYERS) {
      expect(entry.label).toBeTruthy();
      expect(entry.hint).toBeTruthy();
    }
  });

  it('separates data layers from the two that recolour nothing', () => {
    expect(isDataLayer('natural')).toBe(false);
    expect(isDataLayer('political')).toBe(false);
    expect(isDataLayer('height')).toBe(true);
    expect(isDataLayer('fertility')).toBe(true);
  });

  it('cycles forward and back through every layer and wraps', () => {
    const order = MAP_LAYERS.map(entry => entry.id);
    let at: MapLayer = 'natural';
    const seen = new Set<MapLayer>();
    for (let step = 0; step < order.length; step += 1) {
      seen.add(at);
      at = nextLayer(at, 1);
    }
    expect(seen.size).toBe(order.length);
    expect(at).toBe('natural');
    expect(nextLayer('natural', -1)).toBe(order[order.length - 1]);
  });

  it('interpolates between ramp stops rather than snapping', () => {
    // Snapping to the nearest stop produces visible contour bands, which read
    // as quantised data when the data is continuous.
    const distinct = new Set<string>();
    for (let step = 0; step <= 40; step += 1) {
      distinct.add(sampleRamp('height', step / 40, target).getHexString());
    }
    expect(distinct.size).toBeGreaterThan(30);
  });

  it('clamps out-of-range values instead of wrapping to the wrong end', () => {
    const low = sampleRamp('rainfall', 0, target).getHexString();
    const high = sampleRamp('rainfall', 1, target).getHexString();
    expect(sampleRamp('rainfall', -2, target).getHexString()).toBe(low);
    expect(sampleRamp('rainfall', 4, target).getHexString()).toBe(high);
    expect(low).not.toBe(high);
  });

  it('runs each ramp monotonically in lightness, so it survives greyscale', () => {
    // Checked across the whole ramp, not just its ends. A ramp that brightens
    // in the middle makes its two extremes look alike, which is the one
    // confusion a legend cannot fix — and a ramp readable in greyscale is most
    // of what colour-blind accessibility means for a heat map.
    //
    // This caught a real flaw: the first fertility ramp put barren
    // grey-brown and lush green within 0.013 lightness of each other.
    const lightness = (value: number) =>
      sampleRamp(layer, value, target).getHSL({ h: 0, s: 0, l: 0 }).l;

    let layer: 'height' | 'rainfall' | 'fertility' = 'height';
    for (layer of ['height', 'rainfall', 'fertility'] as const) {
      const samples = Array.from({ length: 7 }, (_, step) => lightness(step / 6));
      const rising = samples[6] > samples[0];

      for (let step = 1; step < samples.length; step += 1) {
        const delta = samples[step] - samples[step - 1];
        // A small backward wobble between adjacent stops is tolerable; a
        // reversal is not.
        expect(rising ? delta : -delta).toBeGreaterThan(-0.02);
      }
      expect(Math.abs(samples[6] - samples[0])).toBeGreaterThan(0.3);
    }
  });

  it('keeps temperature on the one hue ramp everybody already knows', () => {
    const cold = sampleRamp('temperature', 0, target).clone();
    const hot = sampleRamp('temperature', 1, target).clone();
    expect(cold.b).toBeGreaterThan(cold.r);
    expect(hot.r).toBeGreaterThan(hot.b);
  });
});
