/**
 * Food-limitation diagnostic analysis (pilot report §15, precommitted).
 *
 * Everything here is OBSERVATIONAL. The flux recorder reads the world state
 * before and after each tick; the analysis functions are pure functions of the
 * recorded rows. None of it consumes RNG or writes to any world.
 */

import type { WorldState, TickTelemetry, FertilityField } from '@alo/simulation-core';
import type { TickObserver } from '../runner/replicate.js';

/** One row per tick, read from S_t, S_{t+1} and that tick's telemetry (§15.7). */
export interface FoodFluxRow {
  tick: number;
  population: number;
  foodCount: number;
  foodCapacityFraction: number;
  foodConsumed: number;
  foodRegenerated: number;
  births: number;
  deaths: number;
  meanEnergy: number;
}

export interface FoodFluxRecorder {
  readonly rows: FoodFluxRow[];
  /** Area-mean of the world's static fertility field; null until the first tick. */
  meanFertility(): number | null;
  /** Read-only tick observer to hand to runReplicate / runExperiment. */
  readonly observer: TickObserver;
}

/**
 * Area-mean of a bilinearly interpolated lattice: the mean over cells of each
 * cell's four-corner average. Equals the expected acceptance probability of one
 * uniformly placed regeneration attempt (§15.2).
 */
export function areaMeanFertility(field: FertilityField): number {
  const r = field.resolution;
  const n = r + 1;
  const L = field.lattice;
  let sum = 0;
  for (let y = 0; y < r; y++) {
    for (let x = 0; x < r; x++) {
      sum += (L[y * n + x]! + L[y * n + x + 1]! + L[(y + 1) * n + x]! + L[(y + 1) * n + x + 1]!) / 4;
    }
  }
  return sum / (r * r);
}

/**
 * Per-tick food-flux recorder (§15.7). `extra` lets the caller chain another
 * read-only observer (e.g. a hash checkpoint) onto the same tick callback.
 */
export function createFoodFluxRecorder(worldFoodCapacity: number, extra?: TickObserver): FoodFluxRecorder {
  const rows: FoodFluxRow[] = [];
  let fertility: number | null = null;

  const observer: TickObserver = (before: WorldState, after: WorldState, telemetry: TickTelemetry) => {
    if (fertility === null) fertility = areaMeanFertility(before.fertility);

    const afterIds = new Set<number>();
    for (const f of after.food) afterIds.add(f.id);
    let consumed = 0;
    for (const f of before.food) if (!afterIds.has(f.id)) consumed++;
    const regenerated = after.nextFoodId - before.nextFoodId;

    // Accounting identity: food leaves only by consumption and enters only by
    // regeneration. A violation means the measurement is wrong, so fail loudly.
    if (after.food.length !== before.food.length - consumed + regenerated) {
      throw new Error(`food accounting identity violated at tick ${after.tick}`);
    }
    if (after.food.length !== telemetry.totalFood) {
      throw new Error(`food count disagrees with telemetry at tick ${after.tick}`);
    }

    rows.push({
      tick: after.tick,
      population: telemetry.populationCount,
      foodCount: after.food.length,
      foodCapacityFraction: after.food.length / worldFoodCapacity,
      foodConsumed: consumed,
      foodRegenerated: regenerated,
      births: telemetry.births,
      deaths: telemetry.deaths,
      meanEnergy: telemetry.meanEnergy,
    });

    extra?.(before, after, telemetry);
  };

  return { rows, meanFertility: () => fertility, observer };
}

function assertContiguous(rows: readonly FoodFluxRow[]): void {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]!.tick !== i + 1) throw new Error(`flux rows are not contiguous from tick 1 (index ${i})`);
  }
}

/**
 * §15.8: first tick T >= window at which the mean post-tick food stock over
 * T-window+1..T is <= threshold. Null if never.
 */
