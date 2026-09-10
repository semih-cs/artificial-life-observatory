/**
 * Single-replicate runner.
 *
 * Runs one simulation from bootstrap through maxTicks (or extinction),
 * collecting sampled timeseries metrics at configurable intervals.
 * Purely a consumer of simulation-core's public API.
 */

import type { WorldState } from '@alo/simulation-core';
import {
  SimulationConfig,
  cloneConfig,
  bootstrapWorld,
  stepWorld,
  canonicalStateHash,
  hash64,
} from '@alo/simulation-core';
import type { ReplicateResult, ReplicateProvenance, TimeseriesRow } from '../types.js';
import { EXPERIMENT_HARNESS_VERSION } from '../types.js';
import { computeTimeseriesRow, maxGenerationDepth, activeLineageCount } from '../metrics/compute.js';
import { classifyRunOutcome, runawayPopulationCap } from '../analysis/outcome.js';

export interface ReplicateOptions {
  experimentId: string;
  conditionId: string;
  seed: number;
  maxTicks: number;
  config: SimulationConfig;
  metricsSampleInterval: number;
  stopOnExtinction: boolean;
  gitCommit: string | null;
  /** Enforce the §14.29 test-only runaway cap. Defaults to true. */
  runawayCapEnabled?: boolean;
  /**
   * OPTIONAL test-only world construction step (§16.9), applied exactly once
   * after bootstrap and before the first tick. Must return a new WorldState and
   * must not consume RNG. See experiments/installPolicy.ts.
   */
  worldTransform?: (world: WorldState, config: SimulationConfig) => WorldState;
}

export function runReplicate(opts: ReplicateOptions): ReplicateResult {
  const config = cloneConfig(opts.config);
  config.rootSeed = opts.seed;

  const configHash = hash64(JSON.stringify(config));
  const replicateId = `${opts.conditionId}_seed${opts.seed}`;

  const provenance: ReplicateProvenance = {
    experimentId: opts.experimentId,
    conditionId: opts.conditionId,
    replicateId,
    seed: opts.seed,
    simulationVersion: config.simulationVersion,
    experimentHarnessVersion: EXPERIMENT_HARNESS_VERSION,
    configHash,
    maxTicks: opts.maxTicks,
    gitCommit: opts.gitCommit,
    timestamp: new Date().toISOString(),
  };

  const startTime = Date.now();

  // §14.29 [LOCKED]: test-only cap, min(8 x initialPopulation, 200). It bounds
  // pathological calibration runs; it is not a canonical biological rule and
  // never suppresses a birth.
  const runawayCap = runawayPopulationCap(config.population.initialPopulationSize);
  const runawayCapEnabled = opts.runawayCapEnabled ?? true;

  let world = bootstrapWorld(config);
  // §16.9 test-only construction step. Applied before tick 1, never during the
  // run, so it cannot influence any observation of a running world.
  if (opts.worldTransform) world = opts.worldTransform(world, config);
  const timeseries: TimeseriesRow[] = [];
  let cumulativeBirths = 0;
  let cumulativeDeaths = 0;
  let terminationReason: 'MAX_TICKS' | 'EXTINCTION' | 'RUNAWAY_POPULATION' | 'ERROR' = 'MAX_TICKS';
  let extinctionTick: number | null = null;
  let peakPopulation = world.organisms.filter((o) => o.alive).length;

  // Track reproductive success
  const organismsEverReproduced = new Set<number>();
  const seenOrganismIds = new Set<number>();
  for (const o of world.organisms) seenOrganismIds.add(o.id);

  // Collect initial state metrics
  timeseries.push(computeTimeseriesRow(world, 0, 0, organismsEverReproduced, seenOrganismIds.size));

  try {
    for (let i = 0; i < opts.maxTicks; i++) {
      const result = stepWorld(world, config);
      world = result.world;
      cumulativeBirths += result.telemetry.births;
      cumulativeDeaths += result.telemetry.deaths;
      if (result.telemetry.populationCount > peakPopulation) {
        peakPopulation = result.telemetry.populationCount;
      }

      // Track parentage for reproductive fraction
      for (const o of world.organisms) {
        if (!seenOrganismIds.has(o.id)) {
          seenOrganismIds.add(o.id);
          if (o.parentId !== null) {
            organismsEverReproduced.add(o.parentId);
          }
        }
      }

      // Sample metrics
      if ((i + 1) % opts.metricsSampleInterval === 0) {
        timeseries.push(computeTimeseriesRow(
          world, cumulativeBirths, cumulativeDeaths,
          organismsEverReproduced, seenOrganismIds.size
        ));
      }

      // Check extinction
      if (opts.stopOnExtinction && result.telemetry.populationCount === 0) {
        terminationReason = 'EXTINCTION';
        extinctionTick = world.tick;
        // Final sample at extinction
        if ((i + 1) % opts.metricsSampleInterval !== 0) {
          timeseries.push(computeTimeseriesRow(
            world, cumulativeBirths, cumulativeDeaths,
            organismsEverReproduced, seenOrganismIds.size
          ));
        }
        break;
      }

      // Check the test-only runaway cap (§14.29). Termination is recorded, not
      // hidden: §16.34 treats an early-terminated run as experimental data.
      if (runawayCapEnabled && result.telemetry.populationCount >= runawayCap) {
        terminationReason = 'RUNAWAY_POPULATION';
        if ((i + 1) % opts.metricsSampleInterval !== 0) {
          timeseries.push(computeTimeseriesRow(
            world, cumulativeBirths, cumulativeDeaths,
            organismsEverReproduced, seenOrganismIds.size
          ));
        }
        break;
      }
    }
  } catch (err) {
    terminationReason = 'ERROR';
    const wallClockMs = Date.now() - startTime;
    return {
      provenance,
      startTick: 0,
      endTick: world.tick,
      terminationReason,
      extinctionTick: null,
      finalStateHash: '',
      startingPopulation: config.population.initialPopulationSize,
      endingPopulation: world.organisms.filter(o => o.alive).length,
      totalBirths: cumulativeBirths,
      totalDeaths: cumulativeDeaths,
      endingFoodCount: world.food.length,
      peakPopulation,
      runawayCap,
      outcome: 'ERROR',
      maxGenerationDepth: maxGenerationDepth(world.organisms),
      activeLineageCount: activeLineageCount(world.organisms),
      timeseries,
      wallClockMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const wallClockMs = Date.now() - startTime;
  const living = world.organisms.filter(o => o.alive);

  return {
    provenance,
    startTick: 0,
    endTick: world.tick,
    terminationReason,
    extinctionTick,
    finalStateHash: canonicalStateHash(world),
    startingPopulation: config.population.initialPopulationSize,
    endingPopulation: living.length,
    totalBirths: cumulativeBirths,
    totalDeaths: cumulativeDeaths,
    endingFoodCount: world.food.length,
    peakPopulation,
    runawayCap,
    outcome: classifyRunOutcome({ terminationReason, peakPopulation, runawayCap }),
    maxGenerationDepth: maxGenerationDepth(world.organisms),
    activeLineageCount: activeLineageCount(world.organisms),
    timeseries,
    wallClockMs,
  };
}
