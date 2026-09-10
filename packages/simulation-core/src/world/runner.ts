import { WorldState } from './types.js';
import { SimulationConfig } from '../config/types.js';
import { stepWorld } from './stepWorld.js';
import { bootstrapWorld } from './bootstrap.js';
import { TickTelemetry } from '../telemetry/types.js';
import { canonicalStateHash } from '../serialization/canonicalState.js';

/**
 * Headless execution (§14.10, §15.12 "fixed-timestep tick loop, runnable
 * headlessly"). stepWorld() remains the canonical single-tick mechanism; this
 * is a thin synchronous loop over it with no UI, networking, persistence, or
 * asynchronous scheduling of any kind.
 */

export interface RunOptions {
  /** Keep every tick's telemetry. Off by default — a long run would otherwise retain millions of rows. */
  collectTelemetry?: boolean;
  /** With collectTelemetry, keep only every Nth tick (default 1). */
  telemetrySampleEvery?: number;
  /** Stop early when the population reaches zero. Extinction is a valid outcome (§6.29). */
  stopOnExtinction?: boolean;
}

export interface RunSummary {
  seed: number;
  simulationVersion: string;
  ticksRequested: number;
  ticksExecuted: number;
  startingPopulation: number;
  endingPopulation: number;
  totalBirths: number;
  totalDeaths: number;
  endingFoodCount: number;
  extinct: boolean;
  finalTick: number;
  finalStateHash: string;
}

export interface RunResult {
  world: WorldState;
  summary: RunSummary;
  telemetry: TickTelemetry[];
}

/**
 * Run `tickCount` ticks from an existing world state.
 * Pure with respect to the caller's object graph in the sense that stepWorld
 * returns a new WorldState each tick; the returned world is the final one.
 */
export function runTicks(
  world: WorldState,
  config: SimulationConfig,
  tickCount: number,
  options: RunOptions = {}
): RunResult {
  const sampleEvery = Math.max(1, options.telemetrySampleEvery ?? 1);
  const telemetry: TickTelemetry[] = [];

  const startingPopulation = world.organisms.filter((o) => o.alive).length;
  let totalBirths = 0;
  let totalDeaths = 0;
  let current = world;
  let executed = 0;

  for (let i = 0; i < tickCount; i++) {
    const result = stepWorld(current, config);
    current = result.world;
    executed += 1;
    totalBirths += result.telemetry.births;
    totalDeaths += result.telemetry.deaths;

    if (options.collectTelemetry && (i + 1) % sampleEvery === 0) {
      telemetry.push(result.telemetry);
    }
    if (options.stopOnExtinction && result.telemetry.populationCount === 0) {
      break;
    }
  }

  const endingPopulation = current.organisms.filter((o) => o.alive).length;

  return {
    world: current,
    telemetry,
    summary: {
      seed: config.rootSeed,
      simulationVersion: config.simulationVersion,
      ticksRequested: tickCount,
      ticksExecuted: executed,
      startingPopulation,
      endingPopulation,
      totalBirths,
      totalDeaths,
      endingFoodCount: current.food.length,
      extinct: endingPopulation === 0,
      finalTick: current.tick,
      finalStateHash: canonicalStateHash(current),
    },
  };
}

/** Bootstrap a fresh world from config and run it for `tickCount` ticks. */
export function runSimulation(config: SimulationConfig, tickCount: number, options: RunOptions = {}): RunResult {
  return runTicks(bootstrapWorld(config), config, tickCount, options);
}
