import { describe, it, expect } from 'vitest';
import {
  bootstrapWorld,
  canonicalStateHash,
  cloneConfig,
  DEFAULT_SIMULATION_CONFIG,
  NEURAL_INPUT_SIZE,
  stepWorld,
} from '@alo/simulation-core';
import type { NeuralGenome } from '@alo/simulation-core';
import { PROBE_SET_V1, DEFAULT_PROBE_SET } from '../src/probes/probeSet.js';
import { evaluateProbeSet, hiddenSizeOf } from '../src/probes/evaluate.js';
import {
  computeBehaviorFingerprint,
  fingerprintOfGenome,
  FINGERPRINT_VERSION,
} from '../src/probes/fingerprint.js';
import { functionalDistance } from '../src/probes/distance.js';
import {
  classifyRunOutcome,
  runawayPopulationCap,
  summarizeOutcomes,
  RUNAWAY_CAP_ABSOLUTE,
} from '../src/analysis/outcome.js';
import { runReplicate } from '../src/runner/replicate.js';

function makeGenome(scale: number, hiddenSize = 8): NeuralGenome {
  const gen = (n: number, phase: number): number[] =>
    Array.from({ length: n }, (_, i) => Math.sin((i + phase) * 0.7) * scale);
  return {
    inputHiddenWeights: gen(hiddenSize * NEURAL_INPUT_SIZE, 1),
    hiddenBiases: gen(hiddenSize, 2),
    hiddenOutputWeights: gen(4 * hiddenSize, 3),
    outputBiases: gen(4, 4),
  };
}

describe('probe set (§11.38)', () => {
  it('is a fixed set of 250 standardized sensory states', () => {
    expect(PROBE_SET_V1.probes.length).toBe(250);
    expect(PROBE_SET_V1.probeSetId).toBe('probe-set-v1');
    expect(DEFAULT_PROBE_SET).toBe(PROBE_SET_V1);
  });

  it('content hash is pinned — changing any probe requires a version bump', () => {
    // If this fails, the probe set changed. Bump probeSetId/probeSetVersion
    // rather than editing this literal, because fingerprints computed under
    // the old set are not comparable to the new one (§11.38, §13.223).
    expect(PROBE_SET_V1.contentHash).toBe('2ec7aa31879365c3');
  });

  it('every probe is a legal §11.58 input vector', () => {
    PROBE_SET_V1.probes.forEach((p, i) => {
      expect(p.index).toBe(i);
      expect(p.input.length).toBe(NEURAL_INPUT_SIZE);
      const [visible, distance, angle, boundaryDistance, boundaryAngle, energy] = p.input as number[];
      expect([0, 1]).toContain(visible);
      expect(distance!).toBeGreaterThanOrEqual(0);
      expect(distance!).toBeLessThanOrEqual(1);
      expect(angle!).toBeGreaterThan(-1);
      expect(angle!).toBeLessThanOrEqual(1);
      expect(boundaryDistance!).toBeGreaterThanOrEqual(0);
      expect(boundaryDistance!).toBeLessThanOrEqual(1);
      expect(boundaryAngle!).toBeGreaterThan(-1);
      expect(boundaryAngle!).toBeLessThanOrEqual(1);
      expect(energy!).toBeGreaterThanOrEqual(0);
      expect(energy!).toBeLessThanOrEqual(1);
      // §11.58: with foodVisible = 0, foodDistance and foodAngle are 0.0.
      if (visible === 0) {
        expect(distance).toBe(0);
        expect(angle).toBe(0);
      }
    });
  });

  it('covers food presence, food absence, both wall regimes and several energy levels', () => {
    const visible = PROBE_SET_V1.probes.filter(p => p.group === 'food-visible');
    const absent = PROBE_SET_V1.probes.filter(p => p.group === 'food-absent');
    expect(visible.length).toBe(210);
    expect(absent.length).toBe(40);
    const energies = new Set(PROBE_SET_V1.probes.map(p => p.input[5]!));
    expect(energies.size).toBeGreaterThanOrEqual(3);
    expect(PROBE_SET_V1.probes.some(p => p.input[3]! <= 0.25)).toBe(true);
    expect(PROBE_SET_V1.probes.some(p => p.input[3]! >= 0.75)).toBe(true);
  });
});

