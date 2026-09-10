import { describe, it, expect } from 'vitest';
import {
  bootstrapWorld,
  cloneConfig,
  DEFAULT_SIMULATION_CONFIG,
  stepWorld,
} from '@alo/simulation-core';
import {
  MOVEMENT_POLICY_IDS,
  MOVEMENT_POLICY_LEVELS,
  movementPolicyGenome,
} from '../src/experiments/movementPolicies.js';
import { installMovementPolicy, installNeuralGenome } from '../src/experiments/installPolicy.js';
import { movementPolicyDiagnostic } from '../src/experiments/definitions.js';
import { runExperiment } from '../src/runner/experiment.js';
import { runReplicate } from '../src/runner/replicate.js';
import { evaluateProbeSet } from '../src/probes/evaluate.js';
import {
  predictDrain,
  impliedForwardFraction,
  measuredDrainPerTick,
  measurementWindowIsClean,
  largestCleanWindow,
} from '../src/analysis/energyModel.js';

const HIDDEN = DEFAULT_SIMULATION_CONFIG.neural.hiddenLayerSize;
const BOUNDS = DEFAULT_SIMULATION_CONFIG.neural.neuralParamBounds;

function diagnosticConfig() {
  const c = cloneConfig(DEFAULT_SIMULATION_CONFIG);
  c.food.initialFoodCount = 0;
  c.food.regenAttemptsPerTick = 0;
  c.mutation.morphologyMutationEnabled = false;
  c.mutation.neuralMutationEnabled = false;
  c.energy.reproductionEnergyThreshold = c.energy.energyCapacity + 1;
  c.lifecycle.maxAge = 100000;
  return c;
}

describe('movement policy genomes (§16.9)', () => {
  it('uses exactly the four policies named in §16.9', () => {
    expect([...MOVEMENT_POLICY_IDS]).toEqual(['stationary', 'speed-25', 'speed-50', 'speed-100']);
    expect(MOVEMENT_POLICY_LEVELS).toEqual({
      'stationary': 0, 'speed-25': 0.25, 'speed-50': 0.5, 'speed-100': 1,
    });
  });

  it('every parameter stays inside the configured neural parameter bounds', () => {
    for (const policyId of MOVEMENT_POLICY_IDS) {
      const g = movementPolicyGenome(policyId, HIDDEN, BOUNDS);
      const all = [
        ...g.inputHiddenWeights, ...g.hiddenBiases, ...g.hiddenOutputWeights, ...g.outputBiases,
      ];
      for (const v of all) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(BOUNDS.min);
        expect(v).toBeLessThanOrEqual(BOUNDS.max);
      }
    }
  });

  it('produces an identical action for all 250 probe states — the controller is input-independent', () => {
    for (const policyId of MOVEMENT_POLICY_IDS) {
      const evaluation = evaluateProbeSet(movementPolicyGenome(policyId, HIDDEN, BOUNDS));
      const first = evaluation.responses[0]!;
      for (const r of evaluation.responses) {
        expect(r.forward).toBe(first.forward);
        expect(r.turn).toBe(first.turn);
        expect(r.eat).toBe(first.eat);
        expect(r.reproduce).toBe(first.reproduce);
      }
    }
  });

  it('attains the requested forward level, within the limits of the §11.59 sigmoid', () => {
    const forwardOf = (policyId: (typeof MOVEMENT_POLICY_IDS)[number]) =>
      evaluateProbeSet(movementPolicyGenome(policyId, HIDDEN, BOUNDS)).responses[0]!.forward;

    // Intermediate levels are exact: sigmoid(logit(p)) = p.
    expect(forwardOf('speed-25')).toBeCloseTo(0.25, 12);
    expect(forwardOf('speed-50')).toBeCloseTo(0.5, 12);

    // The endpoints are asymptotes of the locked output mapping, so they are
    // approached, not reached. Both are far beyond any energetic relevance.
    expect(forwardOf('stationary')).toBeLessThan(1e-6);
    expect(forwardOf('speed-100')).toBeGreaterThan(1 - 1e-6);
  });

  it('a stationary agent requests movement far below the resolution of energy accounting', () => {
    const forward = evaluateProbeSet(movementPolicyGenome('stationary', HIDDEN, BOUNDS)).responses[0]!.forward;
    const { maxSpeed, size } = { maxSpeed: 1.25, size: 1.0 };
    const velocity = forward * maxSpeed;
    const movementCost = DEFAULT_SIMULATION_CONFIG.energy.movementEnergyCoefficient * size * velocity * velocity;
    const basal = 1.0 * DEFAULT_SIMULATION_CONFIG.energy.baseMetabolicConstant;
    expect(movementCost / basal).toBeLessThan(1e-12);
  });

  it('never requests eating or reproduction, and turns at full rate', () => {
    for (const policyId of MOVEMENT_POLICY_IDS) {
      const r = evaluateProbeSet(movementPolicyGenome(policyId, HIDDEN, BOUNDS)).responses[0]!;
      expect(r.eat).toBeLessThan(DEFAULT_SIMULATION_CONFIG.neural.eatThreshold);
      expect(r.reproduce).toBeLessThan(DEFAULT_SIMULATION_CONFIG.neural.reproductionActionThreshold);
      expect(r.turn).toBeGreaterThan(1 - 1e-9);
    }
  });

  it('is deterministic — the same policy always yields the same genome', () => {
    for (const policyId of MOVEMENT_POLICY_IDS) {
      expect(movementPolicyGenome(policyId, HIDDEN, BOUNDS))
        .toEqual(movementPolicyGenome(policyId, HIDDEN, BOUNDS));
    }
  });
});

