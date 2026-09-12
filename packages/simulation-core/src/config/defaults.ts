import { FoodHandlingConfig, PhysicalBodyConfig, PlasticityConfig, SimulationConfig } from './types.js';
import {
  SINGLE_FOUNDER_MODEL_VERSION,
  MULTI_FOUNDER_MODEL_VERSION,
  ORGANISM_SENSING_MODEL_VERSION,
  RECURRENT_MEMORY_MODEL_VERSION,
  PHYSICAL_BODIES_MODEL_VERSION,
  FOOD_HANDLING_MODEL_VERSION,
  LIFETIME_PLASTICITY_MODEL_VERSION,
  REGULATED_RECURRENT_INIT_MODEL_VERSION,
  regulatedRecurrentInitSigma,
} from '../model/simulationModel.js';

/**
 * Model identities (§13.76, its amendment, and V2.1). The version strings and
 * their structural meaning (neural input dimension, organism sensing) live in
 * `model/simulationModel.ts`; they are re-exported here for existing callers.
 *
 *   0A.1.0 vs 0A.2.0: the bootstrap rule is the only difference.
 *   0A.2.0 vs 0A.3.0: 0A.3.0 appends four nearest-visible-organism inputs
 *   (10 -> 8 -> 4 instead of 6 -> 8 -> 4); everything else is 0A.2.0.
 *   0A.3.0 vs 0A.4.0: 0A.4.0 makes the hidden layer recurrent (Elman:
 *   10 -> 8 recurrent -> 4, +64 recurrent weights, runtime memory);
 *   everything else is 0A.3.0.
 *   0A.4.0 vs 0A.5.0: 0A.5.0 gives organisms physical bodies (a size-derived
 *   radius and deterministic displacement on overlap) and adds the `body`
 *   configuration section; the controller, ecology and every other configured
 *   value are 0A.4.0's.
 *   0A.5.0 vs 0A.6.0: 0A.6.0 makes eating a multi-tick, contestable process
 *   (held food travels with its handler and physical contact dislodges it) and
 *   adds the `handling` configuration section; the controller, bodies, ecology
 *   and every other configured value are 0A.5.0's.
 *   0A.6.0 vs 0A.7.0: 0A.7.0 adds deterministic, lifetime-only plasticity to
 *   the recurrent controller's final readout and a fixed `plasticity` section;
 *   inherited genomes and all world mechanics remain 0A.6.0's.
 *   0A.6.0 vs 0A.8.0: 0A.8.0 is 0A.6.0 with the recurrent hidden->hidden block
 *   DRAWN from `neural.recurrentInitSigma` (= initSigma / sqrt(hiddenSize))
 *   instead of `initSigma`. Nothing else differs: same inputs, same outputs,
 *   same 188 parameters, same runtime recurrent equation, same bodies, same
 *   five-tick handling, same ecology, same mutation, and NO lifetime
 *   plasticity. 0A.8.0 is deliberately a sibling of 0A.6.0, not a successor of
 *   0A.7.0 — one variable is isolated.
 *
 * Each changes the canonical trajectory, so they are different models and must
 * never share a regression reference or be mixed in one analysis.
 */
export {
  SINGLE_FOUNDER_MODEL_VERSION,
  MULTI_FOUNDER_MODEL_VERSION,
  ORGANISM_SENSING_MODEL_VERSION,
  RECURRENT_MEMORY_MODEL_VERSION,
  PHYSICAL_BODIES_MODEL_VERSION,
  FOOD_HANDLING_MODEL_VERSION,
  LIFETIME_PLASTICITY_MODEL_VERSION,
  REGULATED_RECURRENT_INIT_MODEL_VERSION,
  regulatedRecurrentInitSigma,
};

/**
 * The historical single-founder model's deterministic regression reference:
 * seed 20260910, 10,000 ticks. It belongs to SINGLE_FOUNDER_MODEL_VERSION and
 * is NOT a regression target for the amended model, which by design produces a
 * different trajectory. It remains documented and testable via
 * `singleFounderModelConfig()`.
 */
