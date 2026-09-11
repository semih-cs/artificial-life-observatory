/**
 * Phase 0B experiment harness CLI.
 *
 * Usage:
 *   npm run experiment -- <experiment-name> [options]
 *
 * Experiments:
 *   starvation              Diagnostic A — starvation
 *   feeding                 Diagnostic B — feeding
 *   reproduction-control    Diagnostic C — reproduction without mutation
 *   full-evolutionary       Diagnostic D — full evolutionary loop
 *   movement-policy         Diagnostic A2 — test-only fixed movement policies (§16.9)
 *   mutation-2x2            Primary 2×2 mutation factorial
 *   calibration-sweep       calibration-v1: first (energy/resource) sweep
 *   calibration-v2          calibration-v2: standing food density x reproductive window
 *   calibration-v3          calibration-v3: reproduction gate x cohort turnover (FINAL sweep)
 *   calibration-report      Re-read persisted sweep results from disk (runs nothing)
 *   food-limitation         diagnostic-food-limitation-v1 (pilot report §15): does the 200 cap
 *                           mask food limitation? Fixed seeds, observational only.
 *   baseline-continuation   continuation-multifounder-default-v1 (pilot report §18): continue the six
 *                           cap-stopped 0A.2.0 default-baseline seeds. Descriptive; gate already FAIL.
 *   early-establishment     Read-only §19 analysis of ticks 0–3000 of the 15 0A.2.0 default worlds.
 *   stalled-cohort          Read-only §20 comparison of stalled worlds that recover vs die (ticks 4000–9000).
 *   reproduction-participation  Read-only §21: lifetime participation vs births per reproducer, stalled cohort.
 *   reproducer-lifecycle    diagnostic-reproducer-lifecycle-v1 (pilot report §22): observational per-organism
 *                           life-history rerun of the seven stalled-cohort worlds.
 *   reclassify-trajectory   Reclassify PERSISTED 20,000-tick runs under trajectory-outcome-v2
 *                           (pilot report §16). Read-only: runs nothing, consumes no seeds.
 *   multifounder-default-baseline
 *                           One default-baseline pilot of model 0A.2.0 at the unchanged
 *                           Phase 0A defaults (pilot report §14). Not a sweep.
 *
 * Options:
 *   --seed-set <pilot|validation>   Seed set to use (default: pilot)
 *   --max-ticks <N>                 Maximum ticks per replicate
 *   --output <dir>                  Output directory (default: results/<experiment-id>)
 *   --sweep-configs <a-b|a,b,c>     Run only these sweep configuration indices (chunked execution)
 *   --no-runaway-cap                Disable the §14.29 runaway cap. Use ONLY to reproduce
 *                                   a historical run that predates the cap — new science
 *                                   should always run with the cap enforced.
 */

import {
  starvationDiagnostic,
  feedingDiagnostic,
  reproductionControlDiagnostic,
  fullEvolutionaryDiagnostic,
  mutation2x2Experiment,
  movementPolicyDiagnostic,
  multiFounderDefaultBaseline,
  MULTI_FOUNDER_DEFAULT_BASELINE_ID,
} from '../experiments/definitions.js';
import { founderFunctionalDiversity } from '../analysis/founderDiversity.js';
import {
  foodLimitationDiagnostic, FOOD_LIMITATION_DIAGNOSTIC_ID, FOOD_LIMITATION_DECISION_SEEDS,
  FOOD_LIMITATION_REFERENCE_SEED, FOOD_LIMITATION_INTEGRITY, FOOD_LIMITATION_MILESTONES,
  FOOD_SCARCITY_WINDOW, FOOD_SCARCITY_THRESHOLD, FOOD_LIMITATION_NEAR_CAP_LEVEL,
  FOOD_LIMITATION_SAFETY_CEILING, FOOD_LIMITATION_HORIZON,
} from '../experiments/foodLimitation.js';
import {
  createFoodFluxRecorder, FoodFluxRecorder, scarcityOnsetTick, firstTickAtLeast,
  milestoneRecords, classifyDecisionSeed, majorityOutcome, SeedClass,
} from '../analysis/foodLimitation.js';
import {
  listPersistedExperimentDirectories, readPersistedRuns, reclassifyRun, summarizeCohort, countClasses,
  cohortProfile, ReclassifiedRun, CohortSummary,
} from '../analysis/reclassify.js';
import {
  baselineContinuation, BASELINE_CONTINUATION_ID, BASELINE_CONTINUATION_CHECKPOINTS,
} from '../experiments/baselineContinuation.js';
import {
  earlyRecord, groupStat, bestSingleCut, separation, EARLY_TICKS, EARLY_DOUBLING_LEVEL, EarlySample,
} from '../analysis/earlyEstablishment.js';
import {
  STALLED_CHECKPOINTS, STALLED_GROUP_E, STALLED_GROUP_E_EXCLUDED, STALLED_GROUP_L, stalledStrength, persistsFrom,
} from '../analysis/stalledCohort.js';
import {
  PARTICIPATION_CHECKPOINTS, deriveReproduction, metricDiffers, mechanismCall,
} from '../analysis/reproductionParticipation.js';
import {
  createLifecycleRecorder, summarizeWorld, lifecycleDecision, strengthOf, LifecycleRecorder, LIFECYCLE_BIRTH_WINDOW,
} from '../analysis/lifecycle.js';
import {
  reproducerLifecycleDiagnostic, REPRODUCER_LIFECYCLE_ID, LIFECYCLE_EXTINCT_SEEDS, LIFECYCLE_LATE_SEEDS,
  LIFECYCLE_ROW_CHECK_TICKS, LIFECYCLE_HASH_CHECKPOINTS,
} from '../experiments/reproducerLifecycle.js';
import {
  TRAJECTORY_CLASSIFIER_VERSION, TRAJECTORY_HORIZON, TRAJECTORY_WINDOW_START, TRAJECTORY_HALF_BOUNDARY,
  TRAJECTORY_MIN_SAMPLES_PER_HALF, TRAJECTORY_GROWTH_THRESHOLD, TRAJECTORY_SHRINK_THRESHOLD,
  TRAJECTORY_HIGH_BOUNDED_LEVEL, TRAJECTORY_SAFETY_CEILING, PEAK_CAP_CLASSIFIER_VERSION, classifyTrajectory,
} from '../analysis/trajectoryOutcome.js';
import { MOVEMENT_POLICY_LEVELS, MovementPolicyId } from '../experiments/movementPolicies.js';
import {
  predictDrain, impliedForwardFraction, measuredDrainPerTick, largestCleanWindow,
} from '../analysis/energyModel.js';
import { median as medianOf } from '../metrics/compute.js';
import { runExperiment } from '../runner/experiment.js';
import { DEFAULT_SIMULATION_CONFIG, cloneConfig, canonicalStateHash } from '@alo/simulation-core';
import { runSweep, SweepSpec } from '../runner/sweep.js';
import { loadPilotSeeds, loadValidationSeeds } from '../runner/seeds.js';
import { writeExperimentResults, writeSweepSummaryFromDisk } from '../output/writer.js';
import { detectDegeneracy, passesCalibrationCriteria, DEFAULT_CALIBRATION_CRITERIA } from '../analysis/degeneracy.js';
import { readPersistedSweep } from '../analysis/persistedResults.js';
import { runProvenance } from '../runner/provenance.js';
import { BASELINE_MIN_VIABLE_COMPLETION_RATE } from '../analysis/outcome.js';
import type { ExperimentSpec, ExperimentResult, ReplicateResult } from '../types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const gitCommit = runProvenance().gitCommit;

/** One line so the operator can see what is about to run, before it runs. */
function printProvenance(): void {
  const p = runProvenance();
  const dirty = p.gitDirty === null ? 'unknown' : p.gitDirty ? 'DIRTY' : 'clean';
  console.log(`Provenance: commit ${p.gitCommit ?? 'unknown'} (${dirty}), source identity ${p.sourceIdentity}`);
  if (p.gitDirty) {
    console.log('  WARNING: worktree has uncommitted changes — these results are not attributable to a commit alone.');
  }
}

function parseArgs(): {
  experiment: string; seedSet: string; maxTicks?: number; outputDir?: string;
  runawayCapEnabled: boolean; sweepConfigs?: number[];
} {
  const args = process.argv.slice(2);
  let experiment = '';
  let seedSet = 'pilot';
  let maxTicks: number | undefined;
  let outputDir: string | undefined;
  let runawayCapEnabled = true;
  let sweepConfigs: number[] | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--seed-set' && args[i + 1]) {
      seedSet = args[++i]!;
    } else if (arg === '--max-ticks' && args[i + 1]) {
      maxTicks = parseInt(args[++i]!, 10);
    } else if (arg === '--output' && args[i + 1]) {
      outputDir = args[++i]!;
    } else if (arg === '--sweep-configs' && args[i + 1]) {
      sweepConfigs = parseIndexList(args[++i]!);
    } else if (arg === '--no-runaway-cap') {
      runawayCapEnabled = false;
    } else if (!arg.startsWith('--')) {
      experiment = arg;
    }
  }

  return { experiment, seedSet, maxTicks, outputDir, runawayCapEnabled, sweepConfigs };
}

/** Parse "0-3" or "4,5,6" (or a mix) into an explicit index list. */
function parseIndexList(spec: string): number[] {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const range = part.split('-');
    if (range.length === 2) {
      const from = parseInt(range[0]!, 10);
      const to = parseInt(range[1]!, 10);
      for (let i = from; i <= to; i++) out.add(i);
    } else {
      out.add(parseInt(part, 10));
    }
  }
  return [...out].sort((a, b) => a - b);
}

function loadSeeds(seedSet: string): number[] {
  if (seedSet === 'validation') return loadValidationSeeds();
  return loadPilotSeeds();
}

function printProgress(result: ReplicateResult, index: number, total: number): void {
  const status = result.terminationReason === 'EXTINCTION'
    ? `extinct@${result.extinctionTick}`
    : result.terminationReason === 'RUNAWAY_POPULATION'
      ? `runaway@${result.endTick}(pop=${result.endingPopulation})`
      : result.terminationReason === 'SAFETY_CEILING'
        ? `safety-ceiling@${result.endTick}(pop=${result.endingPopulation})`
        : `pop=${result.endingPopulation}`;
  const rate = (result.endTick / (result.wallClockMs / 1000)).toFixed(0);
  process.stdout.write(
    `  [${index}/${total}] ${result.provenance.conditionId} seed=${result.provenance.seed} ` +
    `${status} births=${result.totalBirths} gen=${result.maxGenerationDepth} ` +
    `${result.wallClockMs}ms (${rate} ticks/s)\n`
  );
}

