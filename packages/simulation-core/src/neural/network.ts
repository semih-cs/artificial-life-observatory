import { NeuralGenome, NEURAL_INPUT_SIZE, NEURAL_OUTPUT_SIZE } from '../genome/types.js';

/**
 * Fixed network evaluation (§11.59, [LOCKED]):
 * hidden activation: tanh. Output activations: sigmoid (forward, eat,
 * reproduce), tanh (turn). Pure deterministic functions — no RNG
 * consumption, no mutation of genome or world state.
 *
 * Two controllers, chosen by the model registry: the feed-forward
 * `evaluateNetwork` (0A.1.0-0A.3.0) and the recurrent
 * `evaluateRecurrentNetwork` (0A.4.0). Each refuses the other's genomes.
 */

export interface RawNetworkOutputs {
  forward: number; // sigmoid, (0,1)
  turn: number; // tanh, (-1,1)
  eat: number; // sigmoid, (0,1)
  reproduce: number; // sigmoid, (0,1)
}

function tanh(x: number): number {
  return Math.tanh(x);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function checkDimensions(
  fn: string,
  genome: NeuralGenome,
  input: readonly number[],
  hiddenSize: number,
  inputSize: number
): void {
  if (input.length !== inputSize) {
    throw new Error(`${fn}: expected ${inputSize} inputs, got ${input.length}`);
  }
  if (genome.inputHiddenWeights.length !== hiddenSize * inputSize) {
    throw new Error(
      `${fn}: genome has ${genome.inputHiddenWeights.length} input->hidden weights, ` +
        `expected ${hiddenSize * inputSize} (${hiddenSize} hidden x ${inputSize} inputs)`
    );
  }
}

/** Hidden -> output layer, shared by both controllers: identical arithmetic and activations. */
function outputsFromHidden(genome: NeuralGenome, hidden: readonly number[], hiddenSize: number): RawNetworkOutputs {
  const outputsRaw: number[] = new Array(NEURAL_OUTPUT_SIZE);
  for (let o = 0; o < NEURAL_OUTPUT_SIZE; o++) {
    let sum = genome.outputBiases[o] ?? 0;
    for (let h = 0; h < hiddenSize; h++) {
      const w = genome.hiddenOutputWeights[o * hiddenSize + h] ?? 0;
      sum += w * hidden[h]!;
    }
    outputsRaw[o] = sum;
  }

  // output order: [forward, turn, eat, reproduce]
  return {
    forward: sigmoid(outputsRaw[0]!),
    turn: tanh(outputsRaw[1]!),
    eat: sigmoid(outputsRaw[2]!),
    reproduce: sigmoid(outputsRaw[3]!),
  };
}

/**
 * The FEED-FORWARD controller of models 0A.1.0, 0A.2.0 and 0A.3.0.
 *
 * `inputSize` is the model's neural input dimension — 6 for the v1 models
 * 0A.1.0 / 0A.2.0 (the default, so every v1 call site keeps its exact
 * historical meaning), 10 for 0A.3.0; callers obtain it from
 * `simulationModel(simulationVersion).neuralInputSize`. Both the input vector
 * and the genome's input->hidden block must match it: a genome of one model is
 * never silently evaluated under another model's layout (row-major
 * [hidden x input] weights would otherwise be read with the wrong stride).
 *
 * A recurrent (0A.4.0) genome is refused here: it has memory and is evaluated
 * only by `evaluateRecurrentNetwork`, so a feed-forward trajectory can never
 * run through the recurrent path or the reverse.
 */
export function evaluateNetwork(
  genome: NeuralGenome,
  input: readonly number[],
  hiddenSize: number,
  inputSize: number = NEURAL_INPUT_SIZE
): RawNetworkOutputs {
  checkDimensions('evaluateNetwork', genome, input, hiddenSize, inputSize);
  if (genome.recurrentHiddenWeights !== undefined) {
    throw new Error('evaluateNetwork: genome has recurrent weights; a recurrent genome is evaluated only by evaluateRecurrentNetwork');
  }

  const hidden: number[] = new Array(hiddenSize);
  for (let h = 0; h < hiddenSize; h++) {
    let sum = genome.hiddenBiases[h] ?? 0;
    for (let i = 0; i < inputSize; i++) {
      const w = genome.inputHiddenWeights[h * inputSize + i] ?? 0;
      sum += w * (input[i] ?? 0);
    }
    hidden[h] = tanh(sum);
  }

  return outputsFromHidden(genome, hidden, hiddenSize);
}

export interface RecurrentNetworkResult {
  outputs: RawNetworkOutputs;
  /** h_t — the new hidden state, to become the organism's memory for its next acting tick. A fresh array. */
  hiddenState: number[];
}

/**
 * The RECURRENT (Elman) controller of model 0A.4.0 (V2.2):
 *
 *     h_t = tanh(W_in x_t + W_rec h_(t-1) + b_hidden)
 *     outputs = the unchanged hidden -> output layer applied to h_t
 *
 * Per hidden unit h the sum is formed in a fixed order: bias, then the inputs
 * in index order, then the previous hidden units in index order
 * (W_rec[h * hiddenSize + j] * h_(t-1)[j]). With h_(t-1) = 0 the recurrent
 * terms are exactly zero, so the first evaluation equals the feed-forward
 * evaluation of the same non-recurrent weights.
 *
 * Pure: consumes no RNG and modifies neither the genome, the input nor
 * `previousHidden`; the new state is returned, never written anywhere. This is
 * memory only — no weight ever changes here (no learning, no plasticity).
 */
export function evaluateRecurrentNetwork(
  genome: NeuralGenome,
  input: readonly number[],
  previousHidden: readonly number[],
  hiddenSize: number,
  inputSize: number
): RecurrentNetworkResult {
  checkDimensions('evaluateRecurrentNetwork', genome, input, hiddenSize, inputSize);
  const recurrent = genome.recurrentHiddenWeights;
  if (recurrent === undefined) {
    throw new Error('evaluateRecurrentNetwork: genome has no recurrent weights; a feed-forward genome is evaluated only by evaluateNetwork');
  }
  if (recurrent.length !== hiddenSize * hiddenSize) {
    throw new Error(`evaluateRecurrentNetwork: genome has ${recurrent.length} recurrent weights, expected ${hiddenSize * hiddenSize} (${hiddenSize} x ${hiddenSize})`);
  }
  if (previousHidden.length !== hiddenSize) {
    throw new Error(`evaluateRecurrentNetwork: previous hidden state has ${previousHidden.length} values, expected ${hiddenSize}`);
  }
  for (const v of previousHidden) {
    if (!Number.isFinite(v)) throw new Error(`evaluateRecurrentNetwork: non-finite previous hidden state value (${String(v)})`);
  }

  const hidden: number[] = new Array(hiddenSize);
  for (let h = 0; h < hiddenSize; h++) {
    let sum = genome.hiddenBiases[h] ?? 0;
    for (let i = 0; i < inputSize; i++) {
      const w = genome.inputHiddenWeights[h * inputSize + i] ?? 0;
      sum += w * (input[i] ?? 0);
    }
    for (let j = 0; j < hiddenSize; j++) {
      sum += recurrent[h * hiddenSize + j]! * previousHidden[j]!;
    }
    hidden[h] = tanh(sum);
  }

  return { outputs: outputsFromHidden(genome, hidden, hiddenSize), hiddenState: hidden };
}

/**
 * Trainable neural parameters of one controller. `recurrent` adds the
 * hiddenSize x hiddenSize recurrent block (0A.4.0: 124 + 64 = 188 at 10 / 8 / 4).
 */
export function networkParamCount(inputSize: number, hiddenSize: number, outputSize: number, recurrent = false): number {
  return hiddenSize * inputSize + hiddenSize + outputSize * hiddenSize + outputSize + (recurrent ? hiddenSize * hiddenSize : 0);
}