export const SINGLE_FOUNDER_GOLDEN_HASH = '6a6576bd49e86b27';

/**
 * The V2.1 organism-sensing model's deterministic regression reference:
 * `organismSensingModelConfig()`, seed 20260910, 10,000 ticks — the same
 * canonical seed and tick count as the other two models. It belongs to
 * ORGANISM_SENSING_MODEL_VERSION only. It is evidence of trajectory stability
 * for this model, not of biological quality. The frozen v1 references
 * (`b95a0b4ef7dd8449` for 0A.2.0, SINGLE_FOUNDER_GOLDEN_HASH for 0A.1.0) are
 * unchanged and must never be replaced by it.
 */
export const ORGANISM_SENSING_GOLDEN_HASH = 'e54d0c11249b7849';

/**
 * The V2.2 recurrent-memory model's deterministic regression reference:
 * `recurrentMemoryModelConfig()`, seed 20260910, 10,000 ticks, confirmed on
 * linux-arm64 (the canonical development platform; see PROJECT_STATUS.md,
 * known gap 13). Evidence of trajectory stability for 0A.4.0 only — not that
 * memory is biologically useful.
 */
export const RECURRENT_MEMORY_GOLDEN_HASH = '436a377506063609';

/**
 * The V2.3 physical-bodies model's deterministic regression reference:
 * `physicalBodiesModelConfig()`, seed 20260910, 10,000 ticks, confirmed on
 * linux-arm64 (the canonical development platform; see PROJECT_STATUS.md,
 * known gap 13). Evidence of trajectory stability for 0A.5.0 only — not that
 * physical bodies are biologically better in any sense. The four historical
 * hashes above are unchanged by V2.3 and must never be replaced by it.
 */
export const PHYSICAL_BODIES_GOLDEN_HASH = '1006a56393e19cd9';

/**
 * The V2.4 contestable-food-handling model's deterministic regression
 * reference: `foodHandlingModelConfig()`, seed 20260910, 10,000 ticks,
 * confirmed on linux-arm64 (the canonical development platform; see
 * PROJECT_STATUS.md, known gap 13). Evidence of trajectory stability for
 * 0A.6.0 only — not that contestable food is biologically better in any
 * sense. The five historical hashes above are unchanged by V2.4 and must never
 * be replaced by it.
 */
export const FOOD_HANDLING_GOLDEN_HASH = '3e5b9671f5750712';

/** V2.5 canonical regression: seed 20260910, 10,000 ticks, linux-arm64. */
export const LIFETIME_PLASTICITY_GOLDEN_HASH = '04d0b7c5917ca0c0';

/**
 * The V2.6 regulated-recurrent-initialization model's deterministic regression
 * reference: `regulatedRecurrentInitModelConfig()`, seed 20260910, 10,000
 * ticks, confirmed on linux-arm64 (the canonical development platform; see
 * PROJECT_STATUS.md, known gap 13). Evidence of trajectory stability for
 * `0A.8.0` only. The seven historical hashes above are unchanged by V2.6 and
 * must never be replaced by it.
 */
export const REGULATED_RECURRENT_INIT_GOLDEN_HASH = '0806b096bf4d0061';

export const PLASTICITY_LEARNING_RATE = 0.01;
export const PLASTICITY_ELIGIBILITY_DECAY = 0.90;
export const DEFAULT_PLASTICITY_CONFIG: PlasticityConfig = {
  learningRate: PLASTICITY_LEARNING_RATE,
  eligibilityDecay: PLASTICITY_ELIGIBILITY_DECAY,
};

/**
 * The V2.4 handling contract (models 0A.6.0 and later).
 *
 * `ticksRequired` is `handlingTicksRequired` from the amendment: five
 * CONSECUTIVE successful handling ticks consume one food item, acquisition
 * being the first of them. It is part of the model's definition, not a knob to
 * tune a trajectory with.
 */
