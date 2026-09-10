import { describe, it, expect } from 'vitest';
import { bootstrapWorld } from '../src/world/bootstrap.js';
import { canonicalStateHash, canonicalStateString } from '../src/serialization/canonicalState.js';
import { DEFAULT_SIMULATION_CONFIG } from '../src/config/defaults.js';

describe('bootstrapWorld determinism (§13.76)', () => {
  it('initializing the same config twice produces identical canonical state', () => {
    const worldA = bootstrapWorld(DEFAULT_SIMULATION_CONFIG);
    const worldB = bootstrapWorld(DEFAULT_SIMULATION_CONFIG);
    expect(canonicalStateString(worldA)).toEqual(canonicalStateString(worldB));
    expect(canonicalStateHash(worldA)).toEqual(canonicalStateHash(worldB));
  });

  it('produces the configured initial population size, all alive, generationDepth 0', () => {
    const world = bootstrapWorld(DEFAULT_SIMULATION_CONFIG);
    expect(world.organisms.length).toBe(DEFAULT_SIMULATION_CONFIG.population.initialPopulationSize);
    for (const o of world.organisms) {
      expect(o.alive).toBe(true);
      expect(o.generationDepth).toBe(0);
      expect(o.lineageRootId).toBe(o.id);
      expect(o.parentId).toBeNull();
      expect(o.energy).toBe(DEFAULT_SIMULATION_CONFIG.energy.configuredInitialEnergy);
      expect(o.age).toBe(0);
    }
  });

  it('a different root seed produces a different initial world', () => {
    const worldA = bootstrapWorld(DEFAULT_SIMULATION_CONFIG);
    const worldB = bootstrapWorld({ ...DEFAULT_SIMULATION_CONFIG, rootSeed: DEFAULT_SIMULATION_CONFIG.rootSeed + 1 });
    expect(canonicalStateString(worldA)).not.toEqual(canonicalStateString(worldB));
  });

  it('bootstrap organisms share a common founder-derived ancestry (small perturbations, not independent draws)', () => {
    const world = bootstrapWorld(DEFAULT_SIMULATION_CONFIG);
    // every organism's morphology should be close to the founder midpoint values,
    // not scattered across the whole gene-bound range (proves small-sigma perturbation).
    const bounds = DEFAULT_SIMULATION_CONFIG.bootstrap.geneBounds;
    const founderSize = (bounds.size.min + bounds.size.max) / 2;
    for (const o of world.organisms) {
      expect(Math.abs(o.genome.morphology.size - founderSize)).toBeLessThan((bounds.size.max - bounds.size.min) * 0.25);
    }
  });

  it('organisms are placed with the configured minimum separation where the attempt budget allows it', () => {
    const world = bootstrapWorld(DEFAULT_SIMULATION_CONFIG);
    const minSep = DEFAULT_SIMULATION_CONFIG.bootstrap.boundaryMinSeparationFraction * Math.min(DEFAULT_SIMULATION_CONFIG.world.width, DEFAULT_SIMULATION_CONFIG.world.height);
    let violations = 0;
    for (let i = 0; i < world.organisms.length; i++) {
      for (let j = i + 1; j < world.organisms.length; j++) {
        const a = world.organisms[i]!;
        const b = world.organisms[j]!;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < minSep) violations++;
      }
    }
    // deterministic fallback (best-so-far) means occasional violations are
    // allowed under the fixed attempt budget, but should be rare, not the norm.
    expect(violations).toBeLessThan(world.organisms.length);
  });
});
