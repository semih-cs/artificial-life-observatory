import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLASTICITY_CONFIG, PLASTICITY_ELIGIBILITY_DECAY, PLASTICITY_LEARNING_RATE, LIFETIME_PLASTICITY_GOLDEN_HASH,
  lifetimePlasticityModelConfig, modelConfig,
} from '../src/config/defaults.js';
import { validateConfig } from '../src/config/types.js';
import { simulationModel, SUPPORTED_MODEL_VERSIONS } from '../src/model/simulationModel.js';
import { NEURAL_OUTPUT_SIZE, NeuralGenome } from '../src/genome/types.js';
import { networkParamCount, evaluatePlasticRecurrentNetwork } from '../src/neural/network.js';
import { applyPlasticityUpdate, metabolicReinforcement, updateEligibilityTraces } from '../src/neural/plasticity.js';
import { bootstrapWorld } from '../src/world/bootstrap.js';
import { stepWorld, senseContextFor } from '../src/world/stepWorld.js';
import { runSimulation } from '../src/world/runner.js';
import { canonicalizeWorldState, canonicalStateHash } from '../src/serialization/canonicalState.js';
import { createOffspring } from '../src/world/offspring.js';
import { createRngStreams } from '../src/rng/rngStream.js';
import { initializePlasticityState, OrganismRuntimeState } from '../src/organism/types.js';
import { defaultMorphology, makeOrganism, makeWorld, uniformFertility } from './helpers.js';

const H = 8;
const I = 10;
const zeros = (n: number) => new Array<number>(n).fill(0);
const logit = (p: number) => Math.log(p / (1 - p));

function genome(): NeuralGenome {
  return {
    inputHiddenWeights: zeros(H * I),
    hiddenBiases: new Array(H).fill(0.5),
    hiddenOutputWeights: zeros(H * NEURAL_OUTPUT_SIZE),
    outputBiases: [logit(0.7), 0, logit(0.8), logit(0.15)],
    recurrentHiddenWeights: zeros(H * H),
  };
}

function organism(id = 1): OrganismRuntimeState {
  return makeOrganism({
    id, genome: { morphology: defaultMorphology(), neural: genome() }, x: 100, y: 100,
    hiddenState: zeros(H), ...initializePlasticityState(H, NEURAL_OUTPUT_SIZE),
  });
}

const raw = { forward: 0.75, turn: -0.25, eat: 0.8, reproduce: 0.2 };

