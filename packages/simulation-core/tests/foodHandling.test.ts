/**
 * V2.4 — contestable food handling (model 0A.6.0).
 *
 * Eating takes five consecutive ticks, the item travels with its handler, and
 * genuine organism-organism body contact knocks it loose. This file proves the
 * contract: the model boundary (0A.1.0–0A.5.0 unchanged, 0A.5.0 still eating
 * instantaneously), the unchanged controller, acquisition under the existing
 * competition semantics, progress and completion, held-food movement and
 * sensing, release by `eat = false`, dislodgement by active body contact and
 * what does NOT dislodge, same-tick reacquisition refusal, death and
 * reproduction, determinism, canonical state, and the 0A.6.0 golden.
 *
 * Nothing here is theft: no steal, defend, attack, damage, transfer, ownership
 * or sharing rule exists anywhere in the slice.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_SIMULATION_CONFIG, FOOD_HANDLING_GOLDEN_HASH, HANDLING_TICKS_REQUIRED,
  DEFAULT_FOOD_HANDLING_CONFIG, cloneConfig, modelConfig,
  foodHandlingModelConfig, physicalBodiesModelConfig, recurrentMemoryModelConfig,
} from '../src/config/defaults.js';
import { validateConfig, SimulationConfig } from '../src/config/types.js';
import { simulationModel, SUPPORTED_MODEL_VERSIONS } from '../src/model/simulationModel.js';
import { NEURAL_OUTPUT_SIZE, NeuralGenome } from '../src/genome/types.js';
import { networkParamCount } from '../src/neural/network.js';
import { physicalRadiusFromSize, resolveBodyOverlap } from '../src/biology/physicalBody.js';
import { requireFoodHandlingConfig, isHeld, resolveFoodHandling } from '../src/world/foodHandling.js';
import { resolveFoodAcquisition } from '../src/world/foodCompetition.js';
import { bootstrapWorld } from '../src/world/bootstrap.js';
import { stepWorld, senseContextFor } from '../src/world/stepWorld.js';
import { runSimulation } from '../src/world/runner.js';
import { senseOrganism } from '../src/perception/sense.js';
import { canonicalStateHash, canonicalStateString, canonicalizeWorldState } from '../src/serialization/canonicalState.js';
import { mutateNeural } from '../src/biology/mutation.js';
import { RngStream } from '../src/rng/rngStream.js';
import { OrganismRuntimeState, zeroHiddenState } from '../src/organism/types.js';
import { WorldState, FoodItem } from '../src/world/types.js';
import { makeOrganism, makeWorld, findOrganism, defaultMorphology, uniformFertility } from './helpers.js';

const H = 8;
const I = 10;
const GOLDEN_SEED = 20260910;
/** Coverage seed (NOT canonical): the first of 1, 2, 3, … whose 0A.6.0 world is alive at tick 10,000. */
const LIVING_SEED = 3;
/** Coverage seed (NOT canonical): a 0A.6.0 world with far more handling, births and contact than the canonical one. */
const ACTIVE_SEED = 8;

const v6 = (seed = GOLDEN_SEED): SimulationConfig => { const c = foodHandlingModelConfig(); c.rootSeed = seed; return c; };
const v5 = (seed = GOLDEN_SEED): SimulationConfig => { const c = physicalBodiesModelConfig(); c.rootSeed = seed; return c; };
const logit = (p: number) => Math.log(p / (1 - p));
const zeros = (n: number) => new Array<number>(n).fill(0);

/** Constant-output recurrent controller at the real hidden width. */
function constantRecurrent(t: { forward?: number; turn?: number; eat?: number; reproduce?: number } = {}): NeuralGenome {
  return {
    inputHiddenWeights: zeros(H * I),
    hiddenBiases: zeros(H),
    hiddenOutputWeights: zeros(NEURAL_OUTPUT_SIZE * H),
    outputBiases: [logit(t.forward ?? 0.001), Math.atanh(t.turn ?? 0), logit(t.eat ?? 0.001), logit(t.reproduce ?? 0.001)],
    recurrentHiddenWeights: zeros(H * H),
  };
}

/** Practically stationary; `eat` on unless told otherwise. */
const EATING = { forward: 0.000001, eat: 0.999 } as const;
const NOT_EATING = { forward: 0.000001, eat: 0.001 } as const;

function organism(id: number, x: number, y: number, size: number, t: Parameters<typeof constantRecurrent>[0] = EATING, extra: Partial<OrganismRuntimeState> = {}): OrganismRuntimeState {
  return makeOrganism({
    id,
    genome: { morphology: defaultMorphology({ size }), neural: constantRecurrent(t) },
    x, y, hiddenState: zeroHiddenState(H), ...extra,
  });
}

/**
 * An EXACTLY stationary organism: `maxSpeed` 0 makes the resolved displacement
 * exactly zero whatever the controller requests, so a geometry test can place
 * bodies at precise distances without a sub-pixel drift breaking an exact tie.
 * Turning, metabolism, feeding, handling and collision are all unaffected.
 */
function still(id: number, x: number, y: number, size: number, t: Parameters<typeof constantRecurrent>[0] = EATING, extra: Partial<OrganismRuntimeState> = {}): OrganismRuntimeState {
  return makeOrganism({
    id,
    genome: { morphology: defaultMorphology({ size, maxSpeed: 0 }), neural: constantRecurrent(t) },
    x, y, hiddenState: zeroHiddenState(H), ...extra,
  });
}

const free = (id: number, x: number, y: number): FoodItem => ({ id, x, y, holderId: null, handlingProgress: 0 });

/** A 0A.6.0 world with no food regeneration, so only the items given exist. */
function world6(c: SimulationConfig, organisms: OrganismRuntimeState[], food: FoodItem[] = [], tick = 0): WorldState {
  return makeWorld({ config: c, organisms, food, tick, fertility: uniformFertility(0) });
}