describe('probe evaluation is deterministic (§11.36, §11.39)', () => {
  it('the same genome and probe set always produce identical outputs', () => {
    const genome = makeGenome(0.9);
    const a = evaluateProbeSet(genome);
    const b = evaluateProbeSet(genome);
    expect(a.responses).toEqual(b.responses);
    expect(a.probeSetContentHash).toBe(PROBE_SET_V1.contentHash);
    expect(a.responses.length).toBe(250);
  });

  it('the same genome always produces an identical fingerprint hash', () => {
    const genome = makeGenome(0.9);
    const first = fingerprintOfGenome(genome);
    const second = computeBehaviorFingerprint(evaluateProbeSet(genome));
    expect(second.fingerprintHash).toBe(first.fingerprintHash);
    expect(first.fingerprintVersion).toBe(FINGERPRINT_VERSION);
  });

  it('a structurally identical copy of a genome produces the identical fingerprint', () => {
    const genome = makeGenome(0.9);
    const copy: NeuralGenome = JSON.parse(JSON.stringify(genome));
    expect(fingerprintOfGenome(copy).fingerprintHash).toBe(fingerprintOfGenome(genome).fingerprintHash);
  });

  it('all outputs are finite and inside their activation ranges (§11.59)', () => {
    const evaluation = evaluateProbeSet(makeGenome(1.7));
    for (const r of evaluation.responses) {
      for (const v of [r.forward, r.turn, r.eat, r.reproduce]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(r.forward).toBeGreaterThan(0);
      expect(r.forward).toBeLessThan(1);
      expect(r.eat).toBeGreaterThan(0);
      expect(r.eat).toBeLessThan(1);
      expect(r.reproduce).toBeGreaterThan(0);
      expect(r.reproduce).toBeLessThan(1);
      expect(r.turn).toBeGreaterThan(-1);
      expect(r.turn).toBeLessThan(1);
    }
  });
});

describe('probe evaluation is observationally pure (§11.39 [LOCKED])', () => {
  it('does not mutate the genome it is given', () => {
    const genome = makeGenome(0.6);
    const before = JSON.stringify(genome);
    evaluateProbeSet(genome);
    fingerprintOfGenome(genome);
    expect(JSON.stringify(genome)).toBe(before);
  });

  it('works on a deeply frozen genome (proves it performs no writes)', () => {
    const genome = makeGenome(0.6);
    Object.freeze(genome.inputHiddenWeights);
    Object.freeze(genome.hiddenBiases);
    Object.freeze(genome.hiddenOutputWeights);
    Object.freeze(genome.outputBiases);
    Object.freeze(genome);
    expect(() => fingerprintOfGenome(genome)).not.toThrow();
  });

  it('does not mutate the probe set', () => {
    const before = JSON.stringify(PROBE_SET_V1.probes.map(p => p.input));
    evaluateProbeSet(makeGenome(1.1));
    expect(JSON.stringify(PROBE_SET_V1.probes.map(p => p.input))).toBe(before);
  });

  it('probing every organism each tick does not change the canonical trajectory', () => {
    // The decisive purity test: a world stepped with probe evaluation
    // interleaved must end at the same canonical hash as one stepped without
    // it. Any consumption of CanonicalRNG or any write to organism/world state
    // would change the hash.
    const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    config.rootSeed = 4242;

    let plain = bootstrapWorld(config);
    for (let i = 0; i < 300; i++) plain = stepWorld(plain, config).world;

    let probed = bootstrapWorld(config);
    for (let i = 0; i < 300; i++) {
      for (const organism of probed.organisms) {
        const evaluation = evaluateProbeSet(organism.genome.neural);
        computeBehaviorFingerprint(evaluation);
      }
      probed = stepWorld(probed, config).world;
    }

    expect(canonicalStateHash(probed)).toBe(canonicalStateHash(plain));
  });
});

describe('behavior fingerprint (§11.41, §6.11)', () => {
  it('exposes exactly the six descriptive dimensions plus provenance — no score of any kind', () => {
    const fingerprint = fingerprintOfGenome(makeGenome(0.8));
    expect(Object.keys(fingerprint).sort()).toEqual([
      'fingerprintHash',
      'fingerprintVersion',
      'foodApproachResponse',
      'highEnergyReproductionResponse',
      'lowEnergyFoodResponse',
      'meanForwardTendency',
      'meanTurnMagnitude',
      'probeSetContentHash',
      'probeSetId',
      'wallProximityTurnDelta',
    ]);
    const forbidden = ['fitness', 'score', 'intelligence', 'rank', 'quality'];
    for (const key of Object.keys(fingerprint)) {
      for (const bad of forbidden) {
        expect(key.toLowerCase()).not.toContain(bad);
      }
    }
  });

  it('all dimensions are finite and carry the probe set identity', () => {
    const fingerprint = fingerprintOfGenome(makeGenome(1.4));
    expect(fingerprint.probeSetId).toBe('probe-set-v1');
    expect(fingerprint.probeSetContentHash).toBe(PROBE_SET_V1.contentHash);
    for (const [key, value] of Object.entries(fingerprint)) {
      if (typeof value === 'number') {
        expect(Number.isFinite(value), key).toBe(true);
      }
    }
  });

  it('refuses to summarize an evaluation from a different probe set', () => {
    const evaluation = evaluateProbeSet(makeGenome(0.5));
    const foreign = { ...PROBE_SET_V1, contentHash: 'deadbeefdeadbeef' };
    expect(() => computeBehaviorFingerprint(evaluation, foreign)).toThrow(/different probe set/);
  });

  it('different genomes generally produce different fingerprints', () => {
    const a = fingerprintOfGenome(makeGenome(0.4));
    const b = fingerprintOfGenome(makeGenome(1.6));
    expect(a.fingerprintHash).not.toBe(b.fingerprintHash);
  });
});

describe('functional distance (§11.40)', () => {
  it('is zero for a genome against itself and symmetric between two genomes', () => {
    const a = evaluateProbeSet(makeGenome(0.4));
    const b = evaluateProbeSet(makeGenome(1.6));
    expect(functionalDistance(a, a)).toBe(0);
    expect(functionalDistance(a, b)).toBeGreaterThan(0);
    expect(functionalDistance(a, b)).toBeCloseTo(functionalDistance(b, a), 15);
  });

  it('refuses to compare evaluations from different probe sets', () => {
    const a = evaluateProbeSet(makeGenome(0.4));
    const b = { ...evaluateProbeSet(makeGenome(0.4)), probeSetContentHash: 'deadbeefdeadbeef' };
    expect(() => functionalDistance(a, b)).toThrow(/different probe sets/);
  });

  it('rejects a genome whose topology does not match its own declared shape', () => {
    const broken = { ...makeGenome(0.5), outputBiases: [0.1, 0.2] };
    expect(() => hiddenSizeOf(broken)).toThrow();
  });
});

describe('runaway cap and run outcomes (§14.29, §16.34–§16.35)', () => {
  it('cap is min(8 x initialPopulation, 200)', () => {
    expect(runawayPopulationCap(25)).toBe(200);
    expect(runawayPopulationCap(10)).toBe(80);
    expect(runawayPopulationCap(1000)).toBe(RUNAWAY_CAP_ABSOLUTE);
  });

  it('classifies extinction, runaway and viable completion distinctly', () => {
    const cap = runawayPopulationCap(25);
    expect(classifyRunOutcome({ terminationReason: 'EXTINCTION', peakPopulation: 30, runawayCap: cap }))
      .toBe('WORLD_EXTINCT');
    expect(classifyRunOutcome({ terminationReason: 'MAX_TICKS', peakPopulation: 60, runawayCap: cap }))
      .toBe('VIABLE_COMPLETION');
    expect(classifyRunOutcome({ terminationReason: 'RUNAWAY_POPULATION', peakPopulation: 200, runawayCap: cap }))
      .toBe('RUNAWAY_POPULATION');
    // A run that exploded past the cap and then crashed back to extinction is
    // a runaway regime, not a viable one.
    expect(classifyRunOutcome({ terminationReason: 'EXTINCTION', peakPopulation: 640, runawayCap: cap }))
      .toBe('RUNAWAY_POPULATION');
    expect(classifyRunOutcome({ terminationReason: 'ERROR', peakPopulation: 0, runawayCap: cap }))
      .toBe('ERROR');
  });

  it('summarizes viable completion rate (§16.35)', () => {
    const counts = summarizeOutcomes([
      'VIABLE_COMPLETION', 'VIABLE_COMPLETION', 'WORLD_EXTINCT', 'RUNAWAY_POPULATION',
    ]);
    expect(counts.total).toBe(4);
    expect(counts.viable).toBe(2);
    expect(counts.extinct).toBe(1);
    expect(counts.runaway).toBe(1);
    expect(counts.viableCompletionRate).toBeCloseTo(0.5, 12);
  });

  it('the runner enforces the cap and terminates a genuinely explosive configuration', () => {
    const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    config.food.regenAttemptsPerTick = 4;
    config.energy.foodEnergyValue = 40;
    config.energy.reproductionCost = 35;
    const result = runReplicate({
      experimentId: 'test', conditionId: 'runaway', seed: 131676,
      maxTicks: 3000, config, metricsSampleInterval: 200,
      stopOnExtinction: true, gitCommit: null,
    });
    expect(result.terminationReason).toBe('RUNAWAY_POPULATION');
    expect(result.outcome).toBe('RUNAWAY_POPULATION');
    expect(result.runawayCap).toBe(200);
    expect(result.peakPopulation).toBeGreaterThanOrEqual(200);
    expect(result.endTick).toBeLessThan(3000);
  });

  it('with the cap disabled the same run continues but is still classified runaway post hoc', () => {
    const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    config.food.regenAttemptsPerTick = 4;
    config.energy.foodEnergyValue = 40;
    config.energy.reproductionCost = 35;
    const result = runReplicate({
      experimentId: 'test', conditionId: 'runaway-uncapped', seed: 131676,
      maxTicks: 3000, config, metricsSampleInterval: 200,
      stopOnExtinction: true, gitCommit: null, runawayCapEnabled: false,
    });
    expect(result.terminationReason).not.toBe('RUNAWAY_POPULATION');
    expect(result.peakPopulation).toBeGreaterThanOrEqual(200);
    expect(result.outcome).toBe('RUNAWAY_POPULATION');
  });

  it('a short default run records the cap and a consistent outcome', () => {
    const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    const result = runReplicate({
      experimentId: 'test', conditionId: 'short', seed: 42,
      maxTicks: 100, config, metricsSampleInterval: 50,
      stopOnExtinction: true, gitCommit: null,
    });
    expect(result.runawayCap).toBe(200);
    expect(result.peakPopulation).toBeGreaterThanOrEqual(result.endingPopulation);
    expect(result.outcome).toBe(classifyRunOutcome({
      terminationReason: result.terminationReason,
      peakPopulation: result.peakPopulation,
      runawayCap: result.runawayCap,
    }));
  });
});

describe('persisted-result reader (no reruns)', () => {
  it('recovers peak population from a sampled timeseries and classifies outcomes', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { readPersistedExperiment } = await import('../src/analysis/persistedResults.js');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alo-persisted-'));
    fs.writeFileSync(path.join(dir, 'replicates.json'), JSON.stringify([
      { conditionId: 'c', seed: 1, terminationReason: 'EXTINCTION', extinctionTick: 900,
        endTick: 900, endingPopulation: 0, totalBirths: 4, maxGenerationDepth: 2 },
      { conditionId: 'c', seed: 2, terminationReason: 'MAX_TICKS', extinctionTick: null,
        endTick: 1000, endingPopulation: 40, totalBirths: 60, maxGenerationDepth: 3 },
      { conditionId: 'c', seed: 3, terminationReason: 'MAX_TICKS', extinctionTick: null,
        endTick: 1000, endingPopulation: 30, totalBirths: 900, maxGenerationDepth: 5 },
    ]));
    fs.writeFileSync(path.join(dir, 'timeseries-c.csv'),
      'conditionId,seed,tick,population\n' +
      'c,1,0,25\nc,1,900,0\n' +
      'c,2,0,25\nc,2,1000,40\n' +
      // seed 3 exploded past the cap mid-run, then fell back to 30
      'c,3,0,25\nc,3,500,640\nc,3,1000,30\n');

    const [condition] = readPersistedExperiment(dir, 25);
    expect(condition!.runawayCap).toBe(200);
    const bySeed = new Map(condition!.replicates.map(r => [r.seed, r]));
    expect(bySeed.get(1)!.peakPopulationSource).toBe('recovered-from-timeseries');
    expect(bySeed.get(1)!.outcome).toBe('WORLD_EXTINCT');
    expect(bySeed.get(2)!.outcome).toBe('VIABLE_COMPLETION');
    expect(bySeed.get(3)!.peakPopulation).toBe(640);
    expect(bySeed.get(3)!.outcome).toBe('RUNAWAY_POPULATION');
    expect(condition!.outcomes.viableCompletionRate).toBeCloseTo(1 / 3, 12);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
