import { describe, it, expect } from 'vitest';
import {
  STALLED_CHECKPOINTS, STALLED_GROUP_E, STALLED_GROUP_E_EXCLUDED, STALLED_GROUP_L, stalledStrength, persistsFrom,
} from '../src/analysis/stalledCohort.js';
import { bestSingleCut } from '../src/analysis/earlyEstablishment.js';

describe('stalled-cohort analysis (§20, precommitted)', () => {
  it('fixes checkpoints and groups', () => {
    expect([...STALLED_CHECKPOINTS]).toEqual([4000, 5000, 6000, 7000, 8000, 9000]);
    expect([...STALLED_GROUP_E]).toEqual([131676, 147514, 187109, 195028]);
    expect(STALLED_GROUP_E_EXCLUDED).toBe(100000);
    expect([...STALLED_GROUP_L]).toEqual([107919, 202947, 210866]);
  });

  it('grades the best observable: 0 CLEAR, 1 STRONG_PARTIAL, >=2 WEAK_NONE', () => {
    const clear = bestSingleCut([1, 2, 3, 4], [7, 8, 9]);
    const one = bestSingleCut([1, 2, 8, 4], [7, 6, 9]);
    const weak = bestSingleCut([1, 9, 5, 8], [2, 6, 7]);
    expect(clear.misclassified).toBe(0);
    expect(one.misclassified).toBe(1);
    expect(weak.misclassified).toBeGreaterThanOrEqual(2);
    expect(stalledStrength([weak, clear])).toBe('CLEAR');
    expect(stalledStrength([weak, one])).toBe('STRONG_PARTIAL');
    expect(stalledStrength([weak])).toBe('WEAK_NONE');
  });

  it('persistence holds only if every later checkpoint stays at or below the level', () => {
    expect(persistsFrom([3, 1, 0, 0], 1, 1)).toBe(true);
    expect(persistsFrom([3, 1, 2, 0], 1, 1)).toBe(false);
    expect(persistsFrom([3, 1, 0, 0], 2, 0)).toBe(true);
  });
});
