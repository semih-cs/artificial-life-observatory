import { describe, it, expect } from 'vitest';
import {
  mechanicalValidityCheck,
  minimalViabilityScreen,
  generateFounderNeuralGenome,
  founderProbeSet,
  founderMorphology,
} from '../src/genome/founder.js';
import { NeuralGenome, NEURAL_INPUT_SIZE, NEURAL_OUTPUT_SIZE } from '../src/genome/types.js';
import { RngStream } from '../src/rng/rngStream.js';
import { evaluateNetwork } from '../src/neural/network.js';
import { testConfig, TEST_HIDDEN_SIZE } from './helpers.js';

const H = TEST_HIDDEN_SIZE;

function zeroGenome(): NeuralGenome {
  return {
    inputHiddenWeights: new Array(H * NEURAL_INPUT_SIZE).fill(0),
    hiddenBiases: new Array(H).fill(0),
    hiddenOutputWeights: new Array(NEURAL_OUTPUT_SIZE * H).fill(0),
    outputBiases: new Array(NEURAL_OUTPUT_SIZE).fill(0),
  };
}

describe('mechanical validity check (§13.76 step 2)', () => {
  const bounds = { min: -2, max: 2 };

  it('rejects a genome containing NaN rather than coercing it to zero', () => {
    const g = zeroGenome();
    (g.inputHiddenWeights as number[])[3] = NaN;
    const result = mechanicalValidityCheck(g, H, bounds);
    expect(result.valid).toBe(false);
    expect(result.genome).toBeNull();
    expect(result.reason).toMatch(/non-finite/);
  });

  it('rejects Infinity and -Infinity', () => {
    for (const bad of [Infinity, -Infinity]) {
      const g = zeroGenome();
      (g.hiddenBiases as number[])[1] = bad;
      expect(mechanicalValidityCheck(g, H, bounds).valid).toBe(false);
    }
    const g2 = zeroGenome();
    (g2.outputBiases as number[])[2] = -Infinity;
    expect(mechanicalValidityCheck(g2, H, bounds).valid).toBe(false);
    const g3 = zeroGenome();
    (g3.hiddenOutputWeights as number[])[0] = Infinity;
    expect(mechanicalValidityCheck(g3, H, bounds).valid).toBe(false);
  });

  it('a non-finite value never becomes 0 in the returned genome', () => {
    const g = zeroGenome();
    (g.inputHiddenWeights as number[])[0] = NaN;
    const result = mechanicalValidityCheck(g, H, bounds);
    // The old behaviour was to silently substitute 0 and accept. It must not.
    expect(result.genome).toBeNull();
  });

  it('CLAMPS out-of-bounds finite values rather than rejecting them', () => {
    const g = zeroGenome();
    (g.inputHiddenWeights as number[])[0] = 99;
    (g.hiddenBiases as number[])[0] = -99;
    const result = mechanicalValidityCheck(g, H, bounds);
    expect(result.valid).toBe(true);
    expect(result.genome!.inputHiddenWeights[0]).toBe(2);
    expect(result.genome!.hiddenBiases[0]).toBe(-2);
  });

  it('throws on a dimensionality mismatch (a programming error, not a bad draw)', () => {
    const g = zeroGenome();
    expect(() => mechanicalValidityCheck({ ...g, hiddenBiases: [0] }, H, bounds)).toThrow(/dimensionality/);
  });
});

describe('minimal viability screen (§13.76 step 3)', () => {
  const config = testConfig();
  const probeCfg = config.bootstrap.founderProbe;

  it('a fully degenerate zero network fails', () => {
    const result = minimalViabilityScreen(zeroGenome(), H, config.neural, probeCfg);
    expect(result.pass).toBe(false);
    expect(result.checks.nonDegenerate).toBe(false);
  });

  it('check (c) rejects a controller that steers hard away while food is dead ahead', () => {
    // A controller whose turn output is a constant hard right (+0.9), no matter
    // what the sensors say. The superseded `turn > -0.5` condition would have
    // PASSED this; the corrected diagnostic must not.
    const g = zeroGenome();
    (g.outputBiases as number[])[1] = Math.atanh(0.9); // constant turn = +0.9
    const result = minimalViabilityScreen(g, H, config.neural, probeCfg);
    expect(result.checks.foodApproachable).toBe(false);

    // sanity: the superseded weak condition really would have accepted it
    const aheadTurn = evaluateNetwork(g, founderProbeSet(probeCfg)[0]!.input, H).turn;
    expect(aheadTurn > -0.5).toBe(true);
  });

  it('check (c) rejects a controller that ignores foodAngle entirely', () => {
    const g = zeroGenome(); // constant turn = 0 for every probe
    expect(minimalViabilityScreen(g, H, config.neural, probeCfg).checks.foodApproachable).toBe(false);
  });

  it('check (c) accepts a controller whose turn follows the sign of foodAngle', () => {
    // Build a controller whose turn output tracks input[2] (foodAngle):
    // hidden unit 0 reads foodAngle; the turn output reads hidden unit 0.
    const g = zeroGenome();
    (g.inputHiddenWeights as number[])[0 * NEURAL_INPUT_SIZE + 2] = 2; // hidden0 <- foodAngle
    (g.hiddenOutputWeights as number[])[1 * H + 0] = 2; // turn <- hidden0
    const checks = minimalViabilityScreen(g, H, config.neural, probeCfg).checks;
    expect(checks.foodApproachable).toBe(true);

    // ...and the mirrored controller (turn opposes foodAngle) is rejected
    const mirrored = zeroGenome();
    (mirrored.inputHiddenWeights as number[])[0 * NEURAL_INPUT_SIZE + 2] = 2;
    (mirrored.hiddenOutputWeights as number[])[1 * H + 0] = -2;
    expect(minimalViabilityScreen(mirrored, H, config.neural, probeCfg).checks.foodApproachable).toBe(false);
  });

  it('checks (d) and (e) require the action thresholds to be reachable', () => {
    const g = zeroGenome();
    (g.outputBiases as number[])[2] = -10; // eat output pinned near 0
    (g.outputBiases as number[])[3] = -10; // reproduce output pinned near 0
    const checks = minimalViabilityScreen(g, H, config.neural, probeCfg).checks;
    expect(checks.eatingPossible).toBe(false);
    expect(checks.reproductionPossible).toBe(false);
  });

  it('is a pure pass/fail gate: it consumes no RNG and mutates nothing', () => {
    const rng = new RngStream(1, 'bootstrap');
    const before = rng.getState();
    const g = zeroGenome();
    const snapshot = JSON.parse(JSON.stringify(g));
    minimalViabilityScreen(g, H, config.neural, probeCfg);
    expect(rng.getState()).toEqual(before);
    expect(JSON.parse(JSON.stringify(g))).toEqual(snapshot);
  });

  it('the probe set is fixed and precommitted (same fixtures -> same probes)', () => {
    expect(founderProbeSet(probeCfg)).toEqual(founderProbeSet(probeCfg));
    for (const p of founderProbeSet(probeCfg)) {
      expect(p.input.length).toBe(NEURAL_INPUT_SIZE);
    }
  });
});

