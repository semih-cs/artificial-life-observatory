/**
 * Early-establishment analysis (docs/Phase 0B Pilot Report.md §19,
 * precommitted in e5f368c). READ-ONLY and descriptive: pure functions over
 * persisted 200-tick samples. No simulation, no RNG, no composite score, and
 * any separating threshold is observational only — never a biological rule,
 * fitness score or selection criterion.
 */

export const EARLY_TICKS = [1000, 2000, 3000] as const;
export const EARLY_HORIZON = 3000;
/** Twice the founding population (25). */
export const EARLY_DOUBLING_LEVEL = 50;

export interface EarlySample {
  tick: number;
  population: number;
  birthsCumulative: number;
  meanEnergy: number;
}

export interface EarlyRecord {
  seed: number;
  population: Record<number, number>;
  births: Record<number, number>;
  /** null when the sample has no organisms (population 0). */
  meanEnergy: Record<number, number | null>;
  minPopulation: number;
  maxPopulation: number;
  firstTickAtDoubling: number | null;
  firstTickWithBirth: number | null;
}

export function earlyRecord(seed: number, samples: readonly EarlySample[]): EarlyRecord {
  const s = [...samples].filter(x => x.tick <= EARLY_HORIZON).sort((a, b) => a.tick - b.tick);
  const at = (tick: number): EarlySample => {
    const row = s.find(x => x.tick === tick);
    if (!row) throw new Error(`seed ${seed}: no sample at tick ${tick}`);
    return row;
  };
  const population: Record<number, number> = {};
  const births: Record<number, number> = {};
  const meanEnergy: Record<number, number | null> = {};
  for (const t of EARLY_TICKS) {
    const r = at(t);
    population[t] = r.population;
    births[t] = r.birthsCumulative;
    meanEnergy[t] = r.population > 0 ? r.meanEnergy : null;
  }
  const pops = s.map(x => x.population);
  return {
    seed,
    population,
    births,
    meanEnergy,
    minPopulation: Math.min(...pops),
    maxPopulation: Math.max(...pops),
    firstTickAtDoubling: s.find(x => x.population >= EARLY_DOUBLING_LEVEL)?.tick ?? null,
    firstTickWithBirth: s.find(x => x.birthsCumulative > 0)?.tick ?? null,
  };
}

export interface GroupStat { n: number; median: number | null; min: number | null; max: number | null }

export function groupStat(values: readonly (number | null)[]): GroupStat {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (v.length === 0) return { n: 0, median: null, min: null, max: null };
  const median = v.length % 2 ? v[(v.length - 1) / 2]! : (v[v.length / 2 - 1]! + v[v.length / 2]!) / 2;
  return { n: v.length, median, min: v[0]!, max: v[v.length - 1]! };
}

export interface BestCut {
  /** Seeds with a value (n/a excluded). */
  n: number;
  misclassified: number;
  /** Threshold t and direction: group E is predicted when value <= t ('E_low') or value >= t ('E_high'). */
  threshold: number | null;
  direction: 'E_low' | 'E_high' | null;
  rangesOverlap: boolean;
}

/**
 * §19.5 best single cut: the threshold, in either direction, that misclassifies
 * the fewest seeds. Candidate thresholds are the observed values themselves.
 */
export function bestSingleCut(e: readonly (number | null)[], s: readonly (number | null)[]): BestCut {
  const E = e.filter((x): x is number => x !== null);
  const S = s.filter((x): x is number => x !== null);
  const n = E.length + S.length;
  if (E.length === 0 || S.length === 0) return { n, misclassified: 0, threshold: null, direction: null, rangesOverlap: false };
  const candidates = [...new Set([...E, ...S])].sort((a, b) => a - b);
  let best: BestCut = { n, misclassified: n + 1, threshold: null, direction: null, rangesOverlap: true };
  for (const t of candidates) {
    const low = E.filter(x => x > t).length + S.filter(x => x <= t).length;   // E predicted when <= t
    const high = E.filter(x => x < t).length + S.filter(x => x >= t).length;  // E predicted when >= t
    if (low < best.misclassified) best = { ...best, misclassified: low, threshold: t, direction: 'E_low' };
    if (high < best.misclassified) best = { ...best, misclassified: high, threshold: t, direction: 'E_high' };
  }
  const overlap = !(Math.max(...E) < Math.min(...S) || Math.max(...S) < Math.min(...E));
  return { ...best, rangesOverlap: overlap };
}

export type Separation = 'CLEAR' | 'PARTIAL' | 'NONE';

/** §19.5, applied to the three tick-3000 fields. */
export function separation(cuts: readonly BestCut[]): Separation {
  if (cuts.some(c => !c.rangesOverlap && c.misclassified === 0)) return 'CLEAR';
  if (cuts.some(c => c.misclassified <= 3)) return 'PARTIAL';
  return 'NONE';
}
