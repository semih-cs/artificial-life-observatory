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

export interface FoodAcquisitionResult {
  /** organismId -> foodId acquired this tick (at most one per organism, at most one holder per item). */
  acquisitions: Map<number, number>;
  /** food IDs that gained a holder this tick. */
  acquiredFoodIds: Set<number>;
}

/**
 * V2.4 food acquisition (model 0A.6.0). This is `resolveFeeding` above with
 * exactly the same competition semantics — among organisms that requested eat
 * and are within `feedingRange` of a given free item, the item goes to the
 * NEAREST one; exact-distance ties are broken by ascending organism ID; items
 * are visited in ascending food ID order; each organism takes at most one item
 * per tick — and one extra eligibility rule:
 *
 *   an organism that is ALREADY handling an item cannot acquire another.
 *
 * No new competition score, no size term, no ownership, no randomness. The
 * only difference from instantaneous feeding is what winning means: the winner
 * begins handling the item (progress 1) instead of consuming it.
 *
 * `food` must already be filtered to the items that are eligible this tick:
 * free, not consumed this tick, and not released this tick (a dislodged or
 * voluntarily dropped item cannot be reacquired until the next tick).
 */
export function resolveFoodAcquisition(
  organisms: readonly OrganismRuntimeState[],
  intents: ReadonlyMap<number, ActionIntent>,
  food: readonly FoodItem[],
  feedingRange: number,
  alreadyHolding: ReadonlySet<number>
): FoodAcquisitionResult {
  const acquisitions = new Map<number, number>();
  const acquiredFoodIds = new Set<number>();
  const claimedOrganismIds = new Set<number>();

  const sortedFood = [...food].sort((a, b) => a.id - b.id);

  for (const item of sortedFood) {
    let winner: OrganismRuntimeState | null = null;
    let winnerDist = Infinity;

    for (const o of organisms) {
      if (!o.alive) continue;
      if (alreadyHolding.has(o.id)) continue; // one held item per organism
      if (claimedOrganismIds.has(o.id)) continue; // already acquired this tick
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
      acquisitions.set(winner.id, item.id);
      acquiredFoodIds.add(item.id);
      claimedOrganismIds.add(winner.id);
    }
  }

  return { acquisitions, acquiredFoodIds };
}
