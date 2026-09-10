import { OrganismRuntimeState } from '../organism/types.js';
import { FoodItem } from './types.js';
import { ActionIntent } from '../actions/types.js';

export interface FeedingResult {
  /** organismId -> foodId consumed this tick (at most one per organism, per food item). */
  consumptions: Map<number, number>;
  /** food IDs removed this tick. */
  consumedFoodIds: Set<number>;
}

/**
 * Feeding / same-tick food competition (§20.72 phase 6). Deterministic:
 * among organisms that requested eat and are within feedingRange of a given
 * food item, the item goes to the nearest organism; exact-distance ties are
 * broken by ascending organism ID. Each food item is consumed at most once
 * per tick (per-tick single-food-consumption rule) and each organism
 * consumes at most one food item per tick.
 */
export function resolveFeeding(
  organisms: readonly OrganismRuntimeState[],
  intents: ReadonlyMap<number, ActionIntent>,
  food: readonly FoodItem[],
  feedingRange: number
): FeedingResult {
  const consumptions = new Map<number, number>();
  const consumedFoodIds = new Set<number>();
  const fedOrganismIds = new Set<number>();

  // Deterministic order: iterate food items by ascending ID so contention
  // resolution order is itself reproducible independent of array ordering.
  const sortedFood = [...food].sort((a, b) => a.id - b.id);

  for (const item of sortedFood) {
    let winner: OrganismRuntimeState | null = null;
    let winnerDist = Infinity;

    for (const o of organisms) {
      if (!o.alive) continue;
      if (fedOrganismIds.has(o.id)) continue; // already fed this tick
      const intent = intents.get(o.id);
      if (!intent || !intent.eatRequested) continue;
      const d = Math.hypot(o.x - item.x, o.y - item.y);
      if (d > feedingRange) continue;

      if (winner === null || d < winnerDist || (d === winnerDist && o.id < winner.id)) {
        winner = o;
        winnerDist = d;
      }
    }

    if (winner) {
      consumptions.set(winner.id, item.id);
      consumedFoodIds.add(item.id);
      fedOrganismIds.add(winner.id);
    }
  }

  return { consumptions, consumedFoodIds };
}
