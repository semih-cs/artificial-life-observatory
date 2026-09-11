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
  if (experiment === 'reclassify-trajectory') {
    printProvenance();
    runTrajectoryReclassification('results', outputDir ?? `results/reclassification-${TRAJECTORY_CLASSIFIER_VERSION}`);
    return;
  }

  printProvenance();

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
