import { Genome, MorphologyGenome, NeuralGenome, NEURAL_INPUT_SIZE, NEURAL_OUTPUT_SIZE } from './types.js';
import { RngStream } from '../rng/rngStream.js';
import { NeuralConfig, BootstrapConfig } from '../config/types.js';
import { evaluateNetwork, evaluateRecurrentNetwork, RawNetworkOutputs } from '../neural/network.js';
import { V1_NEURAL_INPUT_SIZE, ORGANISM_SENSING_NEURAL_INPUT_SIZE } from '../model/simulationModel.js';

/**
 * Founder Neural Genome generation & screening (§13.76, [LOCKED] procedure /
 * [BASELINE] fixture values).
 *
 * One candidate is generated at a time from BootstrapRNG and the FIRST one
 * that passes both gates is accepted. Candidates are never compared, ranked,
 * scored, or run through a trajectory. There is no founder optimization and
 * no cherry-picking: the retry budget only determines how long we keep
 * drawing, never which of several candidates is preferred.
 *
 * Model-specific dimensions: every function here takes the model's neural
 * `inputSize` (from `simulationModel(version).neuralInputSize`), defaulting
 * to the v1 six so the historical 0A.1.0 / 0A.2.0 behaviour — including every
 * BootstrapRNG draw — is exactly unchanged. A 0A.3.0 founder is drawn natively
 * as a 10-input controller through the same procedure (it is never a 6-input
 * controller migrated to 10); the larger input->hidden block consumes more
 * BootstrapRNG draws, so 0A.3.0 bootstrap diverges from v1 under the same seed.
 *
 * Recurrent model (0A.4.0): `recurrent = true` (default false) appends the
 * hiddenSize x hiddenSize recurrent block — drawn last, from the same
 * `initSigma`, checked and clamped to the same `neuralParamBounds`.
 *
 * V2.6 (0A.8.0 only): `recurrentSigma` overrides the sigma of that appended
 * block alone. Everything else about the draw is unchanged — the same four
 * historical blocks in the same order from the same `initSigma`, the recurrent
 * block still last, the same bounds, and exactly the same NUMBER and ORDER of
 * RNG draws (`gaussian` consumes two draws per value whatever its sigma). Only
 * the numeric scale of the recurrent block differs. Omitting it reproduces the
 * historical recurrent draw exactly, so 0A.4.0-0A.7.0 are untouched. The
 * viability screen evaluates EVERY probe from a fresh all-zero hidden state,
 * independently: no memory is carried from one probe to the next, so probe
 * order is never a temporal sequence, and with zero memory the recurrent
 * weights contribute nothing — the screen cannot require, reward or even
 * detect any use of memory.
 */

/**
 * Draw one raw founder candidate. Exported so a test can replay the exact draw
 * sequence and verify that acceptance is first-passing-candidate, with no
 * ranking or best-of-N.
 */
export function drawNeuralGenome(
  rng: RngStream,
  hiddenSize: number,
  sigma: number,
  inputSize: number = NEURAL_INPUT_SIZE,
  recurrent = false,
  recurrentSigma?: number
): NeuralGenome {
  // Fixed parameter order (§13.76 step 1): input->hidden weights, hidden
  // biases, hidden->output weights, output biases — then, for a recurrent
  // model only, the appended recurrent hidden->hidden block.
  const drawFrom = (n: number, s: number): number[] => {
    const out: number[] = new Array(n);
    for (let i = 0; i < n; i++) out[i] = rng.gaussian(0, s);
    return out;
  };
  const draw = (n: number): number[] => drawFrom(n, sigma);
  const genome: { -readonly [K in keyof NeuralGenome]: NeuralGenome[K] } = {
    inputHiddenWeights: draw(hiddenSize * inputSize),
    hiddenBiases: draw(hiddenSize),
    hiddenOutputWeights: draw(NEURAL_OUTPUT_SIZE * hiddenSize),
    outputBiases: draw(NEURAL_OUTPUT_SIZE),
  };
  // V2.6: the recurrent block's sigma, and nothing else, may be overridden.
  if (recurrent) genome.recurrentHiddenWeights = drawFrom(hiddenSize * hiddenSize, recurrentSigma ?? sigma);
  return genome;
}

export interface MechanicalValidity {
  valid: boolean;
  /** Populated only when valid: the bounds-clamped genome. */
  genome: NeuralGenome | null;
  reason: string | null;
}

