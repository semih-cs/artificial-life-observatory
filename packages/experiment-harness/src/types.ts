/**
 * Experiment and replicate types for Phase 0B.
 */

import type { RunOutcome } from './analysis/outcome.js';

/**
 * How a replicate ended. `SAFETY_CEILING` is a diagnostic-only EXECUTION SAFETY
 * LIMIT (pilot report §15.5): it bounds runtime and memory when the §14.29 cap is
 * deliberately not used as an early stop. It is not a biological threshold and
 * does not redefine runaway.
 */
export type TerminationReason = 'MAX_TICKS' | 'EXTINCTION' | 'RUNAWAY_POPULATION' | 'SAFETY_CEILING' | 'ERROR';

export interface ExperimentCondition {
  conditionId: string;
  /** Config overrides applied on top of the base config for this condition. */
  configOverrides: (config: import('@alo/simulation-core').SimulationConfig) => void;
  /**
   * OPTIONAL test-only world construction step, applied exactly once between
   * `bootstrapWorld` and tick 1 (§16.9). It must return a NEW WorldState and
   * must not consume RNG. Used only to install deterministic diagnostic
   * movement policies; ordinary experiments leave it undefined.
   */
  worldTransform?: (
    world: import('@alo/simulation-core').WorldState,
    config: import('@alo/simulation-core').SimulationConfig
  ) => import('@alo/simulation-core').WorldState;
}

export interface ExperimentSpec {
  experimentId: string;
  description: string;
  /** Base configuration. Conditions apply overrides on top of this. */
  baseConfigFactory: () => import('@alo/simulation-core').SimulationConfig;
  conditions: ExperimentCondition[];
  seeds: number[];
  maxTicks: number;
  /** Sample metrics every N ticks (default 100). */
  metricsSampleInterval?: number;
  stopOnExtinction?: boolean;
  /**
   * Enforce the §14.29 test-only runaway cap, min(8 x initialPopulation, 200).
   * Defaults to true. This is an experimental-execution guard only; the
   * biological model never suppresses births because of it.
   */
  runawayCapEnabled?: boolean;
  /**
   * OPTIONAL diagnostic-only execution safety limit (pilot report §15.5). When
   * set, a run stops with `SAFETY_CEILING` once the population reaches it. Must
   * exceed the §14.29 cap. Not a biological threshold; ordinary experiments
   * leave it undefined.
   */
  safetyPopulationCeiling?: number;
}

export interface ReplicateProvenance {
  experimentId: string;
  conditionId: string;
  replicateId: string;
  seed: number;
  simulationVersion: string;
  experimentHarnessVersion: string;
  configHash: string;
  maxTicks: number;
  gitCommit: string | null;
  /** Whether the worktree had uncommitted changes at run time; null if unknown. */
  gitDirty: boolean | null;
  /**
   * Deterministic hash of the built JavaScript that produced this result.
   * Distinguishes runs from different source states at the same commit.
   */
  sourceIdentity: string;
  timestamp: string;
}

export interface ReplicateResult {
  provenance: ReplicateProvenance;
  startTick: number;
  endTick: number;
  terminationReason: TerminationReason;
  extinctionTick: number | null;
  finalStateHash: string;
  startingPopulation: number;
  endingPopulation: number;
  totalBirths: number;
  totalDeaths: number;
  endingFoodCount: number;
  /** Highest population observed at any sampled point of the run. */
  peakPopulation: number;
  /** §14.29 cap in force for this run. */
  runawayCap: number;
  /** §16.34–§16.35 outcome category derived from termination + peak population. */
  outcome: RunOutcome;
  maxGenerationDepth: number;
  activeLineageCount: number;
  timeseries: TimeseriesRow[];
  wallClockMs: number;
  error?: string;
}

export interface TimeseriesRow {
  tick: number;
  population: number;
  foodCount: number;
  birthsCumulative: number;
  deathsCumulative: number;
  meanEnergy: number;
  medianEnergy: number;
  minEnergy: number;
  maxEnergy: number;
  meanAge: number;
  maxGenerationDepth: number;
  activeLineageCount: number;
  // Morphology summary
  meanSize: number;
  varSize: number;
  meanMaxSpeed: number;
  varMaxSpeed: number;
  meanVisionRange: number;
  varVisionRange: number;
  meanVisionAngle: number;
  varVisionAngle: number;
  meanMetabolism: number;
  varMetabolism: number;
  // Neural summary
  neuralMeanParamValue: number;
  neuralParamVariance: number;
  // Reproduction
  fractionEverReproduced: number;
}

export interface ConditionSummary {
  experimentId: string;
  conditionId: string;
  replicateCount: number;
  extinctionCount: number;
  extinctionRate: number;
  /** Replicates classified RUNAWAY_POPULATION (§14.29). */
  runawayCount: number;
  /** Replicates that reached the horizon without extinction or runaway. */
  viableCompletionCount: number;
  /** §16.35 viable completion rate. */
  viableCompletionRate: number;
  medianExtinctionTick: number | null;
  meanFinalPopulation: number;
  medianFinalPopulation: number;
  totalBirths: number;
  totalDeaths: number;
  maxGenerationDepth: number;
  meanMaxGenerationDepth: number;
  meanActiveLineageCount: number;
  meanMorphSizeVariance: number;
  meanNeuralParamVariance: number;
  meanReproductiveFraction: number;
}

export interface ExperimentResult {
  experimentId: string;
  conditions: ConditionSummary[];
  replicates: ReplicateResult[];
}

export const EXPERIMENT_HARNESS_VERSION = '0B.1.0';

/**
 * Deterministic regression reference for the AMENDED multi-founder model
 * (simulationVersion 0A.2.0): seed 20260910, 10,000 ticks.
 *
 * The historical single-founder model's reference is
 * `SINGLE_FOUNDER_GOLDEN_HASH` in simulation-core. The two models produce
 * different trajectories by design; neither hash is a regression target for the
 * other, and results from the two models must never be pooled.
 */
export const MULTI_FOUNDER_GOLDEN_HASH = 'b95a0b4ef7dd8449';
