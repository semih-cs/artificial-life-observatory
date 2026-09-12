import { isSupportedSimulationVersion, simulationModel, SUPPORTED_MODEL_VERSIONS } from '../model/simulationModel.js';

/**
 * Phase 0A configuration surface.
 *
 * Classification (spec §5):
 *   [LOCKED]           simulation/research semantic invariant — not a config knob
 *   [BASELINE]         replaceable implementation/default choice
 *   [OPEN — EMPIRICAL] value to calibrate in Phase 0B
 *
 * Every numeric value below is configuration. No biological parameter is a
 * hidden constant anywhere else in the package (§24.41).
 */

export interface WorldConfig {
  /** World is a bounded rectangle; boundaries are hard walls (organisms cannot cross). */
  width: number;
  height: number;
}

export interface PhaseZeroAPopulationConfig {
  /** [BASELINE] N ~ 25, per spec §14.4 / §21.3. */
  initialPopulationSize: number;
}

export interface NeuralConfig {
  /** [BASELINE] ~8 hidden neurons (§11.18). */
  hiddenLayerSize: number;
  /** [BASELINE] founder weight/bias draw sigma (§13.76 step 1). */
  initSigma: number;
  /** [BASELINE] weights/biases in [-2, +2] (§11.30). Out-of-range values are clamped, not rejected. */
  neuralParamBounds: { min: number; max: number };
  /** [OPEN — EMPIRICAL] bootstrap perturbation sigma for neural params (§13.76). */
  neuralBootstrapSigma: number;
  /** [BASELINE] fixed non-phenotype turn-rate scale, radians/tick at output = +-1 (§11.59). */
  maxTurnRate: number;
  /**
   * [OPEN — EMPIRICAL] action threshold magnitudes. The comparator (>=) is
   * [LOCKED] per §11.59; only the magnitude is unresolved.
   */
  eatThreshold: number;
  reproductionActionThreshold: number;
}

export interface MorphologyGeneBounds {
  size: { min: number; max: number };
  maxSpeed: { min: number; max: number };
  visionRange: { min: number; max: number };
  /** radians */
  visionAngle: { min: number; max: number };
  metabolism: { min: number; max: number };
}

export interface BootstrapConfig {
  /** [OPEN — EMPIRICAL] per-gene bootstrap perturbation sigma (§13.76). */
  morphBootstrapSigma: {
    size: number;
    maxSpeed: number;
    visionRange: number;
    visionAngle: number;
    metabolism: number;
  };
  /** [BASELINE] initial engineering gene ranges (§10.4). */
  geneBounds: MorphologyGeneBounds;
  /** [BASELINE] founder candidate retry budget (§13.76 step 4). */
  maxFounderAttempts: number;
  /**
   * Number of INDEPENDENT founder neural genomes generated at bootstrap
   * (§13.76 as amended — see docs/Phase 0A Amendment - Multi-Founder
   * Initialization.md).
   *
   * The initial population is divided evenly into this many founder-controller
   * groups. Each founder genome is drawn independently from BootstrapRNG and
   * accepted by the SAME unchanged validity + viability gate, first passing
   * candidate wins. Founders are never ranked, scored, compared or selected
   * among.
   *
   * 1 reproduces the historical single-founder model exactly. Must be an
   * integer >= 1. It is capped at initialPopulationSize (never more founders
   * than organisms), and when the division is not exact the remainder is spread
   * deterministically over the earliest groups. At the default 25 organisms and
   * 5 groups the division is exact: five organisms per founder.
   */
  founderGroupCount: number;
  /** [BASELINE] suggested fraction of min(worldWidth, worldHeight) (§13.76). */
  boundaryMinSeparationFraction: number;
  /** [BASELINE] placement retry budget (§13.76 placeWithMinSeparation). */
  maxPlacementAttempts: number;
  /**
   * [BASELINE] founder viability probe fixture values (§13.76 step 3). The
   * five checks themselves are [LOCKED]; only these fixtures are baseline.
   */
  founderProbe: {
    /** signed normalized foodAngle used by the left/right steering probes, in (0, 1]. */
    lateralFoodAngle: number;
    /** minimum forward output that counts as "movement is mechanically possible". */
    minForwardOutput: number;
    /**
     * maximum |turn| tolerated on the food-directly-ahead probes. A controller
     * that turns harder than this while food is dead ahead is steering away
     * from the target and fails check (c).
     */
    alignedTurnTolerance: number;
    /** normalizedEnergy fixture for the reproduce-diagnostic probe (a fixture, not the real threshold). */
    reproduceProbeEnergy: number;
  };
}