/**
 * Mechanical validity check (§13.76 step 2).
 *
 * Two distinct outcomes, deliberately kept separate:
 *   - Non-finite values (NaN / Infinity / -Infinity) REJECT the candidate.
 *     They are never silently coerced to zero: a coerced zero would smuggle a
 *     structurally invalid draw into the accepted founder and quietly change
 *     what the deterministic validity gate means.
 *   - Out-of-bounds finite values are CLAMPED, not rejected — the spec is
 *     explicit that this check "only rejects non-finite output".
 *
 * A dimensionality mismatch is a programming error, not a bad draw, so it
 * throws rather than consuming another candidate.
 */
export function mechanicalValidityCheck(
  genome: NeuralGenome,
  hiddenSize: number,
  bounds: { min: number; max: number },
  inputSize: number = NEURAL_INPUT_SIZE,
  recurrent = false
): MechanicalValidity {
  if (genome.inputHiddenWeights.length !== hiddenSize * inputSize) {
    throw new Error('founder: dimensionality mismatch (input->hidden weights)');
  }
  if (genome.hiddenBiases.length !== hiddenSize) {
    throw new Error('founder: dimensionality mismatch (hidden biases)');
  }
  if (genome.hiddenOutputWeights.length !== NEURAL_OUTPUT_SIZE * hiddenSize) {
    throw new Error('founder: dimensionality mismatch (hidden->output weights)');
  }
  if (genome.outputBiases.length !== NEURAL_OUTPUT_SIZE) {
    throw new Error('founder: dimensionality mismatch (output biases)');
  }
  const recurrentBlock = genome.recurrentHiddenWeights;
  if (recurrent && (recurrentBlock === undefined || recurrentBlock.length !== hiddenSize * hiddenSize)) {
    throw new Error('founder: dimensionality mismatch (recurrent hidden->hidden weights)');
  }
  if (!recurrent && recurrentBlock !== undefined) {
    throw new Error('founder: a feed-forward genome must not carry recurrent weights');
  }

  const blocks: readonly (readonly number[])[] = [
    genome.inputHiddenWeights,
    genome.hiddenBiases,
    genome.hiddenOutputWeights,
    genome.outputBiases,
    ...(recurrentBlock !== undefined ? [recurrentBlock] : []),
  ];
  for (const block of blocks) {
    for (const v of block) {
      if (!Number.isFinite(v)) {
        return { valid: false, genome: null, reason: `non-finite neural parameter (${String(v)})` };
      }
    }
  }

  const clampArr = (arr: readonly number[]): number[] =>
    arr.map((v) => Math.max(bounds.min, Math.min(bounds.max, v)));

  const clamped: { -readonly [K in keyof NeuralGenome]: NeuralGenome[K] } = {
    inputHiddenWeights: clampArr(genome.inputHiddenWeights),
    hiddenBiases: clampArr(genome.hiddenBiases),
    hiddenOutputWeights: clampArr(genome.hiddenOutputWeights),
    outputBiases: clampArr(genome.outputBiases),
  };
  if (recurrentBlock !== undefined) clamped.recurrentHiddenWeights = clampArr(recurrentBlock);
  return { valid: true, reason: null, genome: clamped };
}

export interface FounderProbe {
  name: string;
  input: number[];
}

/**
 * Fixed, precommitted synthetic probe set (§13.76 step 3, [BASELINE] fixtures).
 *
 * Input layout is the §11.58 vector:
 *   [foodVisible, foodDistance, foodAngle, boundaryDistance, boundaryAngle, normalizedEnergy]
 *
 * Positive foodAngle = food is to the organism's RIGHT (clockwise); the turn
 * output shares that sign convention (§11.59).
 *
 * For the 0A.3.0 ten-input model every probe is the same six-value fixture
 * with [0, 0, 0, 0] appended for organismVisible, organismDistance,
 * organismAngle, organismRelativeSize — "no other organism visible", exactly
 * the sensing contract's no-target default. The screen stays a check of basic
 * mechanical viability: no probe places an organism in view, and no check asks
 * for any response to one. How organism sensing is used is left to evolution.
 */
export function founderProbeSet(
  probeConfig: BootstrapConfig['founderProbe'],
  inputSize: number = NEURAL_INPUT_SIZE
): FounderProbe[] {
  const v1 = v1FounderProbeSet(probeConfig);
  if (inputSize === V1_NEURAL_INPUT_SIZE) return v1;
  if (inputSize === ORGANISM_SENSING_NEURAL_INPUT_SIZE) {
    return v1.map((p) => ({ name: p.name, input: [...p.input, 0, 0, 0, 0] }));
  }
  throw new Error(`founderProbeSet: no probe layout for a ${inputSize}-input model`);
}

