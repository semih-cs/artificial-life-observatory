import { NeuralGenome, NEURAL_INPUT_SIZE, NEURAL_OUTPUT_SIZE } from '../genome/types.js';

/**
 * Fixed feedforward network evaluation (§11.59, [LOCKED]):
 * hidden activation: tanh. Output activations: sigmoid (forward, eat,
 * reproduce), tanh (turn). Pure deterministic function of (genome, input) —
 * no RNG consumption, no mutation of genome or world state.
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

/**
 * `inputSize` is the model's neural input dimension — 6 for the v1 models
 * 0A.1.0 / 0A.2.0 (the default, so every v1 call site keeps its exact
 * historical meaning), 10 for 0A.3.0; callers obtain it from
 * `simulationModel(simulationVersion).neuralInputSize`. Both the input vector
 * and the genome's input->hidden block must match it: a genome of one model is
 * never silently evaluated under another model's layout (row-major
 * [hidden x input] weights would otherwise be read with the wrong stride).
 */
export function evaluateNetwork(
  genome: NeuralGenome,
  input: readonly number[],
  hiddenSize: number,
  inputSize: number = NEURAL_INPUT_SIZE
): RawNetworkOutputs {
  if (input.length !== inputSize) {
    throw new Error(`evaluateNetwork: expected ${inputSize} inputs, got ${input.length}`);
  }
  if (genome.inputHiddenWeights.length !== hiddenSize * inputSize) {
    throw new Error(
      `evaluateNetwork: genome has ${genome.inputHiddenWeights.length} input->hidden weights, ` +
        `expected ${hiddenSize * inputSize} (${hiddenSize} hidden x ${inputSize} inputs)`
    );
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

export function networkParamCount(inputSize: number, hiddenSize: number, outputSize: number): number {
  return hiddenSize * inputSize + hiddenSize + outputSize * hiddenSize + outputSize;
}
