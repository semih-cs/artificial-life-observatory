/**
 * Analytic predictions from the SPECIFIED energy model, and the measured drain
 * to compare them against (Spec v4 §12.6-§12.9, §16.8, §16.10).
 *
 * §16.10 requires the expected starvation duration to be estimated analytically
 * and the simulation result checked against it, because a large discrepancy
 * points at update-order bugs, double charging, wrong velocity units or
 * phenotype-mapping errors. This module writes that estimate down in code so
 * the check is executable rather than a paragraph in a report.
 *
 * The model, transcribed from simulation-core:
 *
 *     basalCost    = metabolism * baseMetabolicConstant          (biology/energy.ts)
 *     movementCost = movementCoefficient * size * v^2            (biology/movement.ts)
 *     v            = forwardOutput * phenotype.maxSpeed, after wall clamping
 *     drain        = basalCost + movementCost                    (per tick)
 *     lifetime     = initialEnergy / drain                       (no food input)
 *
 * The prediction is exact only when no wall clamping occurs, which is why the
 * diagnostic policies orbit a tiny polygon well away from the perimeter.
 */

import type { EnergyConfig, MorphologyGenome } from '@alo/simulation-core';
import type { TimeseriesRow } from '../types.js';

export interface DrainPrediction {
  /** Requested speed as a fraction of maxSpeed. */
  forwardFraction: number;
  /** Resolved velocity in world units per tick. */
  velocity: number;
  basalCost: number;
  movementCost: number;
  drainPerTick: number;
  /** Ticks until energy reaches zero from `initialEnergy`, no food input. */
  predictedLifetime: number;
}

export function predictDrain(
  morphology: Pick<MorphologyGenome, 'size' | 'maxSpeed' | 'metabolism'>,
  forwardFraction: number,
  energy: Pick<EnergyConfig,
    'baseMetabolicConstant' | 'movementEnergyCoefficient' | 'configuredInitialEnergy'>
): DrainPrediction {
  const velocity = forwardFraction * morphology.maxSpeed;
  const basalCost = morphology.metabolism * energy.baseMetabolicConstant;
  const movementCost = energy.movementEnergyCoefficient * morphology.size * velocity * velocity;
  const drainPerTick = basalCost + movementCost;
  return {
    forwardFraction,
    velocity,
    basalCost,
    movementCost,
    drainPerTick,
    predictedLifetime: drainPerTick > 0 ? energy.configuredInitialEnergy / drainPerTick : Infinity,
  };
}

/**
 * Invert the model: given a measured per-tick drain, what constant forward
 * fraction would produce it?
 *
 * This is what converts the reference (unmodified controller) condition into a
 * number directly comparable to the four fixed policies: "these controllers
 * spend energy like an X% speed agent". It is a descriptive summary of energy
 * expenditure, NOT a claim about what any individual organism requested — a
 * population mixing fast and slow movers yields the root-mean-square of their
 * speeds, not the mean.
 *
 * Returns null when the measured drain is below basal cost, which would mean
 * the measurement, not the model, is wrong.
 */
export function impliedForwardFraction(
  measuredDrainPerTick: number,
  morphology: Pick<MorphologyGenome, 'size' | 'maxSpeed' | 'metabolism'>,
  energy: Pick<EnergyConfig, 'baseMetabolicConstant' | 'movementEnergyCoefficient'>
): number | null {
  const basalCost = morphology.metabolism * energy.baseMetabolicConstant;
  const movementCost = measuredDrainPerTick - basalCost;
  if (movementCost < 0) return null;
  const velocitySquared = movementCost / (energy.movementEnergyCoefficient * morphology.size);
  return Math.sqrt(velocitySquared) / morphology.maxSpeed;
}

/**
 * Measured mean energy drain per tick over the window [0, atTick], read from a
 * replicate's sampled timeseries.
 *
 * The window must end before the first death, or the mean would be taken over
 * a changing set of organisms and would understate the drain. The caller picks
 * `atTick`; `measurementWindowIsClean` checks the population is unchanged.
 */
export function measuredDrainPerTick(timeseries: readonly TimeseriesRow[], atTick: number): number | null {
  const first = timeseries.find((r) => r.tick === 0);
  const last = timeseries.find((r) => r.tick === atTick);
  if (!first || !last || atTick <= 0) return null;
  return (first.meanEnergy - last.meanEnergy) / atTick;
}

/** True when no organism died anywhere in [0, atTick] — required for a clean drain read. */
export function measurementWindowIsClean(timeseries: readonly TimeseriesRow[], atTick: number): boolean {
  const rows = timeseries.filter((r) => r.tick <= atTick);
  if (rows.length === 0) return false;
  const initial = rows[0]!.population;
  return rows.every((r) => r.population === initial) && rows.some((r) => r.tick === atTick);
}

/**
 * Largest sampled tick t <= maxTick at which the population is still exactly
 * its initial size, i.e. the longest death-free window available for a clean
 * drain measurement. Returns 0 when even the first sample after tick 0 already
 * lost an organism.
 */
export function largestCleanWindow(timeseries: readonly TimeseriesRow[], maxTick: number): number {
  const rows = [...timeseries].filter((r) => r.tick <= maxTick).sort((a, b) => a.tick - b.tick);
  if (rows.length === 0) return 0;
  const initial = rows[0]!.population;
  let best = 0;
  for (const row of rows) {
    if (row.population !== initial) break;
    best = row.tick;
  }
  return best;
}
