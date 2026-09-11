import { OrganismRuntimeState } from '../organism/types.js';
import { evaluateNetwork } from '../neural/network.js';
import { senseOrganism, SenseContext } from '../perception/sense.js';
import { NeuralConfig } from '../config/types.js';
import { ActionIntent } from './types.js';
import { NEURAL_INPUT_SIZE } from '../genome/types.js';

/**
 * Decide phase (§20.72 phase 3): compute the §11.58 input vector, evaluate
 * the fixed network, and deterministically map outputs to an ActionIntent
 * (§11.59). eat/reproduce use a >= comparator — [LOCKED].
 *
 * `inputSize` is the model's neural input dimension (6 by default — the v1
 * models; 10 for 0A.3.0, whose `ctx` carries organism sensing). The sensed
 * vector and the genome must both match it or evaluation throws.
 */
export function decideAction(
  organism: OrganismRuntimeState,
  ctx: SenseContext,
  neuralConfig: NeuralConfig,
  hiddenSize: number,
  inputSize: number = NEURAL_INPUT_SIZE
): ActionIntent {
  const input = senseOrganism(organism, ctx);
  const raw = evaluateNetwork(organism.genome.neural, input, hiddenSize, inputSize);

  const requestedForwardSpeed = clamp01(raw.forward) * organism.genome.morphology.maxSpeed;
  const requestedTurnRate = raw.turn * neuralConfig.maxTurnRate;
  const eatRequested = raw.eat >= neuralConfig.eatThreshold;
  const reproduceRequested = raw.reproduce >= neuralConfig.reproductionActionThreshold;

  return {
    organismId: organism.id,
    requestedForwardSpeed,
    requestedTurnRate,
    eatRequested,
    reproduceRequested,
  };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
