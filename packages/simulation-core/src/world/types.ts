import { OrganismRuntimeState } from '../organism/types.js';
import { RngStreamsState } from '../rng/rngStream.js';
import { FertilityField } from './fertility.js';

export interface FoodItem {
  id: number;
  x: number;
  y: number;
  /**
   * Contestable food handling, model 0A.6.0 ONLY (V2.4): the id of the
   * organism currently handling this item, or `null` when the item is free.
   * Models without food handling do not have this key at all — never `null`
   * as a stand-in — exactly as feed-forward organisms have no `hiddenState`.
   *
   * Future-affecting state, so it is canonical and is stored in snapshot
   * format v3. A held item is still an ordinary world food item: it counts
   * towards the food cap, it is visible to the existing food sensing, and it
   * is never duplicated.
   */
  holderId?: number | null;
  /**
   * Model 0A.6.0 ONLY: consecutive successful handling ticks accumulated by
   * the current holder. Exactly 0 while the item is free; 1 on the tick it is
   * acquired; consumed when it reaches `handling.ticksRequired`. Resets to 0
   * on voluntary release, on dislodgement by body contact and on the holder's
   * death — there is no partial-progress carry-over.
   */
  handlingProgress?: number;
}

/**
 * Copy a food item so that resolution never writes to the pre-tick snapshot
 * S_t. Only a model with food handling needs this (its items carry mutable
 * position and handling state); for every other model food items are never
 * modified at all.
 */
export function cloneFoodItem(f: FoodItem): FoodItem {
  const clone: FoodItem = { id: f.id, x: f.x, y: f.y };
  if (f.holderId !== undefined) clone.holderId = f.holderId;
  if (f.handlingProgress !== undefined) clone.handlingProgress = f.handlingProgress;
  return clone;
}

export interface WorldConfigSnapshot {
  width: number;
  height: number;
}

/** Full canonical world state at a tick boundary (§19.4 shape, Phase 0A subset). */
export interface WorldState {
  tick: number;
  simulationVersion: string;
  worldConfig: WorldConfigSnapshot;
  /** Static, seeded, never mutated after initialization (§12.22). */
  fertility: FertilityField;
  organisms: OrganismRuntimeState[];
  food: FoodItem[];
  nextOrganismId: number;
  nextFoodId: number;
  rng: RngStreamsState;
}
