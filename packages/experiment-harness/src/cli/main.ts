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
} from '../experiments/definitions.js';
import { MOVEMENT_POLICY_LEVELS, MovementPolicyId } from '../experiments/movementPolicies.js';
import {
  predictDrain, impliedForwardFraction, measuredDrainPerTick, largestCleanWindow,
} from '../analysis/energyModel.js';
import { median as medianOf } from '../metrics/compute.js';
import { runExperiment } from '../runner/experiment.js';
import { DEFAULT_SIMULATION_CONFIG } from '@alo/simulation-core';
import { runSweep, SweepSpec } from '../runner/sweep.js';
import { loadPilotSeeds, loadValidationSeeds } from '../runner/seeds.js';
import { writeExperimentResults, writeSweepSummaryFromDisk } from '../output/writer.js';
import { detectDegeneracy, passesCalibrationCriteria, DEFAULT_CALIBRATION_CRITERIA } from '../analysis/degeneracy.js';
import { readPersistedSweep } from '../analysis/persistedResults.js';
import { runProvenance } from '../runner/provenance.js';
import { BASELINE_MIN_VIABLE_COMPLETION_RATE } from '../analysis/outcome.js';
import type { ExperimentSpec, ExperimentResult, ReplicateResult } from '../types.js';
import * as fs from 'node:fs';

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
    console.log('\nExperiments: starvation, feeding, reproduction-control, full-evolutionary, movement-policy, mutation-2x2, calibration-sweep, calibration-v2, calibration-v3, calibration-report');
    process.exit(1);
  }

  // Reading persisted results consumes no seeds and runs nothing.
  if (experiment === 'calibration-report') {
    printCalibrationReport(outputDir ?? 'results/calibration-v1');
    return;
  }

  printProvenance();
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
  console.log(`\nResults written to: ${outDir}/`);
}

main().catch((err) => {
  console.error('Experiment failed:', err);
  process.exit(1);
});
