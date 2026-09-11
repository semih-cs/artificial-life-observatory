import { SimulationConfig, validateConfig } from '../config/types.js';
import { createRngStreams, RngStream, RngStreams, exportRngStreamsState } from '../rng/rngStream.js';
import { generateFounderProfile, FounderProfile } from '../genome/founder.js';
import { perturbMorphologyForBootstrap, perturbNeuralForBootstrap } from '../biology/mutation.js';
import { Genome } from '../genome/types.js';
import { OrganismRuntimeState, zeroHiddenState } from '../organism/types.js';
import { WorldState, FoodItem, WorldConfigSnapshot } from './types.js';
import { generateFertilityField, fertilityAt, FertilityField } from './fertility.js';
import { simulationModel } from '../model/simulationModel.js';

interface Point {
  x: number;
  y: number;
}

/**
 * Deterministic minimum-separation placement (§13.76 placeWithMinSeparation):
 * accept the first candidate at/above minSep from every already-placed point;
 * if none within the fixed attempt budget qualifies, deterministically fall
 * back to the best-so-far candidate. Never skips an organism, never falls back
 * to an undocumented default.
 */
function placeWithMinSeparation(alreadyPlaced: readonly Point[], rng: RngStream, config: SimulationConfig): Point {
  const minSep = config.bootstrap.boundaryMinSeparationFraction * Math.min(config.world.width, config.world.height);
  let best: Point | null = null;
  let bestMinDist = -1;

  for (let attempt = 0; attempt < config.bootstrap.maxPlacementAttempts; attempt++) {
    const candidate = rng.uniformPointInWorld(config.world.width, config.world.height);
    let d = Infinity;
    for (const p of alreadyPlaced) {
      const dist = Math.hypot(candidate.x - p.x, candidate.y - p.y);
      if (dist < d) d = dist;
    }
    if (d >= minSep) return candidate;
    if (d > bestMinDist) {
      best = candidate;
      bestMinDist = d;
    }
  }
  return best ?? rng.uniformPointInWorld(config.world.width, config.world.height);
}

/**
 * Fertility-weighted initial food placement. Rejection sampling with a fixed
 * per-item attempt budget so draw count stays a deterministic function of RNG
 * state; on budget exhaustion the last candidate is used, so the requested
 * count is always produced.
 */
function placeFoodByFertility(
  rng: RngStream,
  field: FertilityField,
  world: WorldConfigSnapshot,
  attempts: number
): Point {
  let last: Point = { x: 0, y: 0 };
  for (let i = 0; i < attempts; i++) {
    const x = rng.nextInRange(0, world.width);
    const y = rng.nextInRange(0, world.height);
    const p = rng.nextFloat();
    last = { x, y };
    if (p <= fertilityAt(field, x, y, world)) return last;
  }
  return last;
}

/** [BASELINE] rejection-sampling attempt budget for fertility-weighted placement. */
export const FERTILITY_PLACEMENT_ATTEMPTS = 8;

/**
 * Generate the independent founder profiles for a world (§13.76 as amended).
 *
 * `bootstrap.founderGroupCount` genomes are drawn IN ORDER from BootstrapRNG.
 * Each one is generated independently and accepted by the same unchanged
 * validity + viability gate, first passing candidate wins (§13.76 step 4).
 *
 * There is deliberately no ranking, no scoring, no best-of-N, no trajectory
 * evaluation and no comparison between accepted founders: founder k is accepted
 * without ever being measured against founder j. The only thing the group count
 * changes is how many independent draws are made and how the initial population
 * is divided among them.
 *
 * Exported so tests can reproduce the founder set from a fresh BootstrapRNG —
 * founder generation is the first thing that consumes that stream.
 */
export function generateFounderProfiles(rng: RngStream, config: SimulationConfig): FounderProfile[] {
  // The model fixes the founder controller's layout: 6 inputs for 0A.1.0 /
  // 0A.2.0 (unchanged draws), 10 for 0A.3.0 and 0A.4.0 (drawn natively at
  // full size), plus the appended recurrent block for 0A.4.0.
  const model = simulationModel(config.simulationVersion);
  const founders: FounderProfile[] = [];
  for (let group = 0; group < effectiveFounderGroupCount(config); group++) {
    founders.push(
      generateFounderProfile(rng, config.neural.hiddenLayerSize, config.neural, config.bootstrap, model.neuralInputSize, model.recurrent)
    );
  }
  return founders;
}

/**
 * How many founder groups this world actually has: the configured count, capped
 * at the population size so there is never a founder without an organism.
 */
export function effectiveFounderGroupCount(config: SimulationConfig): number {
  return Math.min(config.bootstrap.founderGroupCount, config.population.initialPopulationSize);
}

