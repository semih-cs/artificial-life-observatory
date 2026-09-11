/**
 * `continuation-multifounder-default-v1` (pilot report §18, precommitted in
 * a8faf6a). Continues the six 0A.2.0 default-baseline seeds that the v1 cap
 * stopped, so the full 15-seed profile can be classified by
 * trajectory-outcome-v2. NOT a qualification attempt: the gate is already FAIL.
 * Every value below is transcribed from the precommitment.
 */

import { cloneConfig, DEFAULT_SIMULATION_CONFIG } from '@alo/simulation-core';
import type { ExperimentSpec } from '../types.js';

export const BASELINE_CONTINUATION_ID = 'continuation-multifounder-default-v1';
export const BASELINE_CONTINUATION_HORIZON = 20000;
/** EXECUTION SAFETY LIMIT (§15.5), not biology and not a classification rule. */
export const BASELINE_CONTINUATION_SAFETY_CEILING = 1000;

export interface BaselineCheckpoint {
  tick: number;
  hash: string;
  population: number;
  births: number;
  deaths: number;
  food: number;
}

/**
 * §18.2: the persisted baseline state at each stop tick
 * (results/multifounder-default-baseline/replicates.json, commit d9dfb92).
 */
export const BASELINE_CONTINUATION_CHECKPOINTS: Readonly<Record<number, BaselineCheckpoint>> = {
  115838: { tick: 3389, hash: '187ce9dba4a57f07', population: 200, births: 259, deaths: 84, food: 60 },
  155433: { tick: 3597, hash: 'f324c5ff4e03f447', population: 200, births: 371, deaths: 196, food: 60 },
  163352: { tick: 3782, hash: '11e00e24d8788908', population: 200, births: 425, deaths: 250, food: 56 },
  171271: { tick: 6444, hash: 'ec2ca3f9ae35a43b', population: 200, births: 466, deaths: 291, food: 53 },
  179190: { tick: 3587, hash: 'bfff9ef115a23623', population: 200, births: 289, deaths: 114, food: 57 },
  202947: { tick: 18876, hash: 'b6fbde0b63d26a5d', population: 200, births: 1484, deaths: 1309, food: 57 },
};

export const BASELINE_CONTINUATION_SEEDS = [115838, 155433, 163352, 171271, 179190, 202947] as const;

export function baselineContinuation(): ExperimentSpec {
  return {
    experimentId: BASELINE_CONTINUATION_ID,
    description:
      'Continuation of the six cap-stopped 0A.2.0 default-baseline seeds (pilot report §18): defaults unchanged, ' +
      '200 cap not an early stop, execution safety ceiling 1000. Descriptive only; the gate is already FAIL.',
    baseConfigFactory: () => cloneConfig(DEFAULT_SIMULATION_CONFIG),
    conditions: [{
      // Same condition id as the baseline so the persisted records line up seed by seed.
      conditionId: 'multifounder-default',
      configOverrides: (_c) => {
        // Deliberately empty: every parameter stays at DEFAULT_SIMULATION_CONFIG.
      },
    }],
    seeds: [...BASELINE_CONTINUATION_SEEDS],
    maxTicks: BASELINE_CONTINUATION_HORIZON,
    metricsSampleInterval: 200,
    stopOnExtinction: true,
    runawayCapEnabled: false,
    safetyPopulationCeiling: BASELINE_CONTINUATION_SAFETY_CEILING,
  };
}
