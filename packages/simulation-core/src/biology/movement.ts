import { OrganismRuntimeState } from '../organism/types.js';
import { WorldConfigSnapshot } from '../world/types.js';
import { ActionIntent } from '../actions/types.js';

/**
 * Movement resolution (§20.72 phase 4).
 *
 * Requested speed/turn are already phenotype-scaled by decide.ts. Position is
 * clamped to the world's hard boundary — organisms cannot cross the perimeter.
 *
 * Returns the ACTUAL resolved velocity (post-clamping displacement magnitude),
 * which is what phase 5 charges energy for. [LOCKED] §12.8: movement
 * expenditure depends on realized movement, not unused capacity, so an
 * organism whose forward request is absorbed by a wall pays for the distance
 * it actually covered, not the distance it asked for.
 */
export function resolveMovement(
  organism: OrganismRuntimeState,
  intent: ActionIntent,
  world: WorldConfigSnapshot
): number {
  organism.heading = wrapHeading(organism.heading + intent.requestedTurnRate);

  const startX = organism.x;
  const startY = organism.y;

  const targetX = startX + Math.cos(organism.heading) * intent.requestedForwardSpeed;
  const targetY = startY + Math.sin(organism.heading) * intent.requestedForwardSpeed;

  const newX = clamp(targetX, 0, world.width);
  const newY = clamp(targetY, 0, world.height);

  organism.x = newX;
  organism.y = newY;

  return Math.hypot(newX - startX, newY - startY);
}

/**
 * Movement energy cost (§20.72 phase 5; model from §12.7-§12.9, [LOCKED] shape):
 *
 *     movementCost = movementCoefficient * size * actualVelocity^2
 *
 * Nonlinear in velocity so speed is never a free advantage, and scaled by size
 * so the size gene has an immediate energetic consequence (§10.7-§10.8).
 * Basal metabolism is a SEPARATE per-tick charge (see biology/energy.ts) and is
 * deliberately not folded in here.
 */
export function movementEnergyCost(actualVelocity: number, size: number, movementCoefficient: number): number {
  return movementCoefficient * size * actualVelocity * actualVelocity;
}

export function wrapHeading(h: number): number {
  const twoPi = 2 * Math.PI;
  let r = h % twoPi;
  if (r < 0) r += twoPi;
  return r;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