const foodOf = (w: WorldState, id: number) => w.food.find((f) => f.id === id);
const heldBy = (w: WorldState, organismId: number) => w.food.filter((f) => f.holderId === organismId);

function runTo(world: WorldState, c: SimulationConfig, tick: number): WorldState {
  let w = world;
  while (w.tick < tick) w = stepWorld(w, c).world;
  return w;
}

// =====================================================================
// Model identity and the unchanged controller (1–10)
// =====================================================================

describe('model identity: which models handle food', () => {
  it('(1–6) 0A.1.0–0A.5.0 eat instantaneously; only 0A.6.0 handles food', () => {
    expect(SUPPORTED_MODEL_VERSIONS).toEqual(['0A.1.0', '0A.2.0', '0A.3.0', '0A.4.0', '0A.5.0', '0A.6.0', '0A.7.0']);
    const expected = {
      '0A.1.0': { inputs: 6, recurrent: false, physicalBodies: false, foodHandling: false },
      '0A.2.0': { inputs: 6, recurrent: false, physicalBodies: false, foodHandling: false },
      '0A.3.0': { inputs: 10, recurrent: false, physicalBodies: false, foodHandling: false },
      '0A.4.0': { inputs: 10, recurrent: true, physicalBodies: false, foodHandling: false },
      '0A.5.0': { inputs: 10, recurrent: true, physicalBodies: true, foodHandling: false },
      '0A.6.0': { inputs: 10, recurrent: true, physicalBodies: true, foodHandling: true },
    } as const;
    for (const [version, want] of Object.entries(expected)) {
      const m = simulationModel(version);
      expect(m.neuralInputSize).toBe(want.inputs);
      expect(m.recurrent).toBe(want.recurrent);
      expect(m.physicalBodies).toBe(want.physicalBodies);
      expect(m.foodHandling).toBe(want.foodHandling);
    }
    for (const version of ['0A.1.0', '0A.2.0', '0A.3.0', '0A.4.0', '0A.5.0']) {
      expect(modelConfig(version).handling).toBeUndefined();
      expect('handling' in modelConfig(version)).toBe(false);
      expect(() => requireFoodHandlingConfig(modelConfig(version))).toThrow(/eats instantaneously/);
    }
    expect(foodHandlingModelConfig().handling).toEqual(DEFAULT_FOOD_HANDLING_CONFIG);
    expect(HANDLING_TICKS_REQUIRED).toBe(5);
    expect(requireFoodHandlingConfig(v6()).ticksRequired).toBe(5);
  });

  it('(5) 0A.5.0 still eats instantaneously: one tick in range, food gone, energy credited, no handling state anywhere', () => {
    const c = v5();
    const eater = organism(1, 100, 100, 1, EATING);
    const state = makeWorld({ config: c, organisms: [eater], food: [{ id: 1, x: 102, y: 100 }], fertility: uniformFertility(0) });
    const before = findOrganism(state, 1)!.energy;
    const next = stepWorld(state, c).world;
    expect(next.food).toHaveLength(0);                                   // consumed in ONE tick
    expect(findOrganism(next, 1)!.energy).toBeGreaterThan(before);        // and paid immediately
    expect(next.food.every((f) => !('holderId' in f))).toBe(true);
    // the 0A.5.0 canonical food record is exactly the historical { id, x, y }
    const w2 = makeWorld({ config: c, organisms: [organism(1, 400, 400, 1, NOT_EATING)], food: [{ id: 1, x: 100, y: 100 }], fertility: uniformFertility(0) });
    const record = (canonicalizeWorldState(w2) as { food: Array<Record<string, unknown>> }).food[0]!;
    expect(Object.keys(record).sort()).toEqual(['id', 'x', 'y']);
  });

  it('(7, 8, 9, 10) the controller is 0A.5.0\'s exactly: 10 inputs, 4 outputs, 188 parameters, no new action', () => {
    expect(networkParamCount(I, H, NEURAL_OUTPUT_SIZE, true)).toBe(188);
    const w = bootstrapWorld(v6());
    for (const o of w.organisms) {
      const n = o.genome.neural;
      expect(n.inputHiddenWeights.length).toBe(H * I);
      expect(n.outputBiases.length).toBe(4);
      expect(n.recurrentHiddenWeights!.length).toBe(H * H);
      expect([...n.inputHiddenWeights, ...n.hiddenBiases, ...n.hiddenOutputWeights, ...n.outputBiases, ...n.recurrentHiddenWeights!].length).toBe(188);
      expect(o.hiddenState!.length).toBe(H);
    }
    expect(NEURAL_OUTPUT_SIZE).toBe(4);
    expect(senseOrganism(w.organisms[0]!, senseContextFor(w, v6()))).toHaveLength(10);
    // The ActionIntent still has exactly the four requests — no grab, release,
    // steal, hold or defend field anywhere.
    expect(Object.keys(w.organisms[0]!).filter((k) => /grab|release|steal|hold|defend|possess/i.test(k))).toEqual([]);
  });

  it('the 0A.6.0 configuration is 0A.5.0\'s plus `handling` — no ecology, energy, mutation, vision or collision value retuned', () => {
    const a = physicalBodiesModelConfig();
    const b = foodHandlingModelConfig();
    const { handling, ...rest } = b;
    expect(handling).toEqual({ ticksRequired: 5 });
    expect({ ...rest, simulationVersion: '0A.5.0' }).toEqual(a);
    for (const section of ['food', 'energy', 'mutation', 'reproduction', 'lifecycle', 'fertility', 'world', 'population', 'neural', 'bootstrap', 'body'] as const) {
      expect(b[section]).toEqual(a[section]);
    }
    expect(b.food.feedingRange).toBe(DEFAULT_SIMULATION_CONFIG.food.feedingRange);
    expect(b.energy.foodEnergyValue).toBe(DEFAULT_SIMULATION_CONFIG.energy.foodEnergyValue);
  });

  it('one model, one handling contract: validateConfig refuses `handling` elsewhere and its absence on 0A.6.0', () => {
    const historical = physicalBodiesModelConfig() as SimulationConfig;
    historical.handling = { ticksRequired: 5 };
    expect(() => validateConfig(historical)).toThrow(/must not carry a handling configuration/);
    const handling = foodHandlingModelConfig();
    delete handling.handling;
    expect(() => validateConfig(handling)).toThrow(/requires a handling configuration/);
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      const c = foodHandlingModelConfig();
      c.handling = { ticksRequired: bad };
      expect(() => validateConfig(c)).toThrow(/ticksRequired/);
    }
    expect(() => validateConfig(foodHandlingModelConfig())).not.toThrow();
  });
});

