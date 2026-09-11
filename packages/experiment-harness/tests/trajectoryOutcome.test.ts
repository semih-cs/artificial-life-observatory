import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
  classifyTrajectory, classifyByGrowthRatio, TrajectorySample, TrajectoryInput,
  TRAJECTORY_CLASSIFIER_VERSION, TRAJECTORY_HORIZON, TRAJECTORY_WINDOW_START, TRAJECTORY_HALF_BOUNDARY,
  TRAJECTORY_MIN_SAMPLES_PER_HALF, TRAJECTORY_GROWTH_THRESHOLD, TRAJECTORY_SHRINK_THRESHOLD,
  TRAJECTORY_HIGH_BOUNDED_LEVEL, TRAJECTORY_SAFETY_CEILING,
} from '../src/analysis/trajectoryOutcome.js';
import { classifyRunOutcome, runawayPopulationCap } from '../src/analysis/outcome.js';
import { eligibility, readPersistedRuns, reclassifyRun, summarizeCohort, PersistedRun } from '../src/analysis/reclassify.js';

/** 200-tick samples 0..endTick, population given by f(tick). */
const series = (f: (t: number) => number, endTick = 20000, step = 200, food?: (t: number) => number): TrajectorySample[] => {
  const out: TrajectorySample[] = [];
  for (let t = 0; t <= endTick; t += step) out.push({ tick: t, population: f(t), ...(food ? { foodCount: food(t) } : {}) });
  return out;
};
const run = (samples: TrajectorySample[], over: Partial<TrajectoryInput> = {}): TrajectoryInput => ({
  terminationReason: 'MAX_TICKS',
  endTick: samples[samples.length - 1]!.tick,
  endingPopulation: samples[samples.length - 1]!.population,
  peakPopulation: Math.max(...samples.map(s => s.population)),
  samples,
  ...over,
});

describe('trajectory-outcome-v2 constants are the §16 precommitment', () => {
  it('fixes every parameter', () => {
    expect(TRAJECTORY_CLASSIFIER_VERSION).toBe('trajectory-outcome-v2');
    expect(TRAJECTORY_HORIZON).toBe(20000);
    expect(TRAJECTORY_WINDOW_START).toBe(14000);
    expect(TRAJECTORY_HALF_BOUNDARY).toBe(17000);
    expect(TRAJECTORY_MIN_SAMPLES_PER_HALF).toBe(10);
    expect(TRAJECTORY_GROWTH_THRESHOLD).toBe(Math.pow(2, 3000 / 20000));
    expect(TRAJECTORY_GROWTH_THRESHOLD).toBeCloseTo(1.1096, 4);
    expect(TRAJECTORY_SHRINK_THRESHOLD).toBe(1 / TRAJECTORY_GROWTH_THRESHOLD);
    expect(TRAJECTORY_SHRINK_THRESHOLD).toBeCloseTo(0.9013, 4);
    expect(TRAJECTORY_HIGH_BOUNDED_LEVEL).toBe(200);
    expect(TRAJECTORY_SAFETY_CEILING).toBe(1000);
  });
});

