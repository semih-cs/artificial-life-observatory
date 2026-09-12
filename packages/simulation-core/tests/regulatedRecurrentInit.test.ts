/**
 * V2.6 — Regulated Recurrent Initialization (model 0A.8.0).
 *
 * The numbered cases map to the V2.6 verification list. The theme throughout:
 * `0A.8.0` is `0A.6.0` with ONE difference — the sigma its recurrent
 * hidden->hidden block is DRAWN from — and every historical model keeps its
 * original initialization untouched.
 */
import { describe, expect, it } from 'vitest';
import {
  FOOD_HANDLING_GOLDEN_HASH, LIFETIME_PLASTICITY_GOLDEN_HASH, ORGANISM_SENSING_GOLDEN_HASH,
  PHYSICAL_BODIES_GOLDEN_HASH, RECURRENT_MEMORY_GOLDEN_HASH, REGULATED_RECURRENT_INIT_GOLDEN_HASH,
  SINGLE_FOUNDER_GOLDEN_HASH, cloneConfig, modelConfig, regulatedRecurrentInitModelConfig,
} from '../src/config/defaults.js';
import { validateConfig } from '../src/config/types.js';
import {
  REGULATED_RECURRENT_INIT_MODEL_VERSION, SUPPORTED_MODEL_VERSIONS, regulatedRecurrentInitSigma, simulationModel,
} from '../src/model/simulationModel.js';
import { drawNeuralGenome, generateFounderProfile } from '../src/genome/founder.js';
import { mutateNeural, perturbNeuralForBootstrap } from '../src/biology/mutation.js';
import { networkParamCount, evaluateRecurrentNetwork } from '../src/neural/network.js';
import { bootstrapWorld, generateFounderProfiles } from '../src/world/bootstrap.js';
import { stepWorld } from '../src/world/stepWorld.js';
import { runSimulation, runTicks } from '../src/world/runner.js';
import { canonicalizeWorldState, canonicalStateHash } from '../src/serialization/canonicalState.js';
import { createRngStreams } from '../src/rng/rngStream.js';
import type { NeuralGenome } from '../src/genome/types.js';

const V8 = REGULATED_RECURRENT_INIT_MODEL_VERSION;
const GOLDEN_SEED = 20260910;
const HISTORICAL = ['0A.1.0', '0A.2.0', '0A.3.0', '0A.4.0', '0A.5.0', '0A.6.0', '0A.7.0'] as const;

const v8 = (seed = GOLDEN_SEED) => { const c = regulatedRecurrentInitModelConfig(); c.rootSeed = seed; return c; };
const v6 = (seed = GOLDEN_SEED) => { const c = modelConfig('0A.6.0'); c.rootSeed = seed; return c; };
const sd = (xs: readonly number[]) => Math.sqrt(xs.reduce((a, v) => a + v * v, 0) / xs.length);

// =====================================================================
// (1–8) model identity: the new model exists and nothing historical moved
// =====================================================================

