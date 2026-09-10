import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SIMULATION_CONFIG,
  MULTI_FOUNDER_MODEL_VERSION,
  SINGLE_FOUNDER_GOLDEN_HASH,
  SINGLE_FOUNDER_MODEL_VERSION,
  cloneConfig,
  singleFounderModelConfig,
} from '../src/config/defaults.js';
import { validateConfig } from '../src/config/types.js';
import {
  bootstrapWorld,
  effectiveFounderGroupCount,
  founderGroupOfIndex,
  generateFounderProfiles,
} from '../src/world/bootstrap.js';
import { createRngStreams } from '../src/rng/rngStream.js';
import { canonicalStateHash } from '../src/serialization/canonicalState.js';
import { runSimulation } from '../src/world/runner.js';
import { stepWorld } from '../src/world/stepWorld.js';
import {
  drawNeuralGenome,
  mechanicalValidityCheck,
  minimalViabilityScreen,
} from '../src/genome/founder.js';
import { NeuralGenome } from '../src/genome/types.js';

const SEED = 20260910;

function config(seed = SEED) {
  const c = cloneConfig(DEFAULT_SIMULATION_CONFIG);
  c.rootSeed = seed;
  return c;
}

/** Flatten a neural genome into its fixed parameter order. */
function flat(g: NeuralGenome): number[] {
  return [...g.inputHiddenWeights, ...g.hiddenBiases, ...g.hiddenOutputWeights, ...g.outputBiases];
}

function meanAbsDiff(a: NeuralGenome, b: NeuralGenome): number {
  const x = flat(a);
  const y = flat(b);
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += Math.abs(x[i]! - y[i]!);
  return sum / x.length;
}

