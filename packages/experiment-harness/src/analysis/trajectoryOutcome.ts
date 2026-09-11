/**
 * Long-horizon trajectory outcome classifier — `trajectory-outcome-v2`
 * (docs/Phase 0B Pilot Report.md §16, precommitted in commit 7c60f3d).
 *
 * Replaces, for scientific interpretation, the v1 rule in `outcome.ts`
 * (peak population >= 200 => RUNAWAY_POPULATION), which cannot separate
 * unbounded growth from a high but bounded plateau. v1 is NOT modified: every
 * historical `outcome` stays a v1 label, and this module writes its own labels.
 *
 * Pure and deterministic: a function of a run's termination record and its
 * persisted 200-tick population samples. No RNG, no simulation, no I/O. Food
 * and birth/death figures are carried as observational context only and never
 * influence the class. Every constant below is fixed by §16.3 and must not be
 * tuned.
 */

export const TRAJECTORY_CLASSIFIER_VERSION = 'trajectory-outcome-v2';
/** The v1 rule, for labelling historical classifications. */
export const PEAK_CAP_CLASSIFIER_VERSION = 'peak-cap-outcome-v1';

export const TRAJECTORY_HORIZON = 20000;
/** Terminal window is ticks (14000, 20000]; halves (14000, 17000] and (17000, 20000]. */
export const TRAJECTORY_WINDOW_START = 14000;
export const TRAJECTORY_HALF_BOUNDARY = 17000;
export const TRAJECTORY_MIN_SAMPLES_PER_HALF = 10;
/** 2^(3000/20000): at this rate the population would double within one more horizon. */
export const TRAJECTORY_GROWTH_THRESHOLD = Math.pow(2, 3000 / 20000);
/** The mirror image: the population would halve within one more horizon. */
export const TRAJECTORY_SHRINK_THRESHOLD = 1 / TRAJECTORY_GROWTH_THRESHOLD;
/** Descriptive level marker only (the old cap value); splits HIGH_BOUNDED from BOUNDED_VIABLE. */
export const TRAJECTORY_HIGH_BOUNDED_LEVEL = 200;
/** Diagnostic execution safety ceiling (§15.5) for the default ecology. */
export const TRAJECTORY_SAFETY_CEILING = 1000;

export type TrajectoryClass = 'EXTINCTION' | 'BOUNDED_VIABLE' | 'HIGH_BOUNDED' | 'RUNAWAY' | 'INCONCLUSIVE';

export type TrajectoryReason =
  | 'EXTINCT'
  | 'ERROR'
  | 'SAFETY_CEILING'
  | 'TRUNCATED'
  | 'INSUFFICIENT_SAMPLES'
  | 'GROWING_AT_HORIZON'
  | 'DECLINING'
  | 'PLATEAU';

export interface TrajectorySample {
  tick: number;
  population: number;
  /** Observational context only. */
  foodCount?: number;
  birthsCumulative?: number;
  deathsCumulative?: number;
}

export interface TrajectoryInput {
  /** As recorded by the runner: MAX_TICKS | EXTINCTION | RUNAWAY_POPULATION | SAFETY_CEILING | ERROR. */
  terminationReason: string;
  endTick: number;
  endingPopulation: number;
  peakPopulation: number;
  samples: readonly TrajectorySample[];
}

export interface TrajectoryClassification {
  classifierVersion: string;
  outcome: TrajectoryClass;
  reason: TrajectoryReason;
  finalTick: number;
  peakPopulation: number;
  finalPopulation: number;
  safetyCeilingReached: boolean;
  earlySampleCount: number;
  lateSampleCount: number;
  earlyMean: number | null;
  lateMean: number | null;
  /** Mean over every sample in the full terminal window (14000, 20000]. */
  windowMean: number | null;
  growthRatio: number | null;
  windowMinPopulation: number | null;
  windowMaxPopulation: number | null;
  /** Observational context — never used for classification. */
  windowMeanFood: number | null;
  windowBirths: number | null;
  windowDeaths: number | null;
  /** peak >= 200: what the v1 rule would call runaway. Annotation only. */
  v1WouldBeRunaway: boolean;
}

