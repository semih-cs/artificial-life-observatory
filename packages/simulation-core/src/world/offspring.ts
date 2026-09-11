import { OrganismRuntimeState } from '../organism/types.js';
import { RngStream } from '../rng/rngStream.js';
import { SimulationConfig } from '../config/types.js';
import { mutateGenome } from '../biology/mutation.js';
import { WorldConfigSnapshot } from './types.js';
import { zeroHiddenState } from '../organism/types.js';
import { simulationModel } from '../model/simulationModel.js';

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
 *
 * Recurrent model (0A.4.0): the child inherits the recurrent WEIGHTS through
 * its genome (and they mutate like every neural parameter), but NOT the
 * parent's memory: its runtime hidden state starts at all zeros. No RNG is
 * involved, so the draw order above is unchanged.
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

  const child: OrganismRuntimeState = {
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
  if (simulationModel(config.simulationVersion).recurrent) child.hiddenState = zeroHiddenState(config.neural.hiddenLayerSize);
  return child;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