describe('V2.5 model identity and runtime layout', () => {
  it('keeps 0A.1.0-0A.6.0 non-plastic and enables plasticity only for 0A.7.0', () => {
    expect(SUPPORTED_MODEL_VERSIONS).toEqual(['0A.1.0', '0A.2.0', '0A.3.0', '0A.4.0', '0A.5.0', '0A.6.0', '0A.7.0']);
    for (const version of SUPPORTED_MODEL_VERSIONS.slice(0, -1)) {
      expect(simulationModel(version).lifetimePlasticity).toBe(false);
      expect(modelConfig(version).plasticity).toBeUndefined();
    }
    const model = simulationModel('0A.7.0');
    expect(model).toMatchObject({ neuralInputSize: 10, recurrent: true, physicalBodies: true, foodHandling: true, lifetimePlasticity: true });
    expect(lifetimePlasticityModelConfig().plasticity).toEqual({ learningRate: 0.01, eligibilityDecay: 0.90 });
    expect(PLASTICITY_LEARNING_RATE).toBe(0.01);
    expect(PLASTICITY_ELIGIBILITY_DECAY).toBe(0.90);
    expect(networkParamCount(10, 8, 4, true)).toBe(188);
  });

  it('fresh founders have exactly 36 zero offsets and 36 zero eligibility traces', () => {
    const c = lifetimePlasticityModelConfig(); c.rootSeed = 20260910;
    const w = bootstrapWorld(c);
    for (const o of w.organisms) {
      expect(o.hiddenOutputWeightOffsets).toHaveLength(32);
      expect(o.outputBiasOffsets).toHaveLength(4);
      expect(o.hiddenOutputEligibilityTraces).toHaveLength(32);
      expect(o.outputBiasEligibilityTraces).toHaveLength(4);
      expect([...o.hiddenOutputWeightOffsets!, ...o.outputBiasOffsets!].every((x) => Object.is(x, 0))).toBe(true);
      expect([...o.hiddenOutputEligibilityTraces!, ...o.outputBiasEligibilityTraces!].every((x) => Object.is(x, 0))).toBe(true);
      expect(o.hiddenState).toEqual(zeros(H));
    }
  });

  it('requires the fixed plasticity config only on 0A.7.0 and keeps founder genetic draws identical to 0A.6.0', () => {
    const c7 = lifetimePlasticityModelConfig(); c7.rootSeed = 42;
    expect(() => validateConfig({ ...c7, plasticity: undefined })).toThrow(/requires a plasticity/);
    expect(() => validateConfig({ ...c7, plasticity: { learningRate: 0.02, eligibilityDecay: 0.90 } })).toThrow(/exactly 0.01/);
    const c6 = modelConfig('0A.6.0'); c6.rootSeed = 42;
    expect(() => validateConfig({ ...c6, plasticity: DEFAULT_PLASTICITY_CONFIG })).toThrow(/non-plastic/);
    const w7 = bootstrapWorld(c7), w6 = bootstrapWorld(c6);
    expect(w7.organisms.map((o) => o.genome)).toEqual(w6.organisms.map((o) => o.genome));
    expect(w7.rng).toEqual(w6.rng);
  });

  it('adds no action and makes learned state, but not historical empty fields, canonical', () => {
    const c7 = lifetimePlasticityModelConfig(); c7.rootSeed = 42;
    const w7 = bootstrapWorld(c7);
    const record7 = canonicalizeWorldState(w7) as any;
    expect(Object.keys(record7.organisms[0]).sort()).toContain('hiddenOutputWeightOffsets');
    const learned = structuredClone(w7);
    learned.organisms[0]!.hiddenOutputWeightOffsets![0] = 0.001;
    expect(canonicalStateHash(learned)).not.toBe(canonicalStateHash(w7));

    const c6 = modelConfig('0A.6.0'); c6.rootSeed = 42;
    const record6 = canonicalizeWorldState(bootstrapWorld(c6)) as any;
    expect(record6.organisms[0]).not.toHaveProperty('hiddenOutputWeightOffsets');
    expect(record6.organisms[0]).not.toHaveProperty('hiddenOutputEligibilityTraces');
    expect(NEURAL_OUTPUT_SIZE).toBe(4);
    expect(c7.neural.hiddenLayerSize).toBe(8);
  });
});

