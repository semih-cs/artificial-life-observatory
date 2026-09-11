import { describe, it, expect } from 'vitest';
import {
  cloneConfig, DEFAULT_SIMULATION_CONFIG, bootstrapWorld, stepWorld, canonicalStateHash,
} from '@alo/simulation-core';
import type { WorldState } from '@alo/simulation-core';
import { runReplicate } from '../src/runner/replicate.js';
import {
  createLifecycleRecorder, reproducerMeasures, summarizeWorld, lifecycleDecision, OrganismLifecycle, WorldLifecycleSummary,
} from '../src/analysis/lifecycle.js';
import {
  reproducerLifecycleDiagnostic, LIFECYCLE_EXTINCT_SEEDS, LIFECYCLE_LATE_SEEDS, LIFECYCLE_ROW_CHECK_TICKS,
  LIFECYCLE_HASH_CHECKPOINTS, REPRODUCER_LIFECYCLE_ID,
} from '../src/experiments/reproducerLifecycle.js';

const MAX_AGE = DEFAULT_SIMULATION_CONFIG.lifecycle.maxAge;

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o) && !ArrayBuffer.isView(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

describe('diagnostic-reproducer-lifecycle-v1 matches the precommitment (§22, ff7e2b1)', () => {
  it('fixes seeds, execution, checkpoints', () => {
    expect(REPRODUCER_LIFECYCLE_ID).toBe('diagnostic-reproducer-lifecycle-v1');
    expect([...LIFECYCLE_EXTINCT_SEEDS]).toEqual([131676, 147514, 187109, 195028]);
    expect([...LIFECYCLE_LATE_SEEDS]).toEqual([107919, 202947, 210866]);
    expect([...LIFECYCLE_ROW_CHECK_TICKS]).toEqual([3000, 5000, 7000, 9000]);
    expect(Object.keys(LIFECYCLE_HASH_CHECKPOINTS).map(Number).sort()).toEqual([107919, 131676, 147514, 187109, 195028, 202947, 210866]);
    const spec = reproducerLifecycleDiagnostic();
    const config = spec.baseConfigFactory();
    spec.conditions[0]!.configOverrides(config);
    expect(config).toEqual(DEFAULT_SIMULATION_CONFIG);
    expect(spec.maxTicks).toBe(20000);
    expect(spec.runawayCapEnabled).toBe(false);
    expect(spec.safetyPopulationCeiling).toBe(1000);
    expect(spec.metricsSampleInterval).toBe(200);
  });
});

describe('the lifecycle recorder is observational (§22.4)', () => {
  const run = (withRecorder: boolean) => {
    const rec = createLifecycleRecorder(MAX_AGE);
    const result = runReplicate({
      experimentId: 't', conditionId: 'c', seed: 210866, maxTicks: 3500, config: cloneConfig(DEFAULT_SIMULATION_CONFIG),
      metricsSampleInterval: 200, stopOnExtinction: true, gitCommit: null, runawayCapEnabled: false, safetyPopulationCeiling: 1000,
      onTick: withRecorder ? rec.observer : undefined,
    });
    return { result, rec };
  };

  it('leaves the canonical trajectory and every timeseries row unchanged', () => {
    const a = run(true);
    const b = run(false);
    expect(a.result.finalStateHash).toBe(b.result.finalStateHash);
    expect(a.result.timeseries).toEqual(b.result.timeseries);
  });

  it('balances with the core: births, deaths, parentage and tick stamps', () => {
    const { result, rec } = run(true);
    const all = [...rec.organisms.values()];
    const descendants = all.filter(o => o.parentId !== null);
    expect(descendants.length).toBe(result.totalBirths);
    expect(all.filter(o => o.deathTick !== null).length).toBe(result.totalDeaths);
    expect(all.reduce((s, o) => s + o.reproductionTicks.length, 0)).toBe(result.totalBirths);
    for (const child of descendants) {
      expect(rec.organisms.get(child.parentId!)!.reproductionTicks).toContain(child.birthTick);
      expect(child.generationDepth).toBe(rec.organisms.get(child.parentId!)!.generationDepth + 1);
    }
    // All founders die of age exactly at tick 3000 unless they starved first.
    for (const f of all.filter(o => o.parentId === null)) {
      expect(f.deathTick).not.toBeNull();
      expect(f.deathTick!).toBeLessThanOrEqual(3000);
      if (f.deathCause === 'AT_MAX_AGE') expect(f.deathTick).toBe(3000);
    }
  });

  it('mutates nothing: it runs on deep-frozen states and the step result hashes identically', () => {
    const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    config.rootSeed = 139595;
    let world: WorldState = bootstrapWorld(config);
    const rec = createLifecycleRecorder(MAX_AGE);
    for (let i = 0; i < 800; i++) {
      const step = stepWorld(world, config);
      const before = deepFreeze(world);
      const after = deepFreeze(step.world);
      const hashBefore = canonicalStateHash(after);
      expect(() => rec.observer(before, after, step.telemetry)).not.toThrow();
      expect(canonicalStateHash(after)).toBe(hashBefore);
      world = step.world;
    }
    expect(rec.organisms.size).toBeGreaterThan(25);
  });
});

describe('lifecycle analysis (§22.6–§22.8)', () => {
  const org = (id: number, birth: number, reps: number[], death: number | null, gen = 1): OrganismLifecycle => ({
    id, parentId: gen ? 1 : null, generationDepth: gen, birthTick: birth, reproductionTicks: reps,
    energyAfterFirstReproduction: null, deathTick: death, ageAtDeath: death === null ? null : death - birth, deathCause: 'ENERGY_DEPLETION',
  });

  it('derives per-reproducer measures', () => {
    const m = reproducerMeasures(org(2, 3100, [3700, 3900, 4300], 4500));
    expect(m).toMatchObject({ ageAtFirstReproduction: 600, reproductionEvents: 3, medianInterval: 300, postFirstReproductionSurvival: 800, diedBeforeSecondReproduction: false });
    expect(m.intervals).toEqual([200, 400]);
    expect(reproducerMeasures(org(3, 3100, [3700], 3800)).medianInterval).toBeNull();
  });

  it('applies the birth window, the generation filter and censoring', () => {
    const { summary } = summarizeWorld([
      org(1, 0, [600], 3000, 0),        // founder: excluded
      org(2, 3000, [3600], 4000),       // born before window: excluded
      org(3, 3001, [3600, 3800], 4000), // included reproducer
      org(4, 9000, [], 9500),           // included non-reproducer
      org(5, 9001, [9600], 9900),       // after window: excluded
      org(6, 8000, [8600], null),       // censored
    ]);
    expect(summary).toMatchObject({ included: 2, censored: 1, eligibleReproducers: 1, reproducersWithTwoOrMore: 1, medianInterval: 200 });
  });

  const w = (iv: number | null, sv: number): WorldLifecycleSummary => ({
    included: 10, censored: 0, eligibleReproducers: 5, reproducersWithTwoOrMore: iv === null ? 0 : 3,
    medianAgeAtFirstReproduction: 600, medianInterval: iv, medianPostFirstReproductionSurvival: sv,
    medianLifetimeEvents: 2, fractionDyingBeforeSecond: 0.4, deathCauses: { ENERGY_DEPLETION: 10, AT_MAX_AGE: 0 },
  });

  it('decides exactly as §22.8 states', () => {
    // L shorter intervals (clear), survival overlapping -> LONGER_GAPS
    expect(lifecycleDecision([w(400, 900), w(420, 1100), w(450, 950), w(500, 1000)], [w(250, 1000), w(300, 950), w(320, 1050)]).mechanism).toBe('LONGER_GAPS');
    // L longer survival (clear), intervals overlapping -> EARLIER_DEATH
    expect(lifecycleDecision([w(300, 500), w(400, 600), w(350, 550), w(320, 580)], [w(310, 900), w(390, 1000), w(360, 950)]).mechanism).toBe('EARLIER_DEATH');
    // both -> MIXED
    expect(lifecycleDecision([w(400, 500), w(420, 600), w(450, 550), w(500, 580)], [w(250, 900), w(300, 1000), w(320, 950)]).mechanism).toBe('MIXED');
    // clear but in the unexpected direction does not support
    expect(lifecycleDecision([w(200, 900), w(210, 1100), w(220, 950), w(230, 1000)], [w(400, 1000), w(410, 950), w(420, 1050)]).mechanism).toBe('NEITHER_INCONCLUSIVE');
    // a world with no interval value -> inconclusive
    expect(lifecycleDecision([w(null, 900), w(420, 1100), w(450, 950), w(500, 1000)], [w(250, 1000), w(300, 950), w(320, 1050)]).mechanism).toBe('NEITHER_INCONCLUSIVE');
  });
});
