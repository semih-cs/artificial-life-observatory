import { describe, it, expect } from 'vitest';
import {
  earlyRecord, groupStat, bestSingleCut, separation, EARLY_TICKS, EARLY_DOUBLING_LEVEL, EarlySample,
} from '../src/analysis/earlyEstablishment.js';

const samples = (pop: (t: number) => number, births: (t: number) => number, energy = 40): EarlySample[] =>
  Array.from({ length: 16 }, (_, i) => i * 200).map(t => ({ tick: t, population: pop(t), birthsCumulative: births(t), meanEnergy: energy }));

describe('early-establishment analysis (§19, precommitted)', () => {
  it('fixes the precommitted ticks and doubling level', () => {
    expect([...EARLY_TICKS]).toEqual([1000, 2000, 3000]);
    expect(EARLY_DOUBLING_LEVEL).toBe(50);
  });

  it('builds a per-seed record; energy is n/a at population 0', () => {
    const r = earlyRecord(1, samples(t => (t >= 3000 ? 0 : 25 + t / 100), t => (t >= 600 ? t / 100 : 0)));
    expect(r.population).toEqual({ 1000: 35, 2000: 45, 3000: 0 });
    expect(r.births).toEqual({ 1000: 10, 2000: 20, 3000: 30 });
    expect(r.meanEnergy[3000]).toBeNull();
    expect(r.meanEnergy[1000]).toBe(40);
    expect(r.minPopulation).toBe(0);
    expect(r.maxPopulation).toBe(53);
    expect(r.firstTickAtDoubling).toBe(2600);
    expect(r.firstTickWithBirth).toBe(600);
    expect(() => earlyRecord(2, samples(() => 1, () => 0).filter(s => s.tick !== 2000))).toThrow();
  });

  it('group statistics exclude n/a', () => {
    expect(groupStat([3, null, 1, 2])).toEqual({ n: 3, median: 2, min: 1, max: 3 });
    expect(groupStat([4, 1, 3, 2])).toEqual({ n: 4, median: 2.5, min: 1, max: 4 });
    expect(groupStat([null])).toEqual({ n: 0, median: null, min: null, max: null });
  });

  it('best single cut and the CLEAR / PARTIAL / NONE rule', () => {
    const clear = bestSingleCut([1, 2, 3], [5, 6, 7, 8]);
    expect(clear).toMatchObject({ misclassified: 0, rangesOverlap: false, direction: 'E_low', threshold: 3 });
    const twoOff = bestSingleCut([1, 2, 6], [5, 7, 8, 9, 0]);
    expect(twoOff.misclassified).toBe(2);
    expect(twoOff.rangesOverlap).toBe(true);
    const reversed = bestSingleCut([9, 8], [1, 2, 3]);
    expect(reversed).toMatchObject({ misclassified: 0, direction: 'E_high' });
    const mixed = bestSingleCut([1, 5, 9, 2, 8], [3, 4, 6, 7, 1, 9, 2, 8, 5, 6]);
    expect(mixed.misclassified).toBeGreaterThanOrEqual(4);
    expect(separation([clear, mixed])).toBe('CLEAR');
    expect(separation([twoOff, mixed])).toBe('PARTIAL');
    expect(separation([mixed])).toBe('NONE');
  });
});