export function scarcityOnsetTick(rows: readonly FoodFluxRow[], window: number, threshold: number): number | null {
  assertContiguous(rows);
  let sum = 0;
  for (let i = 0; i < rows.length; i++) {
    sum += rows[i]!.foodCount;
    if (i >= window) sum -= rows[i - window]!.foodCount;
    if (i >= window - 1 && sum / window <= threshold) return rows[i]!.tick;
  }
  return null;
}

/** First tick at which population >= level, or null. */
export function firstTickAtLeast(rows: readonly FoodFluxRow[], level: number): number | null {
  for (const r of rows) if (r.population >= level) return r.tick;
  return null;
}

export interface TrailingWindowStats {
  fromTick: number;
  toTick: number;
  meanFoodStock: number;
  foodConsumed: number;
  foodRegenerated: number;
  births: number;
  deaths: number;
  meanOfMeanEnergy: number;
  meanPopulation: number;
  /** consumed / (mean population x window length). */
  perCapitaIntake: number;
}

export function trailingWindow(rows: readonly FoodFluxRow[], tick: number, window: number): TrailingWindowStats {
  assertContiguous(rows);
  const to = tick;
  const from = Math.max(1, tick - window + 1);
  const slice = rows.slice(from - 1, to);
  const n = slice.length;
  const sum = (f: (r: FoodFluxRow) => number) => slice.reduce((s, r) => s + f(r), 0);
  const meanPopulation = sum(r => r.population) / n;
  const consumed = sum(r => r.foodConsumed);
  return {
    fromTick: from,
    toTick: to,
    meanFoodStock: sum(r => r.foodCount) / n,
    foodConsumed: consumed,
    foodRegenerated: sum(r => r.foodRegenerated),
    births: sum(r => r.births),
    deaths: sum(r => r.deaths),
    meanOfMeanEnergy: sum(r => r.meanEnergy) / n,
    meanPopulation,
    perCapitaIntake: meanPopulation > 0 ? consumed / (meanPopulation * n) : 0,
  };
}

export interface MilestoneRecord {
  level: number;
  tick: number | null;
  population?: number;
  foodCount?: number;
  foodCapacityFraction?: number;
  trailing?: TrailingWindowStats;
  scarce?: boolean;
}

export function milestoneRecords(
  rows: readonly FoodFluxRow[], levels: readonly number[], window: number, threshold: number
): MilestoneRecord[] {
  return levels.map((level) => {
    const tick = firstTickAtLeast(rows, level);
    if (tick === null) return { level, tick: null };
    const row = rows[tick - 1]!;
    const trailing = trailingWindow(rows, tick, window);
    return {
      level,
      tick,
      population: row.population,
      foodCount: row.foodCount,
      foodCapacityFraction: row.foodCapacityFraction,
      trailing,
      scarce: tick >= window && trailing.meanFoodStock <= threshold,
    };
  });
}

export type SeedClass = 'A' | 'B' | 'C';

/**
 * §15.9 per-decision-seed class:
 *   C - onset before t250, or onset at all when the population never reaches 250
 *   A - no onset before t250, onset later
 *   B - no onset at any tick up to the end of the run
 */
export function classifyDecisionSeed(onsetTick: number | null, t250: number | null): SeedClass {
  if (onsetTick === null) return 'B';
  if (t250 === null || onsetTick < t250) return 'C';
  return 'A';
}

export type FoodLimitationOutcome = 'A' | 'B' | 'C' | 'INCONCLUSIVE';

/** §15.9: the class held by at least 2 of the 3 decision seeds, else INCONCLUSIVE. */
export function majorityOutcome(classes: readonly SeedClass[]): { outcome: FoodLimitationOutcome; support: number } {
  if (classes.length !== 3) throw new Error('majorityOutcome expects exactly the 3 decision seeds');
  for (const c of ['A', 'B', 'C'] as const) {
    const support = classes.filter(x => x === c).length;
    if (support >= 2) return { outcome: c, support };
  }
  return { outcome: 'INCONCLUSIVE', support: 1 };
}