function printConditionSummary(result: ExperimentResult): void {
  console.log(`\n=== ${result.experimentId} ===\n`);
  console.log('Condition | Replicates | Extinction | Runaway | Viable | Median Ext Tick | Mean Final Pop | Max Gen | Mean Births | Degeneracy');
  console.log('----------|------------|------------|---------|--------|-----------------|----------------|---------|-------------|----------');
  for (const c of result.conditions) {
    const meanBirths = (c.totalBirths / Math.max(1, c.replicateCount)).toFixed(1);
    const deg = detectDegeneracy(c);
    const degStr = deg.isDegenerate
      ? [deg.nearUniversalExtinction && 'EXTINCT', deg.almostNoReproduction && 'NO_REPRO', deg.runawayPopulation && 'RUNAWAY'].filter(Boolean).join('+')
      : 'OK';
    console.log(
      `${c.conditionId.padEnd(10)}| ${String(c.replicateCount).padEnd(11)}| ${(c.extinctionRate * 100).toFixed(0).padStart(9)}% | ` +
      `${String(c.runawayCount).padStart(7)} | ${(c.viableCompletionRate * 100).toFixed(0).padStart(5)}% | ` +
      `${String(c.medianExtinctionTick ?? '-').padStart(15)} | ${c.meanFinalPopulation.toFixed(1).padStart(14)} | ` +
      `${String(c.maxGenerationDepth).padStart(7)} | ${meanBirths.padStart(11)} | ${degStr}`
    );
  }
}

/**
 * Re-read an already-persisted sweep and classify every replicate against the
 * §14.29 runaway cap and the §16.35 viable-completion gate. Runs no
 * simulation and consumes no seeds.
 */
function printCalibrationReport(sweepDir: string): void {
  if (!fs.existsSync(sweepDir)) {
    console.error(`No persisted sweep at ${sweepDir}`);
    process.exit(1);
  }
  const conditions = readPersistedSweep(sweepDir);
  console.log(`\nPersisted sweep: ${sweepDir}`);
  console.log(`Runaway cap (§14.29): ${conditions[0]?.runawayCap ?? '-'}`);
  console.log(`Viable-completion gate (§16.35 [BASELINE]): ${(BASELINE_MIN_VIABLE_COMPLETION_RATE * 100).toFixed(0)}%`);
  console.log(`Precommitted calibration criteria: ${JSON.stringify(DEFAULT_CALIBRATION_CRITERIA)}\n`);
  console.log('Configuration | n | Extinct | Runaway | Viable | Viable rate | Gate');
  console.log('--------------|---|---------|---------|--------|-------------|-----');
  let anyGatePass = false;
  for (const c of conditions) {
    const o = c.outcomes;
    const gate = o.viableCompletionRate >= BASELINE_MIN_VIABLE_COMPLETION_RATE;
    if (gate) anyGatePass = true;
    console.log(
      `${c.conditionId.padEnd(13)} | ${String(o.total).padStart(1)} | ` +
      `${String(o.extinct).padStart(7)} | ${String(o.runaway).padStart(7)} | ${String(o.viable).padStart(6)} | ` +
      `${(o.viableCompletionRate * 100).toFixed(1).padStart(10)}% | ${gate ? 'PASS' : 'FAIL'}`
    );
  }
  console.log(
    anyGatePass
      ? '\nAt least one configuration meets the §16.35 viable-completion gate.'
      : '\nNo configuration meets the §16.35 viable-completion gate on this pilot evidence.'
  );
}

/**
 * §16.9 / §16.10 energy report: for every condition, compare the measured
 * per-tick energy drain against the drain the specified energy model predicts
 * for that condition's morphology and speed, and report observed lifetimes
 * against predicted lifetimes.
 *
 * Precommitted measurement rule: drain is read over the largest death-free
 * sampled window no longer than 200 ticks, so the mean is always taken over an
 * unchanging set of organisms. The window actually used is reported per
 * condition.
 */
const DRAIN_WINDOW_MAX_TICKS = 200;

function printMovementPolicyReport(result: ExperimentResult): void {
  const energy = DEFAULT_SIMULATION_CONFIG.energy;

  console.log('\n=== §16.9 movement-policy energy report ===\n');
  console.log(
    'Condition        | Window | Measured drain | Predicted drain | Meas/Pred | ' +
    'Median lifetime | Predicted lifetime | Obs/Pred | Implied speed'
  );
  console.log(
    '-----------------|--------|----------------|-----------------|-----------|' +
    '-----------------|--------------------|----------|--------------'
  );

  for (const condition of result.conditions) {
    const replicates = result.replicates.filter(r => r.provenance.conditionId === condition.conditionId);
    if (replicates.length === 0) continue;

    const windows: number[] = [];
    const drains: number[] = [];
    const predictedDrains: number[] = [];
    const predictedLifetimes: number[] = [];
    const impliedFractions: number[] = [];
    const lifetimes: number[] = [];

    const level = MOVEMENT_POLICY_LEVELS[condition.conditionId as MovementPolicyId];

    for (const r of replicates) {
      const window = largestCleanWindow(r.timeseries, DRAIN_WINDOW_MAX_TICKS);
      const drain = window > 0 ? measuredDrainPerTick(r.timeseries, window) : null;
      const initial = r.timeseries.find(row => row.tick === 0);
      if (drain === null || !initial) continue;

      const morphology = {
        size: initial.meanSize,
        maxSpeed: initial.meanMaxSpeed,
        metabolism: initial.meanMetabolism,
      };

      windows.push(window);
      drains.push(drain);

      if (level !== undefined) {
        const prediction = predictDrain(morphology, level, energy);
        predictedDrains.push(prediction.drainPerTick);
        predictedLifetimes.push(prediction.predictedLifetime);
      }

      const implied = impliedForwardFraction(drain, morphology, energy);
      if (implied !== null) impliedFractions.push(implied);
      if (r.extinctionTick !== null) lifetimes.push(r.extinctionTick);
    }

    const measuredDrain = medianOf(drains);
    const predictedDrain = predictedDrains.length > 0 ? medianOf(predictedDrains) : null;
    const medianLifetime = lifetimes.length > 0 ? medianOf(lifetimes) : null;
    const predictedLifetime = predictedLifetimes.length > 0 ? medianOf(predictedLifetimes) : null;
    const impliedSpeed = impliedFractions.length > 0 ? medianOf(impliedFractions) : null;

    const ratio = predictedDrain && predictedDrain > 0 ? (measuredDrain / predictedDrain) : null;
    const lifeRatio = medianLifetime !== null && predictedLifetime
      ? medianLifetime / predictedLifetime
      : null;

    console.log(
      condition.conditionId.padEnd(17) + '| ' +
      String(medianOf(windows)).padStart(6) + ' | ' +
      measuredDrain.toFixed(8).padStart(14) + ' | ' +
      (predictedDrain === null ? '-'.padStart(15) : predictedDrain.toFixed(8).padStart(15)) + ' | ' +
      (ratio === null ? '-'.padStart(9) : ratio.toFixed(4).padStart(9)) + ' | ' +
      (medianLifetime === null ? '-'.padStart(15) : medianLifetime.toFixed(1).padStart(15)) + ' | ' +
      (predictedLifetime === null ? '-'.padStart(18) : predictedLifetime.toFixed(1).padStart(18)) + ' | ' +
      (lifeRatio === null ? '-'.padStart(8) : lifeRatio.toFixed(4).padStart(8)) + ' | ' +
      (impliedSpeed === null ? '-'.padStart(13) : (impliedSpeed * 100).toFixed(1).padStart(11) + ' %')
    );
  }

  console.log(
    '\nMeasured drain: median across replicates of (meanEnergy@0 - meanEnergy@window) / window.\n' +
    'Predicted drain: metabolism*baseMetabolicConstant + movementCoefficient*size*(fraction*maxSpeed)^2,\n' +
    'using each replicate\'s own tick-0 mean morphology.\n' +
    'Implied speed inverts that model on the measured drain; for the reference cell it is a\n' +
    'root-mean-square summary of energy expenditure, not a claim about any individual organism.'
  );
}

