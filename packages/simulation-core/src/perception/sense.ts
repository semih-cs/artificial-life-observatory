import { OrganismRuntimeState } from '../organism/types.js';
import { FoodItem, WorldConfigSnapshot } from '../world/types.js';
import { NEURAL_INPUT_SIZE } from '../genome/types.js';

export interface SenseContext {
  world: WorldConfigSnapshot;
  food: readonly FoodItem[];
  /** energy / energyCapacity normalization divisor (§9.17-§9.18); a
   * world/config-level constant in Phase 0A, not yet a per-organism gene. */
  energyCapacity: number;
}

/** Normalize an angle to (-PI, PI]. */
function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  if (r <= -Math.PI) r += 2 * Math.PI;
  return r;
}

/** Shared bearing convention (§11.58): atan2 relative to heading, wrapped to
 * (-PI, PI], normalized by /PI to (-1, 1]. Positive = clockwise/right. */
function relativeBearingNormalized(dx: number, dy: number, heading: number): number {
  const absoluteAngle = Math.atan2(dy, dx);
  const relative = wrapAngle(absoluteAngle - heading);
  return relative / Math.PI;
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

interface FoodCandidate {
  food: FoodItem;
  dist: number;
  angle: number; // absolute bearing, unwrapped, used only for visionAngle test
}

/**
 * Nearest visible food selection (§11.58). "Nearest" = minimum Euclidean
 * distance among food within visionRange and within +-visionAngle/2 of
 * heading (boundary inclusive). Exact-distance ties broken by ascending
 * food ID (same convention as food-competition, §20.72).
 */
function findNearestVisibleFood(organism: OrganismRuntimeState, food: readonly FoodItem[]): FoodCandidate | null {
  const { x, y, heading } = organism;
  const { visionRange, visionAngle } = organism.genome.morphology;
  const halfAngle = visionAngle / 2;

  let best: FoodCandidate | null = null;
  for (const f of food) {
    const d = distance(x, y, f.x, f.y);
    if (d > visionRange) continue;
    // At zero distance the bearing is mathematically undefined (atan2(0,0));
    // per §11.58's zero-distance convention this is never gated by the
    // vision-angle test — an organism exactly on a food item can always see it.
    const absoluteAngle = Math.atan2(f.y - y, f.x - x);
    const rel = Math.abs(wrapAngle(absoluteAngle - heading));
    if (d > 0 && rel > halfAngle) continue; // boundary is inclusive: rel === halfAngle passes

    if (best === null || d < best.dist || (d === best.dist && f.id < best.food.id)) {
      best = { food: f, dist: d, angle: absoluteAngle };
    }
  }
  return best;
}

/** Nearest point on the world's rectangular perimeter, with fixed
 * top/right/bottom/left edge-priority tie-break on exact corner ties (§11.58). */
function nearestBoundaryPoint(x: number, y: number, world: WorldConfigSnapshot): { px: number; py: number } {
  const distTop = y;
  const distBottom = world.height - y;
  const distLeft = x;
  const distRight = world.width - x;

  const candidates: { name: 'top' | 'right' | 'bottom' | 'left'; d: number; px: number; py: number }[] = [
    { name: 'top', d: distTop, px: x, py: 0 },
    { name: 'right', d: distRight, px: world.width, py: y },
    { name: 'bottom', d: distBottom, px: x, py: world.height },
    { name: 'left', d: distLeft, px: 0, py: y },
  ];

  const priority: Record<string, number> = { top: 0, right: 1, bottom: 2, left: 3 };
  let bestIdx = 0;
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i]!;
    const b = candidates[bestIdx]!;
    if (c.d < b.d || (c.d === b.d && priority[c.name]! < priority[b.name]!)) {
      bestIdx = i;
    }
  }
  const chosen = candidates[bestIdx]!;
  return { px: chosen.px, py: chosen.py };
}

/**
 * Compute the §11.58 six-input sensory vector for one organism. Pure
 * function of (organism, world snapshot) — no RNG, no mutation.
 *
 * input[0] foodVisible, input[1] foodDistance, input[2] foodAngle,
 * input[3] boundaryDistance, input[4] boundaryAngle, input[5] normalizedEnergy.
 * Each index has exactly one physical meaning; there is no duplicate
 * physiological input.
 */
export function senseOrganism(organism: OrganismRuntimeState, ctx: SenseContext): number[] {
  const { x, y, heading } = organism;
  const { visionRange } = organism.genome.morphology;

  const nearestFood = findNearestVisibleFood(organism, ctx.food);

  let foodVisible = 0;
  let foodDistance = 0;
  let foodAngle = 0;
  if (nearestFood) {
    foodVisible = 1;
    foodDistance = clamp01(nearestFood.dist / visionRange);
    foodAngle = nearestFood.dist === 0 ? 0 : relativeBearingNormalized(ctx_dx(nearestFood, x), ctx_dy(nearestFood, y), heading);
  }

  const { px, py } = nearestBoundaryPoint(x, y, ctx.world);
  const boundaryDist = distance(x, y, px, py);
  const halfShorterDim = Math.min(ctx.world.width, ctx.world.height) / 2;
  const boundaryDistance = clamp01(boundaryDist / halfShorterDim);
  const boundaryAngle = boundaryDist === 0 ? 0 : relativeBearingNormalized(px - x, py - y, heading);

  const normalizedEnergy = clamp01(organism.energy / ctx.energyCapacity);

  const input = new Array<number>(NEURAL_INPUT_SIZE);
  input[0] = foodVisible;
  input[1] = foodDistance;
  input[2] = foodAngle;
  input[3] = boundaryDistance;
  input[4] = boundaryAngle;
  input[5] = normalizedEnergy;
  return input;
}

function ctx_dx(c: FoodCandidate, x: number): number {
  return c.food.x - x;
}
function ctx_dy(c: FoodCandidate, y: number): number {
  return c.food.y - y;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