function v1FounderProbeSet(probeConfig: BootstrapConfig['founderProbe']): FounderProbe[] {
  const a = probeConfig.lateralFoodAngle;
  return [
    { name: 'food-ahead-close', input: [1, 0.1, 0, 0.5, 0, 0.5] },
    { name: 'food-ahead-far', input: [1, 0.9, 0, 0.5, 0, 0.5] },
    { name: 'food-right-close', input: [1, 0.2, a, 0.5, 0, 0.5] },
    { name: 'food-left-close', input: [1, 0.2, -a, 0.5, 0, 0.5] },
    { name: 'eat-ready', input: [1, 0.02, 0, 0.5, 0, 0.5] },
    { name: 'reproduce-diagnostic', input: [0, 0, 0, 0.5, 0, probeConfig.reproduceProbeEnergy] },
    { name: 'neutral', input: [0, 0, 0, 0.5, 0, 0.5] },
  ];
}

export interface ViabilityChecks {
  /** (a) non-degeneracy: output is not constant across the probe set. */
  nonDegenerate: boolean;
  /** (b) movement is mechanically possible. */
  movementPossible: boolean;
  /** (c) food is approachable: turn sign follows signed foodAngle, and does not veer when food is dead ahead. */
  foodApproachable: boolean;
  /** (d) eating is mechanically possible. */
  eatingPossible: boolean;
  /** (e) reproduction is mechanically possible. */
  reproductionPossible: boolean;
}

export interface ViabilityResult {
  pass: boolean;
  checks: ViabilityChecks;
}

/**
 * Five-check minimal-viability screen (§13.76 step 3, [LOCKED] which checks
 * exist and what each verifies).
 *
 * Strictly binary pass/fail against fixed criteria. No scoring, no ranking, no
 * comparison across candidates, no trajectory simulation. Its only purpose is
 * to avoid starting evolution from a catastrophically non-functional
 * controller; it must not pre-solve food-seeking.
 *
 * Check (c) is the corrected diagnostic. It verifies two things:
 *   - directional response: with food to the RIGHT the turn output must be
 *     strictly positive, and with food to the LEFT strictly negative — the
 *     fixed-sign check against §11.58's shared sign convention;
 *   - non-veering: with food DIRECTLY AHEAD (foodAngle = 0), |turn| must not
 *     exceed alignedTurnTolerance. A one-sided bound such as `turn > -0.5`
 *     would pass a controller that swings hard right while food sits dead
 *     ahead, which is exactly the "catastrophically steering away" case this
 *     check exists to catch.
 */
export function minimalViabilityScreen(
  genome: NeuralGenome,
  hiddenSize: number,
  neuralConfig: NeuralConfig,
  probeConfig: BootstrapConfig['founderProbe'],
  inputSize: number = NEURAL_INPUT_SIZE,
  recurrent = false
): ViabilityResult {
  const probes = founderProbeSet(probeConfig, inputSize);
  const out = new Map<string, RawNetworkOutputs>();
  for (const p of probes) {
    // Recurrent: a FRESH zero hidden state for every probe — probes are
    // independent single evaluations, never a sequence.
    out.set(p.name, recurrent
      ? evaluateRecurrentNetwork(genome, p.input, new Array<number>(hiddenSize).fill(0), hiddenSize, inputSize).outputs
      : evaluateNetwork(genome, p.input, hiddenSize, inputSize));
  }
  const get = (name: string) => {
    const o = out.get(name);
    if (!o) throw new Error(`founder probe missing: ${name}`);
    return o;
  };

  // (a) non-degeneracy: the controller must respond to its inputs at all.
  const signature = probes.map((p) => {
    const o = get(p.name);
    return `${o.forward.toFixed(9)}|${o.turn.toFixed(9)}|${o.eat.toFixed(9)}|${o.reproduce.toFixed(9)}`;
  });
  const nonDegenerate = new Set(signature).size > 1;

  // (b) movement is mechanically possible on at least one probe.
  const movementPossible = probes.some((p) => get(p.name).forward > probeConfig.minForwardOutput);

  // (c) food approachability (see doc comment).
  const right = get('food-right-close').turn;
  const left = get('food-left-close').turn;
  const aheadClose = get('food-ahead-close').turn;
  const aheadFar = get('food-ahead-far').turn;
  const directionalResponse = right > 0 && left < 0;
  const doesNotVeerWhenAligned =
    Math.abs(aheadClose) <= probeConfig.alignedTurnTolerance &&
    Math.abs(aheadFar) <= probeConfig.alignedTurnTolerance;
  const foodApproachable = directionalResponse && doesNotVeerWhenAligned;

  // (d) / (e) action thresholds are reachable at all.
  const eatingPossible = get('eat-ready').eat >= neuralConfig.eatThreshold;
  const reproductionPossible = get('reproduce-diagnostic').reproduce >= neuralConfig.reproductionActionThreshold;

  const checks: ViabilityChecks = {
    nonDegenerate,
    movementPossible,
    foodApproachable,
    eatingPossible,
    reproductionPossible,
  };
  const pass =
    checks.nonDegenerate &&
    checks.movementPossible &&
    checks.foodApproachable &&
    checks.eatingPossible &&
    checks.reproductionPossible;

  return { pass, checks };
}

