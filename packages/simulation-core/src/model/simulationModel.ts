/**
 * Simulation model registry — the one place that says what each
 * `simulationVersion` means structurally.
 *
 * A model version is a biological identity, not a label: it fixes the sensory
 * contract, and with it the neural input dimension every genome of that model
 * carries. Historical models are frozen ground truth and are never redefined:
 *
 *   0A.1.0  historical single-founder model          6 -> 8 -> 4
 *   0A.2.0  frozen v1 multi-founder model            6 -> 8 -> 4
 *   0A.3.0  V2.1 — other organisms enter the         10 -> 8 -> 4
 *           sensory world (nearest visible organism)
 *
 * Everything that depends on the input dimension — founder drawing and
 * screening, network evaluation, the Sense phase, snapshot validation — asks
 * this registry with the model's `simulationVersion` instead of assuming one
 * global input count. An unknown version is refused, never guessed.
 *
 * The hidden layer size stays configuration (`neural.hiddenLayerSize`) and the
 * four outputs (forward, turn, eat, reproduce) are the same in every model.
 */

/** Historical model: one founder controller, 25 near-clones of it. */
export const SINGLE_FOUNDER_MODEL_VERSION = '0A.1.0';

/** Frozen v1 model: 5 independent founder controllers, 5 organisms each. */
export const MULTI_FOUNDER_MODEL_VERSION = '0A.2.0';

/**
 * V2.1 model: the v1 multi-founder world, plus four appended sensory inputs
 * describing the nearest visible other living organism. No new action, output
 * or interaction.
 */
export const ORGANISM_SENSING_MODEL_VERSION = '0A.3.0';

/** §11.58 six-input vector: food (3), boundary (2), own energy (1). Models 0A.1.0 and 0A.2.0. */
export const V1_NEURAL_INPUT_SIZE = 6;

/** 0A.3.0: the six V1 inputs, unchanged, then organismVisible, organismDistance, organismAngle, organismRelativeSize. */
export const ORGANISM_SENSING_NEURAL_INPUT_SIZE = 10;

export interface SimulationModel {
  readonly simulationVersion: string;
  /** Number of sensory inputs = neural input dimension for every genome of this model. */
  readonly neuralInputSize: number;
  /** True when the Sense phase appends the four nearest-visible-organism inputs (indices 6–9). */
  readonly organismSensing: boolean;
}

const MODELS: readonly SimulationModel[] = Object.freeze([
  Object.freeze({ simulationVersion: SINGLE_FOUNDER_MODEL_VERSION, neuralInputSize: V1_NEURAL_INPUT_SIZE, organismSensing: false }),
  Object.freeze({ simulationVersion: MULTI_FOUNDER_MODEL_VERSION, neuralInputSize: V1_NEURAL_INPUT_SIZE, organismSensing: false }),
  Object.freeze({ simulationVersion: ORGANISM_SENSING_MODEL_VERSION, neuralInputSize: ORGANISM_SENSING_NEURAL_INPUT_SIZE, organismSensing: true }),
]);

/** Every simulation version this core can bootstrap, step and validate, oldest first. */
export const SUPPORTED_MODEL_VERSIONS: readonly string[] = Object.freeze(MODELS.map((m) => m.simulationVersion));

export function isSupportedSimulationVersion(version: unknown): version is string {
  return typeof version === 'string' && SUPPORTED_MODEL_VERSIONS.includes(version);
}

/** The structural definition of a model. Throws for an unknown version — never falls back to a default. */
export function simulationModel(version: string): SimulationModel {
  for (const m of MODELS) if (m.simulationVersion === version) return m;
  throw new Error(
    `unknown simulationVersion ${JSON.stringify(version)}; supported models: ${SUPPORTED_MODEL_VERSIONS.join(', ')}`
  );
}

/** Neural input dimension of a model (6 for 0A.1.0 / 0A.2.0, 10 for 0A.3.0). */
export function neuralInputSizeFor(version: string): number {
  return simulationModel(version).neuralInputSize;
}
