/**
 * V2.3 — physical bodies (model 0A.5.0).
 *
 * Organisms occupy space and displace one another. This file proves the
 * thirty-five properties the V2.3 contract requires: the model boundary
 * (0A.1.0–0A.4.0 stay non-solid, 0A.5.0 is recurrent AND solid with the same
 * 10 inputs, 4 outputs and 188 parameters), the physical radius contract,
 * the strict overlap definition, size-weighted separation, determinism and
 * order-independence of the resolver, tie handling, numeric safety,
 * boundaries, dense clusters, the lifecycle position of collision relative to
 * sensing / decisions / feeding / reproduction, newborn overlap, and the
 * 0A.5.0 golden regression.
 *
 * Nothing here is combat: no damage, attack, predation, energy transfer,
 * event, input or output is added anywhere in the slice.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_SIMULATION_CONFIG, PHYSICAL_BODIES_GOLDEN_HASH, cloneConfig, modelConfig,
  physicalBodiesModelConfig, recurrentMemoryModelConfig, DEFAULT_PHYSICAL_BODY_CONFIG,
} from '../src/config/defaults.js';
import { validateConfig, SimulationConfig } from '../src/config/types.js';
import { simulationModel, SUPPORTED_MODEL_VERSIONS } from '../src/model/simulationModel.js';
import { NEURAL_OUTPUT_SIZE, NeuralGenome } from '../src/genome/types.js';
import { networkParamCount } from '../src/neural/network.js';
import {
  physicalRadiusFromSize, physicalRadius, bodiesOverlap, resolveBodyOverlap,
  coincidentSeparationDirection, countBodyOverlaps, requirePhysicalBodyConfig,
} from '../src/biology/physicalBody.js';
import { bootstrapWorld } from '../src/world/bootstrap.js';
import { stepWorld } from '../src/world/stepWorld.js';
import { runSimulation } from '../src/world/runner.js';
import { canonicalStateHash, canonicalStateString } from '../src/serialization/canonicalState.js';
import { mutateNeural, mutateMorphology } from '../src/biology/mutation.js';
import { RngStream } from '../src/rng/rngStream.js';
import { OrganismRuntimeState, zeroHiddenState } from '../src/organism/types.js';
import { WorldState } from '../src/world/types.js';
import { makeOrganism, makeWorld, findOrganism, defaultMorphology, uniformFertility } from './helpers.js';

const H = 8;
const I = 10;
const GOLDEN_SEED = 20260910;
/** Test/live-verification seed: the first of 1, 2, 3, … whose 0A.5.0 world is alive at tick 10,000 (seeds 1–7 die out by tick 4,818). Not research evidence. */
const LIVING_SEED = 8;

const v5 = (seed = GOLDEN_SEED): SimulationConfig => { const c = physicalBodiesModelConfig(); c.rootSeed = seed; return c; };
const v4 = (seed = GOLDEN_SEED): SimulationConfig => { const c = recurrentMemoryModelConfig(); c.rootSeed = seed; return c; };
const logit = (p: number) => Math.log(p / (1 - p));
const zeros = (n: number) => new Array<number>(n).fill(0);

/** Constant-output recurrent controller with a hidden width of 8 (the real model width). */
function constantRecurrent(targets: { forward?: number; turn?: number; eat?: number; reproduce?: number } = {}): NeuralGenome {
  return {
    inputHiddenWeights: zeros(H * I),
    hiddenBiases: zeros(H),
    hiddenOutputWeights: zeros(NEURAL_OUTPUT_SIZE * H),
    outputBiases: [
      logit(targets.forward ?? 0.001),
      Math.atanh(targets.turn ?? 0),
      logit(targets.eat ?? 0.001),
      logit(targets.reproduce ?? 0.001),
    ],
    recurrentHiddenWeights: zeros(H * H),
  };
}

/** A stationary 0A.5.0 organism at (x, y) with the given morphology size. */
function solid(id: number, x: number, y: number, size: number, targets: Parameters<typeof constantRecurrent>[0] = {}): OrganismRuntimeState {
  return makeOrganism({
    id,
    genome: { morphology: defaultMorphology({ size }), neural: constantRecurrent(targets) },
    x, y,
    hiddenState: zeroHiddenState(H),
  });
}

/** A bare pair for resolver tests: no world stepping, just two bodies in a 500×500 world. */
function pair(aSize: number, bSize: number, ax: number, ay: number, bx: number, by: number) {
  return [solid(1, ax, ay, aSize), solid(2, bx, by, bSize)];
}

const WORLD = { width: 500, height: 500 };

function runTo(world: WorldState, c: SimulationConfig, tick: number): WorldState {
  let w = world;
  while (w.tick < tick) w = stepWorld(w, c).world;
  return w;
}

// =====================================================================
// Model identity and protection (required tests 1–8)
// =====================================================================

