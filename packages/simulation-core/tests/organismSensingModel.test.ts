/**
 * V2.1 model identity 0A.3.0 next to the frozen v1 models.
 *
 * Model-specific neural dimensions (6 / 6 / 10) and their validation, native
 * 10-input founders under the unchanged viability screen, unchanged mutation,
 * and the new model's own golden regression — without touching the meaning of
 * 0A.1.0 or 0A.2.0.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SIMULATION_CONFIG, ORGANISM_SENSING_GOLDEN_HASH, ORGANISM_SENSING_MODEL_VERSION, MULTI_FOUNDER_MODEL_VERSION,
  SINGLE_FOUNDER_MODEL_VERSION, SINGLE_FOUNDER_GOLDEN_HASH, cloneConfig, modelConfig, organismSensingModelConfig,
  singleFounderModelConfig,
} from '../src/config/defaults.js';
import { validateConfig } from '../src/config/types.js';
import {
  simulationModel, neuralInputSizeFor, isSupportedSimulationVersion, SUPPORTED_MODEL_VERSIONS,
  V1_NEURAL_INPUT_SIZE, ORGANISM_SENSING_NEURAL_INPUT_SIZE,
} from '../src/model/simulationModel.js';
import { NEURAL_INPUT_SIZE, NEURAL_OUTPUT_SIZE, NeuralGenome } from '../src/genome/types.js';
import {
  drawNeuralGenome, founderProbeSet, mechanicalValidityCheck, minimalViabilityScreen, generateFounderNeuralGenome,
} from '../src/genome/founder.js';
import { evaluateNetwork, networkParamCount } from '../src/neural/network.js';
import { decideAction } from '../src/actions/decide.js';
import { bootstrapWorld, generateFounderProfiles } from '../src/world/bootstrap.js';
import { stepWorld, senseContextFor } from '../src/world/stepWorld.js';
import { runSimulation } from '../src/world/runner.js';
import { mutateNeural } from '../src/biology/mutation.js';
import { createRngStreams, RngStream } from '../src/rng/rngStream.js';

const SEED = 20260910;
const MULTI_FOUNDER_GOLDEN_HASH = 'b95a0b4ef7dd8449'; // frozen v1 reference, asserted in experiment-harness/persistence/world-runner too

function v3(seed = SEED) {
  const c = organismSensingModelConfig();
  c.rootSeed = seed;
  return c;
}

const flat = (g: NeuralGenome) => [...g.inputHiddenWeights, ...g.hiddenBiases, ...g.hiddenOutputWeights, ...g.outputBiases];

/** A deterministic, non-trivial genome of the given input size (no RNG). */
function fixtureGenome(inputSize: number, hidden = 8): NeuralGenome {
  const fill = (n: number, off: number) => Array.from({ length: n }, (_, i) => Math.sin(off + i * 1.7) * 0.9);
  return {
    inputHiddenWeights: fill(hidden * inputSize, 1),
    hiddenBiases: fill(hidden, 50),
    hiddenOutputWeights: fill(NEURAL_OUTPUT_SIZE * hidden, 90),
    outputBiases: fill(NEURAL_OUTPUT_SIZE, 130),
  };
}

