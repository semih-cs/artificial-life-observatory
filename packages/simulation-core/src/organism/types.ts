import { Genome } from '../genome/types.js';

/** Phase 0A death causes (§12.28, §12.30). */
export type DeathCause = 'ENERGY_DEPLETION' | 'MAX_AGE';

/**
 * Runtime (per-tick, mutable) organism state — structurally separate from
 * the heritable Genome (§9.6-§9.9). Update logic in `biology/` mutates
 * fields on this object; it must never reach into `genome` and mutate it.
 *
 * Lineage metadata (§9.26-§9.29, §13.42):
 *   founder/bootstrap organism -> parentId = null, generationDepth = 0,
 *                                 lineageRootId = own id
 *   child                      -> parentId = parent.id,
 *                                 generationDepth = parent.generationDepth + 1,
 *                                 lineageRootId = parent.lineageRootId
 */
export interface OrganismRuntimeState {
  id: number;
  readonly genome: Genome;
  /** null for founder/bootstrap organisms (§9.44-§9.45). */
  parentId: number | null;
  generationDepth: number;
  lineageRootId: number;
  birthTick: number;
  x: number;
  y: number;
  /** heading in radians, [0, 2*PI) */
  heading: number;
  energy: number;
  age: number;
  alive: boolean;
  deathCause: DeathCause | null;
  deathTick: number | null;
  /**
   * Recurrent models 0A.4.0 and later: the controller's runtime memory h_(t-1), one
   * value per hidden unit. Runtime state, NOT genome: it starts at all zeros
   * for founders and newborns, is never inherited, never mutated by the
   * mutation channels, and is advanced only by the Decide phase — once per
   * tick in which the organism acts. It is future-affecting, so it is part of
   * the canonical state and of the model's snapshot format. Feed-forward models
   * (0A.1.0-0A.3.0) do not have this key at all. Never a sensory input, never
   * visible to other organisms, never in observer frames.
   */
  hiddenState?: number[];
  /** V2.5 runtime phenotype state; absent from every historical model. */
  hiddenOutputWeightOffsets?: number[];
  outputBiasOffsets?: number[];
  hiddenOutputEligibilityTraces?: number[];
  outputBiasEligibilityTraces?: number[];
}

/**
 * Shallow-copy an organism's runtime state, sharing the (immutable) genome by
 * reference. Used by the tick pipeline's Snapshot phase so that resolution
 * writes to fresh objects and the pre-tick state S_t is never modified.
 */
export function cloneRuntimeState(o: OrganismRuntimeState): OrganismRuntimeState {
  const clone: OrganismRuntimeState = {
    id: o.id,
    genome: o.genome,
    parentId: o.parentId,
    generationDepth: o.generationDepth,
    lineageRootId: o.lineageRootId,
    birthTick: o.birthTick,
    x: o.x,
    y: o.y,
    heading: o.heading,
    energy: o.energy,
    age: o.age,
    alive: o.alive,
    deathCause: o.deathCause,
    deathTick: o.deathTick,
  };
  // Only a recurrent organism carries memory; the copy is detached from S_t.
  if (o.hiddenState !== undefined) clone.hiddenState = [...o.hiddenState];
  if (o.hiddenOutputWeightOffsets !== undefined) clone.hiddenOutputWeightOffsets = [...o.hiddenOutputWeightOffsets];
  if (o.outputBiasOffsets !== undefined) clone.outputBiasOffsets = [...o.outputBiasOffsets];
  if (o.hiddenOutputEligibilityTraces !== undefined) clone.hiddenOutputEligibilityTraces = [...o.hiddenOutputEligibilityTraces];
  if (o.outputBiasEligibilityTraces !== undefined) clone.outputBiasEligibilityTraces = [...o.outputBiasEligibilityTraces];
  return clone;
}

/** A fresh all-zero recurrent hidden state (founders and newborns of a recurrent model). */
export function zeroHiddenState(hiddenSize: number): number[] {
  return new Array<number>(hiddenSize).fill(0);
}

export function initializePlasticityState(hiddenSize: number, outputSize: number): Pick<OrganismRuntimeState,
  'hiddenOutputWeightOffsets' | 'outputBiasOffsets' | 'hiddenOutputEligibilityTraces' | 'outputBiasEligibilityTraces'> {
  return {
    hiddenOutputWeightOffsets: new Array(hiddenSize * outputSize).fill(0),
    outputBiasOffsets: new Array(outputSize).fill(0),
    hiddenOutputEligibilityTraces: new Array(hiddenSize * outputSize).fill(0),
    outputBiasEligibilityTraces: new Array(outputSize).fill(0),
  };
}

export function isAlive(o: OrganismRuntimeState): boolean {
  return o.alive;
}

/** Maturity (§12.36): global, non-heritable, tick-based. */
export function isMature(o: OrganismRuntimeState, maturityAge: number): boolean {
  return o.age >= maturityAge;
}
