import { describe, it, expect } from 'vitest';
import { mutateGenome, mutateMorphology, mutateNeural } from '../src/biology/mutation.js';
import { RngStream } from '../src/rng/rngStream.js';
import { constantGenome, testConfig, TEST_HIDDEN_SIZE } from './helpers.js';
import { SimulationConfig } from '../src/config/types.js';
import { createOffspring } from '../src/world/offspring.js';
import { makeOrganism, makeWorld } from './helpers.js';

function channels(morph: boolean, neural: boolean): SimulationConfig {
  return testConfig((c) => {
    c.mutation.morphologyMutationEnabled = morph;
    c.mutation.neuralMutationEnabled = neural;
    // Rate 1.0 so "enabled" is unambiguously observable in a single child;
    // the rate itself is exercised separately below.
    c.mutation.morphologyMutationRate = 1;
    c.mutation.neuralMutationRate = 1;
  });
}

const parent = constantGenome({ forward: 0.6, turn: 0.1, eat: 0.6, reproduce: 0.6 }, { size: 1.0, maxSpeed: 1.0, visionRange: 150, metabolism: 1.0 });

function child(config: SimulationConfig, seed = 7) {
  const rng = new RngStream(seed, 'canonical');
  return mutateGenome(parent, rng, config.mutation, config.bootstrap.geneBounds, config.neural.neuralParamBounds);
}

function morphEqual(a: typeof parent.morphology, b: typeof parent.morphology): boolean {
  return (
    a.size === b.size &&
    a.maxSpeed === b.maxSpeed &&
    a.visionRange === b.visionRange &&
    a.visionAngle === b.visionAngle &&
    a.metabolism === b.metabolism
  );
}

