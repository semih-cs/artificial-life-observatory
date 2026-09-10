/**
 * `diagnostic-food-limitation-v1` (pilot report §15) — every value below is
 * transcribed from the precommitment in commit 6b14031 and must not change.
 *
 * Observational diagnostic of the UNCHANGED 0A.2.0 default ecology: does the
 * §14.29 runaway cap of 200 stop runs before food limitation can appear? It is
 * not a calibration experiment and produces no viable-completion readout.
 */

import { cloneConfig, DEFAULT_SIMULATION_CONFIG } from '@alo/simulation-core';
import type { ExperimentSpec } from '../types.js';

export const FOOD_LIMITATION_DIAGNOSTIC_ID = 'diagnostic-food-limitation-v1';

/** §15.4 — only these three enter the A/B/C rule. */
export const FOOD_LIMITATION_DECISION_SEEDS = [139595, 123757, 107919] as const;
/** §15.4 — reported descriptively; never enters the rule. */
export const FOOD_LIMITATION_REFERENCE_SEED = 210866;

export const FOOD_LIMITATION_HORIZON = 20000; // §15.3
/** §15.5 — EXECUTION SAFETY LIMIT, not a biological threshold. */
export const FOOD_LIMITATION_SAFETY_CEILING = 1000;
export const FOOD_LIMITATION_MILESTONES = [200, 250, 300, 400, 600, 800, 1000] as const; // §15.6
export const FOOD_SCARCITY_WINDOW = 200; // §15.8, ticks
/** §15.8 — half of the default worldFoodCapacity (60). */
export const FOOD_SCARCITY_THRESHOLD = 30;
/** §15.9 — the class boundary between C and A. */
export const FOOD_LIMITATION_NEAR_CAP_LEVEL = 250;

/**
 * §15.9 integrity gate: the canonical hash at the baseline's stopping tick must
 * equal that baseline replicate's finalStateHash
 * (results/multifounder-default-baseline/, commit d9dfb92).
 */
export const FOOD_LIMITATION_INTEGRITY: Readonly<Record<number, { tick: number; hash: string }>> = {
  139595: { tick: 3037, hash: '7bc732eb4dfa8c7b' },
  123757: { tick: 3094, hash: '4c4456bc83b5e842' },
  107919: { tick: 9793, hash: 'da0a52515e7c9bc6' },
  210866: { tick: 20000, hash: '16b073462ec8b5c4' },
};

export function foodLimitationDiagnostic(): ExperimentSpec {
  return {
    experimentId: FOOD_LIMITATION_DIAGNOSTIC_ID,
    description:
      'Food-limitation diagnostic (pilot report §15): 0A.2.0 defaults unchanged, runaway cap not used ' +
      'as an early stop, execution safety ceiling 1000, per-tick food flux recorded. Observational only.',
    baseConfigFactory: () => cloneConfig(DEFAULT_SIMULATION_CONFIG),
    conditions: [{
      conditionId: 'food-limitation',
      configOverrides: (_c) => {
        // Deliberately empty: every parameter stays at DEFAULT_SIMULATION_CONFIG.
      },
    }],
    seeds: [...FOOD_LIMITATION_DECISION_SEEDS, FOOD_LIMITATION_REFERENCE_SEED],
    maxTicks: FOOD_LIMITATION_HORIZON,
    metricsSampleInterval: 200,
    stopOnExtinction: true,
    runawayCapEnabled: false,
    safetyPopulationCeiling: FOOD_LIMITATION_SAFETY_CEILING,
  };
}