async function main(): Promise<void> {
  const { experiment, seedSet, maxTicks, outputDir, runawayCapEnabled, sweepConfigs } = parseArgs();

  if (!experiment) {
    console.log('Usage: npm run experiment -- <experiment-name> [--seed-set pilot|validation] [--max-ticks N]');
    console.log('\nExperiments: starvation, feeding, reproduction-control, full-evolutionary, movement-policy, mutation-2x2, calibration-sweep, calibration-v2, calibration-v3, calibration-report, multifounder-default-baseline');
    process.exit(1);
  }

  // Reading persisted results consumes no seeds and runs nothing.
  if (experiment === 'calibration-report') {
    printCalibrationReport(outputDir ?? 'results/calibration-v1');
    return;
  }
  if (experiment === 'reproduction-participation') {
    printProvenance();
    runReproductionParticipation('results', outputDir ?? 'results/analysis-reproduction-participation-v1');
    return;
  }
  if (experiment === 'stalled-cohort') {
    printProvenance();
    runStalledCohort('results', outputDir ?? 'results/analysis-stalled-cohort-v1');
    return;
  }
  if (experiment === 'early-establishment') {
    printProvenance();
    runEarlyEstablishment('results', outputDir ?? 'results/analysis-early-establishment-v1');
    return;
  }
  if (experiment === 'reclassify-trajectory') {
    printProvenance();
    runTrajectoryReclassification('results', outputDir ?? `results/reclassification-${TRAJECTORY_CLASSIFIER_VERSION}`);
    return;
  }

  printProvenance();

  if (experiment === 'reproducer-lifecycle') {
    runReproducerLifecycle(outputDir ?? `results/${REPRODUCER_LIFECYCLE_ID}`);
    return;
  }

  if (experiment === 'baseline-continuation') {
    runBaselineContinuation(outputDir ?? `results/${BASELINE_CONTINUATION_ID}`);
    return;
  }

  // Fixed-seed precommitted diagnostic; ignores --seed-set and --max-ticks.
  if (experiment === 'food-limitation') {
    runFoodLimitation(outputDir ?? `results/${FOOD_LIMITATION_DIAGNOSTIC_ID}`);
    return;
  }

  const seeds = loadSeeds(seedSet);
  console.log(`Seed set: ${seedSet} (${seeds.length} seeds)`);

  let spec: ExperimentSpec | null = null;
  let isSweep = false;
  let sweepId = 'calibration-v1';

  switch (experiment) {
    case 'starvation':
      spec = starvationDiagnostic(seeds, maxTicks ?? 5000);
      break;
    case 'feeding':
      spec = feedingDiagnostic(seeds, maxTicks ?? 10000);
      break;
    case 'reproduction-control':
      spec = reproductionControlDiagnostic(seeds, maxTicks ?? 10000);
      break;
    case 'full-evolutionary':
      spec = fullEvolutionaryDiagnostic(seeds, maxTicks ?? 10000);
      break;
    case 'mutation-2x2':
      spec = mutation2x2Experiment(seeds, maxTicks ?? 10000);
      break;
    case 'movement-policy':
      spec = movementPolicyDiagnostic(seeds, maxTicks ?? 20000);
      break;
    case MULTI_FOUNDER_DEFAULT_BASELINE_ID:
      spec = multiFounderDefaultBaseline(seeds, maxTicks ?? 20000);
      break;
    case 'calibration-sweep':
      isSweep = true;
      break;
    case 'calibration-v2':
      isSweep = true;
      sweepId = 'calibration-v2';
      break;
    case 'calibration-v3':
      isSweep = true;
      sweepId = 'calibration-v3';
      break;
    default:
      console.error(`Unknown experiment: ${experiment}`);
      process.exit(1);
  }

  if (isSweep) {
    console.log(`\nRunning ${sweepId}... (§14.29 runaway cap: ${runawayCapEnabled ? 'ENFORCED' : 'DISABLED (historical reproduction)'})`);

    /**
     * Sweep definitions. Each was precommitted in
     * docs/Phase 0B Pilot Report.md BEFORE it was implemented or run — axes,
     * seeds, horizon, primary readout and decision rule fixed in advance.
     *
     * In every sweep the PRIMARY READOUT is viableCompletionRate. Mean final
     * population and the other summary metrics are descriptive context and are
     * never selectors.
     */
    const sweepDefinitions: Record<string, SweepSpec> = {
      // Stage 1 (§6): energy and resource coefficients.
      'calibration-v1': {
        sweepId: 'calibration-v1',
        description: 'Stage 1 energy/resource coarse sweep',
        parameters: [
          { path: 'food.regenAttemptsPerTick', values: [2, 4, 6] },
          { path: 'energy.foodEnergyValue', values: [25, 40] },
          { path: 'energy.reproductionCost', values: [35, 45] },
        ],
        seeds: seeds.slice(0, 8), // coarse sweep, subset of pilot seeds
        maxTicks: maxTicks ?? 10000,
        metricsSampleInterval: 200,
        runawayCapEnabled,
      },

      // Stage 2 (§6.2): standing food density x reproductive window.
      // lifecycle.maxAge held at 3000 so cohort turnover is fixed while the
      // rates change; every energy parameter at the value §7 verified.
      'calibration-v2': {
        sweepId: 'calibration-v2',
        description: 'Stage 2 sweep: standing food density x reproductive window',
        parameters: [
          { path: 'food.worldFoodCapacity', values: [60, 120, 240] },
          { path: 'lifecycle.maturityAge', values: [300, 500] },
        ],
        seeds, // all 15 pilot seeds
        maxTicks: maxTicks ?? 20000,
        metricsSampleInterval: 200,
        runawayCapEnabled,
      },

      // Stage 3 (§11): the reproduction gate x cohort turnover.
      // FINAL parameter sweep of this Phase 0B calibration cycle (§11.4).
      // reproductionEnergyThreshold was 75 in all 18 configurations of v1 and
      // v2; it is the direct control on growth rate and does not touch the
      // energy model. At 90 it stays below energyCapacity (100), so
      // reproduction remains reachable.
      'calibration-v3': {
        sweepId: 'calibration-v3',
        description: 'Stage 3 sweep: reproduction gate x cohort turnover (final sweep of the cycle)',
        parameters: [
          { path: 'energy.reproductionEnergyThreshold', values: [75, 90] },
          { path: 'lifecycle.maxAge', values: [3000, 6000] },
        ],
        seeds, // all 15 pilot seeds
        maxTicks: maxTicks ?? 20000,
        metricsSampleInterval: 200,
        runawayCapEnabled,
      },
    };

    const sweepSpec = sweepDefinitions[sweepId];
    if (!sweepSpec) {
      console.error(`Unknown sweep: ${sweepId}`);
      process.exit(1);
      return;
    }

    if (sweepConfigs) {
      console.log(`Chunked execution: running only configuration indices ${sweepConfigs.join(', ')}`);
    }

    const sweepResult = runSweep(
      sweepSpec,
      { gitCommit, onReplicateComplete: printProgress },
      sweepConfigs ? (config) => sweepConfigs.includes(Number(config.configId.split('_')[1])) : undefined
    );

    const outDir = outputDir ?? `results/${sweepSpec.sweepId}`;
    fs.mkdirSync(outDir, { recursive: true });

    console.log(`\n=== Calibration Sweep: ${sweepResult.configurations.length} configurations ===\n`);
    console.log('Config | Params | Ext Rate | Runaway | Viable | Mean Final Pop | Max Gen | Passes Criteria');
    console.log('-------|--------|----------|---------|--------|----------------|---------|----------------');

    for (let i = 0; i < sweepResult.results.length; i++) {
      const r = sweepResult.results[i]!;
      const cfg = sweepResult.configurations[i]!;
      const summary = r.conditions[0]!;
      const passes = passesCalibrationCriteria(summary);
      const params = Object.entries(cfg.parameterValues).map(([k, v]) => `${k.split('.').pop()}=${v}`).join(', ');
      console.log(
        `${String(i).padStart(6)} | ${params.padEnd(6)} | ` +
        `${(summary.extinctionRate * 100).toFixed(0).padStart(7)}% | ` +
        `${String(summary.runawayCount).padStart(7)} | ` +
        `${(summary.viableCompletionRate * 100).toFixed(0).padStart(5)}% | ` +
        `${summary.meanFinalPopulation.toFixed(1).padStart(14)} | ` +
        `${String(summary.maxGenerationDepth).padStart(7)} | ${passes ? 'YES' : 'NO'}`
      );

      writeExperimentResults(r, `${outDir}/${cfg.configId}`);
    }

    // Rebuild the summary from every configuration directory present on disk,
    // so a sweep executed in chunks still produces one complete summary.
    const summarized = writeSweepSummaryFromDisk(outDir, (s) => passesCalibrationCriteria(s));
    console.log(`\nsweep-summary.json written from ${summarized} configuration directories on disk.`);
    return;
  }

  if (!spec) return;

  spec.runawayCapEnabled = runawayCapEnabled;

  console.log(`\nRunning: ${spec.experimentId}`);
  console.log(`  conditions: ${spec.conditions.length}`);
  console.log(`  seeds: ${spec.seeds.length}`);
  console.log(`  max ticks: ${spec.maxTicks}`);
  console.log(`  total replicates: ${spec.conditions.length * spec.seeds.length}`);
  console.log(`  §14.29 runaway cap: ${runawayCapEnabled ? 'ENFORCED' : 'DISABLED (historical reproduction)'}\n`);

  const result = runExperiment(spec, {
    gitCommit,
    onReplicateComplete: printProgress,
  });

  printConditionSummary(result);
  if (result.experimentId === 'diagnostic-movement-policy') printMovementPolicyReport(result);

  const outDir = outputDir ?? `results/${result.experimentId}`;
  writeExperimentResults(result, outDir);
  if (result.experimentId === MULTI_FOUNDER_DEFAULT_BASELINE_ID) writeFounderDiversity(spec, outDir);
  console.log(`\nResults written to: ${outDir}/`);
}

/**
 * Pilot report §14.6 — OBSERVATIONAL ONLY. Pairwise functional distance between
 * each initial world's founder controllers, reconstructed by replaying the
 * bootstrap founder draws on a fresh stream. Runs after the experiment, touches
 * no world, and is not an input to any decision.
 */
function writeFounderDiversity(spec: ExperimentSpec, outDir: string): void {
  const worlds = spec.seeds.map((seed) => {
    const config = cloneConfig(spec.baseConfigFactory());
    spec.conditions[0]!.configOverrides(config);
    config.rootSeed = seed;
    return founderFunctionalDiversity(config);
  });
  fs.writeFileSync(`${outDir}/founder-diversity.json`, JSON.stringify(worlds, null, 2));
  console.log('\nFounder functional diversity (observational; not fitness, not a selector):');
  console.log('seed    | founders | mean dist | min dist | max dist');
  for (const w of worlds) {
    const f = (x: number | null) => (x === null ? '-' : x.toFixed(4)).padStart(9);
    console.log(`${String(w.seed).padEnd(7)} | ${String(w.founderCount).padStart(8)} | ${f(w.meanDistance)} | ${f(w.minDistance)} | ${f(w.maxDistance)}`);
  }
}

/**
 * diagnostic-food-limitation-v1 (pilot report §15). Runs the four precommitted
 * pilot seeds, enforces the §15.9 integrity gate BEFORE any interpretation, and
 * only then classifies the three decision seeds. Writes no condition summary,
 * so no viable-completion figure is produced (§15.9).
 */
