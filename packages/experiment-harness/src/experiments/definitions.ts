/**
 * Phase 0B experiment definitions.
 *
 * Four diagnostic experiments (A–D) and the primary 2×2 mutation factorial.
 * Each returns an ExperimentSpec that can be passed to runExperiment().
 */

import { cloneConfig, DEFAULT_SIMULATION_CONFIG, SimulationConfig } from '@alo/simulation-core';
import type { WorldState } from '@alo/simulation-core';
import type { ExperimentSpec, ExperimentCondition } from '../types.js';
import { MOVEMENT_POLICY_IDS } from './movementPolicies.js';
import { installMovementPolicy } from './installPolicy.js';

function baseConfig(): SimulationConfig {
  return cloneConfig(DEFAULT_SIMULATION_CONFIG);
}

/**
 * Diagnostic A — Starvation.
 * Food regeneration OFF, reproduction OFF, mutation OFF.
 * Measures the basic energy economy without food input.
 */
export function starvationDiagnostic(seeds: number[], maxTicks = 5000): ExperimentSpec {
  return {
    experimentId: 'diagnostic-starvation',
    description: 'Starvation diagnostic: no food regeneration, no reproduction, no mutation. Measures basic energy economy.',
    baseConfigFactory: baseConfig,
    conditions: [{
      conditionId: 'starvation',
      configOverrides: (c) => {
        c.food.initialFoodCount = 0;
        c.food.regenAttemptsPerTick = 0;
        c.mutation.morphologyMutationEnabled = false;
        c.mutation.neuralMutationEnabled = false;
        // Finite override strictly above energyCapacity guarantees reproduction is unreachable (§12.35, §12.37)
        c.energy.reproductionEnergyThreshold = c.energy.energyCapacity + 1;
      },
    }],
    seeds,
    maxTicks,
    metricsSampleInterval: 50,
    stopOnExtinction: true,
  };
}

/**
 * Diagnostic B — Feeding.
 * Food ON, reproduction OFF, mutation OFF.
 * Measures whether organisms can interact with the food system.
 */
export function feedingDiagnostic(seeds: number[], maxTicks = 10000): ExperimentSpec {
  return {
    experimentId: 'diagnostic-feeding',
    description: 'Feeding diagnostic: food regeneration active, no reproduction, no mutation. Tests food interaction.',
    baseConfigFactory: baseConfig,
    conditions: [{
      conditionId: 'feeding',
      configOverrides: (c) => {
        c.mutation.morphologyMutationEnabled = false;
        c.mutation.neuralMutationEnabled = false;
        // Finite override strictly above energyCapacity guarantees reproduction is unreachable (§12.35, §12.37)
        c.energy.reproductionEnergyThreshold = c.energy.energyCapacity + 1;
      },
    }],
    seeds,
    maxTicks,
    metricsSampleInterval: 100,
    stopOnExtinction: true,
  };
}

/**
 * Diagnostic C — Reproduction Without Mutation.
 * Food ON, reproduction ON, mutation OFF.
 * Measures population dynamics with exact inheritance (control condition).
 */
export function reproductionControlDiagnostic(seeds: number[], maxTicks = 10000): ExperimentSpec {
  return {
    experimentId: 'diagnostic-reproduction-control',
    description: 'Reproduction control: food + reproduction active, mutation off. Population dynamics with exact inheritance.',
    baseConfigFactory: baseConfig,
    conditions: [{
      conditionId: 'repro-no-mutation',
      configOverrides: (c) => {
        c.mutation.morphologyMutationEnabled = false;
        c.mutation.neuralMutationEnabled = false;
      },
    }],
    seeds,
    maxTicks,
    metricsSampleInterval: 100,
    stopOnExtinction: true,
  };
}

/**
 * Diagnostic D — Full Evolutionary Loop.
 * Food ON, reproduction ON, mutation ON.
 * Verifies that variation, inheritance and differential reproduction operate.
 */
export function fullEvolutionaryDiagnostic(seeds: number[], maxTicks = 10000): ExperimentSpec {
  return {
    experimentId: 'diagnostic-full-evolutionary',
    description: 'Full evolutionary loop: food + reproduction + mutation. Verifies variation, inheritance, and differential reproduction.',
    baseConfigFactory: baseConfig,
    conditions: [{
      conditionId: 'full-evolution',
      configOverrides: (_c) => {
        // Default config: both mutation channels ON, food ON, reproduction ON.
      },
    }],
    seeds,
    maxTicks,
    metricsSampleInterval: 100,
    stopOnExtinction: true,
  };
}

