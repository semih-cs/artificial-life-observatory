import { OrganismRuntimeState } from '../organism/types.js';
import { SimulationConfig, PhysicalBodyConfig } from '../config/types.js';
import { WorldConfigSnapshot } from '../world/types.js';
import { simulationModel } from '../model/simulationModel.js';

/**
 * V2.3 — physical bodies (model 0A.5.0).
 *
 * Organisms occupy space. This module owns the biological meaning of that
 * sentence: the authoritative physical radius of a body, what counts as an
 * overlap, and how an overlap is undone. Nothing here depends on the
 * renderer, on a frame rate, on an observer, on wall-clock time or on RNG.
 *
 * What this is NOT: it is not combat, attack, predation, damage, health,
 * stun, momentum or an impulse/velocity physics engine. No energy moves, no
 * event is emitted, no neural input or output exists for it, and no organism
 * gains persistent physical state. The ONLY thing that changes is position.
 *
 * -- The contract -------------------------------------------------------
 *
 * RADIUS.  radius(o) = body.radiusBase + body.radiusPerSize * o.size,
 *          a pure function of the INHERITED morphology size gene and two
 *          configured constants. No runtime adaptation, no random variation,
 *          no lineage, energy or age term. radiusPerSize > 0 is validated, so
 *          a larger size always means a strictly larger body.
 *
 * OVERLAP. Two living organisms overlap iff
 *
 *              centreDistance < radiusA + radiusB
 *
 *          strictly. Exact tangency (centreDistance == radiusA + radiusB) is
 *          contact, not overlap, and is never resolved.
 *
 * SEPARATION.  An overlapping pair is pushed apart along the line joining
 *          their centres by exactly the penetration depth
 *          (radiusA + radiusB - centreDistance), split between them by
 *
 *              shareA = sizeB / (sizeA + sizeB)
 *              shareB = sizeA / (sizeA + sizeB)
 *
 *          Each organism's share of the separation is the OTHER's fraction of
 *          the combined size, so the larger body moves less: equal sizes
 *          share the work exactly 0.5 / 0.5, and the ratio is continuous and
 *          monotone in size with no thresholds, no "strength" score, no
 *          immovable bodies and no rule that a small organism cannot displace
 *          a large one. This is the only advantage size gains in V2.3; its
 *          existing energetic cost is unchanged.
 *
 * The resolver is deterministic, RNG-free, independent of the order of the
 * organism array (it works over an ascending-id ordering and accumulates
 * corrections in that fixed order), and uses organism ids only where a tie
 * genuinely has no other answer — the exact same-centre case below.
 */

/** The four exactly-representable separation directions used for coincident centres. */
const COINCIDENT_DIRECTIONS: ReadonlyArray<readonly [number, number]> = Object.freeze([
  Object.freeze([1, 0] as const),
  Object.freeze([0, 1] as const),
  Object.freeze([-1, 0] as const),
  Object.freeze([0, -1] as const),
]);

/**
 * The body configuration of a model that has physical bodies. Throws for any
 * model that does not: a historical world has no physical radius at all, and
 * asking for one is a programming error, never a silently defaulted value.
 */
export function requirePhysicalBodyConfig(config: SimulationConfig): PhysicalBodyConfig {
  if (!simulationModel(config.simulationVersion).physicalBodies) {
    throw new Error(
      `physical bodies: model ${config.simulationVersion} has no physical bodies; ` +
        'only 0A.5.0 and later physical models have a body radius'
    );
  }
  const body = config.body;
  if (body === undefined) {
    throw new Error(`physical bodies: model ${config.simulationVersion} requires a body configuration`);
  }
  return body;
}

/**
 * THE authoritative physical radius of an organism, in world units, from its
 * inherited morphology `size` gene.
 *
 *     radius = body.radiusBase + body.radiusPerSize * size
 *
 * The simulation owns this meaning. The Observatory mirrors the same mapping
 * so that the drawn body is the body that collides, but the renderer is never
 * consulted by the simulation.
 */
export function physicalRadiusFromSize(size: number, config: SimulationConfig): number {
  const body = requirePhysicalBodyConfig(config);
  return body.radiusBase + body.radiusPerSize * size;
}

/** The physical radius of an organism — `physicalRadiusFromSize` of its morphology size. */
export function physicalRadius(organism: OrganismRuntimeState, config: SimulationConfig): number {
  return physicalRadiusFromSize(organism.genome.morphology.size, config);
}

/**
 * Overlap test, [LOCKED] for 0A.5.0: strict. Exact tangency is NOT overlap.
 * Uses squared distances, so it needs no square root and no transcendental
 * function to decide.
 */
