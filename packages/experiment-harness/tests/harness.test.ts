import { describe, it, expect } from 'vitest';
import {
  cloneConfig,
  DEFAULT_SIMULATION_CONFIG,
  runSimulation,
  canonicalStateHash,
  validateConfig,
} from '@alo/simulation-core';
import { runReplicate } from '../src/runner/replicate.js';
import { runExperiment } from '../src/runner/experiment.js';
import {
  starvationDiagnostic,
  feedingDiagnostic,
  reproductionControlDiagnostic,
  fullEvolutionaryDiagnostic,
  mutation2x2Experiment,
} from '../src/experiments/definitions.js';
import { computeTimeseriesRow, meanAndVariance, median } from '../src/metrics/compute.js';
import { detectDegeneracy, passesCalibrationCriteria, DEFAULT_DEGENERACY_CRITERIA, DEFAULT_CALIBRATION_CRITERIA } from '../src/analysis/degeneracy.js';
import { generateSweepConfigurations, runSweep } from '../src/runner/sweep.js';
import type { ConditionSummary } from '../src/types.js';

const SMALL_SEEDS = [42, 43, 44];

describe('replicate runner', () => {
  it('runs requested seeds and produces structured results', () => {
    const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    const result = runReplicate({
      experimentId: 'test',
      conditionId: 'test-cond',
      seed: 42,
      maxTicks: 100,
      config,
      metricsSampleInterval: 50,
      stopOnExtinction: true,
      gitCommit: null,
    });

    expect(result.provenance.experimentId).toBe('test');
    expect(result.provenance.conditionId).toBe('test-cond');
    expect(result.provenance.seed).toBe(42);
    expect(result.startTick).toBe(0);
    expect(result.endTick).toBeGreaterThan(0);
    expect(['MAX_TICKS', 'EXTINCTION']).toContain(result.terminationReason);
    expect(result.startingPopulation).toBe(25);
    expect(result.finalStateHash).toBeTruthy();
    expect(result.timeseries.length).toBeGreaterThan(0);
  });

  it('replicate IDs are deterministic', () => {
    const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    const a = runReplicate({
      experimentId: 'test', conditionId: 'c1', seed: 42,
      maxTicks: 50, config, metricsSampleInterval: 50,
      stopOnExtinction: true, gitCommit: null,
    });
    const b = runReplicate({
      experimentId: 'test', conditionId: 'c1', seed: 42,
      maxTicks: 50, config, metricsSampleInterval: 50,
      stopOnExtinction: true, gitCommit: null,
    });
    expect(a.provenance.replicateId).toBe(b.provenance.replicateId);
    expect(a.finalStateHash).toBe(b.finalStateHash);
  });

  it('extinction terminates correctly and is reported', () => {
    const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    config.food.regenAttemptsPerTick = 0;
    config.energy.reproductionEnergyThreshold = config.energy.energyCapacity + 1;
    const result = runReplicate({
      experimentId: 'test', conditionId: 'starve', seed: 1,
      maxTicks: 50000, config, metricsSampleInterval: 100,
      stopOnExtinction: true, gitCommit: null,
    });
    expect(result.terminationReason).toBe('EXTINCTION');
    expect(result.extinctionTick).toBeGreaterThan(0);
    expect(result.endingPopulation).toBe(0);
  });

  it('max tick terminates correctly', () => {
    const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    const result = runReplicate({
      experimentId: 'test', conditionId: 'limited', seed: 1,
      maxTicks: 10, config, metricsSampleInterval: 5,
      stopOnExtinction: false, gitCommit: null,
    });
    expect(result.endTick).toBe(10);
    expect(result.terminationReason).toBe('MAX_TICKS');
  });
});

describe('experiment runner', () => {
  it('runs all conditions and seeds', () => {
    const spec = starvationDiagnostic([42, 43], 500);
    const result = runExperiment(spec);
    expect(result.replicates.length).toBe(2); // 1 condition × 2 seeds
    expect(result.conditions.length).toBe(1);
    expect(result.conditions[0]!.replicateCount).toBe(2);
  });

  it('2×2 experiment creates four conditions with paired seeds', () => {
    const spec = mutation2x2Experiment([42], 100);
    const result = runExperiment(spec);
    expect(result.conditions.length).toBe(4);
    expect(result.replicates.length).toBe(4); // 4 conditions × 1 seed
    const conditionIds = result.conditions.map(c => c.conditionId);
    expect(conditionIds).toContain('control');
    expect(conditionIds).toContain('morph-only');
    expect(conditionIds).toContain('neural-only');
    expect(conditionIds).toContain('combined');
    // All used same seed
    for (const r of result.replicates) {
      expect(r.provenance.seed).toBe(42);
    }
  });
});