/**
 * The primary 2×2 mutation factorial experiment.
 * Four conditions differing ONLY in mutation enable flags.
 * Uses paired seeds for clean comparison.
 */
export function mutation2x2Experiment(seeds: number[], maxTicks = 10000): ExperimentSpec {
  const conditions: ExperimentCondition[] = [
    {
      conditionId: 'control',
      configOverrides: (c) => {
        c.mutation.morphologyMutationEnabled = false;
        c.mutation.neuralMutationEnabled = false;
      },
    },
    {
      conditionId: 'morph-only',
      configOverrides: (c) => {
        c.mutation.morphologyMutationEnabled = true;
        c.mutation.neuralMutationEnabled = false;
      },
    },
    {
      conditionId: 'neural-only',
      configOverrides: (c) => {
        c.mutation.morphologyMutationEnabled = false;
        c.mutation.neuralMutationEnabled = true;
      },
    },
    {
      conditionId: 'combined',
      configOverrides: (c) => {
        c.mutation.morphologyMutationEnabled = true;
        c.mutation.neuralMutationEnabled = true;
      },
    },
  ];

  return {
    experimentId: 'mutation-2x2',
    description: '2×2 mutation factorial: four conditions differing only in morphology/neural mutation enable flags.',
    baseConfigFactory: baseConfig,
    conditions,
    seeds,
    maxTicks,
    metricsSampleInterval: 100,
    stopOnExtinction: true,
  };
}

/**
 * Diagnostic A2 — test-only fixed movement policies (§16.9).
 *
 * Purpose: separate two candidate explanations for Diagnostic A's
 * longer-than-expected starvation lifetimes (median 1066 against the §16.8
 * target of 500-700 ticks):
 *
 *   (1) the founder/neural controllers request little movement, so organisms
 *       pay far less than the movement cost the §16.10 estimate assumes; or
 *   (2) basal/movement energy calibration is itself wrong.
 *
 * The design isolates the energy model by removing the controller as a
 * variable: four conditions run deterministic fixed-speed policies, and a fifth
 * runs the unmodified controller as the reference cell. The five conditions are
 * identical in every other respect — same seeds, same config, same morphology
 * per seed.
 *
 * Configuration, precommitted:
 *   - food COMPLETELY off: initialFoodCount = 0 AND regenAttemptsPerTick = 0
 *   - both mutation channels off
 *   - reproduction unreachable: reproductionEnergyThreshold = energyCapacity + 1
 *     (finite, per the Diagnostic A/B convention)
 *   - lifecycle.maxAge raised to 100000 so ENERGY_DEPLETION is the ONLY death
 *     mechanism. Age death would truncate the slower policies and corrupt the
 *     very quantity being measured. Diagnostic A's longest observed lifetime
 *     was 1662 ticks, well under the default maxAge of 3000, so the reference
 *     cell is unaffected by this change and remains comparable to Diagnostic A.
 *
 * Everything else stays at the Phase 0A defaults. In particular the energy
 * parameters under test - baseMetabolicConstant, movementEnergyCoefficient,
 * configuredInitialEnergy - are NOT touched.
 */
export function movementPolicyDiagnostic(seeds: number[], maxTicks = 20000): ExperimentSpec {
  const diagnosticConfig = (c: SimulationConfig): void => {
    c.food.initialFoodCount = 0;
    c.food.regenAttemptsPerTick = 0;
    c.mutation.morphologyMutationEnabled = false;
    c.mutation.neuralMutationEnabled = false;
    c.energy.reproductionEnergyThreshold = c.energy.energyCapacity + 1;
    // Starvation must be the only death mechanism in an energy diagnostic.
    c.lifecycle.maxAge = 100000;
  };

  const conditions: ExperimentCondition[] = [
    {
      // Reference cell: the unmodified founder/neural controllers.
      conditionId: 'neural-reference',
      configOverrides: diagnosticConfig,
    },
    ...MOVEMENT_POLICY_IDS.map((policyId) => ({
      conditionId: policyId,
      configOverrides: diagnosticConfig,
      worldTransform: (world: WorldState, config: SimulationConfig) =>
        installMovementPolicy(world, config, policyId),
    })),
  ];

  return {
    experimentId: 'diagnostic-movement-policy',
    description:
      'Test-only fixed movement policies (§16.9): stationary / 25% / 50% / 100% speed plus the ' +
      'unmodified controller, with food and reproduction off, to separate controller behaviour ' +
      'from energy-model calibration.',
    baseConfigFactory: baseConfig,
    conditions,
    seeds,
    maxTicks,
    metricsSampleInterval: 50,
    stopOnExtinction: true,
  };
}
