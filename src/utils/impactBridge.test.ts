import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearImpacts,
  isShaking,
  impactBridge,
  requestFlash,
  requestShake,
  sampleShake,
} from './impactBridge';

describe('camera shake', () => {
  beforeEach(clearImpacts);

  it('returns nothing when nothing has happened', () => {
    expect(isShaking()).toBe(false);
    expect(sampleShake(0.016)).toEqual({ x: 0, y: 0 });
  });

  it('shakes hard at first and dies away to exactly nothing', () => {
    requestShake(1, 0.5);

    const first = Math.abs(sampleShake(0.05).x);
    // Halfway through, the squared decay should have taken most of it
    let elapsed = 0.05;
    let mid = 0;
    while (elapsed < 0.3) {
      mid = Math.abs(sampleShake(0.05).x);
      elapsed += 0.05;
    }
    expect(mid).toBeLessThan(first);

    // And it must reach a true zero, not a small permanent jitter
    while (elapsed < 1) {
      sampleShake(0.05);
      elapsed += 0.05;
    }
    expect(sampleShake(0.05)).toEqual({ x: 0, y: 0 });
    expect(isShaking()).toBe(false);
  });

  it('takes the larger of two overlapping shakes rather than adding them', () => {
    // Two meteors at once should not read as a broken camera.
    requestShake(1, 0.5);
    sampleShake(0.05);
    requestShake(0.3, 0.5);
    expect(impactBridge.shake.amplitude).toBe(1);

    // A bigger one still takes over.
    requestShake(2, 0.5);
    expect(impactBridge.shake.amplitude).toBe(2);
  });

  it('shakes the ground plane harder than it lifts', () => {
    // A jolt, not a lift: the vertical component is deliberately smaller.
    requestShake(4, 1);
    let horizontal = 0;
    let vertical = 0;
    for (let sample = 0; sample < 200; sample += 1) {
      requestShake(4, 1);
      const jolt = sampleShake(0.001);
      horizontal += Math.abs(jolt.x);
      vertical += Math.abs(jolt.y);
    }
    expect(vertical).toBeLessThan(horizontal * 0.75);
  });

  it('stops dead when the world is replaced', () => {
    requestShake(3, 2);
    expect(isShaking()).toBe(true);
    clearImpacts();
    expect(isShaking()).toBe(false);
    expect(sampleShake(0.016)).toEqual({ x: 0, y: 0 });
  });
});

describe('screen flash', () => {
  beforeEach(clearImpacts);

  it('bumps a nonce so the view can restart the animation', () => {
    const before = impactBridge.flash.nonce;
    requestFlash('blood', 0.5);
    expect(impactBridge.flash.nonce).toBe(before + 1);
    expect(impactBridge.flash.tone).toBe('blood');
    expect(impactBridge.flash.strength).toBe(0.5);
  });

  it('clamps strength, so a caller cannot white out the screen', () => {
    requestFlash('impact', 5);
    expect(impactBridge.flash.strength).toBe(1);
    requestFlash('impact', -3);
    expect(impactBridge.flash.strength).toBe(0);
  });
});