function runFoodLimitation(outDir: string): void {
  const spec = foodLimitationDiagnostic();
  const pilot = new Set(loadPilotSeeds());
  for (const seed of spec.seeds) {
    if (!pilot.has(seed)) throw new Error(`food-limitation seed ${seed} is not a pilot seed`);
  }
  const capacity = DEFAULT_SIMULATION_CONFIG.food.worldFoodCapacity;
  if (FOOD_SCARCITY_THRESHOLD !== capacity / 2) throw new Error('scarcity threshold must be half of worldFoodCapacity');

  console.log(`\nRunning: ${spec.experimentId}`);
  console.log(`  seeds: ${spec.seeds.join(', ')} (decision: ${FOOD_LIMITATION_DECISION_SEEDS.join(', ')}; reference: ${FOOD_LIMITATION_REFERENCE_SEED})`);
  console.log(`  max ticks: ${spec.maxTicks}; runaway cap as early stop: DISABLED; execution safety ceiling: ${spec.safetyPopulationCeiling}\n`);

  const recorders = new Map<number, FoodFluxRecorder>();
  const checkpointHash = new Map<number, string>();
  const result = runExperiment(spec, {
    gitCommit,
    onReplicateComplete: printProgress,
    tickObserverFor: (_conditionId, seed) => {
      const checkpoint = FOOD_LIMITATION_INTEGRITY[seed];
      const recorder = createFoodFluxRecorder(capacity, (_before, after) => {
        if (checkpoint && after.tick === checkpoint.tick) checkpointHash.set(seed, canonicalStateHash(after));
      });
      recorders.set(seed, recorder);
      return recorder.observer;
    },
  });

  writeExperimentResults(result, outDir, { conditionSummary: false });
  for (const [seed, recorder] of recorders) {
    const header = 'tick,population,foodCount,foodCapacityFraction,foodConsumed,foodRegenerated,births,deaths,meanEnergy';
    const lines = recorder.rows.map(r =>
      `${r.tick},${r.population},${r.foodCount},${r.foodCapacityFraction.toFixed(6)},${r.foodConsumed},${r.foodRegenerated},${r.births},${r.deaths},${r.meanEnergy}`);
    fs.writeFileSync(`${outDir}/flux-${seed}.csv`, [header, ...lines].join('\n') + '\n');
  }

  // ---- §15.9 integrity gate, checked first --------------------------------
  const baselinePath = 'results/multifounder-default-baseline/replicates.json';
  const baseline: Array<Record<string, unknown>> = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, 'utf-8')) : [];
  const integrity = spec.seeds.map((seed) => {
    const expected = FOOD_LIMITATION_INTEGRITY[seed]!;
    const observedHash = checkpointHash.get(seed) ?? null;
    const rows = recorders.get(seed)!.rows;
    const replicate = result.replicates.find(r => r.provenance.seed === seed)!;
    const base = baseline.find(b => b['seed'] === seed);
    const failures: string[] = [];
    if (observedHash !== expected.hash) failures.push(`hash at tick ${expected.tick}: ${observedHash} != ${expected.hash}`);
    if (!base) {
      failures.push(`baseline replicate for seed ${seed} not found at ${baselinePath}`);
    } else {
      const upTo = rows.slice(0, expected.tick);
      const checks: Array<[string, unknown, unknown]> = [
        ['population at stop tick', upTo[upTo.length - 1]?.population, base['endingPopulation']],
        ['cumulative births at stop tick', upTo.reduce((s, r) => s + r.births, 0), base['totalBirths']],
        ['cumulative deaths at stop tick', upTo.reduce((s, r) => s + r.deaths, 0), base['totalDeaths']],
        ['food at stop tick', upTo[upTo.length - 1]?.foodCount, base['endingFoodCount']],
      ];
      if (seed === FOOD_LIMITATION_REFERENCE_SEED) {
        // The reference run never reaches the cap, so it must reproduce the full baseline result.
        for (const field of ['terminationReason', 'endTick', 'extinctionTick', 'finalStateHash', 'endingPopulation',
          'totalBirths', 'totalDeaths', 'endingFoodCount', 'peakPopulation', 'outcome',
          'maxGenerationDepth', 'activeLineageCount'] as const) {
          checks.push([field, (replicate as unknown as Record<string, unknown>)[field], base[field]]);
        }
      }
      for (const [name, observed, wanted] of checks) {
        if (observed !== wanted) failures.push(`${name}: ${String(observed)} != ${String(wanted)}`);
      }
    }
    return { seed, checkTick: expected.tick, expectedHash: expected.hash, observedHash, pass: failures.length === 0, failures };
  });
  const valid = integrity.every(i => i.pass);

  console.log('\n§15.9 integrity gate:');
  for (const i of integrity) {
    console.log(`  seed ${i.seed} @ tick ${i.checkTick}: ${i.pass ? 'PASS' : 'FAIL'} (hash ${i.observedHash})${i.failures.length ? ' — ' + i.failures.join('; ') : ''}`);
  }

  const common = {
    diagnosticId: FOOD_LIMITATION_DIAGNOSTIC_ID,
    precommitmentCommit: '6b14031989bd03d7f735ad820605146dca094864',
    parameters: {
      decisionSeeds: [...FOOD_LIMITATION_DECISION_SEEDS], referenceSeed: FOOD_LIMITATION_REFERENCE_SEED,
      horizon: FOOD_LIMITATION_HORIZON, safetyCeiling: FOOD_LIMITATION_SAFETY_CEILING,
      milestones: [...FOOD_LIMITATION_MILESTONES], scarcityWindow: FOOD_SCARCITY_WINDOW,
      scarcityThreshold: FOOD_SCARCITY_THRESHOLD, nearCapLevel: FOOD_LIMITATION_NEAR_CAP_LEVEL,
      worldFoodCapacity: capacity,
    },
    integrity,
  };

  if (!valid) {
    fs.writeFileSync(`${outDir}/food-limitation-analysis.json`, JSON.stringify({ ...common, status: 'INVALID' }, null, 2));
    console.log('\nDIAGNOSTIC INVALID — integrity gate failed. Nothing is interpreted.');
    process.exitCode = 2;
    return;
  }

  // ---- §15.8 / §15.9 analysis, only after the gate passes ------------------
  const seeds = spec.seeds.map((seed) => {
    const recorder = recorders.get(seed)!;
    const rows = recorder.rows;
    const replicate = result.replicates.find(r => r.provenance.seed === seed)!;
    const onsetTick = scarcityOnsetTick(rows, FOOD_SCARCITY_WINDOW, FOOD_SCARCITY_THRESHOLD);
    const t250 = firstTickAtLeast(rows, FOOD_LIMITATION_NEAR_CAP_LEVEL);
    const role = seed === FOOD_LIMITATION_REFERENCE_SEED ? 'reference' : 'decision';
    const fBar = recorder.meanFertility();
    const peak = rows.reduce((m, r) => Math.max(m, r.population), 0);
    const minFood = rows.reduce((m, r) => Math.min(m, r.foodCount), Infinity);
    let minTrailingMean = Infinity;
    let sum = 0;
    for (let i = 0; i < rows.length; i++) {
      sum += rows[i]!.foodCount;
      if (i >= FOOD_SCARCITY_WINDOW) sum -= rows[i - FOOD_SCARCITY_WINDOW]!.foodCount;
      if (i >= FOOD_SCARCITY_WINDOW - 1) minTrailingMean = Math.min(minTrailingMean, sum / FOOD_SCARCITY_WINDOW);
    }
    return {
      seed, role,
      terminationReason: replicate.terminationReason, endTick: replicate.endTick,
      endingPopulation: replicate.endingPopulation, peakPopulation: peak,
      totalBirths: replicate.totalBirths, totalDeaths: replicate.totalDeaths,
      maxGenerationDepth: replicate.maxGenerationDepth,
      areaMeanFertility: fBar, expectedUncappedSupplyPerTick: fBar === null ? null : 2 * fBar,
      minFoodCount: minFood, minTrailingMeanFoodStock: minTrailingMean,
      scarcityOnsetTick: onsetTick,
      populationAtScarcityOnset: onsetTick === null ? null : rows[onsetTick - 1]!.population,
      firstTickAt250: t250,
      seedClass: role === 'decision' ? classifyDecisionSeed(onsetTick, t250) : null,
      milestones: milestoneRecords(rows, FOOD_LIMITATION_MILESTONES, FOOD_SCARCITY_WINDOW, FOOD_SCARCITY_THRESHOLD),
    };
  });
  const decisionClasses = seeds.filter(s => s.role === 'decision').map(s => s.seedClass as SeedClass);
  const majority = majorityOutcome(decisionClasses);

  fs.writeFileSync(`${outDir}/food-limitation-analysis.json`, JSON.stringify({
    ...common, status: 'VALID', seeds, decisionClasses, outcome: majority.outcome, support: `${majority.support}/3`,
  }, null, 2));

  console.log('\nseed    | role      | end                 | peak | min trailing-200 food | onset tick | pop@onset | t250  | class');
  for (const s of seeds) {
    console.log(
      `${String(s.seed).padEnd(7)} | ${s.role.padEnd(9)} | ${(s.terminationReason + '@' + s.endTick).padEnd(19)} | ` +
      `${String(s.peakPopulation).padStart(4)} | ${s.minTrailingMeanFoodStock.toFixed(2).padStart(21)} | ` +
      `${String(s.scarcityOnsetTick ?? '-').padStart(10)} | ${String(s.populationAtScarcityOnset ?? '-').padStart(9)} | ` +
      `${String(s.firstTickAt250 ?? '-').padStart(5)} | ${s.seedClass ?? '(ref)'}`
    );
  }
  console.log(`\nOutcome (>= 2 of 3 decision seeds): ${majority.outcome} (${majority.support}/3)`);
  console.log(`Results written to: ${outDir}/`);
}

/**
 * diagnostic-reproducer-lifecycle-v1 (pilot report §22). Observational rerun of
 * the seven stalled-cohort worlds; the §22.5 validity check is enforced before
 * any interpretation.
 */
