/**
 * Standardized functional neural probe set (Spec v4 §11.37–§11.39, §14.31).
 *
 * A probe set is a FIXED, VERSIONED list of synthetic §11.58 sensory input
 * vectors. It is pure data produced by deterministic enumeration:
 *
 *   - no RNG of any kind is consumed (canonical, bootstrap, or otherwise),
 *   - no world, organism or genome state is read,
 *   - the same code always produces byte-identical probe inputs.
 *
 * Probe states are ANALYTICAL FIXTURES. They do not have to correspond to any
 * situation an organism has actually experienced (§11.38).
 *
 * Versioning contract (§11.38, §13.223 of the spec's provenance rules):
 * if any input value, ordering or count changes, `probeSetId` MUST change.
 * `contentHash` is checked by a pinned test so a silent edit cannot happen.
 */

import { hash64, NEURAL_INPUT_SIZE } from '@alo/simulation-core';

/** Descriptive grouping only — carries no ranking or scoring meaning. */
export type ProbeGroup = 'food-visible' | 'food-absent';

export interface ProbeState {
  /** Position in the probe set. Fixed by construction order. */
  readonly index: number;
  /** Descriptive label for reporting; never used as a weight or score. */
  readonly group: ProbeGroup;
  /**
   * The §11.58 input vector, indices 0–5:
   * [foodVisible, foodDistance, foodAngle, boundaryDistance, boundaryAngle, normalizedEnergy]
   */
  readonly input: readonly number[];
}

export interface ProbeSet {
  readonly probeSetId: string;
  readonly probeSetVersion: number;
  readonly probes: readonly ProbeState[];
  /** hash64 over the canonical serialization of every probe input. */
  readonly contentHash: string;
}

// ---------------------------------------------------------------------------
// v1 grid definition. These literals ARE the specification of probe-set-v1.
// ---------------------------------------------------------------------------

/** foodDistance values, normalized to (0, 1] per §11.58 index 1. */
const FOOD_DISTANCES = [0.1, 0.3, 0.5, 0.7, 0.9] as const;
/** foodAngle values in (−1, 1]; positive = food to the organism's right. */
const FOOD_ANGLES = [-0.9, -0.5, -0.15, 0, 0.15, 0.5, 0.9] as const;
/** normalizedEnergy levels used with visible food. */
const FOOD_ENERGIES = [0.15, 0.5, 0.9] as const;
/** Two contrasting boundary contexts held alongside every food situation. */
const FOOD_BOUNDARY_CONTEXTS = [
  { distance: 0.8, angle: 0.5 }, // open space, wall far and off to the right
  { distance: 0.1, angle: 0.0 }, // wall close and directly ahead
] as const;

/** boundaryDistance values for the food-absent block. */
const ABSENT_BOUNDARY_DISTANCES = [0.05, 0.3, 0.55, 0.8, 1.0] as const;
/** boundaryAngle values for the food-absent block, in (−1, 1]. */
const ABSENT_BOUNDARY_ANGLES = [-0.9, -0.3, 0.3, 0.9] as const;
/** normalizedEnergy levels for the food-absent block. */
const ABSENT_ENERGIES = [0.15, 0.9] as const;

/** The lowest normalizedEnergy level present in the set (used by fingerprint dims). */
export const PROBE_LOW_ENERGY = 0.15;
/** The highest normalizedEnergy level present in the set (used by fingerprint dims). */
export const PROBE_HIGH_ENERGY = 0.9;
/** boundaryDistance at or below this counts as "wall near" for fingerprint dims. */
export const PROBE_WALL_NEAR_MAX = 0.25;
/** boundaryDistance at or above this counts as "wall far" for fingerprint dims. */
export const PROBE_WALL_FAR_MIN = 0.75;

function buildProbesV1(): ProbeState[] {
  const probes: ProbeState[] = [];
  let index = 0;

  // Block 1 — food visible: 5 × 7 × 3 × 2 = 210 states.
  for (const distance of FOOD_DISTANCES) {
    for (const angle of FOOD_ANGLES) {
      for (const energy of FOOD_ENERGIES) {
        for (const boundary of FOOD_BOUNDARY_CONTEXTS) {
          probes.push({
            index: index++,
            group: 'food-visible',
            input: [1, distance, angle, boundary.distance, boundary.angle, energy],
          });
        }
      }
    }
  }

  // Block 2 — food absent: 5 × 4 × 2 = 40 states.
  // §11.58: with foodVisible = 0, foodDistance and foodAngle are 0.0.
  for (const boundaryDistance of ABSENT_BOUNDARY_DISTANCES) {
    for (const boundaryAngle of ABSENT_BOUNDARY_ANGLES) {
      for (const energy of ABSENT_ENERGIES) {
        probes.push({
          index: index++,
          group: 'food-absent',
          input: [0, 0, 0, boundaryDistance, boundaryAngle, energy],
        });
      }
    }
  }

  for (const p of probes) {
    if (p.input.length !== NEURAL_INPUT_SIZE) {
      throw new Error(`probe ${p.index}: expected ${NEURAL_INPUT_SIZE} inputs (§11.58), got ${p.input.length}`);
    }
  }

  return probes;
}

function contentHashOf(probes: readonly ProbeState[]): string {
  return hash64(JSON.stringify(probes.map((p) => p.input)));
}

const PROBES_V1 = buildProbesV1();

/** The frozen v1 probe set. 250 states (§11.38 [BASELINE] ~250). */
export const PROBE_SET_V1: ProbeSet = Object.freeze({
  probeSetId: 'probe-set-v1',
  probeSetVersion: 1,
  probes: Object.freeze(PROBES_V1),
  contentHash: contentHashOf(PROBES_V1),
});

/** The probe set used unless a caller explicitly supplies another one. */
export const DEFAULT_PROBE_SET: ProbeSet = PROBE_SET_V1;
