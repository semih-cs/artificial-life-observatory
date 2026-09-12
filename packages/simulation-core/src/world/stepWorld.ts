import { WorldState, FoodItem } from './types.js';
import { SimulationConfig } from '../config/types.js';
import { RngStream, RngStreams } from '../rng/rngStream.js';
import { Xoshiro128State } from '../rng/xoshiro128starstar.js';
import { SenseContext } from '../perception/sense.js';
import { decideAction, decideRecurrentAction } from '../actions/decide.js';
import { ActionIntent } from '../actions/types.js';
import { resolveMovement, movementEnergyCost } from '../biology/movement.js';
import { resolveBodyOverlap } from '../biology/physicalBody.js';
import { basalEnergyCost, applyEnergyDelta, evaluateDeath } from '../biology/energy.js';
import { resolveFeeding } from './foodCompetition.js';
import { isReproductionEligible, applyParentReproductionCost } from '../biology/reproduction.js';
import { createOffspring } from './offspring.js';
import { regenerateFood } from './foodRegen.js';
import { computeTickTelemetry, TickTelemetry } from '../telemetry/types.js';
import { OrganismRuntimeState, cloneRuntimeState } from '../organism/types.js';
import { simulationModel } from '../model/simulationModel.js';

export interface StepResult {
  world: WorldState;
  telemetry: TickTelemetry;
}

function rngStreamFromState(state: Xoshiro128State, purpose: 'bootstrap' | 'canonical'): RngStream {
  // The seed argument is irrelevant: setState immediately replaces the
  // generator's internal words with the caller-supplied snapshot.
  const stream = new RngStream(1, purpose);
  stream.setState(state);
  return stream;
}

function makeRngStreamsFromState(state: WorldState): RngStreams {
  return {
    bootstrap: rngStreamFromState(state.rng.bootstrap, 'bootstrap'),
    canonical: rngStreamFromState(state.rng.canonical, 'canonical'),
  };
}

/**
 * The Sense-phase context for a world snapshot S_t (§20.72 phase 1): food,
 * world bounds and the energy normalizer for every model; for a model with
 * organism sensing (0A.3.0) also the S_t organism array itself — never a
 * copy that resolution could have touched — and the authoritative morphology
 * size bounds `bootstrap.geneBounds.size`. Pure: reads only.
 */
export function senseContextFor(state: WorldState, config: SimulationConfig): SenseContext {
  const model = simulationModel(state.simulationVersion);
  return {
    world: state.worldConfig,
    food: state.food,
    energyCapacity: config.energy.energyCapacity,
    ...(model.organismSensing
      ? { organisms: { snapshot: state.organisms, sizeBounds: config.bootstrap.geneBounds.size } }
      : {}),
  };
}

/**
 * Normative Phase 0A tick function (§20.72, [LOCKED] phase order).
 *
 * The twenty specified phases, in order, with the code laid out so the phase
 * boundaries are visible rather than hidden inside per-organism methods:
 *
 *    1 Snapshot                       11 Parent reproduction cost
 *    2 Sense                          12-15 Child creation / mutation / placement
 *    3 Decide -> ActionIntent         16 Death resolution (energy + age together)
 *    4 Movement resolution            17 Births/removals become active
 *    5 Movement energy expenditure    18 Food regeneration
 *    6-7 Feeding & food competition   19 Telemetry (read-only)
 *    8 Energy gain                    20 Advance tick
 *    9 Reproduction eligibility
 *   10 Reproduction intent resolution
 *
 * V2.3 (model 0A.5.0 only) inserts two position-only steps into Resolve, and
 * changes nothing else about the order:
 *
 *    4b Body overlap resolution        after movement, BEFORE feeding, so
 *                                      feeding uses post-collision positions
 *   17b Body overlap resolution        after births become active, so a
 *                                      newborn never persists inside a body
 *
 * Both are pure displacement: no energy, no damage, no event, no RNG, no
 * extra decision and no change to any organism's memory. Models 0A.1.0-0A.4.0
 * skip them entirely and behave exactly as they always have.
 *
 * Consequences that are specified, not incidental:
 *   - there is exactly ONE death check per tick (phase 16), after every
 *     energy-affecting phase, so same-tick feeding can rescue an organism that
 *     movement cost would otherwise have killed;
 *   - reproduction eligibility (phase 9) reads post-feeding energy, so a
 *     rescued organism may also reproduce in that same tick;
 *   - newborns exist in world state from phase 17 but do not sense, decide or
 *     act until the next tick — they were not part of S_t;
 *   - no phase uses container iteration position as conflict priority. All
 *     ordering is by explicit organism or food ID.
 */
