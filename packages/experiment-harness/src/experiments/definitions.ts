/**
 * Phase 0B experiment definitions.
 *
 * Four diagnostic experiments (A–D) and the primary 2×2 mutation factorial.
 * Each returns an ExperimentSpec that can be passed to runExperiment().
 */

import { cloneConfig, DEFAULT_SIMULATION_CONFIG, SimulationConfig } from '@alo/simulation-core';
import type { ExperimentSpec, ExperimentCondition } from '../types.js';

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