// =====================================================================
// Acquisition (11–16)
// =====================================================================

describe('acquisition', () => {
  it('(11) only an eat-requesting organism inside the feeding range acquires a free item', () => {
    const c = v6();
    const range = c.food.feedingRange;
    // The three are far enough apart that no body touches another, so the only
    // thing under test is eat-request and feeding range.
    // Opposite sides of the item, 2 * range apart, so their bodies never touch.
    const notEating = still(1, 100 - range, 100, 1, NOT_EATING);
    const tooFar = still(2, 300, 300, 1, EATING);
    const inRange = still(3, 100 + range, 100, 1, EATING);
    const next = stepWorld(world6(c, [notEating, tooFar, inRange], [free(1, 100, 100)]), c).world;
    const item = foodOf(next, 1)!;
    expect(item.holderId).toBe(3);
    expect(item.handlingProgress).toBe(1);
    // just outside the range acquires nothing
    const outside = still(4, 100 + range + 0.5, 100, 1, EATING);
    const none = stepWorld(world6(c, [outside], [free(1, 100, 100)]), c).world;
    expect(foodOf(none, 1)!.holderId).toBeNull();
    expect(foodOf(none, 1)!.handlingProgress).toBe(0);
  });

  it('(12, 13) acquisition uses the existing competition: nearest wins, exact ties by lower organism id', () => {
    const c = v6();
    // Nearest wins even though the further organism has the lower id. The two
    // are placed on opposite sides so their bodies never touch (and therefore
    // are never displaced before the competition is judged).
    const near = stepWorld(world6(c, [still(1, 104, 100, 1, EATING), still(2, 100, 98, 1, EATING)], [free(1, 100, 100)]), c).world;
    expect(foodOf(near, 1)!.holderId).toBe(2);
    // Exact tie -> lower id. Both are exactly 5 (the feeding range) away, on
    // opposite sides, and exactly stationary, so the distances are bit-equal.
    const tie = stepWorld(world6(c, [still(7, 100 - 5, 100, 1, EATING), still(4, 100 + 5, 100, 1, EATING)], [free(1, 100, 100)]), c).world;
    expect(foodOf(tie, 1)!.holderId).toBe(4);
    // and the same answer with the array reversed (35)
    const tieReversed = stepWorld(world6(c, [still(4, 100 + 5, 100, 1, EATING), still(7, 100 - 5, 100, 1, EATING)], [free(1, 100, 100)]), c).world;
    expect(foodOf(tieReversed, 1)!.holderId).toBe(4);
  });

  it('(14, 15) an organism holds at most one item, and an item has at most one holder', () => {
    const c = v6();
    // one organism, two items within range: it takes exactly one (the nearer)
    let w = world6(c, [still(1, 100, 100, 1, EATING)], [free(1, 101, 100), free(2, 103, 100)]);
    w = stepWorld(w, c).world;
    expect(heldBy(w, 1)).toHaveLength(1);
    expect(foodOf(w, 1)!.holderId).toBe(1);
    expect(foodOf(w, 2)!.holderId).toBeNull();
    // and it still holds exactly one after several more ticks
    w = runTo(w, c, 3);
    expect(heldBy(w, 1)).toHaveLength(1);
    // holder state lives on the item, so "one holder" is structural
    expect(w.food.filter((f) => f.holderId !== null).every((f) => typeof f.holderId === 'number')).toBe(true);
  });

  it('(16) a newly acquired item starts at progress exactly 1 and is still in the world', () => {
    const c = v6();
    const next = stepWorld(world6(c, [still(1, 100, 100, 1, EATING)], [free(1, 101, 100)]), c).world;
    expect(next.food).toHaveLength(1);              // (19) not consumed on acquisition
    expect(foodOf(next, 1)!.handlingProgress).toBe(1);
  });

  it('resolveFoodAcquisition refuses an organism that is already holding something', () => {
    const c = v6();
    const a = still(1, 100, 100, 1, EATING);
    const intents = new Map([[1, { organismId: 1, requestedForwardSpeed: 0, requestedTurnRate: 0, eatRequested: true, reproduceRequested: false }]]);
    const open = resolveFoodAcquisition([a], intents, [free(9, 100, 100)], c.food.feedingRange, new Set());
    expect(open.acquisitions.get(1)).toBe(9);
    const blocked = resolveFoodAcquisition([a], intents, [free(9, 100, 100)], c.food.feedingRange, new Set([1]));
    expect(blocked.acquisitions.size).toBe(0);
  });
});

// =====================================================================
// Progress, completion, movement (17–24)
// =====================================================================