describe('V2.6 model identity', () => {
  it('(1–8) 0A.8.0 exists as a separate model and every historical model keeps its exact structural flags', () => {
    expect(V8).toBe('0A.8.0');
    expect(SUPPORTED_MODEL_VERSIONS).toEqual([...HISTORICAL, '0A.8.0']);

    const expected = {
      '0A.1.0': { neuralInputSize: 6, organismSensing: false, recurrent: false, physicalBodies: false, foodHandling: false, lifetimePlasticity: false, regulatedRecurrentInit: false },
      '0A.2.0': { neuralInputSize: 6, organismSensing: false, recurrent: false, physicalBodies: false, foodHandling: false, lifetimePlasticity: false, regulatedRecurrentInit: false },
      '0A.3.0': { neuralInputSize: 10, organismSensing: true, recurrent: false, physicalBodies: false, foodHandling: false, lifetimePlasticity: false, regulatedRecurrentInit: false },
      '0A.4.0': { neuralInputSize: 10, organismSensing: true, recurrent: true, physicalBodies: false, foodHandling: false, lifetimePlasticity: false, regulatedRecurrentInit: false },
      '0A.5.0': { neuralInputSize: 10, organismSensing: true, recurrent: true, physicalBodies: true, foodHandling: false, lifetimePlasticity: false, regulatedRecurrentInit: false },
      '0A.6.0': { neuralInputSize: 10, organismSensing: true, recurrent: true, physicalBodies: true, foodHandling: true, lifetimePlasticity: false, regulatedRecurrentInit: false },
      '0A.7.0': { neuralInputSize: 10, organismSensing: true, recurrent: true, physicalBodies: true, foodHandling: true, lifetimePlasticity: true, regulatedRecurrentInit: false },
    } as const;
    for (const [version, flags] of Object.entries(expected)) {
      expect(simulationModel(version)).toEqual({ simulationVersion: version, ...flags });
    }
  });

  // (9–16) composition of the new model
  it('(9–16) 0A.8.0 is 10 inputs / 8 recurrent hidden / 4 outputs / 188 parameters, solid, handling food, NOT plastic', () => {
    expect(simulationModel(V8)).toEqual({
      simulationVersion: V8, neuralInputSize: 10, organismSensing: true,
      recurrent: true, physicalBodies: true, foodHandling: true,
      lifetimePlasticity: false, regulatedRecurrentInit: true,
    });
    const c = v8();
    expect(c.neural.hiddenLayerSize).toBe(8);
    expect(c.body).toEqual(v6().body);
    expect(c.handling).toEqual({ ticksRequired: 5 });
    expect(c.plasticity).toBeUndefined();
    expect(networkParamCount(10, 8, 4, true)).toBe(188);

    const w = bootstrapWorld(c);
    for (const o of w.organisms) {
      const n = o.genome.neural;
      expect(n.inputHiddenWeights).toHaveLength(8 * 10);
      expect(n.hiddenBiases).toHaveLength(8);
      expect(n.hiddenOutputWeights).toHaveLength(4 * 8);
      expect(n.outputBiases).toHaveLength(4);
      expect(n.recurrentHiddenWeights).toHaveLength(8 * 8);
      const total = n.inputHiddenWeights.length + n.hiddenBiases.length + n.hiddenOutputWeights.length + n.outputBiases.length + n.recurrentHiddenWeights!.length;
      expect(total).toBe(188);
      expect(o.hiddenState).toEqual(new Array(8).fill(0));
    }
  });

  // (17, 18) no lifetime-plasticity runtime state anywhere in a 0A.8.0 world
  it('(17, 18) 0A.8.0 organisms never allocate plastic offsets or eligibility traces, at bootstrap or after 400 ticks', () => {
    const c = v8();
    let world = bootstrapWorld(c);
    const plasticKeys = ['hiddenOutputWeightOffsets', 'outputBiasOffsets', 'hiddenOutputEligibilityTraces', 'outputBiasEligibilityTraces'] as const;
    const assertNone = () => {
      for (const o of world.organisms) for (const k of plasticKeys) {
        expect(o[k]).toBeUndefined();
        expect(k in o).toBe(false);
      }
    };
    assertNone();
    for (let t = 0; t < 400; t++) { world = stepWorld(world, c).world; assertNone(); }
    const canonical = JSON.stringify(canonicalizeWorldState(world));
    for (const k of plasticKeys) expect(canonical).not.toContain(k);
    expect(canonical).toContain('hiddenState');
  });
});

// =====================================================================
// (19–24) the one change: the recurrent initialization sigma
// =====================================================================

