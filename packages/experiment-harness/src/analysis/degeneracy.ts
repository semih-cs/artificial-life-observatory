/**
 * Degeneracy detection — diagnostic flags for clearly degenerate regimes.
 *
 * These are engineering diagnostics, not biological laws. All thresholds
 * are configurable. Flags are observational labels — they never alter
 * the simulation.
 */

import type { ConditionSummary, ExperimentResult, ReplicateResult } from '../types.js';

export interface DegeneracyCriteria {
  /** Extinction rate above which the regime is "near-universal extinction". */
  maxExtinctionRate: number;
  /** Minimum births per replicate on average to avoid "almost no reproduction". */
  minMeanBirths: number;
  /** Maximum mean final population — above this signals runaway growth. */
  maxMeanFinalPopulation: number;
  /** Minimum generation depth on average for multi-generation viability. */
  minMeanMaxGenerationDepth: number;
}

export const DEFAULT_DEGENERACY_CRITERIA: DegeneracyCriteria = {
  maxExtinctionRate: 0.9,
  minMeanBirths: 1,
  maxMeanFinalPopulation: 500,
  minMeanMaxGenerationDepth: 1,
};

export interface DegeneracyFlags {
  nearUniversalExtinction: boolean;
  almostNoReproduction: boolean;
  runawayPopulation: boolean;
  noMultipleGenerations: boolean;
  isDegenerate: boolean;
}

export function detectDegeneracy(
  summary: ConditionSummary,
  criteria: DegeneracyCriteria = DEFAULT_DEGENERACY_CRITERIA
): DegeneracyFlags {
  const nearUniversalExtinction = summary.extinctionRate > criteria.maxExtinctionRate;
  const almostNoReproduction = (summary.totalBirths / Math.max(1, summary.replicateCount)) < criteria.minMeanBirths;
  const runawayPopulation = summary.meanFinalPopulation > criteria.maxMeanFinalPopulation;
  const noMultipleGenerations = summary.meanMaxGenerationDepth < criteria.minMeanMaxGenerationDepth;

  return {
    nearUniversalExtinction,
    almostNoReproduction,
    runawayPopulation,
    noMultipleGenerations,
    isDegenerate: nearUniversalExtinction || almostNoReproduction || runawayPopulation,
  };
}

/**
 * Pre-committed calibration criteria for what qualifies a configuration
 * as worth further investigation.
 *
 * A configuration passes if:
 * - not near-universal immediate extinction (extinction rate ≤ 0.9)
 * - not zero reproduction (mean births ≥ 1)
 * - not runaway growth (mean final pop ≤ 500)
 * - multiple generations reachable (mean max gen depth ≥ 1)
 *
 * Oscillations and bottlenecks are legitimate. Constant population is
 * NOT required.
 */
export interface CalibrationCriteria {
  maxExtinctionRate: number;
  minMeanBirths: number;
  maxMeanFinalPopulation: number;
  minMeanMaxGenerationDepth: number;
  /** Maximum acceptable median extinction tick (too-early death). 0 = no constraint. */
  minMedianExtinctionTick: number;
}

export const DEFAULT_CALIBRATION_CRITERIA: CalibrationCriteria = {
  maxExtinctionRate: 0.8,
  minMeanBirths: 3,
  maxMeanFinalPopulation: 500,
  minMeanMaxGenerationDepth: 1,
  minMedianExtinctionTick: 1000,
};

export function passesCalibrationCriteria(
  summary: ConditionSummary,
  criteria: CalibrationCriteria = DEFAULT_CALIBRATION_CRITERIA
): boolean {
  if (summary.extinctionRate > criteria.maxExtinctionRate) return false;
  const meanBirths = summary.totalBirths / Math.max(1, summary.replicateCount);
  if (meanBirths < criteria.minMeanBirths) return false;
  if (summary.meanFinalPopulation > criteria.maxMeanFinalPopulation) return false;
  if (summary.meanMaxGenerationDepth < criteria.minMeanMaxGenerationDepth) return false;
  if (criteria.minMedianExtinctionTick > 0 && summary.medianExtinctionTick !== null) {
    if (summary.medianExtinctionTick < criteria.minMedianExtinctionTick) return false;
  }
  return true;
}