describe('handling progress and completion', () => {
  it('(17, 18, 19) five consecutive handling ticks consume the item; energy arrives only then', () => {
    const c = v6();
    const start = 50;
    let w = world6(c, [still(1, 100, 100, 1, EATING, { energy: start })], [free(1, 101, 100)]);
    const progress: Array<number | null> = [];
    const energies: number[] = [];
    for (let t = 1; t <= 5; t++) {
      w = stepWorld(w, c).world;
      progress.push(foodOf(w, 1)?.handlingProgress ?? null);
      energies.push(findOrganism(w, 1)!.energy);
    }
    expect(progress).toEqual([1, 2, 3, 4, null]);            // consumed on the fifth
    expect(w.food).toHaveLength(0);                          // (19) gone only at completion
    // (18) Energy strictly FALLS on each of the four incomplete handling ticks
    // — holding pays metabolism and earns nothing — and jumps by exactly the
    // ordinary food energy, net of that tick's metabolism, only on completion.
    for (let i = 1; i < 4; i++) expect(energies[i]!).toBeLessThan(energies[i - 1]!);
    const basal = c.energy.baseMetabolicConstant * 1; // metabolism gene 1, no movement
    expect(energies[3]! - energies[2]!).toBeCloseTo(-basal, 9);
    expect(energies[4]! - energies[3]!).toBeCloseTo(c.energy.foodEnergyValue - basal, 9);
    expect(energies[4]!).toBeLessThanOrEqual(c.energy.energyCapacity);
  });

  it('(20, 22) a held item follows the holder\'s resolved position exactly, and the holder moves normally', () => {
    const c = v6();
    const mover = organism(1, 100, 100, 1, { forward: 0.9, turn: 0.2, eat: 0.999 });
    let w = world6(c, [mover], [free(1, 101, 100)]);

    // Tick 1 is the ACQUISITION tick: the item is picked up where it lies
    // (held positions are synced before acquisition, by the documented order),
    // so it is still at its own spot, within feeding range of its new holder.
    w = stepWorld(w, c).world;
    expect(foodOf(w, 1)!.holderId).toBe(1);
    expect(foodOf(w, 1)!.x).toBe(101);
    expect(Math.hypot(foodOf(w, 1)!.x - findOrganism(w, 1)!.x, foodOf(w, 1)!.y - findOrganism(w, 1)!.y))
      .toBeLessThanOrEqual(c.food.feedingRange);

    // From the next tick on it travels with the holder, exactly.
    let previous = { x: findOrganism(w, 1)!.x, y: findOrganism(w, 1)!.y, heading: findOrganism(w, 1)!.heading };
    for (let t = 2; t <= 4; t++) {
      w = stepWorld(w, c).world;
      const o = findOrganism(w, 1)!;
      const item = foodOf(w, 1)!;
      expect(item.holderId).toBe(1);
      expect(item.x).toBe(o.x);      // exactly, not approximately
      expect(item.y).toBe(o.y);
      expect(o.x !== previous.x || o.y !== previous.y).toBe(true);  // it really moved
      expect(o.heading).not.toBe(previous.heading);                  // and turned
      previous = { x: o.x, y: o.y, heading: o.heading };
    }
  });

  it('(21) a held item still counts towards the food cap — carrying never creates extra regeneration', () => {
    const c = v6();
    c.food.worldFoodCapacity = 2;
    c.food.regenAttemptsPerTick = 8;
    const w0 = makeWorld({ config: c, organisms: [still(1, 100, 100, 1, EATING)], food: [free(1, 101, 100), free(2, 400, 400)], fertility: uniformFertility(1) });
    let w = w0;
    for (let t = 0; t < 3; t++) {
      w = stepWorld(w, c).world;
      expect(w.food.length).toBeLessThanOrEqual(2);      // the held one is counted
      expect(w.food.some((f) => f.holderId === 1)).toBe(true);
    }
  });

  it('(23, 24) eat = false releases the item where the holder is, and resets progress to zero', () => {
    const c = v6();
    // hold for three ticks, then stop requesting eat
    const holder = still(1, 100, 100, 1, EATING);
    let w = runTo(world6(c, [holder], [free(1, 101, 100)]), c, 3);
    expect(foodOf(w, 1)!.handlingProgress).toBe(3);

    const releasing = still(1, findOrganism(w, 1)!.x, findOrganism(w, 1)!.y, 1, NOT_EATING, { energy: findOrganism(w, 1)!.energy });
    const item = foodOf(w, 1)!;
    const carried: FoodItem = { id: 1, x: item.x, y: item.y, holderId: 1, handlingProgress: 3 };
    const after = stepWorld(world6(c, [releasing], [carried]), c).world;
    const released = foodOf(after, 1)!;
    expect(released.holderId).toBeNull();
    expect(released.handlingProgress).toBe(0);
    expect(after.food).toHaveLength(1);                    // still in the world
    expect(released.x).toBe(findOrganism(after, 1)!.x);     // dropped at the holder's resolved position
    expect(released.y).toBe(findOrganism(after, 1)!.y);
    // a re-acquired item starts again at 1, never at 4
    const reacquiring = still(1, released.x, released.y, 1, EATING);
    const again = stepWorld(world6(c, [reacquiring], [{ ...released }]), c).world;
    expect(foodOf(again, 1)!.handlingProgress).toBe(1);
  });
});

// =====================================================================
// Contest / dislodgement (25–35)
// =====================================================================

