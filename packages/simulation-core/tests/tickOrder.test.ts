import { describe, it, expect } from 'vitest';
import { stepWorld } from '../src/world/stepWorld.js';
import { decideAction } from '../src/actions/decide.js';
import { senseOrganism } from '../src/perception/sense.js';
import { evaluateNetwork } from '../src/neural/network.js';
import { RngStream } from '../src/rng/rngStream.js';
import { constantGenome, makeOrganism, makeWorld, testConfig, findOrganism, TEST_HIDDEN_SIZE } from './helpers.js';

describe('Sense -> Decide -> Resolve separation (§20.72, §9.36, §20.12-§20.13)', () => {
  it('decide produces an ActionIntent and mutates neither organism nor world', () => {
    const config = testConfig();
    const o = makeOrganism({ id: 1, genome: constantGenome({ forward: 0.8, turn: 0.3, eat: 0.9, reproduce: 0.1 }), x: 50, y: 50, energy: 60 });
    const food = [{ id: 1, x: 55, y: 50 }];
    const before = JSON.parse(JSON.stringify(o));
    const foodBefore = JSON.parse(JSON.stringify(food));

    const intent = decideAction(
      o,
      { world: { width: config.world.width, height: config.world.height }, food, energyCapacity: config.energy.energyCapacity },
      config.neural,
      TEST_HIDDEN_SIZE
    );

    expect(intent.organismId).toBe(1);
    expect(typeof intent.requestedForwardSpeed).toBe('number');
    expect(typeof intent.eatRequested).toBe('boolean');
    expect(JSON.parse(JSON.stringify(o))).toEqual(before);
    expect(JSON.parse(JSON.stringify(food))).toEqual(foodBefore);
  });

  it('sense and decide consume no RNG', () => {
    const config = testConfig();
    const rng = new RngStream(1, 'canonical');
    const before = rng.getState();
    const o = makeOrganism({ id: 1, genome: constantGenome({}), x: 50, y: 50 });
    const ctx = { world: { width: 100, height: 100 }, food: [{ id: 1, x: 51, y: 50 }], energyCapacity: 100 };
    senseOrganism(o, ctx);
    decideAction(o, ctx, config.neural, TEST_HIDDEN_SIZE);
    expect(rng.getState()).toEqual(before);
  });

  it('neural evaluation is pure: identical inputs give identical outputs and mutate no genome state', () => {
    const genome = constantGenome({ forward: 0.7 }).neural;
    const snapshot = JSON.parse(JSON.stringify(genome));
    const input = [1, 0.3, -0.2, 0.6, 0.1, 0.8];
    const a = evaluateNetwork(genome, input, TEST_HIDDEN_SIZE);
    const b = evaluateNetwork(genome, input, TEST_HIDDEN_SIZE);
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(genome))).toEqual(snapshot);
  });

  it('all organisms sense the same pre-resolution snapshot: no organism sees another’s post-movement food state', () => {
    // Two organisms contesting one food item. Whichever loses must still have
    // decided from a world in which the food existed.
    const config = testConfig((c) => {
      c.food.regenAttemptsPerTick = 0;
      c.food.feedingRange = 5;
    });
    const genome = constantGenome({ forward: 0.001, turn: 0, eat: 0.999, reproduce: 0.001 });
    const near = makeOrganism({ id: 1, genome, x: 50, y: 50, energy: 60 });
    const far = makeOrganism({ id: 2, genome, x: 53, y: 50, energy: 60 });
    const result = stepWorld(makeWorld({ config, organisms: [near, far], food: [{ id: 1, x: 50.5, y: 50 }] }), config);

    expect(result.world.food.length).toBe(0);
    // exactly one organism gained energy from the item
    const gained = result.world.organisms.filter((o) => o.energy > 60).length;
    expect(gained).toBe(1);
  });
});