describe('policy installation is world construction, not observation', () => {
  it('replaces only the neural genome and returns a new world', () => {
    const config = diagnosticConfig();
    config.rootSeed = 100000;
    const world = bootstrapWorld(config);
    const before = JSON.stringify(world);

    const installed = installMovementPolicy(world, config, 'speed-50');

    // The source world is untouched.
    expect(JSON.stringify(world)).toBe(before);
    expect(installed).not.toBe(world);

    // Everything except the neural genome is preserved exactly.
    expect(installed.tick).toBe(world.tick);
    expect(installed.nextOrganismId).toBe(world.nextOrganismId);
    expect(installed.nextFoodId).toBe(world.nextFoodId);
    expect(installed.food).toEqual(world.food);
    expect(installed.fertility).toEqual(world.fertility);
    expect(installed.rng).toEqual(world.rng);
    expect(installed.organisms.length).toBe(world.organisms.length);

    for (let i = 0; i < world.organisms.length; i++) {
      const a = world.organisms[i]!;
      const b = installed.organisms[i]!;
      expect(b.id).toBe(a.id);
      expect(b.x).toBe(a.x);
      expect(b.y).toBe(a.y);
      expect(b.heading).toBe(a.heading);
      expect(b.energy).toBe(a.energy);
      expect(b.age).toBe(a.age);
      expect(b.alive).toBe(a.alive);
      expect(b.parentId).toBe(a.parentId);
      expect(b.generationDepth).toBe(a.generationDepth);
      expect(b.lineageRootId).toBe(a.lineageRootId);
      expect(b.birthTick).toBe(a.birthTick);
      // Morphology is preserved — size and metabolism are inputs to the model
      // under measurement.
      expect(b.genome.morphology).toEqual(a.genome.morphology);
      // Only the neural genome differs.
      expect(b.genome.neural).not.toEqual(a.genome.neural);
    }
  });

  it('consumes no RNG: installing a policy leaves both stream states untouched', () => {
    const config = diagnosticConfig();
    config.rootSeed = 107919;
    const world = bootstrapWorld(config);
    const installed = installNeuralGenome(world, movementPolicyGenome('speed-25', HIDDEN, BOUNDS));
    expect(installed.rng).toEqual(world.rng);
  });
});