function neuralEqual(a: typeof parent.neural, b: typeof parent.neural): boolean {
  const same = (x: readonly number[], y: readonly number[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  return (
    same(a.inputHiddenWeights, b.inputHiddenWeights) &&
    same(a.hiddenBiases, b.hiddenBiases) &&
    same(a.hiddenOutputWeights, b.hiddenOutputWeights) &&
    same(a.outputBiases, b.outputBiases)
  );
}

describe('independent mutation channels (§13.6, §13.7, §15.7)', () => {
  it('morphology OFF / neural OFF -> exact inheritance of BOTH genomes', () => {
    const c = child(channels(false, false));
    expect(morphEqual(c.morphology, parent.morphology)).toBe(true);
    expect(neuralEqual(c.neural, parent.neural)).toBe(true);
  });

  it('morphology OFF / neural OFF still consumes RNG draws (§15.7 isolation)', () => {
    const config = channels(false, false);
    const rng = new RngStream(7, 'canonical');
    const before = rng.getState();
    mutateGenome(parent, rng, config.mutation, config.bootstrap.geneBounds, config.neural.neuralParamBounds);
    // The state MUST have advanced — disabled channels consume their full draw
    // schedule to preserve RNG isolation across channels.
    expect(rng.getState()).not.toEqual(before);
  });

  it('morphology ON / neural OFF -> only morphology changes', () => {
    const c = child(channels(true, false));
    expect(morphEqual(c.morphology, parent.morphology)).toBe(false);
    expect(neuralEqual(c.neural, parent.neural)).toBe(true);
  });

  it('morphology OFF / neural ON -> only the neural genome changes', () => {
    const c = child(channels(false, true));
    expect(morphEqual(c.morphology, parent.morphology)).toBe(true);
    expect(neuralEqual(c.neural, parent.neural)).toBe(false);
  });

  it('morphology ON / neural ON -> both can change', () => {
    const c = child(channels(true, true));
    expect(morphEqual(c.morphology, parent.morphology)).toBe(false);
    expect(neuralEqual(c.neural, parent.neural)).toBe(false);
  });

  it('the two flags are separate fields, not one combined switch', () => {
    const config = testConfig();
    expect(Object.prototype.hasOwnProperty.call(config.mutation, 'morphologyMutationEnabled')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(config.mutation, 'neuralMutationEnabled')).toBe(true);
    // and all four assignments are independently constructible
    for (const m of [true, false]) {
      for (const n of [true, false]) {
        const c = channels(m, n);
        expect(c.mutation.morphologyMutationEnabled).toBe(m);
        expect(c.mutation.neuralMutationEnabled).toBe(n);
      }
    }
  });
});

describe('mutation RNG isolation (§15.7)', () => {
  // Helper: create offspring with a given mutation flag combination and return
  // both the child and the final RNG state.
  function offspringWithState(morphOn: boolean, neuralOn: boolean, seed = 42) {
    const config = channels(morphOn, neuralOn);
    const parentOrg = makeOrganism({ id: 1, genome: parent, x: 100, y: 100, heading: 0, energy: 100, age: 50 });
    const rng = new RngStream(seed, 'canonical');
    const offspring = createOffspring(parentOrg, 2, 1, rng, config, { width: 200, height: 200 });
    return { offspring, state: rng.getState() };
  }

  it('morphology OFF vs ON with neural ON: neural child genome is identical', () => {
    const a = offspringWithState(false, true);
    const b = offspringWithState(true, true);
    // Neural genome must be identical because morphology draws are consumed
    // regardless of the morphology enable flag.
    expect(neuralEqual(a.offspring.genome.neural, b.offspring.genome.neural)).toBe(true);
    // Morphology may differ (one is mutated, the other is the parent clone).
  });

  it('neural OFF vs ON with morphology ON: morphology child genome is identical', () => {
    const a = offspringWithState(true, false);
    const b = offspringWithState(true, true);
    // Morphology genome must be identical because neural draws happen after
    // morphology and don't affect morphology values.
    expect(morphEqual(a.offspring.genome.morphology, b.offspring.genome.morphology)).toBe(true);
    // Neural genome may differ.
  });

  it('all four mutation-toggle combinations produce identical offspring placement', () => {
    const combos: [boolean, boolean][] = [[false, false], [false, true], [true, false], [true, true]];
    const results = combos.map(([m, n]) => offspringWithState(m, n));
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.offspring.x).toBe(results[0]!.offspring.x);
      expect(results[i]!.offspring.y).toBe(results[0]!.offspring.y);
    }
  });

  it('all four mutation-toggle combinations produce identical offspring heading', () => {
    const combos: [boolean, boolean][] = [[false, false], [false, true], [true, false], [true, true]];
    const results = combos.map(([m, n]) => offspringWithState(m, n));
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.offspring.heading).toBe(results[0]!.offspring.heading);
    }
  });

  it('all four mutation-toggle combinations produce identical final CanonicalRNG state', () => {
    const combos: [boolean, boolean][] = [[false, false], [false, true], [true, false], [true, true]];
    const results = combos.map(([m, n]) => offspringWithState(m, n));
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.state).toEqual(results[0]!.state);
    }
  });

  it('disabled morphology channel gives exact parent morphology values', () => {
    const result = offspringWithState(false, true);
    expect(morphEqual(result.offspring.genome.morphology, parent.morphology)).toBe(true);
  });

  it('disabled neural channel gives exact parent neural values', () => {
    const result = offspringWithState(true, false);
    expect(neuralEqual(result.offspring.genome.neural, parent.neural)).toBe(true);
  });

  it('morphology OFF vs ON with neural ON: morphology may differ', () => {
    const a = offspringWithState(false, true);
    const b = offspringWithState(true, true);
    // When morphology is ON with rate 1.0, it should differ from parent.
    expect(morphEqual(a.offspring.genome.morphology, parent.morphology)).toBe(true);
    expect(morphEqual(b.offspring.genome.morphology, parent.morphology)).toBe(false);
  });

  it('neural OFF vs ON with morphology ON: neural genome may differ', () => {
    const a = offspringWithState(true, false);
    const b = offspringWithState(true, true);
    expect(neuralEqual(a.offspring.genome.neural, parent.neural)).toBe(true);
    expect(neuralEqual(b.offspring.genome.neural, parent.neural)).toBe(false);
  });
});

