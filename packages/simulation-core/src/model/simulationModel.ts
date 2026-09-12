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
 *   0A.4.0  V2.2 — recurrent memory: the 0A.3.0      10 -> 8 (recurrent) -> 4
 *           inputs and outputs, Elman hidden state
 *   0A.5.0  V2.3 — physical bodies: the 0A.4.0       10 -> 8 (recurrent) -> 4
 *           controller exactly, plus solid organism
 *           bodies that displace one another
 *   0A.8.0  V2.6 — regulated recurrent initialization:   10 -> 8 (recurrent) -> 4
 *           0A.6.0 exactly, except that the recurrent
 *           block is drawn from initSigma/sqrt(hidden)
 *   0A.6.0  V2.4 — contestable food handling: the      10 -> 8 (recurrent) -> 4
 *           0A.5.0 world, plus food that takes
 *           several consecutive ticks to eat, travels
 *           with its handler, and can be dislodged by
 *           physical contact
 *
 * Everything that depends on the input dimension — founder drawing and
 * screening, network evaluation, the Sense phase, snapshot validation — asks
 * this registry with the model's `simulationVersion` instead of assuming one
 * global input count. An unknown version is refused, never guessed.
 *
 * The hidden layer size stays configuration (`neural.hiddenLayerSize`) and the
 * four outputs (forward, turn, eat, reproduce) are the same in every model.
 *
 * `recurrent` separates the feed-forward models (0A.1.0-0A.3.0: no recurrent
 * weights, no runtime hidden state, snapshot format v1) from the recurrent
 * models 0A.4.0, 0A.5.0 and 0A.6.0 (recurrent weights in the genome, a runtime
 * hidden state per organism, snapshot format v2 or later).
 *
 * `physicalBodies` separates the models whose organisms pass through one
 * another (0A.1.0-0A.4.0) from 0A.5.0 and 0A.6.0, whose organisms occupy space
 * and are displaced when they overlap. It adds NO neural input, output, action
 * or persistent state: only positions change, in the Resolve phase. Historical
 * models are never made solid.
 *
 * `foodHandling` separates the models that eat instantaneously
 * (0A.1.0-0A.5.0) from 0A.6.0, where eating is a multi-tick process: a food
 * item is held, travels with its handler, and is consumed only after
 * `handling.ticksRequired` consecutive handling ticks. It adds NO neural
 * input, output or action — the existing `eat` output drives it — but it DOES
 * add future-affecting per-food state (`holderId`, `handlingProgress`), which
 * is why 0A.6.0 has its own snapshot format v3. Historical models never gain
 * handling state.
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

/**
 * V2.2 model: the 0A.3.0 model with a recurrent (Elman) hidden layer —
 * h_t = tanh(W_in x_t + W_rec h_(t-1) + b). Same ten inputs, same four
 * outputs, same hidden width. The recurrent weights are genome; the hidden
 * state is runtime memory (starts at zero, never inherited). Memory only: no
 * learning of any kind during life.
 */
export const RECURRENT_MEMORY_MODEL_VERSION = '0A.4.0';

/**
 * V2.3 model: the 0A.4.0 model — the same ten inputs, the same Elman recurrent
 * hidden layer, the same four outputs, the same 188 neural parameters — plus
 * PHYSICAL BODIES. Each organism occupies a circle whose radius is a fixed
 * function of its inherited morphology `size`; two living organisms whose
 * circles overlap are pushed apart in the Resolve phase, the larger one moving
 * less. No damage, no attack, no predation, no energy transfer, no new
 * sensory channel and no new persistent state: only positions change.
 */
export const PHYSICAL_BODIES_MODEL_VERSION = '0A.5.0';

/**
 * V2.4 model: the 0A.5.0 world — the same ten inputs, the same Elman recurrent
 * hidden layer, the same four outputs, the same 188 neural parameters, the
 * same solid bodies — plus CONTESTABLE FOOD HANDLING. Eating is no longer
 * instantaneous: an organism must handle a food item for several consecutive
 * ticks before receiving its energy, the item travels with the handler
 * meanwhile, and genuine organism-organism body contact dislodges it. No new
 * output, action, steal, defend, attack, carry or share rule exists; the
 * existing `eat` output acquires, continues and releases.
 */
export const FOOD_HANDLING_MODEL_VERSION = '0A.6.0';

/** V2.5: 0A.6.0 plus deterministic, non-inherited lifetime readout plasticity. */
export const LIFETIME_PLASTICITY_MODEL_VERSION = '0A.7.0';

/**
 * V2.6 model: `0A.6.0` + REGULATED RECURRENT INITIALIZATION.
 *
 * Structurally this is `0A.6.0` exactly — ten inputs, eight recurrent hidden
 * units, four outputs, 188 inherited neural parameters, solid bodies,
 * contestable five-tick food handling, NO lifetime plasticity — and the
 * runtime recurrent equation is byte-for-byte the same Elman update. The one
 * difference is the sigma the recurrent hidden->hidden block is DRAWN from at
 * founder generation:
 *
 *     recurrentInitSigma = neural.initSigma / sqrt(hiddenLayerSize)
 *
 * a fan-in variance correction, precommitted from the architecture rather than
 * chosen from any trajectory. The input->hidden block receives an external
 * sensory vector once per tick; the recurrent block feeds the network's own
 * hidden activity back into itself every tick, so drawing both from one sigma
 * makes recurrent drive disproportionately large, pushes hidden units into
 * tanh saturation and costs the controller its sensory authority once the
 * recurrent state settles.
 *
 * It is INITIALIZATION ONLY. There is no runtime recurrent gain, no leak, no
 * time constant, no gate and no new gene: after they are drawn, the recurrent
 * weights are ordinary genetic parameters, mutated at birth with the unchanged
 * neural mutation rate, sigma and bounds. `recurrentInitSigma` is never a
 * mutation sigma.
 *
 * Historical models are NOT corrected: 0A.4.0-0A.7.0 keep drawing their
 * recurrent block from `initSigma`, exactly as they always have.
 */
