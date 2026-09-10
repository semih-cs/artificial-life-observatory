/**
 * Experiment runner — executes all replicates across all conditions.
 *
 * Runs sequentially (deterministic, simple, safe).
 * Each replicate is fully independent and deterministic.
 */

import { cloneConfig, SimulationConfig } from '@alo/simulation-core';
import type { ExperimentSpec, ExperimentResult, ConditionSummary, ReplicateResult } from '../types.js';
import { runReplicate, TickObserver } from './replicate.js';
import { median } from '../metrics/compute.js';
import { summarizeOutcomes } from '../analysis/outcome.js';

export interface ExperimentRunOptions {
  /** Git commit hash for provenance (null if unavailable). */
  gitCommit?: string | null;
  /** Called after each replicate completes. */
  onReplicateComplete?: (result: ReplicateResult, index: number, total: number) => void;
  /** OPTIONAL read-only per-tick observer for one replicate (see runReplicate). */
  tickObserverFor?: (conditionId: string, seed: number) => TickObserver | undefined;
}

export function runExperiment(spec: ExperimentSpec, options: ExperimentRunOptions = {}): ExperimentResult {
  const gitCommit = options.gitCommit ?? null;
  const sampleInterval = spec.metricsSampleInterval ?? 100;
  const stopOnExtinction = spec.stopOnExtinction ?? true;
  const runawayCapEnabled = spec.runawayCapEnabled ?? true;

  const replicates: ReplicateResult[] = [];
  const total = spec.conditions.length * spec.seeds.length;
  let index = 0;

  for (const condition of spec.conditions) {
    for (const seed of spec.seeds) {
      const baseConfig = spec.baseConfigFactory();
      condition.configOverrides(baseConfig);

      const result = runReplicate({
        experimentId: spec.experimentId,
        conditionId: condition.conditionId,
        seed,
        maxTicks: spec.maxTicks,
        config: baseConfig,
        metricsSampleInterval: sampleInterval,
        stopOnExtinction,
        gitCommit,
        runawayCapEnabled,
        worldTransform: condition.worldTransform,
        safetyPopulationCeiling: spec.safetyPopulationCeiling,
        onTick: options.tickObserverFor?.(condition.conditionId, seed),
      });

      replicates.push(result);
      index++;
      options.onReplicateComplete?.(result, index, total);
    }
  }

  // Compute condition summaries
  const conditions = spec.conditions.map(cond => {
    const condReplicates = replicates.filter(r => r.provenance.conditionId === cond.conditionId);
    return computeConditionSummary(spec.experimentId, cond.conditionId, condReplicates);
  });

  return { experimentId: spec.experimentId, conditions, replicates };
}

function computeConditionSummary(
  experimentId: string,
  conditionId: string,
  replicates: ReplicateResult[]
): ConditionSummary {
  const n = replicates.length;
  if (n === 0) {
    return {
      experimentId, conditionId,
      replicateCount: 0, extinctionCount: 0, extinctionRate: 0,
      runawayCount: 0, viableCompletionCount: 0, viableCompletionRate: 0,
      medianExtinctionTick: null,
      meanFinalPopulation: 0, medianFinalPopulation: 0,
      totalBirths: 0, totalDeaths: 0,
      maxGenerationDepth: 0, meanMaxGenerationDepth: 0,
      meanActiveLineageCount: 0,
      meanMorphSizeVariance: 0, meanNeuralParamVariance: 0,
      meanReproductiveFraction: 0,
    };
  }

  const extinctionTicks: number[] = [];
  let extinctionCount = 0;
  let sumPop = 0, sumBirths = 0, sumDeaths = 0;
  let maxGen = 0, sumMaxGen = 0;
  let sumLineageCount = 0;
  let sumSizeVar = 0, sumNeuralVar = 0, sumReproFraction = 0;
  const finalPops: number[] = [];

  for (const r of replicates) {
    sumPop += r.endingPopulation;
    finalPops.push(r.endingPopulation);
    sumBirths += r.totalBirths;
    sumDeaths += r.totalDeaths;
    sumMaxGen += r.maxGenerationDepth;
    if (r.maxGenerationDepth > maxGen) maxGen = r.maxGenerationDepth;
    sumLineageCount += r.activeLineageCount;

    if (r.terminationReason === 'EXTINCTION') {
      extinctionCount++;
      if (r.extinctionTick !== null) extinctionTicks.push(r.extinctionTick);
    }

    // Get final timeseries row for variance stats
    const last = r.timeseries[r.timeseries.length - 1];
    if (last) {
      sumSizeVar += last.varSize;
      sumNeuralVar += last.neuralParamVariance;
      sumReproFraction += last.fractionEverReproduced;
    }
  }

  const outcomes = summarizeOutcomes(replicates.map((r) => r.outcome));

  return {
    experimentId,
    conditionId,
    replicateCount: n,
    extinctionCount,
    extinctionRate: extinctionCount / n,
    runawayCount: outcomes.runaway,
    viableCompletionCount: outcomes.viable,
    viableCompletionRate: outcomes.viableCompletionRate,
    medianExtinctionTick: extinctionTicks.length > 0 ? median(extinctionTicks) : null,
    meanFinalPopulation: sumPop / n,
    medianFinalPopulation: median(finalPops),
    totalBirths: sumBirths,
    totalDeaths: sumDeaths,
    maxGenerationDepth: maxGen,
    meanMaxGenerationDepth: sumMaxGen / n,
    meanActiveLineageCount: sumLineageCount / n,
    meanMorphSizeVariance: sumSizeVar / n,
    meanNeuralParamVariance: sumNeuralVar / n,
    meanReproductiveFraction: sumReproFraction / n,
  };
}