describe('diagnostic conditions are what they claim (§16.9 setup)', () => {
  it('food is completely off, mutation is off, reproduction is unreachable, age death is disabled', () => {
    const spec = movementPolicyDiagnostic([100000], 100);
    expect(spec.conditions.length).toBe(5);
    for (const condition of spec.conditions) {
      const c = cloneConfig(DEFAULT_SIMULATION_CONFIG);
      condition.configOverrides(c);
      expect(c.food.initialFoodCount).toBe(0);
      expect(c.food.regenAttemptsPerTick).toBe(0);
      expect(c.mutation.morphologyMutationEnabled).toBe(false);
      expect(c.mutation.neuralMutationEnabled).toBe(false);
      expect(c.energy.reproductionEnergyThreshold).toBeGreaterThan(c.energy.energyCapacity);
      expect(Number.isFinite(c.energy.reproductionEnergyThreshold)).toBe(true);
      expect(c.lifecycle.maxAge).toBe(100000);
      // The energy parameters under test are NOT touched.
      expect(c.energy.baseMetabolicConstant).toBe(DEFAULT_SIMULATION_CONFIG.energy.baseMetabolicConstant);
      expect(c.energy.movementEnergyCoefficient).toBe(DEFAULT_SIMULATION_CONFIG.energy.movementEnergyCoefficient);
      expect(c.energy.configuredInitialEnergy).toBe(DEFAULT_SIMULATION_CONFIG.energy.configuredInitialEnergy);
    }
    // Exactly one condition — the reference cell — has no world transform.
    expect(spec.conditions.filter(c => c.worldTransform === undefined).map(c => c.conditionId))
      .toEqual(['neural-reference']);
  });

  it('produces zero births and zero food in every condition', () => {
    const result = runExperiment(movementPolicyDiagnostic([100000], 600));
    expect(result.replicates.length).toBe(5);
    for (const r of result.replicates) {
      expect(r.totalBirths).toBe(0);
      expect(r.endingFoodCount).toBe(0);
      expect(r.timeseries[0]!.foodCount).toBe(0);
      expect(r.maxGenerationDepth).toBe(0);
    }
  });
});