export const HANDLING_TICKS_REQUIRED = 5;

export const DEFAULT_FOOD_HANDLING_CONFIG: FoodHandlingConfig = {
  ticksRequired: HANDLING_TICKS_REQUIRED, // [BASELINE] consecutive handling ticks per food item
};

/**
 * The V2.3 body contract (models 0A.5.0 and later).
 *
 * `radiusBase` and `radiusPerSize` are transcribed from the body radius the
 * Observatory has drawn since Phase 0D slice 1 (`2.0 + 2.2 * size`), so the
 * physical body an organism occupies is the body a viewer sees: over the
 * §10.4 size range [0.5, 1.5] the radius runs [3.1, 5.3] world units.
 * `separationPasses` is the model's fixed deterministic solver budget.
 *
 * These are engineering baselines, not calibrated biology. They are NOT part
 * of any model before 0A.5.0.
 */
export const DEFAULT_PHYSICAL_BODY_CONFIG: PhysicalBodyConfig = {
  radiusBase: 2.0, // [BASELINE] world units at size 0
  radiusPerSize: 2.2, // [BASELINE] world units per unit of morphology size
  separationPasses: 4, // [BASELINE] fixed deterministic passes per resolution
};

const DEG = Math.PI / 180;

/**
 * Phase 0A default configuration.
 *
 * These are the specification's [BASELINE] values, transcribed from Spec v4.
 * They are engineering placeholders, NOT validated biological constants and
 * NOT a calibrated ecology. Ecological calibration is Phase 0B (§14.9,
 * §16). Do not tune these to make a population trajectory "look good".
 *
 * Where the spec gives a range, the midpoint (or the spec's own stated
 * "working value") is used and the source section is cited.
 */
