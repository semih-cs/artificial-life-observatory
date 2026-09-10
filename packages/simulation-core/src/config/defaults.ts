import { SimulationConfig } from './types.js';

/**
 * Model identities (§13.76 and its amendment).
 *
 * The bootstrap rule is the only difference between them, and it changes the
 * canonical trajectory, so the two are different models and must never share a
 * regression reference or be mixed in one analysis.
 */

/** Historical model: one founder controller, 25 near-clones of it. */
export const SINGLE_FOUNDER_MODEL_VERSION = '0A.1.0';

/** Amended model: 5 independent founder controllers, 5 organisms each. */
export const MULTI_FOUNDER_MODEL_VERSION = '0A.2.0';

/**
 * The historical single-founder model's deterministic regression reference:
 * seed 20260910, 10,000 ticks. It belongs to SINGLE_FOUNDER_MODEL_VERSION and
 * is NOT a regression target for the amended model, which by design produces a
 * different trajectory. It remains documented and testable via
 * `singleFounderModelConfig()`.
 */
export const SINGLE_FOUNDER_GOLDEN_HASH = '6a6576bd49e86b27';

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

/** Deep-clone the default config so callers can override fields without aliasing. */
export function cloneConfig(config: SimulationConfig): SimulationConfig {
  return JSON.parse(JSON.stringify(config)) as SimulationConfig;
}

/** A fresh copy of the Phase 0A defaults. */
export function defaultConfig(overrides?: Partial<SimulationConfig>): SimulationConfig {
  const base = cloneConfig(DEFAULT_SIMULATION_CONFIG);
  return overrides ? { ...base, ...overrides } : base;
}