function runReproducerLifecycle(outDir: string): void {
  const spec = reproducerLifecycleDiagnostic();
  const pilot = new Set(loadPilotSeeds());
  for (const seed of spec.seeds) if (!pilot.has(seed)) throw new Error(`seed ${seed} is not a pilot seed`);
  const maxAge = DEFAULT_SIMULATION_CONFIG.lifecycle.maxAge;

  console.log(`\nRunning: ${spec.experimentId} — observational; seeds ${spec.seeds.join(', ')}; 20,000 ticks; cap not an early stop; ceiling 1000\n`);
  const recorders = new Map<number, LifecycleRecorder>();
  const observedHash = new Map<string, string>();
  const result = runExperiment(spec, {
    gitCommit,
    onReplicateComplete: printProgress,
    tickObserverFor: (_c, seed) => {
      const ticks = new Set((LIFECYCLE_HASH_CHECKPOINTS[seed] ?? []).map(c => c.tick));
      const rec = createLifecycleRecorder(maxAge, (_b, after) => {
        if (ticks.has(after.tick)) observedHash.set(`${seed}|${after.tick}`, canonicalStateHash(after));
      });
      recorders.set(seed, rec);
      return rec.observer;
    },
  });
  writeExperimentResults(result, outDir, { conditionSummary: false });

  // ---- §22.5 validity ------------------------------------------------------
  const baselineCsv = fs.readFileSync('results/multifounder-default-baseline/timeseries-multifounder-default.csv', 'utf-8').trim().split('\n');
  const header = baselineCsv[0]!.split(',');
  const baselineRow = new Map<string, string[]>();
  for (const line of baselineCsv.slice(1)) { const c = line.split(','); baselineRow.set(`${c[1]}|${c[2]}`, c); }
  const validity = spec.seeds.map((seed) => {
    const failures: string[] = [];
    const hashes = (LIFECYCLE_HASH_CHECKPOINTS[seed] ?? []).map((cp) => {
      const observed = observedHash.get(`${seed}|${cp.tick}`) ?? null;
      if (observed !== cp.hash) failures.push(`hash @${cp.tick}: ${observed} != ${cp.hash}`);
      return { ...cp, observed, pass: observed === cp.hash };
    });
    const replicate = result.replicates.find(r => r.provenance.seed === seed)!;
    const rows = LIFECYCLE_ROW_CHECK_TICKS.map((tick) => {
      const base = baselineRow.get(`${seed}|${tick}`);
      const mine = replicate.timeseries.find(r => r.tick === tick);
      if (!base || !mine) { failures.push(`row @${tick}: missing`); return { tick, pass: false }; }
      const mismatched = header.slice(2).filter((h, i) => String((mine as unknown as Record<string, unknown>)[h]) !== base[i + 2]);
      if (mismatched.length) failures.push(`row @${tick}: fields differ: ${mismatched.join(',')}`);
      return { tick, pass: mismatched.length === 0, fieldsCompared: header.length - 2 };
    });
    return { seed, hashes, rows, pass: failures.length === 0, failures };
  });
  const valid = validity.every(v => v.pass);
  console.log('\n§22.5 validity:');
  for (const v of validity) {
    console.log(`  seed ${v.seed}: ${v.pass ? 'PASS' : 'INVALID'} — hashes ${v.hashes.map(h => `@${h.tick} ${h.observed}`).join(', ')}; rows @${LIFECYCLE_ROW_CHECK_TICKS.join('/')} ${v.rows.every(r => r.pass) ? 'identical' : 'DIFFER'}${v.failures.length ? ' — ' + v.failures.join('; ') : ''}`);
  }

  // Per-organism records, persisted for every seed regardless of validity.
  for (const [seed, rec] of recorders) {
    const lines = ['id,parentId,generationDepth,birthTick,reproductionEvents,reproductionTicks,energyAfterFirstReproduction,deathTick,ageAtDeath,deathCause'];
    for (const o of rec.organisms.values()) {
      lines.push([o.id, o.parentId ?? '', o.generationDepth, o.birthTick, o.reproductionTicks.length, o.reproductionTicks.join(' '),
        o.energyAfterFirstReproduction ?? '', o.deathTick ?? '', o.ageAtDeath ?? '', o.deathCause ?? ''].join(','));
    }
    fs.writeFileSync(`${outDir}/lifecycle-${seed}.csv`, lines.join('\n') + '\n');
  }

  const base = {
    id: REPRODUCER_LIFECYCLE_ID, precommitmentCommit: 'ff7e2b1', birthWindow: LIFECYCLE_BIRTH_WINDOW,
    tickConvention: 'events stamped with the post-step tick in which their result first appears; core deathTick is one lower',
    deathCauseNote: 'ENERGY_DEPLETION exact below maxAge; AT_MAX_AGE cannot be split from simultaneous starvation',
    validity,
  };
  if (!valid) {
    fs.writeFileSync(`${outDir}/lifecycle-analysis.json`, JSON.stringify({ ...base, status: 'INVALID' }, null, 2));
    console.log('\nDIAGNOSTIC INVALID — nothing is interpreted.');
    process.exitCode = 2;
    return;
  }

  // ---- §22.6–§22.8 ---------------------------------------------------------
  const worlds = spec.seeds.map((seed) => {
    const { summary, reproducers } = summarizeWorld(recorders.get(seed)!.organisms.values());
    return { seed, group: (LIFECYCLE_LATE_SEEDS as readonly number[]).includes(seed) ? 'L' : 'E*', summary, reproducers };
  });
  const E = worlds.filter(w => w.group === 'E*').map(w => w.summary);
  const L = worlds.filter(w => w.group === 'L').map(w => w.summary);
  const decision = lifecycleDecision(E, L);
  const descriptiveCuts = {
    medianAgeAtFirstReproduction: bestSingleCut(E.map(w => w.medianAgeAtFirstReproduction), L.map(w => w.medianAgeAtFirstReproduction)),
    medianLifetimeEvents: bestSingleCut(E.map(w => w.medianLifetimeEvents), L.map(w => w.medianLifetimeEvents)),
    fractionDyingBeforeSecond: bestSingleCut(E.map(w => w.fractionDyingBeforeSecond), L.map(w => w.fractionDyingBeforeSecond)),
  };
  fs.writeFileSync(`${outDir}/lifecycle-analysis.json`, JSON.stringify({
    ...base, status: 'VALID', analysedWith: runProvenance(),
    worlds: worlds.map(w => ({ seed: w.seed, group: w.group, summary: w.summary, reproducers: w.reproducers })),
    decision: { ...decision, ivStrength: decision.iv ? strengthOf(decision.iv) : null, svStrength: decision.sv ? strengthOf(decision.sv) : null },
    descriptiveCuts,
  }, null, 2));

  const f = (v: number | null, d = 1) => (v === null ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(d));
  console.log('\nseed    grp | incl cens repr ≥2 | 1st-rep age | interval | post-1st surv | events | died<2nd | deaths energy/maxAge');
  for (const w of worlds) {
    const s = w.summary;
    console.log(`${String(w.seed).padEnd(7)} ${w.group.padEnd(3)} | ${String(s.included).padStart(4)} ${String(s.censored).padStart(4)} ${String(s.eligibleReproducers).padStart(4)} ${String(s.reproducersWithTwoOrMore).padStart(2)} | ` +
      `${f(s.medianAgeAtFirstReproduction).padStart(11)} | ${f(s.medianInterval).padStart(8)} | ${f(s.medianPostFirstReproductionSurvival).padStart(13)} | ${f(s.medianLifetimeEvents).padStart(6)} | ${f(s.fractionDyingBeforeSecond, 3).padStart(8)} | ${s.deathCauses.ENERGY_DEPLETION}/${s.deathCauses.AT_MAX_AGE}`);
  }
  console.log(`\nIV (median interval): misclassified ${decision.iv?.misclassified} (${decision.iv?.direction}); SV (median post-first survival): misclassified ${decision.sv?.misclassified} (${decision.sv?.direction})`);
  console.log(`descriptive cuts: ${JSON.stringify(Object.fromEntries(Object.entries(descriptiveCuts).map(([k, c]) => [k, `${c.misclassified} ${c.direction}`])))}`);
  console.log(`§22.8 mechanism: ${decision.mechanism} (${decision.reason})`);
  console.log(`Results written to: ${outDir}/`);
}

/**
 * Reproduction participation analysis (pilot report §21). Read-only: reads the
 * persisted baseline timeseries, runs nothing, writes only to `outDir`.
 */
function runReproductionParticipation(resultsRoot: string, outDir: string): void {
  const source = path.join(resultsRoot, 'multifounder-default-baseline', 'timeseries-multifounder-default.csv');
  const lines = fs.readFileSync(source, 'utf-8').trim().split('\n');
  const header = lines[0]!.split(',');
  const col = (k: string) => { const i = header.indexOf(k); if (i < 0) throw new Error(`missing column ${k}`); return i; };
  const [cSeed, cTick, cPop, cBirths, cFrac] = ['seed', 'tick', 'population', 'birthsCumulative', 'fractionEverReproduced'].map(col);
  const rows = new Map<string, { population: number; births: number; fraction: number }>();
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    rows.set(`${c[cSeed!]}|${c[cTick!]}`, { population: Number(c[cPop!]), births: Number(c[cBirths!]), fraction: Number(c[cFrac!]) });
  }
  const derived = (seed: number, tick: number) => {
    const r = rows.get(`${seed}|${tick}`);
    if (!r) throw new Error(`seed ${seed}: no persisted sample at tick ${tick}`);
    if (r.population <= 0) throw new Error(`seed ${seed}: population 0 at tick ${tick} inside the §21 window`);
    return deriveReproduction(r.fraction, r.births);
  };

  const metrics = [
    { name: 'M1 fractionEverReproduced', get: (s: number, t: number) => derived(s, t).fraction },
    { name: 'M2 cumulativeBirths', get: (s: number, t: number) => derived(s, t).births },
    { name: 'M3 birthsPerReproducer', get: (s: number, t: number) => derived(s, t).birthsPerReproducer },
  ];
  const comparison = metrics.map((m) => {
    const byCheckpoint = PARTICIPATION_CHECKPOINTS.map((tick) => {
      const e = STALLED_GROUP_E.map(s => m.get(s, tick));
      const l = STALLED_GROUP_L.map(s => m.get(s, tick));
      return { tick, extinct: groupStat(e), lateEstablishers: groupStat(l), bestCut: bestSingleCut(e, l) };
    });
    return { metric: m.name, byCheckpoint, differs: metricDiffers(byCheckpoint.map(b => b.bestCut)) };
  });
  const call = mechanismCall(comparison[0]!.differs, comparison[2]!.differs);
  const earliestClear = PARTICIPATION_CHECKPOINTS
    .map((tick, k) => ({ tick, metrics: comparison.filter(c => c.byCheckpoint[k]!.bestCut.misclassified === 0).map(c => c.metric) }))
    .find(x => x.metrics.length > 0) ?? null;
  const perSeed = [...STALLED_GROUP_E, ...STALLED_GROUP_L].map(seed => ({
    seed, group: (STALLED_GROUP_L as readonly number[]).includes(seed) ? 'L' : 'E*',
    at: PARTICIPATION_CHECKPOINTS.map(t => ({ tick: t, ...derived(seed, t) })),
  }));

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'reproduction-participation.json'), JSON.stringify({
    analysis: 'reproduction-participation-v1', specification: 'docs/Phase 0B Pilot Report.md §21 (precommitted in 18fe6e3)',
    source, analysedWith: runProvenance(), generatedAt: new Date().toISOString(),
    groups: { Estar: STALLED_GROUP_E, L: STALLED_GROUP_L, excluded: STALLED_GROUP_E_EXCLUDED },
    checkpoints: PARTICIPATION_CHECKPOINTS, comparison, earliestClear, mechanismCall: call, perSeed,
    limitations: [
      'fractionEverReproduced and births-per-reproducer are lifetime, founder-inclusive and include the dead',
      'descendant-only participation after tick 3000 is not derivable from persisted aggregates',
      'f x I = B / (25 + B): the two metrics are coupled; growth biases both against L',
      'n = 4 vs n = 3, pilot seeds only',
    ],
  }, null, 2));

  const f = (v: number | null, d = 3) => (v === null ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(d));
  console.log('\nPer seed: f / births / reproducers R / births per reproducer I');
  for (const p of perSeed) console.log(`  ${p.seed} ${p.group}: ` + p.at.map(a => `${a.tick}: ${f(a.fraction)}/${a.births}/${a.reproducers}/${f(a.birthsPerReproducer, 2)}`).join('  '));
  const g = (s: { median: number | null; min: number | null; max: number | null }) => `${f(s.median)} [${f(s.min)}–${f(s.max)}]`;
  console.log('\nmetric                     tick | E* (n=4) median [range]  | L (n=3) median [range]   | misclassified /7');
  for (const c of comparison) for (const b of c.byCheckpoint) {
    console.log(`${c.metric.padEnd(26)} ${String(b.tick).padStart(4)} | ${g(b.extinct).padEnd(24)} | ${g(b.lateEstablishers).padEnd(24)} | ${b.bestCut.misclassified} (${b.bestCut.direction})`);
  }
  for (const c of comparison) console.log(`${c.metric}: differs=${c.differs.differs} from=${c.differs.from} direction=${c.differs.direction}`);
  console.log(`earliest CLEAR: ${earliestClear ? earliestClear.tick + ' ' + earliestClear.metrics.join(', ') : 'none'}`);
  console.log(`mechanism call (§21.5): ${call}`);
  console.log(`Written to ${outDir}/`);
}

