/**
 * Metrics computation — harness-side observation of WorldState snapshots.
 *
 * These functions read simulation state but never modify it, consume no
 * canonical RNG, and cannot affect simulation outcomes. They are purely
 * analytical.
 */

import type { WorldState, OrganismRuntimeState } from '@alo/simulation-core';
import type { TimeseriesRow } from '../types.js';

/** Numerically stable online variance (Welford's algorithm). */
function meanAndVariance(values: number[]): { mean: number; variance: number } {
  if (values.length === 0) return { mean: 0, variance: 0 };
  let mean = 0;
  let m2 = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    const delta = v - mean;
    mean += delta / (i + 1);
    m2 += delta * (v - mean);
  }
  return { mean, variance: values.length > 1 ? m2 / values.length : 0 };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function computeTimeseriesRow(
  world: WorldState,
  cumulativeBirths: number,
  cumulativeDeaths: number,
  organismsEverReproduced: Set<number>,
  totalOrganismsEver: number
): TimeseriesRow {
  const living = world.organisms.filter(o => o.alive);
  const energies = living.map(o => o.energy);
  const ages = living.map(o => o.age);

  // Morphology
  const sizes = living.map(o => o.genome.morphology.size);
  const speeds = living.map(o => o.genome.morphology.maxSpeed);
  const visionRanges = living.map(o => o.genome.morphology.visionRange);
  const visionAngles = living.map(o => o.genome.morphology.visionAngle);
  const metabolisms = living.map(o => o.genome.morphology.metabolism);

  const sizeStats = meanAndVariance(sizes);
  const speedStats = meanAndVariance(speeds);
  const vrStats = meanAndVariance(visionRanges);
  const vaStats = meanAndVariance(visionAngles);
  const metStats = meanAndVariance(metabolisms);

  // Neural: flatten all parameters for summary stats
  const allNeural: number[] = [];
  for (const o of living) {
    const n = o.genome.neural;
    for (const v of n.inputHiddenWeights) allNeural.push(v);
    for (const v of n.hiddenBiases) allNeural.push(v);
    for (const v of n.hiddenOutputWeights) allNeural.push(v);
    for (const v of n.outputBiases) allNeural.push(v);
  }
  const neuralStats = meanAndVariance(allNeural);

  // Lineage
  const lineageRoots = new Set<number>();
  let maxGen = 0;
  for (const o of living) {
    lineageRoots.add(o.lineageRootId);
    if (o.generationDepth > maxGen) maxGen = o.generationDepth;
  }

  return {
    tick: world.tick,
    population: living.length,
    foodCount: world.food.length,
    birthsCumulative: cumulativeBirths,
    deathsCumulative: cumulativeDeaths,
    meanEnergy: energies.length > 0 ? energies.reduce((a, b) => a + b, 0) / energies.length : 0,
    medianEnergy: median(energies),
    minEnergy: energies.length > 0 ? Math.min(...energies) : 0,
    maxEnergy: energies.length > 0 ? Math.max(...energies) : 0,
    meanAge: ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0,
    maxGenerationDepth: maxGen,
    activeLineageCount: lineageRoots.size,
    meanSize: sizeStats.mean,
    varSize: sizeStats.variance,
    meanMaxSpeed: speedStats.mean,
    varMaxSpeed: speedStats.variance,
    meanVisionRange: vrStats.mean,
    varVisionRange: vrStats.variance,
    meanVisionAngle: vaStats.mean,
    varVisionAngle: vaStats.variance,
    meanMetabolism: metStats.mean,
    varMetabolism: metStats.variance,
    neuralMeanParamValue: neuralStats.mean,
    neuralParamVariance: neuralStats.variance,
    fractionEverReproduced: totalOrganismsEver > 0 ? organismsEverReproduced.size / totalOrganismsEver : 0,
  };
}

/** Compute max generation depth from a list of organisms. */
export function maxGenerationDepth(organisms: readonly OrganismRuntimeState[]): number {
  let max = 0;
  for (const o of organisms) {
    if (o.generationDepth > max) max = o.generationDepth;
  }
  return max;
}

/** Count distinct active lineage roots among living organisms. */
export function activeLineageCount(organisms: readonly OrganismRuntimeState[]): number {
  const roots = new Set<number>();
  for (const o of organisms) {
    if (o.alive) roots.add(o.lineageRootId);
  }
  return roots.size;
}

export { meanAndVariance, median };
