import { OrganismRuntimeState } from '../organism/types.js';
import { ActionIntent } from '../actions/types.js';
import { SimulationConfig, FoodHandlingConfig } from '../config/types.js';
import { FoodItem } from './types.js';
import { simulationModel } from '../model/simulationModel.js';
import { resolveFoodAcquisition } from './foodCompetition.js';

/**
 * V2.4 — contestable food handling (model 0A.6.0).
 *
 * Eating is no longer instantaneous. An organism must handle a food item for
 * `handling.ticksRequired` CONSECUTIVE ticks before receiving its energy;
 * meanwhile the item travels with the handler and can be knocked loose by
 * genuine physical contact with another organism.
 *
 * What this is NOT: there is no grab, release, steal, defend, attack, carry or
 * share action, no new sensory input and no new neural output. The EXISTING
 * `eat` output drives the whole process:
 *
 *   not holding + eatRequested  -> try to acquire an eligible free item
 *   holding     + eatRequested  -> continue handling the held item
 *   holding     + !eatRequested -> release it here and now, progress reset
 *
 * There is no damage, no energy transfer between organisms, no ownership
 * recognition, no food-defence rule, no inventory and no storage: a completed
 * item is consumed immediately and holding ends.
 *
 * All handling state lives on the FOOD item (`holderId`, `handlingProgress`),
 * not on the organism, so "one holder per item" is structural rather than a
 * rule that has to be enforced. "One item per organism" is enforced by
 * acquisition eligibility.
 */

/** One organism's newly acquired item, or a completed consumption — the tick's outcome for it. */
export interface FoodHandlingResult {
  /** Food ids consumed this tick (handling reached `ticksRequired`). Removed from the world. */
  consumedFoodIds: Set<number>;
  /** Organism ids whose handling completed this tick; they are credited the ordinary food energy in phase 8. */
  completedOrganismIds: Set<number>;
  /** Food ids acquired this tick (progress set to 1). Diagnostic; the state itself is on the items. */
  acquiredFoodIds: Set<number>;
  /** Food ids released this tick, voluntarily or by dislodgement. They are NOT reacquirable this tick. */
  releasedFoodIds: Set<number>;
  /** Food ids released specifically because their holder met another body in the active resolution. */
  dislodgedFoodIds: Set<number>;
}

/**
 * The handling configuration of a model that has food handling. Throws for any
 * model that does not: instantaneous feeding has no handling contract at all,
 * and asking for one is a programming error, never a silently defaulted value.
 */
export function requireFoodHandlingConfig(config: SimulationConfig): FoodHandlingConfig {
  if (!simulationModel(config.simulationVersion).foodHandling) {
    throw new Error(
      `food handling: model ${config.simulationVersion} eats instantaneously; ` +
        'only 0A.6.0 and later handling models have a handling contract'
    );
  }
  const handling = config.handling;
  if (handling === undefined) {
    throw new Error(`food handling: model ${config.simulationVersion} requires a handling configuration`);
  }
  return handling;
}

/** True when this item is currently being handled by some organism. */
export function isHeld(f: FoodItem): boolean {
  return f.holderId !== undefined && f.holderId !== null;
}

/** Free a food item: no holder, no progress. Used on release, dislodgement, holder death and completion. */
export function releaseFood(f: FoodItem): void {
  f.holderId = null;
  f.handlingProgress = 0;
}

/**
 * Resolve one tick of food handling, in place, over the working food array.
 * Called from the Resolve phase AFTER movement and AFTER the active body
 * overlap resolution, and BEFORE the energy-gain phase — so handling uses
 * post-movement, post-collision physical positions, exactly as instantaneous
 * feeding does in 0A.5.0.
 *
 * The order inside this function is the externally observable contract:
 *
 *   1. Held items follow their holder's RESOLVED position. (A held item whose
 *      holder is no longer among the living is freed here as a safety net; the
 *      normal path frees a dying holder's item at phase 16.)
 *   2. Drops. A holder that did not request eat releases its item here and
 *      now; a holder that met another body during the ACTIVE resolution has
 *      its item dislodged. Both reset progress to 0 and leave the item free at
 *      the holder's resolved position. Contact and choice are indistinguishable
 *      afterwards: there is no theft, no recipient and no event.
 *   3. Progress. Every item still held advances by exactly one.
 *   4. Completion. An item whose progress reaches `ticksRequired` is consumed:
 *      it leaves the world and its holder is credited the ordinary food energy
 *      in the unchanged phase 8. There is no bonus for handling longer and no
 *      way to keep a finished item.
 *   5. Acquisition. Every organism that is not holding anything and requested
 *      eat competes for the remaining FREE items under the existing food
 *      competition semantics (nearest wins, exact ties by ascending organism
 *      id, items visited in ascending food id order, at most one item per
 *      organism). An item released at step 2 is NOT eligible this tick — that
 *      is what makes drop/regrab ordering a non-question. An organism that
 *      completed at step 4 is no longer holding anything, so it may acquire,
 *      exactly as the order above implies.
 *
 * Deterministic and RNG-free throughout; the result depends on ids and
 * positions only, never on array order.
 */
