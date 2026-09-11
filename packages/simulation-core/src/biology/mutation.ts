import { Genome, MorphologyGenome, NeuralGenome, cloneMorphology, cloneNeural } from '../genome/types.js';
import { RngStream } from '../rng/rngStream.js';
import { MutationConfig, MorphologyGeneBounds } from '../config/types.js';

/**
 * Inheritance and mutation (§13, §20.72 steps 12-15).
 *
 * Two independently toggleable channels (§13.6, §11.31, §15.7, [LOCKED]):
 * morphologyMutationEnabled and neuralMutationEnabled. Each is evaluated
 * separately, in the fixed parameter order the specification gives, on the
 * CanonicalRNG stream.
 *
 * RNG isolation (§15.7): toggling one mutation channel must NOT perturb the
 * other channel's random sequence. This is achieved within §18.70's
 * two-stream architecture by making every channel's RNG consumption
 * INVARIANT to its enable flag: a disabled channel executes the identical
 * draw schedule it would execute if enabled, then discards the mutated
 * values and returns exact parent clones.
 *
 * Channel OFF (§13.7, [LOCKED]) therefore means:
 *   - child[k] === parent[k] for every k (exact stored-value inheritance),
 *   - the SAME RNG draws are consumed as if the channel were ON,
 *   - downstream channels, offspring placement and heading see identical
 *     CanonicalRNG positions regardless of the flag.
 *
 * The parent genome is never modified (§13.4). Mutation only ever produces a
 * new genome object for a child.
 */

/** Fixed morphology gene order (§20.72, §13.15). Load-bearing for draw order. */
export const MORPHOLOGY_GENE_ORDER = ['size', 'maxSpeed', 'visionRange', 'visionAngle', 'metabolism'] as const;
export type MorphologyGeneName = (typeof MORPHOLOGY_GENE_ORDER)[number];

/** Fixed neural parameter-block order (§20.72, §13.76). Load-bearing for draw order. */
export const NEURAL_PARAM_ORDER = ['inputHiddenWeights', 'hiddenBiases', 'hiddenOutputWeights', 'outputBiases'] as const;

/**
 * The recurrent model's (0A.4.0) fifth block. It is APPENDED after the four
 * historical blocks — draws, mutation and serialization all visit it last —
 * and exists only on recurrent genomes, so a feed-forward genome's draw
 * schedule is exactly the historical one.
 */
export const RECURRENT_PARAM_BLOCK = 'recurrentHiddenWeights' as const;

function clampTo(v: number, b: { min: number; max: number }): number {
  return Math.max(b.min, Math.min(b.max, v));
}

/**
 * Per-parameter mutation draw (§10.30, §13.8):
 *
 *     if rng.nextFloat() < rate:  value += Gaussian(0, sigma); clamp
 *     else:                        value unchanged
 *
 * Exactly one uniform draw is consumed per parameter considered; a Gaussian
 * (two further draws) is consumed only when the parameter actually mutates.
 * Draw count is therefore a deterministic function of the RNG state, which is
 * all determinism requires.
 */
function maybeMutate(value: number, rng: RngStream, rate: number, sigma: number, bounds: { min: number; max: number }): number {
  if (rng.nextFloat() < rate) {
    return clampTo(value + rng.gaussian(0, sigma), bounds);
  }
  return value;
}

/**
 * Morphology mutation channel. Genes are considered in MORPHOLOGY_GENE_ORDER.
 *
 * When `enabled` is false the full draw schedule is still executed (so that
 * downstream RNG consumers see the same state regardless of the flag), but
 * the mutated values are discarded and an exact parent clone is returned.
 */
export function mutateMorphology(
  parent: MorphologyGenome,
  rng: RngStream,
  mutationConfig: MutationConfig,
  bounds: MorphologyGeneBounds
): MorphologyGenome {
  const rate = mutationConfig.morphologyMutationRate;
  const sigma = mutationConfig.morphologyMutationSigma;
  // Always execute the full draw schedule in fixed gene order, consuming
  // the same RNG draws regardless of the enable flag (§15.7 isolation).
  const size = maybeMutate(parent.size, rng, rate, sigma.size, bounds.size);
  const maxSpeed = maybeMutate(parent.maxSpeed, rng, rate, sigma.maxSpeed, bounds.maxSpeed);
  const visionRange = maybeMutate(parent.visionRange, rng, rate, sigma.visionRange, bounds.visionRange);
  const visionAngle = maybeMutate(parent.visionAngle, rng, rate, sigma.visionAngle, bounds.visionAngle);
  const metabolism = maybeMutate(parent.metabolism, rng, rate, sigma.metabolism, bounds.metabolism);

  if (!mutationConfig.morphologyMutationEnabled) {
    // Draws consumed above; return exact parent values (§13.7).
    return cloneMorphology(parent);
  }
  return { size, maxSpeed, visionRange, visionAngle, metabolism };
}

