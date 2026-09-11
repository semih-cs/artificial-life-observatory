import { V1_NEURAL_INPUT_SIZE } from '../model/simulationModel.js';

/**
 * Heritable genome state. Immutable during an organism's lifetime (§11.34,
 * restated normatively in §11.59) — nothing in `biology/` or `world/` may
 * mutate a stored genome in place; mutation only ever happens when a NEW
 * genome is derived for a child (biology/mutation.ts), never on an existing
 * organism's own genome object.
 */

export interface MorphologyGenome {
  readonly size: number;
  readonly maxSpeed: number;
  readonly visionRange: number;
  readonly visionAngle: number;
  readonly metabolism: number;
}

/**
 * Fixed-topology feedforward network parameters: one hidden layer.
 * Parameter order is fixed and load-bearing for deterministic draw order
 * (§13.76): inputHiddenWeights, hiddenBiases, hiddenOutputWeights, outputBiases.
 */
export interface NeuralGenome {
  readonly inputHiddenWeights: readonly number[]; // [hiddenSize x inputSize], row-major
  readonly hiddenBiases: readonly number[]; // [hiddenSize]
  readonly hiddenOutputWeights: readonly number[]; // [outputSize x hiddenSize], row-major
  readonly outputBiases: readonly number[]; // [outputSize]
}

export interface Genome {
  readonly morphology: MorphologyGenome;
  readonly neural: NeuralGenome;
}

/**
 * The historical §11.58 input count — six unique inputs, indices 0-5 — of the
 * v1 models 0A.1.0 and 0A.2.0 ([LOCKED] for those models). It is NOT a global
 * constant any more: the input dimension is model-specific and comes from
 * `simulationModel(simulationVersion).neuralInputSize` (0A.3.0 has 10).
 * Functions that take an `inputSize` default to this value so every v1 call
 * site keeps its exact historical meaning.
 */
export const NEURAL_INPUT_SIZE = V1_NEURAL_INPUT_SIZE;
export const NEURAL_OUTPUT_SIZE = 4; // forward, turn, eat, reproduce — §11.59

export function cloneMorphology(m: MorphologyGenome): MorphologyGenome {
  return { size: m.size, maxSpeed: m.maxSpeed, visionRange: m.visionRange, visionAngle: m.visionAngle, metabolism: m.metabolism };
}

export function cloneNeural(n: NeuralGenome): NeuralGenome {
  return {
    inputHiddenWeights: [...n.inputHiddenWeights],
    hiddenBiases: [...n.hiddenBiases],
    hiddenOutputWeights: [...n.hiddenOutputWeights],
    outputBiases: [...n.outputBiases],
  };
}

export function cloneGenome(g: Genome): Genome {
  return { morphology: cloneMorphology(g.morphology), neural: cloneNeural(g.neural) };
}