export function resolveFoodHandling(
  living: readonly OrganismRuntimeState[],
  intents: ReadonlyMap<number, ActionIntent>,
  food: readonly FoodItem[],
  contacts: ReadonlySet<number>,
  config: SimulationConfig
): FoodHandlingResult {
  const handling = requireFoodHandlingConfig(config);
  const consumedFoodIds = new Set<number>();
  const completedOrganismIds = new Set<number>();
  const acquiredFoodIds = new Set<number>();
  const releasedFoodIds = new Set<number>();
  const dislodgedFoodIds = new Set<number>();

  const livingById = new Map<number, OrganismRuntimeState>();
  for (const o of living) if (o.alive) livingById.set(o.id, o);

  // Ascending food id: the same deterministic order every other food phase uses.
  const items = [...food].sort((a, b) => a.id - b.id);

  // ---- 1. held items follow their holder's resolved position -------------
  for (const f of items) {
    if (!isHeld(f)) continue;
    const holder = livingById.get(f.holderId as number);
    if (holder === undefined) {
      // Safety net only: the lifecycle frees a dying holder's item explicitly.
      releaseFood(f);
      releasedFoodIds.add(f.id);
      continue;
    }
    f.x = holder.x;
    f.y = holder.y;
  }

  // ---- 2. drops: voluntary release, or dislodged by active body contact ---
  for (const f of items) {
    if (!isHeld(f)) continue;
    const holderId = f.holderId as number;
    const intent = intents.get(holderId);
    const wantsToContinue = intent !== undefined && intent.eatRequested;
    const dislodged = contacts.has(holderId);
    if (wantsToContinue && !dislodged) continue;
    releaseFood(f);
    releasedFoodIds.add(f.id);
    if (dislodged) dislodgedFoodIds.add(f.id);
  }

  // ---- 3-4. advance progress, then complete ------------------------------
  for (const f of items) {
    if (!isHeld(f)) continue;
    const holderId = f.holderId as number;
    f.handlingProgress = (f.handlingProgress ?? 0) + 1;
    if (f.handlingProgress >= handling.ticksRequired) {
      consumedFoodIds.add(f.id);
      completedOrganismIds.add(holderId);
      releaseFood(f); // the item leaves the world; holding ends with it
    }
  }

  // ---- 5. acquisition of free items --------------------------------------
  // Ineligible items: still held, consumed this tick, or released this tick.
  // Ineligible organisms: dead, not requesting eat, or already holding.
  const holdersNow = new Set<number>();
  for (const f of items) if (isHeld(f)) holdersNow.add(f.holderId as number);

  const freeItems = items.filter(
    (f) => !isHeld(f) && !consumedFoodIds.has(f.id) && !releasedFoodIds.has(f.id)
  );
  const acquisition = resolveFoodAcquisition(
    living,
    intents,
    freeItems,
    config.food.feedingRange,
    holdersNow
  );
  for (const [organismId, foodId] of acquisition.acquisitions) {
    const item = items.find((f) => f.id === foodId)!;
    item.holderId = organismId;
    item.handlingProgress = 1; // acquisition IS the first handling tick
    acquiredFoodIds.add(foodId);
  }

  return { consumedFoodIds, completedOrganismIds, acquiredFoodIds, releasedFoodIds, dislodgedFoodIds };
}

/**
 * Free every item held by an organism that is no longer alive. Called once,
 * right after the single death-resolution pass (phase 16), so a holder that
 * dies mid-handling drops its item at its final position with progress reset.
 *
 * The item stays in the world and no food energy is granted: an unfinished
 * item is never destroyed just because its handler died, and death is never a
 * way to eat.
 */
export function releaseFoodOfDeadHolders(food: readonly FoodItem[], organisms: readonly OrganismRuntimeState[]): Set<number> {
  const aliveIds = new Set<number>();
  for (const o of organisms) if (o.alive) aliveIds.add(o.id);
  const released = new Set<number>();
  for (const f of food) {
    if (!isHeld(f)) continue;
    if (aliveIds.has(f.holderId as number)) continue;
    releaseFood(f);
    released.add(f.id);
  }
  return released;
}

/** Fresh handling state for a newly created food item of a food-handling model: free, no progress. */
export function freeHandlingState(): Pick<FoodItem, 'holderId' | 'handlingProgress'> {
  return { holderId: null, handlingProgress: 0 };
}
