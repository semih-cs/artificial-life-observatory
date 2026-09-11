import { OrganismRuntimeState } from '../organism/types.js';
import { FoodItem, WorldConfigSnapshot } from '../world/types.js';
import { V1_NEURAL_INPUT_SIZE, ORGANISM_SENSING_NEURAL_INPUT_SIZE } from '../model/simulationModel.js';

export interface SenseContext {
  world: WorldConfigSnapshot;
  food: readonly FoodItem[];
  /** energy / energyCapacity normalization divisor (§9.17-§9.18); a
   * world/config-level constant in Phase 0A, not yet a per-organism gene. */
  energyCapacity: number;
  /**
   * Model 0A.3.0 only: organism sensing. When present, the Sense phase appends
   * the four nearest-visible-organism inputs (indices 6-9) to the six v1
   * inputs. When absent — models 0A.1.0 and 0A.2.0 — the vector is exactly the
   * historical six-input §11.58 vector. `stepWorld` sets it from the model
   * registry, never from anything else.
   */
  organisms?: OrganismSensingContext;
}

export interface OrganismSensingContext {
  /**
   * The authoritative pre-decision snapshot S_t of organisms. Candidates are
   * the members that are alive and are not the sensing organism itself
   * (compared by id). Nothing resolved during the tick is visible here.
   */
  snapshot: readonly OrganismRuntimeState[];
  /**
   * Authoritative morphology size bounds (`bootstrap.geneBounds.size`) — the
   * same bounds mutation clamps size to. organismRelativeSize is
   * (target.size - self.size) / (max - min), clamped to [-1, 1].
   */
  sizeBounds: { min: number; max: number };
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

export interface OrganismTarget {
  target: OrganismRuntimeState;
  dist: number;
}

/**
 * Nearest visible other living organism (model 0A.3.0, V2.1).
 *
 * Candidates: members of the pre-decision snapshot that are alive and are not
 * the sensing organism (by id). A candidate is visible when its CENTRE point
 * is inside the sensing organism's own inherited vision geometry — exactly the
 * food test above, with the same conventions:
 *   - range:  Euclidean centre-to-centre distance <= visionRange (inclusive);
 *   - cone:   |wrapped relative bearing| <= visionAngle / 2 (inclusive);
 *   - zero centre distance: the bearing is undefined, so the candidate is not
 *     rejected by the angle test.
 * No occlusion, no body radius, no lineage or relationship filtering.
 *
 * Winner: minimum distance; an exact distance tie goes to the lower organism
 * id. The id is only an engine-level deterministic tie-break — it never
 * becomes a neural input. A plain O(N) scan per sensing organism (O(N^2) per
 * tick), deliberately without any spatial index or cache.
 */
export function findNearestVisibleOrganism(
  organism: OrganismRuntimeState,
  candidates: readonly OrganismRuntimeState[]
): OrganismTarget | null {
  const { x, y, heading, id } = organism;
  const { visionRange, visionAngle } = organism.genome.morphology;
  const halfAngle = visionAngle / 2;

  let best: OrganismTarget | null = null;
  for (const c of candidates) {
    if (!c.alive || c.id === id) continue;
    const d = distance(x, y, c.x, c.y);
    if (d > visionRange) continue;
    // Same zero-distance convention as food: an undefined bearing never gates.
    const rel = Math.abs(wrapAngle(Math.atan2(c.y - y, c.x - x) - heading));
    if (d > 0 && rel > halfAngle) continue; // boundary inclusive

    if (best === null || d < best.dist || (d === best.dist && c.id < best.target.id)) {
      best = { target: c, dist: d };
    }
  }
  return best;
}

/**
 * The four 0A.3.0 organism inputs for one sensing organism, in index order
 * 6-9: [organismVisible, organismDistance, organismAngle, organismRelativeSize].
 *
 *   organismVisible       1 when a target exists, else 0
 *   organismDistance      targetDistance / self.visionRange, clamped to [0, 1]
 *   organismAngle         relative bearing to the target, wrapped to (-PI, PI]
 *                         and divided by PI (positive = clockwise/right), as
 *                         for food; exactly 0 at zero distance
 *   organismRelativeSize  (target.size - self.size) / (sizeMax - sizeMin),
 *                         clamped to [-1, 1]; negative = target smaller,
 *                         0 = equal, positive = target larger. Physical
 *                         information only.
 *
 * No visible organism: exactly [0, 0, 0, 0].
 */
export function senseNearestOrganism(organism: OrganismRuntimeState, ctx: OrganismSensingContext): [number, number, number, number] {
  const nearest = findNearestVisibleOrganism(organism, ctx.snapshot);
  if (nearest === null) return [0, 0, 0, 0];

  const { x, y, heading } = organism;
  const self = organism.genome.morphology;
  const organismDistance = clamp01(nearest.dist / self.visionRange);
  const organismAngle =
    nearest.dist === 0 ? 0 : relativeBearingNormalized(nearest.target.x - x, nearest.target.y - y, heading);
  const sizeSpan = ctx.sizeBounds.max - ctx.sizeBounds.min;
  // A degenerate (zero-width) size range can only hold equal sizes: report 0.
  const organismRelativeSize =
    sizeSpan > 0 ? clampSigned1((nearest.target.genome.morphology.size - self.size) / sizeSpan) : 0;
  return [1, organismDistance, organismAngle, organismRelativeSize];
}

/**
 * Compute the sensory vector for one organism. Pure function of (organism,
 * world snapshot) — no RNG, no mutation.
 *
 * Models 0A.1.0 / 0A.2.0 (no `ctx.organisms`): the §11.58 six-input vector
 *   input[0] foodVisible, input[1] foodDistance, input[2] foodAngle,
 *   input[3] boundaryDistance, input[4] boundaryAngle, input[5] normalizedEnergy.
 * Model 0A.3.0 (`ctx.organisms` present): the same six, with identical meaning
 * and order, followed by
 *   input[6] organismVisible, input[7] organismDistance, input[8] organismAngle,
 *   input[9] organismRelativeSize  (see senseNearestOrganism).
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

  if (ctx.organisms === undefined) {
    const input = new Array<number>(V1_NEURAL_INPUT_SIZE);
    input[0] = foodVisible;
    input[1] = foodDistance;
    input[2] = foodAngle;
    input[3] = boundaryDistance;
    input[4] = boundaryAngle;
    input[5] = normalizedEnergy;
    return input;
  }

  const [organismVisible, organismDistance, organismAngle, organismRelativeSize] = senseNearestOrganism(organism, ctx.organisms);
  const input = new Array<number>(ORGANISM_SENSING_NEURAL_INPUT_SIZE);
  input[0] = foodVisible;
  input[1] = foodDistance;
  input[2] = foodAngle;
  input[3] = boundaryDistance;
  input[4] = boundaryAngle;
  input[5] = normalizedEnergy;
  input[6] = organismVisible;
  input[7] = organismDistance;
  input[8] = organismAngle;
  input[9] = organismRelativeSize;
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

function clampSigned1(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