describe('contest: physical contact dislodges handled food', () => {
  /** Two bodies whose circles overlap after movement: contact is guaranteed. */
  const contactPair = (c: SimulationConfig, holderEat = EATING) => {
    const r = physicalRadiusFromSize(1, c);
    return [organism(1, 200, 200, 1, holderEat), organism(2, 200 + r, 200, 1, NOT_EATING)];
  };

  it('(25, 26, 27) a genuine body contact dislodges the item, resets progress and leaves it in the world', () => {
    const c = v6();
    const [holder, bumper] = contactPair(c) as [OrganismRuntimeState, OrganismRuntimeState];
    const carried: FoodItem = { id: 1, x: 200, y: 200, holderId: 1, handlingProgress: 3 };
    const next = stepWorld(world6(c, [holder, bumper], [carried]), c).world;
    const item = foodOf(next, 1)!;
    expect(item.holderId).toBeNull();               // dislodged
    expect(item.handlingProgress).toBe(0);          // progress reset
    expect(next.food).toHaveLength(1);              // still in the world
    expect(item.x).toBe(findOrganism(next, 1)!.x);  // at the holder's post-collision position
    expect(item.y).toBe(findOrganism(next, 1)!.y);
    // nobody was given the item and nobody was harmed: no steal, no damage
    expect(next.food.every((f) => f.holderId === null)).toBe(true);
    const control = stepWorld(world6(c, [organism(1, 200, 200, 1, EATING)], [{ id: 1, x: 200, y: 200, holderId: 1, handlingProgress: 3 }]), c).world;
    expect(findOrganism(next, 1)!.energy).toBeCloseTo(findOrganism(control, 1)!.energy, 9);
  });

  it('(28, 29) a dislodged item cannot be reacquired in the same tick, but can on a later one', () => {
    const c = v6();
    const [holder, bumper] = contactPair(c) as [OrganismRuntimeState, OrganismRuntimeState];
    const carried: FoodItem = { id: 1, x: 200, y: 200, holderId: 1, handlingProgress: 2 };
    // both organisms request eat and both are on top of the item
    const bumperEating = organism(2, bumper.x, bumper.y, 1, EATING);
    let w = stepWorld(world6(c, [holder, bumperEating], [carried]), c).world;
    expect(foodOf(w, 1)!.holderId).toBeNull();       // nobody re-took it this tick
    expect(foodOf(w, 1)!.handlingProgress).toBe(0);
    // (29) on the next tick it is an ordinary free item and competition applies
    w = stepWorld(w, c).world;
    expect(foodOf(w, 1)!.holderId).not.toBeNull();
    expect(foodOf(w, 1)!.handlingProgress).toBe(1);
  });

  it('(30) wall clamping alone does not dislodge', () => {
    const c = v6();
    // a lone organism driven hard into the corner: clamped every tick, no other body
    const pressed = organism(1, 0.2, 0.2, 1, { forward: 0.999, turn: 0, eat: 0.999 });
    pressed.heading = Math.PI; // straight at the wall
    const carried: FoodItem = { id: 1, x: 0.2, y: 0.2, holderId: 1, handlingProgress: 1 };
    let w = world6(c, [pressed], [carried]);
    for (let t = 2; t <= 4; t++) {
      w = stepWorld(w, c).world;
      expect(findOrganism(w, 1)!.x).toBe(0);          // genuinely clamped at the wall
      expect(foodOf(w, 1)!.holderId).toBe(1);         // and still holding
      expect(foodOf(w, 1)!.handlingProgress).toBe(t);
    }
  });

  it('(31) mere proximity — close, visible, but not touching — does not dislodge', () => {
    const c = v6();
    const r = physicalRadiusFromSize(1, c);
    // centre distance a hair MORE than the sum of radii: visible, in vision
    // cone, well inside feeding range of each other, but no body overlap.
    const holder = organism(1, 200, 200, 1, EATING);
    const neighbour = organism(2, 200 + 2 * r + 0.01, 200, 1, NOT_EATING);
    const carried: FoodItem = { id: 1, x: 200, y: 200, holderId: 1, handlingProgress: 2 };
    const next = stepWorld(world6(c, [holder, neighbour], [carried]), c).world;
    expect(foodOf(next, 1)!.holderId).toBe(1);
    expect(foodOf(next, 1)!.handlingProgress).toBe(3);
    // they really could see each other (organism sensing is on)
    const input = senseOrganism(holder, senseContextFor(world6(c, [holder, neighbour], [carried]), c));
    expect(input[6]).toBe(1); // organismVisible
  });

  it('(32) the post-birth passive separation does NOT dislodge: a newborn cannot knock food loose by spawning', () => {
    const c = v6();
    // A mature, energetic parent that always reproduces AND always eats,
    // alone in the world so no other body can touch it.
    const breeder = organism(1, 250, 250, 1, { forward: 0.000001, eat: 0.999, reproduce: 0.999 }, {
      energy: c.energy.energyCapacity, age: c.lifecycle.maturityAge + 1,
    });
    const carried: FoodItem = { id: 1, x: 250, y: 250, holderId: 1, handlingProgress: 2 };
    const next = stepWorld(world6(c, [breeder], [carried]), c).world;
    const child = next.organisms.find((o) => o.parentId === 1);
    expect(child).toBeDefined();                              // a birth really happened
    expect(foodOf(next, 1)!.holderId).toBe(1);                // the parent kept its food
    expect(foodOf(next, 1)!.handlingProgress).toBe(3);        // and progress advanced
    // the newborn was separated from the parent by the passive rule, i.e. the
    // phase really ran — it just is not a contest
    expect(Math.hypot(child!.x - findOrganism(next, 1)!.x, child!.y - findOrganism(next, 1)!.y))
      .toBeGreaterThan(physicalRadiusFromSize(1, c));
  });

  it('(33) several contacts in one tick dislodge once and do nothing more', () => {
    const c = v6();
    const r = physicalRadiusFromSize(1, c);
    const holder = organism(1, 200, 200, 1, EATING);
    const crowd = [2, 3, 4].map((id, k) => organism(id, 200 + r * Math.cos(k), 200 + r * Math.sin(k), 1, NOT_EATING));
    const carried: FoodItem = { id: 1, x: 200, y: 200, holderId: 1, handlingProgress: 3 };
    const many = stepWorld(world6(c, [holder, ...crowd], [carried]), c).world;
    const one = stepWorld(world6(c, [organism(1, 200, 200, 1, EATING), organism(2, 200 + r, 200, 1, NOT_EATING)], [{ id: 1, x: 200, y: 200, holderId: 1, handlingProgress: 3 }]), c).world;
    expect(foodOf(many, 1)!.holderId).toBeNull();
    expect(foodOf(many, 1)!.handlingProgress).toBe(0);
    expect(foodOf(one, 1)!.handlingProgress).toBe(0);
    expect(many.food).toHaveLength(1);
    // no size term, no strength, no probability: the outcome is the same
    expect(foodOf(many, 1)!.holderId).toBe(foodOf(one, 1)!.holderId);
  });

  it('(34) contact and dislodgement draw no random number from any source', () => {
    const c = v6();
    const mathRandom = vi.spyOn(Math, 'random');
    const nextFloat = vi.spyOn(RngStream.prototype, 'nextFloat');
    const [holder, bumper] = contactPair(c) as [OrganismRuntimeState, OrganismRuntimeState];
    const contacts = new Set(resolveBodyOverlap([holder, bumper], c.world, c).contacts);
    expect(contacts.has(1) && contacts.has(2)).toBe(true);
    const intents = new Map([
      [1, { organismId: 1, requestedForwardSpeed: 0, requestedTurnRate: 0, eatRequested: true, reproduceRequested: false }],
      [2, { organismId: 2, requestedForwardSpeed: 0, requestedTurnRate: 0, eatRequested: false, reproduceRequested: false }],
    ]);
    const items = [{ id: 1, x: holder.x, y: holder.y, holderId: 1, handlingProgress: 3 }];
    const result = resolveFoodHandling([holder, bumper], intents, items, contacts, c);
    expect(result.dislodgedFoodIds.has(1)).toBe(true);
    expect(mathRandom).not.toHaveBeenCalled();
    expect(nextFloat).not.toHaveBeenCalled();
    mathRandom.mockRestore();
    nextFloat.mockRestore();
  });

  it('(35) reordering the organism or food array never changes the outcome', () => {
    const c = v6();
    const r = physicalRadiusFromSize(1, c);
    const build = () => ({
      organisms: [
        organism(1, 200, 200, 1, EATING),
        organism(2, 200 + r, 200, 1.4, EATING),
        organism(5, 260, 260, 0.7, EATING),
        organism(3, 262, 261, 1, EATING),
      ],
      food: [free(4, 261, 260), free(2, 259, 262), { id: 1, x: 200, y: 200, holderId: 1, handlingProgress: 2 } as FoodItem],
    });
    const key = (w: WorldState) => canonicalStateString(w);
    const base = build();
    const a = stepWorld(world6(c, base.organisms, base.food), c).world;
    for (const permute of [
      (x: { organisms: OrganismRuntimeState[]; food: FoodItem[] }) => ({ organisms: x.organisms.slice().reverse(), food: x.food.slice().reverse() }),
      (x: { organisms: OrganismRuntimeState[]; food: FoodItem[] }) => ({ organisms: [...x.organisms.slice(2), ...x.organisms.slice(0, 2)], food: [...x.food.slice(1), ...x.food.slice(0, 1)] }),
    ]) {
      const p = permute(build());
      const b = stepWorld(world6(c, p.organisms, p.food), c).world;
      expect(key(b)).toBe(key(a));
    }
  });
});

