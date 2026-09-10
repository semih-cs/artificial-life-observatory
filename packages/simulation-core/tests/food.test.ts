import { describe, it, expect } from 'vitest';
import { resolveFeeding } from '../src/world/foodCompetition.js';
import { regenerateFood } from '../src/world/foodRegen.js';
import { generateFertilityField, fertilityAt, meanFertility } from '../src/world/fertility.js';
import { bootstrapWorld } from '../src/world/bootstrap.js';
import { stepWorld } from '../src/world/stepWorld.js';
import { RngStream } from '../src/rng/rngStream.js';
import { ActionIntent } from '../src/actions/types.js';
import { FoodItem } from '../src/world/types.js';
import { constantGenome, makeOrganism, makeWorld, testConfig, uniformFertility } from './helpers.js';

function eatIntent(id: number): ActionIntent {
  return { organismId: id, requestedForwardSpeed: 0, requestedTurnRate: 0, eatRequested: true, reproduceRequested: false };
}

describe('food competition (§20.72 steps 6-7, §12.16, §12.17)', () => {
  const genome = constantGenome({});

  it('food is single-consumption: only one organism gets a contested item', () => {
    const a = makeOrganism({ id: 1, genome, x: 10, y: 10 });
    const b = makeOrganism({ id: 2, genome, x: 11, y: 10 });
    const food: FoodItem[] = [{ id: 1, x: 10.5, y: 10 }];
    const intents = new Map([
      [1, eatIntent(1)],
      [2, eatIntent(2)],
    ]);
    const result = resolveFeeding([a, b], intents, food, 5);
    expect(result.consumedFoodIds.size).toBe(1);
    expect(result.consumptions.size).toBe(1);
  });

  it('the nearest organism wins a contested food item', () => {
    const near = makeOrganism({ id: 2, genome, x: 10.4, y: 10 });
    const far = makeOrganism({ id: 1, genome, x: 12, y: 10 });
    const food: FoodItem[] = [{ id: 1, x: 10.5, y: 10 }];
    const intents = new Map([
      [1, eatIntent(1)],
      [2, eatIntent(2)],
    ]);
    const result = resolveFeeding([far, near], intents, food, 5);
    // organism 2 is nearer despite having the higher ID and appearing second
    expect(result.consumptions.get(2)).toBe(1);
    expect(result.consumptions.has(1)).toBe(false);
  });

  it('exact-distance ties are broken by ascending organism ID', () => {
    const a = makeOrganism({ id: 9, genome, x: 9, y: 10 });
    const b = makeOrganism({ id: 3, genome, x: 11, y: 10 });
    const food: FoodItem[] = [{ id: 1, x: 10, y: 10 }];
    const intents = new Map([
      [9, eatIntent(9)],
      [3, eatIntent(3)],
    ]);
    const result = resolveFeeding([a, b], intents, food, 5);
    expect(result.consumptions.get(3)).toBe(1);
  });

  it('array/container order does NOT determine the winner (reversed input order gives the same result)', () => {
    const a = makeOrganism({ id: 9, genome, x: 9, y: 10 });
    const b = makeOrganism({ id: 3, genome, x: 11, y: 10 });
    const c = makeOrganism({ id: 5, genome, x: 10, y: 12 });
    const food: FoodItem[] = [
      { id: 4, x: 10, y: 10 },
      { id: 2, x: 10, y: 10.5 },
    ];
    const intents = new Map([
      [9, eatIntent(9)],
      [3, eatIntent(3)],
      [5, eatIntent(5)],
    ]);
    const forward = resolveFeeding([a, b, c], intents, food, 5);
    const reversed = resolveFeeding([c, b, a], intents, [...food].reverse(), 5);
    expect([...reversed.consumptions.entries()].sort()).toEqual([...forward.consumptions.entries()].sort());
    expect([...reversed.consumedFoodIds].sort()).toEqual([...forward.consumedFoodIds].sort());
  });

  it('an organism consumes at most one food item per tick', () => {
    const a = makeOrganism({ id: 1, genome, x: 10, y: 10 });
    const food: FoodItem[] = [
      { id: 1, x: 10, y: 10 },
      { id: 2, x: 10.1, y: 10 },
      { id: 3, x: 10.2, y: 10 },
    ];
    const result = resolveFeeding([a], new Map([[1, eatIntent(1)]]), food, 5);
    expect(result.consumedFoodIds.size).toBe(1);
  });

  it('eat intent AND physical reach are both required (§12.14)', () => {
    const noIntent = makeOrganism({ id: 1, genome, x: 10, y: 10 });
    const outOfRange = makeOrganism({ id: 2, genome, x: 100, y: 100 });
    const food: FoodItem[] = [{ id: 1, x: 10, y: 10 }];

    const noEat = resolveFeeding(
      [noIntent],
      new Map([[1, { ...eatIntent(1), eatRequested: false }]]),
      food,
      5
    );
    expect(noEat.consumedFoodIds.size).toBe(0);

    const tooFar = resolveFeeding([outOfRange], new Map([[2, eatIntent(2)]]), food, 5);
    expect(tooFar.consumedFoodIds.size).toBe(0);
  });

  it('consumes no RNG', () => {
    const rng = new RngStream(1, 'canonical');
    const before = rng.getState();
    const a = makeOrganism({ id: 1, genome, x: 10, y: 10 });
    resolveFeeding([a], new Map([[1, eatIntent(1)]]), [{ id: 1, x: 10, y: 10 }], 5);
    expect(rng.getState()).toEqual(before);
  });
});