export function stepWorld(state: WorldState, config: SimulationConfig): StepResult {
  // The world's model decides its sensory contract. A world is only ever
  // stepped under its own model's configuration: a mismatch would evaluate
  // genomes under another model's input layout, so it is refused.
  if (state.simulationVersion !== config.simulationVersion) {
    throw new Error(
      `stepWorld: world is ${state.simulationVersion} but config is ${config.simulationVersion}; ` +
        'a world is never stepped under another model'
    );
  }
  const model = simulationModel(state.simulationVersion);

  const streams = makeRngStreamsFromState(state);
  const canonical = streams.canonical;

  // ---- Phase 1: Snapshot -------------------------------------------------
  // S_t is the state as received. Sensing reads only this: food positions, the
  // world config, and each organism's own pre-resolution state. Models 0A.1.0
  // and 0A.2.0 have no organism-to-organism sensing (§11.58). Model 0A.3.0
  // also reads the other organisms — but only from `state.organisms`, the S_t
  // array itself, which this tick never modifies (resolution writes to
  // clones). So no organism can observe another's in-progress movement, and
  // sensing does not depend on the order in which organisms decide.
  const senseCtx = senseContextFor(state, config);

  // Resolution writes to fresh objects: the caller's WorldState — the S_t this
  // tick reads from — is never modified, so an earlier world remains a valid,
  // replayable state after stepping forward from it.
  const workingOrganisms = state.organisms.map(cloneRuntimeState);
  const living = workingOrganisms.filter((o) => o.alive);

  // ---- Phases 2-3: Sense, Decide, buffer ActionIntent --------------------
  // Pure. No world/organism state is mutated here and no RNG is consumed.
  //
  // Recurrent model (0A.4.0): each organism's previous hidden state is read
  // from its pre-decision copy (equal to S_t — nothing has been modified yet),
  // and its new hidden state is BUFFERED with its intent. Only after every
  // living organism has decided are the new states written to the working
  // copies — once per acting tick. No organism can see another's updated
  // memory (hidden state is never a sensory input anyway), and newborns,
  // who are not in `living`, keep their zero state until their first tick.
  const intents = new Map<number, ActionIntent>();
  const hiddenSize = config.neural.hiddenLayerSize;
  if (model.recurrent) {
    const nextHidden = new Map<number, number[]>();
    for (const o of living) {
      const decision = decideRecurrentAction(o, senseCtx, config.neural, hiddenSize, model.neuralInputSize);
      intents.set(o.id, decision.intent);
      nextHidden.set(o.id, decision.hiddenState);
    }
    for (const o of living) o.hiddenState = nextHidden.get(o.id)!;
  } else {
    for (const o of living) {
      intents.set(o.id, decideAction(o, senseCtx, config.neural, hiddenSize, model.neuralInputSize));
    }
  }

  // ---- Phases 4-5: Movement resolution, then movement energy expenditure --
  // Movement cost uses the ACTUAL resolved displacement returned by
  // resolveMovement, not the requested speed, so a wall-blocked request is not
  // charged for distance never covered. Basal metabolism is a separate term.
  // Age advances here as part of the per-tick physiological update; phase 16
  // reads the advanced value.
  for (const o of living) {
    const intent = intents.get(o.id);
    if (!intent) continue;
    const actualVelocity = resolveMovement(o, intent, state.worldConfig);
    const moveCost = movementEnergyCost(actualVelocity, o.genome.morphology.size, config.energy.movementEnergyCoefficient);
    const basalCost = basalEnergyCost(o.genome.morphology.metabolism, config.energy.baseMetabolicConstant);
    applyEnergyDelta(o, -(moveCost + basalCost), config.energy.energyCapacity);
    o.age += 1;
  }

  // ---- Phase 4b (V2.3, model 0A.5.0 only): body overlap resolution -------
  // Movement has just had its physical consequence. Bodies that ended the
  // movement step overlapping are pushed apart along the line joining their
  // centres, the larger body moving less (biology/physicalBody.ts). It is
  // deterministic, RNG-free and independent of array order, it changes
  // positions and nothing else, and it happens BEFORE feeding — so being
  // displaced can move an organism into, or out of, feeding range. That
  // consequence is intended. It cannot influence this tick's sensing or
  // decisions: both are already complete and both read S_t, which is never
  // modified.
  if (model.physicalBodies) resolveBodyOverlap(living, state.worldConfig, config);

  // ---- Phases 6-7: Feeding & food competition ---------------------------
  // Deterministic and RNG-free: nearest eligible eater wins each food item,
  // exact-distance ties broken by ascending organism ID, food processed in
  // ascending food ID order, at most one food item per organism per tick.
  const feeding = resolveFeeding(living, intents, state.food, config.food.feedingRange);
  const remainingFood: FoodItem[] = state.food.filter((f) => !feeding.consumedFoodIds.has(f.id));

  // ---- Phase 8: Energy gain ---------------------------------------------
  // This is what makes feeding rescue possible: an organism taken below zero
  // by phase 5 is credited here, before death is ever evaluated.
  for (const o of living) {
    if (feeding.consumptions.has(o.id)) {
      applyEnergyDelta(o, config.energy.foodEnergyValue, config.energy.energyCapacity);
    }
  }

  // ---- Phase 9: Reproduction eligibility --------------------------------
  // Evaluated AFTER energy gain (so same-tick feeding can enable reproduction)
  // and requires maturity: alive AND age >= maturityAge AND energy >= threshold
  // AND reproduceRequested.
  const eligibleParents = living
    .filter((o) => {
      const intent = intents.get(o.id);
      if (!intent) return false;
      return isReproductionEligible(o, intent.reproduceRequested, config.energy, config.lifecycle);
    })
    .sort((a, b) => a.id - b.id);

  // ---- Phases 10-15: Reproduction resolution, cost, child construction ---
  // Strictly ascending parent-ID order, each parent's full child draw sequence
  // completing before the next parent begins, so canonical RNG consumption is
  // a pure function of organism IDs and never of array position.
  const children: OrganismRuntimeState[] = [];
  let nextOrganismId = state.nextOrganismId;
  const birthTick = state.tick + 1;
  for (const parent of eligibleParents) {
    const child = createOffspring(parent, nextOrganismId, birthTick, canonical, config, state.worldConfig);
    nextOrganismId += 1;
    children.push(child);
    applyParentReproductionCost(parent, config.energy); // phase 11
  }

  // ---- Phase 16: Death resolution (energy + age, one combined pass) ------
  let deaths = 0;
  for (const o of living) {
    const cause = evaluateDeath(o, config.lifecycle);
    if (cause !== null) {
      o.alive = false;
      o.deathCause = cause;
      o.deathTick = state.tick;
      // Energy is not left meaningfully negative after death resolution (§12.29).
      if (o.energy < 0) o.energy = 0;
      deaths += 1;
    }
  }

  // ---- Phase 17: Births/removals become active --------------------------
  // Children join world state now but were not part of S_t, so they did not
  // sense, decide or act this tick. Dead organisms leave the active set.
  const survivors = workingOrganisms.filter((o) => o.alive);
  const allOrganisms = [...survivors, ...children].sort((a, b) => a.id - b.id);

  // ---- Phase 17b (V2.3, model 0A.5.0 only): newborn body separation ------
  // Offspring placement is unchanged (the same polar offset, the same two
  // canonical draws), so a newborn can land inside its parent or a neighbour.
  // Rather than inventing a birth-time search, a reproduction failure or any
  // parent-specific rule, the SAME passive separation rule is applied once to
  // the post-birth living population. The newborn gets no extra neural
  // action, its memory stays exactly zero, no RNG is drawn and no genome is
  // touched — only positions move.
  if (model.physicalBodies) resolveBodyOverlap(allOrganisms, state.worldConfig, config);

  // ---- Phase 18: Food regeneration --------------------------------------
  // Canonical RNG serves this only after every reproduction-related draw for
  // this tick has been consumed.
  const regen = regenerateFood(
    state.worldConfig,
    state.fertility,
    canonical,
    config.food,
    remainingFood,
    state.nextFoodId
  );
  const allFood = [...remainingFood, ...regen.newFood].sort((a, b) => a.id - b.id);

  // ---- Phase 19: Telemetry (read-only) ----------------------------------
  const meanEnergy = allOrganisms.length > 0 ? allOrganisms.reduce((s, o) => s + o.energy, 0) / allOrganisms.length : 0;
  const meanAge = allOrganisms.length > 0 ? allOrganisms.reduce((s, o) => s + o.age, 0) / allOrganisms.length : 0;
  const telemetry = computeTickTelemetry(
    state.tick + 1,
    allOrganisms.length,
    allFood.length,
    children.length,
    deaths,
    meanEnergy,
    meanAge
  );

  // ---- Phase 20: Advance tick -------------------------------------------
  const newWorld: WorldState = {
    tick: state.tick + 1,
    simulationVersion: state.simulationVersion,
    worldConfig: state.worldConfig,
    fertility: state.fertility, // static: never regenerated, never mutated
    organisms: allOrganisms,
    food: allFood,
    nextOrganismId,
    nextFoodId: regen.nextFoodId,
    rng: { bootstrap: streams.bootstrap.getState(), canonical: canonical.getState() },
  };

  return { world: newWorld, telemetry };
}
