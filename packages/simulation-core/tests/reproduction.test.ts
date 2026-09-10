import { describe, it, expect } from 'vitest';
import { isReproductionEligible, applyParentReproductionCost } from '../src/biology/reproduction.js';
import { stepWorld } from '../src/world/stepWorld.js';
import { validateConfig } from '../src/config/types.js';
import { constantGenome, makeOrganism, makeWorld, testConfig, findOrganism } from './helpers.js';

function reproConfig() {
  return testConfig((c) => {
    c.world.width = 200;
    c.world.height = 200;
    c.food.regenAttemptsPerTick = 0;
    c.lifecycle.maturityAge = 10;
    c.lifecycle.maxAge = 1000;
    c.energy.reproductionEnergyThreshold = 75;
    c.energy.reproductionCost = 45;
    c.energy.birthEnergy = 25;
    c.mutation.morphologyMutationEnabled = false;
    c.mutation.neuralMutationEnabled = false;
  });
}

/** A controller that always requests reproduction and barely moves. */
const wantsToReproduce = constantGenome({ forward: 0.001, turn: 0, eat: 0.001, reproduce: 0.999 }, { metabolism: 1, size: 1 });

describe('maturity gating (§12.35, §12.36)', () => {
  const config = reproConfig();

  it('age < maturityAge -> reproduction is impossible regardless of energy or neural intent', () => {
    for (let age = 0; age < config.lifecycle.maturityAge; age++) {
      const o = makeOrganism({ id: 1, genome: wantsToReproduce, energy: 100, age });
      expect(isReproductionEligible(o, true, config.energy, config.lifecycle)).toBe(false);
    }
  });

  it('age == maturityAge -> reproduction may occur when every other condition is satisfied', () => {
    const o = makeOrganism({ id: 1, genome: wantsToReproduce, energy: 100, age: config.lifecycle.maturityAge });
    expect(isReproductionEligible(o, true, config.energy, config.lifecycle)).toBe(true);
  });

  it('maturity alone is not enough: energy and neural intent are still required', () => {
    const mature = makeOrganism({ id: 1, genome: wantsToReproduce, energy: 100, age: config.lifecycle.maturityAge });
    expect(isReproductionEligible(mature, false, config.energy, config.lifecycle)).toBe(false);

    const poor = makeOrganism({ id: 2, genome: wantsToReproduce, energy: 10, age: config.lifecycle.maturityAge });
    expect(isReproductionEligible(poor, true, config.energy, config.lifecycle)).toBe(false);

    const dead = makeOrganism({ id: 3, genome: wantsToReproduce, energy: 100, age: config.lifecycle.maturityAge, alive: false });
    expect(isReproductionEligible(dead, true, config.energy, config.lifecycle)).toBe(false);
  });

  it('an organism does NOT reproduce at tick 1 merely because its controller requests it', () => {
    const c = reproConfig();
    // Full energy, maximal reproduce output, but age 0 at the start of tick 1.
    const o = makeOrganism({ id: 1, genome: wantsToReproduce, x: 100, y: 100, energy: 100, age: 0 });
    const result = stepWorld(makeWorld({ config: c, organisms: [o] }), c);
    expect(result.telemetry.births).toBe(0);
    expect(result.world.organisms.length).toBe(1);
  });

  it('the same organism does reproduce once it has aged past maturity', () => {
    const c = reproConfig();
    const o = makeOrganism({ id: 1, genome: wantsToReproduce, x: 100, y: 100, energy: 100, age: c.lifecycle.maturityAge });
    const result = stepWorld(makeWorld({ config: c, organisms: [o] }), c);
    expect(result.telemetry.births).toBe(1);
  });

  it('maturityAge is configurable', () => {
    const early = testConfig((c) => {
      c.lifecycle.maturityAge = 1;
    });
    const late = testConfig((c) => {
      c.lifecycle.maturityAge = 900;
    });
    const o = makeOrganism({ id: 1, genome: wantsToReproduce, energy: 100, age: 5 });
    expect(isReproductionEligible(o, true, early.energy, early.lifecycle)).toBe(true);
    expect(isReproductionEligible(o, true, late.energy, late.lifecycle)).toBe(false);
  });
});

