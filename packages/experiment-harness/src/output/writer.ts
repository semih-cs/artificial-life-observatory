/**
 * Output serialization — JSON and CSV for experiment results.
 *
 * Large generated result directories should be gitignored.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ExperimentResult, ReplicateResult, ConditionSummary, TimeseriesRow } from '../types.js';

export function writeExperimentResults(result: ExperimentResult, outputDir: string): void {
  fs.mkdirSync(outputDir, { recursive: true });

  // Manifest
  const manifest = {
    experimentId: result.experimentId,
    conditionCount: result.conditions.length,
    replicateCount: result.replicates.length,
    conditions: result.conditions.map(c => c.conditionId),
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Condition summaries
  fs.writeFileSync(path.join(outputDir, 'condition-summary.json'), JSON.stringify(result.conditions, null, 2));
  writeConditionSummaryCSV(result.conditions, path.join(outputDir, 'condition-summary.csv'));

  // Replicate summaries (without timeseries)
  const replicateSummaries = result.replicates.map(r => ({
    ...r.provenance,
    startTick: r.startTick,
    endTick: r.endTick,
    terminationReason: r.terminationReason,
    extinctionTick: r.extinctionTick,
    finalStateHash: r.finalStateHash,
    startingPopulation: r.startingPopulation,
    endingPopulation: r.endingPopulation,
    totalBirths: r.totalBirths,
    totalDeaths: r.totalDeaths,
    endingFoodCount: r.endingFoodCount,
    peakPopulation: r.peakPopulation,
    runawayCap: r.runawayCap,
    outcome: r.outcome,
    maxGenerationDepth: r.maxGenerationDepth,
    activeLineageCount: r.activeLineageCount,
    wallClockMs: r.wallClockMs,
    error: r.error,
  }));
  fs.writeFileSync(path.join(outputDir, 'replicates.json'), JSON.stringify(replicateSummaries, null, 2));
  writeReplicatesCSV(replicateSummaries, path.join(outputDir, 'replicates.csv'));

  // Timeseries: one CSV per condition
  for (const condition of result.conditions) {
    const condReplicates = result.replicates.filter(r => r.provenance.conditionId === condition.conditionId);
    if (condReplicates.length > 0 && condReplicates.some(r => r.timeseries.length > 0)) {
      writeTimeseriesCSV(condReplicates, path.join(outputDir, `timeseries-${condition.conditionId}.csv`));
    }
  }
}

function writeConditionSummaryCSV(summaries: ConditionSummary[], filePath: string): void {
  const headers = [
    'conditionId', 'replicateCount', 'extinctionCount', 'extinctionRate',
    'runawayCount', 'viableCompletionCount', 'viableCompletionRate',
    'medianExtinctionTick', 'meanFinalPopulation', 'medianFinalPopulation',
    'totalBirths', 'totalDeaths', 'maxGenerationDepth', 'meanMaxGenerationDepth',
    'meanActiveLineageCount', 'meanMorphSizeVariance', 'meanNeuralParamVariance',
    'meanReproductiveFraction',
  ];
  const lines = [headers.join(',')];
  for (const s of summaries) {
    lines.push([
      s.conditionId, s.replicateCount, s.extinctionCount, s.extinctionRate.toFixed(4),
      s.runawayCount, s.viableCompletionCount, s.viableCompletionRate.toFixed(4),
      s.medianExtinctionTick ?? '', s.meanFinalPopulation.toFixed(2), s.medianFinalPopulation.toFixed(2),
      s.totalBirths, s.totalDeaths, s.maxGenerationDepth, s.meanMaxGenerationDepth.toFixed(2),
      s.meanActiveLineageCount.toFixed(2), s.meanMorphSizeVariance.toFixed(6),
      s.meanNeuralParamVariance.toFixed(6), s.meanReproductiveFraction.toFixed(4),
    ].join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
}

function writeReplicatesCSV(replicates: Record<string, unknown>[], filePath: string): void {
  if (replicates.length === 0) return;
  const headers = Object.keys(replicates[0]!);
  const lines = [headers.join(',')];
  for (const r of replicates) {
    lines.push(headers.map(h => {
      const v = (r as Record<string, unknown>)[h];
      return v === null || v === undefined ? '' : String(v);
    }).join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
}

function writeTimeseriesCSV(replicates: ReplicateResult[], filePath: string): void {
  const headers = ['conditionId', 'seed', ...Object.keys({} as TimeseriesRow)];
  // Use first replicate's first row to get actual header keys
  const firstRow = replicates[0]?.timeseries[0];
  if (!firstRow) return;
  const tsHeaders = Object.keys(firstRow);
  const allHeaders = ['conditionId', 'seed', ...tsHeaders];
  const lines = [allHeaders.join(',')];
  for (const r of replicates) {
    for (const row of r.timeseries) {
      const values = [
        r.provenance.conditionId,
        String(r.provenance.seed),
        ...tsHeaders.map(h => String((row as unknown as Record<string, unknown>)[h] ?? '')),
      ];
      lines.push(values.join(','));
    }
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
}

/**
 * Rebuild a sweep's `sweep-summary.json` from the per-configuration directories
 * already on disk.
 *
 * A sweep can be executed in chunks (see the CLI's --sweep-configs), so the
 * summary must be derivable from whatever has been written rather than only
 * from one in-memory run. Parameter values are recovered from the directory
 * name, which `generateSweepConfigurations` builds as
 * `sweep_<index>_<param>=<value>_...`.
 */
export function writeSweepSummaryFromDisk(
  outputDir: string,
  passes: (summary: ConditionSummary) => boolean
): number {
  const entries = fs.readdirSync(outputDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('sweep_'))
    .map((e) => e.name)
    .sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));

  const rows: Record<string, unknown>[] = [];
  for (const name of entries) {
    const summaryPath = path.join(outputDir, name, 'condition-summary.json');
    if (!fs.existsSync(summaryPath)) continue;
    const summaries = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as ConditionSummary[];
    const summary = summaries[0];
    if (!summary) continue;

    const parameterValues: Record<string, number> = {};
    for (const part of name.split('_').slice(2)) {
      const eq = part.indexOf('=');
      if (eq > 0) parameterValues[part.slice(0, eq)] = Number(part.slice(eq + 1));
    }

    rows.push({ configId: name, ...parameterValues, ...summary, passesCriteria: passes(summary) });
  }

  fs.writeFileSync(path.join(outputDir, 'sweep-summary.json'), JSON.stringify(rows, null, 2));
  return rows.length;
}
