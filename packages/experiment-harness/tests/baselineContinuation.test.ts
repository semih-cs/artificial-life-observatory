import { describe, it, expect } from 'vitest';
import { cloneConfig, DEFAULT_SIMULATION_CONFIG, canonicalStateHash } from '@alo/simulation-core';
import { runReplicate } from '../src/runner/replicate.js';
import { loadPilotSeeds } from '../src/runner/seeds.js';
import {
  baselineContinuation, BASELINE_CONTINUATION_ID, BASELINE_CONTINUATION_SEEDS,
  BASELINE_CONTINUATION_CHECKPOINTS, BASELINE_CONTINUATION_HORIZON, BASELINE_CONTINUATION_SAFETY_CEILING,
} from '../src/experiments/baselineContinuation.js';
import { cohortProfile, reclassifyRun, PersistedRun } from '../src/analysis/reclassify.js';
import type { TrajectorySample } from '../src/analysis/trajectoryOutcome.js';

describe('continuation-multifounder-default-v1 matches the precommitment (pilot report §18, a8faf6a)', () => {
  it('fixes the seeds, horizon, ceiling and checkpoints', () => {
    expect(BASELINE_CONTINUATION_ID).toBe('continuation-multifounder-default-v1');
    expect([...BASELINE_CONTINUATION_SEEDS]).toEqual([115838, 155433, 163352, 171271, 179190, 202947]);
    expect(BASELINE_CONTINUATION_HORIZON).toBe(20000);
    expect(BASELINE_CONTINUATION_SAFETY_CEILING).toBe(1000);
    expect(BASELINE_CONTINUATION_CHECKPOINTS).toEqual({
      115838: { tick: 3389, hash: '187ce9dba4a57f07', population: 200, births: 259, deaths: 84, food: 60 },
      155433: { tick: 3597, hash: 'f324c5ff4e03f447', population: 200, births: 371, deaths: 196, food: 60 },
      163352: { tick: 3782, hash: '11e00e24d8788908', population: 200, births: 425, deaths: 250, food: 56 },
      171271: { tick: 6444, hash: 'ec2ca3f9ae35a43b', population: 200, births: 466, deaths: 291, food: 53 },
      179190: { tick: 3587, hash: 'bfff9ef115a23623', population: 200, births: 289, deaths: 114, food: 57 },
      202947: { tick: 18876, hash: 'b6fbde0b63d26a5d', population: 200, births: 1484, deaths: 1309, food: 57 },
    });
  });

  it('runs the unchanged 0A.2.0 defaults on pilot seeds, cap off as an early stop, ceiling 1000', () => {
    const spec = baselineContinuation();
    const pilot = new Set(loadPilotSeeds());
    for (const s of spec.seeds) expect(pilot.has(s)).toBe(true);
    const config = spec.baseConfigFactory();
    spec.conditions[0]!.configOverrides(config);
    expect(config).toEqual(DEFAULT_SIMULATION_CONFIG);
    expect(config.simulationVersion).toBe('0A.2.0');
    expect(config.bootstrap.founderGroupCount).toBe(5);
    expect(spec.maxTicks).toBe(20000);
    expect(spec.runawayCapEnabled).toBe(false);
    expect(spec.safetyPopulationCeiling).toBe(1000);
    expect(spec.stopOnExtinction).toBe(true);
    expect(spec.metricsSampleInterval).toBe(200);
    expect(spec.conditions[0]!.conditionId).toBe('multifounder-default');
  });

  it('an uncapped run passes through the exact state the capped baseline stopped in (seed 179190)', () => {
    const cp = BASELINE_CONTINUATION_CHECKPOINTS[179190]!;
    const base = { experimentId: 't', conditionId: 'c', seed: 179190, config: cloneConfig(DEFAULT_SIMULATION_CONFIG),
      metricsSampleInterval: 200, stopOnExtinction: true, gitCommit: null };
    const capped = runReplicate({ ...base, maxTicks: cp.tick + 10 });
    expect(capped.terminationReason).toBe('RUNAWAY_POPULATION');
    expect(capped.endTick).toBe(cp.tick);
    expect(capped.finalStateHash).toBe(cp.hash);
    let atCheckpoint: string | null = null;
    const uncapped = runReplicate({ ...base, maxTicks: cp.tick + 50, runawayCapEnabled: false, safetyPopulationCeiling: 1000,
      onTick: (_b, after) => { if (after.tick === cp.tick) atCheckpoint = canonicalStateHash(after); } });
    expect(atCheckpoint).toBe(cp.hash);
    expect(uncapped.endTick).toBeGreaterThan(cp.tick);
  });
});

describe('cohort profile (§18.3)', () => {
  const samples = (p: number): TrajectorySample[] => Array.from({ length: 101 }, (_, i) => ({ tick: i * 200, population: p }));
  const run = (seed: number, over: Partial<PersistedRun>): PersistedRun => ({
    sourceDirectory: 'x', timeseriesFile: 't', experimentId: 'e', conditionId: 'c', seed, simulationVersion: '0A.2.0',
    configHash: 'h', maxTicks: 20000, gitCommit: 'g', gitDirty: false, sourceIdentity: 's', runTimestamp: null,
    terminationReason: 'MAX_TICKS', endTick: 20000, endingPopulation: 150, peakPopulation: 150, totalBirths: 100,
    maxGenerationDepth: 10, v1Outcome: 'VIABLE_COMPLETION', samples: samples(150), ...over,
  });

  it('reports rates and summary figures only for a complete cohort', () => {
    const recs = [
      reclassifyRun(run(1, {})),
      reclassifyRun(run(2, { endingPopulation: 300, peakPopulation: 300, samples: samples(300), totalBirths: 400, maxGenerationDepth: 20 })),
      reclassifyRun(run(3, { terminationReason: 'EXTINCTION', endTick: 3000, endingPopulation: 0, peakPopulation: 30,
        samples: samples(30).slice(0, 15).concat([{ tick: 3000, population: 0 }]), totalBirths: 10, maxGenerationDepth: 0 })),
    ];
    const p = cohortProfile(recs);
    expect(p.counts).toEqual({ EXTINCTION: 1, BOUNDED_VIABLE: 1, HIGH_BOUNDED: 1, RUNAWAY: 0, INCONCLUSIVE: 0 });
    expect(p.rates!.EXTINCTION).toBeCloseTo(1 / 3);
    expect(p.boundedCompletionRate).toBeCloseTo(2 / 3);
    expect(p.meanFinalPopulation).toBeCloseTo(150);
    expect(p.medianFinalPopulation).toBe(150);
    expect(p.meanBirths).toBeCloseTo(170);
    expect(p.maxGenerationDepth).toBe(20);

    const incomplete = cohortProfile([...recs, reclassifyRun(run(4, { terminationReason: 'RUNAWAY_POPULATION', endTick: 3000 }))]);
    expect(incomplete.rates).toBeNull();
    expect(incomplete.boundedCompletionRate).toBeNull();
    expect(incomplete.meanFinalPopulation).toBeNull();
  });
});