/**
 * Neural mutation channel. Parameter blocks are considered in
 * NEURAL_PARAM_ORDER, then (recurrent genomes only) RECURRENT_PARAM_BLOCK;
 * within a block, ascending index order. Recurrent weights are ordinary
 * neural parameters: same rate, sigma, bounds and enable flag.
 *
 * When `enabled` is false the full draw schedule is still executed (so that
 * downstream RNG consumers see the same state regardless of the flag), but
 * the mutated values are discarded and an exact parent clone is returned.
 */
export function mutateNeural(
  parent: NeuralGenome,
  rng: RngStream,
  mutationConfig: MutationConfig,
  neuralBounds: { min: number; max: number }
): NeuralGenome {
  const rate = mutationConfig.neuralMutationRate;
  const sigma = mutationConfig.neuralMutationSigma;
  const perturb = (arr: readonly number[]): number[] => {
    const out: number[] = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      out[i] = maybeMutate(arr[i] ?? 0, rng, rate, sigma, neuralBounds);
    }
    return out;
  };
  // Always execute the full draw schedule in fixed block/index order,
  // consuming the same RNG draws regardless of the enable flag (§15.7).
  const mutated: { -readonly [K in keyof NeuralGenome]: NeuralGenome[K] } = {
    inputHiddenWeights: perturb(parent.inputHiddenWeights),
    hiddenBiases: perturb(parent.hiddenBiases),
    hiddenOutputWeights: perturb(parent.hiddenOutputWeights),
    outputBiases: perturb(parent.outputBiases),
  };
  if (parent.recurrentHiddenWeights !== undefined) {
    mutated.recurrentHiddenWeights = perturb(parent.recurrentHiddenWeights);
  }

  if (!mutationConfig.neuralMutationEnabled) {
    // Draws consumed above; return exact parent values (§13.7).
    return cloneNeural(parent);
  }
  return mutated;
}

/**
 * Full child genome derivation: exact clone, then morphology channel, then
 * neural channel — in that fixed order (§20.72 steps 12-14).
 */
export function mutateGenome(
  parent: Genome,
  rng: RngStream,
  mutationConfig: MutationConfig,
  bounds: MorphologyGeneBounds,
  neuralBounds: { min: number; max: number }
): Genome {
  return {
    morphology: mutateMorphology(parent.morphology, rng, mutationConfig, bounds),
    neural: mutateNeural(parent.neural, rng, mutationConfig, neuralBounds),
  };
}

/**
 * Bootstrap perturbation (§13.76) — deliberately NOT the mutation path.
 *
 * Bootstrap variation is standing variation around one common founder, not
 * mutation history (§13.33): every gene/parameter is perturbed
 * unconditionally, there is no per-parameter probability gate, and the
 * mutation enable flags do not apply. It runs on BootstrapRNG.
 */
export function perturbMorphologyForBootstrap(
  founder: MorphologyGenome,
  rng: RngStream,
  sigma: { size: number; maxSpeed: number; visionRange: number; visionAngle: number; metabolism: number },
  bounds: MorphologyGeneBounds
): MorphologyGenome {
  const size = clampTo(founder.size + rng.gaussian(0, sigma.size), bounds.size);
  const maxSpeed = clampTo(founder.maxSpeed + rng.gaussian(0, sigma.maxSpeed), bounds.maxSpeed);
  const visionRange = clampTo(founder.visionRange + rng.gaussian(0, sigma.visionRange), bounds.visionRange);
  const visionAngle = clampTo(founder.visionAngle + rng.gaussian(0, sigma.visionAngle), bounds.visionAngle);
  const metabolism = clampTo(founder.metabolism + rng.gaussian(0, sigma.metabolism), bounds.metabolism);
  return { size, maxSpeed, visionRange, visionAngle, metabolism };
}

export function perturbNeuralForBootstrap(
  founder: NeuralGenome,
  rng: RngStream,
  sigma: number,
  neuralBounds: { min: number; max: number }
): NeuralGenome {
  const perturb = (arr: readonly number[]): number[] => {
    const out: number[] = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      out[i] = clampTo((arr[i] ?? 0) + rng.gaussian(0, sigma), neuralBounds);
    }
    return out;
  };
  const perturbed: { -readonly [K in keyof NeuralGenome]: NeuralGenome[K] } = {
    inputHiddenWeights: perturb(founder.inputHiddenWeights),
    hiddenBiases: perturb(founder.hiddenBiases),
    hiddenOutputWeights: perturb(founder.hiddenOutputWeights),
    outputBiases: perturb(founder.outputBiases),
  };
  // Recurrent founders: the appended block is perturbed last, like any neural block.
  if (founder.recurrentHiddenWeights !== undefined) {
    perturbed.recurrentHiddenWeights = perturb(founder.recurrentHiddenWeights);
  }
  return perturbed;
}

export { cloneNeural, cloneMorphology };
