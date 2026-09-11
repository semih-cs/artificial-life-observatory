/**
 * `diagnostic-reproducer-lifecycle-v1` (pilot report §22, precommitted in
 * ff7e2b1). Observational rerun of the seven stalled-cohort worlds with a
 * read-only life-history recorder. Every value below is transcribed from the
 * precommitment.
 */

import { cloneConfig, DEFAULT_SIMULATION_CONFIG } from '@alo/simulation-core';
import type { ExperimentSpec } from '../types.js';

export const REPRODUCER_LIFECYCLE_ID = 'diagnostic-reproducer-lifecycle-v1';
export const LIFECYCLE_EXTINCT_SEEDS = [131676, 147514, 187109, 195028] as const;
export const LIFECYCLE_LATE_SEEDS = [107919, 202947, 210866] as const;
/** §22.5(b): full timeseries rows compared with the baseline at these ticks. */
export const LIFECYCLE_ROW_CHECK_TICKS = [3000, 5000, 7000, 9000] as const;

/** §22.5(a): exact canonical hashes at each seed's persisted exact checkpoints. */
export const LIFECYCLE_HASH_CHECKPOINTS: Readonly<Record<number, ReadonlyArray<{ tick: number; hash: string; source: string }>>> = {
  131676: [{ tick: 14505, hash: 'c3213619b9c38edf', source: 'multifounder-default-baseline (extinction)' }],
  147514: [{ tick: 9092, hash: 'd796624c0cc0b4f6', source: 'multifounder-default-baseline (extinction)' }],
  187109: [{ tick: 18374, hash: '96a753e86be9dc3a', source: 'multifounder-default-baseline (extinction)' }],
  195028: [{ tick: 9235, hash: '8d14961c1201f613', source: 'multifounder-default-baseline (extinction)' }],
  107919: [
    { tick: 9793, hash: 'da0a52515e7c9bc6', source: 'multifounder-default-baseline (stop state)' },
    { tick: 20000, hash: '93f7b89eaf6b1247', source: 'diagnostic-food-limitation-v1' },
  ],
  202947: [
    { tick: 18876, hash: 'b6fbde0b63d26a5d', source: 'multifounder-default-baseline (stop state)' },
    { tick: 20000, hash: '52633379cc4603fa', source: 'continuation-multifounder-default-v1' },
  ],
  210866: [{ tick: 20000, hash: '16b073462ec8b5c4', source: 'multifounder-default-baseline' }],
};

export function reproducerLifecycleDiagnostic(): ExperimentSpec {
  return {
    experimentId: REPRODUCER_LIFECYCLE_ID,
    description: 'Observational per-organism life-history rerun of the seven stalled-cohort worlds (pilot report §22).',
    baseConfigFactory: () => cloneConfig(DEFAULT_SIMULATION_CONFIG),
    conditions: [{
      conditionId: 'multifounder-default',
      configOverrides: (_c) => {
        // Deliberately empty: every parameter stays at DEFAULT_SIMULATION_CONFIG.
      },
    }],
    seeds: [...LIFECYCLE_EXTINCT_SEEDS, ...LIFECYCLE_LATE_SEEDS],
    maxTicks: 20000,
    metricsSampleInterval: 200,
    stopOnExtinction: true,
    runawayCapEnabled: false,
    safetyPopulationCeiling: 1000,
  };
}