describe('mutation probability mechanics (§10.30, §13.8, §11.29)', () => {
  it('rate 0 leaves every value untouched even with the channel enabled', () => {
    const config = testConfig((c) => {
      c.mutation.morphologyMutationEnabled = true;
      c.mutation.neuralMutationEnabled = true;
      c.mutation.morphologyMutationRate = 0;
      c.mutation.neuralMutationRate = 0;
    });
    const c = child(config);
    expect(morphEqual(c.morphology, parent.morphology)).toBe(true);
    expect(neuralEqual(c.neural, parent.neural)).toBe(true);
  });

  it('per-gene morphology mutation rate is honoured statistically', () => {
    const config = testConfig((c) => {
      c.mutation.morphologyMutationEnabled = true;
      c.mutation.morphologyMutationRate = 0.1; // baseline
    });
    const rng = new RngStream(4242, 'canonical');
    const trials = 4000;
    let mutatedGenes = 0;
    for (let i = 0; i < trials; i++) {
      const m = mutateMorphology(parent.morphology, rng, config.mutation, config.bootstrap.geneBounds);
      if (m.size !== parent.morphology.size) mutatedGenes++;
      if (m.maxSpeed !== parent.morphology.maxSpeed) mutatedGenes++;
      if (m.visionRange !== parent.morphology.visionRange) mutatedGenes++;
      if (m.visionAngle !== parent.morphology.visionAngle) mutatedGenes++;
      if (m.metabolism !== parent.morphology.metabolism) mutatedGenes++;
    }
    const observed = mutatedGenes / (trials * 5);
    expect(observed).toBeGreaterThan(0.08);
    expect(observed).toBeLessThan(0.12);
  });

  it('per-parameter neural mutation rate is honoured statistically', () => {
    const config = testConfig((c) => {
      c.mutation.neuralMutationEnabled = true;
      c.mutation.neuralMutationRate = 0.05; // baseline
    });
    const rng = new RngStream(31337, 'canonical');
    const trials = 400;
    let changed = 0;
    let total = 0;
    for (let i = 0; i < trials; i++) {
      const n = mutateNeural(parent.neural, rng, config.mutation, config.neural.neuralParamBounds);
      const blocks: [readonly number[], readonly number[]][] = [
        [n.inputHiddenWeights, parent.neural.inputHiddenWeights],
        [n.hiddenBiases, parent.neural.hiddenBiases],
        [n.hiddenOutputWeights, parent.neural.hiddenOutputWeights],
        [n.outputBiases, parent.neural.outputBiases],
      ];
      for (const [a, b] of blocks) {
        for (let k = 0; k < a.length; k++) {
          total++;
          if (a[k] !== b[k]) changed++;
        }
      }
    }
    const observed = changed / total;
    expect(observed).toBeGreaterThan(0.03);
    expect(observed).toBeLessThan(0.07);
  });

  it('mutation magnitude and probability are configuration, not hard-coded constants', () => {
    const small = testConfig((c) => {
      c.mutation.morphologyMutationRate = 1;
      c.mutation.morphologyMutationSigma.size = 0.001;
    });
    const large = testConfig((c) => {
      c.mutation.morphologyMutationRate = 1;
      c.mutation.morphologyMutationSigma.size = 0.2;
    });
    const deltas = (config: SimulationConfig) => {
      const rng = new RngStream(11, 'canonical');
      let sum = 0;
      for (let i = 0; i < 200; i++) {
        const m = mutateMorphology(parent.morphology, rng, config.mutation, config.bootstrap.geneBounds);
        sum += Math.abs(m.size - parent.morphology.size);
      }
      return sum / 200;
    };
    expect(deltas(small)).toBeLessThan(deltas(large));
  });
});