describe('amended §13.76 — multi-founder initialization', () => {
  it('(1) produces exactly five independent founder neural genomes', () => {
    const c = config();
    expect(c.bootstrap.founderGroupCount).toBe(5);

    const founders = generateFounderProfiles(createRngStreams(c.rootSeed).bootstrap, c);
    expect(founders.length).toBe(5);

    // Independent: every pair differs, and by far more than the per-organism
    // bootstrap perturbation could ever account for.
    for (let i = 0; i < founders.length; i++) {
      for (let j = i + 1; j < founders.length; j++) {
        expect(flat(founders[i]!.genome.neural)).not.toEqual(flat(founders[j]!.genome.neural));
        expect(meanAbsDiff(founders[i]!.genome.neural, founders[j]!.genome.neural))
          .toBeGreaterThan(10 * c.neural.neuralBootstrapSigma);
      }
    }
  });

  it('(2) creates exactly 25 organisms', () => {
    const world = bootstrapWorld(config());
    expect(world.organisms.length).toBe(25);
    expect(world.organisms.every((o) => o.alive)).toBe(true);
  });

  it('(3) derives exactly five organisms from each founder-controller group', () => {
    const c = config();
    const world = bootstrapWorld(c);
    const founders = generateFounderProfiles(createRngStreams(c.rootSeed).bootstrap, c);
    const perGroup = c.population.initialPopulationSize / c.bootstrap.founderGroupCount;
    expect(perGroup).toBe(5);

    const counts = new Array<number>(founders.length).fill(0);
    world.organisms.forEach((organism, index) => {
      // Attribute each organism to its NEAREST founder in parameter space.
      // Per-organism perturbation is tiny next to the distance between
      // independent founders, so the nearest founder is unambiguous.
      const distances = founders.map((f) => meanAbsDiff(organism.genome.neural, f.genome.neural));
      const nearest = distances.indexOf(Math.min(...distances));
      const expected = Math.floor(index / perGroup);
      expect(nearest, `organism ${index} attributed to founder ${nearest}`).toBe(expected);

      // Unambiguous: nearest is far closer than the runner-up.
      const sorted = [...distances].sort((a, b) => a - b);
      expect(sorted[1]!).toBeGreaterThan(5 * sorted[0]!);
      counts[nearest]! += 1;
    });

    expect(counts).toEqual([5, 5, 5, 5, 5]);
  });

  it('(4) is deterministic for the same seed, and different seeds differ', () => {
    expect(canonicalStateHash(bootstrapWorld(config()))).toBe(canonicalStateHash(bootstrapWorld(config())));
    expect(canonicalStateHash(bootstrapWorld(config(SEED + 1))))
      .not.toBe(canonicalStateHash(bootstrapWorld(config())));

    // The founder set itself is reproducible from a fresh BootstrapRNG.
    const a = generateFounderProfiles(createRngStreams(SEED).bootstrap, config());
    const b = generateFounderProfiles(createRngStreams(SEED).bootstrap, config());
    expect(a.map((f) => flat(f.genome.neural))).toEqual(b.map((f) => flat(f.genome.neural)));
  });

  it('(5) founder groups are not accidental copies from RNG misuse', () => {
    // A rewound or re-seeded stream would yield identical founders; a shared
    // draw index would yield suspiciously similar ones. Neither is present:
    // between-founder distance is orders of magnitude above within-group.
    const c = config();
    const world = bootstrapWorld(c);
    const founders = generateFounderProfiles(createRngStreams(c.rootSeed).bootstrap, c);

    let maxWithinGroup = 0;
    world.organisms.forEach((organism, index) => {
      const d = meanAbsDiff(organism.genome.neural, founders[Math.floor(index / 5)]!.genome.neural);
      if (d > maxWithinGroup) maxWithinGroup = d;
    });

    let minBetweenFounders = Infinity;
    for (let i = 0; i < founders.length; i++) {
      for (let j = i + 1; j < founders.length; j++) {
        const d = meanAbsDiff(founders[i]!.genome.neural, founders[j]!.genome.neural);
        if (d < minBetweenFounders) minBetweenFounders = d;
      }
    }

    expect(minBetweenFounders).toBeGreaterThan(5 * maxWithinGroup);
  });

  it('(6) BootstrapRNG stays isolated from CanonicalRNG', () => {
    const c = config();
    const world = bootstrapWorld(c);
    const pristine = createRngStreams(c.rootSeed);

    // Bootstrap consumed draws...
    expect(world.rng.bootstrap).not.toEqual(pristine.bootstrap.getState());
    // ...and the canonical stream is untouched until the first tick (§13.35).
    expect(world.rng.canonical).toEqual(pristine.canonical.getState());

    // Five founders consume strictly more bootstrap draws than one.
    const single = singleFounderModelConfig();
    single.rootSeed = c.rootSeed;
    expect(bootstrapWorld(single).rng.bootstrap).not.toEqual(world.rng.bootstrap);
  });

  it('(7) founder acceptance is first-passing-candidate, with no ranking or best-of-N', () => {
    const c = config();
    // Replay the exact draw sequence and confirm each accepted founder is the
    // FIRST candidate that passes the gate — never a later or "better" one.
    const replay = createRngStreams(c.rootSeed).bootstrap;
    for (let group = 0; group < c.bootstrap.founderGroupCount; group++) {
      let firstPassingAttempt = -1;
      let accepted: NeuralGenome | null = null;
      for (let attempt = 1; attempt <= c.bootstrap.maxFounderAttempts; attempt++) {
        const raw = drawNeuralGenome(replay, c.neural.hiddenLayerSize, c.neural.initSigma);
        const validity = mechanicalValidityCheck(raw, c.neural.hiddenLayerSize, c.neural.neuralParamBounds);
        if (!validity.valid || validity.genome === null) continue;
        const viability = minimalViabilityScreen(
          validity.genome, c.neural.hiddenLayerSize, c.neural, c.bootstrap.founderProbe
        );
        if (viability.pass) {
          firstPassingAttempt = attempt;
          accepted = validity.genome;
          break;
        }
      }
      expect(firstPassingAttempt).toBeGreaterThan(0);
      // The real generator, replayed independently, produced exactly this.
      const founders = generateFounderProfiles(createRngStreams(c.rootSeed).bootstrap, c);
      expect(flat(founders[group]!.genome.neural)).toEqual(flat(accepted!));
      expect(founders[group]!.attempts).toBe(firstPassingAttempt);
    }
  });

  it('(8) reproduction and mutation after initialization are unchanged', () => {
    // Mutation OFF: a child must inherit its parent's genome exactly. This is
    // the inheritance contract (§16.17) and the amendment must not touch it.
    const c = config(139595);
    c.mutation.morphologyMutationEnabled = false;
    c.mutation.neuralMutationEnabled = false;

    let world = bootstrapWorld(c);
    const byId = new Map(world.organisms.map((o) => [o.id, o]));
    let checkedChildren = 0;

    for (let tick = 0; tick < 4000 && checkedChildren === 0; tick++) {
      const before = new Map(world.organisms.map((o) => [o.id, o]));
      world = stepWorld(world, c).world;
      for (const o of world.organisms) {
        if (!before.has(o.id) && o.parentId !== null) {
          const parent = before.get(o.parentId) ?? byId.get(o.parentId);
          expect(parent, 'child must have a known parent').toBeDefined();
          expect(o.genome.neural).toEqual(parent!.genome.neural);
          expect(o.genome.morphology).toEqual(parent!.genome.morphology);
          expect(o.generationDepth).toBe(parent!.generationDepth + 1);
          expect(o.lineageRootId).toBe(parent!.lineageRootId);
          checkedChildren++;
        }
      }
      for (const o of world.organisms) byId.set(o.id, o);
    }

    expect(checkedChildren, 'expected at least one birth to verify inheritance').toBeGreaterThan(0);
  });

  it('(9) model version distinguishes the old and new initialization', () => {
    expect(SINGLE_FOUNDER_MODEL_VERSION).toBe('0A.1.0');
    expect(MULTI_FOUNDER_MODEL_VERSION).toBe('0A.2.0');
    expect(SINGLE_FOUNDER_MODEL_VERSION).not.toBe(MULTI_FOUNDER_MODEL_VERSION);

    const amended = config();
    const historical = singleFounderModelConfig();
    expect(amended.simulationVersion).toBe(MULTI_FOUNDER_MODEL_VERSION);
    expect(historical.simulationVersion).toBe(SINGLE_FOUNDER_MODEL_VERSION);
    expect(amended.bootstrap.founderGroupCount).toBe(5);
    expect(historical.bootstrap.founderGroupCount).toBe(1);

    // The version travels with the world, so persisted results are attributable.
    expect(bootstrapWorld(amended).simulationVersion).toBe(MULTI_FOUNDER_MODEL_VERSION);
    historical.rootSeed = amended.rootSeed;
    expect(bootstrapWorld(historical).simulationVersion).toBe(SINGLE_FOUNDER_MODEL_VERSION);
  });

  it('(10) the historical golden hash still holds for the historical model, and is not a target for the amended one', () => {
    const historical = singleFounderModelConfig();
    historical.rootSeed = SEED;
    expect(runSimulation(historical, 10_000).summary.finalStateHash).toBe(SINGLE_FOUNDER_GOLDEN_HASH);

    // The amended model is expected to diverge — that is the point of the
    // amendment, not a regression.
    const amended = config();
    const amendedHash = runSimulation(amended, 10_000).summary.finalStateHash;
    expect(amendedHash).not.toBe(SINGLE_FOUNDER_GOLDEN_HASH);
  });

  it('validates founderGroupCount, and splits uneven populations deterministically', () => {
    // Uneven splits are allowed — focused tests legitimately use tiny
    // populations — but the default 25/5 must stay exact.
    expect(founderGroupOfIndex(0, 25, 5)).toBe(0);
    expect(founderGroupOfIndex(24, 25, 5)).toBe(4);
    const sizes25 = new Array(5).fill(0);
    for (let i = 0; i < 25; i++) sizes25[founderGroupOfIndex(i, 25, 5)]! += 1;
    expect(sizes25).toEqual([5, 5, 5, 5, 5]);

    // 7 organisms over 5 groups: remainder spread over the earliest groups.
    const sizes7 = new Array(5).fill(0);
    for (let i = 0; i < 7; i++) sizes7[founderGroupOfIndex(i, 7, 5)]! += 1;
    expect(sizes7).toEqual([2, 2, 1, 1, 1]);

    // Never more founders than organisms.
    const tiny = config();
    tiny.population.initialPopulationSize = 2;
    expect(effectiveFounderGroupCount(tiny)).toBe(2);
    expect(() => bootstrapWorld(tiny)).not.toThrow();
    expect(bootstrapWorld(tiny).organisms.length).toBe(2);

    const zero = config();
    zero.bootstrap.founderGroupCount = 0;
    expect(() => validateConfig(zero)).toThrow(/integer >= 1/);

    const fractional = config();
    fractional.bootstrap.founderGroupCount = 2.5;
    expect(() => validateConfig(fractional)).toThrow(/integer >= 1/);

    for (const count of [1, 5, 25]) {
      const ok = config();
      ok.bootstrap.founderGroupCount = count;
      expect(() => validateConfig(ok)).not.toThrow();
    }
  });
});
