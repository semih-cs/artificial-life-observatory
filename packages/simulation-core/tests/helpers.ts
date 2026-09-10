import { Genome, MorphologyGenome, NeuralGenome, NEURAL_INPUT_SIZE, NEURAL_OUTPUT_SIZE } from '../src/genome/types.js';
import { OrganismRuntimeState } from '../src/organism/types.js';
import { WorldState, FoodItem, WorldConfigSnapshot } from '../src/world/types.js';
import { SimulationConfig } from '../src/config/types.js';
import { DEFAULT_SIMULATION_CONFIG, cloneConfig } from '../src/config/defaults.js';
import { createRngStreams, exportRngStreamsState } from '../src/rng/rngStream.js';
import { FertilityField } from '../src/world/fertility.js';

export const TEST_HIDDEN_SIZE = 4;

export function testConfig(mutate?: (c: SimulationConfig) => void): SimulationConfig {
  const c = cloneConfig(DEFAULT_SIMULATION_CONFIG);
  c.neural.hiddenLayerSize = TEST_HIDDEN_SIZE;
  if (mutate) mutate(c);
  return c;
}

export function defaultMorphology(overrides: Partial<MorphologyGenome> = {}): MorphologyGenome {
  return {
    size: 1,
    maxSpeed: 1,
    visionRange: 100,
    visionAngle: Math.PI / 2,
    metabolism: 1,
    ...overrides,
  };
}

function logit(p: number): number {
  return Math.log(p / (1 - p));
}

/**
 * A controller whose outputs are CONSTANT regardless of input: all
 * input->hidden weights and hidden biases are zero, so hidden = tanh(0) = 0
 * and every output collapses to its own bias term. Lets a test dictate an
 * exact ActionIntent without hand-solving a network.
 */
export function constantNeuralGenome(
  targets: { forward?: number; turn?: number; eat?: number; reproduce?: number },
  hiddenSize = TEST_HIDDEN_SIZE
): NeuralGenome {
  // Defaults are deliberately "action off": a test that wants eating or
  // reproduction must ask for it, so no test accidentally depends on a
  // default output sitting exactly on a threshold.
  const forward = targets.forward ?? 0.5;
  const turn = targets.turn ?? 0;
  const eat = targets.eat ?? 0.001;
  const reproduce = targets.reproduce ?? 0.001;
  return {
    inputHiddenWeights: new Array(hiddenSize * NEURAL_INPUT_SIZE).fill(0),
    hiddenBiases: new Array(hiddenSize).fill(0),
    hiddenOutputWeights: new Array(NEURAL_OUTPUT_SIZE * hiddenSize).fill(0),
    // output order is [forward, turn, eat, reproduce]; forward/eat/reproduce
    // are sigmoid, turn is tanh.
    outputBiases: [logit(forward), Math.atanh(turn), logit(eat), logit(reproduce)],
  };
}

export function constantGenome(
  targets: { forward?: number; turn?: number; eat?: number; reproduce?: number },
  morphology: Partial<MorphologyGenome> = {},
  hiddenSize = TEST_HIDDEN_SIZE
): Genome {
  return { morphology: defaultMorphology(morphology), neural: constantNeuralGenome(targets, hiddenSize) };
}

export function makeOrganism(partial: Partial<OrganismRuntimeState> & { id: number; genome: Genome }): OrganismRuntimeState {
  return {
    parentId: null,
    generationDepth: 0,
    lineageRootId: partial.id,
    birthTick: 0,
    x: 0,
    y: 0,
    heading: 0,
    energy: 50,
    age: 0,
    alive: true,
    deathCause: null,
    deathTick: null,
    ...partial,
  };
}

/** A perfectly uniform fertility field — used where a test wants food spawning to be unbiased. */
export function uniformFertility(value = 1, resolution = 2): FertilityField {
  const n = resolution + 1;
  return { resolution, lattice: new Array(n * n).fill(value) };
}

/**
 * Build a WorldState by hand (no bootstrap) so a test can control the exact
 * organisms, food, and RNG state under examination.
 */
export function makeWorld(opts: {
  config: SimulationConfig;
  organisms: OrganismRuntimeState[];
  food?: FoodItem[];
  tick?: number;
  fertility?: FertilityField;
  seed?: number;
}): WorldState {
  const worldConfig: WorldConfigSnapshot = { width: opts.config.world.width, height: opts.config.world.height };
  const streams = createRngStreams(opts.seed ?? opts.config.rootSeed);
  const organisms = opts.organisms;
  const food = opts.food ?? [];
  return {
    tick: opts.tick ?? 0,
    simulationVersion: opts.config.simulationVersion,
    worldConfig,
    fertility: opts.fertility ?? uniformFertility(1),
    organisms,
    food,
    nextOrganismId: Math.max(0, ...organisms.map((o) => o.id)) + 1,
    nextFoodId: Math.max(0, ...food.map((f) => f.id)) + 1,
    rng: exportRngStreamsState(streams),
  };
}

export function findOrganism(world: WorldState, id: number): OrganismRuntimeState | undefined {
  return world.organisms.find((o) => o.id === id);
}