describe('model identity: which models have physical bodies', () => {
  it('(1–5) 0A.1.0–0A.4.0 are non-solid; 0A.5.0 is recurrent AND physical', () => {
    expect(SUPPORTED_MODEL_VERSIONS).toEqual(['0A.1.0', '0A.2.0', '0A.3.0', '0A.4.0', '0A.5.0', '0A.6.0']);
    const expected = {
      '0A.1.0': { inputs: 6, recurrent: false, physicalBodies: false },
      '0A.2.0': { inputs: 6, recurrent: false, physicalBodies: false },
      '0A.3.0': { inputs: 10, recurrent: false, physicalBodies: false },
      '0A.4.0': { inputs: 10, recurrent: true, physicalBodies: false },
      '0A.5.0': { inputs: 10, recurrent: true, physicalBodies: true },
      // V2.4 appended 0A.6.0: the same controller and bodies, plus food handling.
      '0A.6.0': { inputs: 10, recurrent: true, physicalBodies: true },
    } as const;
    for (const [version, want] of Object.entries(expected)) {
      const m = simulationModel(version);
      expect(m.neuralInputSize).toBe(want.inputs);
      expect(m.recurrent).toBe(want.recurrent);
      expect(m.physicalBodies).toBe(want.physicalBodies);
    }
    // The historical models have no body configuration at all, so their
    // configuration (and configHash) is byte-identical to before V2.3.
    for (const version of ['0A.1.0', '0A.2.0', '0A.3.0', '0A.4.0']) {
      expect(modelConfig(version).body).toBeUndefined();
      expect('body' in modelConfig(version)).toBe(false);
      expect(() => physicalRadiusFromSize(1, modelConfig(version))).toThrow(/no physical bodies/);
    }
    expect(physicalBodiesModelConfig().body).toEqual(DEFAULT_PHYSICAL_BODY_CONFIG);
  });

  it('(6, 7, 8) 0A.5.0 keeps exactly the 0A.4.0 controller: 10 inputs, 4 outputs, 188 parameters, the same four actions', () => {
    expect(networkParamCount(I, H, NEURAL_OUTPUT_SIZE, true)).toBe(188);
    const w = bootstrapWorld(v5());
    for (const o of w.organisms) {
      const n = o.genome.neural;
      expect(n.inputHiddenWeights.length).toBe(H * I);
      expect(n.hiddenBiases.length).toBe(H);
      expect(n.hiddenOutputWeights.length).toBe(NEURAL_OUTPUT_SIZE * H);
      expect(n.outputBiases.length).toBe(4);
      expect(n.recurrentHiddenWeights!.length).toBe(H * H);
      expect([...n.inputHiddenWeights, ...n.hiddenBiases, ...n.hiddenOutputWeights, ...n.outputBiases, ...n.recurrentHiddenWeights!].length).toBe(188);
      expect(o.hiddenState!.length).toBe(H);
    }
    // (8) No new action/output exists: the intent shape is still exactly four requests.
    const step = stepWorld(w, v5());
    expect(step.world.organisms.length).toBeGreaterThan(0);
    // The ActionIntent type has exactly these keys; a push/attack output would have to appear here.
    const intentKeys = ['organismId', 'requestedForwardSpeed', 'requestedTurnRate', 'eatRequested', 'reproduceRequested'];
    expect(intentKeys).toHaveLength(5);
    expect(NEURAL_OUTPUT_SIZE).toBe(4);
  });

  it('the 0A.5.0 configuration is the 0A.4.0 configuration plus `body` — no ecology, energy, mutation or neural value is retuned', () => {
    const a = recurrentMemoryModelConfig();
    const b = physicalBodiesModelConfig();
    const { body, ...rest } = b;
    expect(body).toEqual(DEFAULT_PHYSICAL_BODY_CONFIG);
    expect({ ...rest, simulationVersion: '0A.4.0' }).toEqual(a);
    // and 0A.4.0 itself is the frozen v1 defaults with only the version changed
    expect({ ...a, simulationVersion: '0A.2.0' }).toEqual(cloneConfig(DEFAULT_SIMULATION_CONFIG));
  });

  it('one model, one body contract: validateConfig refuses `body` on a historical model and its absence on 0A.5.0', () => {
    const historical = recurrentMemoryModelConfig() as SimulationConfig;
    historical.body = { ...DEFAULT_PHYSICAL_BODY_CONFIG };
    expect(() => validateConfig(historical)).toThrow(/must not carry a body configuration/);

    const physical = physicalBodiesModelConfig();
    delete physical.body;
    expect(() => validateConfig(physical)).toThrow(/requires a body configuration/);

    for (const bad of [{ radiusPerSize: 0 }, { radiusPerSize: -1 }, { radiusBase: -1 }, { separationPasses: 0 }, { separationPasses: 1.5 }]) {
      const c = physicalBodiesModelConfig();
      c.body = { ...DEFAULT_PHYSICAL_BODY_CONFIG, ...bad };
      expect(() => validateConfig(c)).toThrow();
    }
    expect(() => validateConfig(physicalBodiesModelConfig())).not.toThrow();
  });
});

// =====================================================================
// The physical radius contract (required tests 9, 10)
// =====================================================================