describe('the energy model behaves as specified under fixed speeds (§16.10)', () => {
  it('measured drain matches the analytic prediction for every fixed policy', () => {
    const result = runExperiment(movementPolicyDiagnostic([100000, 107919], 800));
    const energy = DEFAULT_SIMULATION_CONFIG.energy;

    for (const policyId of MOVEMENT_POLICY_IDS) {
      const replicates = result.replicates.filter(r => r.provenance.conditionId === policyId);
      expect(replicates.length).toBe(2);

      for (const r of replicates) {
        const window = largestCleanWindow(r.timeseries, 200);
        expect(window).toBe(200); // no deaths in the first 200 ticks at any speed
        expect(measurementWindowIsClean(r.timeseries, window)).toBe(true);

        const initial = r.timeseries.find(row => row.tick === 0)!;
        const measured = measuredDrainPerTick(r.timeseries, window)!;
        const predicted = predictDrain(
          { size: initial.meanSize, maxSpeed: initial.meanMaxSpeed, metabolism: initial.meanMetabolism },
          MOVEMENT_POLICY_LEVELS[policyId],
          energy
        ).drainPerTick;

        // Tight: the policies never touch a wall, so the model should hold to
        // within the spread of per-organism morphology.
        expect(measured / predicted).toBeGreaterThan(0.97);
        expect(measured / predicted).toBeLessThan(1.03);
      }
    }
  });

  it('faster policies drain faster and die sooner, in the specified order', () => {
    const result = runExperiment(movementPolicyDiagnostic([100000], 20000));
    const drainOf = (id: string) => {
      const r = result.replicates.find(x => x.provenance.conditionId === id)!;
      return measuredDrainPerTick(r.timeseries, largestCleanWindow(r.timeseries, 200))!;
    };
    const lifetimeOf = (id: string) => {
      const r = result.replicates.find(x => x.provenance.conditionId === id)!;
      expect(r.terminationReason).toBe('EXTINCTION');
      return r.extinctionTick!;
    };

    expect(drainOf('stationary')).toBeLessThan(drainOf('speed-25'));
    expect(drainOf('speed-25')).toBeLessThan(drainOf('speed-50'));
    expect(drainOf('speed-50')).toBeLessThan(drainOf('speed-100'));

    expect(lifetimeOf('stationary')).toBeGreaterThan(lifetimeOf('speed-25'));
    expect(lifetimeOf('speed-25')).toBeGreaterThan(lifetimeOf('speed-50'));
    expect(lifetimeOf('speed-50')).toBeGreaterThan(lifetimeOf('speed-100'));
  });

  it('a stationary agent drains at basal metabolism alone', () => {
    const result = runExperiment(movementPolicyDiagnostic([100000], 800));
    const r = result.replicates.find(x => x.provenance.conditionId === 'stationary')!;
    const initial = r.timeseries.find(row => row.tick === 0)!;
    const measured = measuredDrainPerTick(r.timeseries, 200)!;
    const basal = initial.meanMetabolism * DEFAULT_SIMULATION_CONFIG.energy.baseMetabolicConstant;
    expect(measured / basal).toBeGreaterThan(0.99);
    expect(measured / basal).toBeLessThan(1.01);
  });

  it('impliedForwardFraction inverts predictDrain', () => {
    const morphology = { size: 1.0, maxSpeed: 1.25, metabolism: 1.0 };
    const energy = DEFAULT_SIMULATION_CONFIG.energy;
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const drain = predictDrain(morphology, fraction, energy).drainPerTick;
      expect(impliedForwardFraction(drain, morphology, energy)!).toBeCloseTo(fraction, 12);
    }
    // Below basal is not a speed; it is a broken measurement.
    expect(impliedForwardFraction(0.001, morphology, energy)).toBeNull();
  });
});

describe('why every policy also turns (design justification)', () => {
  it('a zero-turn agent parks against a wall and its drain collapses toward basal', () => {
    // This is the failure mode the full-rate turn exists to avoid: movement
    // energy is charged on ACTUAL resolved displacement (§12.8), and
    // resolveMovement clamps position to the perimeter, so a straight-line
    // agent stops paying for movement once it reaches a wall.
    const config = diagnosticConfig();
    const straight = runReplicate({
      experimentId: 'test', conditionId: 'straight', seed: 100000,
      maxTicks: 20000, config, metricsSampleInterval: 50,
      stopOnExtinction: true, gitCommit: null,
      worldTransform: (w, c) => installMovementPolicy(w, c, 'speed-100', { turn: 'none' }),
    });
    const circling = runReplicate({
      experimentId: 'test', conditionId: 'circling', seed: 100000,
      maxTicks: 20000, config, metricsSampleInterval: 50,
      stopOnExtinction: true, gitCommit: null,
      worldTransform: (w, c) => installMovementPolicy(w, c, 'speed-100'),
    });

    const basal = circling.timeseries[0]!.meanMetabolism
      * DEFAULT_SIMULATION_CONFIG.energy.baseMetabolicConstant;

    // Early on, before anyone reaches a wall, both drain at the full 100% rate.
    const straightEarly = measuredDrainPerTick(straight.timeseries, 50)!;
    const circlingEarly = measuredDrainPerTick(circling.timeseries, 50)!;
    expect(straightEarly / circlingEarly).toBeGreaterThan(0.95);

    // The straight-line agent then parks and outlives the circling one by a
    // wide margin, ending near basal-only drain.
    expect(straight.extinctionTick!).toBeGreaterThan(2 * circling.extinctionTick!);
    const straightLate = (straight.timeseries[0]!.meanEnergy - 0) / straight.extinctionTick!;
    expect(straightLate / basal).toBeLessThan(1.5);
  });
});
