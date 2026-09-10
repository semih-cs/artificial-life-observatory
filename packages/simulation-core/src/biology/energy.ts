import { OrganismRuntimeState, DeathCause } from '../organism/types.js';
import { EnergyConfig, LifecycleConfig } from '../config/types.js';

/**
 * Basal metabolic cost (§12.6): basalCost = metabolism * baseMetabolicConstant.
 * Charged every tick to every living organism, independently of movement.
 */
export function basalEnergyCost(metabolism: number, baseMetabolicConstant: number): number {
  return metabolism * baseMetabolicConstant;
}

/**
 * Apply an energy delta.
 *
 * Upper bound: energy is capped at energyCapacity (§12.4, §12.29).
 * Lower bound: NOT clamped here. Energy is allowed to go negative during the
 * tick so that the single death check (§20.72 phase 16) sees the true value,
 * and so a same-tick feeding rescue credits food against the real deficit
 * rather than against an artificially floored zero. Negative energy is
 * normalized to 0 at death resolution.
 */
export function applyEnergyDelta(organism: OrganismRuntimeState, delta: number, cap: number): void {
  organism.energy = Math.min(cap, organism.energy + delta);
}

/** Starvation death condition (§12.28): energy <= 0. */
export function isDeadByEnergy(organism: OrganismRuntimeState): boolean {
  return organism.energy <= 0;
}

/** Maximum-age death condition (§12.30, §8.24): age >= maxAge. */
export function isDeadByAge(organism: OrganismRuntimeState, lifecycle: LifecycleConfig): boolean {
  return organism.age >= lifecycle.maxAge;
}

/**
 * Combined death evaluation (§20.72 phase 16, [LOCKED]).
 *
 * Both conditions are checked together in one pass so their relative order
 * cannot matter. Returns the cause, or null if the organism survives.
 * Energy depletion is reported first when both hold; this affects only the
 * recorded cause label, never whether the organism dies.
 */
export function evaluateDeath(
  organism: OrganismRuntimeState,
  lifecycle: LifecycleConfig
): DeathCause | null {
  const starved = isDeadByEnergy(organism);
  const aged = isDeadByAge(organism, lifecycle);
  if (starved) return 'ENERGY_DEPLETION';
  if (aged) return 'MAX_AGE';
  return null;
}

/** Retained for callers that only need the boolean form. */
export function isDead(organism: OrganismRuntimeState, _energyConfig: EnergyConfig, lifecycle: LifecycleConfig): boolean {
  return evaluateDeath(organism, lifecycle) !== null;
}
