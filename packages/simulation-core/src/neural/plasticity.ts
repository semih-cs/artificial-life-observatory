import { NEURAL_OUTPUT_SIZE } from '../genome/types.js';
import { OrganismRuntimeState } from '../organism/types.js';
import { PlasticityConfig } from '../config/types.js';
import { RawNetworkOutputs } from './network.js';

const centeredOutputs = (raw: RawNetworkOutputs): readonly number[] =>
  [2 * raw.forward - 1, raw.turn, 2 * raw.eat - 1, 2 * raw.reproduce - 1];

/** Advance all 36 eligibility traces exactly once from the activity that produced this tick's action. */
export function updateEligibilityTraces(
  organism: OrganismRuntimeState,
  hiddenActivation: readonly number[],
  raw: RawNetworkOutputs,
  config: PlasticityConfig
): void {
  const weightTraces = organism.hiddenOutputEligibilityTraces;
  const biasTraces = organism.outputBiasEligibilityTraces;
  if (weightTraces === undefined || biasTraces === undefined || weightTraces.length !== hiddenActivation.length * NEURAL_OUTPUT_SIZE || biasTraces.length !== NEURAL_OUTPUT_SIZE) {
    throw new Error(`plasticity: organism ${organism.id} has malformed eligibility state`);
  }
  const centered = centeredOutputs(raw);
  for (let o = 0; o < NEURAL_OUTPUT_SIZE; o++) {
    for (let h = 0; h < hiddenActivation.length; h++) {
      const i = o * hiddenActivation.length + h;
      weightTraces[i] = config.eligibilityDecay * weightTraces[i]! + hiddenActivation[h]! * centered[o]!;
    }
    biasTraces[o] = config.eligibilityDecay * biasTraces[o]! + centered[o]!;
  }
}

export function metabolicReinforcement(actualFoodEnergyCredited: number, actualMovementEnergySpent: number, energyCapacity: number): number {
  return Math.max(-1, Math.min(1, (actualFoodEnergyCredited - actualMovementEnergySpent) / energyCapacity));
}

/** Apply one reward-modulated update. Genetic parameters are read only; effective values are clamped to their existing bounds. */
export function applyPlasticityUpdate(
  organism: OrganismRuntimeState,
  reinforcement: number,
  config: PlasticityConfig,
  bounds: { min: number; max: number }
): void {
  const offsets = organism.hiddenOutputWeightOffsets;
  const biasOffsets = organism.outputBiasOffsets;
  const traces = organism.hiddenOutputEligibilityTraces;
  const biasTraces = organism.outputBiasEligibilityTraces;
  const weightCount = organism.genome.neural.hiddenOutputWeights.length;
  if (
    offsets === undefined || biasOffsets === undefined || traces === undefined || biasTraces === undefined ||
    offsets.length !== weightCount || traces.length !== weightCount ||
    biasOffsets.length !== NEURAL_OUTPUT_SIZE || biasTraces.length !== NEURAL_OUTPUT_SIZE ||
    ![...offsets, ...biasOffsets, ...traces, ...biasTraces].every(Number.isFinite)
  ) {
    throw new Error(`plasticity: organism ${organism.id} has malformed runtime state`);
  }
  for (let i = 0; i < offsets.length; i++) {
    const base = organism.genome.neural.hiddenOutputWeights[i]!;
    const effective = Math.max(bounds.min, Math.min(bounds.max, base + offsets[i]! + config.learningRate * reinforcement * traces[i]!));
    offsets[i] = effective - base;
  }
  for (let i = 0; i < biasOffsets.length; i++) {
    const base = organism.genome.neural.outputBiases[i]!;
    const effective = Math.max(bounds.min, Math.min(bounds.max, base + biasOffsets[i]! + config.learningRate * reinforcement * biasTraces[i]!));
    biasOffsets[i] = effective - base;
  }
}