describe('founder generation (§13.76 steps 1-4)', () => {
  it('is deterministic: the same BootstrapRNG seed yields the same founder', () => {
    const config = testConfig();
    const a = generateFounderNeuralGenome(new RngStream(42, 'bootstrap'), H, config.neural, config.bootstrap);
    const b = generateFounderNeuralGenome(new RngStream(42, 'bootstrap'), H, config.neural, config.bootstrap);
    expect(a.neural).toEqual(b.neural);
    expect(a.attempts).toBe(b.attempts);
  });

  it('the accepted founder passes all five checks', () => {
    const config = testConfig();
    const r = generateFounderNeuralGenome(new RngStream(42, 'bootstrap'), H, config.neural, config.bootstrap);
    expect(r.lastViability.pass).toBe(true);
    const rescreen = minimalViabilityScreen(r.neural, H, config.neural, config.bootstrap.founderProbe);
    expect(rescreen.pass).toBe(true);
  });

  it('every accepted founder parameter is finite and inside the configured bounds', () => {
    const config = testConfig();
    const r = generateFounderNeuralGenome(new RngStream(17, 'bootstrap'), H, config.neural, config.bootstrap);
    const b = config.neural.neuralParamBounds;
    for (const block of [r.neural.inputHiddenWeights, r.neural.hiddenBiases, r.neural.hiddenOutputWeights, r.neural.outputBiases]) {
      for (const v of block) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(b.min);
        expect(v).toBeLessThanOrEqual(b.max);
      }
    }
  });

  it('exhausting the attempt budget throws rather than accepting an unscreened founder', () => {
    const config = testConfig((c) => {
      c.bootstrap.maxFounderAttempts = 1;
      // An unreachable threshold makes every candidate fail check (d).
      c.neural.eatThreshold = 2;
    });
    expect(() => generateFounderNeuralGenome(new RngStream(5, 'bootstrap'), H, config.neural, config.bootstrap)).toThrow(
      /maxFounderAttempts/
    );
  });

  it('candidates are drawn one at a time from a stream that is never rewound', () => {
    const config = testConfig();
    const rng = new RngStream(99, 'bootstrap');
    const r = generateFounderNeuralGenome(rng, H, config.neural, config.bootstrap);
    // A fresh stream advanced by exactly (attempts * paramCount * 2) draws —
    // gaussian() consumes two draws per value — lands on the same state.
    const paramCount = H * NEURAL_INPUT_SIZE + H + NEURAL_OUTPUT_SIZE * H + NEURAL_OUTPUT_SIZE;
    const replay = new RngStream(99, 'bootstrap');
    for (let i = 0; i < r.attempts * paramCount * 2; i++) replay.next();
    expect(rng.getState()).toEqual(replay.getState());
  });

  it('founder morphology is the documented midpoint of each gene range, with no RNG involved', () => {
    const config = testConfig();
    const m = founderMorphology(config.bootstrap.geneBounds);
    const b = config.bootstrap.geneBounds;
    expect(m.size).toBe((b.size.min + b.size.max) / 2);
    expect(m.maxSpeed).toBe((b.maxSpeed.min + b.maxSpeed.max) / 2);
    expect(m.visionRange).toBe((b.visionRange.min + b.visionRange.max) / 2);
    expect(m.visionAngle).toBe((b.visionAngle.min + b.visionAngle.max) / 2);
    expect(m.metabolism).toBe((b.metabolism.min + b.metabolism.max) / 2);
  });
});
