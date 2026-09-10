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
 * Channel OFF (§13.7, [LOCKED]) means EXACT stored-value inheritance:
 * child[k] === parent[k] for every k, and — importantly — zero RNG draws for
 * that channel, so a disabled channel cannot perturb anything at all.
 *
 * The parent genome is never modified (§13.4). Mutation only ever produces a
 * new genome object for a child.
 */

/** Fixed morphology gene order (§20.72, §13.15). Load-bearing for draw order. */
export const MORPHOLOGY_GENE_ORDER = ['size', 'maxSpeed', 'visionRange', 'visionAngle', 'metabolism'] as const;
export type MorphologyGeneName = (typeof MORPHOLOGY_GENE_ORDER)[number];

/** Fixed neural parameter-block order (§20.72, §13.76). Load-bearing for draw order. */
export const NEURAL_PARAM_ORDER = ['inputHiddenWeights', 'hiddenBiases', 'hiddenOutputWeights', 'outputBiases'] as const;

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
 * When `enabled` is false this returns an exact clone and consumes no RNG.
 */
export function mutateMorphology(
  parent: MorphologyGenome,
  rng: RngStream,
  mutationConfig: MutationConfig,
  bounds: MorphologyGeneBounds
): MorphologyGenome {
  if (!mutationConfig.morphologyMutationEnabled) {
    return cloneMorphology(parent);
  }
  const rate = mutationConfig.morphologyMutationRate;
  const sigma = mutationConfig.morphologyMutationSigma;
  // Field-by-field in fixed order; object literal evaluation order matches
  // MORPHOLOGY_GENE_ORDER, and the intermediate consts make that explicit.
  const size = maybeMutate(parent.size, rng, rate, sigma.size, bounds.size);
  const maxSpeed = maybeMutate(parent.maxSpeed, rng, rate, sigma.maxSpeed, bounds.maxSpeed);
  const visionRange = maybeMutate(parent.visionRange, rng, rate, sigma.visionRange, bounds.visionRange);
  const visionAngle = maybeMutate(parent.visionAngle, rng, rate, sigma.visionAngle, bounds.visionAngle);
  const metabolism = maybeMutate(parent.metabolism, rng, rate, sigma.metabolism, bounds.metabolism);
  return { size, maxSpeed, visionRange, visionAngle, metabolism };
}

/**
 * Neural mutation channel. Parameter blocks are considered in
 * NEURAL_PARAM_ORDER; within a block, ascending index order.
 * When `enabled` is false this returns an exact clone and consumes no RNG.
 */
export function mutateNeural(
  parent: NeuralGenome,
  rng: RngStream,
  mutationConfig: MutationConfig,
  neuralBounds: { min: number; max: number }
): NeuralGenome {
  if (!mutationConfig.neuralMutationEnabled) {
    return cloneNeural(parent);
  }
  const rate = mutationConfig.neuralMutationRate;
  const sigma = mutationConfig.neuralMutationSigma;
  const perturb = (arr: readonly number[]): number[] => {
    const out: number[] = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      out[i] = maybeMutate(arr[i] ?? 0, rng, rate, sigma, neuralBounds);
    }
    return out;
  };
  return {
    inputHiddenWeights: perturb(parent.inputHiddenWeights),
    hiddenBiases: perturb(parent.hiddenBiases),
    hiddenOutputWeights: perturb(parent.hiddenOutputWeights),
    outputBiases: perturb(parent.outputBiases),
  };
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
  return {
    inputHiddenWeights: perturb(founder.inputHiddenWeights),
    hiddenBiases: perturb(founder.hiddenBiases),
    hiddenOutputWeights: perturb(founder.hiddenOutputWeights),
    outputBiases: perturb(founder.outputBiases),
  };
}

export { cloneNeural, cloneMorphology };