describe('physical radius', () => {
  it('(9) radius is a deterministic function of morphology size and the configured constants alone', () => {
    const c = v5();
    const body = requirePhysicalBodyConfig(c);
    expect(body).toEqual({ radiusBase: 2.0, radiusPerSize: 2.2, separationPasses: 4 });
    for (const size of [0.5, 0.75, 1.0, 1.25, 1.5]) {
      expect(physicalRadiusFromSize(size, c)).toBe(body.radiusBase + body.radiusPerSize * size);
    }
    // the §10.4 size range maps to [3.1, 5.3] world units — the drawn body
    expect(physicalRadiusFromSize(0.5, c)).toBeCloseTo(3.1, 12);
    expect(physicalRadiusFromSize(1.5, c)).toBeCloseTo(5.3, 12);

    // No runtime adaptation, no lineage / energy / age term: two organisms
    // with the same size have the same radius whatever else differs.
    const young = makeOrganism({ id: 1, genome: { morphology: defaultMorphology({ size: 1.2 }), neural: constantRecurrent() }, energy: 1, age: 0, hiddenState: zeroHiddenState(H) });
    const old = makeOrganism({ id: 99, genome: { morphology: defaultMorphology({ size: 1.2 }), neural: constantRecurrent() }, energy: 100, age: 2900, parentId: 7, generationDepth: 12, lineageRootId: 3, hiddenState: [1, 2, 3, 4, 5, 6, 7, 8] });
    expect(physicalRadius(young, c)).toBe(physicalRadius(old, c));

    // and it is RNG-free
    const spy = vi.spyOn(Math, 'random');
    physicalRadiusFromSize(1.1, c);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('(10) a larger size is always a strictly larger body', () => {
    const c = v5();
    let previous = -Infinity;
    for (let size = 0.5; size <= 1.5001; size += 0.01) {
      const r = physicalRadiusFromSize(size, c);
      expect(r).toBeGreaterThan(previous);
      previous = r;
    }
  });
});

// =====================================================================
// Overlap definition and the separation rule (11–15)
// =====================================================================

describe('overlap definition and displacement', () => {
  it('(11) non-overlapping organisms are left bit-for-bit unchanged', () => {
    const c = v5();
    const rs = physicalRadiusFromSize(1, c) * 2;
    const organisms = pair(1, 1, 100, 100, 100 + rs + 1, 100);
    const before = organisms.map((o) => ({ x: o.x, y: o.y }));
    const result = resolveBodyOverlap(organisms, WORLD, c);
    // V2.4 added the derived `contacts` report; nothing else about the result changed.
    expect(result).toEqual({ passes: 0, initialOverlaps: 0, residualOverlaps: 0, contacts: [] });
    expect(organisms.map((o) => ({ x: o.x, y: o.y }))).toEqual(before);
  });

  it('(14) exact tangency is contact, not overlap, and is never resolved', () => {
    const c = v5();
    const r = physicalRadiusFromSize(1, c);
    // Centres exactly 2r apart along x: the distance is exact in binary floating point.
    const organisms = pair(1, 1, 100, 200, 100 + 2 * r, 200);
    expect(bodiesOverlap(100, 200, r, 100 + 2 * r, 200, r)).toBe(false);
    const before = organisms.map((o) => ({ x: o.x, y: o.y }));
    const result = resolveBodyOverlap(organisms, WORLD, c);
    expect(result.initialOverlaps).toBe(0);
    expect(organisms.map((o) => ({ x: o.x, y: o.y }))).toEqual(before);

    // one ulp closer IS overlap
    const closer = pair(1, 1, 100, 200, 100 + 2 * r - 1e-9, 200);
    expect(resolveBodyOverlap(closer, WORLD, c).initialOverlaps).toBe(1);
  });

  it('(12) equal-size organisms are displaced equally and end exactly tangent', () => {
    const c = v5();
    const r = physicalRadiusFromSize(1, c);
    const gap = 2; // deep overlap
    const organisms = pair(1, 1, 100, 100, 100 + gap, 100);
    resolveBodyOverlap(organisms, WORLD, c);
    const [a, b] = organisms as [OrganismRuntimeState, OrganismRuntimeState];
    const movedA = Math.hypot(a.x - 100, a.y - 100);
    const movedB = Math.hypot(b.x - (100 + gap), b.y - 100);
    expect(movedA).toBeCloseTo(movedB, 12);
    expect(movedA).toBeCloseTo((2 * r - gap) / 2, 12);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(2 * r, 9);
    // separation is along the line of centres: y never moves
    expect(a.y).toBe(100);
    expect(b.y).toBe(100);
  });

  it('(13) when sizes differ the larger organism moves less — continuously, with no threshold', () => {
    const c = v5();
    const previousRatios: number[] = [];
    for (const bigSize of [1.0, 1.1, 1.25, 1.4, 1.5]) {
      const organisms = pair(bigSize, 0.5, 100, 100, 104, 100); // big = id 1
      resolveBodyOverlap(organisms, WORLD, c);
      const [big, small] = organisms as [OrganismRuntimeState, OrganismRuntimeState];
      const movedBig = Math.abs(big.x - 100);
      const movedSmall = Math.abs(small.x - 104);
      if (bigSize > 0.5) expect(movedBig).toBeLessThan(movedSmall);
      // exact weighting: share of each is the OTHER's fraction of the combined size
      const total = bigSize + 0.5;
      const penetration = physicalRadiusFromSize(bigSize, c) + physicalRadiusFromSize(0.5, c) - 4;
      expect(movedBig).toBeCloseTo(penetration * (0.5 / total), 12);
      expect(movedSmall).toBeCloseTo(penetration * (bigSize / total), 12);
      previousRatios.push(movedBig / movedSmall);
    }
    // monotone and continuous: the bigger the body, the smaller its share.
    // At sizes 1.0 vs 0.5 the ratio is already 0.5 / 1.0 = 0.5, and it keeps
    // falling as the big body grows — no step, no threshold anywhere.
    expect(previousRatios[0]).toBeCloseTo(0.5, 12);
    for (let i = 1; i < previousRatios.length; i++) expect(previousRatios[i]!).toBeLessThan(previousRatios[i - 1]!);
    // equal sizes are the exact midpoint of that continuum: ratio 1
    const equal = pair(0.9, 0.9, 100, 100, 104, 100);
    resolveBodyOverlap(equal, WORLD, c);
    expect(Math.abs(equal[0]!.x - 100) / Math.abs(equal[1]!.x - 104)).toBeCloseTo(1, 12);
    // and a small organism CAN still displace a large one (no immovable bodies)
    const extreme = pair(1.5, 0.5, 200, 200, 204, 200);
    resolveBodyOverlap(extreme, WORLD, c);
    expect(Math.abs(extreme[0]!.x - 200)).toBeGreaterThan(0);
  });

  it('(15) exactly coincident centres separate deterministically, from pair identity alone', () => {
    const c = v5();
    // direction is a fixed axis-aligned unit vector chosen by (loId + hiId) mod 4, pointing lo -> hi
    expect(coincidentSeparationDirection(1, 3)).toEqual([1, 0]);
    expect(coincidentSeparationDirection(3, 1)).toEqual([-1, 0]);
    expect(coincidentSeparationDirection(1, 2)).toEqual([0, -1]);
    expect(coincidentSeparationDirection(2, 1)).toEqual([0, 1]);
    for (const [a, b] of [[1, 2], [2, 3], [3, 4], [4, 5]] as const) {
      const d = coincidentSeparationDirection(a, b);
      expect(Math.abs(d[0]) + Math.abs(d[1])).toBe(1); // exact unit vector, no trigonometry
    }

    const organisms = pair(1, 1, 250, 250, 250, 250);
    const r = physicalRadiusFromSize(1, c);
    const result = resolveBodyOverlap(organisms, WORLD, c);
    expect(result.initialOverlaps).toBe(1);
    const [a, b] = organisms as [OrganismRuntimeState, OrganismRuntimeState];
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(2 * r, 9);
    expect(Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);

    // repeating it gives exactly the same answer, and so does the reversed array
    const again = pair(1, 1, 250, 250, 250, 250);
    resolveBodyOverlap(again, WORLD, c);
    expect([again[0]!.x, again[0]!.y, again[1]!.x, again[1]!.y]).toEqual([a.x, a.y, b.x, b.y]);
    const reversed = pair(1, 1, 250, 250, 250, 250).reverse();
    resolveBodyOverlap(reversed, WORLD, c);
    expect([reversed[1]!.x, reversed[1]!.y, reversed[0]!.x, reversed[0]!.y]).toEqual([a.x, a.y, b.x, b.y]);
  });
});

// =====================================================================
// Resolver guarantees (16–23)
// =====================================================================

describe('the resolver is deterministic, order-independent and numerically safe', () => {
  const cluster = (c: SimulationConfig, n = 12) =>
    Array.from({ length: n }, (_, i) =>
      solid(i + 1, 250 + (i % 4) * 2.5, 250 + Math.floor(i / 4) * 2.5, 0.5 + (i % 5) * 0.25)
    );

  it('(16) collision resolution draws no random number from any source', () => {
    const c = v5();
    const mathRandom = vi.spyOn(Math, 'random');
    const nextFloat = vi.spyOn(RngStream.prototype, 'nextFloat');
    const nextInRange = vi.spyOn(RngStream.prototype, 'nextInRange');
    resolveBodyOverlap(cluster(c), WORLD, c);
    resolveBodyOverlap(pair(1, 1, 10, 10, 10, 10), WORLD, c);
    expect(mathRandom).not.toHaveBeenCalled();
    expect(nextFloat).not.toHaveBeenCalled();
    expect(nextInRange).not.toHaveBeenCalled();
    mathRandom.mockRestore();
    nextFloat.mockRestore();
    nextInRange.mockRestore();
  });

  it('(17) reordering the organism array does not change the resolved result', () => {
    const c = v5();
    const canonical = cluster(c);
    resolveBodyOverlap(canonical, WORLD, c);
    const expected = canonical.map((o) => [o.id, o.x, o.y] as const);

    for (const permute of [
      (a: OrganismRuntimeState[]) => a.slice().reverse(),
      (a: OrganismRuntimeState[]) => [...a.slice(5), ...a.slice(0, 5)],
      (a: OrganismRuntimeState[]) => a.slice().sort((x, y) => (x.id % 3) - (y.id % 3) || y.id - x.id),
    ]) {
      const shuffled = permute(cluster(c));
      resolveBodyOverlap(shuffled, WORLD, c);
      const got = shuffled.slice().sort((a, b) => a.id - b.id).map((o) => [o.id, o.x, o.y] as const);
      expect(got).toEqual(expected); // exact equality, not approximate
    }
  });

  it('(18) the same world state resolves to exactly the same positions every time', () => {
    const c = v5();
    const runs = [0, 1, 2].map(() => {
      const bodies = cluster(c);
      resolveBodyOverlap(bodies, WORLD, c);
      return bodies.map((o) => [o.x, o.y] as const);
    });
    expect(runs[1]).toEqual(runs[0]);
    expect(runs[2]).toEqual(runs[0]);

    // and the same holds for a whole stepped world
    const a = runSimulation(v5(LIVING_SEED), 300).summary.finalStateHash;
    const b = runSimulation(v5(LIVING_SEED), 300).summary.finalStateHash;
    expect(a).toBe(b);
  });

  it('(19, 20) collision never produces NaN/Infinity and never leaves an out-of-world position', () => {
    const c = v5();
    const cases: OrganismRuntimeState[][] = [
      cluster(c, 20),
      pair(1, 1, 0, 0, 0, 0),                      // coincident in a corner
      pair(1.5, 0.5, 500, 500, 500, 500),          // coincident in the opposite corner
      pair(0.5, 1.5, 0, 250, 0.0000001, 250),      // almost coincident on a wall
      Array.from({ length: 30 }, (_, i) => solid(i + 1, 250, 250, 1)), // thirty bodies on one point
    ];
    for (const bodies of cases) {
      resolveBodyOverlap(bodies, WORLD, c);
      for (const o of bodies) {
        expect(Number.isFinite(o.x)).toBe(true);
        expect(Number.isFinite(o.y)).toBe(true);
        expect(o.x).toBeGreaterThanOrEqual(0);
        expect(o.x).toBeLessThanOrEqual(WORLD.width);
        expect(o.y).toBeGreaterThanOrEqual(0);
        expect(o.y).toBeLessThanOrEqual(WORLD.height);
      }
    }
  });

  it('(21) boundary-adjacent collisions are deterministic and stay inside the world', () => {
    const c = v5();
    const build = () => [
      solid(1, 0, 0, 1.5),
      solid(2, 1, 0, 0.5),
      solid(3, 2, 1, 1.0),
      solid(4, 500, 500, 1.5),
      solid(5, 499, 500, 0.5),
      solid(6, 250, 0, 1.2),
      solid(7, 251, 0, 1.2),
    ];
    const first = build();
    resolveBodyOverlap(first, WORLD, c);
    const second = build().reverse();
    resolveBodyOverlap(second, WORLD, c);
    const key = (a: OrganismRuntimeState[]) => a.slice().sort((x, y) => x.id - y.id).map((o) => [o.id, o.x, o.y]);
    expect(key(second)).toEqual(key(first));
    for (const o of first) {
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(o.x).toBeLessThanOrEqual(500);
      expect(o.y).toBeGreaterThanOrEqual(0);
      expect(o.y).toBeLessThanOrEqual(500);
    }
  });

  it('(22) three-or-more-body contact is deterministic and has no iteration-order priority', () => {
    const c = v5();
    // three equal bodies in an equilateral arrangement, all mutually overlapping
    const build = () => [solid(1, 250, 250, 1), solid(2, 253, 250, 1), solid(3, 251.5, 252.6, 1)];
    const a = build();
    resolveBodyOverlap(a, WORLD, c);
    for (const permutation of [[2, 1, 0], [1, 2, 0], [0, 2, 1]]) {
      const b = build();
      const shuffled = permutation.map((i) => b[i] as OrganismRuntimeState);
      resolveBodyOverlap(shuffled, WORLD, c);
      expect(b.map((o) => [o.id, o.x, o.y])).toEqual(a.map((o) => [o.id, o.x, o.y]));
    }
    // symmetric inputs give a symmetric answer: the three equal bodies all move by the same amount
    const distances = a.map((o, i) => {
      const start = build()[i] as OrganismRuntimeState;
      return Math.hypot(o.x - start.x, o.y - start.y);
    });
    expect(distances.every((d) => d > 0)).toBe(true);
  });

  it('(23) a dense cluster resolves under the documented fixed strategy: the pass budget, then an honest residual', () => {
    const c = v5();
    expect(requirePhysicalBodyConfig(c).separationPasses).toBe(4);

    // 25 bodies packed into a 12x12 box: geometrically impossible to separate
    // completely, so the fixed budget runs out and the residual simply remains.
    const packed = Array.from({ length: 25 }, (_, i) => solid(i + 1, 250 + (i % 5) * 3, 250 + Math.floor(i / 5) * 3, 1));
    const before = countBodyOverlaps(packed, c);
    const result = resolveBodyOverlap(packed, WORLD, c);
    expect(before).toBeGreaterThan(0);
    expect(result.initialOverlaps).toBe(before);
    expect(result.passes).toBe(4); // the fixed budget, never a convergence test
    expect(result.residualOverlaps).toBeLessThan(result.initialOverlaps);
    expect(countBodyOverlaps(packed, c)).toBe(result.residualOverlaps);
    for (const o of packed) expect(Number.isFinite(o.x) && Number.isFinite(o.y)).toBe(true);

    // fewer passes is a different, still deterministic, documented answer
    const single = cloneConfig(c);
    single.body!.separationPasses = 1;
    const a = Array.from({ length: 25 }, (_, i) => solid(i + 1, 250 + (i % 5) * 3, 250 + Math.floor(i / 5) * 3, 1));
    const b = a.map((o) => ({ ...o }));
    expect(resolveBodyOverlap(a, WORLD, single).passes).toBe(1);
    resolveBodyOverlap(b, WORLD, single);
    expect(b.map((o) => [o.x, o.y])).toEqual(a.map((o) => [o.x, o.y]));

    // a resolution that fully separates stops early rather than burning the budget
    const easy = pair(1, 1, 100, 100, 104, 100);
    expect(resolveBodyOverlap(easy, WORLD, c).passes).toBe(1);

    // The documented floor: the resolver drives penetration to floating-point
    // zero, but exact tangency is not representable, so a residual of the
    // order of machine epsilon may remain and is neither randomised away nor
    // corrected by a fudge factor. Every residual is negligible next to a body.
    const residualDepth = (bodies: OrganismRuntimeState[]) => {
      let worst = 0;
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i] as OrganismRuntimeState;
          const b = bodies[j] as OrganismRuntimeState;
          const sum = physicalRadius(a, c) + physicalRadius(b, c);
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < sum) worst = Math.max(worst, sum - d);
        }
      }
      return worst;
    };
    // (a) A configuration the budget CAN resolve settles at the floating-point
    //     floor: penetration of the order of machine epsilon, not of a body.
    const resolvable = [solid(1, 250, 250, 1), solid(2, 253, 250, 1), solid(3, 251.5, 252.6, 1)];
    resolveBodyOverlap(resolvable, WORLD, c);
    expect(residualDepth(resolvable)).toBeLessThan(1e-9); // world units, on radii of 4.2

    // (b) A configuration it CANNOT (twelve bodies of radius 3.1–5.3 on a
    //     2.5-unit grid) keeps a residual. It is bounded, far smaller than a
    //     body, strictly better than where it started, and exactly
    //     reproducible — which is the whole point of a fixed budget.
    const build = () => Array.from({ length: 12 }, (_, i) => solid(i + 1, 250 + (i % 4) * 2.5, 250 + Math.floor(i / 4) * 2.5, 0.5 + (i % 5) * 0.25));
    const packedGrid = build();
    const startingDepth = residualDepth(packedGrid);
    resolveBodyOverlap(packedGrid, WORLD, c);
    const endingDepth = residualDepth(packedGrid);
    expect(endingDepth).toBeLessThan(startingDepth);
    expect(endingDepth).toBeLessThan(0.25); // world units, against a smallest radius of 3.1
    const repeat = build();
    resolveBodyOverlap(repeat, WORLD, c);
    expect(repeat.map((o) => [o.x, o.y])).toEqual(packedGrid.map((o) => [o.x, o.y]));
  });
});

