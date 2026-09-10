import { OrganismRuntimeState } from '../organism/types.js';
import { RngStream } from '../rng/rngStream.js';
import { SimulationConfig } from '../config/types.js';
import { mutateGenome } from '../biology/mutation.js';
import { WorldConfigSnapshot } from './types.js';

/**
 * Child construction (§20.72 steps 12-15, [LOCKED] draw order).
 *
 * Per parent, in ascending parent-ID order, the full sequence is:
 *   morphology mutation draws -> neural mutation draws -> placement
 *   (angle, then radius) -> heading -> energy (no RNG).
 *
 * Placement is a polar offset from the parent, clamped to world bounds.
 * Heading is an INDEPENDENT uniform draw, deliberately not inherited, to
 * avoid artificial directional clustering of siblings.
 *
 * Energy accounting (§12.41-§12.42):
 *   child.energy = birthEnergy   (NOT configuredInitialEnergy — that is the
 *                                 founder/bootstrap value and is a different
 *                                 configured quantity)
 *   the matching parent.energy -= reproductionCost is applied by the caller,
 *   with reproductionCost > birthEnergy enforced by validateConfig().
 */
export function createOffspring(
  parent: OrganismRuntimeState,
  id: number,
  birthTick: number,
  rng: RngStream,
  config: SimulationConfig,
  world: WorldConfigSnapshot
): OrganismRuntimeState {
  const genome = mutateGenome(
    parent.genome,
    rng,
    config.mutation,
    config.bootstrap.geneBounds,
    config.neural.neuralParamBounds
  );

  const angle = rng.nextInRange(0, 2 * Math.PI);
  const radius = rng.nextInRange(0, config.reproduction.maxOffspringOffset);
  const x = clamp(parent.x + Math.cos(angle) * radius, 0, world.width);
  const y = clamp(parent.y + Math.sin(angle) * radius, 0, world.height);

  const heading = rng.nextInRange(0, 2 * Math.PI);

  return {
    id,
    genome,
    parentId: parent.id,
    generationDepth: parent.generationDepth + 1,
    lineageRootId: parent.lineageRootId,
    birthTick,
    x,
    y,
    heading,
    energy: config.energy.birthEnergy,
    age: 0,
    alive: true,
    deathCause: null,
    deathTick: null,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
