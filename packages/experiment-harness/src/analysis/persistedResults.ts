/**
 * Read-only reader for results already persisted on disk.
 *
 * Its purpose is to let calibration decisions be made from the authoritative
 * persisted CSV/JSON artefacts WITHOUT rerunning any experiment (AGENTS.md §9)
 * and without depending on chat or console transcripts.
 *
 * Persisted results produced before the §14.29 runaway cap existed do not
 * carry `peakPopulation`. It is recovered post hoc from the sampled timeseries
 * so those runs can be classified on the same footing as later ones. Because
 * the timeseries is sampled (not per-tick), a recovered peak is a LOWER BOUND
 * on the true peak: a run classified RUNAWAY_POPULATION from sampled data
 * genuinely crossed the cap, while a run classified viable might still have
 * crossed it between samples.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { classifyRunOutcome, runawayPopulationCap, RunOutcome, summarizeOutcomes, OutcomeCounts } from './outcome.js';

export interface PersistedReplicate {
  seed: number;
  conditionId: string;
  terminationReason: 'MAX_TICKS' | 'EXTINCTION' | 'RUNAWAY_POPULATION' | 'ERROR';
  extinctionTick: number | null;
  endTick: number;
  endingPopulation: number;
  totalBirths: number;
  maxGenerationDepth: number;
  /** From the persisted file when present, else recovered from the timeseries. */
  peakPopulation: number;
  peakPopulationSource: 'persisted' | 'recovered-from-timeseries';
  outcome: RunOutcome;
}

export interface PersistedCondition {
  directory: string;
  conditionId: string;
  replicates: PersistedReplicate[];
  outcomes: OutcomeCounts;
  runawayCap: number;
}

/** Peak population per seed, read out of a sampled timeseries CSV. */
function peaksFromTimeseries(csvPath: string): Map<number, number> {
  const peaks = new Map<number, number>();
  if (!fs.existsSync(csvPath)) return peaks;
  const lines = fs.readFileSync(csvPath, 'utf-8').split('\n');
  const header = (lines[0] ?? '').split(',');
  const seedIdx = header.indexOf('seed');
  const popIdx = header.indexOf('population');
  if (seedIdx < 0 || popIdx < 0) return peaks;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = line.split(',');
    const seed = Number(cells[seedIdx]);
    const population = Number(cells[popIdx]);
    if (!Number.isFinite(seed) || !Number.isFinite(population)) continue;
    const current = peaks.get(seed);
    if (current === undefined || population > current) peaks.set(seed, population);
  }
  return peaks;
}

/**
 * Read one persisted experiment directory (the layout written by
 * `writeExperimentResults`). `initialPopulationSize` determines the cap used
 * for classification and must match the configuration the runs used.
 */
export function readPersistedExperiment(directory: string, initialPopulationSize = 25): PersistedCondition[] {
  const replicatesPath = path.join(directory, 'replicates.json');
  const raw = JSON.parse(fs.readFileSync(replicatesPath, 'utf-8')) as Record<string, unknown>[];
  const cap = runawayPopulationCap(initialPopulationSize);

  const byCondition = new Map<string, PersistedReplicate[]>();

  for (const entry of raw) {
    const conditionId = String(entry['conditionId']);
    const seed = Number(entry['seed']);
    const terminationReason = String(entry['terminationReason']) as PersistedReplicate['terminationReason'];

    let peakPopulation = Number(entry['peakPopulation']);
    let peakPopulationSource: PersistedReplicate['peakPopulationSource'] = 'persisted';
    if (!Number.isFinite(peakPopulation)) {
      const peaks = peaksFromTimeseries(path.join(directory, `timeseries-${conditionId}.csv`));
      peakPopulation = peaks.get(seed) ?? Number(entry['endingPopulation']) ?? 0;
      peakPopulationSource = 'recovered-from-timeseries';
    }

    const replicate: PersistedReplicate = {
      seed,
      conditionId,
      terminationReason,
      extinctionTick: entry['extinctionTick'] === null || entry['extinctionTick'] === undefined
        ? null
        : Number(entry['extinctionTick']),
      endTick: Number(entry['endTick']),
      endingPopulation: Number(entry['endingPopulation']),
      totalBirths: Number(entry['totalBirths']),
      maxGenerationDepth: Number(entry['maxGenerationDepth']),
      peakPopulation,
      peakPopulationSource,
      outcome: classifyRunOutcome({ terminationReason, peakPopulation, runawayCap: cap }),
    };

    const bucket = byCondition.get(conditionId);
    if (bucket) bucket.push(replicate);
    else byCondition.set(conditionId, [replicate]);
  }

  return [...byCondition.entries()].map(([conditionId, replicates]) => ({
    directory,
    conditionId,
    replicates,
    outcomes: summarizeOutcomes(replicates.map((r) => r.outcome)),
    runawayCap: cap,
  }));
}

/** Read every `sweep_*` sub-directory of a persisted sweep, in index order. */
export function readPersistedSweep(sweepDirectory: string, initialPopulationSize = 25): PersistedCondition[] {
  const entries = fs.readdirSync(sweepDirectory, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('sweep_'))
    .map((e) => e.name)
    .sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));

  const out: PersistedCondition[] = [];
  for (const name of entries) {
    out.push(...readPersistedExperiment(path.join(sweepDirectory, name), initialPopulationSize));
  }
  return out;
}
