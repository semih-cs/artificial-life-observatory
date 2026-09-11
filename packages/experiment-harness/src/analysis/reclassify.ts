/**
 * Read-only reclassification of PERSISTED runs under `trajectory-outcome-v2`
 * (pilot report §16). Runs nothing, consumes no seeds, never writes to a source
 * directory. Only runs whose persisted trajectory is complete enough for the
 * classifier are reclassified; nothing missing is reconstructed or inferred.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  classifyTrajectory, TrajectoryClassification, TrajectoryClass, TrajectorySample,
  TRAJECTORY_HORIZON, TRAJECTORY_CLASSIFIER_VERSION, PEAK_CAP_CLASSIFIER_VERSION,
} from './trajectoryOutcome.js';
import { BASELINE_MIN_VIABLE_COMPLETION_RATE } from './outcome.js';

export interface PersistedRun {
  sourceDirectory: string;
  timeseriesFile: string | null;
  experimentId: string;
  conditionId: string;
  seed: number;
  simulationVersion: string;
  configHash: string;
  maxTicks: number;
  gitCommit: string | null;
  gitDirty: boolean | null;
  sourceIdentity: string | null;
  runTimestamp: string | null;
  terminationReason: string;
  endTick: number;
  endingPopulation: number;
  peakPopulation: number;
  totalBirths: number;
  /** Existing replicate field: deepest generation among organisms alive at run end. */
  maxGenerationDepth: number;
  /** The label recorded at run time by the v1 rule. Never modified. */
  v1Outcome: string;
  samples: TrajectorySample[];
}

function parseTimeseries(csvPath: string): Map<string, TrajectorySample[]> {
  const out = new Map<string, TrajectorySample[]>();
  const lines = fs.readFileSync(csvPath, 'utf-8').split('\n');
  const header = (lines[0] ?? '').split(',');
  const col = (name: string) => header.indexOf(name);
  const [c, s, t, p, f, b, d] = ['conditionId', 'seed', 'tick', 'population', 'foodCount', 'birthsCumulative', 'deathsCumulative'].map(col);
  if (s! < 0 || t! < 0 || p! < 0) return out;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = line.split(',');
    const key = `${c! >= 0 ? cells[c!] : ''}|${cells[s!]}`;
    const sample: TrajectorySample = {
      tick: Number(cells[t!]),
      population: Number(cells[p!]),
      ...(f! >= 0 ? { foodCount: Number(cells[f!]) } : {}),
      ...(b! >= 0 ? { birthsCumulative: Number(cells[b!]) } : {}),
      ...(d! >= 0 ? { deathsCumulative: Number(cells[d!]) } : {}),
    };
    const bucket = out.get(key);
    if (bucket) bucket.push(sample); else out.set(key, [sample]);
  }
  return out;
}

/** Read one directory in the `writeExperimentResults` layout. Read-only. */
export function readPersistedRuns(directory: string): PersistedRun[] {
  const raw = JSON.parse(fs.readFileSync(path.join(directory, 'replicates.json'), 'utf-8')) as Record<string, unknown>[];
  const series = new Map<string, { file: string; rows: Map<string, TrajectorySample[]> }>();
  for (const name of fs.readdirSync(directory)) {
    if (name.startsWith('timeseries-') && name.endsWith('.csv')) {
      series.set(name.slice('timeseries-'.length, -'.csv'.length), { file: name, rows: parseTimeseries(path.join(directory, name)) });
    }
  }
  return raw.map((e) => {
    const conditionId = String(e['conditionId']);
    const seed = Number(e['seed']);
    const ts = series.get(conditionId);
    const samples = ts?.rows.get(`${conditionId}|${seed}`) ?? [];
    return {
      sourceDirectory: directory,
      timeseriesFile: ts ? ts.file : null,
      experimentId: String(e['experimentId']),
      conditionId,
      seed,
      simulationVersion: String(e['simulationVersion']),
      configHash: String(e['configHash']),
      maxTicks: Number(e['maxTicks']),
      gitCommit: (e['gitCommit'] as string | null) ?? null,
      gitDirty: (e['gitDirty'] as boolean | null | undefined) ?? null,
      sourceIdentity: (e['sourceIdentity'] as string | null | undefined) ?? null,
      runTimestamp: (e['timestamp'] as string | null | undefined) ?? null,
      terminationReason: String(e['terminationReason']),
      endTick: Number(e['endTick']),
      endingPopulation: Number(e['endingPopulation']),
      peakPopulation: Number.isFinite(Number(e['peakPopulation']))
        ? Number(e['peakPopulation'])
        : Math.max(0, ...samples.map(x => x.population)),
      totalBirths: Number(e['totalBirths']),
      maxGenerationDepth: Number(e['maxGenerationDepth']),
      v1Outcome: String(e['outcome']),
      samples,
    };
  });
}