describe('model registry — neural dimensions by simulationVersion', () => {
  it('(15) 0A.1.0 and 0A.2.0 remain six-input models: 6 → 8 → 4', () => {
    for (const version of [SINGLE_FOUNDER_MODEL_VERSION, MULTI_FOUNDER_MODEL_VERSION]) {
      expect(simulationModel(version)).toEqual({ simulationVersion: version, neuralInputSize: 6, organismSensing: false, recurrent: false, physicalBodies: false, foodHandling: false, lifetimePlasticity: false, regulatedRecurrentInit: false });
      const c = modelConfig(version);
      c.rootSeed = SEED;
      const w = bootstrapWorld(c);
      for (const o of w.organisms) {
        expect(o.genome.neural.inputHiddenWeights.length).toBe(8 * 6);
        expect(o.genome.neural.hiddenOutputWeights.length).toBe(4 * 8);
      }
      expect(senseContextFor(w, c).organisms).toBeUndefined();
    }
    expect(NEURAL_INPUT_SIZE).toBe(6); // the historical constant keeps its meaning
    expect(V1_NEURAL_INPUT_SIZE).toBe(6);
    expect(singleFounderModelConfig().simulationVersion).toBe('0A.1.0');
    expect(DEFAULT_SIMULATION_CONFIG.simulationVersion).toBe('0A.2.0'); // the frozen v1 default is not upgraded
  });

  it('(16) 0A.3.0 is a ten-input model: 10 → 8 → 4', () => {
    expect(ORGANISM_SENSING_MODEL_VERSION).toBe('0A.3.0');
    expect(simulationModel('0A.3.0')).toEqual({ simulationVersion: '0A.3.0', neuralInputSize: 10, organismSensing: true, recurrent: false, physicalBodies: false, foodHandling: false, lifetimePlasticity: false, regulatedRecurrentInit: false });
    expect(ORGANISM_SENSING_NEURAL_INPUT_SIZE).toBe(10);
    expect(SUPPORTED_MODEL_VERSIONS).toEqual(['0A.1.0', '0A.2.0', '0A.3.0', '0A.4.0', '0A.5.0', '0A.6.0', '0A.7.0', '0A.8.0']);
    const c = v3();
    const w = bootstrapWorld(c);
    expect(w.simulationVersion).toBe('0A.3.0');
    for (const o of w.organisms) {
      expect(o.genome.neural.inputHiddenWeights.length).toBe(8 * 10);
      expect(o.genome.neural.hiddenBiases.length).toBe(8);
      expect(o.genome.neural.hiddenOutputWeights.length).toBe(4 * 8);
      expect(o.genome.neural.outputBiases.length).toBe(4);
    }
    expect(networkParamCount(10, 8, 4)).toBe(124);
    expect(flat(w.organisms[0]!.genome.neural).length).toBe(124);
    // four outputs, no new action: the intent has exactly the v1 fields
    const intent = decideAction(w.organisms[0]!, senseContextFor(w, c), c.neural, 8, 10);
    expect(Object.keys(intent).sort()).toEqual(['eatRequested', 'organismId', 'reproduceRequested', 'requestedForwardSpeed', 'requestedTurnRate']);
  });

  it('(16) organismSensingModelConfig differs from the v1 default only in its model identity', () => {
    const a = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    const b = organismSensingModelConfig();
    expect(b.simulationVersion).toBe('0A.3.0');
    expect({ ...b, simulationVersion: a.simulationVersion }).toEqual(a);
  });

  it('(17) network validation is model-specific: a genome is never evaluated under another model\'s layout', () => {
    const g6 = fixtureGenome(6);
    const g10 = fixtureGenome(10);
    const in6 = [1, 0.3, -0.2, 0.6, 0.1, 0.8];
    const in10 = [...in6, 1, 0.4, -0.5, 0.2];
    expect(() => evaluateNetwork(g6, in6, 8)).not.toThrow(); // v1 default
    expect(() => evaluateNetwork(g10, in10, 8, 10)).not.toThrow();
    expect(() => evaluateNetwork(g10, in6, 8)).toThrow(/input->hidden weights/); // 10-input genome, 6-input model
    expect(() => evaluateNetwork(g6, in10, 8, 10)).toThrow(/input->hidden weights/); // 6-input genome, 10-input model
    expect(() => evaluateNetwork(g10, in10, 8)).toThrow(/expected 6 inputs/);
    expect(() => evaluateNetwork(g6, in6, 8, 10)).toThrow(/expected 10 inputs/);
    expect(() => mechanicalValidityCheck(g10, 8, { min: -2, max: 2 })).toThrow(/dimensionality/);
    expect(mechanicalValidityCheck(g10, 8, { min: -2, max: 2 }, 10).valid).toBe(true);
    // with organism inputs at zero, only the extra weights differ — the first six columns act exactly as a 6-input net
    const g10from6: NeuralGenome = { ...g6, inputHiddenWeights: Array.from({ length: 80 }, (_, k) => (k % 10 < 6 ? g6.inputHiddenWeights[Math.floor(k / 10) * 6 + (k % 10)]! : 0.7)) };
    expect(evaluateNetwork(g10from6, [...in6, 0, 0, 0, 0], 8, 10)).toEqual(evaluateNetwork(g6, in6, 8));
  });

  it('(17) unknown model versions are refused, never guessed; a world is never stepped under another model', () => {
    expect(() => simulationModel('0A.9.0')).toThrow(/unknown simulationVersion/);
    expect(isSupportedSimulationVersion('0A.9.0')).toBe(false);
    expect(neuralInputSizeFor('0A.2.0')).toBe(6);
    expect(neuralInputSizeFor('0A.3.0')).toBe(10);
    const bad = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    bad.simulationVersion = '0A.9.0';
    expect(() => validateConfig(bad)).toThrow(/not a supported model/);
    expect(() => bootstrapWorld(bad)).toThrow(/not a supported model/);
    expect(() => modelConfig('0A.9.0')).toThrow();
    // a 0A.2.0 world stepped with a 0A.3.0 config (and vice versa) is refused before any evaluation
    const w2 = bootstrapWorld({ ...cloneConfig(DEFAULT_SIMULATION_CONFIG), rootSeed: 5 });
    const w3 = bootstrapWorld(v3(5));
    expect(() => stepWorld(w2, v3(5))).toThrow(/never stepped under another model/);
    expect(() => stepWorld(w3, { ...cloneConfig(DEFAULT_SIMULATION_CONFIG), rootSeed: 5 })).toThrow(/never stepped under another model/);
    // a v1 world whose genomes were somehow 10-input would fail loudly rather than be read with the wrong stride
    const forged = { ...w2, organisms: w2.organisms.map((o) => ({ ...o, genome: { ...o.genome, neural: fixtureGenome(10) } })) };
    expect(() => stepWorld(forged, { ...cloneConfig(DEFAULT_SIMULATION_CONFIG), rootSeed: 5 })).toThrow(/input->hidden weights/);
  });
});