describe('reproduction energy accounting (§12.40-§12.42)', () => {
  it('parent loses exactly reproductionCost', () => {
    const config = reproConfig();
    const o = makeOrganism({ id: 1, genome: wantsToReproduce, energy: 100, age: 50 });
    applyParentReproductionCost(o, config.energy);
    expect(o.energy).toBeCloseTo(100 - config.energy.reproductionCost, 12);
  });

  it('child receives exactly birthEnergy, which is NOT the founder initial energy', () => {
    const c = reproConfig();
    expect(c.energy.birthEnergy).not.toBe(c.energy.configuredInitialEnergy);

    const o = makeOrganism({ id: 1, genome: wantsToReproduce, x: 100, y: 100, energy: 100, age: 50 });
    const result = stepWorld(makeWorld({ config: c, organisms: [o] }), c);
    const child = result.world.organisms.find((x) => x.id !== 1)!;
    expect(child.energy).toBe(c.energy.birthEnergy);
  });

  it('reproduction never creates net ecosystem energy: reproductionCost > birthEnergy', () => {
    const c = reproConfig();
    expect(c.energy.reproductionCost).toBeGreaterThan(c.energy.birthEnergy);

    const startEnergy = 100;
    const o = makeOrganism({ id: 1, genome: wantsToReproduce, x: 100, y: 100, energy: startEnergy, age: 50 });
    const result = stepWorld(makeWorld({ config: c, organisms: [o] }), c);

    const parent = findOrganism(result.world, 1)!;
    const child = result.world.organisms.find((x) => x.id !== 1)!;
    const totalAfter = parent.energy + child.energy;
    // total system energy strictly decreased (cost > birthEnergy, plus metabolism)
    expect(totalAfter).toBeLessThan(startEnergy);
    expect(startEnergy - totalAfter).toBeGreaterThanOrEqual(c.energy.reproductionCost - c.energy.birthEnergy);
  });

  it('a config where reproductionCost <= birthEnergy is rejected', () => {
    const bad = testConfig((c) => {
      c.energy.reproductionCost = 20;
      c.energy.birthEnergy = 25;
    });
    expect(() => validateConfig(bad)).toThrow(/reproductionCost/);

    const equal = testConfig((c) => {
      c.energy.reproductionCost = 25;
      c.energy.birthEnergy = 25;
    });
    expect(() => validateConfig(equal)).toThrow(/reproductionCost/);
  });

  it('reproductionCost and birthEnergy are independently configurable', () => {
    const c = reproConfig();
    c.energy.reproductionCost = 60;
    c.energy.birthEnergy = 5;
    validateConfig(c);
    const o = makeOrganism({ id: 1, genome: wantsToReproduce, x: 100, y: 100, energy: 100, age: 50 });
    const result = stepWorld(makeWorld({ config: c, organisms: [o] }), c);
    const child = result.world.organisms.find((x) => x.id !== 1)!;
    expect(child.energy).toBe(5);
    expect(findOrganism(result.world, 1)!.energy).toBeLessThan(100 - 60 + 1e-6);
  });
});