/** Every directory under `root` (depth <= 2) that holds a replicates.json. */
export function listPersistedExperimentDirectories(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (fs.existsSync(path.join(dir, 'replicates.json'))) out.push(dir);
    if (depth >= 2) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) visit(path.join(dir, e.name), depth + 1);
    }
  };
  visit(root, 0);
  return out.sort();
}

export type IneligibleReason = 'HORIZON_NOT_20000' | 'NO_TIMESERIES' | 'STOPPED_BY_V1_CAP' | 'OTHER_EARLY_STOP';

/**
 * Sufficient data = the persisted trajectory is complete for the classifier:
 * the run went extinct, reached the safety ceiling, or reached 20,000 ticks,
 * on a 20,000-tick horizon, with a persisted timeseries. A run stopped by the
 * v1 cap has no trajectory beyond 200 and is NOT reclassified.
 */
export function eligibility(run: PersistedRun): { eligible: true } | { eligible: false; reason: IneligibleReason } {
  if (run.maxTicks !== TRAJECTORY_HORIZON) return { eligible: false, reason: 'HORIZON_NOT_20000' };
  if (run.samples.length === 0) return { eligible: false, reason: 'NO_TIMESERIES' };
  if (run.terminationReason === 'EXTINCTION' || run.terminationReason === 'SAFETY_CEILING') return { eligible: true };
  if (run.terminationReason === 'MAX_TICKS' && run.endTick >= TRAJECTORY_HORIZON) return { eligible: true };
  if (run.terminationReason === 'RUNAWAY_POPULATION') return { eligible: false, reason: 'STOPPED_BY_V1_CAP' };
  return { eligible: false, reason: 'OTHER_EARLY_STOP' };
}

export interface ReclassifiedRun {
  seed: number;
  simulationVersion: string;
  experimentId: string;
  conditionId: string;
  eligible: boolean;
  ineligibleReason: IneligibleReason | null;
  /** null when ineligible — no class is inferred for missing data. */
  classification: TrajectoryClassification | null;
  v1ClassifierVersion: string;
  v1Outcome: string;
  totalBirths: number;
  maxGenerationDepth: number;
  source: {
    directory: string; timeseriesFile: string | null; gitCommit: string | null; gitDirty: boolean | null;
    sourceIdentity: string | null; configHash: string; runTimestamp: string | null; maxTicks: number;
    terminationReason: string;
  };
}

export function reclassifyRun(run: PersistedRun): ReclassifiedRun {
  const e = eligibility(run);
  return {
    seed: run.seed,
    simulationVersion: run.simulationVersion,
    experimentId: run.experimentId,
    conditionId: run.conditionId,
    eligible: e.eligible,
    ineligibleReason: e.eligible ? null : e.reason,
    classification: e.eligible ? classifyTrajectory(run) : null,
    v1ClassifierVersion: PEAK_CAP_CLASSIFIER_VERSION,
    v1Outcome: run.v1Outcome,
    totalBirths: run.totalBirths,
    maxGenerationDepth: run.maxGenerationDepth,
    source: {
      directory: run.sourceDirectory, timeseriesFile: run.timeseriesFile, gitCommit: run.gitCommit,
      gitDirty: run.gitDirty, sourceIdentity: run.sourceIdentity, configHash: run.configHash,
      runTimestamp: run.runTimestamp, maxTicks: run.maxTicks, terminationReason: run.terminationReason,
    },
  };
}

export type ClassCounts = Record<TrajectoryClass, number>;