describe('0A.3.0 founders', () => {
  it('(18) founders are drawn natively as 10-input controllers by the normal BootstrapRNG procedure', () => {
    const c = v3();
    const founders = generateFounderProfiles(createRngStreams(c.rootSeed).bootstrap, c);
    expect(founders.length).toBe(5);
    for (const f of founders) {
      expect(f.genome.neural.inputHiddenWeights.length).toBe(80);
      for (const v of flat(f.genome.neural)) {
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(2);
      }
    }
    // The first candidate's raw draw is 80 input->hidden Gaussians, then biases, in the fixed order.
    const a = createRngStreams(c.rootSeed).bootstrap;
    const b = createRngStreams(c.rootSeed).bootstrap;
    const raw = drawNeuralGenome(a, 8, c.neural.initSigma, 10);
    const manual = Array.from({ length: 124 }, () => b.gaussian(0, c.neural.initSigma));
    expect(flat(raw)).toEqual(manual);
    expect(a.getState()).toEqual(b.getState());
    // First passing candidate wins — replayed independently for founder 0.
    const replay = createRngStreams(c.rootSeed).bootstrap;
    const first = generateFounderNeuralGenome(replay, 8, c.neural, c.bootstrap, 10);
    expect(flat(first.neural)).toEqual(flat(founders[0]!.genome.neural));
    // The larger genome consumes more draws, so the 0A.3.0 bootstrap diverges from 0A.2.0 under the same seed.
    const w2 = bootstrapWorld({ ...cloneConfig(DEFAULT_SIMULATION_CONFIG), rootSeed: SEED });
    const w3 = bootstrapWorld(c);
    expect(w3.rng.bootstrap).not.toEqual(w2.rng.bootstrap);
    expect(bootstrapWorld(v3()).organisms).toEqual(w3.organisms); // and is itself deterministic
  });

  it('(19) the probe inputs append [0, 0, 0, 0]: no probe shows an organism', () => {
    const probeCfg = DEFAULT_SIMULATION_CONFIG.bootstrap.founderProbe;
    const p6 = founderProbeSet(probeCfg);
    const p10 = founderProbeSet(probeCfg, 10);
    expect(p10.map((p) => p.name)).toEqual(p6.map((p) => p.name));
    for (let i = 0; i < p6.length; i++) {
      expect(p10[i]!.input).toEqual([...p6[i]!.input, 0, 0, 0, 0]);
    }
    expect(() => founderProbeSet(probeCfg, 7)).toThrow();
  });

  it('(19) founder viability does not require any organism-directed behaviour', () => {
    const c = v3();
    const founders = generateFounderProfiles(createRngStreams(c.rootSeed).bootstrap, c);
    const withColumns = (g: NeuralGenome, value: (h: number, j: number) => number): NeuralGenome => ({
      ...g,
      inputHiddenWeights: g.inputHiddenWeights.map((w, k) => (k % 10 >= 6 ? value(Math.floor(k / 10), k % 10) : w)),
    });
    for (const f of founders) {
      const accepted = minimalViabilityScreen(f.genome.neural, 8, c.neural, c.bootstrap.founderProbe, 10);
      expect(accepted.pass).toBe(true);
      // Zero organism weights (a controller blind to organisms) and arbitrary extreme ones give the
      // IDENTICAL screen result: the screen cannot see, reward or require any response to organisms.
      for (const variant of [withColumns(f.genome.neural, () => 0), withColumns(f.genome.neural, (h, j) => (h + j) % 2 === 0 ? 2 : -2)]) {
        expect(minimalViabilityScreen(variant, 8, c.neural, c.bootstrap.founderProbe, 10)).toEqual(accepted);
      }
      // The screen of a 10-input founder is exactly the v1 screen of its first six input columns.
      const firstSix: NeuralGenome = { ...f.genome.neural, inputHiddenWeights: f.genome.neural.inputHiddenWeights.filter((_, k) => k % 10 < 6) };
      expect(minimalViabilityScreen(firstSix, 8, c.neural, c.bootstrap.founderProbe)).toEqual(accepted);
    }
  });
});

