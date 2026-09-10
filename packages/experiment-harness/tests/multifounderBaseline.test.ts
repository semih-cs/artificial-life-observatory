import { describe, it, expect } from 'vitest';
import {
  cloneConfig,
  DEFAULT_SIMULATION_CONFIG,
  MULTI_FOUNDER_MODEL_VERSION,
  bootstrapWorld,
  canonicalStateHash,
  createRngStreams,
  generateFounderProfiles,
  founderGroupOfIndex,
} from '@alo/simulation-core';
import { evaluateProbeSet } from '../src/probes/evaluate.js';
import { functionalDistance } from '../src/probes/distance.js';
import {
  multiFounderDefaultBaseline,
  MULTI_FOUNDER_DEFAULT_BASELINE_ID,
} from '../src/experiments/definitions.js';
import { founderFunctionalDiversity } from '../src/analysis/founderDiversity.js';
import { loadPilotSeeds } from '../src/runner/seeds.js';

describe('multi-founder default baseline definition (pilot report §14, precommitted)', () => {
  const spec = multiFounderDefaultBaseline(loadPilotSeeds());

  it('matches the precommitted design: one condition, 15 pilot seeds, 20,000 ticks, cap on', () => {
    expect(spec.experimentId).toBe(MULTI_FOUNDER_DEFAULT_BASELINE_ID);
    expect(spec.conditions.length).toBe(1);
    expect(spec.seeds).toEqual(loadPilotSeeds());
    expect(spec.seeds.length).toBe(15);
    expect(spec.maxTicks).toBe(20000);
    expect(spec.metricsSampleInterval).toBe(200);
    expect(spec.stopOnExtinction).toBe(true);
    expect(spec.runawayCapEnabled).toBe(true);
  });

  it('applies NO override: the run config is exactly the amended Phase 0A defaults', () => {
    const config = spec.baseConfigFactory();
    spec.conditions[0]!.configOverrides(config);
    expect(config).toEqual(DEFAULT_SIMULATION_CONFIG);
    expect(config.simulationVersion).toBe(MULTI_FOUNDER_MODEL_VERSION);
    expect(config.simulationVersion).toBe('0A.2.0');
    expect(config.bootstrap.founderGroupCount).toBe(5);
    expect(config.population.initialPopulationSize).toBe(25);
  });
});

describe('founder functional diversity (§14.6, observational only)', () => {
  const configFor = (seed: number) => {
    const c = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    c.rootSeed = seed;
    return c;
  };

  it('reports all 10 pairs of 5 founders, deterministically', () => {
    const a = founderFunctionalDiversity(configFor(100000));
    const b = founderFunctionalDiversity(configFor(100000));
    expect(a).toEqual(b);
    expect(a.founderCount).toBe(5);
    expect(a.pairs.length).toBe(10);
    for (const p of a.pairs) expect(p.distance).toBeGreaterThanOrEqual(0);
    expect(a.minDistance!).toBeLessThanOrEqual(a.meanDistance!);
    expect(a.meanDistance!).toBeLessThanOrEqual(a.maxDistance!);
    // Independent founders are functionally distinct controllers.
    expect(a.minDistance!).toBeGreaterThan(0);
  });

  it('reconstructs the founders bootstrapWorld actually uses', () => {
    // Each bootstrap organism is its group's founder plus a small perturbation,
    // so every organism must be functionally nearest to its own group's founder.
    const config = configFor(139595);
    const world = bootstrapWorld(config);
    const founders = generateFounderProfiles(createRngStreams(config.rootSeed).bootstrap, config)
      .map((f) => evaluateProbeSet(f.genome.neural));
    expect(founders.length).toBe(founderFunctionalDiversity(config).founderCount);
    expect(world.organisms.length).toBe(25);
    world.organisms.forEach((organism, i) => {
      const own = founderGroupOfIndex(i, 25, 5);
      const response = evaluateProbeSet(organism.genome.neural);
      const distances = founders.map((f) => functionalDistance(response, f));
      const nearest = distances.indexOf(Math.min(...distances));
      expect(nearest).toBe(own);
    });
  });

  it('touches no world: bootstrapping is identical before and after computing it', () => {
    const config = configFor(123757);
    const before = canonicalStateHash(bootstrapWorld(config));
    founderFunctionalDiversity(config);
    const after = canonicalStateHash(bootstrapWorld(config));
    expect(after).toBe(before);
  });
});
