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
 *   mutation-2x2            Primary 2×2 mutation factorial
 *   calibration-sweep       First calibration parameter sweep
 *   calibration-report      Re-read persisted sweep results from disk (runs nothing)
 *
 * Options:
 *   --seed-set <pilot|validation>   Seed set to use (default: pilot)
 *   --max-ticks <N>                 Maximum ticks per replicate
 *   --output <dir>                  Output directory (default: results/<experiment-id>)
 */

import {
  starvationDiagnostic,
  feedingDiagnostic,
  reproductionControlDiagnostic,
  fullEvolutionaryDiagnostic,
  mutation2x2Experiment,
} from '../experiments/definitions.js';
import { runExperiment } from '../runner/experiment.js';
import { runSweep, SweepSpec } from '../runner/sweep.js';
import { loadPilotSeeds, loadValidationSeeds } from '../runner/seeds.js';
import { writeExperimentResults } from '../output/writer.js';
import { detectDegeneracy, passesCalibrationCriteria, DEFAULT_CALIBRATION_CRITERIA } from '../analysis/degeneracy.js';
import { readPersistedSweep } from '../analysis/persistedResults.js';
import { BASELINE_MIN_VIABLE_COMPLETION_RATE } from '../analysis/outcome.js';
import type { ExperimentSpec, ExperimentResult, ReplicateResult } from '../types.js';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';

function getGitCommit(): string | null {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

const gitCommit = getGitCommit();

function parseArgs(): { experiment: string; seedSet: string; maxTicks?: number; outputDir?: string } {
  const args = process.argv.slice(2);
  let experiment = '';
  let seedSet = 'pilot';
  let maxTicks: number | undefined;
  let outputDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--seed-set' && args[i + 1]) {
      seedSet = args[++i]!;
    } else if (arg === '--max-ticks' && args[i + 1]) {
      maxTicks = parseInt(args[++i]!, 10);
    } else if (arg === '--output' && args[i + 1]) {
      outputDir = args[++i]!;
    } else if (!arg.startsWith('--')) {
      experiment = arg;
    }
  }

  return { experiment, seedSet, maxTicks, outputDir };
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

async function main(): Promise<void> {
  const { experiment, seedSet, maxTicks, outputDir } = parseArgs();

  if (!experiment) {
    console.log('Usage: npm run experiment -- <experiment-name> [--seed-set pilot|validation] [--max-ticks N]');
    console.log('\nExperiments: starvation, feeding, reproduction-control, full-evolutionary, mutation-2x2, calibration-sweep, calibration-report');
    process.exit(1);
  }

  // Reading persisted results consumes no seeds and runs nothing.
  if (experiment === 'calibration-report') {
    printCalibrationReport(outputDir ?? 'results/calibration-v1');
    return;
  }

  const seeds = loadSeeds(seedSet);
  console.log(`Seed set: ${seedSet} (${seeds.length} seeds)`);

  let spec: ExperimentSpec | null = null;
  let isSweep = false;

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
    case 'calibration-sweep':
      isSweep = true;
      break;
    default:
      console.error(`Unknown experiment: ${experiment}`);
      process.exit(1);
  }

  if (isSweep) {
    console.log('\nRunning calibration sweep...');
    const sweepSpec: SweepSpec = {
      sweepId: 'calibration-v1',
      description: 'Stage 1 energy/resource coarse sweep',
      parameters: [
        { path: 'food.regenAttemptsPerTick', values: [2, 4, 6] },
        { path: 'energy.foodEnergyValue', values: [25, 40] },
        { path: 'energy.reproductionCost', values: [35, 45] },
      ],
      seeds: seeds.slice(0, 8), // Use subset for coarse sweep
      maxTicks: maxTicks ?? 10000,
      metricsSampleInterval: 200,
    };

    const sweepResult = runSweep(sweepSpec, {
      gitCommit,
      onReplicateComplete: printProgress,
    });

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

    // Write summary
    const summaryData = sweepResult.results.map((r, i) => ({
      configId: sweepResult.configurations[i]!.configId,
      ...sweepResult.configurations[i]!.parameterValues,
      ...r.conditions[0]!,
      passesCriteria: passesCalibrationCriteria(r.conditions[0]!),
    }));
    fs.writeFileSync(`${outDir}/sweep-summary.json`, JSON.stringify(summaryData, null, 2));
    return;
  }

  if (!spec) return;

  console.log(`\nRunning: ${spec.experimentId}`);
  console.log(`  conditions: ${spec.conditions.length}`);
  console.log(`  seeds: ${spec.seeds.length}`);
  console.log(`  max ticks: ${spec.maxTicks}`);
  console.log(`  total replicates: ${spec.conditions.length * spec.seeds.length}\n`);

  const result = runExperiment(spec, {
    gitCommit,
    onReplicateComplete: printProgress,
  });

  printConditionSummary(result);

  const outDir = outputDir ?? `results/${result.experimentId}`;
  writeExperimentResults(result, outDir);
  console.log(`\nResults written to: ${outDir}/`);
}

main().catch((err) => {
  console.error('Experiment failed:', err);
  process.exit(1);
});