describe('classification (§16.4)', () => {
  it('BOUNDED_VIABLE: level plateau below 200', () => {
    const c = classifyTrajectory(run(series(t => (t < 5000 ? 25 + t / 50 : 150))));
    expect(c.outcome).toBe('BOUNDED_VIABLE');
    expect(c.reason).toBe('PLATEAU');
    expect(c.earlySampleCount).toBe(15);
    expect(c.lateSampleCount).toBe(15);
    expect(c.growthRatio).toBe(1);
    expect(c.windowMean).toBe(150);
  });

  it('HIGH_BOUNDED: level plateau with window mean >= 200, even after an early spike', () => {
    const c = classifyTrajectory(run(series(t => (t === 8000 ? 600 : t < 5000 ? 100 : 310))));
    expect(c.outcome).toBe('HIGH_BOUNDED');
    expect(c.v1WouldBeRunaway).toBe(true);
    expect(c.peakPopulation).toBe(600);
  });

  it('a plateau averaging exactly 200 is HIGH_BOUNDED (>=)', () => {
    expect(classifyTrajectory(run(series(() => 200))).outcome).toBe('HIGH_BOUNDED');
    expect(classifyTrajectory(run(series(() => 199))).outcome).toBe('BOUNDED_VIABLE');
  });

  it('RUNAWAY by growth ratio: still rising at the horizon', () => {
    const c = classifyTrajectory(run(series(t => 100 + t / 50)));
    expect(c.outcome).toBe('RUNAWAY');
    expect(c.reason).toBe('GROWING_AT_HORIZON');
    expect(c.growthRatio!).toBeGreaterThanOrEqual(TRAJECTORY_GROWTH_THRESHOLD);
    expect(c.safetyCeilingReached).toBe(false);
  });

  it('RUNAWAY by safety ceiling, even when the run stops long before the window', () => {
    const s = series(t => 25 + t / 5, 5000);
    const c = classifyTrajectory(run(s, { terminationReason: 'SAFETY_CEILING', peakPopulation: 1000, endingPopulation: 1000 }));
    expect(c.outcome).toBe('RUNAWAY');
    expect(c.reason).toBe('SAFETY_CEILING');
    expect(c.safetyCeilingReached).toBe(true);
    expect(c.earlySampleCount).toBe(0);
  });

  it('a shrinking run is INCONCLUSIVE (DECLINING)', () => {
    const c = classifyTrajectory(run(series(t => Math.max(1, Math.round(400 - t / 60)))));
    expect(c.growthRatio!).toBeLessThanOrEqual(TRAJECTORY_SHRINK_THRESHOLD);
    expect(c.outcome).toBe('INCONCLUSIVE');
    expect(c.reason).toBe('DECLINING');
  });

  it('insufficient samples in a half is INCONCLUSIVE', () => {
    // 400-tick sampling gives only 7-8 samples per 3,000-tick half.
    const c = classifyTrajectory(run(series(() => 150, 20000, 400)));
    expect(c.outcome).toBe('INCONCLUSIVE');
    expect(c.reason).toBe('INSUFFICIENT_SAMPLES');
  });

  it('early termination by the v1 cap is INCONCLUSIVE (TRUNCATED), never runaway', () => {
    const s = series(t => 25 + t / 20, 3000);
    const c = classifyTrajectory(run(s, { terminationReason: 'RUNAWAY_POPULATION', peakPopulation: 200, endingPopulation: 200 }));
    expect(c.outcome).toBe('INCONCLUSIVE');
    expect(c.reason).toBe('TRUNCATED');
    expect(c.v1WouldBeRunaway).toBe(true);
  });

  it('extinction takes precedence over the ceiling, truncation and sampling', () => {
    const s = series(t => (t < 4000 ? 25 + t / 4 : 0), 4000);
    const c = classifyTrajectory(run(s, { terminationReason: 'EXTINCTION', peakPopulation: 1000, endingPopulation: 0 }));
    expect(c.outcome).toBe('EXTINCTION');
    expect(c.reason).toBe('EXTINCT');
    // A zero anywhere in the samples is extinction too.
    const z = series(t => (t === 10000 ? 0 : 50));
    expect(classifyTrajectory(run(z)).outcome).toBe('EXTINCTION');
  });

  it('an errored run is INCONCLUSIVE (ERROR)', () => {
    expect(classifyTrajectory(run(series(() => 150), { terminationReason: 'ERROR' })).reason).toBe('ERROR');
  });

  it('exact threshold edges: >= upper is RUNAWAY, <= lower is DECLINING, strictly between is a plateau', () => {
    expect(classifyByGrowthRatio(TRAJECTORY_GROWTH_THRESHOLD, 150).outcome).toBe('RUNAWAY');
    expect(classifyByGrowthRatio(TRAJECTORY_GROWTH_THRESHOLD - 1e-12, 150).outcome).toBe('BOUNDED_VIABLE');
    expect(classifyByGrowthRatio(TRAJECTORY_SHRINK_THRESHOLD, 150).outcome).toBe('INCONCLUSIVE');
    expect(classifyByGrowthRatio(TRAJECTORY_SHRINK_THRESHOLD, 150).reason).toBe('DECLINING');
    expect(classifyByGrowthRatio(TRAJECTORY_SHRINK_THRESHOLD + 1e-12, 150).outcome).toBe('BOUNDED_VIABLE');
    expect(classifyByGrowthRatio(TRAJECTORY_SHRINK_THRESHOLD + 1e-12, 250).outcome).toBe('HIGH_BOUNDED');
  });

  it('window boundaries: tick 14000 is outside, 17000 is early, 20000 is late', () => {
    const c = classifyTrajectory(run(series(t => (t === 14000 ? 9999 : t === 17000 ? 100 : 100))));
    expect(c.windowMaxPopulation).toBe(100);
    expect(c.earlySampleCount).toBe(15); // 14200..17000
    expect(c.lateSampleCount).toBe(15);  // 17200..20000
  });

  it('food is context only: different food trajectories never change the class', () => {
    const pops = (t: number) => 180;
    const a = classifyTrajectory(run(series(pops, 20000, 200, () => 60)));
    const b = classifyTrajectory(run(series(pops, 20000, 200, () => 0)));
    expect(a.outcome).toBe(b.outcome);
    expect(a.reason).toBe(b.reason);
    expect(a.windowMeanFood).toBe(60);
    expect(b.windowMeanFood).toBe(0);
  });

  it('is deterministic and independent of sample order', () => {
    const s = series(t => 100 + Math.round(20 * Math.sin(t / 700)));
    const a = classifyTrajectory(run(s));
    expect(classifyTrajectory(run(s))).toEqual(a);
    expect(classifyTrajectory(run([...s].reverse(), { endTick: 20000, endingPopulation: s[s.length - 1]!.population }))).toEqual(a);
  });
});

