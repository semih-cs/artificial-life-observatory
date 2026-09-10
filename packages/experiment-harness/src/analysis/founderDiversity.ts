/**
 * Founder functional diversity — an OBSERVATIONAL summary of how differently the
 * independent founder controllers of one initial world respond to the fixed
 * probe set (pilot report §14.6).
 *
 * The founders are reconstructed by replaying `generateFounderProfiles` on a
 * FRESH BootstrapRNG seeded from the world's root seed — the exact first draws
 * `bootstrapWorld` makes. The replay uses its own stream instance, so no running
 * or persisted world is touched and no CanonicalRNG is consumed. Probe
 * evaluation and functional distance are themselves RNG-free.
 *
 * This is descriptive only. It is not fitness, not a quality ordering, and not
 * a selection criterion: founders are never ranked or chosen by it, and it is
 * not an input to any decision rule.
 */

import { createRngStreams, generateFounderProfiles } from '@alo/simulation-core';
import type { SimulationConfig } from '@alo/simulation-core';
import { evaluateProbeSet } from '../probes/evaluate.js';
import { functionalDistance, FUNCTIONAL_DISTANCE_METHOD } from '../probes/distance.js';
import { DEFAULT_PROBE_SET } from '../probes/probeSet.js';

export interface FounderPairDistance {
  readonly a: number;
  readonly b: number;
  readonly distance: number;
}

export interface FounderDiversitySummary {
  readonly seed: number;
  readonly simulationVersion: string;
  readonly founderCount: number;
  readonly probeSetId: string;
  readonly probeSetContentHash: string;
  readonly distanceMethod: string;
  readonly pairs: readonly FounderPairDistance[];
  /** null when there are fewer than two founders (no pairs). */
  readonly meanDistance: number | null;
  readonly minDistance: number | null;
  readonly maxDistance: number | null;
}

export function founderFunctionalDiversity(config: SimulationConfig): FounderDiversitySummary {
  const founders = generateFounderProfiles(createRngStreams(config.rootSeed).bootstrap, config);
  const evaluations = founders.map((f) => evaluateProbeSet(f.genome.neural, DEFAULT_PROBE_SET));

  const pairs: FounderPairDistance[] = [];
  for (let a = 0; a < evaluations.length; a++) {
    for (let b = a + 1; b < evaluations.length; b++) {
      pairs.push({ a, b, distance: functionalDistance(evaluations[a]!, evaluations[b]!) });
    }
  }

  const distances = pairs.map((p) => p.distance);
  return {
    seed: config.rootSeed,
    simulationVersion: config.simulationVersion,
    founderCount: founders.length,
    probeSetId: DEFAULT_PROBE_SET.probeSetId,
    probeSetContentHash: DEFAULT_PROBE_SET.contentHash,
    distanceMethod: FUNCTIONAL_DISTANCE_METHOD,
    pairs,
    meanDistance: distances.length > 0 ? distances.reduce((s, d) => s + d, 0) / distances.length : null,
    minDistance: distances.length > 0 ? Math.min(...distances) : null,
    maxDistance: distances.length > 0 ? Math.max(...distances) : null,
  };
}