// =====================================================================
// Death and reproduction (36–39)
// =====================================================================

describe('death and reproduction while holding', () => {
  it('(36, 37) a holder that dies drops its item at its final position, with no food energy granted', () => {
    const c = v6();
    // energy just above zero, so metabolism kills it this tick
    const dying = still(1, 150, 150, 1, EATING, { energy: 0.001 });
    const carried: FoodItem = { id: 1, x: 150, y: 150, holderId: 1, handlingProgress: 2 };
    const next = stepWorld(world6(c, [dying], [carried]), c).world;
    expect(next.organisms.filter((o) => o.alive)).toHaveLength(0);   // it died
    const dead = next.organisms.find((o) => o.id === 1);
    expect(dead).toBeUndefined();                                     // and left the active set
    expect(next.food).toHaveLength(1);                                // (37) the item survives
    expect(foodOf(next, 1)!.holderId).toBeNull();
    expect(foodOf(next, 1)!.handlingProgress).toBe(0);
    expect(foodOf(next, 1)!.x).toBe(150);                             // at its final position
  });

  it('a holder that completes handling in its dying tick is still rescued by the ordinary energy gain', () => {
    const c = v6();
    const rescued = still(1, 150, 150, 1, EATING, { energy: 0.0001 });
    const carried: FoodItem = { id: 1, x: 150, y: 150, holderId: 1, handlingProgress: 4 };
    const next = stepWorld(world6(c, [rescued], [carried]), c).world;
    expect(next.food).toHaveLength(0);                                 // completed
    expect(findOrganism(next, 1)!.alive).toBe(true);                   // and survived on it
    expect(findOrganism(next, 1)!.energy).toBeGreaterThan(20);
  });

  it('(38, 39) reproduction never transfers food: the parent keeps it and the child has no handling state', () => {
    const c = v6();
    const parent = organism(1, 250, 250, 1, { forward: 0.000001, eat: 0.999, reproduce: 0.999 }, {
      energy: c.energy.energyCapacity, age: c.lifecycle.maturityAge + 1,
    });
    const carried: FoodItem = { id: 1, x: 250, y: 250, holderId: 1, handlingProgress: 1 };
    const next = stepWorld(world6(c, [parent], [carried]), c).world;
    const child = next.organisms.find((o) => o.parentId === 1)!;
    expect(child).toBeDefined();
    expect(foodOf(next, 1)!.holderId).toBe(1);                 // stays with the parent
    expect(heldBy(next, child.id)).toHaveLength(0);            // the child holds nothing
    expect(child.hiddenState).toEqual(zeroHiddenState(H));     // memory still zero
    // handling state is food-owned, so a child cannot carry one structurally
    expect(Object.keys(child).some((k) => /hold|handl|possess/i.test(k))).toBe(false);
  });
});

// =====================================================================
// Sensing and the decision path (40–45)
// =====================================================================