describe('world food capacity (§12.19)', () => {
  it('regeneration can never push food above worldFoodCapacity', () => {
    const config = testConfig((c) => {
      c.food.worldFoodCapacity = 10;
      c.food.regenAttemptsPerTick = 25; // far more attempts than headroom
      c.food.minFoodSpawnDistance = 0;
    });
    const rng = new RngStream(1234, 'canonical');
    const world = { width: config.world.width, height: config.world.height };
    const fert = uniformFertility(1);

    let food: FoodItem[] = [];
    let nextFoodId = 1;
    for (let tick = 0; tick < 200; tick++) {
      const regen = regenerateFood(world, fert, rng, config.food, food, nextFoodId);
      food = [...food, ...regen.newFood];
      nextFoodId = regen.nextFoodId;
      expect(food.length).toBeLessThanOrEqual(config.food.worldFoodCapacity);
    }
    expect(food.length).toBe(config.food.worldFoodCapacity);
  });

  it('the cap holds through the full tick pipeline over many ticks', () => {
    const config = testConfig((c) => {
      c.food.worldFoodCapacity = 12;
      c.food.initialFoodCount = 5;
      c.food.regenAttemptsPerTick = 6;
      c.population.initialPopulationSize = 3;
    });
    let world = bootstrapWorld(config);
    for (let i = 0; i < 300; i++) {
      world = stepWorld(world, config).world;
      expect(world.food.length).toBeLessThanOrEqual(config.food.worldFoodCapacity);
    }
  });

  it('worldFoodCapacity is configurable', () => {
    const small = testConfig((c) => {
      c.food.worldFoodCapacity = 3;
      c.food.initialFoodCount = 1;
      c.food.regenAttemptsPerTick = 10;
      c.population.initialPopulationSize = 2;
    });
    let world = bootstrapWorld(small);
    for (let i = 0; i < 100; i++) world = stepWorld(world, small).world;
    expect(world.food.length).toBeLessThanOrEqual(3);
  });

  it('regeneration consumes a fixed number of draws per attempt regardless of outcome', () => {
    const config = testConfig((c) => {
      c.food.worldFoodCapacity = 0; // every attempt is rejected
      c.food.regenAttemptsPerTick = 4;
    });
    const rngRejecting = new RngStream(77, 'canonical');
    const rngPlain = new RngStream(77, 'canonical');
    regenerateFood({ width: 100, height: 100 }, uniformFertility(1), rngRejecting, config.food, [], 1);
    for (let i = 0; i < 4 * 3; i++) rngPlain.next();
    expect(rngRejecting.getState()).toEqual(rngPlain.getState());
  });
});

