import { RngStream } from '../rng/rngStream.js';
import { FertilityConfig } from '../config/types.js';
import { WorldConfigSnapshot } from './types.js';

/**
 * Static seeded fertility field (§12.22-§12.24, [LOCKED]).
 *
 * A (gridResolution+1)^2 lattice of values in [0, 1], bilinearly interpolated
 * across the world. It is:
 *   - generated once, at world initialization, from BootstrapRNG,
 *   - fixed thereafter — nothing in the tick pipeline ever writes to it,
 *   - a pure function of (rootSeed, fertility config), so the same
 *     seed + config always yields the same field,
 *   - non-adaptive: it never responds to population, hunger, or any
 *     simulation-time state (§12.26, §7.16, §12.60 — no hidden rescue).
 *
 * This is deliberately the simplest thing that produces spatial
 * heterogeneity. It is not procedural terrain generation and must not grow
 * into it in Phase 0A.
 */
export interface FertilityField {
  /** number of cells per axis; the lattice is (resolution+1) x (resolution+1). */
  readonly resolution: number;
  /** row-major lattice, length (resolution+1)^2, every value in [0, 1]. */
  readonly lattice: readonly number[];
}

export function generateFertilityField(rng: RngStream, config: FertilityConfig): FertilityField {
  const n = config.gridResolution + 1;
  const lattice: number[] = new Array(n * n);
  const floor = config.minFertility;
  const span = 1 - floor;
  for (let i = 0; i < n * n; i++) {
    lattice[i] = floor + span * rng.nextFloat();
  }
  return { resolution: config.gridResolution, lattice };
}

/**
 * Bilinearly interpolated fertility at a world position, clamped to [0, 1].
 * Pure — consumes no RNG and mutates nothing.
 */
export function fertilityAt(field: FertilityField, x: number, y: number, world: WorldConfigSnapshot): number {
  const n = field.resolution + 1;

  const u = clamp01(x / world.width) * field.resolution;
  const v = clamp01(y / world.height) * field.resolution;

  const x0 = Math.min(Math.floor(u), field.resolution - 1);
  const y0 = Math.min(Math.floor(v), field.resolution - 1);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = u - x0;
  const fy = v - y0;

  const v00 = field.lattice[y0 * n + x0] ?? 0;
  const v10 = field.lattice[y0 * n + x1] ?? 0;
  const v01 = field.lattice[y1 * n + x0] ?? 0;
  const v11 = field.lattice[y1 * n + x1] ?? 0;

  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return clamp01(top + (bottom - top) * fy);
}

/** Mean lattice value — a diagnostic/telemetry helper, never used by biology. */
export function meanFertility(field: FertilityField): number {
  if (field.lattice.length === 0) return 0;
  return field.lattice.reduce((s, v) => s + v, 0) / field.lattice.length;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