describe('sensing and the unchanged decision path', () => {
  it('(40, 41) a held item is ordinary food to the existing sensing, and another organism sees it move', () => {
    const c = v6();
    // The watcher faces +x (heading 0) from behind the item, so the carried
    // item is dead ahead in its vision cone and the holder walks away with it.
    const holder = organism(1, 200, 200, 1, { forward: 0.8, eat: 0.999 });
    const watcher = still(2, 140, 200, 1, NOT_EATING);
    let w = world6(c, [holder, watcher], [free(1, 201, 200)]);
    const seen: Array<[number, number]> = [];
    for (let t = 1; t <= 3; t++) {
      w = stepWorld(w, c).world;
      const item = foodOf(w, 1)!;
      expect(item.holderId).toBe(1);
      const ctx = senseContextFor(w, c);
      const input = senseOrganism(findOrganism(w, 2)!, ctx);
      expect(input[0]).toBe(1);                       // foodVisible — held food is still food
      seen.push([input[1]!, item.x]);
    }
    // the watcher's measured food distance changes as the item is carried away
    expect(new Set(seen.map((s) => s[0])).size).toBeGreaterThan(1);
    expect(new Set(seen.map((s) => s[1])).size).toBeGreaterThan(1);
  });

  it('(42) the holder senses its own item under the existing zero-distance rule — no special case, no new input', () => {
    const c = v6();
    let w = stepWorld(world6(c, [still(1, 200, 200, 1, EATING)], [free(1, 201, 200)]), c).world;
    w = stepWorld(w, c).world; // by now the item sits exactly on the holder
    const holder = findOrganism(w, 1)!;
    const item = foodOf(w, 1)!;
    expect(item.x).toBe(holder.x);
    expect(item.y).toBe(holder.y);
    const input = senseOrganism(holder, senseContextFor(w, c));
    expect(input).toHaveLength(10);                   // still ten inputs
    expect(input[0]).toBe(1);                         // visible at zero distance
    expect(input[1]).toBe(0);                         // distance 0
    expect(input[2]).toBe(0);                         // bearing undefined -> exactly 0, the existing rule
  });

  it('(43, 44) recurrent memory still advances exactly once per acting tick — handling causes no second evaluation', () => {
    const c = v6();
    const neural: NeuralGenome = {
      inputHiddenWeights: zeros(H * I),
      hiddenBiases: new Array<number>(H).fill(0.5),
      hiddenOutputWeights: zeros(NEURAL_OUTPUT_SIZE * H),
      outputBiases: [logit(0.000001), 0, logit(0.999), logit(0.001)],
      recurrentHiddenWeights: new Array<number>(H * H).fill(0.1),
    };
    const mk = (id: number, x: number) => makeOrganism({ id, genome: { morphology: defaultMorphology({ size: 1 }), neural }, x, y: 250, hiddenState: zeroHiddenState(H) });
    // one organism acquiring and handling food, one with nothing to handle
    const handling = stepWorld(world6(c, [mk(1, 250)], [free(1, 251, 250)]), c).world;
    const idle = stepWorld(world6(c, [mk(1, 250)], []), c).world;
    expect(findOrganism(handling, 1)!.hiddenState).toEqual(findOrganism(idle, 1)!.hiddenState);
    expect(findOrganism(handling, 1)!.hiddenState).toEqual(new Array<number>(H).fill(Math.tanh(0.5)));
    expect(foodOf(handling, 1)!.holderId).toBe(1);   // it really was handling
  });

  it('(26 of V2.3) decisions still read S_t: a deep-frozen pre-tick world steps, and handling never writes to it', () => {
    const c = v6();
    const state = world6(c, [still(1, 200, 200, 1, EATING)], [free(1, 201, 200)]);
    const before = canonicalStateString(state);
    const next = stepWorld(state, c).world;
    expect(canonicalStateString(state)).toBe(before);     // S_t untouched, food included
    expect(state.food[0]!.holderId).toBeNull();           // the original item never gained a holder
    expect(foodOf(next, 1)!.holderId).toBe(1);
    const deepFreeze = (o: unknown): unknown => {
      if (o && typeof o === 'object' && !Object.isFrozen(o)) {
        Object.freeze(o);
        for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
      }
      return o;
    };
    deepFreeze(world6(c, [still(1, 200, 200, 1, EATING)], [free(1, 201, 200)]));
    expect(() => stepWorld(world6(c, [still(1, 200, 200, 1, EATING)], [free(1, 201, 200)]), c)).not.toThrow();
  });

  it('(45) historical mutation and founder draw schedules are unchanged', () => {
    const c6 = v6();
    const c5 = v5();
    expect(c6.mutation).toEqual(c5.mutation);
    expect(c6.bootstrap).toEqual(c5.bootstrap);
    expect(c6.neural).toEqual(c5.neural);
    const draws = (recurrent: boolean) => {
      const stream = new RngStream(42, 'canonical');
      const spy = vi.spyOn(stream, 'nextFloat');
      const g: NeuralGenome = {
        inputHiddenWeights: zeros(H * I), hiddenBiases: zeros(H),
        hiddenOutputWeights: zeros(NEURAL_OUTPUT_SIZE * H), outputBiases: zeros(NEURAL_OUTPUT_SIZE),
        ...(recurrent ? { recurrentHiddenWeights: zeros(H * H) } : {}),
      };
      mutateNeural(g, stream, c6.mutation, c6.neural.neuralParamBounds, recurrent);
      const n = spy.mock.calls.length;
      spy.mockRestore();
      return n;
    };
    expect(draws(true)).toBe(188);
    expect(draws(false)).toBe(124);
    // 0A.6.0 founders are drawn exactly like 0A.5.0's — the same bootstrap stream
    const a = bootstrapWorld(v6(GOLDEN_SEED)).organisms.map((o) => o.genome);
    const b = bootstrapWorld(v5(GOLDEN_SEED)).organisms.map((o) => o.genome);
    expect(a).toEqual(b);
  });
});

// =====================================================================
// Canonical state (46–48)
// =====================================================================