export const REGULATED_RECURRENT_INIT_MODEL_VERSION = '0A.8.0';

/**
 * The [LOCKED] V2.6 fan-in rule. A pure function of two existing configured
 * values, so it can never be quietly retuned: `recurrentInitSigma` is
 * validated against exactly this.
 */
export function regulatedRecurrentInitSigma(initSigma: number, hiddenSize: number): number {
  return initSigma / Math.sqrt(hiddenSize);
}

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
  /**
   * True for a recurrent controller: the genome carries `recurrentHiddenWeights`
   * (hiddenSize x hiddenSize) and every organism carries a runtime `hiddenState`
   * (hiddenSize values) that the Decide phase advances once per acting tick.
   * False: the historical feed-forward controller, with neither.
   */
  readonly recurrent: boolean;
  /**
   * True when living organisms are solid: two of them overlap when their
   * centre distance is strictly less than the sum of their physical radii
   * (`physicalRadiusFromSize`), and the Resolve phase separates them by
   * moving both — the larger one less. False for the historical models
   * 0A.1.0-0A.4.0, whose organisms pass through one another exactly as they
   * always have. It is a physical property only: no input, output, action,
   * event or persistent state is added by it.
   */
  readonly physicalBodies: boolean;
  /**
   * True when eating is a multi-tick, contestable process: an eligible food
   * item is acquired (progress 1), follows its holder's resolved position,
   * advances one step per consecutive handling tick, and is consumed only on
   * reaching `handling.ticksRequired`. Holding is future-affecting per-food
   * state (`holderId`, `handlingProgress`) and therefore canonical.
   *
   * False for 0A.1.0-0A.5.0, whose feeding is instantaneous exactly as it
   * always has been: request eat within feeding range, win the item, receive
   * its energy in the same tick.
   */
  readonly foodHandling: boolean;
  /** True only when hidden->output weights and output biases have runtime learned offsets. */
  readonly lifetimePlasticity: boolean;
  /**
   * True only for `0A.8.0` (V2.6): the recurrent hidden->hidden block is DRAWN
   * from `neural.recurrentInitSigma` (= `initSigma / sqrt(hiddenSize)`)
   * instead of the shared `neural.initSigma`, and the configuration must carry
   * that value. Initialization only — it changes no runtime equation, adds no
   * gene and is never a mutation sigma. False for every historical model,
   * whose recurrent block keeps its original `initSigma` draw.
   */
  readonly regulatedRecurrentInit: boolean;
}

const MODELS: readonly SimulationModel[] = Object.freeze([
  Object.freeze({ simulationVersion: SINGLE_FOUNDER_MODEL_VERSION, neuralInputSize: V1_NEURAL_INPUT_SIZE, organismSensing: false, recurrent: false, physicalBodies: false, foodHandling: false, lifetimePlasticity: false, regulatedRecurrentInit: false }),
  Object.freeze({ simulationVersion: MULTI_FOUNDER_MODEL_VERSION, neuralInputSize: V1_NEURAL_INPUT_SIZE, organismSensing: false, recurrent: false, physicalBodies: false, foodHandling: false, lifetimePlasticity: false, regulatedRecurrentInit: false }),
  Object.freeze({ simulationVersion: ORGANISM_SENSING_MODEL_VERSION, neuralInputSize: ORGANISM_SENSING_NEURAL_INPUT_SIZE, organismSensing: true, recurrent: false, physicalBodies: false, foodHandling: false, lifetimePlasticity: false, regulatedRecurrentInit: false }),
  Object.freeze({ simulationVersion: RECURRENT_MEMORY_MODEL_VERSION, neuralInputSize: ORGANISM_SENSING_NEURAL_INPUT_SIZE, organismSensing: true, recurrent: true, physicalBodies: false, foodHandling: false, lifetimePlasticity: false, regulatedRecurrentInit: false }),
  Object.freeze({ simulationVersion: PHYSICAL_BODIES_MODEL_VERSION, neuralInputSize: ORGANISM_SENSING_NEURAL_INPUT_SIZE, organismSensing: true, recurrent: true, physicalBodies: true, foodHandling: false, lifetimePlasticity: false, regulatedRecurrentInit: false }),
  Object.freeze({ simulationVersion: FOOD_HANDLING_MODEL_VERSION, neuralInputSize: ORGANISM_SENSING_NEURAL_INPUT_SIZE, organismSensing: true, recurrent: true, physicalBodies: true, foodHandling: true, lifetimePlasticity: false, regulatedRecurrentInit: false }),
  Object.freeze({ simulationVersion: LIFETIME_PLASTICITY_MODEL_VERSION, neuralInputSize: ORGANISM_SENSING_NEURAL_INPUT_SIZE, organismSensing: true, recurrent: true, physicalBodies: true, foodHandling: true, lifetimePlasticity: true, regulatedRecurrentInit: false }),
  Object.freeze({ simulationVersion: REGULATED_RECURRENT_INIT_MODEL_VERSION, neuralInputSize: ORGANISM_SENSING_NEURAL_INPUT_SIZE, organismSensing: true, recurrent: true, physicalBodies: true, foodHandling: true, lifetimePlasticity: false, regulatedRecurrentInit: true }),
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

/** Neural input dimension of a model (6 for 0A.1.0 / 0A.2.0, 10 for 0A.3.0 onwards). */
export function neuralInputSizeFor(version: string): number {
  return simulationModel(version).neuralInputSize;
}
