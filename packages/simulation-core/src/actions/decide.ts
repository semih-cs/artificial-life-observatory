import { OrganismRuntimeState } from '../organism/types.js';
import { evaluateNetwork, evaluateRecurrentNetwork, evaluatePlasticRecurrentNetwork, RawNetworkOutputs } from '../neural/network.js';
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
 *
 * This is the FEED-FORWARD decision (0A.1.0-0A.3.0). An organism that carries
 * memory (a recurrent-model organism) is refused here; see
 * `decideRecurrentAction`.
 */
export function decideAction(
  organism: OrganismRuntimeState,
  ctx: SenseContext,
  neuralConfig: NeuralConfig,
  hiddenSize: number,
  inputSize: number = NEURAL_INPUT_SIZE
): ActionIntent {
  if (organism.hiddenState !== undefined) {
    throw new Error(`decideAction: organism ${organism.id} carries a recurrent hidden state; only the recurrent controller may use it`);
  }
  const input = senseOrganism(organism, ctx);
  const raw = evaluateNetwork(organism.genome.neural, input, hiddenSize, inputSize);
  return intentFromOutputs(organism, raw, neuralConfig);
}

export interface RecurrentDecision {
  intent: ActionIntent;
  /** h_t: the organism's memory after this decision. Returned, never written — the caller applies it only after every organism has decided. */
  hiddenState: number[];
  rawOutputs?: RawNetworkOutputs;
  hiddenActivation?: number[];
}


/** V2.5 decision using runtime offsets on the recurrent controller's final readout. */
export function decidePlasticRecurrentAction(
  organism: OrganismRuntimeState,
  ctx: SenseContext,
  neuralConfig: NeuralConfig,
  hiddenSize: number,
  inputSize: number
): RecurrentDecision {
  if (organism.hiddenState === undefined || organism.hiddenOutputWeightOffsets === undefined || organism.outputBiasOffsets === undefined) {
    throw new Error(`decidePlasticRecurrentAction: organism ${organism.id} lacks plastic recurrent runtime state`);
  }
  const input = senseOrganism(organism, ctx);
  const result = evaluatePlasticRecurrentNetwork(
    organism.genome.neural, input, organism.hiddenState,
    organism.hiddenOutputWeightOffsets, organism.outputBiasOffsets, hiddenSize, inputSize
  );
  return {
    intent: intentFromOutputs(organism, result.outputs, neuralConfig),
    hiddenState: result.hiddenState,
    rawOutputs: result.outputs,
    hiddenActivation: result.hiddenActivation,
  };
}

/**
 * Decide phase for the recurrent model 0A.4.0 (V2.2): the same sensory vector
 * as 0A.3.0, the organism's previous hidden state h_(t-1) read from the
 * pre-decision state, the recurrent controller, and the unchanged output ->
 * ActionIntent mapping. Pure: nothing is modified — not the organism, not its
 * hidden state, not the world.
 */
export function decideRecurrentAction(
  organism: OrganismRuntimeState,
  ctx: SenseContext,
  neuralConfig: NeuralConfig,
  hiddenSize: number,
  inputSize: number
): RecurrentDecision {
  const previous = organism.hiddenState;
  if (previous === undefined) {
    throw new Error(`decideRecurrentAction: organism ${organism.id} has no hidden state; only a recurrent-model organism can use the recurrent controller`);
  }
  const input = senseOrganism(organism, ctx);
  const { outputs, hiddenState } = evaluateRecurrentNetwork(organism.genome.neural, input, previous, hiddenSize, inputSize);
  return { intent: intentFromOutputs(organism, outputs, neuralConfig), hiddenState };
}

/** The unchanged §11.59 output -> ActionIntent mapping, shared by both controllers. */
function intentFromOutputs(organism: OrganismRuntimeState, raw: RawNetworkOutputs, neuralConfig: NeuralConfig): ActionIntent {
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