/**
 * Stalled-cohort analysis (pilot report §20). Read-only: reads the persisted
 * baseline timeseries, runs nothing, writes only to `outDir`.
 */
function runStalledCohort(resultsRoot: string, outDir: string): void {
  const source = path.join(resultsRoot, 'multifounder-default-baseline', 'timeseries-multifounder-default.csv');
  const lines = fs.readFileSync(source, 'utf-8').trim().split('\n');
  const header = lines[0]!.split(',');
  const col = (k: string) => { const i = header.indexOf(k); if (i < 0) throw new Error(`missing column ${k}`); return i; };
  const [cSeed, cTick, cPop, cBirths, cEnergy] = ['seed', 'tick', 'population', 'birthsCumulative', 'meanEnergy'].map(col);
  const rows = new Map<string, { population: number; births: number; energy: number }>();
  const lastTick = new Map<number, number>();
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    const seed = Number(c[cSeed!]); const tick = Number(c[cTick!]);
    rows.set(`${seed}|${tick}`, { population: Number(c[cPop!]), births: Number(c[cBirths!]), energy: Number(c[cEnergy!]) });
    lastTick.set(seed, Math.max(lastTick.get(seed) ?? 0, tick));
  }
  const allSeeds = [STALLED_GROUP_E_EXCLUDED, ...STALLED_GROUP_E, ...STALLED_GROUP_L];
  const value = (seed: number, tick: number) => {
    const r = rows.get(`${seed}|${tick}`);
    if (!r) throw new Error(`seed ${seed}: no persisted sample at tick ${tick}`);
    if (r.population <= 0) throw new Error(`seed ${seed}: population 0 at tick ${tick} inside the §20 window`);
    return r;
  };

  const metrics = [
    { name: 'population', get: (s: number, t: number) => value(s, t).population },
    { name: 'cumulativeBirths', get: (s: number, t: number) => value(s, t).births },
    { name: 'meanEnergy', get: (s: number, t: number) => value(s, t).energy },
  ];
  const comparison = STALLED_CHECKPOINTS.map((tick) => {
    const perMetric = metrics.map((m) => {
      const e = STALLED_GROUP_E.map(s => m.get(s, tick));
      const l = STALLED_GROUP_L.map(s => m.get(s, tick));
      return { metric: m.name, extinct: groupStat(e), lateEstablishers: groupStat(l), bestCut: bestSingleCut(e, l) };
    });
    return { tick, perMetric, strength: stalledStrength(perMetric.map(p => p.bestCut)) };
  });
  const persistence = metrics.map((m, mi) => {
    const series = comparison.map(c => c.perMetric[mi]!.bestCut.misclassified);
    const firstLe1 = series.findIndex(x => x <= 1);
    const first0 = series.findIndex(x => x === 0);
    return {
      metric: m.name, misclassifiedByCheckpoint: series,
      firstCheckpointAtMost1: firstLe1 < 0 ? null : STALLED_CHECKPOINTS[firstLe1],
      persistsAtMost1: firstLe1 < 0 ? null : persistsFrom(series, firstLe1, 1),
      firstCheckpointAt0: first0 < 0 ? null : STALLED_CHECKPOINTS[first0],
      persistsAt0: first0 < 0 ? null : persistsFrom(series, first0, 0),
    };
  });
  const firstClear = comparison.find(c => c.strength === 'CLEAR')?.tick ?? null;
  const firstStrong = comparison.find(c => c.strength !== 'WEAK_NONE')?.tick ?? null;
  const conclusion = firstClear !== null ? 'A' : firstStrong !== null ? 'B' : 'C';
  const perSeed = allSeeds.map(seed => ({
    seed, group: seed === STALLED_GROUP_E_EXCLUDED ? 'E (extinct at 3000; not counted)' : (STALLED_GROUP_L as readonly number[]).includes(seed) ? 'L' : 'E*',
    lastPersistedTick: lastTick.get(seed) ?? null,
    at: [3000, ...STALLED_CHECKPOINTS].map(t => {
      const r = rows.get(`${seed}|${t}`);
      return { tick: t, population: r?.population ?? null, births: r?.births ?? null, meanEnergy: r && r.population > 0 ? r.energy : null };
    }),
  }));

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'stalled-cohort.json'), JSON.stringify({
    analysis: 'stalled-cohort-v1', specification: 'docs/Phase 0B Pilot Report.md §20 (precommitted in d08ce41)',
    source, analysedWith: runProvenance(), generatedAt: new Date().toISOString(),
    groups: { Estar: STALLED_GROUP_E, excludedFromCounts: STALLED_GROUP_E_EXCLUDED, L: STALLED_GROUP_L },
    checkpoints: STALLED_CHECKPOINTS, comparison, persistence, firstClear, firstStrongPartialOrBetter: firstStrong, conclusion, perSeed,
    chanceLevel: { perLookZero: 2 / 35, perLookAtMostOne: 14 / 35, looks: 18 },
    note: 'Observational only. No causal claim about food, sensing or neural quality.',
  }, null, 2));

  const f = (v: number | null) => (v === null ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(1));
  console.log('\nPer seed (population / cumulative births / mean energy) at 3000 and each checkpoint:');
  for (const p of perSeed) {
    console.log(`  ${p.seed} ${p.group} (last sample ${p.lastPersistedTick}): ` + p.at.map(a => `${a.tick}: ${f(a.population)}/${f(a.births)}/${f(a.meanEnergy)}`).join('  '));
  }
  const g = (s: { median: number | null; min: number | null; max: number | null }) => `${f(s.median)} [${f(s.min)}–${f(s.max)}]`;
  console.log('\nmetric           tick | E* (n=4) median [range] | L (n=3) median [range] | misclassified /7');
  for (const c of comparison) for (const p of c.perMetric) {
    console.log(`${p.metric.padEnd(16)} ${String(c.tick).padStart(4)} | ${g(p.extinct).padEnd(23)} | ${g(p.lateEstablishers).padEnd(22)} | ${p.bestCut.misclassified} (${p.bestCut.direction}, t=${f(p.bestCut.threshold)})`);
  }
  console.log('\nstrength by checkpoint: ' + comparison.map(c => `${c.tick} ${c.strength}`).join(', '));
  console.log('persistence: ' + JSON.stringify(persistence));
  console.log(`first CLEAR: ${firstClear ?? 'none'}; first STRONG PARTIAL or better: ${firstStrong ?? 'none'}; conclusion ${conclusion}`);
  console.log(`Written to ${outDir}/`);
}

/** §19.3 groups, fixed in the precommitment (e5f368c). */
const EARLY_GROUP_E = [100000, 131676, 147514, 187109, 195028];
const EARLY_GROUP_S = [107919, 115838, 123757, 139595, 155433, 163352, 171271, 179190, 202947, 210866];

/**
 * Early-establishment analysis (pilot report §19). Read-only: reads the persisted
 * baseline timeseries, runs nothing, writes only to `outDir`.
 */
