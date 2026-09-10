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
   * OFF means exact stored-value inheritance and zero RNG draws for that
   * channel (§13.7).
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

export interface SimulationConfig {
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
}

/**
 * Structural configuration validation. This checks invariants the
 * specification states as [LOCKED] relationships between configured values —
 * it does NOT assert that any baseline value is scientifically correct.
 */
export function validateConfig(config: SimulationConfig): void {
  const problems: string[] = [];

  if (config.energy.reproductionCost <= config.energy.birthEnergy) {
    problems.push(
      `energy.reproductionCost (${config.energy.reproductionCost}) must be strictly greater than ` +
        `energy.birthEnergy (${config.energy.birthEnergy}) — reproduction must not create net ecosystem energy (§12.41).`
    );
  }
  if (config.lifecycle.maxAge <= config.lifecycle.maturityAge) {
    problems.push(
      `lifecycle.maxAge (${config.lifecycle.maxAge}) must exceed lifecycle.maturityAge (${config.lifecycle.maturityAge}), ` +
        'or no organism can ever reach reproductive age.'
    );
  }
  if (config.food.worldFoodCapacity < config.food.initialFoodCount) {
    problems.push(
      `food.worldFoodCapacity (${config.food.worldFoodCapacity}) must be >= food.initialFoodCount (${config.food.initialFoodCount}).`
    );
  }
  if (config.mutation.morphologyMutationRate < 0 || config.mutation.morphologyMutationRate > 1) {
    problems.push('mutation.morphologyMutationRate must be in [0, 1].');
  }
  if (config.mutation.neuralMutationRate < 0 || config.mutation.neuralMutationRate > 1) {
    problems.push('mutation.neuralMutationRate must be in [0, 1].');
  }
  if (config.fertility.minFertility < 0 || config.fertility.minFertility > 1) {
    problems.push('fertility.minFertility must be in [0, 1].');
  }
  if (config.fertility.gridResolution < 1) {
    problems.push('fertility.gridResolution must be >= 1.');
  }
  if (config.energy.reproductionEnergyThreshold > config.energy.energyCapacity) {
    problems.push(
      `energy.reproductionEnergyThreshold (${config.energy.reproductionEnergyThreshold}) exceeds ` +
        `energy.energyCapacity (${config.energy.energyCapacity}) — reproduction would be unreachable.`
    );
  }

  if (problems.length > 0) {
    throw new Error('Invalid SimulationConfig:\n  - ' + problems.join('\n  - '));
  }
}
