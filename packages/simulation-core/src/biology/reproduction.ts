import { OrganismRuntimeState, isMature } from '../organism/types.js';
import { EnergyConfig, LifecycleConfig } from '../config/types.js';

/**
 * Reproduction eligibility (§12.35, §20.72 phase 9).
 *
 * ALL FOUR conditions are required:
 *   alive
 *   AND age >= maturityAge          (§12.36 — biological maturity)
 *   AND energy >= reproductionEnergyThreshold  (§12.37, using post-feeding energy)
 *   AND reproduceRequested           (§12.39, neural intent, >= comparator [LOCKED])
 *
 * A neural output requesting reproduction is never sufficient on its own: an
 * immature organism cannot reproduce at any energy level, which is what stops
 * an organism reproducing on tick 1 simply because its controller asked.
 */
export function isReproductionEligible(
  organism: OrganismRuntimeState,
  reproduceRequested: boolean,
  energyConfig: EnergyConfig,
  lifecycle: LifecycleConfig
): boolean {
  if (!organism.alive) return false;
  if (!isMature(organism, lifecycle.maturityAge)) return false;
  if (organism.energy < energyConfig.reproductionEnergyThreshold) return false;
  return reproduceRequested;
}

/**
 * Parent reproduction cost (§20.72 phase 11, §12.40).
 *
 * Deducted in full and NOT floored at zero: if this takes the parent to or
 * below zero it is caught by the ordinary death check in phase 16, which is
 * the specified behaviour — dying immediately after reproducing is a
 * legitimate outcome, not a special case.
 */
export function applyParentReproductionCost(organism: OrganismRuntimeState, energyConfig: EnergyConfig): void {
  organism.energy -= energyConfig.reproductionCost;
}