export interface LifecycleConfig {
  /** [BASELINE] maturityAge ~ 500 ticks (§8.23, §12.36). Reproduction requires age >= maturityAge. */
  maturityAge: number;
  /** [BASELINE] maxAge ~ 3000 ticks (§8.24, §12.30). Death when age >= maxAge. */
  maxAge: number;
}

export interface EnergyConfig {
  /** [BASELINE] global energy capacity ~ 100 (§12.2, §12.4). */
  energyCapacity: number;
  /** [BASELINE] bootstrap/founder starting energy ~ 50 (§12.3). NOT the same as birthEnergy. */
  configuredInitialEnergy: number;
  /** [BASELINE] basalCost = metabolism * baseMetabolicConstant (§12.6). */
  baseMetabolicConstant: number;
  /** [BASELINE] movementCost = movementEnergyCoefficient * size * actualVelocity^2 (§12.7-§12.9). */
  movementEnergyCoefficient: number;
  /** [BASELINE] foodEnergy ~ 20-30, i.e. 20-30% of capacity (§12.13, §12.11). */
  foodEnergyValue: number;
  /** [BASELINE] ~70-80% of capacity (§12.37). */
  reproductionEnergyThreshold: number;
  /** [BASELINE] ~40-50% of capacity (§12.40). Deducted from the parent on a successful birth. */
  reproductionCost: number;
  /**
   * [BASELINE] energy a newborn receives (§12.41).
   * [LOCKED] invariant: reproductionCost > birthEnergy — reproduction must not
   * create net ecosystem energy (§12.41, §12.42). Enforced by validateConfig().
   */
  birthEnergy: number;
}

export interface FertilityConfig {
  /**
   * [BASELINE] lattice resolution of the static seeded fertility field. The
   * field is a (gridResolution+1)^2 lattice of values bilinearly interpolated
   * across the world. Deliberately coarse — this is spatial heterogeneity
   * (§12.22), not procedural terrain generation.
   */
  gridResolution: number;
  /** [BASELINE] floor applied to every fertility value so no region is permanently barren. */
  minFertility: number;
}

export interface FoodConfig {
  /** [OPEN — EMPIRICAL] initial resource state (§12.20). */
  initialFoodCount: number;
  /** [BASELINE] hard cap on simultaneously existing food items (§12.19). Never exceeded. */
  worldFoodCapacity: number;
  /**
   * [OPEN — EMPIRICAL] spawn attempts per tick (§12.21). Each attempt consumes
   * exactly three canonical draws regardless of outcome, so RNG consumption
   * per tick is a fixed function of this value alone.
   */
  regenAttemptsPerTick: number;
  /** [BASELINE] eating radius (§12.15) — global, not size-dependent, in Phase 0A. */
  feedingRange: number;
  /** [BASELINE] minimum food-to-food spawn distance (§12.25); 0 disables the check. */
  minFoodSpawnDistance: number;
}