function runEarlyEstablishment(resultsRoot: string, outDir: string): void {
  const source = path.join(resultsRoot, 'multifounder-default-baseline', 'timeseries-multifounder-default.csv');
  const lines = fs.readFileSync(source, 'utf-8').trim().split('\n');
  const header = lines[0]!.split(',');
  const col = (k: string) => { const i = header.indexOf(k); if (i < 0) throw new Error(`missing column ${k}`); return i; };
  const [cSeed, cTick, cPop, cBirths, cEnergy] = ['seed', 'tick', 'population', 'birthsCumulative', 'meanEnergy'].map(col);
  const bySeed = new Map<number, EarlySample[]>();
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    const seed = Number(c[cSeed!]);
    const sample = { tick: Number(c[cTick!]), population: Number(c[cPop!]), birthsCumulative: Number(c[cBirths!]), meanEnergy: Number(c[cEnergy!]) };
    const b = bySeed.get(seed); if (b) b.push(sample); else bySeed.set(seed, [sample]);
  }

  // Cross-check the fixed groups against the persisted v2 profile, when present.
  const reclassPath = path.join(resultsRoot, `reclassification-${TRAJECTORY_CLASSIFIER_VERSION}`, 'reclassification.json');
  if (fs.existsSync(reclassPath)) {
    const assembled = JSON.parse(fs.readFileSync(reclassPath, 'utf-8')).assembledRuns as Array<{ seed: number; classification: { outcome: string } | null }>;
    for (const a of assembled) {
      const inE = EARLY_GROUP_E.includes(a.seed);
      const extinct = a.classification?.outcome === 'EXTINCTION';
      if (!a.classification || inE !== extinct) throw new Error(`group assignment disagrees with the v2 profile for seed ${a.seed}`);
    }
  }

  const records = [...EARLY_GROUP_E, ...EARLY_GROUP_S].map(seed => ({
    group: EARLY_GROUP_E.includes(seed) ? 'E' : 'S', ...earlyRecord(seed, bySeed.get(seed) ?? []),
  }));
  const E = records.filter(r => r.group === 'E');
  const S = records.filter(r => r.group === 'S');

  const fields = [
    { name: 'population', get: (r: typeof records[number], t: number) => r.population[t]! as number | null },
    { name: 'cumulativeBirths', get: (r: typeof records[number], t: number) => r.births[t]! as number | null },
    { name: 'meanEnergy', get: (r: typeof records[number], t: number) => r.meanEnergy[t] ?? null },
  ];
  const comparison = fields.flatMap(f => EARLY_TICKS.map(t => ({
    metric: f.name, tick: t,
    extinct: groupStat(E.map(r => f.get(r, t))),
    established: groupStat(S.map(r => f.get(r, t))),
    bestCut: bestSingleCut(E.map(r => f.get(r, t)), S.map(r => f.get(r, t))),
  })));
  const descriptive = [
    { metric: 'minPopulation0to3000', e: E.map(r => r.minPopulation), s: S.map(r => r.minPopulation) },
    { metric: 'maxPopulation0to3000', e: E.map(r => r.maxPopulation), s: S.map(r => r.maxPopulation) },
    { metric: 'firstTickAtDoubling', e: E.map(r => r.firstTickAtDoubling), s: S.map(r => r.firstTickAtDoubling) },
    { metric: 'firstTickWithBirth', e: E.map(r => r.firstTickWithBirth), s: S.map(r => r.firstTickWithBirth) },
  ].map(d => ({ metric: d.metric, extinct: groupStat(d.e), established: groupStat(d.s),
    extinctNotReached: d.e.filter(x => x === null).length, establishedNotReached: d.s.filter(x => x === null).length,
    bestCut: bestSingleCut(d.e, d.s) }));
  const decisionCuts = comparison.filter(c => c.tick === 3000);
  const verdict = separation(decisionCuts.map(c => c.bestCut));

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'early-establishment.json'), JSON.stringify({
    analysis: 'early-establishment-v1', specification: 'docs/Phase 0B Pilot Report.md §19 (precommitted in e5f368c)',
    source, analysedWith: runProvenance(), generatedAt: new Date().toISOString(),
    doublingLevel: EARLY_DOUBLING_LEVEL, groups: { E: EARLY_GROUP_E, S: EARLY_GROUP_S },
    records, comparison, descriptive, decisionFields: decisionCuts.map(c => ({ metric: c.metric, bestCut: c.bestCut })), separation: verdict,
    note: 'Observational only. Thresholds are not biological rules, fitness scores or selection criteria. Food intake is not available for group E.',
  }, null, 2));

  console.log('\nseed   grp | pop@1000 2000 3000 | births@1000 2000 3000 | energy@1000 2000 3000 | min max | t>=50 | first birth');
  for (const r of records) {
    const e = (t: number) => (r.meanEnergy[t] === null ? 'n/a' : r.meanEnergy[t]!.toFixed(1)).padStart(5);
    console.log(`${String(r.seed).padEnd(6)} ${r.group}   | ${String(r.population[1000]).padStart(4)} ${String(r.population[2000]).padStart(4)} ${String(r.population[3000]).padStart(4)} | ` +
      `${String(r.births[1000]).padStart(4)} ${String(r.births[2000]).padStart(4)} ${String(r.births[3000]).padStart(4)} | ${e(1000)} ${e(2000)} ${e(3000)} | ` +
      `${String(r.minPopulation).padStart(3)} ${String(r.maxPopulation).padStart(3)} | ${String(r.firstTickAtDoubling ?? '-').padStart(5)} | ${r.firstTickWithBirth ?? '-'}`);
  }
  const fmt = (g: { n: number; median: number | null; min: number | null; max: number | null }) =>
    g.median === null ? 'n/a' : `${Number(g.median.toFixed(1))} [${Number(g.min!.toFixed(1))}–${Number(g.max!.toFixed(1))}] (n=${g.n})`;
  console.log('\nmetric           tick | extinct median [range]      | established median [range]   | best cut misclassified');
  for (const c of [...comparison]) {
    console.log(`${c.metric.padEnd(16)} ${String(c.tick).padStart(4)} | ${fmt(c.extinct).padEnd(27)} | ${fmt(c.established).padEnd(28)} | ${c.bestCut.misclassified}/${c.bestCut.n} (t=${c.bestCut.threshold}, ${c.bestCut.direction}, overlap=${c.bestCut.rangesOverlap})`);
  }
  for (const d of descriptive) {
    console.log(`${d.metric.padEnd(22)} | E ${fmt(d.extinct)} not-reached ${d.extinctNotReached} | S ${fmt(d.established)} not-reached ${d.establishedNotReached} | cut ${d.bestCut.misclassified}/${d.bestCut.n}`);
  }
  console.log(`\n§19.5 separation by tick 3000: ${verdict}`);
  console.log(`Written to ${outDir}/`);
}

/**
 * continuation-multifounder-default-v1 (pilot report §18). Continues the six
 * cap-stopped 0A.2.0 default-baseline seeds; enforces the §18.2 per-seed
 * validity check before any interpretation; classifies valid seeds with
 * trajectory-outcome-v2. No condition summary is written.
 */
function runBaselineContinuation(outDir: string): void {
  const spec = baselineContinuation();
  const pilot = new Set(loadPilotSeeds());
  for (const seed of spec.seeds) {
    if (!pilot.has(seed)) throw new Error(`continuation seed ${seed} is not a pilot seed`);
  }
  const capacity = DEFAULT_SIMULATION_CONFIG.food.worldFoodCapacity;

  console.log(`\nRunning: ${spec.experimentId} — descriptive only; the gate verdict is already FAIL (§17.5)`);
  console.log(`  seeds: ${spec.seeds.join(', ')}; max ticks ${spec.maxTicks}; 200 cap as early stop: DISABLED; execution safety ceiling ${spec.safetyPopulationCeiling}\n`);

  const recorders = new Map<number, FoodFluxRecorder>();
  const checkpointHash = new Map<number, string>();
  const result = runExperiment(spec, {
    gitCommit,
    onReplicateComplete: printProgress,
    tickObserverFor: (_conditionId, seed) => {
      const cp = BASELINE_CONTINUATION_CHECKPOINTS[seed];
      const recorder = createFoodFluxRecorder(capacity, (_before, after) => {
        if (cp && after.tick === cp.tick) checkpointHash.set(seed, canonicalStateHash(after));
      });
      recorders.set(seed, recorder);
      return recorder.observer;
    },
  });

  writeExperimentResults(result, outDir, { conditionSummary: false });
  for (const [seed, recorder] of recorders) {
    const header = 'tick,population,foodCount,foodCapacityFraction,foodConsumed,foodRegenerated,births,deaths,meanEnergy';
    const lines = recorder.rows.map(r =>
      `${r.tick},${r.population},${r.foodCount},${r.foodCapacityFraction.toFixed(6)},${r.foodConsumed},${r.foodRegenerated},${r.births},${r.deaths},${r.meanEnergy}`);
    fs.writeFileSync(`${outDir}/flux-${seed}.csv`, [header, ...lines].join('\n') + '\n');
  }

  // ---- §18.2 per-seed validity check, before any interpretation ----------
  const integrity = spec.seeds.map((seed) => {
    const cp = BASELINE_CONTINUATION_CHECKPOINTS[seed]!;
    const rows = recorders.get(seed)!.rows;
    const upTo = rows.slice(0, cp.tick);
    const at = upTo[upTo.length - 1];
    const observed = {
      tick: at?.tick ?? null,
      hash: checkpointHash.get(seed) ?? null,
      population: at?.population ?? null,
      births: upTo.reduce((s, r) => s + r.births, 0),
      deaths: upTo.reduce((s, r) => s + r.deaths, 0),
      food: at?.foodCount ?? null,
    };
    const failures: string[] = [];
    for (const k of ['tick', 'hash', 'population', 'births', 'deaths', 'food'] as const) {
      if (observed[k] !== cp[k]) failures.push(`${k}: ${String(observed[k])} != ${String(cp[k])}`);
    }
    return { seed, checkTick: cp.tick, expected: cp, observed, pass: failures.length === 0, failures };
  });

  console.log('\n§18.2 validity check:');
  for (const i of integrity) {
    console.log(`  seed ${i.seed} @ tick ${i.checkTick}: ${i.pass ? 'PASS' : 'INVALID'} (hash ${i.observed.hash})${i.failures.length ? ' — ' + i.failures.join('; ') : ''}`);
  }

  // ---- trajectory-outcome-v2 on valid seeds only ---------------------------
  const seeds = result.replicates.map((r) => {
    const valid = integrity.find(i => i.seed === r.provenance.seed)!.pass;
    return {
      seed: r.provenance.seed,
      oldStopTick: BASELINE_CONTINUATION_CHECKPOINTS[r.provenance.seed]!.tick,
      validity: valid ? 'PASS' : 'INVALID',
      terminationReason: r.terminationReason,
      endTick: r.endTick,
      peakPopulation: r.peakPopulation,
      finalPopulation: r.endingPopulation,
      totalBirths: r.totalBirths,
      maxGenerationDepth: r.maxGenerationDepth,
      classification: valid ? classifyTrajectory({
        terminationReason: r.terminationReason, endTick: r.endTick, endingPopulation: r.endingPopulation,
        peakPopulation: r.peakPopulation, samples: r.timeseries,
      }) : null,
    };
  });
  const allValid = integrity.every(i => i.pass);
  fs.writeFileSync(`${outDir}/continuation-analysis.json`, JSON.stringify({
    id: BASELINE_CONTINUATION_ID,
    precommitmentCommit: 'a8faf6a',
    classifierVersion: TRAJECTORY_CLASSIFIER_VERSION,
    status: allValid ? 'VALID' : 'PARTIAL_OR_INVALID',
    gateNote: 'descriptive only; the 0A.2.0 default baseline gate is already FAIL (pilot report §17.5)',
    integrity, seeds,
  }, null, 2));

  console.log('\nseed    | old stop | validity | end                  | peak | final | growth ratio | class');
  for (const s of seeds) {
    const c = s.classification;
    console.log(`${String(s.seed).padEnd(7)} | ${String(s.oldStopTick).padStart(8)} | ${s.validity.padEnd(8)} | ${(s.terminationReason + '@' + s.endTick).padEnd(20)} | ` +
      `${String(s.peakPopulation).padStart(4)} | ${String(s.finalPopulation).padStart(5)} | ${(c?.growthRatio?.toFixed(4) ?? '-').padStart(12)} | ${c ? c.outcome + ' (' + c.reason + ')' : 'not interpreted'}`);
  }
  console.log(`\nResults written to: ${outDir}/`);
  if (!allValid) process.exitCode = 2;
}

/**
 * Persisted 20,000-tick experiments excluded from reclassification, with the
 * reason. Everything else on a 20,000-tick horizon is in scope.
 */
