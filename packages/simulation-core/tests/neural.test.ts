import { describe, it, expect } from 'vitest';
import { evaluateNetwork } from '../src/neural/network.js';
import { NeuralGenome, NEURAL_INPUT_SIZE, NEURAL_OUTPUT_SIZE } from '../src/genome/types.js';

const hiddenSize = 4;

function makeGenome(seed = 1): NeuralGenome {
  // deterministic pseudo-random-ish fill, not using RNG (test fixture only)
  const fill = (n: number, offset: number) => Array.from({ length: n }, (_, i) => Math.sin(seed * 13.37 + offset + i) * 0.5);
  return {
    inputHiddenWeights: fill(hiddenSize * NEURAL_INPUT_SIZE, 0),
    hiddenBiases: fill(hiddenSize, 100),
    hiddenOutputWeights: fill(NEURAL_OUTPUT_SIZE * hiddenSize, 200),
    outputBiases: fill(NEURAL_OUTPUT_SIZE, 300),
  };
}

describe('evaluateNetwork (§11.59)', () => {
  it('same genome + same input -> identical output', () => {
    const genome = makeGenome(1);
    const input = [1, 0.5, -0.3, 0.2, -0.1, 0.7];
    const a = evaluateNetwork(genome, input, hiddenSize);
    const b = evaluateNetwork(genome, input, hiddenSize);
    expect(a).toEqual(b);
  });

  it('output ranges are correct: forward/eat/reproduce in (0,1), turn in (-1,1)', () => {
    const genome = makeGenome(2);
    for (let s = 0; s < 20; s++) {
      const input = [Math.sin(s), Math.cos(s), Math.sin(s * 2), Math.cos(s * 2), Math.sin(s * 3), Math.cos(s * 3)].map((v) => (v + 1) / 2);
      const out = evaluateNetwork(genome, input, hiddenSize);
      expect(out.forward).toBeGreaterThan(0);
      expect(out.forward).toBeLessThan(1);
      expect(out.eat).toBeGreaterThan(0);
      expect(out.eat).toBeLessThan(1);
      expect(out.reproduce).toBeGreaterThan(0);
      expect(out.reproduce).toBeLessThan(1);
      expect(out.turn).toBeGreaterThan(-1);
      expect(out.turn).toBeLessThan(1);
    }
  });

  it('rejects an input vector of the wrong length', () => {
    const genome = makeGenome(1);
    expect(() => evaluateNetwork(genome, [1, 2, 3], hiddenSize)).toThrow();
  });

  it('neural evaluation does not consume RNG and does not mutate genome/world state (pure function)', () => {
    const genome = makeGenome(3);
    const genomeCopy = JSON.parse(JSON.stringify(genome));
    const input = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
    const inputCopy = [...input];
    evaluateNetwork(genome, input, hiddenSize);
    expect(genome).toEqual(genomeCopy);
    expect(input).toEqual(inputCopy);
  });

  it('a zero-weight, zero-bias network produces the deterministic tanh(0)/sigmoid(0) midpoints', () => {
    const zeroGenome: NeuralGenome = {
      inputHiddenWeights: new Array(hiddenSize * NEURAL_INPUT_SIZE).fill(0),
      hiddenBiases: new Array(hiddenSize).fill(0),
      hiddenOutputWeights: new Array(NEURAL_OUTPUT_SIZE * hiddenSize).fill(0),
      outputBiases: new Array(NEURAL_OUTPUT_SIZE).fill(0),
    };
    const out = evaluateNetwork(zeroGenome, [1, 1, 1, 1, 1, 1], hiddenSize);
    expect(out.forward).toBeCloseTo(0.5, 10);
    expect(out.eat).toBeCloseTo(0.5, 10);
    expect(out.reproduce).toBeCloseTo(0.5, 10);
    expect(out.turn).toBeCloseTo(0, 10);
  });
});