export interface MutationConfig {
  /**
   * [LOCKED] independent channels (§13.6, §11.31, §15.7). These are two
   * separate flags, never one combined switch: the Phase 0B 2x2 factorial
   * (§14.15-§14.20) depends on all four combinations being reachable.
   * OFF means exact stored-value inheritance (§13.7). A disabled channel
   * still consumes the same RNG draws it would consume if enabled, so that
   * toggling one channel does not perturb the other channel's draw
   * positions on the shared CanonicalRNG stream (§15.7 RNG isolation).
   */
  morphologyMutationEnabled: boolean;
  neuralMutationEnabled: boolean;
  /** [BASELINE] ~10% per gene per offspring (§10.30, §13.8). */
  morphologyMutationRate: number;
  /** [BASELINE] ~5% per parameter per offspring (§11.29, §13.10). */
  neuralMutationRate: number;
  /** [BASELINE] sigma ~ 0.05 * geneRange (§10.31, §13.9). */
  morphologyMutationSigma: {
    size: number;
    maxSpeed: number;
    visionRange: number;
    visionAngle: number;
    metabolism: number;
  };
  /** [BASELINE] sigma_w ~ 0.05 (§11.29). */
  neuralMutationSigma: number;
}

export interface ReproductionConfig {
  /** [OPEN — EMPIRICAL] maximum polar offset of a newborn from its parent (§20.72, §12.46). */
  maxOffspringOffset: number;
}

/**
 * V2.3 physical bodies (model 0A.5.0 only). Every number here is
 * configuration — no biological constant of this slice lives anywhere else
 * (§24.41).
 *
 * The authoritative physical radius of an organism is
 *
 *     radius = radiusBase + radiusPerSize * morphology.size
 *
 * a pure function of the INHERITED morphology size and these constants: no
 * runtime adaptation, no randomness, no lineage, energy or age term. The
 * defaults reproduce the body radius the Observatory has drawn since Phase 0D
 * slice 1 (`2.0 + 2.2 * size`), so what is seen is what collides.
 *
 * This section is present on a model with physical bodies and ABSENT on every
 * other model, exactly as recurrent weights are. That keeps the configuration
 * — and therefore the `configHash` — of 0A.1.0-0A.4.0 byte-identical to what
 * it was before V2.3.
 */
export interface PhysicalBodyConfig {
  /** [BASELINE] world units of body radius at morphology size 0. */
  radiusBase: number;
  /** [BASELINE] additional world units of body radius per unit of morphology size. Must be > 0: larger size means a larger body. */
  radiusPerSize: number;
  /**
   * [BASELINE] the FIXED number of deterministic separation passes the
   * overlap resolver performs per resolution. Not a convergence tolerance and
   * not a time budget: the count is part of the model's definition, so the
   * result of a dense configuration is reproducible rather than "however far
   * it got". A pass that finds no overlapping pair ends the resolution early.
   */
  separationPasses: number;
}

export interface SimulationConfig {
  /**
   * The model identity (see `model/simulationModel.ts`): 0A.1.0, 0A.2.0 or
   * 0A.3.0. It selects the sensory contract and neural input dimension.
   */
  simulationVersion: string;
  rootSeed: number;
  world: WorldConfig;
  population: PhaseZeroAPopulationConfig;
  neural: NeuralConfig;
  bootstrap: BootstrapConfig;
  lifecycle: LifecycleConfig;
  energy: EnergyConfig;
  fertility: FertilityConfig;
  food: FoodConfig;
  mutation: MutationConfig;
  reproduction: ReproductionConfig;
  /**
   * Present if and only if the model has physical bodies (0A.5.0). Its
   * absence on 0A.1.0-0A.4.0 is what keeps their configurations, and their
   * configHashes, exactly as they were.
   */
  body?: PhysicalBodyConfig;
}

/**
 * Structural configuration validation. This checks invariants the
 * specification states as [LOCKED] relationships between configured values —
 * it does NOT assert that any baseline value is scientifically correct.
 */