describe('lineage metadata (§9.26-§9.29, §13.42)', () => {
  it('founder organisms have parentId null, generationDepth 0, lineageRootId = own id', () => {
    const c = reproConfig();
    const o = makeOrganism({ id: 7, genome: wantsToReproduce, x: 100, y: 100, energy: 100, age: 50 });
    expect(o.parentId).toBeNull();
    expect(o.generationDepth).toBe(0);
    expect(o.lineageRootId).toBe(7);
    void c;
  });

  it('children carry parentId, generationDepth + 1, and the parent lineage root', () => {
    const c = reproConfig();
    let world = makeWorld({
      config: c,
      organisms: [makeOrganism({ id: 1, genome: wantsToReproduce, x: 100, y: 100, energy: 100, age: 50 })],
    });

    const generations: number[] = [];
    const roots = new Set<number>();

    // Force reproduction for a bounded number of ticks (population doubles each
    // tick under these conditions, so the budget is deliberately small) and
    // follow the lineage down several generations.
    for (let t = 0; t < 6; t++) {
      for (const o of world.organisms) {
        o.energy = 100;
        o.age = Math.max(o.age, c.lifecycle.maturityAge);
      }
      world = stepWorld(world, c).world;
    }

    for (const o of world.organisms) {
      generations.push(o.generationDepth);
      roots.add(o.lineageRootId);
      if (o.parentId !== null) {
        const parent = world.organisms.find((p) => p.id === o.parentId);
        if (parent) {
          expect(o.generationDepth).toBe(parent.generationDepth + 1);
          expect(o.lineageRootId).toBe(parent.lineageRootId);
        }
      }
    }

    expect(Math.max(...generations)).toBeGreaterThan(1); // multiple generations deep
    expect(roots.size).toBe(1); // all descend from the single founder
    expect([...roots][0]).toBe(1);
  });

  it('organism IDs are unique and deterministic across a run', () => {
    const c = reproConfig();
    let world = makeWorld({
      config: c,
      organisms: [makeOrganism({ id: 1, genome: wantsToReproduce, x: 100, y: 100, energy: 100, age: 50 })],
    });
    const seen = new Set<number>();
    for (let t = 0; t < 7; t++) {
      for (const o of world.organisms) {
        o.energy = 100;
        o.age = Math.max(o.age, c.lifecycle.maturityAge);
      }
      world = stepWorld(world, c).world;
      for (const o of world.organisms) seen.add(o.id);
      expect(new Set(world.organisms.map((o) => o.id)).size).toBe(world.organisms.length);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('newborn action timing (§12.48, §20.72 phase 17)', () => {
  it('a newborn exists in world state but does not act in its birth tick', () => {
    const c = reproConfig();
    const parent = makeOrganism({ id: 1, genome: wantsToReproduce, x: 100, y: 100, heading: 0, energy: 100, age: 50 });
    const result = stepWorld(makeWorld({ config: c, organisms: [parent] }), c);

    const child = result.world.organisms.find((o) => o.id !== 1)!;
    expect(child).toBeDefined();
    expect(child.age).toBe(0); // did not age -> did not go through a tick
    expect(child.energy).toBe(c.energy.birthEnergy); // paid no metabolism this tick
    expect(child.birthTick).toBe(result.world.tick);
  });

  it('the newborn does act on the following tick', () => {
    const c = reproConfig();
    const parent = makeOrganism({ id: 1, genome: wantsToReproduce, x: 100, y: 100, heading: 0, energy: 100, age: 50 });
    let world = stepWorld(makeWorld({ config: c, organisms: [parent] }), c).world;
    const childId = world.organisms.find((o) => o.id !== 1)!.id;

    world = stepWorld(world, c).world;
    const child = findOrganism(world, childId)!;
    expect(child.age).toBe(1); // aged exactly once
    expect(child.energy).toBeLessThan(c.energy.birthEnergy); // paid metabolism
  });

  it('a newborn cannot itself reproduce in its birth tick', () => {
    const c = reproConfig();
    c.lifecycle.maturityAge = 0; // even with maturity trivially satisfied
    c.energy.birthEnergy = 90; // and plenty of birth energy
    c.energy.reproductionCost = 95;
    c.energy.reproductionEnergyThreshold = 50;
    const parent = makeOrganism({ id: 1, genome: wantsToReproduce, x: 100, y: 100, energy: 100, age: 50 });
    const result = stepWorld(makeWorld({ config: c, organisms: [parent] }), c);
    // exactly one birth this tick: the child did not immediately reproduce
    expect(result.telemetry.births).toBe(1);
  });
});