const mean = (xs: readonly number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((s, x) => s + x, 0) / xs.length;

/** Steps 6–8 of §16.4 for a run that reached the horizon with enough samples. */
export function classifyByGrowthRatio(
  growthRatio: number, windowMean: number
): { outcome: TrajectoryClass; reason: TrajectoryReason } {
  if (growthRatio >= TRAJECTORY_GROWTH_THRESHOLD) return { outcome: 'RUNAWAY', reason: 'GROWING_AT_HORIZON' };
  if (growthRatio <= TRAJECTORY_SHRINK_THRESHOLD) return { outcome: 'INCONCLUSIVE', reason: 'DECLINING' };
  return {
    outcome: windowMean >= TRAJECTORY_HIGH_BOUNDED_LEVEL ? 'HIGH_BOUNDED' : 'BOUNDED_VIABLE',
    reason: 'PLATEAU',
  };
}

/** §16.4, evaluated in order. */
export function classifyTrajectory(input: TrajectoryInput): TrajectoryClassification {
  const samples = [...input.samples].sort((a, b) => a.tick - b.tick);
  const window = samples.filter(s => s.tick > TRAJECTORY_WINDOW_START && s.tick <= TRAJECTORY_HORIZON);
  const early = window.filter(s => s.tick <= TRAJECTORY_HALF_BOUNDARY);
  const late = window.filter(s => s.tick > TRAJECTORY_HALF_BOUNDARY);

  const earlyMean = mean(early.map(s => s.population));
  const lateMean = mean(late.map(s => s.population));
  const windowMean = mean(window.map(s => s.population));
  const growthRatio = earlyMean !== null && lateMean !== null && earlyMean > 0 ? lateMean / earlyMean : null;

  const foods = window.map(s => s.foodCount).filter((x): x is number => typeof x === 'number');
  const first = window[0];
  const last = window[window.length - 1];
  // Births/deaths over the window: cumulative at its last sample minus at the sample just before it.
  const before = samples.filter(s => s.tick <= TRAJECTORY_WINDOW_START).pop();
  const delta = (k: 'birthsCumulative' | 'deathsCumulative'): number | null =>
    last && before && typeof last[k] === 'number' && typeof before[k] === 'number'
      ? (last[k] as number) - (before[k] as number) : null;

  const safetyCeilingReached =
    input.terminationReason === 'SAFETY_CEILING' || input.peakPopulation >= TRAJECTORY_SAFETY_CEILING;
  const extinct =
    input.terminationReason === 'EXTINCTION' || input.endingPopulation === 0 || samples.some(s => s.population === 0);

  let outcome: TrajectoryClass;
  let reason: TrajectoryReason;
  if (input.terminationReason === 'ERROR') {
    outcome = 'INCONCLUSIVE'; reason = 'ERROR';
  } else if (extinct) {
    outcome = 'EXTINCTION'; reason = 'EXTINCT';
  } else if (safetyCeilingReached) {
    outcome = 'RUNAWAY'; reason = 'SAFETY_CEILING';
  } else if (input.endTick < TRAJECTORY_HORIZON) {
    outcome = 'INCONCLUSIVE'; reason = 'TRUNCATED';
  } else if (early.length < TRAJECTORY_MIN_SAMPLES_PER_HALF || late.length < TRAJECTORY_MIN_SAMPLES_PER_HALF
    || growthRatio === null || windowMean === null) {
    outcome = 'INCONCLUSIVE'; reason = 'INSUFFICIENT_SAMPLES';
  } else {
    ({ outcome, reason } = classifyByGrowthRatio(growthRatio, windowMean));
  }

  return {
    classifierVersion: TRAJECTORY_CLASSIFIER_VERSION,
    outcome,
    reason,
    finalTick: input.endTick,
    peakPopulation: input.peakPopulation,
    finalPopulation: input.endingPopulation,
    safetyCeilingReached,
    earlySampleCount: early.length,
    lateSampleCount: late.length,
    earlyMean,
    lateMean,
    windowMean,
    growthRatio,
    windowMinPopulation: window.length ? Math.min(...window.map(s => s.population)) : null,
    windowMaxPopulation: window.length ? Math.max(...window.map(s => s.population)) : null,
    windowMeanFood: mean(foods),
    windowBirths: first ? delta('birthsCumulative') : null,
    windowDeaths: first ? delta('deathsCumulative') : null,
    v1WouldBeRunaway: input.peakPopulation >= 200,
  };
}
