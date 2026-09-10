import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cloneConfig, DEFAULT_SIMULATION_CONFIG, MULTI_FOUNDER_MODEL_VERSION } from '@alo/simulation-core';
import { runReplicate } from '../src/runner/replicate.js';
import { runExperiment } from '../src/runner/experiment.js';
import { writeExperimentResults } from '../src/output/writer.js';
import { loadPilotSeeds } from '../src/runner/seeds.js';
import {
  foodLimitationDiagnostic, FOOD_LIMITATION_DECISION_SEEDS, FOOD_LIMITATION_REFERENCE_SEED,
  FOOD_LIMITATION_HORIZON, FOOD_LIMITATION_SAFETY_CEILING, FOOD_LIMITATION_MILESTONES,
  FOOD_SCARCITY_WINDOW, FOOD_SCARCITY_THRESHOLD, FOOD_LIMITATION_NEAR_CAP_LEVEL, FOOD_LIMITATION_INTEGRITY,
} from '../src/experiments/foodLimitation.js';
import {
  createFoodFluxRecorder, scarcityOnsetTick, firstTickAtLeast, milestoneRecords,
  classifyDecisionSeed, majorityOutcome, areaMeanFertility, FoodFluxRow,
} from '../src/analysis/foodLimitation.js';

describe('diagnostic-food-limitation-v1 matches the precommitment (pilot report §15, 6b14031)', () => {
  it('fixes every precommitted value', () => {
    expect([...FOOD_LIMITATION_DECISION_SEEDS]).toEqual([139595, 123757, 107919]);
    expect(FOOD_LIMITATION_REFERENCE_SEED).toBe(210866);
    expect(FOOD_LIMITATION_HORIZON).toBe(20000);
    expect(FOOD_LIMITATION_SAFETY_CEILING).toBe(1000);
    expect([...FOOD_LIMITATION_MILESTONES]).toEqual([200, 250, 300, 400, 600, 800, 1000]);
    expect(FOOD_SCARCITY_WINDOW).toBe(200);
    expect(FOOD_SCARCITY_THRESHOLD).toBe(DEFAULT_SIMULATION_CONFIG.food.worldFoodCapacity / 2);
    expect(FOOD_SCARCITY_THRESHOLD).toBe(30);
    expect(FOOD_LIMITATION_NEAR_CAP_LEVEL).toBe(250);
    expect(FOOD_LIMITATION_INTEGRITY).toEqual({
      139595: { tick: 3037, hash: '7bc732eb4dfa8c7b' },
      123757: { tick: 3094, hash: '4c4456bc83b5e842' },
      107919: { tick: 9793, hash: 'da0a52515e7c9bc6' },
      210866: { tick: 20000, hash: '16b073462ec8b5c4' },
    });
  });

  it('uses pilot seeds only, the unchanged 0A.2.0 defaults, cap off as an early stop, ceiling 1000', () => {
    const spec = foodLimitationDiagnostic();
    const pilot = new Set(loadPilotSeeds());
    expect(spec.seeds).toEqual([139595, 123757, 107919, 210866]);
    for (const s of spec.seeds) expect(pilot.has(s)).toBe(true);
    const config = spec.baseConfigFactory();
    spec.conditions[0]!.configOverrides(config);
    expect(config).toEqual(DEFAULT_SIMULATION_CONFIG);
    expect(config.simulationVersion).toBe(MULTI_FOUNDER_MODEL_VERSION);
    expect(config.bootstrap.founderGroupCount).toBe(5);
    expect(spec.maxTicks).toBe(20000);
    expect(spec.runawayCapEnabled).toBe(false);
    expect(spec.safetyPopulationCeiling).toBe(1000);
    expect(spec.stopOnExtinction).toBe(true);
    expect(spec.metricsSampleInterval).toBe(200);
  });
});