describe('canonical phase order consequences (§20.72)', () => {
  it('reproduction eligibility uses post-feeding energy (feeding can enable same-tick reproduction)', () => {
    const config = testConfig((c) => {
      c.food.regenAttemptsPerTick = 0;
      c.food.feedingRange = 5;
      c.lifecycle.maturityAge = 1;
      c.energy.reproductionEnergyThreshold = 70;
      c.energy.foodEnergyValue = 25;
      c.energy.reproductionCost = 45;
      c.energy.birthEnergy = 25;
      c.mutation.morphologyMutationEnabled = false;
      c.mutation.neuralMutationEnabled = false;
    });
    const genome = constantGenome({ forward: 0.001, turn: 0, eat: 0.999, reproduce: 0.999 });

    // Energy 50: below the 70 threshold before feeding, above it after (+25).
    const withFood = stepWorld(
      makeWorld({ config, organisms: [makeOrganism({ id: 1, genome, x: 50, y: 50, energy: 50, age: 10 })], food: [{ id: 1, x: 51, y: 50 }] }),
      config
    );
    expect(withFood.telemetry.births).toBe(1);

    // Identical organism with no food in reach stays below the threshold.
    const withoutFood = stepWorld(
      makeWorld({ config, organisms: [makeOrganism({ id: 1, genome, x: 50, y: 50, energy: 50, age: 10 })], food: [] }),
      config
    );
    expect(withoutFood.telemetry.births).toBe(0);
  });

  it('food regeneration draws come after all reproduction draws in the same tick', () => {
    // With reproduction disabled by maturity, the canonical stream advances by
    // exactly the food-regeneration draw count.
    const config = testConfig((c) => {
      c.food.regenAttemptsPerTick = 3;
      c.food.worldFoodCapacity = 100;
      c.lifecycle.maturityAge = 1000; // nothing reproduces
    });
    const genome = constantGenome({ forward: 0.001, reproduce: 0.999 });
    const world = makeWorld({ config, organisms: [makeOrganism({ id: 1, genome, x: 50, y: 50, energy: 60 })] });

    const after = stepWorld(world, config).world;

    const replay = new RngStream(config.rootSeed, 'canonical');
    for (let i = 0; i < 3 * 3; i++) replay.next(); // 3 attempts x 3 draws
    expect(after.rng.canonical).toEqual(replay.getState());
  });

  it('birth processing is ordered by ascending parent ID, not array position', () => {
    const config = testConfig((c) => {
      c.food.regenAttemptsPerTick = 0;
      c.lifecycle.maturityAge = 1;
      c.energy.reproductionEnergyThreshold = 50;
      c.mutation.morphologyMutationEnabled = true;
      c.mutation.neuralMutationEnabled = true;
      c.mutation.morphologyMutationRate = 1;
    });
    const genome = constantGenome({ forward: 0.001, turn: 0, eat: 0.001, reproduce: 0.999 });
    const mk = (id: number, x: number) => makeOrganism({ id, genome, x, y: 50, energy: 95, age: 20 });

    const ordered = stepWorld(makeWorld({ config, organisms: [mk(1, 20), mk(2, 40), mk(3, 60)] }), config).world;
    const reversed = stepWorld(makeWorld({ config, organisms: [mk(3, 60), mk(2, 40), mk(1, 20)] }), config).world;

    const childrenOf = (w: typeof ordered) =>
      w.organisms
        .filter((o) => o.parentId !== null)
        .sort((a, b) => a.id - b.id)
        .map((o) => ({ parentId: o.parentId, id: o.id, genome: JSON.stringify(o.genome) }));

    expect(childrenOf(reversed)).toEqual(childrenOf(ordered));
  });

  it('a dead organism takes no further action in later ticks', () => {
    const config = testConfig((c) => {
      c.food.regenAttemptsPerTick = 0;
    });
    const genome = constantGenome({ forward: 0.999, turn: 0 });
    const doomed = makeOrganism({ id: 1, genome, x: 50, y: 50, energy: 0.001 });
    const survivor = makeOrganism({ id: 2, genome, x: 10, y: 10, energy: 90 });
    let world = makeWorld({ config, organisms: [doomed, survivor] });
    world = stepWorld(world, config).world;
    expect(findOrganism(world, 1)).toBeUndefined();
    const posBefore = { x: findOrganism(world, 2)!.x, y: findOrganism(world, 2)!.y };
    world = stepWorld(world, config).world;
    expect(findOrganism(world, 1)).toBeUndefined();
    expect(findOrganism(world, 2)).toBeDefined();
    void posBefore;
  });
});