export function countClasses(runs: readonly ReclassifiedRun[]): ClassCounts {
  const counts: ClassCounts = { EXTINCTION: 0, BOUNDED_VIABLE: 0, HIGH_BOUNDED: 0, RUNAWAY: 0, INCONCLUSIVE: 0 };
  for (const r of runs) if (r.classification) counts[r.classification.outcome]++;
  return counts;
}

export interface CohortSummary {
  cohortId: string;
  simulationVersion: string;
  size: number;
  eligible: number;
  missing: number;
  counts: ClassCounts;
  /** Complete = every seed of the cohort has an eligible trajectory. */
  complete: boolean;
  /** §16.7 gate statistic — ONLY for complete cohorts, else null. */
  boundedCompletionRate: number | null;
  /**
   * For incomplete cohorts: the range the rate could take under every possible
   * class of the missing runs. Not a rate and not a gate evaluation.
   */
  boundedCompletionRange: { min: number; max: number };
  gateThreshold: number;
  /** false when even max < threshold, i.e. no completion of the missing runs could pass. */
  gateReachable: boolean;
}

export function summarizeCohort(cohortId: string, runs: readonly ReclassifiedRun[]): CohortSummary {
  const eligibleRuns = runs.filter(r => r.eligible);
  const counts = countClasses(eligibleRuns);
  const bounded = counts.BOUNDED_VIABLE + counts.HIGH_BOUNDED;
  const size = runs.length;
  const missing = size - eligibleRuns.length;
  const versions = [...new Set(runs.map(r => r.simulationVersion))];
  if (versions.length !== 1) throw new Error(`cohort ${cohortId} mixes simulation versions: ${versions.join(', ')}`);
  const complete = missing === 0;
  const max = size === 0 ? 0 : (bounded + missing) / size;
  return {
    cohortId,
    simulationVersion: versions[0]!,
    size,
    eligible: eligibleRuns.length,
    missing,
    counts,
    complete,
    boundedCompletionRate: complete && size > 0 ? bounded / size : null,
    boundedCompletionRange: { min: size === 0 ? 0 : bounded / size, max },
    gateThreshold: BASELINE_MIN_VIABLE_COMPLETION_RATE,
    gateReachable: max >= BASELINE_MIN_VIABLE_COMPLETION_RATE,
  };
}

export interface CohortProfile {
  size: number;
  eligible: number;
  counts: ClassCounts;
  /** count / size for each class; null while any seed is missing. */
  rates: Record<TrajectoryClass, number> | null;
  boundedCompletionRate: number | null;
  meanFinalPopulation: number | null;
  medianFinalPopulation: number | null;
  meanBirths: number | null;
  maxGenerationDepth: number | null;
}

/** Descriptive profile of a cohort; every figure is null unless all seeds are eligible. */
export function cohortProfile(runs: readonly ReclassifiedRun[]): CohortProfile {
  const eligible = runs.filter(r => r.eligible && r.classification);
  const counts = countClasses(eligible);
  const size = runs.length;
  const complete = size > 0 && eligible.length === size;
  const finals = eligible.map(r => r.classification!.finalPopulation).sort((a, b) => a - b);
  const median = finals.length === 0 ? null
    : finals.length % 2 ? finals[(finals.length - 1) / 2]!
    : (finals[finals.length / 2 - 1]! + finals[finals.length / 2]!) / 2;
  const rates = complete
    ? (Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / size])) as Record<TrajectoryClass, number>)
    : null;
  return {
    size,
    eligible: eligible.length,
    counts,
    rates,
    boundedCompletionRate: complete ? (counts.BOUNDED_VIABLE + counts.HIGH_BOUNDED) / size : null,
    meanFinalPopulation: complete ? finals.reduce((s, x) => s + x, 0) / size : null,
    medianFinalPopulation: complete ? median : null,
    meanBirths: complete ? eligible.reduce((s, r) => s + r.totalBirths, 0) / size : null,
    maxGenerationDepth: complete ? Math.max(...eligible.map(r => r.maxGenerationDepth)) : null,
  };
}

export { TRAJECTORY_CLASSIFIER_VERSION };