export interface FounderGenerationResult {
  neural: NeuralGenome;
  /** 1-based index of the accepted candidate in the draw sequence. */
  attempts: number;
  lastViability: ViabilityResult;
}

/**
 * Generate the Founder Neural Genome (§13.76 steps 1-4).
 *
 * draw -> mechanical validity -> five-check viability screen -> on failure,
 * continue consuming the SAME BootstrapRNG stream for the next candidate
 * (never rewound, never re-rolled), up to maxFounderAttempts. Exhausting the
 * budget is a configuration error and throws, rather than degrading into an
 * unscreened founder or retrying indefinitely.
 */
export function generateFounderNeuralGenome(
  rng: RngStream,
  hiddenSize: number,
  neuralConfig: NeuralConfig,
  bootstrapConfig: BootstrapConfig,
  inputSize: number = NEURAL_INPUT_SIZE,
  recurrent = false,
  recurrentSigma?: number
): FounderGenerationResult {
  let lastViability: ViabilityResult | null = null;
  let rejectedNonFinite = 0;

  for (let attempt = 1; attempt <= bootstrapConfig.maxFounderAttempts; attempt++) {
    const raw = drawNeuralGenome(rng, hiddenSize, neuralConfig.initSigma, inputSize, recurrent, recurrentSigma);

    const validity = mechanicalValidityCheck(raw, hiddenSize, neuralConfig.neuralParamBounds, inputSize, recurrent);
    if (!validity.valid || validity.genome === null) {
      rejectedNonFinite += 1;
      continue; // structurally invalid candidate; draw the next one
    }

    const viability = minimalViabilityScreen(validity.genome, hiddenSize, neuralConfig, bootstrapConfig.founderProbe, inputSize, recurrent);
    lastViability = viability;
    if (viability.pass) {
      return { neural: validity.genome, attempts: attempt, lastViability: viability };
    }
  }

  throw new Error(
    `generateFounderNeuralGenome: exhausted maxFounderAttempts (${bootstrapConfig.maxFounderAttempts}) ` +
      'without a candidate passing the §13.76 validity + viability gates. This indicates a degenerate ' +
      'initSigma, parameter bound, or probe fixture configuration and must be fixed directly, not retried. ' +
      `(non-finite rejections: ${rejectedNonFinite}; last viability: ${JSON.stringify(lastViability?.checks)})`
  );
}

/**
 * Founder morphology (§13.26): the midpoint of each gene's legal range.
 * A fixed, documented, non-adaptive reference point — not drawn from RNG and
 * not selected for performance. Every bootstrap organism perturbs away from it.
 */
export function founderMorphology(bounds: BootstrapConfig['geneBounds']): MorphologyGenome {
  const mid = (b: { min: number; max: number }) => (b.min + b.max) / 2;
  return {
    size: mid(bounds.size),
    maxSpeed: mid(bounds.maxSpeed),
    visionRange: mid(bounds.visionRange),
    visionAngle: mid(bounds.visionAngle),
    metabolism: mid(bounds.metabolism),
  };
}

export interface FounderProfile {
  genome: Genome;
  attempts: number;
}

export function generateFounderProfile(
  rng: RngStream,
  hiddenSize: number,
  neuralConfig: NeuralConfig,
  bootstrapConfig: BootstrapConfig,
  inputSize: number = NEURAL_INPUT_SIZE,
  recurrent = false,
  recurrentSigma?: number
): FounderProfile {
  const { neural, attempts } = generateFounderNeuralGenome(rng, hiddenSize, neuralConfig, bootstrapConfig, inputSize, recurrent, recurrentSigma);
  const morphology = founderMorphology(bootstrapConfig.geneBounds);
  return { genome: { morphology, neural }, attempts };
}