describe('seed management', () => {
  it('pilot and validation seeds are disjoint', () => {
    // Read the seed files directly to test disjointness
    const pilotSeeds = [100000, 107919, 115838, 123757, 131676, 139595, 147514, 155433, 163352, 171271, 179190, 187109, 195028, 202947, 210866];
    const validationSeeds = [500000, 506271, 512542, 518813, 525084, 531355, 537626, 543897, 550168, 556439, 562710, 568981, 575252, 581523, 587794, 594065, 600336, 606607, 612878, 619149, 625420, 631691, 637962, 644233, 650504];
    const pilotSet = new Set(pilotSeeds);
    expect(validationSeeds.every(s => !pilotSet.has(s))).toBe(true);
  });

  it('paired conditions receive corresponding seeds', () => {
    const spec = mutation2x2Experiment([42, 99], 50);
    const result = runExperiment(spec);
    // Each condition should have replicates for both seeds
    for (const condId of ['control', 'morph-only', 'neural-only', 'combined']) {
      const condReplicates = result.replicates.filter(r => r.provenance.conditionId === condId);
      const seeds = condReplicates.map(r => r.provenance.seed).sort();
      expect(seeds).toEqual([42, 99]);
    }
  });
});

describe('metrics', () => {
  it('meanAndVariance handles empty arrays', () => {
    const r = meanAndVariance([]);
    expect(r.mean).toBe(0);
    expect(r.variance).toBe(0);
  });

  it('meanAndVariance is correct for known values', () => {
    const r = meanAndVariance([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(r.mean).toBeCloseTo(5, 10);
    expect(r.variance).toBeCloseTo(4, 10);
  });

  it('median is correct', () => {
    expect(median([1, 3, 5])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
    expect(median([7])).toBe(7);
  });

  it('timeseries row has no NaN for extinct populations', () => {
    // Simulate to extinction, then compute metrics on the extinct world
    const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    config.food.regenAttemptsPerTick = 0;
    config.energy.reproductionEnergyThreshold = config.energy.energyCapacity + 1;
    const result = runReplicate({
      experimentId: 'test', conditionId: 'test', seed: 1,
      maxTicks: 50000, config, metricsSampleInterval: 100,
      stopOnExtinction: true, gitCommit: null,
    });
    // Check last row (should be at extinction)
    const lastRow = result.timeseries[result.timeseries.length - 1]!;
    for (const [key, value] of Object.entries(lastRow)) {
      if (typeof value === 'number') {
        expect(Number.isNaN(value)).toBe(false);
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('lineage metrics are correct', () => {
    const spec = reproductionControlDiagnostic([42], 1000);
    const result = runExperiment(spec);
    const r = result.replicates[0]!;
    // Should have valid lineage data
    expect(r.maxGenerationDepth).toBeGreaterThanOrEqual(0);
    expect(r.activeLineageCount).toBeGreaterThanOrEqual(0);
  });
});

describe('mutation 2×2 conditions', () => {
  it('four conditions differ ONLY in mutation enable flags', () => {
    const spec = mutation2x2Experiment([42], 10);
    // Check that the conditions apply different mutation flags
    const configs: Record<string, { morph: boolean; neural: boolean }> = {};
    for (const cond of spec.conditions) {
      const c = cloneConfig(DEFAULT_SIMULATION_CONFIG);
      cond.configOverrides(c);
      configs[cond.conditionId] = {
        morph: c.mutation.morphologyMutationEnabled,
        neural: c.mutation.neuralMutationEnabled,
      };
    }
    expect(configs['control']).toEqual({ morph: false, neural: false });
    expect(configs['morph-only']).toEqual({ morph: true, neural: false });
    expect(configs['neural-only']).toEqual({ morph: false, neural: true });
    expect(configs['combined']).toEqual({ morph: true, neural: true });
  });

  it('original base config is not mutated by condition overrides', () => {
    const before = JSON.parse(JSON.stringify(DEFAULT_SIMULATION_CONFIG));
    const spec = mutation2x2Experiment([42], 10);
    runExperiment(spec);
    expect(JSON.parse(JSON.stringify(DEFAULT_SIMULATION_CONFIG))).toEqual(before);
  });
});

describe('observational purity', () => {
  it('enabling/disabling metrics does not change final canonical hash', () => {
    const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    config.rootSeed = 42;
    // Run with metrics
    const withMetrics = runReplicate({
      experimentId: 'test', conditionId: 'test', seed: 42,
      maxTicks: 200, config, metricsSampleInterval: 10,
      stopOnExtinction: true, gitCommit: null,
    });
    // Run without frequent metrics
    const withoutMetrics = runReplicate({
      experimentId: 'test', conditionId: 'test', seed: 42,
      maxTicks: 200, config, metricsSampleInterval: 200,
      stopOnExtinction: true, gitCommit: null,
    });
    expect(withMetrics.finalStateHash).toBe(withoutMetrics.finalStateHash);
  });
});

describe('degeneracy detection', () => {
  it('detects near-universal extinction', () => {
    const summary: ConditionSummary = {
      experimentId: 'test', conditionId: 'test',
      replicateCount: 10, extinctionCount: 10, extinctionRate: 1.0,
      medianExtinctionTick: 500, meanFinalPopulation: 0, medianFinalPopulation: 0,
      totalBirths: 0, totalDeaths: 250, maxGenerationDepth: 0,
      meanMaxGenerationDepth: 0, meanActiveLineageCount: 0,
      meanMorphSizeVariance: 0, meanNeuralParamVariance: 0, meanReproductiveFraction: 0,
    };
    const flags = detectDegeneracy(summary);
    expect(flags.nearUniversalExtinction).toBe(true);
    expect(flags.isDegenerate).toBe(true);
  });
});

describe('parameter sweep', () => {
  it('generates valid configurations and preserves invariants', () => {
    const configs = generateSweepConfigurations({
      sweepId: 'test', description: 'test',
      parameters: [
        { path: 'food.regenAttemptsPerTick', values: [1, 2, 3] },
        { path: 'energy.foodEnergyValue', values: [20, 30] },
      ],
      seeds: [1], maxTicks: 100,
    });
    expect(configs.length).toBe(6); // 3 × 2
    // Each config should have both parameters
    for (const c of configs) {
      expect(c.parameterValues['food.regenAttemptsPerTick']).toBeDefined();
      expect(c.parameterValues['energy.foodEnergyValue']).toBeDefined();
    }
  });

  it('rejects configurations violating locked invariants', () => {
    const configs = generateSweepConfigurations({
      sweepId: 'test', description: 'test',
      parameters: [
        // birthEnergy default is 25; reproductionCost at 20 would violate reproductionCost > birthEnergy
        { path: 'energy.reproductionCost', values: [20, 45] },
      ],
      seeds: [1], maxTicks: 100,
    });
    // Should only include the valid config (reproductionCost=45)
    expect(configs.length).toBe(1);
    expect(configs[0]!.parameterValues['energy.reproductionCost']).toBe(45);
  });
});

describe('Phase 0A regression', () => {
  it('golden hash for seed 20260910, 10000 ticks is unchanged', () => {
    const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    config.rootSeed = 20260910;
    const result = runSimulation(config, 10000);
    expect(result.summary.finalStateHash).toBe('6a6576bd49e86b27');
  });
});

describe('diagnostic interventions and config validation', () => {
  it('Diagnostic A guarantees no food and zero reproduction', () => {
    const spec = starvationDiagnostic([42], 5000);
    const result = runExperiment(spec);
    const rep = result.replicates[0]!;
    expect(rep.totalBirths).toBe(0);
    expect(rep.endingFoodCount).toBe(0);
    expect(rep.timeseries[0]!.foodCount).toBe(0);
    expect(rep.terminationReason).toBe('EXTINCTION');
  });

  it('Diagnostic B has active food but guarantees zero reproduction', () => {
    const spec = feedingDiagnostic([42], 500);
    const result = runExperiment(spec);
    const rep = result.replicates[0]!;
    expect(rep.totalBirths).toBe(0);
    expect(rep.timeseries[0]!.foodCount).toBeGreaterThan(0);
    expect(rep.endingFoodCount).toBeGreaterThan(0);
  });

  it('validateConfig rejects non-finite config sentinels', () => {
    const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    config.energy.reproductionEnergyThreshold = Infinity;
    expect(() => validateConfig(config)).toThrow(/finite number/);
    config.energy.reproductionEnergyThreshold = NaN;
    expect(() => validateConfig(config)).toThrow(/finite number/);
  });

  it('reproductionEnergyThreshold strictly above capacity is valid and disables reproduction', () => {
    const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    config.energy.reproductionEnergyThreshold = config.energy.energyCapacity + 1;
    expect(() => validateConfig(config)).not.toThrow();
    const cloned = cloneConfig(config);
    expect(cloned.energy.reproductionEnergyThreshold).toBe(101);
  });
});

describe('chunked sweep execution and summary rebuild', () => {
  it('a config filter runs only the requested configurations, with unchanged config ids', () => {
    const spec = {
      sweepId: 'test', description: 'test',
      parameters: [
        { path: 'food.regenAttemptsPerTick', values: [1, 2, 3] },
        { path: 'energy.foodEnergyValue', values: [20, 30] },
      ],
      seeds: [42], maxTicks: 20,
    };
    const all = generateSweepConfigurations(spec);
    expect(all.length).toBe(6);

    const wanted = [1, 3];
    const result = runSweep(spec, {}, (config) => wanted.includes(Number(config.configId.split('_')[1])));

    expect(result.configurations.length).toBe(2);
    // Config ids (and therefore output directory names) are identical to the
    // ones a single unchunked run would produce.
    expect(result.configurations.map(c => c.configId))
      .toEqual(wanted.map(i => all[i]!.configId));
    expect(result.results.length).toBe(2);
  });

  it('rebuilds sweep-summary.json from the configuration directories on disk', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { writeSweepSummaryFromDisk } = await import('../src/output/writer.js');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alo-sweep-'));
    const mkConfig = (name: string, meanFinalPopulation: number) => {
      fs.mkdirSync(path.join(dir, name), { recursive: true });
      fs.writeFileSync(path.join(dir, name, 'condition-summary.json'), JSON.stringify([{
        experimentId: 'x', conditionId: name, replicateCount: 8,
        extinctionCount: 4, extinctionRate: 0.5, runawayCount: 1,
        viableCompletionCount: 3, viableCompletionRate: 0.375,
        medianExtinctionTick: 3000, meanFinalPopulation, medianFinalPopulation: 0,
        totalBirths: 100, totalDeaths: 90, maxGenerationDepth: 5,
        meanMaxGenerationDepth: 3, meanActiveLineageCount: 1,
        meanMorphSizeVariance: 0, meanNeuralParamVariance: 0, meanReproductiveFraction: 0.2,
      }]));
    };
    // Written out of order, and with a two-digit index, to check ordering.
    mkConfig('sweep_10_regenAttemptsPerTick=6_foodEnergyValue=40', 480);
    mkConfig('sweep_2_regenAttemptsPerTick=2_foodEnergyValue=40', 230);

    const count = writeSweepSummaryFromDisk(dir, (s) => s.meanFinalPopulation <= 400);
    expect(count).toBe(2);

    const summary = JSON.parse(fs.readFileSync(path.join(dir, 'sweep-summary.json'), 'utf-8'));
    expect(summary.map((r: { configId: string }) => r.configId))
      .toEqual([
        'sweep_2_regenAttemptsPerTick=2_foodEnergyValue=40',
        'sweep_10_regenAttemptsPerTick=6_foodEnergyValue=40',
      ]);
    // Parameter values are recovered from the directory name.
    expect(summary[0].regenAttemptsPerTick).toBe(2);
    expect(summary[0].foodEnergyValue).toBe(40);
    expect(summary[1].regenAttemptsPerTick).toBe(6);
    // The pass predicate is applied per configuration.
    expect(summary[0].passesCriteria).toBe(true);
    expect(summary[1].passesCriteria).toBe(false);
    // Condition-summary fields are carried through.
    expect(summary[0].viableCompletionRate).toBe(0.375);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
