import { describe, it, expect } from 'vitest';
import {
  bootstrapWorld, stepWorld, canonicalStateHash, canonicalStateString, singleFounderModelConfig,
  SINGLE_FOUNDER_MODEL_VERSION, MULTI_FOUNDER_MODEL_VERSION,
} from '@alo/simulation-core';
import type { SimulationConfig } from '@alo/simulation-core';
import {
  createSnapshot, serializeSnapshot, parseSnapshot, restoreSnapshot, validateSnapshot, configHash,
  SNAPSHOT_FORMAT_VERSION, SNAPSHOT_FORMAT_ID, SUPPORTED_SIMULATION_VERSIONS, SnapshotError,
} from '../src/index.js';
import { defaultConfig, runTo, worldAt, deepFreeze } from './helpers.js';

describe('snapshot format v1', () => {
  const config = defaultConfig(42);
  const world = worldAt(42, 1500, config);
  const snap = createSnapshot(world, config);

  it('carries the required fields', () => {
    expect(snap.format).toBe(SNAPSHOT_FORMAT_ID);
    expect(snap.snapshotFormatVersion).toBe(SNAPSHOT_FORMAT_VERSION);
    expect(snap.snapshotFormatVersion).toBe(1);
    expect(snap.simulationVersion).toBe(MULTI_FOUNDER_MODEL_VERSION);
    expect(snap.tick).toBe(1500);
    expect(snap.tick).toBe(world.tick); // tick N = the world AFTER tick N completed
    expect(snap.config).toEqual(config);
    expect(snap.configHash).toBe(configHash(config));
    expect(snap.stateHash).toBe(canonicalStateHash(world));
    expect(snap.state.rng.bootstrap).toEqual(world.rng.bootstrap);
    expect(snap.state.rng.canonical).toEqual(world.rng.canonical);
    expect(snap.state.fertility.lattice).toEqual([...world.fertility.lattice]); // stored in full
    expect(snap.state.organisms.length).toBe(world.organisms.length);
    expect(snap.state.food.length).toBe(world.food.length);
    expect(snap.checksum).toMatch(/^[0-9a-f]{64}$/);
    // V2.1 added 0A.3.0 to the same format v1; V2.2 added the recurrent 0A.4.0 (format v2);
    // V2.3 added the physical-bodies 0A.5.0, which reuses format v2 unchanged.
    // V2.4 added the food-handling 0A.6.0, which has its own format v3.
    expect(SUPPORTED_SIMULATION_VERSIONS).toEqual(['0A.6.0', '0A.5.0', '0A.4.0', '0A.3.0', '0A.2.0', '0A.1.0']);
  });

  it('round trip world → serialize → parse → restore preserves the canonical state exactly', () => {
    const { world: restored, config: restoredConfig } = restoreSnapshot(parseSnapshot(serializeSnapshot(snap)));
    expect(canonicalStateHash(restored)).toBe(canonicalStateHash(world));
    expect(canonicalStateString(restored)).toBe(canonicalStateString(world));
    expect(restoredConfig).toEqual(config);
  });

  it('serialization is deterministic', () => {
    expect(serializeSnapshot(snap)).toBe(serializeSnapshot(snap));
    expect(serializeSnapshot(createSnapshot(world, config))).toBe(serializeSnapshot(snap));
    // Key order of the input config does not matter.
    const reordered = Object.fromEntries(Object.entries(config).reverse()) as unknown as SimulationConfig;
    expect(configHash(reordered)).toBe(configHash(config));
    expect(serializeSnapshot(createSnapshot(world, reordered))).toBe(serializeSnapshot(snap));
  });

  it('a snapshot at tick 0 (fresh bootstrap) resumes exactly', () => {
    const c = defaultConfig(7);
    const w0 = bootstrapWorld(c);
    const { world: r, config: rc } = restoreSnapshot(parseSnapshot(serializeSnapshot(createSnapshot(w0, c))));
    expect(r.tick).toBe(0);
    expect(canonicalStateHash(runTo(r, rc, 1000))).toBe(canonicalStateHash(runTo(w0, c, 1000)));
  });

  it('the historical 0A.1.0 model saves and resumes exactly too', () => {
    const c = singleFounderModelConfig();
    c.rootSeed = 20260910;
    const w = runTo(bootstrapWorld(c), c, 300);
    const s = createSnapshot(w, c);
    expect(s.simulationVersion).toBe(SINGLE_FOUNDER_MODEL_VERSION);
    const { world: r, config: rc } = restoreSnapshot(parseSnapshot(serializeSnapshot(s)));
    expect(canonicalStateHash(runTo(r, rc, 800))).toBe(canonicalStateHash(runTo(w, c, 800)));
  });

  it('refuses to snapshot a world under a config of another simulation version', () => {
    const w = worldAt(1, 10);
    const c = singleFounderModelConfig();
    expect(() => createSnapshot(w, c)).toThrow(SnapshotError);
  });
});

describe('persistence draws no RNG and never mutates the live world', () => {
  const config = defaultConfig(99);
  const world = worldAt(99, 1200, config);

  it('creating and serializing leaves the world byte-identical, RNG streams included', () => {
    const before = canonicalStateString(world);
    const rngBefore = JSON.stringify(world.rng);
    const configBefore = JSON.stringify(config);
    const s = createSnapshot(world, config);
    serializeSnapshot(s);
    validateSnapshot(s);
    expect(canonicalStateString(world)).toBe(before);
    expect(JSON.stringify(world.rng)).toBe(rngBefore);
    expect(JSON.stringify(config)).toBe(configBefore);
  });

  it('works on a deep-frozen world and config (it cannot be writing to them)', () => {
    const w = deepFreeze(worldAt(99, 300));
    const c = deepFreeze(defaultConfig(99));
    expect(() => serializeSnapshot(createSnapshot(w, c))).not.toThrow();
  });

  it('restore reproduces the RNG state exactly, draws nothing, and shares no objects with the snapshot', () => {
    const s = createSnapshot(world, config);
    const snapshotText = serializeSnapshot(s);
    const a = restoreSnapshot(s);
    const b = restoreSnapshot(s);
    expect(a.world.rng).toEqual(world.rng);
    expect(a.world.rng).toEqual(s.state.rng);
    expect(canonicalStateHash(a.world)).toBe(canonicalStateHash(b.world));
    // Loading twice and stepping one copy leaves the snapshot and the other copy untouched.
    const stepped = stepWorld(a.world, a.config).world;
    expect(serializeSnapshot(s)).toBe(snapshotText);
    expect(canonicalStateHash(b.world)).toBe(canonicalStateHash(world));
    // The restored world steps to exactly what the live world steps to.
    expect(canonicalStateHash(stepped)).toBe(canonicalStateHash(stepWorld(world, config).world));
    expect(a.world.organisms[0]).not.toBe(b.world.organisms[0]);
    expect(a.world.fertility.lattice).not.toBe(s.state.fertility.lattice);
  });
});