/**
 * Which founder group organism `index` belongs to.
 *
 * Groups are contiguous and as evenly sized as the population allows: with
 * N organisms and G groups every group holds floor(N / G), and the first
 * N mod G groups hold one extra. At the default 25 and 5 the split is exact —
 * five organisms per founder, no founder over- or under-represented.
 */
export function founderGroupOfIndex(index: number, populationSize: number, groupCount: number): number {
  const base = Math.floor(populationSize / groupCount);
  const remainder = populationSize % groupCount;
  const largeGroupOrganisms = remainder * (base + 1);
  if (index < largeGroupOrganisms) return Math.floor(index / (base + 1));
  return remainder + Math.floor((index - largeGroupOrganisms) / base);
}

/**
 * Deterministic bootstrap world initialization (§13.76, as amended for
 * multi-founder initialization).
 *
 * Every draw comes from BootstrapRNG in this fixed, documented order:
 *   1. Founder neural genome candidate draws, groups 0..G-1 in order
 *      (§13.76 steps 1-4, once per founder group)
 *   2. Bootstrap population, organisms i = 0..N-1 in index order; per organism:
 *      morphology perturbations (fixed gene order), neural perturbations
 *      (fixed block order), position, heading
 *   3. Static fertility field lattice
 *   4. Initial food placement
 *
 * Founder groups occupy contiguous index ranges and are as evenly sized as the
 * population allows (see `founderGroupOfIndex`). At the default 25 organisms
 * and 5 groups every group holds exactly 5.
 *
 * With founderGroupCount = 1 this is byte-identical to the historical
 * single-founder model: one founder is drawn and every organism is perturbed
 * from it, in the same draw order.
 *
 * CanonicalRNG is untouched until the first tick (§13.35, §18.70).
 */
export function bootstrapWorld(config: SimulationConfig): WorldState {
  validateConfig(config);

  const streams: RngStreams = createRngStreams(config.rootSeed);
  const boot = streams.bootstrap;
  const worldConfig: WorldConfigSnapshot = { width: config.world.width, height: config.world.height };

  // 1. Founder profiles — one independent draw per founder group
  const founders = generateFounderProfiles(boot, config);
  const groupCount = founders.length;

  // 2. Bootstrap population
  const recurrent = simulationModel(config.simulationVersion).recurrent;
  const organisms: OrganismRuntimeState[] = [];
  const placed: Point[] = [];
  let nextOrganismId = 1;

  for (let i = 0; i < config.population.initialPopulationSize; i++) {
    const id = nextOrganismId++;

    const founder = founders[founderGroupOfIndex(i, config.population.initialPopulationSize, groupCount)]!;

    const morphology = perturbMorphologyForBootstrap(
      founder.genome.morphology,
      boot,
      config.bootstrap.morphBootstrapSigma,
      config.bootstrap.geneBounds
    );
    const neural = perturbNeuralForBootstrap(
      founder.genome.neural,
      boot,
      config.neural.neuralBootstrapSigma,
      config.neural.neuralParamBounds
    );
    const genome: Genome = { morphology, neural };

    const position = placeWithMinSeparation(placed, boot, config);
    placed.push(position);

    const heading = boot.nextInRange(0, 2 * Math.PI);

    const organism: OrganismRuntimeState = {
      id,
      genome,
      parentId: null, // founder/bootstrap organism (§9.44-§9.45)
      generationDepth: 0, // §13.40
      lineageRootId: id, // §13.42 — each bootstrap organism roots its own lineage
      birthTick: 0,
      x: position.x,
      y: position.y,
      heading,
      energy: config.energy.configuredInitialEnergy, // §13.39 global, not randomized
      age: 0,
      alive: true,
      deathCause: null,
      deathTick: null,
    };
    // Recurrent model: runtime memory starts empty (all zeros). No RNG draw.
    if (recurrent) organism.hiddenState = zeroHiddenState(config.neural.hiddenLayerSize);
    organisms.push(organism);
  }

  // 3. Static seeded fertility field
  const fertility = generateFertilityField(boot, config.fertility);

  // 4. Initial food, fertility-weighted
  const food: FoodItem[] = [];
  let nextFoodId = 1;
  const initialCount = Math.min(config.food.initialFoodCount, config.food.worldFoodCapacity);
  for (let i = 0; i < initialCount; i++) {
    const p = placeFoodByFertility(boot, fertility, worldConfig, FERTILITY_PLACEMENT_ATTEMPTS);
    food.push({ id: nextFoodId++, x: p.x, y: p.y });
  }

  return {
    tick: 0,
    simulationVersion: config.simulationVersion,
    worldConfig,
    fertility,
    organisms,
    food,
    nextOrganismId,
    nextFoodId,
    rng: exportRngStreamsState(streams),
  };
}
