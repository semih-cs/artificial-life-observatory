/**
 * Functional neural distance (Spec v4 §11.40).
 *
 * §11.40 leaves the exact formula [OPEN] and names mean absolute difference
 * as one acceptable choice. The harness commits to mean absolute difference
 * over the four raw outputs, averaged across probes, and versions that choice
 * so a later change is visible in stored results.
 *
 * This is a DESCRIPTIVE distance between two controllers' responses to the
 * same fixed inputs. It is not a fitness measure, not a quality ordering, and
 * a larger distance does not mean "better", "worse", or "more intelligent".
 */

import type { ProbeEvaluation } from './evaluate.js';

export const FUNCTIONAL_DISTANCE_METHOD = 'mean-absolute-output-difference-v1';

export function functionalDistance(a: ProbeEvaluation, b: ProbeEvaluation): number {
  if (a.probeSetContentHash !== b.probeSetContentHash) {
    throw new Error('functionalDistance: evaluations come from different probe sets');
  }
  if (a.responses.length !== b.responses.length) {
    throw new Error('functionalDistance: response counts differ');
  }
  if (a.responses.length === 0) return 0;

  let total = 0;
  for (let i = 0; i < a.responses.length; i++) {
    const ra = a.responses[i]!;
    const rb = b.responses[i]!;
    total += (
      Math.abs(ra.forward - rb.forward) +
      Math.abs(ra.turn - rb.turn) +
      Math.abs(ra.eat - rb.eat) +
      Math.abs(ra.reproduce - rb.reproduce)
    ) / 4;
  }
  return total / a.responses.length;
}
