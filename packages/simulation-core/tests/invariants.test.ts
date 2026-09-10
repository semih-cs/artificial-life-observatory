import { describe, it, expect } from 'vitest';
import { bootstrapWorld } from '../src/world/bootstrap.js';
import { stepWorld } from '../src/world/stepWorld.js';
import { runTicks } from '../src/world/runner.js';
import { canonicalStateHash, hasNonFiniteCanonicalValue } from '../src/serialization/canonicalState.js';
import { validateConfig } from '../src/config/types.js';
import { testConfig } from './helpers.js';

function invariantConfig() {
  return testConfig((c) => {
    c.population.initialPopulationSize = 12;
    c.food.initialFoodCount = 25;
    c.food.worldFoodCapacity = 40;
    c.lifecycle.maturityAge = 15;
    c.lifecycle.maxAge = 150;
  });
}

describe('canonical state invariants', () => {
  it('no NaN or Infinity ever appears in canonical biological state', () => {
    const config = invariantConfig();
    let world = bootstrapWorld(config);
    expect(hasNonFiniteCanonicalValue(world)).toBe(false);
    for (let i = 0; i < 400; i++) {
      world = stepWorld(world, config).world;
      if (i % 25 === 0 || i === 399) {
        expect(hasNonFiniteCanonicalValue(world)).toBe(false);
      }
    }
  });

  it('organism IDs are unique at every tick', () => {
    const config = invariantConfig();
    let world = bootstrapWorld(config);
    for (let i = 0; i < 300; i++) {
      world = stepWorld(world, config).world;
      const ids = world.organisms.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('food IDs are unique at every tick', () => {
    const config = invariantConfig();
    let world = bootstrapWorld(config);
    for (let i = 0; i < 300; i++) {
      world = stepWorld(world, config).world;
      const ids = world.food.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('a genome is immutable during an organism lifetime', () => {
    const config = invariantConfig();
    let world = bootstrapWorld(config);
    const tracked = new Map<number, string>();
    for (const o of world.organisms) tracked.set(o.id, JSON.stringify(o.genome));

    for (let i = 0; i < 200; i++) {
      world = stepWorld(world, config).world;
      for (const o of world.organisms) {
        const known = tracked.get(o.id);
        if (known === undefined) {
          tracked.set(o.id, JSON.stringify(o.genome));
        } else {
          expect(JSON.stringify(o.genome)).toBe(known);
        }
      }
    }
  });

  it('every organism stays inside the world bounds', () => {
    const config = invariantConfig();
    let world = bootstrapWorld(config);
    for (let i = 0; i < 250; i++) {
      world = stepWorld(world, config).world;
      for (const o of world.organisms) {
        expect(o.x).toBeGreaterThanOrEqual(0);
        expect(o.x).toBeLessThanOrEqual(config.world.width);
        expect(o.y).toBeGreaterThanOrEqual(0);
        expect(o.y).toBeLessThanOrEqual(config.world.height);
      }
      for (const f of world.food) {
        expect(f.x).toBeGreaterThanOrEqual(0);
        expect(f.x).toBeLessThanOrEqual(config.world.width);
      }
    }
  });

  it('energy never exceeds capacity and is never negative in stored state', () => {
    const config = invariantConfig();
    let world = bootstrapWorld(config);
    for (let i = 0; i < 250; i++) {
      world = stepWorld(world, config).world;
      for (const o of world.organisms) {
        expect(o.energy).toBeLessThanOrEqual(config.energy.energyCapacity + 1e-9);
        expect(o.energy).toBeGreaterThan(0); // dead organisms are removed from the active set
      }
    }
  });

  it('container order creates no hidden biological priority: shuffling the organism array changes nothing', () => {
    const config = invariantConfig();
    const world = bootstrapWorld(config);

    const shuffled = JSON.parse(JSON.stringify(world));
    shuffled.organisms.reverse();
    shuffled.food.reverse();

    const a = runTicks(JSON.parse(JSON.stringify(world)), config, 120).world;
    const b = runTicks(shuffled, config, 120).world;
    expect(canonicalStateHash(b)).toEqual(canonicalStateHash(a));
  });

  it('all organisms present in world state are alive (dead ones are pruned)', () => {
    const config = invariantConfig();
    let world = bootstrapWorld(config);
    for (let i = 0; i < 200; i++) {
      world = stepWorld(world, config).world;
      for (const o of world.organisms) expect(o.alive).toBe(true);
    }
  });

  it('telemetry agrees with canonical state and never perturbs it', () => {
    const config = invariantConfig();
    let world = bootstrapWorld(config);
    for (let i = 0; i < 150; i++) {
      const result = stepWorld(world, config);
      expect(result.telemetry.populationCount).toBe(result.world.organisms.length);
      expect(result.telemetry.totalFood).toBe(result.world.food.length);
      expect(result.telemetry.tick).toBe(result.world.tick);
      world = result.world;
    }
  });

  it('validateConfig accepts the shipped baseline configuration', () => {
    expect(() => validateConfig(testConfig())).not.toThrow();
  });

  it('population accounting balances: births and deaths explain the population change', () => {
    const config = invariantConfig();
    let world = bootstrapWorld(config);
    let population = world.organisms.length;
    for (let i = 0; i < 250; i++) {
      const result = stepWorld(world, config);
      expect(result.world.organisms.length).toBe(population + result.telemetry.births - result.telemetry.deaths);
      population = result.world.organisms.length;
      world = result.world;
    }
  });
});
