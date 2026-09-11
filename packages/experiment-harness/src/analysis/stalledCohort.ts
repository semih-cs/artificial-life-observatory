/**
 * Stalled-cohort analysis (docs/Phase 0B Pilot Report.md §20, precommitted in
 * d08ce41). READ-ONLY and descriptive. Reuses the §19 statistics; no composite
 * score, no simulation, and any threshold is observational only.
 */

import { bestSingleCut, BestCut } from './earlyEstablishment.js';

export const STALLED_CHECKPOINTS = [4000, 5000, 6000, 7000, 8000, 9000] as const;
/** E* — extinct worlds still alive at tick 3000 (100000 was extinct at 3000). */
export const STALLED_GROUP_E = [131676, 147514, 187109, 195028] as const;
export const STALLED_GROUP_E_EXCLUDED = 100000;
export const STALLED_GROUP_L = [107919, 202947, 210866] as const;

export type StalledStrength = 'CLEAR' | 'STRONG_PARTIAL' | 'WEAK_NONE';

/** §20.5 strength of the best observable at one checkpoint. */
export function stalledStrength(cuts: readonly BestCut[]): StalledStrength {
  const best = Math.min(...cuts.map(c => c.misclassified));
  return best === 0 ? 'CLEAR' : best === 1 ? 'STRONG_PARTIAL' : 'WEAK_NONE';
}

/**
 * §20.5 persistence: for each checkpoint index at which the series reaches
 * `level` or better, whether it stays at or below `level` at every later one.
 */
export function persistsFrom(misclassified: readonly number[], index: number, level: number): boolean {
  return misclassified.slice(index).every(m => m <= level);
}

export { bestSingleCut };
