import { WorldState } from '../world/types.js';

/**
 * Canonical, deterministically-ordered serialization of a WorldState
 * (§18.2, §15.5, §19.4 shape).
 *
 * INCLUDED — everything that is canonical simulation state:
 *   - simulation version, current tick, world dimensions
 *   - the static fertility field's identity (resolution + lattice); it never
 *     changes after initialization, but two worlds with different fields are
 *     different worlds and must hash differently
 *   - ID allocation counters (they determine every future organism/food ID)
 *   - organisms sorted by ascending ID, each with runtime biological state,
 *     lineage metadata, and genomes in fixed field/index order
 *   - food sorted by ascending ID
 *   - both RNG stream states
 *
 * EXCLUDED — observational data that cannot affect future simulation:
 *   - telemetry of any kind (§6.24, §15.10)
 *   - anything derived, cached, or debug-only
 *
 * Lineage metadata (parentId, generationDepth, lineageRootId, birthTick) and
 * death metadata are included because they are canonical persisted state that
 * a snapshot must restore (§19.4), not observational telemetry — even though
 * they do not themselves feed the tick equations.
 */
export function canonicalizeWorldState(world: WorldState): unknown {
  const organisms = [...world.organisms]
    .sort((a, b) => a.id - b.id)
    .map((o) => ({
      id: o.id,
      parentId: o.parentId,
      generationDepth: o.generationDepth,
      lineageRootId: o.lineageRootId,
      birthTick: o.birthTick,
      x: o.x,
      y: o.y,
      heading: o.heading,
      energy: o.energy,
      age: o.age,
      alive: o.alive,
      deathCause: o.deathCause,
      deathTick: o.deathTick,
      genome: {
        morphology: {
          size: o.genome.morphology.size,
          maxSpeed: o.genome.morphology.maxSpeed,
          visionRange: o.genome.morphology.visionRange,
          visionAngle: o.genome.morphology.visionAngle,
          metabolism: o.genome.morphology.metabolism,
        },
        neural: {
          inputHiddenWeights: [...o.genome.neural.inputHiddenWeights],
          hiddenBiases: [...o.genome.neural.hiddenBiases],
          hiddenOutputWeights: [...o.genome.neural.hiddenOutputWeights],
          outputBiases: [...o.genome.neural.outputBiases],
        },
      },
    }));

  const food = [...world.food].sort((a, b) => a.id - b.id).map((f) => ({ id: f.id, x: f.x, y: f.y }));

  return {
    simulationVersion: world.simulationVersion,
    tick: world.tick,
    worldConfig: { width: world.worldConfig.width, height: world.worldConfig.height },
    fertility: {
      resolution: world.fertility.resolution,
      lattice: [...world.fertility.lattice],
    },
    nextOrganismId: world.nextOrganismId,
    nextFoodId: world.nextFoodId,
    organisms,
    food,
    rng: {
      bootstrap: { ...world.rng.bootstrap },
      canonical: { ...world.rng.canonical },
    },
  };
}

/**
 * Stable string form of the canonical state. Object keys above are inserted in
 * a fixed order and JSON.stringify preserves insertion order for string keys,
 * so this is byte-stable for a given state.
 */
export function canonicalStateString(world: WorldState): string {
  return JSON.stringify(canonicalizeWorldState(world));
}

/**
 * Deterministic 64-bit fingerprint of the canonical state — two independent
 * FNV-1a lanes with different offset bases, concatenated. Dependency-free and
 * non-cryptographic by design: this is a reproducibility fingerprint for
 * tests, telemetry and run metadata, not a security primitive.
 */
export function canonicalStateHash(world: WorldState): string {
  return hash64(canonicalStateString(world));
}

export function hash64(str: string): string {
  let a = 0x811c9dc5;
  let b = 0x1000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    a ^= c;
    a = Math.imul(a, 0x01000193);
    b ^= c + i;
    b = Math.imul(b, 0x85ebca77);
    b ^= b >>> 13;
  }
  return ((a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0'));
}

/** Convenience predicate used by state-invariant tests. */
export function hasNonFiniteCanonicalValue(world: WorldState): boolean {
  const walk = (v: unknown): boolean => {
    if (typeof v === 'number') return !Number.isFinite(v);
    if (Array.isArray(v)) return v.some(walk);
    if (v !== null && typeof v === 'object') return Object.values(v as Record<string, unknown>).some(walk);
    return false;
  };
  return walk(canonicalizeWorldState(world));
}
