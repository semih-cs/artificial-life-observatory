/**
 * Offline probe evaluation (Spec v4 §11.39 [LOCKED]: probe evaluation is
 * observational and side-effect free).
 *
 * The evaluator takes a COPY-BY-READ of a NeuralGenome and a fixed ProbeSet
 * and returns raw controller outputs. It:
 *
 *   - consumes no CanonicalRNG and no RNG at all,
 *   - never writes to the genome, an organism, or a WorldState,
 *   - never touches simulation configuration,
 *   - produces no fitness score, no intelligence score and no ranking.
 *
 * It reuses simulation-core's `evaluateNetwork`, which §11.36 already
 * guarantees is a pure deterministic function of (genome, input).
 */

import { evaluateNetwork, NEURAL_OUTPUT_SIZE } from '@alo/simulation-core';
import type { NeuralGenome } from '@alo/simulation-core';
import { DEFAULT_PROBE_SET, ProbeSet } from './probeSet.js';

export interface ProbeResponse {
  /** Index of the probe state that produced this response. */
  readonly index: number;
  readonly forward: number;
  readonly turn: number;
  readonly eat: number;
  readonly reproduce: number;
}

export interface ProbeEvaluation {
  readonly probeSetId: string;
  readonly probeSetContentHash: string;
  readonly hiddenSize: number;
  readonly responses: readonly ProbeResponse[];
}

/**
 * Infer the hidden-layer size from the genome itself, so a caller cannot
 * silently evaluate a genome against a mismatched topology.
 */
export function hiddenSizeOf(genome: NeuralGenome): number {
  const hiddenSize = genome.hiddenBiases.length;
  if (hiddenSize <= 0) throw new Error('probe: genome has no hidden units');
  if (genome.outputBiases.length !== NEURAL_OUTPUT_SIZE) {
    throw new Error(`probe: expected ${NEURAL_OUTPUT_SIZE} outputs (§11.59), got ${genome.outputBiases.length}`);
  }
  if (genome.hiddenOutputWeights.length !== NEURAL_OUTPUT_SIZE * hiddenSize) {
    throw new Error('probe: hidden->output weight count does not match topology');
  }
  return hiddenSize;
}

/**
 * Evaluate one neural genome against a fixed probe set.
 * Deterministic: identical (genome, probeSet) always yields identical output.
 */
export function evaluateProbeSet(
  genome: NeuralGenome,
  probeSet: ProbeSet = DEFAULT_PROBE_SET
): ProbeEvaluation {
  const hiddenSize = hiddenSizeOf(genome);
  const responses: ProbeResponse[] = new Array(probeSet.probes.length);

  for (let i = 0; i < probeSet.probes.length; i++) {
    const probe = probeSet.probes[i]!;
    const out = evaluateNetwork(genome, probe.input, hiddenSize);
    responses[i] = {
      index: probe.index,
      forward: out.forward,
      turn: out.turn,
      eat: out.eat,
      reproduce: out.reproduce,
    };
  }

  return {
    probeSetId: probeSet.probeSetId,
    probeSetContentHash: probeSet.contentHash,
    hiddenSize,
    responses,
  };
}
