import { describe, it, expect } from 'vitest';
import { evaluateDeath, isDeadByAge, isDeadByEnergy } from '../src/biology/energy.js';
import { stepWorld } from '../src/world/stepWorld.js';
import { constantGenome, makeOrganism, makeWorld, testConfig, findOrganism } from './helpers.js';

describe('death conditions (§12.28, §12.30, §20.72 phase 16)', () => {
  const config = testConfig();

  it('starvation: energy <= 0 is death', () => {
    const alive = makeOrganism({ id: 1, genome: constantGenome({}), energy: 0.0001 });
    const dead = makeOrganism({ id: 2, genome: constantGenome({}), energy: 0 });
    const veryDead = makeOrganism({ id: 3, genome: constantGenome({}), energy: -5 });
    expect(isDeadByEnergy(alive)).toBe(false);
    expect(isDeadByEnergy(dead)).toBe(true);
    expect(isDeadByEnergy(veryDead)).toBe(true);
    expect(evaluateDeath(dead, config.lifecycle)).toBe('ENERGY_DEPLETION');
  });

  it('maximum age boundary: age = maxAge - 1 survives, age = maxAge dies', () => {
    const justUnder = makeOrganism({ id: 1, genome: constantGenome({}), energy: 50, age: config.lifecycle.maxAge - 1 });
    const atLimit = makeOrganism({ id: 2, genome: constantGenome({}), energy: 50, age: config.lifecycle.maxAge });
    const over = makeOrganism({ id: 3, genome: constantGenome({}), energy: 50, age: config.lifecycle.maxAge + 1 });

    expect(isDeadByAge(justUnder, config.lifecycle)).toBe(false);
    expect(isDeadByAge(atLimit, config.lifecycle)).toBe(true);
    expect(isDeadByAge(over, config.lifecycle)).toBe(true);

    expect(evaluateDeath(justUnder, config.lifecycle)).toBeNull();
    expect(evaluateDeath(atLimit, config.lifecycle)).toBe('MAX_AGE');
  });

  it('maxAge is configurable, not a hard-coded constant', () => {
    const shortLived = testConfig((c) => {
      c.lifecycle.maxAge = 10;
      c.lifecycle.maturityAge = 5;
    });
    const o = makeOrganism({ id: 1, genome: constantGenome({}), energy: 50, age: 10 });
    expect(isDeadByAge(o, shortLived.lifecycle)).toBe(true);
    expect(isDeadByAge(o, config.lifecycle)).toBe(false);
  });

  it('an organism reaching maxAge in the tick pipeline is removed from the active set', () => {
    const c = testConfig((cfg) => {
      cfg.lifecycle.maxAge = 5;
      cfg.lifecycle.maturityAge = 2;
      cfg.food.regenAttemptsPerTick = 0;
    });
    // age 4 -> ages to 5 during the tick -> dies at phase 16
    const o = makeOrganism({ id: 1, genome: constantGenome({ forward: 0.001 }), x: 50, y: 50, energy: 90, age: 4 });
    const after = stepWorld(makeWorld({ config: c, organisms: [o] }), c).world;
    expect(after.organisms.length).toBe(0);
  });

  it('an organism one tick short of maxAge survives the tick', () => {
    const c = testConfig((cfg) => {
      cfg.lifecycle.maxAge = 5;
      cfg.lifecycle.maturityAge = 2;
      cfg.food.regenAttemptsPerTick = 0;
    });
    const o = makeOrganism({ id: 1, genome: constantGenome({ forward: 0.001 }), x: 50, y: 50, energy: 90, age: 3 });
    const after = stepWorld(makeWorld({ config: c, organisms: [o] }), c).world;
    expect(after.organisms.length).toBe(1);
    expect(findOrganism(after, 1)!.age).toBe(4);
  });

  it('both conditions are evaluated in one pass; energy depletion is reported when both hold', () => {
    const o = makeOrganism({ id: 1, genome: constantGenome({}), energy: 0, age: config.lifecycle.maxAge });
    expect(evaluateDeath(o, config.lifecycle)).toBe('ENERGY_DEPLETION');
  });

  it('records the death cause and death tick', () => {
    const c = testConfig((cfg) => {
      cfg.food.regenAttemptsPerTick = 0;
    });
    const o = makeOrganism({ id: 1, genome: constantGenome({ forward: 0.001 }), x: 50, y: 50, energy: 0.001 });
    const result = stepWorld(makeWorld({ config: c, organisms: [o], tick: 42 }), c);
    expect(result.telemetry.deaths).toBe(1);
    expect(result.world.organisms.length).toBe(0);
  });
});

describe('same-tick feeding rescue (§20.72, [LOCKED])', () => {
  it('food eaten this tick rescues an organism that movement cost would otherwise have killed', () => {
    const c = testConfig((cfg) => {
      cfg.world.width = 100;
      cfg.world.height = 100;
      cfg.food.regenAttemptsPerTick = 0;
      cfg.food.feedingRange = 5;
    });
    // Energy just under the tick's basal+movement cost, but food is in reach
    // and the controller requests eating.
    const genome = constantGenome({ forward: 0.001, turn: 0, eat: 0.999, reproduce: 0.001 }, { metabolism: 1, size: 1 });
    const o = makeOrganism({ id: 1, genome, x: 50, y: 50, heading: 0, energy: 0.01 });

    // Control: identical organism, identical energy, no food nearby -> dies.
    const control = stepWorld(makeWorld({ config: c, organisms: [makeOrganism({ id: 1, genome, x: 50, y: 50, energy: 0.01 })], food: [] }), c).world;
    expect(control.organisms.length).toBe(0);

    // Rescue: same organism, one food item within feeding range -> survives.
    const rescued = stepWorld(makeWorld({ config: c, organisms: [o], food: [{ id: 1, x: 51, y: 50 }] }), c).world;
    expect(rescued.organisms.length).toBe(1);
    expect(findOrganism(rescued, 1)!.energy).toBeGreaterThan(0);
    expect(rescued.food.length).toBe(0); // the food was consumed
  });

  it('an organism can feed, reproduce, and still die in the same tick when the reproduction cost takes it to zero', () => {
    const c = testConfig((cfg) => {
      cfg.world.width = 100;
      cfg.world.height = 100;
      cfg.food.regenAttemptsPerTick = 0;
      cfg.food.feedingRange = 5;
      cfg.lifecycle.maturityAge = 1;
      cfg.energy.reproductionEnergyThreshold = 25;
      cfg.energy.reproductionCost = 26; // takes the parent below zero after feeding
      cfg.energy.birthEnergy = 10;
      cfg.energy.foodEnergyValue = 25;
      cfg.mutation.morphologyMutationEnabled = false;
      cfg.mutation.neuralMutationEnabled = false;
    });
    const genome = constantGenome({ forward: 0.001, turn: 0, eat: 0.999, reproduce: 0.999 }, { metabolism: 1, size: 1 });
    const parent = makeOrganism({ id: 1, genome, x: 50, y: 50, heading: 0, energy: 0.5, age: 5 });

    const result = stepWorld(makeWorld({ config: c, organisms: [parent], food: [{ id: 1, x: 51, y: 50 }] }), c);
    expect(result.telemetry.births).toBe(1); // it reproduced
    expect(result.telemetry.deaths).toBe(1); // and still died
    // the child survives and is the only organism left
    expect(result.world.organisms.length).toBe(1);
    expect(result.world.organisms[0]!.parentId).toBe(1);
  });
});
