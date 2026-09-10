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
}

/**
 * Shallow-copy an organism's runtime state, sharing the (immutable) genome by
 * reference. Used by the tick pipeline's Snapshot phase so that resolution
 * writes to fresh objects and the pre-tick state S_t is never modified.
 */
export function cloneRuntimeState(o: OrganismRuntimeState): OrganismRuntimeState {
  return {
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
}

export function isAlive(o: OrganismRuntimeState): boolean {
  return o.alive;
}

/** Maturity (§12.36): global, non-heritable, tick-based. */
export function isMature(o: OrganismRuntimeState, maturityAge: number): boolean {
  return o.age >= maturityAge;
}