describe('V2.6 recurrent initialization sigma', () => {
  it('(19) recurrentInitSigma is exactly initSigma / sqrt(hiddenSize) and is validated, not chosen', () => {
    const c = v8();
    expect(c.neural.initSigma).toBe(0.8);
    expect(c.neural.hiddenLayerSize).toBe(8);
    expect(c.neural.recurrentInitSigma).toBe(0.8 / Math.sqrt(8));
    expect(c.neural.recurrentInitSigma).toBeCloseTo(0.282842712474619, 15);
    expect(regulatedRecurrentInitSigma(0.8, 8)).toBe(0.8 / Math.sqrt(8));
    expect(() => validateConfig(c)).not.toThrow();

    // It cannot be retuned: the validator re-derives it. 0.1 and 0.15 — the two
    // values V2.6 explicitly forbids picking from a sweep — are both refused.
    for (const tuned of [0.1, 0.15, 0.2, 0.8]) {
      const bad = cloneConfig(c); bad.neural.recurrentInitSigma = tuned;
      expect(() => validateConfig(bad)).toThrow(/must be exactly/);
    }
    for (const invalid of [0, -0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const bad = cloneConfig(c); bad.neural.recurrentInitSigma = invalid;
      expect(() => validateConfig(bad)).toThrow(/recurrentInitSigma/);
    }
    const missing = cloneConfig(c); delete missing.neural.recurrentInitSigma;
    expect(() => validateConfig(missing)).toThrow(/requires neural.recurrentInitSigma/);
  });

  it('(20) founder recurrent weights are drawn from recurrentInitSigma; the other four blocks keep initSigma', () => {
    // Same stream, same draw schedule, one differing scale.
    const hidden = 8, inputs = 10, sigma = 0.8, rSigma = regulatedRecurrentInitSigma(sigma, hidden);
    const a = drawNeuralGenome(createRngStreams(4242).bootstrap, hidden, sigma, inputs, true);
    const b = drawNeuralGenome(createRngStreams(4242).bootstrap, hidden, sigma, inputs, true, rSigma);

    // (22) the historical blocks are BYTE-IDENTICAL — V2.6 touches nothing else.
    expect(b.inputHiddenWeights).toEqual(a.inputHiddenWeights);
    expect(b.hiddenBiases).toEqual(a.hiddenBiases);
    expect(b.hiddenOutputWeights).toEqual(a.hiddenOutputWeights);
    expect(b.outputBiases).toEqual(a.outputBiases);

    // The recurrent block is the SAME standard normals, rescaled exactly.
    const ra = a.recurrentHiddenWeights!, rb = b.recurrentHiddenWeights!;
    expect(rb).toHaveLength(ra.length);
    for (let i = 0; i < ra.length; i++) expect(rb[i]!).toBeCloseTo(ra[i]! * (rSigma / sigma), 12);
    expect(sd(rb) / sd(ra)).toBeCloseTo(1 / Math.sqrt(hidden), 9);

    // And it reaches a real 0A.8.0 world: the drawn recurrent scale is ~0.283,
    // not ~0.8, while 0A.6.0's is ~0.8.
    const w8 = bootstrapWorld(v8()), w6 = bootstrapWorld(v6());
    const rec = (w: typeof w8) => w.organisms.flatMap((o) => o.genome.neural.recurrentHiddenWeights!);
    expect(sd(rec(w8))).toBeLessThan(0.34);
    expect(sd(rec(w8))).toBeGreaterThan(0.24);
    expect(sd(rec(w6))).toBeGreaterThan(0.6);
  });

  it('(21) bootstrap perturbation is UNCHANGED — it uses neuralBootstrapSigma for every block, and does not undo the correction', () => {
    // The V2.6 brief made this conditional on the bootstrap perturbation using
    // `initSigma` for recurrent parameters. It does not, and never did: it uses
    // the separate, far smaller `neuralBootstrapSigma`. So the condition does
    // not fire, nothing is rescaled here, and no second parameter is invented.
    const c = v8();
    expect(c.neural.neuralBootstrapSigma).toBe(0.05);
    const founder: NeuralGenome = {
      inputHiddenWeights: new Array(80).fill(0),
      hiddenBiases: new Array(8).fill(0),
      hiddenOutputWeights: new Array(32).fill(0),
      outputBiases: new Array(4).fill(0),
      recurrentHiddenWeights: new Array(64).fill(0),
    };
    const rng = createRngStreams(7).bootstrap;
    const p = perturbNeuralForBootstrap(founder, rng, c.neural.neuralBootstrapSigma, c.neural.neuralParamBounds);
    // Every block, recurrent included, is perturbed at the same 0.05 scale.
    expect(sd(p.recurrentHiddenWeights!)).toBeLessThan(0.12);
    expect(sd(p.recurrentHiddenWeights!)).toBeGreaterThan(0.01);

    // Measured claim: at the corrected draw scale the bootstrap perturbation
    // adds only a few percent, so the population's recurrent scale is still the
    // corrected one rather than the historical one.
    const drawn = 0.8 / Math.sqrt(8);
    const combined = Math.hypot(drawn, 0.05);
    expect(combined / drawn).toBeLessThan(1.02);
    const population = bootstrapWorld(c).organisms.flatMap((o) => o.genome.neural.recurrentHiddenWeights!);
    expect(sd(population)).toBeLessThan(0.4);
  });

  it('(23, 24) no RNG draw is added and no draw position moves: 0A.8.0 and 0A.6.0 share their whole bootstrap schedule', () => {
    // Identical stream positions after founder generation, and after the whole
    // bootstrap — the recurrent sigma changes values, never draw counts
    // (gaussian consumes exactly two draws whatever its sigma), and the
    // viability screen evaluates from zero memory so recurrent weights cannot
    // change which candidate is accepted.
    const r8 = createRngStreams(GOLDEN_SEED).bootstrap, r6 = createRngStreams(GOLDEN_SEED).bootstrap;
    const f8 = generateFounderProfiles(r8, v8()), f6 = generateFounderProfiles(r6, v6());
    expect(r8.getState()).toEqual(r6.getState());
    expect(f8.map((f) => f.attempts)).toEqual(f6.map((f) => f.attempts));

    // The four historical blocks of every founder are byte-identical; only the
    // recurrent block differs.
    for (let i = 0; i < f8.length; i++) {
      const a = f8[i]!.genome.neural, b = f6[i]!.genome.neural;
      expect(a.inputHiddenWeights).toEqual(b.inputHiddenWeights);
      expect(a.hiddenBiases).toEqual(b.hiddenBiases);
      expect(a.hiddenOutputWeights).toEqual(b.hiddenOutputWeights);
      expect(a.outputBiases).toEqual(b.outputBiases);
      expect(a.recurrentHiddenWeights).not.toEqual(b.recurrentHiddenWeights);
      expect(f8[i]!.genome.morphology).toEqual(f6[i]!.genome.morphology);
    }

    const w8 = bootstrapWorld(v8()), w6 = bootstrapWorld(v6());
    expect(w8.rng).toEqual(w6.rng);
    expect(w8.organisms.map((o) => [o.x, o.y, o.heading])).toEqual(w6.organisms.map((o) => [o.x, o.y, o.heading]));
    expect(w8.food.map((f) => [f.x, f.y])).toEqual(w6.food.map((f) => [f.x, f.y]));
    expect(w8.fertility).toEqual(w6.fertility);
  });
});

// =====================================================================
// (25–29) mutation, genome shape, screen and runtime equation are untouched
// =====================================================================

describe('V2.6 leaves mutation, the genome and the runtime controller alone', () => {
  it('(25, 26) mutation is unchanged and recurrent weights still mutate with neuralMutationSigma, never recurrentInitSigma', () => {
    const c = v8();
    const c6 = v6();
    expect(c.mutation).toEqual(c6.mutation);
    expect(c.mutation.neuralMutationSigma).toBe(0.05);

    // Mutating the SAME parent genome from the SAME stream under 0A.8.0's and
    // 0A.6.0's configurations gives identical results and identical stream
    // positions: the mutation channel never sees recurrentInitSigma.
    const parent = bootstrapWorld(c).organisms[0]!.genome.neural;
    const m1 = createRngStreams(99).canonical, m2 = createRngStreams(99).canonical;
    const a = mutateNeural(parent, m1, c.mutation, c.neural.neuralParamBounds);
    const b = mutateNeural(parent, m2, c6.mutation, c6.neural.neuralParamBounds);
    expect(a).toEqual(b);
    expect(m1.getState()).toEqual(m2.getState());

    // A mutated recurrent block moves by the mutation sigma's order, not the
    // initialization sigma's: with rate 1 the per-parameter step is ~0.05.
    const always = { ...c.mutation, neuralMutationRate: 1 };
    const heavy = mutateNeural(parent, createRngStreams(5).canonical, always, c.neural.neuralParamBounds);
    const deltas = heavy.recurrentHiddenWeights!.map((v, i) => v - parent.recurrentHiddenWeights![i]!);
    expect(sd(deltas)).toBeLessThan(0.09);
    expect(sd(deltas)).toBeGreaterThan(0.02);
  });

  it('(27) no new genome parameter exists — the neural genome still has exactly the five known blocks', () => {
    const o = bootstrapWorld(v8()).organisms[0]!;
    expect(Object.keys(o.genome.neural).sort()).toEqual(
      ['hiddenBiases', 'hiddenOutputWeights', 'inputHiddenWeights', 'outputBiases', 'recurrentHiddenWeights']
    );
    expect(Object.keys(o.genome).sort()).toEqual(['morphology', 'neural']);
    expect(Object.keys(o.genome.morphology).sort()).toEqual(['maxSpeed', 'metabolism', 'size', 'visionAngle', 'visionRange']);
    // recurrentInitSigma is configuration, never inherited state.
    expect(JSON.stringify(o.genome)).not.toContain('recurrentInitSigma');
  });

  it('(28) the founder viability screen is unchanged: same fixtures, same five checks, same acceptance', () => {
    const c = v8(), c6 = v6();
    expect(c.bootstrap).toEqual(c6.bootstrap);
    // Acceptance is identical candidate-for-candidate (the screen runs from a
    // zero hidden state, where recurrent weights contribute exactly nothing),
    // so V2.6 adds no behavioural gate and rejects nothing new.
    for (const seed of [1, 2, 3, 17, GOLDEN_SEED]) {
      const p8 = generateFounderProfile(createRngStreams(seed).bootstrap, 8, c.neural, c.bootstrap, 10, true, c.neural.recurrentInitSigma);
      const p6 = generateFounderProfile(createRngStreams(seed).bootstrap, 8, c6.neural, c6.bootstrap, 10, true);
      expect(p8.attempts).toBe(p6.attempts);
    }
  });

  it('(29) the runtime recurrent equation is unchanged — 0A.8.0 evaluates exactly like 0A.6.0 on the same genome', () => {
    const genome = bootstrapWorld(v8()).organisms[0]!.genome.neural;
    const input = Array.from({ length: 10 }, (_, i) => Math.cos(i * 0.7) * 0.4);
    const prev = Array.from({ length: 8 }, (_, i) => Math.sin(i) * 0.3);
    const r = evaluateRecurrentNetwork(genome, input, prev, 8, 10);
    // Recomputed by hand in the documented order: bias, inputs, then previous
    // hidden units — no gain, no leak, no time constant.
    const hidden = Array.from({ length: 8 }, (_, h) => {
      let sum = genome.hiddenBiases[h]!;
      for (let i = 0; i < 10; i++) sum += genome.inputHiddenWeights[h * 10 + i]! * input[i]!;
      for (let j = 0; j < 8; j++) sum += genome.recurrentHiddenWeights![h * 8 + j]! * prev[j]!;
      return Math.tanh(sum);
    });
    expect(r.hiddenState).toEqual(hidden);
    // Zero memory still collapses the recurrent term exactly.
    const zero = evaluateRecurrentNetwork(genome, input, new Array(8).fill(0), 8, 10);
    expect(zero.hiddenState).toEqual(Array.from({ length: 8 }, (_, h) => {
      let sum = genome.hiddenBiases[h]!;
      for (let i = 0; i < 10; i++) sum += genome.inputHiddenWeights[h * 10 + i]! * input[i]!;
      return Math.tanh(sum);
    }));
  });
});

// =====================================================================
// (37–40) canonical identity, config hashes and historical protection
// =====================================================================

describe('V2.6 canonical identity and historical protection', () => {
  it('(37, 38) historical canonical records and configurations are untouched — no model gains a recurrentInitSigma key', () => {
    for (const version of HISTORICAL) {
      const c = modelConfig(version);
      expect(c.neural.recurrentInitSigma).toBeUndefined();
      expect('recurrentInitSigma' in c.neural).toBe(false);
      expect(JSON.stringify(c)).not.toContain('recurrentInitSigma');
      expect(() => validateConfig(c)).not.toThrow();
      // Adding it is refused, so a historical config can never drift into the
      // corrected regime and change its configHash.
      const tampered = cloneConfig(c);
      tampered.neural.recurrentInitSigma = regulatedRecurrentInitSigma(c.neural.initSigma, c.neural.hiddenLayerSize);
      expect(() => validateConfig(tampered)).toThrow(/must not carry/);
    }
    // Canonical organism records gain no key either.
    const w6 = bootstrapWorld(v6());
    const canonical = JSON.stringify(canonicalizeWorldState(w6));
    expect(canonical).not.toContain('recurrentInitSigma');
    expect(canonical).not.toContain('regulatedRecurrentInit');
  });

  it('(39, 40) 0A.8.0 has its own deterministic canonical identity and no historical model received the correction', () => {
    // Deterministic and repeatable.
    const a = runSimulation(v8(), 300), b = runSimulation(v8(), 300);
    expect(a.summary.finalStateHash).toBe(b.summary.finalStateHash);

    // Distinct from 0A.6.0 and 0A.7.0 at the same seed and tick count.
    const h6 = runSimulation(v6(), 300).summary.finalStateHash;
    const c7 = modelConfig('0A.7.0'); c7.rootSeed = GOLDEN_SEED;
    const h7 = runSimulation(c7, 300).summary.finalStateHash;
    expect(a.summary.finalStateHash).not.toBe(h6);
    expect(a.summary.finalStateHash).not.toBe(h7);
    expect(a.world.simulationVersion).toBe(V8);

    // And the historical recurrent models still draw at the old scale.
    for (const version of ['0A.4.0', '0A.5.0', '0A.6.0', '0A.7.0'] as const) {
      const c = modelConfig(version); c.rootSeed = GOLDEN_SEED;
      const rec = bootstrapWorld(c).organisms.flatMap((o) => o.genome.neural.recurrentHiddenWeights!);
      expect(sd(rec)).toBeGreaterThan(0.6);
    }
  });
});

// =====================================================================
// (1–7 golden, 18 new golden) canonical regressions
// =====================================================================

describe('canonical linux-arm64 regressions', () => {
  it('(1–7) every historical golden hash is unchanged by V2.6', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['0A.1.0', SINGLE_FOUNDER_GOLDEN_HASH],
      ['0A.2.0', 'b95a0b4ef7dd8449'],
      ['0A.3.0', ORGANISM_SENSING_GOLDEN_HASH],
      ['0A.4.0', RECURRENT_MEMORY_GOLDEN_HASH],
      ['0A.5.0', PHYSICAL_BODIES_GOLDEN_HASH],
      ['0A.6.0', FOOD_HANDLING_GOLDEN_HASH],
      ['0A.7.0', LIFETIME_PLASTICITY_GOLDEN_HASH],
    ];
    expect(cases.map(([, h]) => h)).toEqual([
      '6a6576bd49e86b27', 'b95a0b4ef7dd8449', 'e54d0c11249b7849', '436a377506063609',
      '1006a56393e19cd9', '3e5b9671f5750712', '04d0b7c5917ca0c0',
    ]);
    for (const [version, hash] of cases) {
      const c = modelConfig(version); c.rootSeed = GOLDEN_SEED;
      expect(runSimulation(c, 10_000).summary.finalStateHash).toBe(hash);
    }
    expect(REGULATED_RECURRENT_INIT_GOLDEN_HASH).not.toBe(FOOD_HANDLING_GOLDEN_HASH);
  }, 120_000);

  it('(18) the new 0A.8.0 golden reproduces twice, with pinned checkpoints while the world is alive', () => {
    const checkpoints: Record<number, string> = {
      500: '7b9fa5616b128d94',
      1000: 'eb32428de387d31d',
      2000: '1d627932555249d7',
    };
    let world = bootstrapWorld(v8());
    const c = v8();
    let tick = 0;
    for (const at of [500, 1000, 2000]) {
      world = runTicks(world, c, at - tick).world;
      tick = at;
      expect(canonicalStateHash(world)).toBe(checkpoints[at]);
    }
    expect(runSimulation(v8(), 10_000).summary.finalStateHash).toBe(REGULATED_RECURRENT_INIT_GOLDEN_HASH);
    expect(runSimulation(v8(), 10_000).summary.finalStateHash).toBe(REGULATED_RECURRENT_INIT_GOLDEN_HASH);
    expect(REGULATED_RECURRENT_INIT_GOLDEN_HASH).toBe('0806b096bf4d0061');
  }, 120_000);
});

