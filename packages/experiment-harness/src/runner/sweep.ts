/**
 * Deterministic parameter sweep facility.
 *
 * Generates a Cartesian product of parameter values, creates experiment
 * specs for each configuration, and runs them. Preserves locked invariants.
 */

import { cloneConfig, DEFAULT_SIMULATION_CONFIG, SimulationConfig } from '@alo/simulation-core';
import type { ExperimentSpec, ExperimentCondition } from '../types.js';
import { runExperiment, ExperimentRunOptions } from '../runner/experiment.js';
import type { ExperimentResult, ConditionSummary } from '../types.js';

export interface SweepParameter {
  /** Dot-path into SimulationConfig, e.g. 'food.regenAttemptsPerTick'. */
  path: string;
  values: number[];
}

export interface SweepSpec {
  sweepId: string;
  description: string;
  parameters: SweepParameter[];
  seeds: number[];
  maxTicks: number;
  metricsSampleInterval?: number;
}

export interface SweepConfiguration {
  configId: string;
  /** Parameter values for this configuration point. */
  parameterValues: Record<string, number>;
}

export interface SweepResult {
  sweepId: string;
  configurations: SweepConfiguration[];
  results: ExperimentResult[];
}

/** Set a nested property by dot-path. */
function setNestedProperty(obj: unknown, path: string, value: number): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]!] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

/** Generate Cartesian product of parameter values. */
function cartesianProduct(params: SweepParameter[]): Record<string, number>[] {
  if (params.length === 0) return [{}];
  const [first, ...rest] = params;
  const subProduct = cartesianProduct(rest);
  const result: Record<string, number>[] = [];
  for (const val of first!.values) {
    for (const sub of subProduct) {
      result.push({ [first!.path]: val, ...sub });
    }
  }
  return result;
}

/** Validate that a configuration doesn't violate locked invariants. */
function validateSweepConfig(config: SimulationConfig): boolean {
  try {
    // Check the critical locked invariant
    if (config.energy.reproductionCost <= config.energy.birthEnergy) return false;
    if (config.lifecycle.maxAge <= config.lifecycle.maturityAge) return false;
    if (config.food.worldFoodCapacity < config.food.initialFoodCount) return false;
    return true;
  } catch {
    return false;
  }
}

export function generateSweepConfigurations(spec: SweepSpec): SweepConfiguration[] {
  const combos = cartesianProduct(spec.parameters);
  const configs: SweepConfiguration[] = [];

  for (let i = 0; i < combos.length; i++) {
    const params = combos[i]!;
    const c = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    for (const [path, value] of Object.entries(params)) {
      setNestedProperty(c, path, value);
    }
    if (validateSweepConfig(c)) {
      const parts = Object.entries(params).map(([k, v]) => `${k.split('.').pop()}=${v}`).join('_');
      configs.push({ configId: `sweep_${i}_${parts}`, parameterValues: params });
    }
  }

  return configs;
}

export function runSweep(
  spec: SweepSpec,
  options: ExperimentRunOptions = {}
): SweepResult {
  const configurations = generateSweepConfigurations(spec);
  const results: ExperimentResult[] = [];

  let globalIdx = 0;
  const totalReplicates = configurations.length * spec.seeds.length;

  for (const sweepConfig of configurations) {
    const experimentSpec: ExperimentSpec = {
      experimentId: `${spec.sweepId}_${sweepConfig.configId}`,
      description: `Sweep ${spec.sweepId}: ${JSON.stringify(sweepConfig.parameterValues)}`,
      baseConfigFactory: () => {
        const c = cloneConfig(DEFAULT_SIMULATION_CONFIG);
        for (const [path, value] of Object.entries(sweepConfig.parameterValues)) {
          setNestedProperty(c, path, value);
        }
        return c;
      },
      conditions: [{
        conditionId: sweepConfig.configId,
        configOverrides: () => {},
      }],
      seeds: spec.seeds,
      maxTicks: spec.maxTicks,
      metricsSampleInterval: spec.metricsSampleInterval ?? 100,
      stopOnExtinction: true,
    };

    const result = runExperiment(experimentSpec, {
      ...options,
      onReplicateComplete: (r, idx, _total) => {
        globalIdx++;
        options.onReplicateComplete?.(r, globalIdx, totalReplicates);
      },
    });
    results.push(result);
  }

  return { sweepId: spec.sweepId, configurations, results };
}
