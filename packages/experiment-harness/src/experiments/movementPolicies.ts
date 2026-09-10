/**
 * Test-only deterministic movement policies (Spec v4 §16.9 [LOCKED]).
 *
 * §16.9: "The evolved neural controller may complicate energy diagnosis. For
 * example, one founder brain may remain nearly stationary while another moves
 * continuously. Therefore Stage A may use test-only deterministic movement
 * policies." The four policies it names are used verbatim:
 *
 *     Stationary Agent, Constant 25% Speed, Constant 50% Speed, Constant 100% Speed
 *
 * §16.9 [LOCKED] also states these agents are diagnostic tools and NOT
 * canonical organisms, and that such policies may isolate the EnergyModel
 * "without altering canonical organism behavior". This module honours that
 * literally: **no simulation-core code is changed and no canonical rule is
 * bent.** A policy is expressed as an ordinary `NeuralGenome` whose parameters
 * make the §11.59 output mapping produce a constant action, and it is installed
 * once at world construction, before tick 1. From the simulation's point of
 * view these are ordinary organisms running an ordinary feedforward network.
 *
 * ---------------------------------------------------------------------------
 * How a constant action is produced
 * ---------------------------------------------------------------------------
 * All input->hidden weights are 0, so every hidden unit is `tanh(hiddenBias)`
 * regardless of the sensory vector: the controller is provably
 * input-independent. Each output then depends only on its own bias and its
 * hidden->output weights.
 *
 * Every parameter stays inside the [BASELINE] §11.30 `neuralParamBounds`
 * ([-2, 2] by default) — a diagnostic agent does not need out-of-bounds
 * parameters, and staying in bounds keeps it a legal genome.
 *
 * A consequence of the [LOCKED] §11.59 mapping: `forward` is a sigmoid, so
 * exactly 0.0 and exactly 1.0 are unreachable. Within bounds the saturated
 * cells attain ~2.7e-8 and ~1 - 2.7e-8. At the default `maxSpeed` of 1.25 the
 * "stationary" agent therefore requests ~3.4e-8 world units per tick and pays
 * ~7e-17 energy per tick for it — below the resolution of the energy
 * accounting, and 15 orders of magnitude under basal metabolism. It is
 * stationary in every measurable sense; the exact attained values are asserted
 * by test rather than assumed.
 *
 * ---------------------------------------------------------------------------
 * Why every policy also turns at full rate
 * ---------------------------------------------------------------------------
 * A fixed forward speed with zero turn is NOT a usable energy probe in this
 * world. Movement energy is charged on *actual resolved* displacement (§12.8,
 * [LOCKED]) and `resolveMovement` clamps position to the world perimeter, so a
 * straight-line agent reaches a wall, is clamped to zero displacement, and from
 * then on pays only basal metabolism. Its measured drain would decay to basal
 * and the four speed levels would converge — measuring nothing. (A test
 * demonstrates exactly this failure with a zero-turn variant, so the design
 * choice is evidenced rather than asserted.)
 *
 * Every policy therefore also requests a full-rate turn. Displacement per tick
 * is the requested forward speed regardless of heading, so the energy cost is
 * unchanged, but the path becomes a regular polygon of side `v` and
 * circumradius `v / (2 sin(maxTurnRate / 2))` — about 2.4 world units at full
 * speed with the default `maxTurnRate` of pi/6. Bootstrap places organisms at
 * least `boundaryMinSeparationFraction * min(width, height)` = 10 units from
 * the perimeter, so a policy agent orbits a patch a few units across and never
 * touches a wall. Displacement per tick is then exactly the requested speed for
 * the whole run, which is precisely the clean energy measurement §16.9 asks for.
 */

import type { NeuralGenome } from '@alo/simulation-core';
import { NEURAL_INPUT_SIZE, NEURAL_OUTPUT_SIZE } from '@alo/simulation-core';

export const MOVEMENT_POLICY_SET_VERSION = 'movement-policy-v1';