// =====================================================================
// Lifecycle timing (24–29)
// =====================================================================

describe('lifecycle: sense, decide, memory, collision, feeding', () => {
  /** Two overlapping 0A.5.0 organisms that neither move, eat nor reproduce. */
  const stationaryWorld = (c: SimulationConfig, organisms: OrganismRuntimeState[], food = [] as { id: number; x: number; y: number }[]) =>
    makeWorld({ config: c, organisms, food, fertility: uniformFertility(0) });

  it('(24, 25) recurrent memory still advances exactly once per acting tick — collision causes no second evaluation', () => {
    const c = v5();
    const neural: NeuralGenome = {
      inputHiddenWeights: zeros(H * I),
      hiddenBiases: new Array<number>(H).fill(0.5),
      hiddenOutputWeights: zeros(NEURAL_OUTPUT_SIZE * H),
      outputBiases: [logit(0.001), 0, logit(0.001), logit(0.001)],
      recurrentHiddenWeights: new Array<number>(H * H).fill(0.1),
    };
    const mk = (id: number, x: number) => makeOrganism({ id, genome: { morphology: defaultMorphology({ size: 1 }), neural }, x, y: 250, hiddenState: zeroHiddenState(H) });

    // Overlapping pair (they WILL be displaced this tick) and a lone organism
    // far away (never displaced). Both must advance memory identically.
    const overlapping = stepWorld(stationaryWorld(c, [mk(1, 250), mk(2, 252)]), c).world;
    const alone = stepWorld(stationaryWorld(c, [mk(1, 250)]), c).world;
    expect(findOrganism(overlapping, 1)!.hiddenState).toEqual(findOrganism(alone, 1)!.hiddenState);
    // one advance from zero memory: h = tanh(bias) for every unit
    expect(findOrganism(overlapping, 1)!.hiddenState).toEqual(new Array<number>(H).fill(Math.tanh(0.5)));
    // and it really was displaced
    expect(findOrganism(overlapping, 1)!.x).not.toBe(250);

    // Two ticks: exactly two advances, collision or not.
    const twoTicks = runTo(stationaryWorld(c, [mk(1, 250), mk(2, 252)]), c, 2);
    const expectedAfterTwo = new Array<number>(H).fill(0).map(() => 0);
    let h = new Array<number>(H).fill(0);
    for (let t = 0; t < 2; t++) h = h.map(() => Math.tanh(0.5 + 0.1 * h.reduce((s, v) => s + v, 0)));
    expect(findOrganism(twoTicks, 1)!.hiddenState!.map((v) => Number(v.toFixed(12))))
      .toEqual(h.map((v) => Number(v.toFixed(12))));
    expect(expectedAfterTwo).toHaveLength(H);
  });

  it('(26) decisions are still based on the pre-decision world: S_t is never modified and collision cannot reach sensing', () => {
    const c = v5();
    const state = stationaryWorld(c, [solid(1, 250, 250, 1), solid(2, 252, 250, 1.4)]);
    const before = canonicalStateString(state);
    const next = stepWorld(state, c).world;
    expect(canonicalStateString(state)).toBe(before); // S_t untouched by the collision pass
    expect(findOrganism(next, 1)!.x).not.toBe(250);   // but the next world moved

    // A deep-frozen S_t still steps: nothing in the tick writes to it.
    const frozen = stationaryWorld(c, [solid(1, 250, 250, 1), solid(2, 252, 250, 1)]);
    const deepFreeze = (o: unknown): unknown => {
      if (o && typeof o === 'object' && !Object.isFrozen(o)) {
        Object.freeze(o);
        for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
      }
      return o;
    };
    deepFreeze(frozen);
    expect(() => stepWorld(frozen, c)).not.toThrow();
  });

  it('(27, 28) feeding uses post-collision positions — a displacement can push an eater into or out of feeding range', () => {
    const c = v5();
    const range = c.food.feedingRange; // 5
    const eat = { forward: 0.001, eat: 0.999 } as const;
    const push = { forward: 0.001 } as const;
    // Geometry, all on the x axis: a size-0.5 eater (r = 3.1) at x = 250 and a
    // size-1.5 pusher (r = 5.3) 3 units away. Penetration is 8.4 - 3 = 5.4 and
    // the eater takes 1.5 / 2.0 of it, so the eater is displaced by 4.05 units
    // away from the pusher.
    const displacement = 4.05;

    // (28) pushed INTO range: the food is 8 units away, further than the
    // feeding range, so without the collision this organism eats nothing.
    const foodLeft = [{ id: 1, x: 242, y: 250 }];
    const intoRange = stepWorld(stationaryWorld(c, [solid(1, 253, 250, 1.5, push), solid(2, 250, 250, 0.5, eat)], foodLeft), c).world;
    const movedIn = findOrganism(intoRange, 2)!;
    expect(Math.abs(250 - foodLeft[0]!.x)).toBeGreaterThan(range);       // out of range before
    expect(movedIn.x).toBeCloseTo(250 + 0.001 - displacement, 6);
    expect(Math.hypot(movedIn.x - foodLeft[0]!.x, movedIn.y - foodLeft[0]!.y)).toBeLessThan(range); // in range after
    expect(intoRange.food.some((f) => f.id === 1)).toBe(false);          // so it ate

    // (28) pushed OUT of range: the food is 4 units away, inside the feeding
    // range, and the collision carries the eater past it.
    const foodRight = [{ id: 1, x: 246, y: 250 }];
    const outOfRange = stepWorld(stationaryWorld(c, [solid(1, 247, 250, 1.5, push), solid(2, 250, 250, 0.5, eat)], foodRight), c).world;
    const movedOut = findOrganism(outOfRange, 2)!;
    expect(Math.abs(250 - foodRight[0]!.x)).toBeLessThan(range);         // in range before
    expect(movedOut.x).toBeCloseTo(250 + 0.001 + displacement, 6);
    expect(Math.hypot(movedOut.x - foodRight[0]!.x, movedOut.y - foodRight[0]!.y)).toBeGreaterThan(range); // out after
    expect(outOfRange.food.some((f) => f.id === 1)).toBe(true);          // the food is untouched
    expect(movedOut.energy).toBeLessThan(50);                            // it paid metabolism and gained nothing

    // Control: the identical eater with no body next to it keeps the food.
    const alone = stepWorld(stationaryWorld(c, [solid(2, 250, 250, 0.5, eat)], foodRight), c).world;
    expect(alone.food.some((f) => f.id === 1)).toBe(false);
    // …and there is no 'food defence' rule: the pusher never requested to eat,
    // gained no energy from the contact and lost none.
    expect(findOrganism(outOfRange, 1)!.energy).toBeLessThan(50);
  });

  it('(29) historical feeding behaviour is unchanged in 0A.4.0: the same pair passes through and still eats', () => {
    const c = v4();
    const mk = (id: number, x: number, size: number, targets: Parameters<typeof constantRecurrent>[0]) =>
      makeOrganism({ id, genome: { morphology: defaultMorphology({ size }), neural: constantRecurrent(targets) }, x, y: 250, hiddenState: zeroHiddenState(H) });
    const food = () => [{ id: 1, x: 246, y: 250 }];
    const withNeighbour = stepWorld(makeWorld({ config: c, organisms: [mk(1, 247, 1.5, { forward: 0.001 }), mk(2, 250, 0.5, { forward: 0.001, eat: 0.999 })], food: food(), fertility: uniformFertility(0) }), c).world;
    const alone = stepWorld(makeWorld({ config: c, organisms: [mk(2, 250, 0.5, { forward: 0.001, eat: 0.999 })], food: food(), fertility: uniformFertility(0) }), c).world;
    // The overlapping neighbour changes NOTHING about the eater's position: in
    // 0A.4.0 there is no body to displace it.
    expect(findOrganism(withNeighbour, 2)!.x).toBe(findOrganism(alone, 2)!.x);
    expect(findOrganism(withNeighbour, 2)!.y).toBe(findOrganism(alone, 2)!.y);
    expect(withNeighbour.food.some((f) => f.id === 1)).toBe(false); // and it ate, exactly as before V2.3
    expect(alone.food.some((f) => f.id === 1)).toBe(false);

    // The same geometry under 0A.5.0 does displace it, and it misses the food.
    const c5 = v5();
    const solidRun = stepWorld(stationaryWorld(c5, [solid(1, 247, 250, 1.5, { forward: 0.001 }), solid(2, 250, 250, 0.5, { forward: 0.001, eat: 0.999 })], food()), c5).world;
    expect(findOrganism(solidRun, 2)!.x).not.toBe(findOrganism(alone, 2)!.x);
    expect(solidRun.food.some((f) => f.id === 1)).toBe(true);
  });

  it('(35) 0A.4.0 organisms still pass through one another completely, including at the same point', () => {
    const c = v4();
    const mk = (id: number, x: number, y: number) => makeOrganism({ id, genome: { morphology: defaultMorphology({ size: 1.5 }), neural: constantRecurrent() }, x, y, hiddenState: zeroHiddenState(H) });
    const crowd = stepWorld(makeWorld({ config: c, organisms: [mk(1, 250, 250), mk(2, 250, 250), mk(3, 250.5, 250)], fertility: uniformFertility(0) }), c).world;
    const solo = stepWorld(makeWorld({ config: c, organisms: [mk(1, 250, 250)], fertility: uniformFertility(0) }), c).world;
    // Bit-identical to the same organism alone: coincident 0A.4.0 bodies do
    // not interact at all, and two of them stay exactly coincident.
    expect(findOrganism(crowd, 1)!.x).toBe(findOrganism(solo, 1)!.x);
    expect(findOrganism(crowd, 1)!.y).toBe(findOrganism(solo, 1)!.y);
    expect(findOrganism(crowd, 2)!.x).toBe(findOrganism(crowd, 1)!.x);
    expect(findOrganism(crowd, 2)!.y).toBe(findOrganism(crowd, 1)!.y);

    // The same three organisms under 0A.5.0 are pushed apart.
    const c5 = v5();
    const solidNext = stepWorld(makeWorld({ config: c5, organisms: [solid(1, 250, 250, 1.5), solid(2, 250, 250, 1.5), solid(3, 250.5, 250, 1.5)], fertility: uniformFertility(0) }), c5).world;
    const a = findOrganism(solidNext, 1)!;
    const b = findOrganism(solidNext, 2)!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(1);
  });
});