export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  simulationVersion: MULTI_FOUNDER_MODEL_VERSION,
  rootSeed: 1,

  world: {
    // [BASELINE] The specification does not fix world dimensions, so this is
    // derived from the two constraints it does give:
    //   - §10.4's visionRange range [50, 250] should be a meaningful fraction
    //     of the world rather than covering all of it (250 is half the width
    //     here, 50 is a tenth);
    //   - §12.19's hint that ~50-75 food entities for 25 organisms should give
    //     roughly "2-3 visible food entities per initial organism". At 500x500
    //     with 60 items, a founder-midpoint vision cone (r=150, 105 degrees)
    //     covers ~20,600 of 250,000 world units, i.e. a handful of items.
    // World size is a first-order Phase 0B calibration target, not a constant.
    width: 500,
    height: 500,
  },

  population: {
    initialPopulationSize: 25, // [BASELINE] §14.4, §21.3
  },

  neural: {
    hiddenLayerSize: 8, // [BASELINE] §11.18
    initSigma: 0.8, // [BASELINE] §13.76 step 1
    neuralParamBounds: { min: -2, max: 2 }, // [BASELINE] §11.30
    neuralBootstrapSigma: 0.05, // [OPEN — EMPIRICAL] §13.76
    maxTurnRate: Math.PI / 6, // [BASELINE] radians/tick at output = +-1, §11.59
    eatThreshold: 0.5, // [OPEN — EMPIRICAL] magnitude; comparator >= is [LOCKED] §11.59
    reproductionActionThreshold: 0.5, // [OPEN — EMPIRICAL] magnitude; comparator >= is [LOCKED] §11.59
  },

  bootstrap: {
    // [OPEN — EMPIRICAL] ~1% of each gene range: small perturbation around one
    // common founder, deliberately much smaller than the mutation sigmas (§13.32).
    morphBootstrapSigma: {
      size: 0.01, // range 1.0
      maxSpeed: 0.015, // range 1.5
      visionRange: 2.0, // range 200
      visionAngle: 0.026, // range 150 deg ~= 2.618 rad
      metabolism: 0.01, // range 1.0
    },
    // [BASELINE] §10.4 initial engineering gene ranges, verbatim from Spec v4.
    geneBounds: {
      size: { min: 0.5, max: 1.5 },
      maxSpeed: { min: 0.5, max: 2.0 },
      visionRange: { min: 50, max: 250 },
      visionAngle: { min: 30 * DEG, max: 180 * DEG },
      metabolism: { min: 0.5, max: 1.5 },
    },
    // [BASELINE] §13.76 suggests 5. Measured against these fixtures, a
    // Gaussian-random controller clears all five checks about 0.7% of the
    // time (check (c), food approachability, is the binding one at ~3.9%), so
    // a budget of 5 would fail on almost every seed. 2000 puts the
    // probability of exhausting the budget at roughly 3e-7 per world.
    // This is a retry budget only: candidates are still accepted
    // first-pass-wins and are never compared, ranked or scored against each
    // other, so raising it does not weaken the no-cherry-picking guarantee.
    // The low pass rate is recorded as a Phase 0B calibration observation.
    maxFounderAttempts: 2000,
    // Amended §13.76: five independent founder controllers, five organisms
    // each. Introduced solely to give a world standing neural diversity at
    // tick 0, so a single bootstrap draw cannot decide its whole trajectory.
    // It is not an attempt to produce better controllers: the acceptance gate
    // is unchanged and founders are never compared.
    founderGroupCount: 5,
    boundaryMinSeparationFraction: 0.02, // [BASELINE] §13.76
    maxPlacementAttempts: 20, // [BASELINE] §13.76
    founderProbe: {
      lateralFoodAngle: 0.5, // [BASELINE] fixture: food 90 deg off-heading
      minForwardOutput: 0.5, // [BASELINE] fixture
      alignedTurnTolerance: 0.5, // [BASELINE] fixture: |turn| bound when food is dead ahead
      reproduceProbeEnergy: 0.95, // [BASELINE] fixture, NOT the real energy threshold
    },
  },

  lifecycle: {
    maturityAge: 500, // [BASELINE] §8.23, §12.36
    maxAge: 3000, // [BASELINE] §8.24, §12.30
  },

  energy: {
    energyCapacity: 100, // [BASELINE] §12.2
    configuredInitialEnergy: 50, // [BASELINE] §12.3
    // [BASELINE] §12.6 states ~0.02; §12.59's sanity calculation (50 / 0.08 ~= 625
    // ticks, inside the §12.11 500-700 tick target) implies basal 0.02 plus a
    // movement component of ~0.06 for a size-1.0 organism at velocity 1.0.
    baseMetabolicConstant: 0.02,
    movementEnergyCoefficient: 0.06,
    foodEnergyValue: 25, // [BASELINE] §12.13 (20-30), §12.11 (20-30% of capacity)
    reproductionEnergyThreshold: 75, // [BASELINE] §12.37 (70-80% of capacity)
    reproductionCost: 45, // [BASELINE] §12.40 (40-50% of capacity)
    birthEnergy: 25, // [BASELINE] §12.41; invariant reproductionCost > birthEnergy holds
  },

  fertility: {
    gridResolution: 8, // [BASELINE] coarse lattice, §12.22
    minFertility: 0.05, // [BASELINE] floor so no region is permanently barren
  },

  food: {
    initialFoodCount: 50, // [OPEN — EMPIRICAL] §12.20
    worldFoodCapacity: 60, // [BASELINE] §12.19 (~50-75 for an initial population of 25)
    regenAttemptsPerTick: 2, // [OPEN — EMPIRICAL] §12.21
    feedingRange: 5, // [BASELINE] §12.15
    minFoodSpawnDistance: 0, // [BASELINE] §12.25 — disabled until clustering proves pathological
  },

  mutation: {
    // Phase 0A default is both channels ON. The Phase 0B 2x2 factorial
    // (§14.15-§14.20) flips these two flags independently.
    morphologyMutationEnabled: true,
    neuralMutationEnabled: true,
    morphologyMutationRate: 0.1, // [BASELINE] §10.30, §13.8 — per gene per offspring
    neuralMutationRate: 0.05, // [BASELINE] §11.29, §13.10 — per parameter per offspring
    // [BASELINE] §10.31 / §13.9: sigma ~= 0.05 * geneRange, computed from the
    // geneBounds above.
    morphologyMutationSigma: {
      size: 0.05, // 0.05 * 1.0
      maxSpeed: 0.075, // 0.05 * 1.5
      visionRange: 10, // 0.05 * 200
      visionAngle: 0.1309, // 0.05 * (150 deg in radians)
      metabolism: 0.05, // 0.05 * 1.0
    },
    neuralMutationSigma: 0.05, // [BASELINE] §11.29
  },

  reproduction: {
    maxOffspringOffset: 10, // [OPEN — EMPIRICAL] §20.72, §12.46
  },
};

