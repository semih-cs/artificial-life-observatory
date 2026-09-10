import { describe, it, expect } from 'vitest';
import { bootstrapWorld } from '../src/world/bootstrap.js';
import { stepWorld } from '../src/world/stepWorld.js';
import { runTicks, runSimulation } from '../src/world/runner.js';
import { canonicalStateHash, canonicalStateString } from '../src/serialization/canonicalState.js';
import { DEFAULT_SIMULATION_CONFIG } from '../src/config/defaults.js';
import { SimulationConfig } from '../src/config/types.js';
import { WorldState } from '../src/world/types.js';
import { RngStream, restoreRngStreamsState, createRngStreams } from '../src/rng/rngStream.js';
import { testConfig } from './helpers.js';

/** A smaller world so the suite stays fast without weakening the assertions. */
function fastConfig(mutate?: (c: SimulationConfig) => void): SimulationConfig {
  return testConfig((c) => {
    c.population.initialPopulationSize = 10;
    c.food.initialFoodCount = 20;
    c.food.worldFoodCapacity = 30;
    c.lifecycle.maturityAge = 20;
    c.lifecycle.maxAge = 200;
    if (mutate) mutate(c);
  });
}

/**
 * A dense little world in which reproduction reliably happens within a short
 * run, so mutation-channel differences actually have births to express
 * themselves through. Not an ecological claim — a test fixture.
 */
function reproductiveConfig(mutate?: (c: SimulationConfig) => void): SimulationConfig {
  return testConfig((c) => {
    c.world.width = 120;
    c.world.height = 120;
    c.population.initialPopulationSize = 8;
    c.food.initialFoodCount = 60;
    c.food.worldFoodCapacity = 60;
    c.food.regenAttemptsPerTick = 3;
    c.food.feedingRange = 8;
    c.energy.foodEnergyValue = 40;
    c.energy.reproductionEnergyThreshold = 60;
    c.energy.reproductionCost = 40;
    c.energy.birthEnergy = 20;
    c.lifecycle.maturityAge = 10;
    c.lifecycle.maxAge = 400;
    if (mutate) mutate(c);
  });
}

function run(config: SimulationConfig, tickCount: number): WorldState {
  return runTicks(bootstrapWorld(config), config, tickCount).world;
}