describe('the historical v1 classifier is unchanged', () => {
  it('still labels by peak >= 200 exactly as before', () => {
    const cap = runawayPopulationCap(25);
    expect(cap).toBe(200);
    expect(classifyRunOutcome({ terminationReason: 'MAX_TICKS', peakPopulation: 215, runawayCap: cap })).toBe('RUNAWAY_POPULATION');
    expect(classifyRunOutcome({ terminationReason: 'MAX_TICKS', peakPopulation: 199, runawayCap: cap })).toBe('VIABLE_COMPLETION');
    expect(classifyRunOutcome({ terminationReason: 'EXTINCTION', peakPopulation: 36, runawayCap: cap })).toBe('WORLD_EXTINCT');
    expect(classifyRunOutcome({ terminationReason: 'EXTINCTION', peakPopulation: 250, runawayCap: cap })).toBe('RUNAWAY_POPULATION');
    expect(classifyRunOutcome({ terminationReason: 'RUNAWAY_POPULATION', peakPopulation: 200, runawayCap: cap })).toBe('RUNAWAY_POPULATION');
    expect(classifyRunOutcome({ terminationReason: 'ERROR', peakPopulation: 0, runawayCap: cap })).toBe('ERROR');
  });
});

describe('reclassification of persisted results (read-only)', () => {
  const persisted = (over: Partial<PersistedRun>): PersistedRun => ({
    sourceDirectory: 'x', timeseriesFile: 't.csv', experimentId: 'e', conditionId: 'c', seed: 1,
    simulationVersion: '0A.2.0', configHash: 'h', maxTicks: 20000, gitCommit: 'g', gitDirty: false,
    sourceIdentity: 's', runTimestamp: null, terminationReason: 'MAX_TICKS', endTick: 20000,
    endingPopulation: 150, peakPopulation: 150, v1Outcome: 'VIABLE_COMPLETION', samples: series(() => 150), ...over,
  });

  it('eligibility: complete trajectories only; v1-cap stops and short horizons are not reclassified', () => {
    expect(eligibility(persisted({})).eligible).toBe(true);
    expect(eligibility(persisted({ terminationReason: 'EXTINCTION', endTick: 3000 })).eligible).toBe(true);
    expect(eligibility(persisted({ terminationReason: 'SAFETY_CEILING', endTick: 9000 })).eligible).toBe(true);
    expect(eligibility(persisted({ terminationReason: 'RUNAWAY_POPULATION', endTick: 3037 }))).toEqual({ eligible: false, reason: 'STOPPED_BY_V1_CAP' });
    expect(eligibility(persisted({ maxTicks: 10000, endTick: 10000 }))).toEqual({ eligible: false, reason: 'HORIZON_NOT_20000' });
    expect(eligibility(persisted({ samples: [] }))).toEqual({ eligible: false, reason: 'NO_TIMESERIES' });
    const r = reclassifyRun(persisted({ terminationReason: 'RUNAWAY_POPULATION', endTick: 3037 }));
    expect(r.classification).toBeNull(); // no class inferred for missing data
    expect(r.v1Outcome).toBe('VIABLE_COMPLETION');
  });

  it('cohort statistics: rate only when complete; otherwise a range and whether the gate is reachable', () => {
    const recs = (n: number, over: Partial<PersistedRun>) => Array.from({ length: n }, (_, i) => reclassifyRun(persisted({ seed: i, ...over })));
    const complete = summarizeCohort('c', [...recs(11, {}), ...recs(4, { terminationReason: 'EXTINCTION', endTick: 3000, endingPopulation: 0 })]);
    expect(complete.complete).toBe(true);
    expect(complete.boundedCompletionRate).toBeCloseTo(11 / 15);
    expect(complete.gateReachable).toBe(true);
    const incomplete = summarizeCohort('i', [
      ...recs(1, {}), ...recs(5, { terminationReason: 'EXTINCTION', endTick: 3000, endingPopulation: 0 }),
      ...recs(9, { terminationReason: 'RUNAWAY_POPULATION', endTick: 3000 }),
    ]);
    expect(incomplete.complete).toBe(false);
    expect(incomplete.boundedCompletionRate).toBeNull();
    expect(incomplete.boundedCompletionRange).toEqual({ min: 1 / 15, max: 10 / 15 });
    expect(incomplete.gateReachable).toBe(false);
    expect(() => summarizeCohort('m', [...recs(1, {}), ...recs(1, { simulationVersion: '0A.1.0' })])).toThrow();
  });

  it('reads a persisted directory without modifying it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alo-reclass-'));
    fs.writeFileSync(path.join(dir, 'replicates.json'), JSON.stringify([{
      experimentId: 'e', conditionId: 'c', seed: 7, simulationVersion: '0A.2.0', configHash: 'h', maxTicks: 20000,
      gitCommit: 'g', gitDirty: false, sourceIdentity: 's', timestamp: 't', terminationReason: 'MAX_TICKS',
      endTick: 20000, endingPopulation: 150, peakPopulation: 150, outcome: 'VIABLE_COMPLETION',
    }]));
    const rows = series(() => 150).map(s => `c,7,${s.tick},${s.population},60,0,0`);
    fs.writeFileSync(path.join(dir, 'timeseries-c.csv'),
      ['conditionId,seed,tick,population,foodCount,birthsCumulative,deathsCumulative', ...rows].join('\n') + '\n');
    const digest = () => fs.readdirSync(dir).sort().map(f => createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex')).join();
    const before = digest();
    const runs = readPersistedRuns(dir);
    expect(runs.length).toBe(1);
    expect(runs[0]!.samples.length).toBe(101);
    expect(reclassifyRun(runs[0]!).classification!.outcome).toBe('BOUNDED_VIABLE');
    expect(digest()).toBe(before);
  });
});