describe('0A.3.0 mutation', () => {
  it('(20) mutation configuration is unchanged from the v1 model', () => {
    expect(organismSensingModelConfig().mutation).toEqual(DEFAULT_SIMULATION_CONFIG.mutation);
    expect(organismSensingModelConfig().neural).toEqual(DEFAULT_SIMULATION_CONFIG.neural);
  });

  it('(20) every one of the 124 parameters goes through the same per-parameter draw, in fixed block/index order', () => {
    const c = v3();
    const parent = Object.freeze(fixtureGenome(10));
    const rng = new RngStream(11, 'canonical');
    const replay = new RngStream(11, 'canonical');
    const child = mutateNeural(parent, rng, c.mutation, c.neural.neuralParamBounds);
    // manual replay of the existing rule over the flattened parameter list
    const expected = flat(parent).map((v) => (replay.nextFloat() < c.mutation.neuralMutationRate
      ? Math.max(-2, Math.min(2, v + replay.gaussian(0, c.mutation.neuralMutationSigma)))
      : v));
    expect(flat(child)).toEqual(expected);
    expect(rng.getState()).toEqual(replay.getState());
    expect(child.inputHiddenWeights.length).toBe(80);
    expect(flat(parent)).toEqual(flat(fixtureGenome(10))); // parent untouched
  });

  it('(20) the organism-sensing weights are ordinary parameters: same rate gate, same disabled-channel schedule', () => {
    const c = v3();
    const parent = fixtureGenome(10);
    const all = { ...c.mutation, neuralMutationRate: 1 };
    const none = { ...c.mutation, neuralMutationRate: 0 };
    const off = { ...c.mutation, neuralMutationEnabled: false };
    const organismColumns = (g: NeuralGenome) => g.inputHiddenWeights.filter((_, k) => k % 10 >= 6);
    const mutatedAll = mutateNeural(parent, new RngStream(3, 'canonical'), all, c.neural.neuralParamBounds);
    expect(organismColumns(mutatedAll).every((w, i) => w !== organismColumns(parent)[i])).toBe(true);
    const r0 = new RngStream(3, 'canonical');
    expect(mutateNeural(parent, r0, none, c.neural.neuralParamBounds)).toEqual(parent);
    const drawsAtRateZero = new RngStream(3, 'canonical');
    for (let i = 0; i < 124; i++) drawsAtRateZero.nextFloat(); // exactly one uniform per parameter
    expect(r0.getState()).toEqual(drawsAtRateZero.getState());
    // a disabled channel consumes the enabled schedule and returns an exact clone
    const rOn = new RngStream(9, 'canonical');
    const rOff = new RngStream(9, 'canonical');
    mutateNeural(parent, rOn, c.mutation, c.neural.neuralParamBounds);
    expect(mutateNeural(parent, rOff, off, c.neural.neuralParamBounds)).toEqual(parent);
    expect(rOff.getState()).toEqual(rOn.getState());
  });
});

describe('0A.3.0 golden regression (seed 20260910, 10,000 ticks)', () => {
  it('reproduces ORGANISM_SENSING_GOLDEN_HASH, twice, and differs from both frozen v1 references', () => {
    expect(ORGANISM_SENSING_GOLDEN_HASH).toBe('e54d0c11249b7849');
    const a = runSimulation(v3(), 10_000).summary;
    const b = runSimulation(v3(), 10_000).summary;
    expect(a.simulationVersion).toBe('0A.3.0');
    expect(a.finalStateHash).toBe(ORGANISM_SENSING_GOLDEN_HASH);
    expect(b.finalStateHash).toBe(ORGANISM_SENSING_GOLDEN_HASH);
    expect(a.extinct).toBe(false);
    expect(a.totalBirths).toBeGreaterThan(0); // reproduction and inheritance keep running under the new model
    expect(ORGANISM_SENSING_GOLDEN_HASH).not.toBe(MULTI_FOUNDER_GOLDEN_HASH);
    expect(ORGANISM_SENSING_GOLDEN_HASH).not.toBe(SINGLE_FOUNDER_GOLDEN_HASH);
  }, 120_000);
});
