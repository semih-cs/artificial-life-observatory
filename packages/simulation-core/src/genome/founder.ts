import { Genome, MorphologyGenome, NeuralGenome, NEURAL_INPUT_SIZE, NEURAL_OUTPUT_SIZE } from './types.js';
import { RngStream } from '../rng/rngStream.js';
import { NeuralConfig, BootstrapConfig } from '../config/types.js';
import { evaluateNetwork } from '../neural/network.js';

/**
 * Founder Neural Genome generation & screening (§13.76, [LOCKED] procedure /
 * [BASELINE] fixture values).
 *
 * One candidate is generated at a time from BootstrapRNG and the FIRST one
 * that passes both gates is accepted. Candidates are never compared, ranked,
 * scored, or run through a trajectory. There is no founder optimization and
 * no cherry-picking: the retry budget only determines how long we keep
 * drawing, never which of several candidates is preferred.
 */

function drawNeuralGenome(rng: RngStream, hiddenSize: number, sigma: number): NeuralGenome {
  // Fixed parameter order (§13.76 step 1): input->hidden weights, hidden
  // biases, hidden->output weights, output biases.
  const draw = (n: number): number[] => {
    const out: number[] = new Array(n);
    for (let i = 0; i < n; i++) out[i] = rng.gaussian(0, sigma);
    return out;
  };
  return {
    inputHiddenWeights: draw(hiddenSize * NEURAL_INPUT_SIZE),
    hiddenBiases: draw(hiddenSize),
    hiddenOutputWeights: draw(NEURAL_OUTPUT_SIZE * hiddenSize),
    outputBiases: draw(NEURAL_OUTPUT_SIZE),
  };
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
  bounds: { min: number; max: number }
): MechanicalValidity {
  if (genome.inputHiddenWeights.length !== hiddenSize * NEURAL_INPUT_SIZE) {
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

  const blocks: readonly (readonly number[])[] = [
    genome.inputHiddenWeights,
    genome.hiddenBiases,
    genome.hiddenOutputWeights,
    genome.outputBiases,
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

  return {
    valid: true,
    reason: null,
    genome: {
      inputHiddenWeights: clampArr(genome.inputHiddenWeights),
      hiddenBiases: clampArr(genome.hiddenBiases),
      hiddenOutputWeights: clampArr(genome.hiddenOutputWeights),
      outputBiases: clampArr(genome.outputBiases),
    },
  };
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
 */
export function founderProbeSet(probeConfig: BootstrapConfig['founderProbe']): FounderProbe[] {
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
  probeConfig: BootstrapConfig['founderProbe']
): ViabilityResult {
  const probes = founderProbeSet(probeConfig);
  const out = new Map<string, ReturnType<typeof evaluateNetwork>>();
  for (const p of probes) {
    out.set(p.name, evaluateNetwork(genome, p.input, hiddenSize));
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
  bootstrapConfig: BootstrapConfig
): FounderGenerationResult {
  let lastViability: ViabilityResult | null = null;
  let rejectedNonFinite = 0;

  for (let attempt = 1; attempt <= bootstrapConfig.maxFounderAttempts; attempt++) {
    const raw = drawNeuralGenome(rng, hiddenSize, neuralConfig.initSigma);

    const validity = mechanicalValidityCheck(raw, hiddenSize, neuralConfig.neuralParamBounds);
    if (!validity.valid || validity.genome === null) {
      rejectedNonFinite += 1;
      continue; // structurally invalid candidate; draw the next one
    }

    const viability = minimalViabilityScreen(validity.genome, hiddenSize, neuralConfig, bootstrapConfig.founderProbe);
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
  bootstrapConfig: BootstrapConfig
): FounderProfile {
  const { neural, attempts } = generateFounderNeuralGenome(rng, hiddenSize, neuralConfig, bootstrapConfig);
  const morphology = founderMorphology(bootstrapConfig.geneBounds);
  return { genome: { morphology, neural }, attempts };
}