export function validateConfig(config: SimulationConfig): void {
  const problems: string[] = [];

  if (!Number.isFinite(config.energy.reproductionEnergyThreshold) || config.energy.reproductionEnergyThreshold < 0) {
    problems.push(
      `energy.reproductionEnergyThreshold (${config.energy.reproductionEnergyThreshold}) must be a non-negative finite number.`
    );
  }
  if (
    !Number.isFinite(config.energy.reproductionCost) ||
    !Number.isFinite(config.energy.birthEnergy) ||
    config.energy.reproductionCost <= config.energy.birthEnergy
  ) {
    problems.push(
      `energy.reproductionCost (${config.energy.reproductionCost}) must be strictly greater than ` +
        `energy.birthEnergy (${config.energy.birthEnergy}) — reproduction must not create net ecosystem energy (§12.41).`
    );
  }
  if (
    !Number.isFinite(config.lifecycle.maxAge) ||
    !Number.isFinite(config.lifecycle.maturityAge) ||
    config.lifecycle.maxAge <= config.lifecycle.maturityAge
  ) {
    problems.push(
      `lifecycle.maxAge (${config.lifecycle.maxAge}) must exceed lifecycle.maturityAge (${config.lifecycle.maturityAge}), ` +
        'or no organism can ever reach reproductive age.'
    );
  }
  if (
    !Number.isFinite(config.food.worldFoodCapacity) ||
    !Number.isFinite(config.food.initialFoodCount) ||
    config.food.worldFoodCapacity < config.food.initialFoodCount
  ) {
    problems.push(
      `food.worldFoodCapacity (${config.food.worldFoodCapacity}) must be >= food.initialFoodCount (${config.food.initialFoodCount}).`
    );
  }
  if (!Number.isFinite(config.mutation.morphologyMutationRate) || config.mutation.morphologyMutationRate < 0 || config.mutation.morphologyMutationRate > 1) {
    problems.push('mutation.morphologyMutationRate must be in [0, 1].');
  }
  if (!Number.isFinite(config.mutation.neuralMutationRate) || config.mutation.neuralMutationRate < 0 || config.mutation.neuralMutationRate > 1) {
    problems.push('mutation.neuralMutationRate must be in [0, 1].');
  }
  if (!Number.isFinite(config.fertility.minFertility) || config.fertility.minFertility < 0 || config.fertility.minFertility > 1) {
    problems.push('fertility.minFertility must be in [0, 1].');
  }
  if (!Number.isFinite(config.fertility.gridResolution) || config.fertility.gridResolution < 1) {
    problems.push('fertility.gridResolution must be >= 1.');
  }
  if (
    !Number.isInteger(config.bootstrap.founderGroupCount) ||
    config.bootstrap.founderGroupCount < 1
  ) {
    problems.push(
      `bootstrap.founderGroupCount (${config.bootstrap.founderGroupCount}) must be an integer >= 1.`
    );
  }

  if (!isSupportedSimulationVersion(config.simulationVersion)) {
    problems.push(
      `simulationVersion (${JSON.stringify(config.simulationVersion)}) is not a supported model ` +
        `(${SUPPORTED_MODEL_VERSIONS.join(', ')}); a model version is never guessed.`
    );
  } else {
    // One model, one body contract: a physical-body model must carry `body`
    // and every other model must not, so a historical configuration can never
    // acquire physics and a 0A.5.0 configuration can never lose it.
    const physical = simulationModel(config.simulationVersion).physicalBodies;
    const body = config.body;
    if (physical && body === undefined) {
      problems.push(`model ${config.simulationVersion} has physical bodies and requires a body configuration.`);
    } else if (!physical && body !== undefined) {
      problems.push(
        `model ${config.simulationVersion} has no physical bodies, so it must not carry a body configuration ` +
          '(historical models are never made solid).'
      );
    } else if (physical && body !== undefined) {
      if (!Number.isFinite(body.radiusBase) || body.radiusBase < 0) {
        problems.push(`body.radiusBase (${body.radiusBase}) must be a non-negative finite number.`);
      }
      if (!Number.isFinite(body.radiusPerSize) || body.radiusPerSize <= 0) {
        problems.push(
          `body.radiusPerSize (${body.radiusPerSize}) must be a positive finite number — larger size must mean a larger body.`
        );
      }
      if (!Number.isInteger(body.separationPasses) || body.separationPasses < 1) {
        problems.push(`body.separationPasses (${body.separationPasses}) must be an integer >= 1.`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error('Invalid SimulationConfig:\n  - ' + problems.join('\n  - '));
  }
}
