/**
 * V2.3 — physical bodies (model 0A.5.0) and persistence.
 *
 * Physical bodies add NO future-affecting per-organism state: a body is a pure
 * function of `morphology.size`, and displacement changes only `x` and `y`.
 * Position, morphology and the existing recurrent memory are all already
 * stored, so 0A.5.0 reuses snapshot format v2 unchanged — there is no format
 * v3 — and save → load → resume stays exact.
 *
 * Historical persistence is untouched: the v1.0.0 and V2.1 fixtures still load
 * byte-exactly, a 0A.4.0 snapshot cannot be relabelled 0A.5.0 or the reverse,
 * and no world is ever migrated between models.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  bootstrapWorld, stepWorld, canonicalStateHash, canonicalStateString,
  physicalBodiesModelConfig, recurrentMemoryModelConfig, countBodyOverlaps,
  PHYSICAL_BODIES_GOLDEN_HASH,
} from '@alo/simulation-core';
import type { WorldSnapshot } from '../src/index.js';
import {
  createSnapshot, serializeSnapshot, parseSnapshot, restoreSnapshot, validateSnapshot,
  saveSnapshotAtomic, loadSnapshot, computeSnapshotChecksum, configHash, saveToStore,
  recoverLatestValid, SnapshotError, SUPPORTED_SIMULATION_VERSIONS, SUPPORTED_SNAPSHOT_FORMAT_VERSIONS,
  snapshotFormatVersionFor,
} from '../src/index.js';
import { runTo } from './helpers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alo-physical-'));
/** The test/live-verification seed whose 0A.5.0 world keeps reproducing (the first of 1, 2, 3, … alive at tick 10,000). */
const LIVING_SEED = 8;

function v5(seed: number) { const c = physicalBodiesModelConfig(); c.rootSeed = seed; return c; }

function expectCode(fn: () => unknown, code: string): void {
  try { fn(); } catch (err) {
    expect(err).toBeInstanceOf(SnapshotError);
    expect((err as SnapshotError).code).toBe(code);
    return;
  }
  throw new Error(`expected SnapshotError ${code}`);
}

function resealed(s: WorldSnapshot | unknown, mutate: (o: any) => void): any {
  const o = JSON.parse(JSON.stringify(s));
  mutate(o);
  o.configHash = configHash(o.config);
  o.checksum = computeSnapshotChecksum(o);
  return o;
}

describe('0A.5.0 keeps snapshot format v2 — no format v3 for physical bodies', () => {
  it('the model list and format mapping grew by one entry and nothing else', () => {
    expect(SUPPORTED_SIMULATION_VERSIONS).toEqual(['0A.6.0', '0A.5.0', '0A.4.0', '0A.3.0', '0A.2.0', '0A.1.0']);
    // 0A.5.0 itself still needs no new format: V2.3 reused v2 unchanged. V2.4
    // added v3, and it belongs to 0A.6.0 alone.
    expect(SUPPORTED_SNAPSHOT_FORMAT_VERSIONS).toEqual([1, 2, 3]);
    expect(['0A.1.0', '0A.2.0', '0A.3.0', '0A.4.0', '0A.5.0'].map(snapshotFormatVersionFor)).toEqual([1, 1, 1, 2, 2]);
  });

  it('a 0A.5.0 snapshot is format v2, carries the body configuration, and stores no collision metadata at all', () => {
    const c = v5(LIVING_SEED);
    const w = runTo(bootstrapWorld(c), c, 400);
    const snap = createSnapshot(w, c);
    expect(snap.snapshotFormatVersion).toBe(2);
    expect(snap.simulationVersion).toBe('0A.5.0');
    expect((snap.config as any).body).toEqual({ radiusBase: 2.0, radiusPerSize: 2.2, separationPasses: 4 });

    const state = snap.state as any;
    // Exactly the v2 organism record: nothing about contact, radius, overlap
    // or displacement is persisted — the radius is derived from `size`.
    const keys = Object.keys(state.organisms[0]).sort();
    expect(keys).toEqual([
      'age', 'alive', 'birthTick', 'deathCause', 'deathTick', 'energy', 'generationDepth',
      'genome', 'heading', 'hiddenState', 'id', 'lineageRootId', 'parentId', 'x', 'y',
    ]);
    // The stored WORLD STATE mentions nothing physical: the two radius
    // constants live in `config.body`, which is configuration, not state.
    const stateText = JSON.stringify(state);
    for (const forbidden of ['radius', 'overlap', 'collision', 'contact', 'displace', 'push', 'damage', 'health']) {
      expect(stateText.includes(forbidden), forbidden).toBe(false);
    }
  });

  it('a model is never relabelled: a 0A.4.0 world cannot become 0A.5.0, and the reverse is refused too', () => {
    const c5 = v5(LIVING_SEED);
    const c4 = recurrentMemoryModelConfig(); c4.rootSeed = LIVING_SEED;
    const w5 = runTo(bootstrapWorld(c5), c5, 200);
    const snap5 = createSnapshot(w5, c5);

    // relabelling the model without changing the config's body section is refused
    expectCode(() => validateSnapshot(resealed(snap5, (o: any) => {
      o.simulationVersion = o.state.simulationVersion = o.config.simulationVersion = '0A.4.0';
    })), 'INVALID_CONFIG'); // 0A.4.0 must not carry a body configuration

    // and a world is never stepped under another model's configuration
    expect(() => stepWorld(w5, c4)).toThrow(/never stepped under another model/);
    expect(() => createSnapshot(w5, c4)).toThrow(SnapshotError);
  });
});