/** The four §16.9 policies, plus the unmodified controller as the reference cell. */
export type MovementPolicyId = 'stationary' | 'speed-25' | 'speed-50' | 'speed-100';

/**
 * Requested forward speed as a fraction of `phenotype.maxSpeed`.
 * These four levels are taken verbatim from §16.9 and are precommitted.
 */
export const MOVEMENT_POLICY_LEVELS: Readonly<Record<MovementPolicyId, number>> = Object.freeze({
  'stationary': 0,
  'speed-25': 0.25,
  'speed-50': 0.5,
  'speed-100': 1,
});

export const MOVEMENT_POLICY_IDS: readonly MovementPolicyId[] =
  Object.freeze(['stationary', 'speed-25', 'speed-50', 'speed-100'] as const);

/** Output index order is fixed by §11.59: [forward, turn, eat, reproduce]. */
const OUT_FORWARD = 0;
const OUT_TURN = 1;
const OUT_EAT = 2;
const OUT_REPRODUCE = 3;

/** Inverse of the sigmoid, used to hit an exact intermediate forward level. */
function logit(p: number): number {
  return Math.log(p / (1 - p));
}

export interface MovementPolicyOptions {
  /**
   * 'full' (default) requests the maximum turn rate so the agent orbits a tiny
   * polygon and never reaches a wall. 'none' requests zero turn and is used
   * ONLY by the test that demonstrates why 'full' is necessary.
   */
  turn?: 'full' | 'none';
}

/**
 * Build the diagnostic genome for one policy.
 *
 * `bounds` is the configured `neuralParamBounds`; every emitted parameter is
 * inside it, and the saturated cells use the bound itself rather than an
 * arbitrary large number.
 */
export function movementPolicyGenome(
  policyId: MovementPolicyId,
  hiddenSize: number,
  bounds: { min: number; max: number },
  options: MovementPolicyOptions = {}
): NeuralGenome {
  const level = MOVEMENT_POLICY_LEVELS[policyId];
  if (level === undefined) throw new Error(`movementPolicyGenome: unknown policy '${policyId}'`);
  if (hiddenSize <= 0) throw new Error('movementPolicyGenome: hiddenSize must be positive');

  const hi = bounds.max;
  const lo = bounds.min;

  // Input-independent hidden layer: zero input weights, saturating positive bias.
  const inputHiddenWeights = new Array<number>(hiddenSize * NEURAL_INPUT_SIZE).fill(0);
  const hiddenBiases = new Array<number>(hiddenSize).fill(hi);

  const hiddenOutputWeights = new Array<number>(NEURAL_OUTPUT_SIZE * hiddenSize).fill(0);
  const outputBiases = new Array<number>(NEURAL_OUTPUT_SIZE).fill(0);

  const setOutput = (outputIndex: number, weight: number, bias: number): void => {
    for (let h = 0; h < hiddenSize; h++) hiddenOutputWeights[outputIndex * hiddenSize + h] = weight;
    outputBiases[outputIndex] = bias;
  };

  // forward — saturate low/high for the 0% and 100% cells, and use the exact
  // logit of the target for the intermediate cells (weights zero, so the
  // pre-activation sum is the bias alone and sigmoid(logit(p)) = p).
  if (level <= 0) setOutput(OUT_FORWARD, lo, lo);
  else if (level >= 1) setOutput(OUT_FORWARD, hi, hi);
  else setOutput(OUT_FORWARD, 0, logit(level));

  // turn — full rate (or none, for the justification test only).
  if ((options.turn ?? 'full') === 'full') setOutput(OUT_TURN, hi, hi);
  else setOutput(OUT_TURN, 0, 0);

  // eat and reproduce — saturated low, so neither action is ever requested.
  // Food and reproduction are also disabled by configuration in the diagnostic;
  // this makes the agent inert regardless of how it is configured.
  setOutput(OUT_EAT, lo, lo);
  setOutput(OUT_REPRODUCE, lo, lo);

  return { inputHiddenWeights, hiddenBiases, hiddenOutputWeights, outputBiases };
}