describe('per-tick food-flux recording is observational (§15.7)', () => {
  const run = (withRecorder: boolean) => {
    const recorder = createFoodFluxRecorder(DEFAULT_SIMULATION_CONFIG.food.worldFoodCapacity);
    const result = runReplicate({
      experimentId: 'test', conditionId: 'flux', seed: 139595, maxTicks: 1500,
      config: cloneConfig(DEFAULT_SIMULATION_CONFIG), metricsSampleInterval: 200,
      stopOnExtinction: true, gitCommit: null, runawayCapEnabled: false,
      onTick: withRecorder ? recorder.observer : undefined,
    });
    return { result, recorder };
  };

  it('leaves the canonical trajectory unchanged', () => {
    expect(run(true).result.finalStateHash).toBe(run(false).result.finalStateHash);
  });

  it('records one contiguous row per tick and balances food and births exactly', () => {
    const { result, recorder } = run(true);
    const rows = recorder.rows;
    expect(rows.length).toBe(result.endTick);
    rows.forEach((r, i) => expect(r.tick).toBe(i + 1));
    const consumed = rows.reduce((s, r) => s + r.foodConsumed, 0);
    const regenerated = rows.reduce((s, r) => s + r.foodRegenerated, 0);
    const initialFood = Math.min(DEFAULT_SIMULATION_CONFIG.food.initialFoodCount, DEFAULT_SIMULATION_CONFIG.food.worldFoodCapacity);
    expect(initialFood - consumed + regenerated).toBe(result.endingFoodCount);
    expect(rows.reduce((s, r) => s + r.births, 0)).toBe(result.totalBirths);
    expect(rows.reduce((s, r) => s + r.deaths, 0)).toBe(result.totalDeaths);
    expect(consumed).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.foodRegenerated).toBeLessThanOrEqual(DEFAULT_SIMULATION_CONFIG.food.regenAttemptsPerTick);
      expect(r.foodConsumed).toBeLessThanOrEqual(r.population + r.deaths);
    }
    const fBar = recorder.meanFertility()!;
    expect(fBar).toBeGreaterThan(DEFAULT_SIMULATION_CONFIG.fertility.minFertility);
    expect(fBar).toBeLessThan(1);
  });

  it('computes the exact area mean of a bilinear field', () => {
    // Corner values 0,1 / 1,0 on one cell average to 0.5.
    expect(areaMeanFertility({ resolution: 1, lattice: [0, 1, 1, 0] })).toBe(0.5);
    expect(areaMeanFertility({ resolution: 2, lattice: [1, 1, 1, 1, 1, 1, 1, 1, 1] })).toBe(1);
  });

  it('can be passed through runExperiment per seed', () => {
    const seen: number[] = [];
    runExperiment({
      experimentId: 't', description: 't', baseConfigFactory: () => cloneConfig(DEFAULT_SIMULATION_CONFIG),
      conditions: [{ conditionId: 'c', configOverrides: () => {} }], seeds: [42], maxTicks: 5,
    }, { tickObserverFor: (_c, seed) => (_b, after) => { seen.push(seed * 1000 + after.tick); } });
    expect(seen).toEqual([42001, 42002, 42003, 42004, 42005]);
  });
});

describe('diagnostic execution safety ceiling (§15.5)', () => {
  const explosive = () => {
    const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    config.food.regenAttemptsPerTick = 4;
    config.energy.foodEnergyValue = 40;
    config.energy.reproductionCost = 35;
    return config;
  };

  it('stops with SAFETY_CEILING, not RUNAWAY_POPULATION, when the cap is not an early stop', () => {
    const result = runReplicate({
      experimentId: 'test', conditionId: 'ceiling', seed: 115838, maxTicks: 3000,
      config: explosive(), metricsSampleInterval: 200, stopOnExtinction: true, gitCommit: null,
      runawayCapEnabled: false, safetyPopulationCeiling: 250,
    });
    expect(result.terminationReason).toBe('SAFETY_CEILING');
    expect(result.endingPopulation).toBeGreaterThanOrEqual(250);
    expect(result.runawayCap).toBe(200);
    // Classification rule unchanged: peak >= cap is runaway, as before.
    expect(result.outcome).toBe('RUNAWAY_POPULATION');
  });

  it('must exceed the §14.29 cap', () => {
    expect(() => runReplicate({
      experimentId: 'test', conditionId: 'bad', seed: 1, maxTicks: 1,
      config: cloneConfig(DEFAULT_SIMULATION_CONFIG), metricsSampleInterval: 1, stopOnExtinction: true,
      gitCommit: null, runawayCapEnabled: false, safetyPopulationCeiling: 200,
    })).toThrow();
  });

  it('an ordinary run is unaffected by the new option being absent', () => {
    const a = runReplicate({
      experimentId: 'test', conditionId: 'plain', seed: 115838, maxTicks: 3000, config: explosive(),
      metricsSampleInterval: 200, stopOnExtinction: true, gitCommit: null,
    });
    expect(a.terminationReason).toBe('RUNAWAY_POPULATION');
  });
});

