/**
 * BehaviorFingerprint (Spec v4 §11.41, §6.11 [LOCKED]).
 *
 * A fingerprint is a compact, standardized summary of one controller's raw
 * responses to a fixed probe set. It is an ANALYTICAL DERIVATIVE:
 *
 *   - it is not inherited state (§11.41 [LOCKED]),
 *   - it is never an evolutionary target (§6.11 [LOCKED]),
 *   - it is not a fitness score, not an intelligence score, and the six
 *     dimensions are not combined, weighted or ranked into any single
 *     "quality" number. Nothing here says a value is good or bad.
 *
 * Every dimension is a plain arithmetic mean of raw network outputs over an
 * explicitly-defined subset of probes. The definitions below ARE the
 * specification of behavior-fingerprint-v1; changing any of them requires a
 * new `fingerprintVersion`, because an old and a new fingerprint would not be
 * comparable (§13.223: a brain may receive a different fingerprint under a
 * changed probe set).
 */

import { hash64 } from '@alo/simulation-core';
import type { NeuralGenome } from '@alo/simulation-core';
import { evaluateProbeSet } from './evaluate.js';
import type { ProbeEvaluation } from './evaluate.js';
import {
  DEFAULT_PROBE_SET,
  PROBE_HIGH_ENERGY,
  PROBE_LOW_ENERGY,
  PROBE_WALL_FAR_MIN,
  PROBE_WALL_NEAR_MAX,
  ProbeSet,
} from './probeSet.js';

export const FINGERPRINT_VERSION = 'behavior-fingerprint-v1';

export interface BehaviorFingerprint {
  readonly fingerprintVersion: string;
  readonly probeSetId: string;
  readonly probeSetContentHash: string;

  /** Mean `forward` output across every probe. */
  readonly meanForwardTendency: number;
  /** Mean |`turn`| across every probe. */
  readonly meanTurnMagnitude: number;
  /**
   * Mean of (turn x sign(foodAngle)) over food-visible probes whose foodAngle
   * is non-zero. Positive means the turn output tends to share the sign of the
   * food bearing; negative means it tends to oppose it. Descriptive only.
   */
  readonly foodApproachResponse: number;
  /** Mean `eat` output over food-visible probes at the lowest energy level. */
  readonly lowEnergyFoodResponse: number;
  /**
   * Mean |turn| over wall-near probes minus mean |turn| over wall-far probes.
   * Descriptive contrast, not a navigation quality measure.
   */
  readonly wallProximityTurnDelta: number;
  /** Mean `reproduce` output over probes at the highest energy level. */
  readonly highEnergyReproductionResponse: number;

  /** Stable hash of the six dimensions plus the version/probe-set identity. */
  readonly fingerprintHash: string;
}

/** Index positions inside the §11.58 input vector. */
const IDX_FOOD_VISIBLE = 0;
const IDX_FOOD_ANGLE = 2;
const IDX_BOUNDARY_DISTANCE = 3;
const IDX_ENERGY = 5;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Fixed decimal formatting so the hash is stable across platforms. */
function fmt(value: number): string {
  return value.toFixed(12);
}

export function computeBehaviorFingerprint(
  evaluation: ProbeEvaluation,
  probeSet: ProbeSet = DEFAULT_PROBE_SET
): BehaviorFingerprint {
  if (evaluation.probeSetContentHash !== probeSet.contentHash) {
    throw new Error('fingerprint: evaluation was produced by a different probe set');
  }
  if (evaluation.responses.length !== probeSet.probes.length) {
    throw new Error('fingerprint: response count does not match probe count');
  }

  const forwardAll: number[] = [];
  const turnMagAll: number[] = [];
  const approach: number[] = [];
  const lowEnergyEat: number[] = [];
  const wallNearTurn: number[] = [];
  const wallFarTurn: number[] = [];
  const highEnergyReproduce: number[] = [];

  for (let i = 0; i < probeSet.probes.length; i++) {
    const probe = probeSet.probes[i]!;
    const r = evaluation.responses[i]!;
    const input = probe.input;
    const foodVisible = input[IDX_FOOD_VISIBLE]!;
    const foodAngle = input[IDX_FOOD_ANGLE]!;
    const boundaryDistance = input[IDX_BOUNDARY_DISTANCE]!;
    const energy = input[IDX_ENERGY]!;
    const turnMagnitude = Math.abs(r.turn);

    forwardAll.push(r.forward);
    turnMagAll.push(turnMagnitude);

    if (foodVisible === 1 && foodAngle !== 0) {
      approach.push(r.turn * Math.sign(foodAngle));
    }
    if (foodVisible === 1 && energy === PROBE_LOW_ENERGY) {
      lowEnergyEat.push(r.eat);
    }
    if (boundaryDistance <= PROBE_WALL_NEAR_MAX) {
      wallNearTurn.push(turnMagnitude);
    }
    if (boundaryDistance >= PROBE_WALL_FAR_MIN) {
      wallFarTurn.push(turnMagnitude);
    }
    if (energy >= PROBE_HIGH_ENERGY) {
      highEnergyReproduce.push(r.reproduce);
    }
  }

  const meanForwardTendency = mean(forwardAll);
  const meanTurnMagnitude = mean(turnMagAll);
  const foodApproachResponse = mean(approach);
  const lowEnergyFoodResponse = mean(lowEnergyEat);
  const wallProximityTurnDelta = mean(wallNearTurn) - mean(wallFarTurn);
  const highEnergyReproductionResponse = mean(highEnergyReproduce);

  const fingerprintHash = hash64([
    FINGERPRINT_VERSION,
    probeSet.probeSetId,
    probeSet.contentHash,
    fmt(meanForwardTendency),
    fmt(meanTurnMagnitude),
    fmt(foodApproachResponse),
    fmt(lowEnergyFoodResponse),
    fmt(wallProximityTurnDelta),
    fmt(highEnergyReproductionResponse),
  ].join('|'));

  return {
    fingerprintVersion: FINGERPRINT_VERSION,
    probeSetId: probeSet.probeSetId,
    probeSetContentHash: probeSet.contentHash,
    meanForwardTendency,
    meanTurnMagnitude,
    foodApproachResponse,
    lowEnergyFoodResponse,
    wallProximityTurnDelta,
    highEnergyReproductionResponse,
    fingerprintHash,
  };
}

/** Convenience: genome -> fingerprint in one offline, side-effect-free call. */
export function fingerprintOfGenome(
  genome: NeuralGenome,
  probeSet: ProbeSet = DEFAULT_PROBE_SET
): BehaviorFingerprint {
  return computeBehaviorFingerprint(evaluateProbeSet(genome, probeSet), probeSet);
}