/**
 * The historical single-founder model, for regression and for reading old
 * results. Identical to the amended defaults except for the bootstrap rule and
 * the version string, so `bootstrapWorld` reproduces the pre-amendment
 * trajectory exactly — including SINGLE_FOUNDER_GOLDEN_HASH.
 */
export function singleFounderModelConfig(): SimulationConfig {
  const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
  config.simulationVersion = SINGLE_FOUNDER_MODEL_VERSION;
  config.bootstrap.founderGroupCount = 1;
  return config;
}

/**
 * The V2.1 organism-sensing model `0A.3.0`: the frozen v1 `0A.2.0` defaults
 * (five founder groups, unchanged mutation, ecology and bootstrap fixtures)
 * with only the model identity changed. The version selects the 10-input
 * sensory contract (see `model/simulationModel.ts`); no other configuration
 * value differs from DEFAULT_SIMULATION_CONFIG.
 */
export function organismSensingModelConfig(): SimulationConfig {
  const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
  config.simulationVersion = ORGANISM_SENSING_MODEL_VERSION;
  return config;
}

/**
 * The V2.2 recurrent-memory model `0A.4.0`: the 0A.3.0 configuration (itself
 * the frozen v1 defaults) with only the model identity changed. The version
 * selects the recurrent controller; no new configuration value exists — the
 * recurrent weights use the existing `initSigma`, `neuralParamBounds`,
 * `neuralBootstrapSigma` and neural mutation settings.
 */
export function recurrentMemoryModelConfig(): SimulationConfig {
  const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
  config.simulationVersion = RECURRENT_MEMORY_MODEL_VERSION;
  return config;
}

/**
 * The V2.3 physical-bodies model `0A.5.0`: the `0A.4.0` configuration (itself
 * the frozen v1 defaults) with the model identity changed and the `body`
 * section added. Nothing else differs — no ecology, mutation, energy,
 * reproduction or neural value is retuned for physical bodies. Size already
 * costs energy (movement cost scales with size); V2.3 only gives it a
 * physical consequence as well.
 */
export function physicalBodiesModelConfig(): SimulationConfig {
  const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
  config.simulationVersion = PHYSICAL_BODIES_MODEL_VERSION;
  config.body = { ...DEFAULT_PHYSICAL_BODY_CONFIG };
  return config;
}

/**
 * The V2.4 contestable-food-handling model `0A.6.0`: the `0A.5.0`
 * configuration (itself the frozen v1 defaults plus physical bodies) with the
 * model identity changed and the `handling` section added. Nothing else
 * differs — food energy value, feeding range, regeneration, the food cap,
 * fertility, metabolism, movement, reproduction, mutation, morphology bounds,
 * vision, offspring offset, lifespan and the collision settings are all
 * 0A.5.0's, untouched.
 */