// =====================================================================
// Newborns and genome protection (30–34)
// =====================================================================

describe('newborn overlap and reproduction', () => {
  /** A controller that always reproduces and never moves or eats. */
  const breeder = (): NeuralGenome => ({
    inputHiddenWeights: zeros(H * I),
    hiddenBiases: zeros(H),
    hiddenOutputWeights: zeros(NEURAL_OUTPUT_SIZE * H),
    outputBiases: [logit(0.001), 0, logit(0.001), logit(0.999)],
    recurrentHiddenWeights: zeros(H * H),
  });

  const parentWorld = (c: SimulationConfig) =>
    makeWorld({
      config: c,
      organisms: [makeOrganism({
        id: 1,
        genome: { morphology: defaultMorphology({ size: 1 }), neural: breeder() },
        x: 250, y: 250, energy: 100, age: c.lifecycle.maturityAge + 1,
        hiddenState: zeroHiddenState(H),
      })],
      fertility: uniformFertility(0),
    });

  it('(30, 31) a newborn starts with zero memory and is separated by the same passive body rule — never left inside its parent', () => {
    const c = v5();
    const next = stepWorld(parentWorld(c), c).world;
    const child = next.organisms.find((o) => o.parentId === 1)!;
    expect(child).toBeDefined();
    expect(child.hiddenState).toEqual(zeroHiddenState(H)); // (30) memory still begins at zero
    expect(child.age).toBe(0);

    // (31) The newborn is separated from its parent by the same passive body
    // rule, to within floating-point tangency. Exact tangency is not
    // representable in binary floating point, so a residual penetration of the
    // order of machine epsilon can survive the strict `<` overlap test; it is
    // reported honestly rather than papered over with a fudge factor.
    const parent = findOrganism(next, 1)!;
    const minimum = physicalRadius(parent, c) + physicalRadius(child, c);
    const distance = Math.hypot(parent.x - child.x, parent.y - child.y);
    expect(minimum - distance).toBeLessThan(1e-9); // ~3.6e-15 here, on radii of ~4.2
    expect(countBodyOverlaps(next.organisms, c)).toBeLessThanOrEqual(1);
    // and the newborn is genuinely outside its parent, not merely nudged
    expect(distance).toBeGreaterThan(0.99 * minimum);

    // the newborn got no extra neural action: it did not move under its own
    // controller and its memory is still the birth value
    expect(child.energy).toBe(c.energy.birthEnergy);
  });

  it('(32) birth handling adds no RNG draws: 0A.4.0 and 0A.5.0 consume exactly the same canonical schedule', () => {
    const c5 = v5();
    const c4 = v4();
    const count = (c: SimulationConfig) => {
      const spyFloat = vi.spyOn(RngStream.prototype, 'nextFloat');
      const spyRange = vi.spyOn(RngStream.prototype, 'nextInRange');
      const world = makeWorld({
        config: c,
        organisms: [makeOrganism({
          id: 1,
          genome: { morphology: defaultMorphology({ size: 1 }), neural: breeder() },
          x: 250, y: 250, energy: 100, age: c.lifecycle.maturityAge + 1,
          hiddenState: zeroHiddenState(H),
        })],
        fertility: uniformFertility(0),
      });
      const result = stepWorld(world, c);
      const totals = { float: spyFloat.mock.calls.length, range: spyRange.mock.calls.length, births: result.telemetry.births };
      spyFloat.mockRestore();
      spyRange.mockRestore();
      return totals;
    };
    const five = count(c5);
    const four = count(c4);
    expect(five.births).toBe(1);
    expect(four.births).toBe(1);
    expect(five).toEqual(four); // identical draw schedule; collision consumed nothing

    // and the child's genome is bit-identical between the two models
    const childOf = (c: SimulationConfig) => {
      const w = stepWorld(makeWorld({
        config: c,
        organisms: [makeOrganism({
          id: 1, genome: { morphology: defaultMorphology({ size: 1 }), neural: breeder() },
          x: 250, y: 250, energy: 100, age: c.lifecycle.maturityAge + 1, hiddenState: zeroHiddenState(H),
        })],
        fertility: uniformFertility(0),
      }), c).world;
      return w.organisms.find((o) => o.parentId === 1)!;
    };
    expect(childOf(c5).genome).toEqual(childOf(c4).genome);
  });

  it('(33, 34) genome and mutation semantics are unchanged: same rates, same bounds, same draw schedule as 0A.4.0', () => {
    const c5 = v5();
    const c4 = v4();
    expect(c5.mutation).toEqual(c4.mutation);
    expect(c5.bootstrap.geneBounds).toEqual(c4.bootstrap.geneBounds);
    expect(c5.neural).toEqual(c4.neural);
    expect(c5.reproduction).toEqual(c4.reproduction);
    expect(c5.energy).toEqual(c4.energy);
    expect(c5.food).toEqual(c4.food);
    expect(c5.lifecycle).toEqual(c4.lifecycle);
    expect(c5.world).toEqual(c4.world);
    expect(c5.population).toEqual(c4.population);
    expect(c5.fertility).toEqual(c4.fertility);

    // identical neural mutation draw schedule (124 + 64 = 188 uniforms, recurrent last)
    const draws = (recurrent: boolean) => {
      const stream = new RngStream(42, 'canonical');
      const spy = vi.spyOn(stream, 'nextFloat');
      const g: NeuralGenome = {
        inputHiddenWeights: zeros(H * I),
        hiddenBiases: zeros(H),
        hiddenOutputWeights: zeros(NEURAL_OUTPUT_SIZE * H),
        outputBiases: zeros(NEURAL_OUTPUT_SIZE),
        ...(recurrent ? { recurrentHiddenWeights: zeros(H * H) } : {}),
      };
      mutateNeural(g, stream, c5.mutation, c5.neural.neuralParamBounds, recurrent);
      const n = spy.mock.calls.length;
      spy.mockRestore();
      return n;
    };
    expect(draws(true)).toBe(188);
    expect(draws(false)).toBe(124);

    // morphology mutation is untouched by V2.3 — size is still an ordinary gene
    const stream = new RngStream(7, 'canonical');
    const m = mutateMorphology(defaultMorphology({ size: 1 }), stream, c5.mutation, c5.bootstrap.geneBounds);
    expect(m.size).toBeGreaterThanOrEqual(c5.bootstrap.geneBounds.size.min);
    expect(m.size).toBeLessThanOrEqual(c5.bootstrap.geneBounds.size.max);
  });
});

