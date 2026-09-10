/**
 * Installing a test-only movement policy into a freshly bootstrapped world
 * (Spec v4 §16.9).
 *
 * This is **world construction, not observation**. It runs exactly once,
 * between `bootstrapWorld` and tick 1, and it is the only thing that
 * distinguishes a policy condition from the reference condition.
 *
 * What it replaces: each organism's neural genome, and nothing else.
 * What it preserves, byte for byte: organism ids, lineage metadata, positions,
 * headings, energy, age, alive/death fields, the entire morphology genome, the
 * food list, the fertility field, the tick counter, the id counters, and both
 * RNG stream states. Morphology is preserved deliberately — `size` and
 * `metabolism` are inputs to the energy model under measurement, so a policy
 * agent must carry exactly the morphology its seed produced.
 *
 * It never mutates the world it is given: new organism objects and a new
 * WorldState are returned, so the caller's bootstrap world is untouched. This
 * keeps the "genome is immutable during an organism's lifetime" invariant
 * intact — a policy organism's genome is fixed before its life begins and
 * never changes afterwards.
 *
 * No RNG is consumed. The canonical stream is untouched until the first tick,
 * exactly as after an ordinary bootstrap.
 */

import type { NeuralGenome, SimulationConfig, WorldState } from '@alo/simulation-core';
import { movementPolicyGenome, MovementPolicyId, MovementPolicyOptions } from './movementPolicies.js';

/** Return a new world in which every organism runs `neural`. */
export function installNeuralGenome(world: WorldState, neural: NeuralGenome): WorldState {
  return {
    ...world,
    organisms: world.organisms.map((o) => ({
      ...o,
      genome: { morphology: o.genome.morphology, neural },
    })),
  };
}

/** Build the policy genome for this config and install it. */
export function installMovementPolicy(
  world: WorldState,
  config: SimulationConfig,
  policyId: MovementPolicyId,
  options: MovementPolicyOptions = {}
): WorldState {
  const neural = movementPolicyGenome(
    policyId,
    config.neural.hiddenLayerSize,
    config.neural.neuralParamBounds,
    options
  );
  return installNeuralGenome(world, neural);
}