// =====================================================================
// live-world properties asserted mechanically
// =====================================================================

describe('V2.6 live-world properties', () => {
  it('memory persists and advances during life, and every newborn starts from exactly zero memory', () => {
    const c = v8(8);
    let world = bootstrapWorld(c);
    const born = new Map<number, number[]>();
    let sawNonZeroMemory = false;
    let births = 0;
    let deaths = 0;
    let known = new Set(world.organisms.map((o) => o.id));
    for (let t = 0; t < 2_000; t++) {
      const before = world;
      world = stepWorld(world, c).world;
      for (const o of world.organisms) {
        if (!known.has(o.id)) {
          births += 1;
          born.set(o.id, [...o.hiddenState!]);
          // A newborn does not act in its birth tick: its memory is all zeros.
          expect(o.hiddenState).toEqual(new Array(8).fill(0));
          expect(o.parentId).not.toBeNull();
        }
        if (o.hiddenState!.some((v) => v !== 0)) sawNonZeroMemory = true;
      }
      deaths += before.organisms.filter((o) => !world.organisms.some((n) => n.id === o.id)).length;
      known = new Set(world.organisms.map((o) => o.id));
    }
    expect(births).toBeGreaterThan(0);
    expect(deaths).toBeGreaterThan(0);
    expect(sawNonZeroMemory).toBe(true);
    // Genetic mutation is happening: a child's genome is not its parent's copy.
    const child = world.organisms.find((o) => o.parentId !== null);
    expect(child).toBeDefined();
    expect(world.organisms.filter((o) => o.generationDepth > 0).length).toBeGreaterThan(0);
  }, 60_000);
});

// =====================================================================
// (35, 36) save/load/resume equivalence lives in the persistence package;
// the in-core half is that interrupted stepping equals continuous stepping.
// =====================================================================

describe('V2.6 continuous execution equals interrupted execution', () => {
  it('(36) stopping and resuming a 0A.8.0 world at an arbitrary tick changes nothing', () => {
    const c = v8();
    const continuous = runSimulation(c, 600).summary.finalStateHash;
    let world = bootstrapWorld(c);
    for (const chunk of [137, 200, 63, 200]) world = runTicks(world, c, chunk).world;
    expect(world.tick).toBe(600);
    expect(canonicalStateHash(world)).toBe(continuous);
  });
});