describe('static seeded fertility field (§12.22-§12.24)', () => {
  it('the same seed and config produce an identical fertility field', () => {
    const config = testConfig();
    const a = generateFertilityField(new RngStream(config.rootSeed, 'bootstrap'), config.fertility);
    const b = generateFertilityField(new RngStream(config.rootSeed, 'bootstrap'), config.fertility);
    expect(a).toEqual(b);
  });

  it('a different seed can produce a different fertility field', () => {
    const config = testConfig();
    const a = generateFertilityField(new RngStream(1, 'bootstrap'), config.fertility);
    const b = generateFertilityField(new RngStream(2, 'bootstrap'), config.fertility);
    expect(a).not.toEqual(b);
  });

  it('bootstrapping the same config twice gives the same field; a different seed gives a different one', () => {
    const config = testConfig((c) => {
      c.population.initialPopulationSize = 3;
    });
    const a = bootstrapWorld(config);
    const b = bootstrapWorld(config);
    expect(a.fertility).toEqual(b.fertility);

    const other = testConfig((c) => {
      c.population.initialPopulationSize = 3;
      c.rootSeed = config.rootSeed + 1;
    });
    expect(bootstrapWorld(other).fertility).not.toEqual(a.fertility);
  });

  it('the field is spatially heterogeneous, not uniform', () => {
    const config = testConfig();
    const field = generateFertilityField(new RngStream(7, 'bootstrap'), config.fertility);
    const world = { width: config.world.width, height: config.world.height };
    const samples: number[] = [];
    for (let i = 0; i < 200; i++) {
      samples.push(fertilityAt(field, (i * 37) % world.width, (i * 53) % world.height, world));
    }
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    expect(max - min).toBeGreaterThan(0.1);
  });

  it('every fertility value stays in [0, 1]', () => {
    const config = testConfig();
    const field = generateFertilityField(new RngStream(3, 'bootstrap'), config.fertility);
    const world = { width: config.world.width, height: config.world.height };
    for (const v of field.lattice) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // including at, and outside, the exact corners
    for (const [x, y] of [[0, 0], [world.width, world.height], [-10, -10], [world.width + 10, world.height + 10]] as const) {
      const v = fertilityAt(field, x, y, world);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('the field never changes during simulation (no simulation-time mutation)', () => {
    const config = testConfig((c) => {
      c.population.initialPopulationSize = 4;
    });
    let world = bootstrapWorld(config);
    const original = JSON.parse(JSON.stringify(world.fertility));
    for (let i = 0; i < 100; i++) world = stepWorld(world, config).world;
    expect(JSON.parse(JSON.stringify(world.fertility))).toEqual(original);
  });

  it('food spawning is influenced by fertility, not uniform', () => {
    // A field that is fertile on the left half and barren on the right.
    const resolution = 2;
    const n = resolution + 1;
    const lattice = new Array(n * n).fill(0);
    for (let row = 0; row < n; row++) {
      lattice[row * n + 0] = 1;
      lattice[row * n + 1] = 0.5;
      lattice[row * n + 2] = 0;
    }
    const field = { resolution, lattice };

    const config = testConfig((c) => {
      c.food.worldFoodCapacity = 100000;
      c.food.regenAttemptsPerTick = 200;
      c.food.minFoodSpawnDistance = 0;
    });
    const world = { width: 100, height: 100 };
    const rng = new RngStream(555, 'canonical');
    const regen = regenerateFood(world, field, rng, config.food, [], 1);

    const left = regen.newFood.filter((f) => f.x < 50).length;
    const right = regen.newFood.filter((f) => f.x >= 50).length;
    expect(left).toBeGreaterThan(right * 2);
  });

  it('food spawning ignores organism positions entirely (no adaptive assistance, §12.26)', () => {
    const config = testConfig((c) => {
      c.food.regenAttemptsPerTick = 5;
      c.food.worldFoodCapacity = 1000;
    });
    const field = uniformFertility(1);
    const world = { width: 100, height: 100 };
    // regenerateFood's signature takes no organism argument at all; the same
    // RNG state therefore produces the same food regardless of population.
    const a = regenerateFood(world, field, new RngStream(9, 'canonical'), config.food, [], 1);
    const b = regenerateFood(world, field, new RngStream(9, 'canonical'), config.food, [], 1);
    expect(a.newFood).toEqual(b.newFood);
  });

  it('mean fertility respects the configured floor', () => {
    const config = testConfig((c) => {
      c.fertility.minFertility = 0.4;
    });
    const field = generateFertilityField(new RngStream(11, 'bootstrap'), config.fertility);
    expect(Math.min(...field.lattice)).toBeGreaterThanOrEqual(0.4);
    expect(meanFertility(field)).toBeGreaterThan(0.4);
  });
});