export function bodiesOverlap(
  ax: number,
  ay: number,
  radiusA: number,
  bx: number,
  by: number,
  radiusB: number
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const sum = radiusA + radiusB;
  return dx * dx + dy * dy < sum * sum;
}

/**
 * The deterministic separation direction for two organisms whose centres are
 * EXACTLY coincident, where the geometry gives no direction at all.
 *
 * It is chosen from pair identity alone — `(lowerId + higherId) mod 4` over
 * four axis-aligned unit vectors — and points from the lower-id organism
 * towards the higher-id one. Axis-aligned vectors are exactly representable
 * in binary floating point, so this introduces no trigonometry and no
 * platform-sensitive arithmetic. It draws no random number from any stream.
 */
export function coincidentSeparationDirection(idA: number, idB: number): readonly [number, number] {
  const lo = Math.min(idA, idB);
  const hi = Math.max(idA, idB);
  const count = COINCIDENT_DIRECTIONS.length;
  const index = (((lo + hi) % count) + count) % count;
  // The stored direction points from the lower id to the higher id; the
  // opposite direction is the entry two places along, so negation (and the
  // signed zero it would produce) is never needed.
  const from = idA <= idB ? index : (index + count / 2) % count;
  return COINCIDENT_DIRECTIONS[from] as readonly [number, number];
}

export interface BodySeparationResult {
  /** Passes that actually applied a correction (<= body.separationPasses; a pass with no overlap ends the resolution). */
  passes: number;
  /** Overlapping pairs found in the FIRST pass — 0 means nothing was touched. */
  initialOverlaps: number;
  /** Overlapping pairs still present when the resolution ended (documented, never randomised away). */
  residualOverlaps: number;
  /**
   * The ids, ascending, of the organisms that were overlapping ANOTHER
   * ORGANISM when this resolution began — that is, the bodies that actually
   * met as a result of the movement this resolution is cleaning up. Taken from
   * the FIRST pass only, deliberately: later passes correct the solver's own
   * corrections, so contact would otherwise depend on `separationPasses`, a
   * solver parameter, rather than on what the organisms did.
   *
   * This is DERIVED, per-resolution information. It is never stored on an
   * organism, never persisted, never canonical and never sent to an observer.
   * V2.4 uses it, from the ACTIVE (post-movement) resolution only, to decide
   * whose held food is dislodged; the post-birth passive resolution's result
   * is deliberately ignored.
   */
  contacts: readonly number[];
}

/** One solid body during a resolution: the organism, its fixed radius and size, and its pending correction. */
interface SolidBody {
  organism: OrganismRuntimeState;
  radius: number;
  size: number;
  dx: number;
  dy: number;
}

/**
 * Resolve body overlap among living organisms, in place.
 *
 * Algorithm — a fixed number of deterministic Jacobi passes:
 *
 *  1. Take the living organisms in ascending id order. This ordering, not the
 *     caller's array order, is what every later step uses, so the result does
 *     not depend on how the array was arranged (floating-point addition is not
 *     associative, so a fixed accumulation order is required, not merely
 *     nice).
 *  2. For every pair i < j in that order, measured against the positions as
 *     they were at the START of the pass, test overlap strictly. For an
 *     overlapping pair compute the unit vector from i to j (or, for exactly
 *     coincident centres, `coincidentSeparationDirection`) and the penetration
 *     depth, and ACCUMULATE -shareI * penetration * n into i's correction and
 *     +shareJ * penetration * n into j's. No organism is moved during the
 *     scan, so no pair sees another pair's in-progress correction and no pair
 *     has priority over another.
 *  3. Apply every accumulated correction at once, clamping each organism to
 *     the world rectangle with exactly the same hard-wall rule that movement
 *     resolution uses. An organism with a zero correction is not written at
 *     all.
 *  4. Repeat for `body.separationPasses` passes. A pass that finds no
 *     overlapping pair ends the resolution immediately, so a world with no
 *     contact is left bit-for-bit untouched.
 *
 * Dense clusters, and bodies pressed against a wall, can be geometrically
 * impossible to separate completely. That is handled honestly: the fixed pass
 * budget runs out, any residual overlap simply remains, and nothing random,
 * timing-based or convergence-based is introduced to hide it. The result is
 * reproducible because the budget is part of the model.
 */
