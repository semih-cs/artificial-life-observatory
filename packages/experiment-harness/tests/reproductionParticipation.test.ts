import { describe, it, expect } from 'vitest';
import {
  PARTICIPATION_CHECKPOINTS, deriveReproduction, metricDiffers, mechanismCall,
} from '../src/analysis/reproductionParticipation.js';
import type { BestCut } from '../src/analysis/earlyEstablishment.js';

const cut = (m: number, dir: 'E_low' | 'E_high' = 'E_low'): BestCut =>
  ({ n: 7, misclassified: m, threshold: 0, direction: dir, rangesOverlap: m > 0 });

describe('reproduction participation analysis (§21, precommitted)', () => {
  it('fixes the checkpoints', () => {
    expect([...PARTICIPATION_CHECKPOINTS]).toEqual([3000, 4000, 5000, 6000, 7000, 8000, 9000]);
  });

  it('derives reproducers and births per reproducer exactly, and the identity f x I = B / (25 + B) holds', () => {
    const d = deriveReproduction(12 / 85, 60);
    expect(d.reproducers).toBe(12);
    expect(d.birthsPerReproducer).toBe(5);
    expect(d.fraction * d.birthsPerReproducer!).toBeCloseTo(60 / 85, 12);
    expect(deriveReproduction(0, 0).birthsPerReproducer).toBeNull();
    expect(() => deriveReproduction(0.123456, 60)).toThrow();
  });

  it('a metric differs only with a sustained CLEAR from 4000 on', () => {
    expect(metricDiffers([cut(0), cut(2), cut(2), cut(2), cut(2), cut(2), cut(2)]).differs).toBe(false); // 3000 does not count
    expect(metricDiffers([cut(3), cut(0), cut(1), cut(0), cut(0), cut(1), cut(0)])).toEqual({ differs: true, from: 4000, direction: 'L_higher' });
    expect(metricDiffers([cut(3), cut(0), cut(2), cut(0), cut(0), cut(0), cut(0)])).toEqual({ differs: true, from: 6000, direction: 'L_higher' });
    expect(metricDiffers([cut(3), cut(1), cut(1), cut(1), cut(1), cut(1), cut(1)]).differs).toBe(false);
    expect(metricDiffers([cut(2), cut(0, 'E_high'), cut(0, 'E_high'), cut(0, 'E_high'), cut(1, 'E_high'), cut(0, 'E_high'), cut(0, 'E_high')]).direction).toBe('L_lower');
  });

  it('maps to the precommitted mechanism call', () => {
    const up = { differs: true, from: 4000, direction: 'L_higher' as const };
    const down = { differs: true, from: 4000, direction: 'L_lower' as const };
    const no = { differs: false, from: null, direction: null };
    expect(mechanismCall(up, no)).toBe('A_PARTICIPATION');
    expect(mechanismCall(no, up)).toBe('B_REPEAT_REPRODUCTION');
    expect(mechanismCall(up, up)).toBe('C_MIXED');
    expect(mechanismCall(no, no)).toBe('D_NOT_IDENTIFIABLE');
    expect(mechanismCall(down, up)).toBe('D_NOT_IDENTIFIABLE');
    expect(mechanismCall(up, down)).toBe('D_NOT_IDENTIFIABLE');
    expect(mechanismCall(down, no)).toBe('D_NOT_IDENTIFIABLE');
  });
});