describe('deterministic three-factor learning rule', () => {
  it('updates eligibility from hidden activation and centered raw outputs with decay 0.90', () => {
    const o = organism();
    o.hiddenOutputEligibilityTraces!.fill(1);
    o.outputBiasEligibilityTraces!.fill(1);
    const hidden = [0.5, ...zeros(H - 1)];
    updateEligibilityTraces(o, hidden, raw, DEFAULT_PLASTICITY_CONFIG);
    expect(o.hiddenOutputEligibilityTraces![0]).toBeCloseTo(0.90 + 0.5 * 0.5, 14);
    expect(o.hiddenOutputEligibilityTraces![H]).toBeCloseTo(0.90 + 0.5 * -0.25, 14);
    expect(o.outputBiasEligibilityTraces![0]).toBeCloseTo(1.4, 14);
    expect(o.outputBiasEligibilityTraces![1]).toBeCloseTo(0.65, 14);
    expect(o.outputBiasEligibilityTraces![2]).toBeCloseTo(1.5, 14);
    expect(o.outputBiasEligibilityTraces![3]).toBeCloseTo(0.3, 14);
  });

  it('positive and negative reinforcement move effective parameters in opposite predicted directions', () => {
    const positive = organism();
    positive.hiddenOutputEligibilityTraces![0] = 2;
    positive.outputBiasEligibilityTraces![0] = 2;
    applyPlasticityUpdate(positive, 0.5, DEFAULT_PLASTICITY_CONFIG, { min: -2, max: 2 });
    expect(positive.hiddenOutputWeightOffsets![0]).toBeCloseTo(0.01);
    expect(positive.outputBiasOffsets![0]).toBeCloseTo(0.01);
    const negative = organism();
    negative.hiddenOutputEligibilityTraces![0] = 2;
    negative.outputBiasEligibilityTraces![0] = 2;
    applyPlasticityUpdate(negative, -0.5, DEFAULT_PLASTICITY_CONFIG, { min: -2, max: 2 });
    expect(negative.hiddenOutputWeightOffsets![0]).toBeCloseTo(-0.01);
    expect(negative.outputBiasOffsets![0]).toBeCloseTo(-0.01);
  });

  it('zero reinforcement evolves eligibility but leaves offsets exact zero; delayed reward uses the surviving trace', () => {
    const o = organism();
    for (let tick = 0; tick < 5; tick++) {
      updateEligibilityTraces(o, new Array(H).fill(0.5), raw, DEFAULT_PLASTICITY_CONFIG);
      applyPlasticityUpdate(o, 0, DEFAULT_PLASTICITY_CONFIG, { min: -2, max: 2 });
    }
    const surviving = o.hiddenOutputEligibilityTraces![2 * H]!;
    expect(surviving).toBeGreaterThan(0);
    expect(o.hiddenOutputWeightOffsets!.every((x) => Object.is(x, 0))).toBe(true);
    applyPlasticityUpdate(o, 0.25, DEFAULT_PLASTICITY_CONFIG, { min: -2, max: 2 });
    expect(o.hiddenOutputWeightOffsets![2 * H]).toBeCloseTo(0.01 * 0.25 * surviving, 14);
  });

  it('clamps effective parameters through the genetic bounds without modifying the genome', () => {
    const o = organism();
    (o.genome.neural.hiddenOutputWeights as number[])[0] = 1.999;
    const neuralBefore = JSON.stringify(o.genome.neural);
    o.hiddenOutputEligibilityTraces![0] = 100;
    applyPlasticityUpdate(o, 1, DEFAULT_PLASTICITY_CONFIG, { min: -2, max: 2 });
    expect(o.genome.neural.hiddenOutputWeights[0]! + o.hiddenOutputWeightOffsets![0]!).toBe(2);
    expect(JSON.stringify(o.genome.neural)).toBe(neuralBefore);
  });

  it('same genome plus different lifetime experience produces different output; same history is identical', () => {
    const a = organism(1), b = organism(2), c = organism(3);
    a.hiddenOutputEligibilityTraces![0] = b.hiddenOutputEligibilityTraces![0] = c.hiddenOutputEligibilityTraces![0] = 2;
    applyPlasticityUpdate(a, 0.5, DEFAULT_PLASTICITY_CONFIG, { min: -2, max: 2 });
    applyPlasticityUpdate(b, -0.5, DEFAULT_PLASTICITY_CONFIG, { min: -2, max: 2 });
    applyPlasticityUpdate(c, 0.5, DEFAULT_PLASTICITY_CONFIG, { min: -2, max: 2 });
    const input = zeros(I);
    const evalOf = (o: OrganismRuntimeState) => evaluatePlasticRecurrentNetwork(o.genome.neural, input, zeros(H), o.hiddenOutputWeightOffsets!, o.outputBiasOffsets!, H, I).outputs.forward;
    expect(evalOf(a)).not.toBe(evalOf(b));
    expect(evalOf(a)).toBe(evalOf(c));
    expect(a.genome.neural).toEqual(b.genome.neural);
  });

  it('uses only food credit minus movement expenditure, normalized and clamped', () => {
    expect(metabolicReinforcement(25, 5, 100)).toBe(0.2);
    expect(metabolicReinforcement(1, 5, 100)).toBe(-0.04);
    expect(metabolicReinforcement(0, 0, 100)).toBe(0);
    expect(metabolicReinforcement(500, 0, 100)).toBe(1);
    expect(metabolicReinforcement(0, 500, 100)).toBe(-1);
  });

  it('refuses malformed runtime dimensions before applying an update', () => {
    const o = organism();
    o.outputBiasOffsets!.pop();
    expect(() => applyPlasticityUpdate(o, 1, DEFAULT_PLASTICITY_CONFIG, { min: -2, max: 2 })).toThrow(/malformed runtime state/);
  });
});

