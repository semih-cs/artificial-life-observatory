/**
 * V2.2 — recurrent memory (model 0A.4.0).
 *
 * The Elman controller h_t = tanh(W_in x_t + W_rec h_(t-1) + b), the runtime
 * memory lifecycle (zero at birth, never inherited, advanced once per acting
 * tick from S_t), recurrent weights as ordinary inherited/mutated genome,
 * history-dependent behaviour, founder screening without memory, and the
 * protection of the three feed-forward models.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_SIMULATION_CONFIG, RECURRENT_MEMORY_GOLDEN_HASH, cloneConfig, modelConfig, recurrentMemoryModelConfig,
  organismSensingModelConfig,
} from '../src/config/defaults.js';
import { simulationModel, SUPPORTED_MODEL_VERSIONS } from '../src/model/simulationModel.js';
import { NeuralGenome, NEURAL_OUTPUT_SIZE } from '../src/genome/types.js';
import { evaluateNetwork, evaluateRecurrentNetwork, networkParamCount } from '../src/neural/network.js';
import { decideAction, decideRecurrentAction } from '../src/actions/decide.js';
import {
  drawNeuralGenome, mechanicalValidityCheck, minimalViabilityScreen, generateFounderNeuralGenome,
} from '../src/genome/founder.js';
import { bootstrapWorld, generateFounderProfiles } from '../src/world/bootstrap.js';
import { stepWorld, senseContextFor } from '../src/world/stepWorld.js';
import { runSimulation } from '../src/world/runner.js';
import { mutateNeural } from '../src/biology/mutation.js';
import { canonicalStateHash, canonicalStateString } from '../src/serialization/canonicalState.js';
import { createRngStreams, RngStream } from '../src/rng/rngStream.js';
import { OrganismRuntimeState, cloneRuntimeState } from '../src/organism/types.js';
import { WorldState } from '../src/world/types.js';
import { SimulationConfig } from '../src/config/types.js';
import { makeOrganism, makeWorld, findOrganism, defaultMorphology } from './helpers.js';

const H = 8;
const I = 10;
const GOLDEN_SEED = 20260910;
/** Test/live-verification seed: the first of 1, 2, 3, … whose 0A.4.0 world is alive at tick 10,000 (seeds 1–7 die out by tick 5,042). Not research evidence. */
const LIVING_SEED = 8;

const v4 = (seed = GOLDEN_SEED): SimulationConfig => { const c = recurrentMemoryModelConfig(); c.rootSeed = seed; return c; };
const flat = (g: NeuralGenome) => [...g.inputHiddenWeights, ...g.hiddenBiases, ...g.hiddenOutputWeights, ...g.outputBiases, ...(g.recurrentHiddenWeights ?? [])];
const fill = (n: number, off: number, amp = 0.9) => Array.from({ length: n }, (_, i) => Math.sin(off + i * 1.7) * amp);
const logit = (p: number) => Math.log(p / (1 - p));
const zeros = (n = H) => new Array<number>(n).fill(0);
const isExactZeros = (v: readonly number[] | undefined) => v !== undefined && v.length === H && v.every((x) => Object.is(x, 0));

/** A deterministic, non-trivial recurrent genome (no RNG). */
function richRecurrentGenome(): NeuralGenome {
  return {
    inputHiddenWeights: fill(H * I, 1),
    hiddenBiases: fill(H, 50, 0.4),
    hiddenOutputWeights: fill(NEURAL_OUTPUT_SIZE * H, 90, 1.5),
    outputBiases: fill(NEURAL_OUTPUT_SIZE, 130, 0.2),
    recurrentHiddenWeights: fill(H * H, 170, 1.2),
  };
}

/** Constant outputs (hidden -> output weights 0), but a hidden state that evolves: always reproduces, barely moves, never eats. */
function reproducingRecurrentGenome(): NeuralGenome {
  return {
    inputHiddenWeights: zeros(H * I),
    hiddenBiases: new Array<number>(H).fill(0.5),
    hiddenOutputWeights: zeros(NEURAL_OUTPUT_SIZE * H),
    outputBiases: [logit(0.001), 0, logit(0.001), logit(0.999)],
    recurrentHiddenWeights: fill(H * H, 7, 0.3),
  };
}

