import { describe, expect, it } from 'vitest';
import { angleDelta, displayProgress, lerp, lerpAngle, updateIntervalEstimate, wrapAngle, MIN_FRAME_INTERVAL_MS, MAX_FRAME_INTERVAL_MS } from '../src/world/interpolation.js';

const TWO_PI = Math.PI * 2;

describe('display interpolation', () => {
  it('position interpolation stays within the two received states', () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(lerp(10, 20, 1)).toBe(20);
    // never extrapolates beyond the newest frame
    expect(lerp(10, 20, 1.7)).toBe(20);
    expect(lerp(10, 20, -3)).toBe(10);
  });

  it('progress saturates at 1 when frames stop arriving', () => {
    expect(displayProgress(0, 100)).toBe(0);
    expect(displayProgress(50, 100)).toBe(0.5);
    expect(displayProgress(100, 100)).toBe(1);
    expect(displayProgress(5000, 100)).toBe(1);
    expect(displayProgress(10, 0)).toBe(1);
  });

  it('heading interpolation takes the shortest arc across the 0 / 2π wrap', () => {
    const a = 0.1;
    const b = TWO_PI - 0.1; // 0.2 rad apart across the wrap
    expect(angleDelta(a, b)).toBeCloseTo(-0.2, 9);
    const mid = lerpAngle(a, b, 0.5);
    expect(Math.min(mid, TWO_PI - mid)).toBeCloseTo(0, 9); // exactly on the wrap, not at π
    expect(lerpAngle(a, b, 0)).toBeCloseTo(a, 9);
    expect(lerpAngle(a, b, 1)).toBeCloseTo(b, 9);
  });

  it('heading interpolation handles the opposite direction and normalises', () => {
    expect(lerpAngle(TWO_PI - 0.1, 0.1, 0.5)).toBeCloseTo(0, 9);
    expect(lerpAngle(1, 2, 0.25)).toBeCloseTo(1.25, 9);
    expect(lerpAngle(-0.5, 0.5, 0.5)).toBeCloseTo(0, 9);
    for (const v of [-7, -1, 0, 1, 7, 100]) {
      const w = wrapAngle(v);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThan(TWO_PI);
    }
  });

  it('bounds the frame interval estimate', () => {
    expect(updateIntervalEstimate(100, 100_000)).toBeLessThanOrEqual(MAX_FRAME_INTERVAL_MS);
    expect(updateIntervalEstimate(100, 0)).toBeGreaterThanOrEqual(MIN_FRAME_INTERVAL_MS);
    const next = updateIntervalEstimate(100, 200, 0.5);
    expect(next).toBe(150);
  });
});