const RECLASSIFICATION_EXCLUSIONS: Record<string, string> = {
  'diagnostic-movement-policy':
    'energy diagnostic (§7): food and reproduction disabled by design, so extinction is built in; not an ecological trajectory',
};

/**
 * trajectory-outcome-v2 reclassification of persisted results (pilot report
 * §16). Read-only on every source directory; writes only to `outDir`.
 */
function runTrajectoryReclassification(resultsRoot: string, outDir: string): void {
  const pilotSeeds = loadPilotSeeds();
  const scan: Array<{ directory: string; horizons: number[]; versions: string[]; replicates: number; inScope: boolean; note: string }> = [];
  const inScope: ReclassifiedRun[] = [];

  for (const dir of listPersistedExperimentDirectories(resultsRoot)) {
    if (path.resolve(dir).startsWith(path.resolve(outDir))) continue;
    const runs = readPersistedRuns(dir);
    const horizons = [...new Set(runs.map(r => r.maxTicks))];
    const versions = [...new Set(runs.map(r => r.simulationVersion))];
    const top = path.relative(resultsRoot, dir).split(path.sep)[0]!;
    const excluded = RECLASSIFICATION_EXCLUSIONS[top];
    const onHorizon = horizons.length === 1 && horizons[0] === TRAJECTORY_HORIZON;
    const scoped = onHorizon && !excluded;
    scan.push({
      directory: dir, horizons, versions, replicates: runs.length, inScope: scoped,
      note: excluded ?? (onHorizon ? 'in scope' : `horizon ${horizons.join('/')} below ${TRAJECTORY_HORIZON}`),
    });
    if (scoped) for (const r of runs) inScope.push(reclassifyRun(r));
  }

  // Cohorts: one configuration run on the full pilot seed set.
  const groups = new Map<string, ReclassifiedRun[]>();
  for (const r of inScope) {
    const key = `${r.source.directory}::${r.conditionId}`;
    const g = groups.get(key); if (g) g.push(r); else groups.set(key, [r]);
  }
  const cohorts: CohortSummary[] = [];
  const nonCohorts: string[] = [];
  for (const [key, runs] of groups) {
    const seeds = new Set(runs.map(r => r.seed));
    if (runs.length === pilotSeeds.length && pilotSeeds.every(s => seeds.has(s))) cohorts.push(summarizeCohort(key, runs));
    else nonCohorts.push(`${key} (${runs.length} selected seeds — not a configuration cohort)`);
  }

  // 0A.2.0 default, per seed: the baseline record, or — where the baseline run was
  // stopped by the v1 cap — a verified uncapped continuation of it: same
  // configHash, and the source's own integrity/validity gate passed for that
  // seed (§15.9 for diagnostic-food-limitation-v1, §18.2 for the continuation).
  const baseline = inScope.filter(r => r.experimentId === 'multifounder-default-baseline');
  const continuationSources = [
    { experimentId: FOOD_LIMITATION_DIAGNOSTIC_ID, analysisFile: 'food-limitation-analysis.json' },
    { experimentId: BASELINE_CONTINUATION_ID, analysisFile: 'continuation-analysis.json' },
  ].map((src) => {
    const file = path.join(resultsRoot, src.experimentId, src.analysisFile);
    const integrity: Array<{ seed: number; pass: boolean }> = fs.existsSync(file)
      ? (JSON.parse(fs.readFileSync(file, 'utf-8')).integrity ?? []) : [];
    return { ...src, runs: inScope.filter(r => r.experimentId === src.experimentId), integrity };
  });
  const assembled = baseline.map((b) => {
    if (b.eligible) return { ...b, assembledFrom: 'multifounder-default-baseline' };
    for (const src of continuationSources) {
      const cont = src.runs.find(f => f.seed === b.seed && f.eligible
        && f.source.configHash === b.source.configHash && src.integrity.some(i => i.seed === b.seed && i.pass));
      if (cont) return { ...cont, assembledFrom: `${src.experimentId} (verified continuation)` };
    }
    return { ...b, assembledFrom: 'multifounder-default-baseline (stopped by v1 cap; no verified continuation)' };
  });
  const assembly = baseline.length === pilotSeeds.length
    ? summarizeCohort('0A.2.0 default: baseline + verified uncapped continuations', assembled) : null;
  const assemblyProfile = assembly ? cohortProfile(assembled) : null;

  // Census of eligible records per model (records, not a cohort statistic).
  const census = [...new Set(inScope.map(r => r.simulationVersion))].sort().map((v) => {
    const recs = inScope.filter(r => r.simulationVersion === v);
    const eligible = recs.filter(r => r.eligible);
    const distinct = new Set(eligible.map(r => `${r.source.configHash}|${r.seed}`));
    const ineligible: Record<string, number> = {};
    for (const r of recs) if (!r.eligible) ineligible[r.ineligibleReason!] = (ineligible[r.ineligibleReason!] ?? 0) + 1;
    return { simulationVersion: v, inScopeRecords: recs.length, eligibleRecords: eligible.length,
      distinctEligibleTrajectories: distinct.size, ineligible, counts: countClasses(eligible) };
  });

  fs.mkdirSync(outDir, { recursive: true });
  const report = {
    classifierVersion: TRAJECTORY_CLASSIFIER_VERSION,
    historicalClassifierVersion: PEAK_CAP_CLASSIFIER_VERSION,
    specification: 'docs/Phase 0B Pilot Report.md §16 (precommitted in 7c60f3d)',
    parameters: {
      horizon: TRAJECTORY_HORIZON, windowStartExclusive: TRAJECTORY_WINDOW_START, halfBoundary: TRAJECTORY_HALF_BOUNDARY,
      minSamplesPerHalf: TRAJECTORY_MIN_SAMPLES_PER_HALF, growthThreshold: TRAJECTORY_GROWTH_THRESHOLD,
      shrinkThreshold: TRAJECTORY_SHRINK_THRESHOLD, highBoundedLevel: TRAJECTORY_HIGH_BOUNDED_LEVEL,
      safetyCeiling: TRAJECTORY_SAFETY_CEILING,
    },
    reclassifiedWith: runProvenance(),
    generatedAt: new Date().toISOString(),
    scan, census, cohorts, nonCohorts, assembly, assemblyProfile, assembledRuns: assembled, runs: inScope,
  };
  fs.writeFileSync(path.join(outDir, 'reclassification.json'), JSON.stringify(report, null, 2));

  const header = 'experimentId,conditionId,seed,simulationVersion,classifierVersion,eligible,ineligibleReason,finalTick,' +
    'peakPopulation,finalPopulation,earlyMean,lateMean,windowMean,growthRatio,class,reason,safetyCeilingReached,' +
    'windowMeanFood,windowBirths,windowDeaths,v1Outcome,sourceDirectory,gitCommit,gitDirty,sourceIdentity,configHash';
  const num = (x: number | null | undefined, d = 4) => (x === null || x === undefined ? '' : Number.isInteger(x) ? String(x) : x.toFixed(d));
  const lines = inScope.map((r) => {
    const c = r.classification;
    return [r.experimentId, r.conditionId, r.seed, r.simulationVersion, TRAJECTORY_CLASSIFIER_VERSION, r.eligible,
      r.ineligibleReason ?? '', c ? c.finalTick : '', c ? c.peakPopulation : '', c ? c.finalPopulation : '',
      num(c?.earlyMean), num(c?.lateMean), num(c?.windowMean), num(c?.growthRatio, 5), c?.outcome ?? '', c?.reason ?? '',
      c ? c.safetyCeilingReached : '', num(c?.windowMeanFood), num(c?.windowBirths), num(c?.windowDeaths), r.v1Outcome,
      r.source.directory, r.source.gitCommit ?? '', r.source.gitDirty ?? '', r.source.sourceIdentity ?? '', r.source.configHash,
    ].join(',');
  });
  fs.writeFileSync(path.join(outDir, 'reclassification.csv'), [header, ...lines].join('\n') + '\n');

  console.log(`\n${TRAJECTORY_CLASSIFIER_VERSION} reclassification of persisted results (read-only)\n`);
  for (const s of scan) console.log(`  ${s.inScope ? 'IN ' : 'out'} ${s.directory} [${s.versions.join(',')}; ${s.replicates} runs] — ${s.note}`);
  console.log('\nCensus of eligible records (per model; records, not a cohort statistic):');
  for (const c of census) console.log(`  ${c.simulationVersion}: in scope ${c.inScopeRecords}, eligible ${c.eligibleRecords} (${c.distinctEligibleTrajectories} distinct), ineligible ${JSON.stringify(c.ineligible)}, classes ${JSON.stringify(c.counts)}`);
  console.log('\nCohorts (configuration x 15 pilot seeds):');
  for (const c of [...cohorts, ...(assembly ? [assembly] : [])]) {
    console.log(`  ${c.cohortId} [${c.simulationVersion}] eligible ${c.eligible}/${c.size} ${JSON.stringify(c.counts)} ` +
      (c.complete ? `boundedCompletionRate ${c.boundedCompletionRate!.toFixed(3)}` : `INCOMPLETE (missing ${c.missing}); rate not computable; possible range ${c.boundedCompletionRange.min.toFixed(3)}–${c.boundedCompletionRange.max.toFixed(3)}; gate reachable: ${c.gateReachable}`));
  }
  if (assemblyProfile) {
    console.log('\n0A.2.0 default, 15-seed profile (descriptive; gate verdict already FAIL):');
    console.log(`  ${JSON.stringify(assemblyProfile)}`);
    for (const a of assembled) {
      console.log(`  seed ${a.seed}: ${a.classification ? a.classification.outcome + ' (' + a.classification.reason + ')' : 'NOT CLASSIFIED (' + a.ineligibleReason + ')'} — ${a.assembledFrom}`);
    }
  }
  console.log('\nEligible trajectory classifications:');
  for (const r of inScope.filter(x => x.eligible && x.classification!.outcome !== 'EXTINCTION')) {
    const c = r.classification!;
    console.log(`  ${r.simulationVersion} ${r.experimentId}/${r.conditionId} seed ${r.seed}: ${c.outcome} (${c.reason}) early ${c.earlyMean?.toFixed(1)} late ${c.lateMean?.toFixed(1)} window ${c.windowMean?.toFixed(1)} r ${c.growthRatio?.toFixed(4)} peak ${c.peakPopulation} final ${c.finalPopulation} [v1 ${r.v1Outcome}]`);
  }
  console.log(`\nWritten to ${outDir}/`);
}

main().catch((err) => {
  console.error('Experiment failed:', err);
  process.exit(1);
});