function runTo(world: WorldState, c: SimulationConfig, tick: number): WorldState {
  let w = world;
  while (w.tick < tick) w = stepWorld(w, c).world;
  return w;
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

const input = (k: number) => Array.from({ length: I }, (_, i) => Math.cos(k + i * 0.9) * 0.5);

describe('model identity and layout', () => {
  it('(1–4) 0A.1.0 / 0A.2.0 / 0A.3.0 stay feed-forward (6/6/10 → 8 → 4); 0A.4.0 is 10 → 8 recurrent → 4', () => {
    // V2.3 appended 0A.5.0 (recurrent like 0A.4.0, plus physical bodies).
    expect(SUPPORTED_MODEL_VERSIONS).toEqual(['0A.1.0', '0A.2.0', '0A.3.0', '0A.4.0', '0A.5.0', '0A.6.0', '0A.7.0', '0A.8.0']);
    const expected = { '0A.1.0': [6, false], '0A.2.0': [6, false], '0A.3.0': [10, false], '0A.4.0': [10, true], '0A.5.0': [10, true], '0A.6.0': [10, true], '0A.7.0': [10, true] } as const;
    for (const [version, [inputs, recurrent]] of Object.entries(expected)) {
      expect(simulationModel(version).neuralInputSize).toBe(inputs);
      expect(simulationModel(version).recurrent).toBe(recurrent);
      const c = modelConfig(version);
      c.rootSeed = GOLDEN_SEED;
      const w = bootstrapWorld(c);
      for (const o of w.organisms) {
        expect(o.genome.neural.inputHiddenWeights.length).toBe(H * inputs);
        expect(o.genome.neural.hiddenOutputWeights.length).toBe(NEURAL_OUTPUT_SIZE * H);
        expect(o.genome.neural.outputBiases.length).toBe(4);
        expect('recurrentHiddenWeights' in o.genome.neural).toBe(recurrent);
        expect('hiddenState' in o).toBe(recurrent);
      }
    }
    expect(simulationModel('0A.4.0').organismSensing).toBe(true); // the same ten V2.1 inputs
  });

  it('(5, 6) the recurrent matrix has hiddenSize² = 64 parameters; a 0A.4.0 controller has 188', () => {
    const w = bootstrapWorld(v4());
    for (const o of w.organisms) {
      expect(o.genome.neural.recurrentHiddenWeights!.length).toBe(H * H);
      expect(flat(o.genome.neural).length).toBe(188);
    }
    expect(networkParamCount(10, 8, 4, true)).toBe(188);
    expect(networkParamCount(10, 8, 4)).toBe(124);
    expect(networkParamCount(6, 8, 4)).toBe(92);
    // no other configuration knob exists for it
    const { simulationVersion: _a, ...rest4 } = recurrentMemoryModelConfig();
    const { simulationVersion: _b, ...rest2 } = cloneConfig(DEFAULT_SIMULATION_CONFIG);
    expect(rest4).toEqual(rest2);
  });

  it('(7) historical genomes neither have nor need recurrent weights; their canonical record has no memory', () => {
    const c3 = organismSensingModelConfig();
    c3.rootSeed = GOLDEN_SEED;
    const w3 = runTo(bootstrapWorld(c3), c3, 50);
    const g = w3.organisms[0]!.genome.neural;
    expect('recurrentHiddenWeights' in g).toBe(false);
    expect(mechanicalValidityCheck(g, H, c3.neural.neuralParamBounds, 10).valid).toBe(true);
    expect(() => evaluateNetwork(g, input(0), H, 10)).not.toThrow();
    const text = canonicalStateString(w3);
    expect(text).not.toContain('recurrentHiddenWeights');
    expect(text).not.toContain('hiddenState');
  });

  it('(8) 0A.4.0 genomes require recurrent weights and 0A.4.0 organisms require memory', () => {
    const rg = richRecurrentGenome();
    const { recurrentHiddenWeights: _dropped, ...ff } = rg;
    expect(() => evaluateRecurrentNetwork(ff, input(0), zeros(), H, I)).toThrow(/no recurrent weights/);
    expect(() => evaluateRecurrentNetwork({ ...rg, recurrentHiddenWeights: zeros(63) }, input(0), zeros(), H, I)).toThrow(/recurrent weights/);
    expect(() => evaluateRecurrentNetwork(rg, input(0), zeros(7), H, I)).toThrow(/previous hidden state/);
    expect(() => evaluateRecurrentNetwork(rg, input(0), [...zeros(7), Number.NaN], H, I)).toThrow(/non-finite/);
    expect(() => mechanicalValidityCheck(ff, H, { min: -2, max: 2 }, I, true)).toThrow(/recurrent/);
    const w = bootstrapWorld(v4());
    const noMemory = { ...w, organisms: w.organisms.map((o, k) => { const c = cloneRuntimeState(o); if (k === 0) delete c.hiddenState; return c; }) };
    expect(() => stepWorld(noMemory, v4())).toThrow(/no hidden state/);
    expect(() => canonicalStateHash(noMemory)).toThrow(/does not match the recurrent layout/);
    const noWeights = { ...w, organisms: w.organisms.map((o, k) => (k === 0 ? { ...o, genome: { ...o.genome, neural: ff } } : o)) };
    expect(() => stepWorld(noWeights, v4())).toThrow(/no recurrent weights/);
  });
});

describe('runtime memory lifecycle', () => {
  it('(9) every fresh founder organism starts with memory exactly [0,0,0,0,0,0,0,0]', () => {
    for (const seed of [GOLDEN_SEED, LIVING_SEED, 3]) {
      for (const o of bootstrapWorld(v4(seed)).organisms) expect(isExactZeros(o.hiddenState)).toBe(true);
    }
  });

  function birthWorld(mutationOn: boolean) {
    const c = v4();
    c.world.width = c.world.height = 200;
    c.food.regenAttemptsPerTick = 0;
    c.lifecycle.maturityAge = 10;
    c.mutation.morphologyMutationEnabled = mutationOn;
    c.mutation.neuralMutationEnabled = mutationOn;
    if (mutationOn) c.mutation.neuralMutationRate = 1;
    const parentMemory = [0.6, -0.4, 0.2, 0.9, -0.7, 0.1, -0.3, 0.5];
    const parent = makeOrganism({ id: 1, genome: deepFreeze({ morphology: defaultMorphology(), neural: reproducingRecurrentGenome() }), x: 100, y: 100, energy: 100, age: 20, hiddenState: [...parentMemory] });
    return { c, world: makeWorld({ config: c, organisms: [parent] }), parentMemory };
  }

  it('(10, 11, 12, 21) a newborn starts with zero memory — not the parent\'s — inherits the recurrent weights, and does not update in its birth tick', () => {
    const { c, world, parentMemory } = birthWorld(false);
    const w1 = stepWorld(world, c).world;
    const parent = findOrganism(w1, 1)!;
    const child = findOrganism(w1, 2)!;
    expect(child.parentId).toBe(1);
    expect(child.birthTick).toBe(1);
    expect(isExactZeros(child.hiddenState)).toBe(true); // (10) zero, (21) not advanced in its birth tick
    // the parent's memory advanced this tick and is non-zero; the child did not copy it (11)
    const expectedParent = decideRecurrentAction(world.organisms[0]!, senseContextFor(world, c), c.neural, H, I).hiddenState;
    expect(parent.hiddenState).toEqual(expectedParent);
    expect(world.organisms[0]!.hiddenState).toEqual(parentMemory); // S_t itself was not touched
    expect(parent.hiddenState!.some((v) => v !== 0)).toBe(true);
    expect(child.hiddenState).not.toEqual(parent.hiddenState);
    expect(child.hiddenState).not.toEqual(parentMemory);
    // (12) the recurrent weights ARE inherited through the genome (mutation off: exactly)
    expect(child.genome.neural.recurrentHiddenWeights).toEqual(parent.genome.neural.recurrentHiddenWeights);
    // on its first acting tick the newborn's memory is the controller applied to ZERO previous memory
    const w2 = stepWorld(w1, c).world;
    const childAfter = findOrganism(w2, 2)!;
    const ctx = senseContextFor(w1, c);
    const expectedChild = decideRecurrentAction(child, ctx, c.neural, H, I).hiddenState;
    expect(childAfter.hiddenState).toEqual(expectedChild);
    expect(childAfter.hiddenState).toEqual(new Array(H).fill(Math.tanh(0.5))); // bias only: recurrent term × 0 = 0
  });

  it('(13, 14) recurrent weights mutate under the existing neural mutation settings; the parent genome is untouched', () => {
    const { c, world } = birthWorld(true); // neural rate forced to 1 so every parameter mutates
    const parentGenome = world.organisms[0]!.genome;
    const before = JSON.stringify(parentGenome);
    const w1 = stepWorld(world, c).world; // parent genome is deep-frozen: any write would throw
    const child = findOrganism(w1, 2)!;
    expect(JSON.stringify(findOrganism(w1, 1)!.genome)).toBe(before);
    expect(findOrganism(w1, 1)!.genome).toBe(parentGenome); // same object: never replaced during life
    const pr = parentGenome.neural.recurrentHiddenWeights!;
    const cr = child.genome.neural.recurrentHiddenWeights!;
    expect(cr.length).toBe(64);
    expect(cr.every((v, i) => v !== pr[i] && Math.abs(v) <= 2)).toBe(true);
  });

  it('(15) memory changes over a life while the genome stays exactly the same', () => {
    const c = v4(LIVING_SEED);
    let w = bootstrapWorld(c);
    const id = w.organisms[0]!.id;
    const genome = w.organisms[0]!.genome;
    const genomeText = JSON.stringify(genome);
    const memories: string[] = [];
    for (let t = 0; t < 30; t++) {
      w = stepWorld(w, c).world;
      const o = findOrganism(w, id)!;
      expect(o.genome).toBe(genome);
      memories.push(JSON.stringify(o.hiddenState));
    }
    expect(JSON.stringify(genome)).toBe(genomeText);
    expect(new Set(memories).size).toBeGreaterThan(1);
  });

  it('(20, 21, 22) memory advances exactly once per acting tick, from S_t; newborns keep zero memory in their birth tick', () => {
    const c = v4(LIVING_SEED);
    let w = runTo(bootstrapWorld(c), c, 600); // past the first births
    let newbornsSeen = 0;
    for (let t = 0; t < 120; t++) {
      const ctx = senseContextFor(w, c);
      const expected = new Map(w.organisms.filter((o) => o.alive).map((o) => [o.id, decideRecurrentAction(o, ctx, c.neural, H, I).hiddenState]));
      const next = stepWorld(w, c).world;
      for (const o of next.organisms) {
        if (o.birthTick === next.tick) { expect(isExactZeros(o.hiddenState)).toBe(true); newbornsSeen++; }
        else expect(o.hiddenState, `organism ${o.id} at tick ${next.tick}`).toEqual(expected.get(o.id));
      }
      w = next;
    }
    expect(newbornsSeen).toBeGreaterThan(0);
  });

  it('(22) an organism never sees another organism\'s memory: changing B\'s memory changes nothing about A\'s decision', () => {
    const c = v4(LIVING_SEED);
    const w = runTo(bootstrapWorld(c), c, 300);
    const [a, b] = w.organisms;
    const altered: WorldState = { ...w, organisms: w.organisms.map((o) => (o.id === b!.id ? { ...cloneRuntimeState(o), hiddenState: new Array(H).fill(0.77) } : o)) };
    const n1 = stepWorld(w, c).world;
    const n2 = stepWorld(altered, c).world;
    const pick = (x: WorldState, id: number) => { const o = findOrganism(x, id)!; return { x: o.x, y: o.y, heading: o.heading, hiddenState: o.hiddenState }; };
    expect(pick(n2, a!.id)).toEqual(pick(n1, a!.id));
    expect(pick(n2, b!.id).hiddenState).not.toEqual(pick(n1, b!.id).hiddenState);
  });

  it('(23) deciding and stepping never modify the pre-decision state (deep-frozen S_t steps fine)', () => {
    const c = v4(LIVING_SEED);
    const w = runTo(bootstrapWorld(c), c, 200);
    const before = canonicalStateString(w);
    const frozen = deepFreeze(w);
    const ctx = senseContextFor(frozen, c);
    for (const o of frozen.organisms) decideRecurrentAction(o, ctx, c.neural, H, I);
    expect(() => stepWorld(frozen, c)).not.toThrow();
    expect(canonicalStateString(frozen)).toBe(before);
  });

  it('(22) the next state does not depend on the order of the organism array', () => {
    const c = v4(LIVING_SEED);
    const w = runTo(bootstrapWorld(c), c, 400);
    const reversed = { ...w, organisms: [...w.organisms].reverse() };
    expect(canonicalStateString(stepWorld(reversed, c).world)).toBe(canonicalStateString(stepWorld(w, c).world));
  });
});

describe('canonical state includes memory', () => {
  it('two 0A.4.0 worlds that differ only in one organism\'s memory hash differently — and have different futures', () => {
    const c = v4(LIVING_SEED);
    const w = runTo(bootstrapWorld(c), c, 300);
    const other: WorldState = { ...w, organisms: w.organisms.map((o, k) => (k === 0 ? { ...cloneRuntimeState(o), hiddenState: o.hiddenState!.map((v) => v + 0.25) } : o)) };
    expect(canonicalStateHash(other)).not.toBe(canonicalStateHash(w));
    const text = canonicalStateString(w);
    expect(text).toContain('"recurrentHiddenWeights"');
    expect(text).toContain('"hiddenState"');
    const id = w.organisms[0]!.id;
    const a = findOrganism(stepWorld(w, c).world, id)!;
    const b = findOrganism(stepWorld(other, c).world, id)!;
    expect([a.x, a.y, a.heading]).not.toEqual([b.x, b.y, b.heading]);
  });
});

describe('history-dependent behaviour (the capability of this slice)', () => {
  const g = richRecurrentGenome();
  const x = input(3);

  it('(16) the same current input with different previous memory gives different outputs and a different ActionIntent', () => {
    const hA = zeros();
    const hB = [0.9, -0.9, 0.5, -0.5, 0.7, -0.2, 0.3, -0.8];
    const a = evaluateRecurrentNetwork(g, x, hA, H, I);
    const b = evaluateRecurrentNetwork(g, x, hB, H, I);
    expect(a.outputs).not.toEqual(b.outputs);
    expect(a.hiddenState).not.toEqual(b.hiddenState);
    const c = v4();
    const oA = makeOrganism({ id: 1, genome: { morphology: defaultMorphology(), neural: g }, x: 250, y: 250, hiddenState: hA });
    const oB = makeOrganism({ id: 1, genome: { morphology: defaultMorphology(), neural: g }, x: 250, y: 250, hiddenState: hB });
    const ctx = senseContextFor(makeWorld({ config: c, organisms: [oA] }), c);
    const iA = decideRecurrentAction(oA, ctx, c.neural, H, I).intent;
    const iB = decideRecurrentAction(oB, ctx, c.neural, H, I).intent;
    expect(iA.requestedForwardSpeed).not.toBe(iB.requestedForwardSpeed);
    expect(iA.requestedTurnRate).not.toBe(iB.requestedTurnRate);
  });

  it('(17) two different sensory histories that end in the SAME input produce different outputs; a feed-forward controller cannot', () => {
    const historyA = [input(0), input(1), x];
    const historyB = [input(5), input(9), x];
    const run = (history: number[][]) => {
      let h = zeros();
      let out = evaluateRecurrentNetwork(g, history[0]!, h, H, I);
      for (const step of history) { out = evaluateRecurrentNetwork(g, step, h, H, I); h = out.hiddenState; }
      return out.outputs;
    };
    const outA = run(historyA);
    const outB = run(historyB);
    expect(outA).not.toEqual(outB);
    // the same comparison for the feed-forward part of the genome: only the current input matters
    const { recurrentHiddenWeights: _r, ...ff } = g;
    expect(evaluateNetwork(ff, x, H, I)).toEqual(evaluateNetwork(ff, x, H, I));
    // and in a live world: two organisms at the same place and heading, same genome, different memory → different moves
    const c = v4();
    const same = (id: number, hiddenState: number[]) => makeOrganism({ id, genome: { morphology: defaultMorphology(), neural: g }, x: 250, y: 250, heading: 1, hiddenState });
    const remembered = evaluateRecurrentNetwork(g, input(1), evaluateRecurrentNetwork(g, input(0), zeros(), H, I).hiddenState, H, I).hiddenState;
    const wA = stepWorld(makeWorld({ config: c, organisms: [same(1, remembered)] }), c).world;
    const wB = stepWorld(makeWorld({ config: c, organisms: [same(1, zeros())] }), c).world;
    expect([wA.organisms[0]!.x, wA.organisms[0]!.heading]).not.toEqual([wB.organisms[0]!.x, wB.organisms[0]!.heading]);
  });

  it('(18) with zero previous memory the recurrent term is exactly zero: the first evaluation equals the feed-forward one', () => {
    const { recurrentHiddenWeights: _r, ...ff } = g;
    for (const k of [0, 1, 2, 7]) {
      const rec = evaluateRecurrentNetwork(g, input(k), zeros(), H, I);
      expect(rec.outputs).toEqual(evaluateNetwork(ff, input(k), H, I));
    }
    // and it does not depend on the recurrent weights at all
    expect(evaluateRecurrentNetwork({ ...g, recurrentHiddenWeights: fill(64, 3, 2) }, x, zeros(), H, I)).toEqual(evaluateRecurrentNetwork(g, x, zeros(), H, I));
  });

  it('(19) recurrent evaluation is deterministic, RNG-free and pure', () => {
    const frozenG = deepFreeze(richRecurrentGenome());
    const h = deepFreeze([0.1, 0.2, -0.3, 0.4, -0.5, 0.6, -0.7, 0.8]);
    const xin = deepFreeze(input(4));
    const random = vi.spyOn(Math, 'random');
    try {
      const a = evaluateRecurrentNetwork(frozenG, xin, h, H, I);
      const b = evaluateRecurrentNetwork(frozenG, xin, h, H, I);
      expect(a).toEqual(b);
      expect(a.hiddenState).not.toBe(h);
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
    // the Elman formula, computed by hand for unit 0
    let sum = frozenG.hiddenBiases[0]!;
    for (let i = 0; i < I; i++) sum += frozenG.inputHiddenWeights[i]! * xin[i]!;
    for (let j = 0; j < H; j++) sum += frozenG.recurrentHiddenWeights![j]! * h[j]!;
    expect(evaluateRecurrentNetwork(frozenG, xin, h, H, I).hiddenState[0]).toBe(Math.tanh(sum));
  });
});

describe('0A.4.0 founders', () => {
  it('founders are drawn natively with the recurrent block appended last, from initSigma, within the neural bounds', () => {
    const c = v4();
    const a = createRngStreams(c.rootSeed).bootstrap;
    const b = createRngStreams(c.rootSeed).bootstrap;
    const raw = drawNeuralGenome(a, H, c.neural.initSigma, I, true);
    const manual = Array.from({ length: 188 }, () => b.gaussian(0, c.neural.initSigma));
    expect(flat(raw)).toEqual(manual); // blocks in order, recurrent last
    for (const f of generateFounderProfiles(createRngStreams(c.rootSeed).bootstrap, c)) {
      expect(f.genome.neural.recurrentHiddenWeights!.every((v) => Number.isFinite(v) && Math.abs(v) <= 2)).toBe(true);
    }
  });

  it('(24) every probe is evaluated from a fresh zero memory, independently: the screen cannot see the recurrent weights', () => {
    const c = v4();
    const founders = generateFounderProfiles(createRngStreams(c.rootSeed).bootstrap, c);
    for (const f of founders) {
      const g = f.genome.neural;
      const screen = minimalViabilityScreen(g, H, c.neural, c.bootstrap.founderProbe, I, true);
      expect(screen.pass).toBe(true);
      // If memory were carried from probe to probe, these extreme recurrent weights would change later probes.
      for (const rec of [zeros(64), new Array(64).fill(2), new Array(64).fill(-2), fill(64, 11, 2)]) {
        expect(minimalViabilityScreen({ ...g, recurrentHiddenWeights: rec }, H, c.neural, c.bootstrap.founderProbe, I, true)).toEqual(screen);
      }
      // …and it is exactly the 0A.3.0 screen of the feed-forward part
      const { recurrentHiddenWeights: _r, ...ff } = g;
      expect(minimalViabilityScreen(ff, H, c.neural, c.bootstrap.founderProbe, I)).toEqual(screen);
    }
  });

  it('(25) a founder that ignores memory entirely (all recurrent weights 0) is valid', () => {
    const c = v4();
    const f = generateFounderNeuralGenome(createRngStreams(c.rootSeed).bootstrap, H, c.neural, c.bootstrap, I, true).neural;
    const noMemoryUse = { ...f, recurrentHiddenWeights: zeros(64) };
    expect(mechanicalValidityCheck(noMemoryUse, H, c.neural.neuralParamBounds, I, true).valid).toBe(true);
    expect(minimalViabilityScreen(noMemoryUse, H, c.neural, c.bootstrap.founderProbe, I, true).pass).toBe(true);
  });
});

describe('protection of the feed-forward models', () => {
  it('(26) historical mutation draw schedules are unchanged: one uniform per parameter, 92 / 124, no recurrent block', () => {
    const c = modelConfig('0A.2.0');
    for (const [inputs, count] of [[6, 92], [10, 124]] as const) {
      const g: NeuralGenome = { inputHiddenWeights: fill(H * inputs, 1), hiddenBiases: fill(H, 2), hiddenOutputWeights: fill(32, 3), outputBiases: fill(4, 4) };
      const r = new RngStream(5, 'canonical');
      const out = mutateNeural(g, r, { ...c.mutation, neuralMutationRate: 0 }, c.neural.neuralParamBounds);
      const ref = new RngStream(5, 'canonical');
      for (let i = 0; i < count; i++) ref.nextFloat();
      expect(r.getState()).toEqual(ref.getState());
      expect('recurrentHiddenWeights' in out).toBe(false);
      expect(out).toEqual(g);
    }
    // 0A.4.0 visits its 64 recurrent parameters after the 124, with the same rule
    const g4 = richRecurrentGenome();
    const r4 = new RngStream(5, 'canonical');
    const replay = new RngStream(5, 'canonical');
    const child = mutateNeural(g4, r4, c.mutation, c.neural.neuralParamBounds);
    const expected = flat(g4).map((v) => (replay.nextFloat() < c.mutation.neuralMutationRate ? Math.max(-2, Math.min(2, v + replay.gaussian(0, c.mutation.neuralMutationSigma))) : v));
    expect(flat(child)).toEqual(expected);
    expect(r4.getState()).toEqual(replay.getState());
    expect(recurrentMemoryModelConfig().mutation).toEqual(DEFAULT_SIMULATION_CONFIG.mutation);
  });

  it('(27) feed-forward trajectories can never enter the recurrent evaluator, and the reverse', () => {
    const g = richRecurrentGenome();
    const { recurrentHiddenWeights: _r, ...ff } = g;
    expect(() => evaluateNetwork(g, input(0), H, I)).toThrow(/evaluated only by evaluateRecurrentNetwork/);
    expect(() => evaluateRecurrentNetwork(ff, input(0), zeros(), H, I)).toThrow(/evaluated only by evaluateNetwork/);
    const c3 = organismSensingModelConfig();
    const withMemory = makeOrganism({ id: 1, genome: { morphology: defaultMorphology(), neural: ff }, x: 50, y: 50, hiddenState: zeros() });
    expect(() => decideAction(withMemory, senseContextFor(makeWorld({ config: c3, organisms: [withMemory] }), c3), c3.neural, H, I)).toThrow(/recurrent hidden state/);
    expect(() => stepWorld(makeWorld({ config: c3, organisms: [withMemory] }), c3)).toThrow(/recurrent hidden state/);
    const recurrentInV3 = makeOrganism({ id: 1, genome: { morphology: defaultMorphology(), neural: g }, x: 50, y: 50 });
    expect(() => stepWorld(makeWorld({ config: c3, organisms: [recurrentInV3] }), c3)).toThrow(/recurrent weights/);
    // a real 0A.3.0 run never grows memory
    c3.rootSeed = GOLDEN_SEED;
    const w3 = runTo(bootstrapWorld(c3), c3, 500);
    expect(w3.organisms.every((o) => !('hiddenState' in o) && !('recurrentHiddenWeights' in o.genome.neural))).toBe(true);
  });
});

describe('0A.4.0 golden regression (seed 20260910, 10,000 ticks)', () => {
  it('reproduces RECURRENT_MEMORY_GOLDEN_HASH twice, with pinned checkpoints while the world is alive', () => {
    expect(RECURRENT_MEMORY_GOLDEN_HASH).toBe('436a377506063609');
    for (let run = 0; run < 2; run++) {
      const c = v4();
      let w = bootstrapWorld(c);
      w = runTo(w, c, 1000);
      expect(canonicalStateHash(w)).toBe('321c43755adfa040');
      w = runTo(w, c, 2000);
      expect(canonicalStateHash(w)).toBe('1215b0df8338e59e');
      w = runTo(w, c, 10000);
      expect(canonicalStateHash(w)).toBe(RECURRENT_MEMORY_GOLDEN_HASH);
    }
    const summary = runSimulation(v4(), 10_000).summary;
    expect(summary.simulationVersion).toBe('0A.4.0');
    expect(summary.finalStateHash).toBe(RECURRENT_MEMORY_GOLDEN_HASH);
  }, 60_000);

  it('coverage checkpoint with recurrent births (seed 8, tick 2,500) — not a golden reference', () => {
    const c = v4(LIVING_SEED);
    const r = runSimulation(c, 2500);
    expect(r.summary.totalBirths).toBe(113);
    expect(r.summary.finalStateHash).toBe('6560783d7e9c5086');
  }, 60_000);
});