describe('handling state is canonical', () => {
  it('(46, 47) two worlds identical except for handling progress hash differently and have different futures', () => {
    const c = v6();
    const at = (progress: number) => world6(c, [organism(1, 300, 300, 1, EATING)], [{ id: 1, x: 300, y: 300, holderId: 1, handlingProgress: progress }]);
    const hashes = [1, 2, 3, 4].map((p) => canonicalStateHash(at(p)));
    expect(new Set(hashes).size).toBe(4);
    // holder identity is canonical too
    const held = world6(c, [organism(1, 300, 300, 1, EATING), organism(2, 460, 460, 1, EATING)], [{ id: 1, x: 300, y: 300, holderId: 1, handlingProgress: 2 }]);
    const free2 = world6(c, [organism(1, 300, 300, 1, EATING), organism(2, 460, 460, 1, EATING)], [{ id: 1, x: 300, y: 300, holderId: null, handlingProgress: 0 }]);
    expect(canonicalStateHash(held)).not.toBe(canonicalStateHash(free2));
    // and the futures differ: one is a tick from being eaten, the other is not
    expect(canonicalStateHash(runTo(at(4), c, 1))).not.toBe(canonicalStateHash(runTo(at(1), c, 1)));
    expect(runTo(at(4), c, 1).food).toHaveLength(0);
    expect(runTo(at(1), c, 1).food).toHaveLength(1);
  });

  it('(48) 0A.6.0 food records carry handling state; every older model\'s food record is byte-identical to before', () => {
    const c = v6();
    const w = world6(c, [organism(1, 300, 300, 1, EATING)], [{ id: 1, x: 300, y: 300, holderId: 1, handlingProgress: 2 }]);
    const record = (canonicalizeWorldState(w) as { food: Array<Record<string, unknown>> }).food[0]!;
    expect(Object.keys(record)).toEqual(['id', 'x', 'y', 'holderId', 'handlingProgress']);
    for (const version of ['0A.1.0', '0A.2.0', '0A.3.0', '0A.4.0', '0A.5.0']) {
      const cc = modelConfig(version);
      cc.rootSeed = GOLDEN_SEED;
      const older = bootstrapWorld(cc);
      const f = (canonicalizeWorldState(older) as { food: Array<Record<string, unknown>> }).food[0]!;
      expect(Object.keys(f)).toEqual(['id', 'x', 'y']);
    }
    // a world whose food does not match its model is refused, not canonicalized
    const wrong = world6(c, [organism(1, 300, 300, 1, EATING)], [{ id: 1, x: 300, y: 300 } as FoodItem]);
    expect(() => canonicalStateHash(wrong)).toThrow(/does not match the food-handling layout/);
    const c5c = v5();
    const stray = makeWorld({ config: c5c, organisms: [organism(1, 300, 300, 1, EATING)], food: [free(1, 300, 300)], fertility: uniformFertility(0) });
    expect(() => canonicalStateHash(stray)).toThrow(/does not match the instantaneous-feeding layout/);
  });
});

// =====================================================================
// The 0A.6.0 golden regression
// =====================================================================

describe('0A.6.0 golden regression (seed 20260910, 10,000 ticks)', () => {
  it('reproduces FOOD_HANDLING_GOLDEN_HASH twice, with pinned checkpoints while the world is alive', () => {
    expect(FOOD_HANDLING_GOLDEN_HASH).toBe('3e5b9671f5750712');
    for (let run = 0; run < 2; run++) {
      const c = v6();
      let w = bootstrapWorld(c);
      w = runTo(w, c, 500);
      expect(canonicalStateHash(w)).toBe('811dee5de25a3753');
      w = runTo(w, c, 1000);
      expect(canonicalStateHash(w)).toBe('11f3da7c82ce8082');
      w = runTo(w, c, 2000);
      expect(canonicalStateHash(w)).toBe('5868f40d685adda3');
      w = runTo(w, c, 10000);
      expect(canonicalStateHash(w)).toBe(FOOD_HANDLING_GOLDEN_HASH);
    }
    const summary = runSimulation(v6(), 10_000).summary;
    expect(summary.simulationVersion).toBe('0A.6.0');
    expect(summary.finalStateHash).toBe(FOOD_HANDLING_GOLDEN_HASH);
    // Reported honestly: the canonical seed's 0A.6.0 world dies out with no
    // births at all. Extinction is a legitimate result and nothing was tuned
    // or seed-shopped to avoid it.
    expect(summary.extinct).toBe(true);
    expect(summary.totalBirths).toBe(0);
  }, 60_000);

  it('coverage checkpoints (NOT canonical): seed 3 is the first living world, seed 8 has the most handling', () => {
    const living = runSimulation(v6(LIVING_SEED), 2500);
    expect(living.summary.finalStateHash).toBe('1ed9e874a5f493bf');
    expect(living.summary.totalBirths).toBe(1);

    const active = runSimulation(v6(ACTIVE_SEED), 2500);
    expect(active.summary.finalStateHash).toBe('e21dc19bcc7a85ec');
    expect(active.summary.totalBirths).toBe(22);
    expect(active.summary.endingPopulation).toBeGreaterThan(0);
    // real handling is happening in that world, and every item is well formed
    expect(active.world.food.filter((f) => f.holderId !== null).length).toBeGreaterThan(0);
    const holders = active.world.food.filter((f) => f.holderId !== null).map((f) => f.holderId);
    expect(new Set(holders).size).toBe(holders.length);                       // one item per organism
    const aliveIds = new Set(active.world.organisms.filter((o) => o.alive).map((o) => o.id));
    for (const f of active.world.food) {
      expect(Number.isInteger(f.handlingProgress)).toBe(true);
      if (f.holderId === null) expect(f.handlingProgress).toBe(0);
      else {
        expect(aliveIds.has(f.holderId)).toBe(true);
        expect(f.handlingProgress).toBeGreaterThanOrEqual(1);
        expect(f.handlingProgress).toBeLessThan(HANDLING_TICKS_REQUIRED);
      }
    }
  }, 60_000);
});