describe('scarcity criterion and interpretation rule (§15.8–§15.9)', () => {
  const rows = (foods: number[], pops?: number[]): FoodFluxRow[] => foods.map((f, i) => ({
    tick: i + 1, population: pops?.[i] ?? 100, foodCount: f, foodCapacityFraction: f / 60,
    foodConsumed: 1, foodRegenerated: 1, births: 0, deaths: 0, meanEnergy: 50,
  }));

  it('onset needs a full 200-tick trailing mean <= 30', () => {
    expect(scarcityOnsetTick(rows(Array(400).fill(60)), 200, 30)).toBeNull();
    // Mean exactly 30 over the first full window counts (<=).
    expect(scarcityOnsetTick(rows(Array(400).fill(30)), 200, 30)).toBe(200);
    // Even a stock of 0 cannot trigger before a full window exists.
    expect(scarcityOnsetTick(rows(Array(199).fill(0)), 200, 30)).toBeNull();
    // A short deep dip does not count: 50 ticks at 0 inside a stock of 60 -> mean 45.
    const dip = Array(400).fill(60);
    for (let i = 100; i < 150; i++) dip[i] = 0;
    expect(scarcityOnsetTick(rows(dip), 200, 30)).toBeNull();
    // A sustained drop: from tick 201 on the stock is 0; the trailing mean reaches 30 at tick 300.
    const drop = [...Array(200).fill(60), ...Array(200).fill(0)];
    expect(scarcityOnsetTick(rows(drop), 200, 30)).toBe(300);
  });

  it('milestones are first ticks at or above each level, null when never reached', () => {
    const pops = Array.from({ length: 600 }, (_, i) => i + 1);
    const m = milestoneRecords(rows(Array(600).fill(60), pops), [200, 250, 1000], 200, 30);
    expect(m.map(x => x.tick)).toEqual([200, 250, null]);
    expect(m[1]!.trailing!.fromTick).toBe(51);
    expect(m[1]!.scarce).toBe(false);
    expect(firstTickAtLeast(rows([1], [5]), 6)).toBeNull();
  });

  it('classifies decision seeds exactly as §15.9 states', () => {
    expect(classifyDecisionSeed(null, 3000)).toBe('B');
    expect(classifyDecisionSeed(null, null)).toBe('B');
    expect(classifyDecisionSeed(2999, 3000)).toBe('C');
    expect(classifyDecisionSeed(500, null)).toBe('C');
    expect(classifyDecisionSeed(3000, 3000)).toBe('A');
    expect(classifyDecisionSeed(9000, 3000)).toBe('A');
  });

  it('takes the class of at least 2 of 3 decision seeds, else INCONCLUSIVE', () => {
    expect(majorityOutcome(['A', 'A', 'A'])).toEqual({ outcome: 'A', support: 3 });
    expect(majorityOutcome(['B', 'C', 'B'])).toEqual({ outcome: 'B', support: 2 });
    expect(majorityOutcome(['C', 'C', 'A'])).toEqual({ outcome: 'C', support: 2 });
    expect(majorityOutcome(['A', 'B', 'C']).outcome).toBe('INCONCLUSIVE');
    expect(() => majorityOutcome(['A', 'B'])).toThrow();
  });
});

describe('writer can omit the condition summary (§15.9: no viable-completion readout)', () => {
  it('writes replicates and manifest but no condition-summary file', () => {
    const result = runExperiment({
      experimentId: 't', description: 't', baseConfigFactory: () => cloneConfig(DEFAULT_SIMULATION_CONFIG),
      conditions: [{ conditionId: 'c', configOverrides: () => {} }], seeds: [42], maxTicks: 10,
      metricsSampleInterval: 5,
    });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alo-writer-'));
    writeExperimentResults(result, dir, { conditionSummary: false });
    expect(fs.existsSync(path.join(dir, 'replicates.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'condition-summary.json'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'condition-summary.csv'))).toBe(false);
  });
});