export function resolveBodyOverlap(
  organisms: readonly OrganismRuntimeState[],
  world: WorldConfigSnapshot,
  config: SimulationConfig
): BodySeparationResult {
  const body = requirePhysicalBodyConfig(config);

  // Ascending id is the canonical order for the whole resolution.
  const bodies: SolidBody[] = organisms
    .filter((o) => o.alive)
    .sort((a, b) => a.id - b.id)
    .map((o) => ({
      organism: o,
      radius: body.radiusBase + body.radiusPerSize * o.genome.morphology.size,
      size: o.genome.morphology.size,
      dx: 0,
      dy: 0,
    }));

  const n = bodies.length;
  if (n < 2) return { passes: 0, initialOverlaps: 0, residualOverlaps: 0, contacts: [] };

  let passes = 0;
  let initialOverlaps = 0;
  let overlaps = 0;
  // Organism ids that met another body when this resolution began (first pass).
  const contacted = new Set<number>();

  for (let pass = 0; pass < body.separationPasses; pass++) {
    for (const s of bodies) {
      s.dx = 0;
      s.dy = 0;
    }
    overlaps = 0;

    for (let i = 0; i < n; i++) {
      const a = bodies[i] as SolidBody;
      for (let j = i + 1; j < n; j++) {
        const b = bodies[j] as SolidBody;
        const sum = a.radius + b.radius;
        const vx = b.organism.x - a.organism.x;
        const vy = b.organism.y - a.organism.y;
        const distanceSquared = vx * vx + vy * vy;
        // Strict: exact tangency (distanceSquared === sum * sum) is contact,
        // not overlap, and is left alone.
        if (!(distanceSquared < sum * sum)) continue;
        overlaps += 1;
        if (pass === 0) {
          contacted.add(a.organism.id);
          contacted.add(b.organism.id);
        }

        let nx: number;
        let ny: number;
        let penetration: number;
        if (distanceSquared > 0) {
          // Math.sqrt is exactly rounded by IEEE-754, unlike the transcendental
          // functions, so this adds no new platform sensitivity.
          const distance = Math.sqrt(distanceSquared);
          nx = vx / distance;
          ny = vy / distance;
          penetration = sum - distance;
        } else {
          // Exactly coincident centres: identity decides, never chance.
          const dir = coincidentSeparationDirection(a.organism.id, b.organism.id);
          nx = dir[0];
          ny = dir[1];
          penetration = sum;
        }

        // Size weighting: each body's share of the separation is the OTHER's
        // fraction of the combined size, so the larger body moves less. Sizes
        // are bounded strictly positive by geneBounds; the guard keeps a
        // hand-built degenerate pair (total <= 0) from producing NaN and makes
        // it share the work equally instead.
        const total = a.size + b.size;
        const shareA = total > 0 ? b.size / total : 0.5;
        const shareB = total > 0 ? a.size / total : 0.5;

        a.dx -= nx * penetration * shareA;
        a.dy -= ny * penetration * shareA;
        b.dx += nx * penetration * shareB;
        b.dy += ny * penetration * shareB;
      }
    }

    if (pass === 0) initialOverlaps = overlaps;
    if (overlaps === 0) break;
    passes += 1;

    for (const s of bodies) {
      if (s.dx === 0 && s.dy === 0) continue;
      // The same hard-wall rule as movement resolution: positions are clamped
      // into the world rectangle, never bounced and never allowed outside.
      s.organism.x = clamp(s.organism.x + s.dx, 0, world.width);
      s.organism.y = clamp(s.organism.y + s.dy, 0, world.height);
    }
  }

  return {
    passes,
    initialOverlaps,
    residualOverlaps: overlaps,
    // Ascending ids: a stable, array-order-independent report.
    contacts: [...contacted].sort((x, y) => x - y),
  };
}

/** Count the overlapping living pairs — a read-only diagnostic used by tests and reports. */
export function countBodyOverlaps(
  organisms: readonly OrganismRuntimeState[],
  config: SimulationConfig
): number {
  const body = requirePhysicalBodyConfig(config);
  const living = organisms.filter((o) => o.alive).sort((a, b) => a.id - b.id);
  let overlaps = 0;
  for (let i = 0; i < living.length; i++) {
    const a = living[i] as OrganismRuntimeState;
    for (let j = i + 1; j < living.length; j++) {
      const b = living[j] as OrganismRuntimeState;
      const ra = body.radiusBase + body.radiusPerSize * a.genome.morphology.size;
      const rb = body.radiusBase + body.radiusPerSize * b.genome.morphology.size;
      if (bodiesOverlap(a.x, a.y, ra, b.x, b.y, rb)) overlaps += 1;
    }
  }
  return overlaps;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
