/**
 * Run-outcome classification, including the test-only runaway cap
 * (Spec v4 §14.29 [LOCKED], §12.55, §16.34–§16.35).
 *
 *   runawayCap = min(8 x initialPopulation, 200)
 *
 * This cap exists ONLY in experimental execution. It is not a canonical
 * biological rule: the simulation never suppresses births because of it. It
 * bounds pathological calibration runs and gives runaway growth a named
 * outcome instead of letting it hide inside a large "surviving" population.
 *
 * §16.34: a run terminating early is still experimental data and must not
 * disappear from analysis. §16.35: ecological viability is initially assessed
 * as the fraction of runs reaching the target horizon WITHOUT extinction and
 * WITHOUT runaway termination.
 */

export const RUNAWAY_CAP_MULTIPLIER = 8;
export const RUNAWAY_CAP_ABSOLUTE = 200;

export function runawayPopulationCap(initialPopulationSize: number): number {
  return Math.min(RUNAWAY_CAP_MULTIPLIER * initialPopulationSize, RUNAWAY_CAP_ABSOLUTE);
}

export type RunOutcome =
  | 'WORLD_EXTINCT'
  | 'RUNAWAY_POPULATION'
  | 'VIABLE_COMPLETION'
  | 'ERROR';

export interface OutcomeInput {
  /**
   * `SAFETY_CEILING` (pilot report §15.5) is accepted for type completeness
   * only. The classification rules below are unchanged: a ceiling run always
   * has peak >= ceiling > runawayCap, so it falls under the existing peak rule.
   */
  terminationReason: 'MAX_TICKS' | 'EXTINCTION' | 'RUNAWAY_POPULATION' | 'SAFETY_CEILING' | 'ERROR';
  /** Highest population observed at any sampled point in the run. */
  peakPopulation: number;
  /** Cap in force for this run (see runawayPopulationCap). */
  runawayCap: number;
}

/**
 * Classify one replicate.
 *
 * `peakPopulation` is used rather than the final population so that a run
 * which exploded and then crashed back down is still recorded as a runaway
 * regime. This also allows results produced BEFORE cap enforcement existed to
 * be reclassified post hoc from their persisted timeseries, without rerunning
 * them.
 */
export function classifyRunOutcome(input: OutcomeInput): RunOutcome {
  if (input.terminationReason === 'ERROR') return 'ERROR';
  if (input.terminationReason === 'RUNAWAY_POPULATION') return 'RUNAWAY_POPULATION';
  if (input.peakPopulation >= input.runawayCap) return 'RUNAWAY_POPULATION';
  if (input.terminationReason === 'EXTINCTION') return 'WORLD_EXTINCT';
  return 'VIABLE_COMPLETION';
}

export interface OutcomeCounts {
  total: number;
  extinct: number;
  runaway: number;
  viable: number;
  error: number;
  /** §16.35 viable completion rate: viable / total. */
  viableCompletionRate: number;
}

export function summarizeOutcomes(outcomes: readonly RunOutcome[]): OutcomeCounts {
  const total = outcomes.length;
  let extinct = 0, runaway = 0, viable = 0, error = 0;
  for (const o of outcomes) {
    if (o === 'WORLD_EXTINCT') extinct++;
    else if (o === 'RUNAWAY_POPULATION') runaway++;
    else if (o === 'VIABLE_COMPLETION') viable++;
    else error++;
  }
  return {
    total,
    extinct,
    runaway,
    viable,
    error,
    viableCompletionRate: total === 0 ? 0 : viable / total,
  };
}

/**
 * §16.35 [BASELINE] project gate placeholder: approximately 70% or more of
 * runs should reach the target horizon without extinction or runaway
 * termination. This is a project gate, not a scientific constant.
 */
export const BASELINE_MIN_VIABLE_COMPLETION_RATE = 0.7;