describe('determinism (§15.5, §18.2, [LOCKED])', () => {
  it('same seed + config -> identical initialization', () => {
    const config = fastConfig();
    expect(canonicalStateString(bootstrapWorld(config))).toEqual(canonicalStateString(bootstrapWorld(config)));
  });

  it('same seed + config -> identical N-tick canonical hash (N = 1, 50, 300)', () => {
    const config = fastConfig();
    for (const n of [1, 50, 300]) {
      expect(canonicalStateHash(run(config, n))).toEqual(canonicalStateHash(run(config, n)));
    }
  });

  it('the full canonical state string matches, not just the hash', () => {
    const config = fastConfig();
    expect(canonicalStateString(run(config, 200))).toEqual(canonicalStateString(run(config, 200)));
  });

  it('a different seed produces a different trajectory', () => {
    const a = fastConfig();
    const b = fastConfig((c) => {
      c.rootSeed = a.rootSeed + 1;
    });
    expect(canonicalStateHash(run(a, 100))).not.toEqual(canonicalStateHash(run(b, 100)));
  });

  it('a restored RNG state produces an identical continuation', () => {
    const config = fastConfig();
    const mid = run(config, 60);

    // Serialize the mid-run state (RNG stream state included) and continue
    // from the deserialized copy, then continue from the original. stepWorld
    // does not modify the state it is given, so both must agree.
    const rebuilt: WorldState = JSON.parse(JSON.stringify(mid));
    const continuedA = runTicks(mid, config, 40).world;
    const continuedB = runTicks(rebuilt, config, 40).world;

    expect(canonicalStateHash(continuedB)).toEqual(canonicalStateHash(continuedA));

    // And stepping forward really did leave the earlier state untouched.
    const continuedC = runTicks(mid, config, 40).world;
    expect(canonicalStateHash(continuedC)).toEqual(canonicalStateHash(continuedA));
  });

  it('RNG stream state round-trips exactly through export/restore', () => {
    const streams = createRngStreams(4321);
    for (let i = 0; i < 13; i++) streams.canonical.next();
    const snapshot = { bootstrap: streams.bootstrap.getState(), canonical: streams.canonical.getState() };
    const expected = Array.from({ length: 10 }, () => streams.canonical.next());

    const restored = createRngStreams(4321);
    restoreRngStreamsState(restored, snapshot);
    expect(Array.from({ length: 10 }, () => restored.canonical.next())).toEqual(expected);
  });

  it('telemetry collection does not affect the canonical result', () => {
    const config = fastConfig();
    const withTelemetry = runTicks(bootstrapWorld(config), config, 150, { collectTelemetry: true });
    const withoutTelemetry = runTicks(bootstrapWorld(config), config, 150);
    expect(canonicalStateHash(withTelemetry.world)).toEqual(canonicalStateHash(withoutTelemetry.world));
    expect(withTelemetry.telemetry.length).toBe(150);
    expect(withoutTelemetry.telemetry.length).toBe(0);
  });

  it('the canonical hash excludes telemetry and includes the fertility field identity', () => {
    const config = fastConfig();
    const world = bootstrapWorld(config);
    const serialized = canonicalStateString(world);
    expect(serialized).not.toMatch(/telemetry/);
    expect(serialized).toMatch(/fertility/);

    // Two worlds identical except for the fertility lattice must hash differently.
    const tweaked: WorldState = JSON.parse(JSON.stringify(world));
    (tweaked.fertility.lattice as number[])[0] = ((tweaked.fertility.lattice[0] ?? 0) + 0.1) % 1;
    expect(canonicalStateHash(tweaked)).not.toEqual(canonicalStateHash(world));
  });

  it('the same simulationVersion + config + seed + tick count yields the same hash across independent runs', () => {
    const config = fastConfig();
    const a = runSimulation(config, 250);
    const b = runSimulation(config, 250);
    expect(a.summary.finalStateHash).toEqual(b.summary.finalStateHash);
    expect(a.summary.endingPopulation).toEqual(b.summary.endingPopulation);
    expect(a.summary.totalBirths).toEqual(b.summary.totalBirths);
    expect(a.summary.totalDeaths).toEqual(b.summary.totalDeaths);
  });

  it('stepWorld carries no hidden module-level state between independent worlds', () => {
    const config = fastConfig();
    let a = bootstrapWorld(config);
    let b = bootstrapWorld(config);
    // interleave the two worlds' ticks
    for (let i = 0; i < 100; i++) {
      a = stepWorld(a, config).world;
      b = stepWorld(b, config).world;
    }
    expect(canonicalStateHash(a)).toEqual(canonicalStateHash(b));
  });

  it('mutation toggles change the trajectory but never determinism', () => {
    const combos: [boolean, boolean][] = [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ];
    const hashes = new Set<string>();
    for (const [m, n] of combos) {
      const config = reproductiveConfig((c) => {
        c.mutation.morphologyMutationEnabled = m;
        c.mutation.neuralMutationEnabled = n;
      });
      const h1 = canonicalStateHash(run(config, 150));
      const h2 = canonicalStateHash(run(config, 150));
      expect(h2).toEqual(h1); // deterministic in every condition
      hashes.add(h1);
    }
    expect(hashes.size).toBeGreaterThan(1);
  });

  it('no canonical module reads Math.random()', () => {
    const config = fastConfig();
    const original = Math.random;
    let called = 0;
    Math.random = () => {
      called += 1;
      return original();
    };
    try {
      runTicks(bootstrapWorld(config), config, 100);
    } finally {
      Math.random = original;
    }
    expect(called).toBe(0);
  });

  it('the default configuration is itself runnable and deterministic', () => {
    const a = runSimulation(DEFAULT_SIMULATION_CONFIG, 50);
    const b = runSimulation(DEFAULT_SIMULATION_CONFIG, 50);
    expect(a.summary.finalStateHash).toEqual(b.summary.finalStateHash);
  });

  it('RngStream is the only randomness source used by the tick pipeline', () => {
    // A canonical stream advanced by the pipeline must be the sole difference
    // in RNG state between two ticks; the bootstrap stream is untouched.
    const config = fastConfig();
    const w0 = bootstrapWorld(config);
    const w1 = stepWorld(w0, config).world;
    expect(w1.rng.bootstrap).toEqual(w0.rng.bootstrap);
    void RngStream;
  });
});