export function foodHandlingModelConfig(): SimulationConfig {
  const config = physicalBodiesModelConfig();
  config.simulationVersion = FOOD_HANDLING_MODEL_VERSION;
  config.handling = { ...DEFAULT_FOOD_HANDLING_CONFIG };
  return config;
}

/** V2.5: the 0A.6.0 world plus runtime, non-inherited readout plasticity. */
export function lifetimePlasticityModelConfig(): SimulationConfig {
  const config = foodHandlingModelConfig();
  config.simulationVersion = LIFETIME_PLASTICITY_MODEL_VERSION;
  config.plasticity = { ...DEFAULT_PLASTICITY_CONFIG };
  return config;
}

/**
 * The V2.6 regulated-recurrent-initialization model `0A.8.0`: the `0A.6.0`
 * configuration exactly — solid bodies, five-tick contestable handling, the
 * frozen v1 ecology, mutation and bootstrap fixtures — with the model identity
 * changed and `neural.recurrentInitSigma` added. It does NOT build on
 * `0A.7.0`: lifetime plasticity is deliberately off, so the only thing that
 * differs from `0A.6.0` is the recurrent block's initial draw scale.
 *
 * The sigma is computed from the two existing configured values by the locked
 * fan-in rule, never typed in as a literal, and `validateConfig` re-derives and
 * checks it.
 */
export function regulatedRecurrentInitModelConfig(): SimulationConfig {
  const config = foodHandlingModelConfig();
  config.simulationVersion = REGULATED_RECURRENT_INIT_MODEL_VERSION;
  config.neural.recurrentInitSigma = regulatedRecurrentInitSigma(config.neural.initSigma, config.neural.hiddenLayerSize);
  return config;
}

/**
 * The configuration of a supported model by version: 0A.1.0 →
 * `singleFounderModelConfig()`, 0A.2.0 → DEFAULT_SIMULATION_CONFIG, 0A.3.0 →
 * `organismSensingModelConfig()`, 0A.4.0 → `recurrentMemoryModelConfig()`,
 * 0A.5.0 → `physicalBodiesModelConfig()`, 0A.6.0 → `foodHandlingModelConfig()`,
 * 0A.7.0 → `lifetimePlasticityModelConfig()`, 0A.8.0 →
 * `regulatedRecurrentInitModelConfig()`.
 * Always a fresh copy. Throws for any other version.
 */
export function modelConfig(simulationVersion: string): SimulationConfig {
  switch (simulationVersion) {
    case SINGLE_FOUNDER_MODEL_VERSION: return singleFounderModelConfig();
    case MULTI_FOUNDER_MODEL_VERSION: return cloneConfig(DEFAULT_SIMULATION_CONFIG);
    case ORGANISM_SENSING_MODEL_VERSION: return organismSensingModelConfig();
    case RECURRENT_MEMORY_MODEL_VERSION: return recurrentMemoryModelConfig();
    case PHYSICAL_BODIES_MODEL_VERSION: return physicalBodiesModelConfig();
    case FOOD_HANDLING_MODEL_VERSION: return foodHandlingModelConfig();
    case LIFETIME_PLASTICITY_MODEL_VERSION: return lifetimePlasticityModelConfig();
    case REGULATED_RECURRENT_INIT_MODEL_VERSION: return regulatedRecurrentInitModelConfig();
    default: throw new Error(`modelConfig: unknown simulationVersion ${JSON.stringify(simulationVersion)}`);
  }
}

/** Deep-clone the default config so callers can override fields without aliasing. */
export function cloneConfig(config: SimulationConfig): SimulationConfig {
  return JSON.parse(JSON.stringify(config)) as SimulationConfig;
}

/** A fresh copy of the Phase 0A defaults. */
export function defaultConfig(overrides?: Partial<SimulationConfig>): SimulationConfig {
  const base = cloneConfig(DEFAULT_SIMULATION_CONFIG);
  return overrides ? { ...base, ...overrides } : base;
}
