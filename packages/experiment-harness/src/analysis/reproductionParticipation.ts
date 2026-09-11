/**
 * Reproduction participation vs repeat reproduction (docs/Phase 0B Pilot
 * Report.md §21, precommitted in 18fe6e3). READ-ONLY and descriptive.
 *
 * fractionEverReproduced = distinct ever-reproducers / (25 founders + cumulative
 * births): lifetime cumulative, dead included, founders and descendants mixed.
 * Exactly derivable: R = f x (25 + B) and I = B / R. Note f x I = B / (25 + B).
 * Descendant-only participation after tick 3000 is NOT derivable and is not
 * reconstructed here.
 */

import type { BestCut } from './earlyEstablishment.js';

export const PARTICIPATION_CHECKPOINTS = [3000, 4000, 5000, 6000, 7000, 8000, 9000] as const;
export const FOUNDING_POPULATION = 25;

export interface DerivedReproduction {
  fraction: number;
  births: number;
  /** Distinct organisms that ever reproduced. */
  reproducers: number;
  /** Lifetime births per organism that ever reproduced; null when none has. */
  birthsPerReproducer: number | null;
}

/** Exact derivation from the persisted fields; throws if R is not integral. */
export function deriveReproduction(fraction: number, birthsCumulative: number, founders = FOUNDING_POPULATION): DerivedReproduction {
  const raw = fraction * (founders + birthsCumulative);
  const reproducers = Math.round(raw);
  if (Math.abs(raw - reproducers) > 1e-6) {
    throw new Error(`fractionEverReproduced x (25 + births) = ${raw} is not integral; denominator assumption violated`);
  }
  return {
    fraction,
    births: birthsCumulative,
    reproducers,
    birthsPerReproducer: reproducers > 0 ? birthsCumulative / reproducers : null,
  };
}

export type Direction = 'L_higher' | 'L_lower';

export interface Differs {
  differs: boolean;
  /** Checkpoint at which the sustained CLEAR begins, if any. */
  from: number | null;
  direction: Direction | null;
}

/**
 * §21.5: CLEAR (0 misclassified) at some checkpoint >= 4000 and <= 1 at every
 * later checkpoint. `cuts` is aligned with PARTICIPATION_CHECKPOINTS.
 */
export function metricDiffers(cuts: readonly BestCut[], checkpoints: readonly number[] = PARTICIPATION_CHECKPOINTS): Differs {
  for (let k = 0; k < cuts.length; k++) {
    if (checkpoints[k]! < 4000 || cuts[k]!.misclassified !== 0) continue;
    if (cuts.slice(k).every(c => c.misclassified <= 1)) {
      return { differs: true, from: checkpoints[k]!, direction: cuts[k]!.direction === 'E_low' ? 'L_higher' : 'L_lower' };
    }
  }
  return { differs: false, from: null, direction: null };
}

export type MechanismCall = 'A_PARTICIPATION' | 'B_REPEAT_REPRODUCTION' | 'C_MIXED' | 'D_NOT_IDENTIFIABLE';

/** §21.5 mechanism call from M1 (participation fraction) and M3 (births per reproducer). */
export function mechanismCall(m1: Differs, m3: Differs): MechanismCall {
  const m1Up = m1.differs && m1.direction === 'L_higher';
  const m3Up = m3.differs && m3.direction === 'L_higher';
  if (m1Up && m3Up) return 'C_MIXED';
  if (m1Up && !m3.differs) return 'A_PARTICIPATION';
  if (m3Up && !m1Up && !(m1.differs && m1.direction === 'L_lower')) return 'B_REPEAT_REPRODUCTION';
  return 'D_NOT_IDENTIFIABLE';
}