describe('0A.5.0 save / load / resume is exact', () => {
  const c = v5(LIVING_SEED);
  const reference = new Map<number, string>();
  const snapshots = new Map<number, WorldSnapshot>();

  beforeAll(() => {
    let w = bootstrapWorld(c);
    while (w.tick < 2500) {
      w = stepWorld(w, c).world;
      if (w.tick % 500 === 0) snapshots.set(w.tick, createSnapshot(w, c));
      if (w.tick % 250 === 0) reference.set(w.tick, canonicalStateHash(w));
    }
  }, 120_000);

  it('continuous 2,500 == save at 500 / 1,000 / 1,500 / 2,000 → file → load → restore → 2,500, hash-equal every 250 ticks', () => {
    for (const at of [500, 1000, 1500, 2000]) {
      const file = path.join(tmpDir, `v5-at-${at}.snapshot.json`);
      saveSnapshotAtomic(file, parseSnapshot(serializeSnapshot(snapshots.get(at)!)));
      const { world, config } = restoreSnapshot(loadSnapshot(file));
      expect(config.simulationVersion).toBe('0A.5.0');
      expect((config as any).body).toBeDefined();
      let w = world;
      while (w.tick < 2500) {
        w = stepWorld(w, config).world;
        if (w.tick % 250 === 0) expect(canonicalStateHash(w), `resumed from ${at}, tick ${w.tick}`).toBe(reference.get(w.tick));
      }
    }
    expect(reference.get(2500)).toBe('f398b7b9229d447c'); // the coverage checkpoint pinned in simulation-core
  }, 120_000);

  it('golden resume: seed 20260910 saved at 1,000 (while alive) and resumed to 10,000 gives the 0A.5.0 golden hash', () => {
    const g = v5(20260910);
    const at1000 = runTo(bootstrapWorld(g), g, 1000);
    const { world, config } = restoreSnapshot(parseSnapshot(serializeSnapshot(createSnapshot(at1000, g))));
    expect(canonicalStateHash(runTo(world, config, 10000))).toBe(PHYSICAL_BODIES_GOLDEN_HASH);
  }, 60_000);

  it('separate processes: A creates a 0A.5.0 world and saves at 1,000; a fresh B resumes it to 2,500', () => {
    const fixture = path.join(here, 'fixtures', 'process.mjs');
    const file = path.join(tmpDir, 'v5-separate-process.snapshot.json');
    const a = JSON.parse(execFileSync(process.execPath, [fixture, 'create', String(LIVING_SEED), '1000', file, '0A.5.0'], { encoding: 'utf-8' }));
    expect(a.hash).toBe(reference.get(1000));
    const b = JSON.parse(execFileSync(process.execPath, [fixture, 'resume', file, '2500', '250'], { encoding: 'utf-8' }));
    expect(b.pid).not.toBe(a.pid);
    expect(b.simulationVersion).toBe('0A.5.0');
    for (let t = 1250; t <= 2500; t += 250) expect(b.hashes[String(t)], `tick ${t}`).toBe(reference.get(t));
  }, 120_000);

  it('a 0A.5.0 world lives in its own store and never mixes with a 0A.4.0 world', () => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'store-'));
    saveToStore(dir, snapshots.get(1500)!);
    const r = recoverLatestValid(dir);
    expect(r.snapshot.snapshotFormatVersion).toBe(2);
    expect(canonicalStateHash(r.world)).toBe(reference.get(1500));
    expect(r.world.organisms.every((o) => o.hiddenState?.length === 8)).toBe(true);
    // recovering restores positions the physics produced; nothing re-resolves on load
    expect(canonicalStateString(r.world)).toBe(canonicalStateString(restoreSnapshot(snapshots.get(1500)!).world));

    const c4 = recurrentMemoryModelConfig(); c4.rootSeed = LIVING_SEED;
    const w4 = runTo(bootstrapWorld(c4), c4, 1500);
    expect(() => saveToStore(dir, createSnapshot(w4, c4))).toThrow(expect.objectContaining({ code: 'WORLD_IDENTITY_MISMATCH' }));
  }, 120_000);

  it('snapshotting a 0A.5.0 world reads only — positions, memory and overlap state are untouched', () => {
    const w = runTo(bootstrapWorld(c), c, 300);
    const before = canonicalStateString(w);
    const overlapsBefore = countBodyOverlaps(w.organisms, c);
    serializeSnapshot(createSnapshot(w, c));
    expect(canonicalStateString(w)).toBe(before);
    expect(countBodyOverlaps(w.organisms, c)).toBe(overlapsBefore);
  });
});
