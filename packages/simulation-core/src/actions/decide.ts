import { OrganismRuntimeState } from '../organism/types.js';
import { evaluateNetwork } from '../neural/network.js';
import { senseOrganism, SenseContext } from '../perception/sense.js';
import { NeuralConfig } from '../config/types.js';
import { ActionIntent } from './types.js';

/**
 * Decide phase (§20.72 phase 3): compute the §11.58 input vector, evaluate
 * the fixed network, and deterministically map outputs to an ActionIntent
 * (§11.59). eat/reproduce use a >= comparator — [LOCKED].
 */
export function decideAction(
  organism: OrganismRuntimeState,
  ctx: SenseContext,
  neuralConfig: NeuralConfig,
  hiddenSize: number
): ActionIntent {
  const input = senseOrganism(organism, ctx);
  const raw = evaluateNetwork(organism.genome.neural, input, hiddenSize);

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