describe('mutation bounds (§10.4, §10.5, §11.30)', () => {
  it('mutated morphology always stays inside the configured gene bounds', () => {
    const config = testConfig((c) => {
      c.mutation.morphologyMutationEnabled = true;
      c.mutation.morphologyMutationRate = 1;
      c.mutation.morphologyMutationSigma = { size: 5, maxSpeed: 5, visionRange: 500, visionAngle: 5, metabolism: 5 };
    });
    const rng = new RngStream(5150, 'canonical');
    const b = config.bootstrap.geneBounds;
    for (let i = 0; i < 500; i++) {
      const m = mutateMorphology(parent.morphology, rng, config.mutation, b);
      expect(m.size).toBeGreaterThanOrEqual(b.size.min);
      expect(m.size).toBeLessThanOrEqual(b.size.max);
      expect(m.maxSpeed).toBeGreaterThanOrEqual(b.maxSpeed.min);
      expect(m.maxSpeed).toBeLessThanOrEqual(b.maxSpeed.max);
      expect(m.visionRange).toBeGreaterThanOrEqual(b.visionRange.min);
      expect(m.visionRange).toBeLessThanOrEqual(b.visionRange.max);
      expect(m.visionAngle).toBeGreaterThanOrEqual(b.visionAngle.min);
      expect(m.visionAngle).toBeLessThanOrEqual(b.visionAngle.max);
      expect(m.metabolism).toBeGreaterThanOrEqual(b.metabolism.min);
      expect(m.metabolism).toBeLessThanOrEqual(b.metabolism.max);
    }
  });

  it('mutated neural parameters always stay inside the configured parameter bounds', () => {
    const config = testConfig((c) => {
      c.mutation.neuralMutationEnabled = true;
      c.mutation.neuralMutationRate = 1;
      c.mutation.neuralMutationSigma = 10;
    });
    const rng = new RngStream(2718, 'canonical');
    const b = config.neural.neuralParamBounds;
    for (let i = 0; i < 200; i++) {
      const n = mutateNeural(parent.neural, rng, config.mutation, b);
      for (const block of [n.inputHiddenWeights, n.hiddenBiases, n.hiddenOutputWeights, n.outputBiases]) {
        for (const v of block) {
          expect(v).toBeGreaterThanOrEqual(b.min);
          expect(v).toBeLessThanOrEqual(b.max);
        }
      }
    }
  });

  it('the parent genome object is never modified by mutation (§13.4)', () => {
    const before = JSON.parse(JSON.stringify(parent));
    const config = channels(true, true);
    const rng = new RngStream(1, 'canonical');
    mutateGenome(parent, rng, config.mutation, config.bootstrap.geneBounds, config.neural.neuralParamBounds);
    expect(JSON.parse(JSON.stringify(parent))).toEqual(before);
  });

  it('morphology gene draw order is fixed: the same seed yields the same per-gene outcome', () => {
    const config = channels(true, false);
    const a = mutateMorphology(parent.morphology, new RngStream(88, 'canonical'), config.mutation, config.bootstrap.geneBounds);
    const b = mutateMorphology(parent.morphology, new RngStream(88, 'canonical'), config.mutation, config.bootstrap.geneBounds);
    expect(a).toEqual(b);
  });
});

describe('mutation channels leave the network structurally valid', () => {
  it('dimensionality is preserved through mutation', () => {
    const config = channels(true, true);
    const c = child(config);
    expect(c.neural.inputHiddenWeights.length).toBe(parent.neural.inputHiddenWeights.length);
    expect(c.neural.hiddenBiases.length).toBe(TEST_HIDDEN_SIZE);
    expect(c.neural.hiddenOutputWeights.length).toBe(parent.neural.hiddenOutputWeights.length);
    expect(c.neural.outputBiases.length).toBe(4);
  });
});