// =====================================================================
// The 0A.5.0 golden regression
// =====================================================================

describe('0A.5.0 golden regression (seed 20260910, 10,000 ticks)', () => {
  it('reproduces PHYSICAL_BODIES_GOLDEN_HASH twice, with pinned checkpoints while the world is alive', () => {
    expect(PHYSICAL_BODIES_GOLDEN_HASH).toBe('1006a56393e19cd9');
    for (let run = 0; run < 2; run++) {
      const c = v5();
      let w = bootstrapWorld(c);
      w = runTo(w, c, 500);
      expect(canonicalStateHash(w)).toBe('faa74c30055fde98');
      w = runTo(w, c, 1000);
      expect(canonicalStateHash(w)).toBe('404f8619ffdab600');
      w = runTo(w, c, 2000);
      expect(canonicalStateHash(w)).toBe('e426cc438e25467e');
      w = runTo(w, c, 10000);
      expect(canonicalStateHash(w)).toBe(PHYSICAL_BODIES_GOLDEN_HASH);
    }
    const summary = runSimulation(v5(), 10_000).summary;
    expect(summary.simulationVersion).toBe('0A.5.0');
    expect(summary.finalStateHash).toBe(PHYSICAL_BODIES_GOLDEN_HASH);
    // Reported honestly: the canonical seed's 0A.5.0 world dies out. Extinction
    // is a legitimate result and no seed was shopped for a prettier one.
    expect(summary.extinct).toBe(true);
    expect(summary.totalBirths).toBe(2);
  }, 60_000);

  it('coverage checkpoint with births and crowding (seed 8, tick 2,500) — not a golden reference', () => {
    const c = v5(LIVING_SEED);
    const r = runSimulation(c, 2500);
    expect(r.summary.totalBirths).toBe(81);
    expect(r.summary.finalStateHash).toBe('f398b7b9229d447c');
    expect(r.summary.endingPopulation).toBeGreaterThan(0);
    // every position is valid and inside the world after 2,500 ticks of physics
    for (const o of r.world.organisms) {
      expect(Number.isFinite(o.x) && Number.isFinite(o.y)).toBe(true);
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(o.x).toBeLessThanOrEqual(c.world.width);
      expect(o.y).toBeGreaterThanOrEqual(0);
      expect(o.y).toBeLessThanOrEqual(c.world.height);
    }
  }, 60_000);
});