describe('lifecycle, non-Lamarckian inheritance and RNG isolation', () => {
  it('stepWorld advances memory/eligibility once and changes offsets only for the future while preserving the genome', () => {
    const c = lifetimePlasticityModelConfig(); c.food.regenAttemptsPerTick = 0;
    const o = organism();
    const beforeGenome = JSON.stringify(o.genome);
    const beforeOffsets = [...o.hiddenOutputWeightOffsets!];
    const world = makeWorld({ config: c, organisms: [o], fertility: uniformFertility(0) });
    const expectedDecision = evaluatePlasticRecurrentNetwork(o.genome.neural, zeros(I), zeros(H), o.hiddenOutputWeightOffsets!, o.outputBiasOffsets!, H, I);
    const next = stepWorld(world, c).world.organisms[0]!;
    expect(next.hiddenState).not.toEqual(zeros(H));
    expect(next.hiddenOutputEligibilityTraces!.some((x) => x !== 0)).toBe(true);
    expect(next.hiddenOutputWeightOffsets).not.toEqual(beforeOffsets); // movement supplies negative reinforcement
    expect(JSON.stringify(next.genome)).toBe(beforeGenome);
    expect(world.organisms[0]!.hiddenState).toEqual(zeros(H)); // S_t and current action were not recomputed/mutated
    expect(expectedDecision.outputs.forward).toBeGreaterThan(0);
  });

  it('newborn resets memory, offsets and traces while inheriting the genetic baseline; plasticity consumes no RNG', () => {
    const c7 = lifetimePlasticityModelConfig();
    c7.mutation.morphologyMutationEnabled = false; c7.mutation.neuralMutationEnabled = false;
    const parent = organism();
    parent.hiddenState!.fill(0.7); parent.hiddenOutputWeightOffsets!.fill(0.3); parent.outputBiasOffsets!.fill(-0.2);
    parent.hiddenOutputEligibilityTraces!.fill(1.2); parent.outputBiasEligibilityTraces!.fill(-1.1);
    const rng7 = createRngStreams(9).canonical;
    const child7 = createOffspring(parent, 2, 1, rng7, c7, c7.world);
    expect(child7.genome).toEqual(parent.genome);
    expect(child7.hiddenState).toEqual(zeros(H));
    expect([...child7.hiddenOutputWeightOffsets!, ...child7.outputBiasOffsets!].every((x) => x === 0)).toBe(true);
    expect([...child7.hiddenOutputEligibilityTraces!, ...child7.outputBiasEligibilityTraces!].every((x) => x === 0)).toBe(true);

    const c6 = modelConfig('0A.6.0'); c6.mutation.morphologyMutationEnabled = false; c6.mutation.neuralMutationEnabled = false;
    const rng6 = createRngStreams(9).canonical;
    const child6 = createOffspring(parent, 2, 1, rng6, c6, c6.world);
    expect(child7.genome).toEqual(child6.genome);
    expect(rng7.getState()).toEqual(rng6.getState());
  });

  it('actual capped food credit teaches; acquisition/progress/collision alone do not create positive reward', () => {
    const c = lifetimePlasticityModelConfig(); c.food.regenAttemptsPerTick = 0; c.energy.baseMetabolicConstant = 0;
    const completing = organism(); completing.energy = 99;
    const held = { id: 1, x: 100, y: 100, holderId: 1, handlingProgress: 4 };
    const completed = stepWorld(makeWorld({ config: c, organisms: [completing], food: [held], fertility: uniformFertility(0) }), c).world.organisms[0]!;
    expect(completed.energy).toBe(100);
    const acquired = organism(); acquired.energy = 99;
    const acquisition = stepWorld(makeWorld({ config: c, organisms: [acquired], food: [{ id: 1, x: 100, y: 100, holderId: null, handlingProgress: 0 }], fertility: uniformFertility(0) }), c).world.organisms[0]!;
    expect(completed.outputBiasOffsets![2]).toBeGreaterThan(acquisition.outputBiasOffsets![2]!);
  });

  it('basal and reproduction costs are excluded from the plastic update', () => {
    const base = lifetimePlasticityModelConfig(); base.food.regenAttemptsPerTick = 0; base.lifecycle.maturityAge = 0;
    const a = organism(); a.age = 10; a.energy = 100;
    const b = organism(); b.age = 10; b.energy = 100;
    const c1 = structuredClone(base); c1.energy.baseMetabolicConstant = 0;
    const c2 = structuredClone(base); c2.energy.baseMetabolicConstant = 10;
    const n1 = stepWorld(makeWorld({ config: c1, organisms: [a], fertility: uniformFertility(0) }), c1).world.organisms.find((x) => x.id === 1)!;
    const n2 = stepWorld(makeWorld({ config: c2, organisms: [b], fertility: uniformFertility(0) }), c2).world.organisms.find((x) => x.id === 1)!;
    expect(n1.hiddenOutputWeightOffsets).toEqual(n2.hiddenOutputWeightOffsets);
    expect(n1.energy).not.toBe(n2.energy);

    const noBirthConfig = structuredClone(base); noBirthConfig.energy.baseMetabolicConstant = 0; noBirthConfig.neural.reproductionActionThreshold = 0.9;
    const birthConfig = structuredClone(base); birthConfig.energy.baseMetabolicConstant = 0; birthConfig.neural.reproductionActionThreshold = 0.1;
    const noBirthParent = organism(); noBirthParent.age = 10; noBirthParent.energy = 100;
    const birthParent = organism(); birthParent.age = 10; birthParent.energy = 100;
    const noBirth = stepWorld(makeWorld({ config: noBirthConfig, organisms: [noBirthParent], fertility: uniformFertility(0) }), noBirthConfig).world;
    const birth = stepWorld(makeWorld({ config: birthConfig, organisms: [birthParent], fertility: uniformFertility(0) }), birthConfig).world;
    expect(noBirth.organisms).toHaveLength(1);
    expect(birth.organisms).toHaveLength(2);
    expect(noBirth.organisms[0]!.hiddenOutputWeightOffsets).toEqual(birth.organisms.find((o) => o.id === 1)!.hiddenOutputWeightOffsets);
  });

  it('collision and merely seeing food add no reinforcement term', () => {
    const c = lifetimePlasticityModelConfig(); c.food.regenAttemptsPerTick = 0; c.energy.baseMetabolicConstant = 0;
    const alone = organism(1);
    const withFood = organism(1);
    const collisionA = organism(1), collisionB = organism(2); collisionB.x = collisionA.x; collisionB.y = collisionA.y;
    const a = stepWorld(makeWorld({ config: c, organisms: [alone], fertility: uniformFertility(0) }), c).world.organisms[0]!;
    const f = stepWorld(makeWorld({ config: c, organisms: [withFood], food: [{ id: 1, x: 101, y: 100, holderId: null, handlingProgress: 0 }], fertility: uniformFertility(0) }), c).world.organisms[0]!;
    const hit = stepWorld(makeWorld({ config: c, organisms: [collisionA, collisionB], fertility: uniformFertility(0) }), c).world.organisms.find((o) => o.id === 1)!;
    expect(f.hiddenOutputWeightOffsets).toEqual(a.hiddenOutputWeightOffsets);
    expect(hit.hiddenOutputWeightOffsets).toEqual(a.hiddenOutputWeightOffsets);
  });

  it('identical initial state has an identical learning trajectory independent of organism array order', () => {
    const c = lifetimePlasticityModelConfig(); c.food.regenAttemptsPerTick = 0;
    const a = organism(1), b = organism(2); b.x = 300; b.y = 300;
    let w1 = makeWorld({ config: c, organisms: [a, b], fertility: uniformFertility(0) });
    let w2 = makeWorld({ config: c, organisms: [organism(2), organism(1)], fertility: uniformFertility(0) });
    w2.organisms[0]!.x = 300; w2.organisms[0]!.y = 300;
    for (let i = 0; i < 10; i++) { w1 = stepWorld(w1, c).world; w2 = stepWorld(w2, c).world; }
    expect(w1.organisms).toEqual(w2.organisms);
  });
});

describe('0A.7.0 canonical linux-arm64 regression', () => {
  it('reproduces the new golden twice with pinned living checkpoints', () => {
    for (let run = 0; run < 2; run++) {
      const c = lifetimePlasticityModelConfig(); c.rootSeed = 20260910;
      let w = bootstrapWorld(c);
      while (w.tick < 500) w = stepWorld(w, c).world;
      expect(canonicalStateHash(w)).toBe('3430a275c26406f2');
      while (w.tick < 1000) w = stepWorld(w, c).world;
      expect(canonicalStateHash(w)).toBe('9cf7240aa1ca863e');
      while (w.tick < 2000) w = stepWorld(w, c).world;
      expect(canonicalStateHash(w)).toBe('cfeb892aecfbaf91');
      expect(runSimulation(c, 10_000).summary.finalStateHash).toBe(LIFETIME_PLASTICITY_GOLDEN_HASH);
    }
  }, 60_000);
});
