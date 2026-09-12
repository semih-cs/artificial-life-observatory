/**
 * Snapshot format v2 (V2.2, model 0A.4.0) next to format v1.
 *
 *  - Recurrent memory is future-affecting runtime state, so a 0A.4.0 world is
 *    stored in format v2, which carries every organism's `hiddenState` and its
 *    `recurrentHiddenWeights`; it restores and resumes exactly.
 *  - Format v1 is untouched: snapshots written by the accepted V2.1 code
 *    (0A.3.0, fixtures/v2.1/) and by v1.0.0 (fixtures/v1/, see
 *    modelCompatibility.test.ts) load byte-exactly as feed-forward worlds.
 *  - Nothing is converted: feed-forward records cannot pass as recurrent and
 *    recurrent records cannot pass as feed-forward.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  bootstrapWorld, stepWorld, canonicalStateHash, canonicalStateString, recurrentMemoryModelConfig, organismSensingModelConfig,
  RECURRENT_MEMORY_GOLDEN_HASH,
} from '@alo/simulation-core';
import type { WorldState } from '@alo/simulation-core';
import {
  createSnapshot, serializeSnapshot, parseSnapshot, restoreSnapshot, validateSnapshot, saveSnapshotAtomic, loadSnapshot,
  computeSnapshotChecksum, configHash, saveToStore, recoverLatestValid, SnapshotError, RECURRENT_SNAPSHOT_FORMAT_VERSION,
  SUPPORTED_SNAPSHOT_FORMAT_VERSIONS, snapshotFormatVersionFor,
} from '../src/index.js';
import type { WorldSnapshot } from '../src/index.js';
import { runTo } from './helpers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alo-recurrent-'));
const v21Dir = path.join(here, 'fixtures', 'v2.1');
const v21Meta = JSON.parse(fs.readFileSync(path.join(v21Dir, 'v2.1-frozen-snapshots.json'), 'utf-8')) as {
  seed: number; saveTick: number; continueToTick: number; models: Record<string, { file: string; v21ContinuousHashes: Record<string, string> }>;
};
const v21Text = fs.readFileSync(path.join(v21Dir, v21Meta.models['0A.3.0']!.file), 'utf-8');
/** The test/live-verification seed whose 0A.4.0 world keeps reproducing (the first of 1, 2, 3, … alive at tick 10,000). */
const LIVING_SEED = 8;

function v4(seed: number) { const c = recurrentMemoryModelConfig(); c.rootSeed = seed; return c; }

function expectCode(fn: () => unknown, code: string): void {
  try { fn(); } catch (err) {
    expect(err).toBeInstanceOf(SnapshotError);
    expect((err as SnapshotError).code).toBe(code);
    return;
  }
  throw new Error(`expected SnapshotError ${code}`);
}

/** Deep copy with a mutation applied, then resealed (configHash and checksum recomputed) so only the intended check can fail. */
function resealed(s: WorldSnapshot | unknown, mutate: (o: any) => void): any {
  const o = JSON.parse(JSON.stringify(s));
  mutate(o);
  o.configHash = configHash(o.config);
  o.checksum = computeSnapshotChecksum(o);
  return o;
}
const relabel = (version: string, format: number) => (o: any) => {
  o.simulationVersion = o.config.simulationVersion = o.state.simulationVersion = version;
  o.snapshotFormatVersion = format;
};

describe('format v1 is untouched by V2.2', () => {
  it('a 0A.3.0 snapshot written by the accepted V2.1 code loads byte-exactly as a feed-forward world and continues exactly as V2.1 continued it', () => {
    const snap = parseSnapshot(v21Text);
    expect(snap.snapshotFormatVersion).toBe(1);
    expect(snap.simulationVersion).toBe('0A.3.0');
    const { world, config } = restoreSnapshot(snap);
    for (const o of world.organisms) {
      expect('hiddenState' in o).toBe(false); // never given memory
      expect('recurrentHiddenWeights' in o.genome.neural).toBe(false);
      expect(o.genome.neural.inputHiddenWeights.length).toBe(80);
    }
    expect(config.simulationVersion).toBe('0A.3.0'); // never upgraded
    expect(canonicalStateHash(world)).toBe(v21Meta.models['0A.3.0']!.v21ContinuousHashes[String(v21Meta.saveTick)]);
    let w: WorldState = world;
    while (w.tick < v21Meta.continueToTick) {
      w = stepWorld(w, config).world;
      const want = v21Meta.models['0A.3.0']!.v21ContinuousHashes[String(w.tick)];
      if (want !== undefined) expect(canonicalStateHash(w), `tick ${w.tick}`).toBe(want);
    }
    expect(w.organisms.every((o) => !('hiddenState' in o))).toBe(true);
    expect(serializeSnapshot(createSnapshot(world, config))).toBe(v21Text); // byte-exact re-serialisation
    expect(() => stepWorld(world, v4(v21Meta.seed))).toThrow(/never stepped under another model/);
  });

  it('formats are tied to models: v1 for 0A.1.0–0A.3.0, v2 for 0A.4.0', () => {
    expect(SUPPORTED_SNAPSHOT_FORMAT_VERSIONS).toEqual([1, 2]);
    expect(['0A.1.0', '0A.2.0', '0A.3.0', '0A.4.0', '0A.5.0'].map(snapshotFormatVersionFor)).toEqual([1, 1, 1, 2, 2]);
    expect(RECURRENT_SNAPSHOT_FORMAT_VERSION).toBe(2);
  });
});

describe('format v2 (0A.4.0)', () => {
  const c = v4(LIVING_SEED);
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

  it('(4, 5) a 0A.4.0 snapshot is format v2 and stores every organism\'s memory and recurrent weights exactly', () => {
    const snap = snapshots.get(1000)!;
    expect(snap.snapshotFormatVersion).toBe(2);
    const state = snap.state as any;
    expect(state.organisms.length).toBeGreaterThan(10);
    for (const o of state.organisms) {
      expect(o.hiddenState).toHaveLength(8);
      expect(o.genome.neural.recurrentHiddenWeights).toHaveLength(64);
    }
    expect(state.organisms.some((o: any) => o.hiddenState.some((v: number) => v !== 0))).toBe(true);
    const { world } = restoreSnapshot(parseSnapshot(serializeSnapshot(snap)));
    const live = runTo(bootstrapWorld(c), c, 1000);
    expect(canonicalStateString(world)).toBe(canonicalStateString(live));
    for (const o of world.organisms) {
      const l = live.organisms.find((q) => q.id === o.id)!;
      expect(o.hiddenState!.every((v, i) => Object.is(v, l.hiddenState![i]))).toBe(true); // bit-exact
    }
  });

  it('(6, 7, 8) missing, wrong-length or non-finite memory is refused', () => {
    const snap = snapshots.get(500)!;
    expectCode(() => validateSnapshot(resealed(snap, (o) => { delete o.state.organisms[0].hiddenState; })), 'MALFORMED_WORLD_STATE');
    expectCode(() => validateSnapshot(resealed(snap, (o) => { o.state.organisms[0].hiddenState = o.state.organisms[0].hiddenState.slice(0, 7); })), 'MALFORMED_WORLD_STATE');
    expectCode(() => validateSnapshot(resealed(snap, (o) => { o.state.organisms[0].hiddenState.push(0); })), 'MALFORMED_WORLD_STATE');
    expectCode(() => validateSnapshot(resealed(snap, (o) => { o.state.organisms[0].hiddenState[3] = null; })), 'MALFORMED_WORLD_STATE');
    expectCode(() => validateSnapshot(resealed(snap, (o) => { o.state.organisms[0].hiddenState[3] = 'NaN'; })), 'MALFORMED_WORLD_STATE');
    const inf = JSON.parse(JSON.stringify(snap));
    inf.state.organisms[0].hiddenState[3] = Number.POSITIVE_INFINITY;
    expectCode(() => validateSnapshot(inf), 'MALFORMED_SNAPSHOT'); // cannot even be canonically serialized
    expectCode(() => validateSnapshot(resealed(snap, (o) => { delete o.state.organisms[0].genome.neural.recurrentHiddenWeights; })), 'MALFORMED_WORLD_STATE');
    // an altered memory value that is still well-formed breaks the recorded state hash
    expectCode(() => validateSnapshot(resealed(snap, (o) => { o.state.organisms[0].hiddenState[0] += 1e-9; })), 'STATE_HASH_MISMATCH');
  });

  it('(9) feed-forward records cannot be relabelled as recurrent', () => {
    const v3 = parseSnapshot(v21Text);
    expectCode(() => validateSnapshot(resealed(v3, relabel('0A.4.0', 1))), 'UNSUPPORTED_FORMAT_VERSION'); // 0A.4.0 is never format v1
    expectCode(() => validateSnapshot(resealed(v3, relabel('0A.4.0', 2))), 'MALFORMED_WORLD_STATE'); // no memory / recurrent weights
    expectCode(() => validateSnapshot(resealed(v3, (o) => {
      relabel('0A.4.0', 2)(o);
      for (const org of o.state.organisms) org.hiddenState = new Array(8).fill(0); // memory invented, weights still missing
    })), 'MALFORMED_WORLD_STATE');
  });

  it('(10) recurrent records cannot be relabelled as feed-forward', () => {
    const snap = snapshots.get(500)!;
    expectCode(() => validateSnapshot(resealed(snap, relabel('0A.3.0', 2))), 'UNSUPPORTED_FORMAT_VERSION'); // 0A.3.0 is never format v2
    expectCode(() => validateSnapshot(resealed(snap, relabel('0A.3.0', 1))), 'MALFORMED_WORLD_STATE'); // carries recurrent state
    expectCode(() => validateSnapshot(resealed(snap, (o) => {
      relabel('0A.3.0', 1)(o);
      for (const org of o.state.organisms) delete org.hiddenState; // memory dropped, recurrent weights still there
    })), 'MALFORMED_WORLD_STATE');
    // an unsealed relabel is caught even earlier
    const raw = JSON.parse(serializeSnapshot(snap));
    relabel('0A.3.0', 1)(raw);
    expectCode(() => validateSnapshot(raw), 'CHECKSUM_MISMATCH');
  });

  it('(11, 12) continuous 2,500 == save at 500 / 1,000 / 1,500 / 2,000 → file → load → restore → 2,500, hash-equal every 250 ticks', () => {
    for (const at of [500, 1000, 1500, 2000]) {
      const file = path.join(tmpDir, `v4-at-${at}.snapshot.json`);
      saveSnapshotAtomic(file, parseSnapshot(serializeSnapshot(snapshots.get(at)!)));
      const { world, config } = restoreSnapshot(loadSnapshot(file));
      expect(config.simulationVersion).toBe('0A.4.0');
      let w = world;
      while (w.tick < 2500) {
        w = stepWorld(w, config).world;
        if (w.tick % 250 === 0) expect(canonicalStateHash(w), `resumed from ${at}, tick ${w.tick}`).toBe(reference.get(w.tick));
      }
    }
    expect(reference.get(2500)).toBe('6560783d7e9c5086'); // the coverage checkpoint pinned in simulation-core
  }, 120_000);

  it('(11) golden resume: seed 20260910 saved at 1,000 (while alive) and resumed to 10,000 gives the 0A.4.0 golden hash', () => {
    const g = v4(20260910);
    const at1000 = runTo(bootstrapWorld(g), g, 1000);
    const { world, config } = restoreSnapshot(parseSnapshot(serializeSnapshot(createSnapshot(at1000, g))));
    expect(canonicalStateHash(runTo(world, config, 10000))).toBe(RECURRENT_MEMORY_GOLDEN_HASH);
  }, 60_000);

  it('(13) separate processes: A creates a 0A.4.0 world and saves at 1,000; a fresh B resumes it to 2,500', () => {
    const fixture = path.join(here, 'fixtures', 'process.mjs');
    const file = path.join(tmpDir, 'v4-separate-process.snapshot.json');
    const a = JSON.parse(execFileSync(process.execPath, [fixture, 'create', String(LIVING_SEED), '1000', file, '0A.4.0'], { encoding: 'utf-8' }));
    expect(a.hash).toBe(reference.get(1000));
    const b = JSON.parse(execFileSync(process.execPath, [fixture, 'resume', file, '2500', '250'], { encoding: 'utf-8' }));
    expect(b.pid).not.toBe(a.pid);
    expect(b.simulationVersion).toBe('0A.4.0');
    for (let t = 1250; t <= 2500; t += 250) expect(b.hashes[String(t)], `tick ${t}`).toBe(reference.get(t));
  }, 120_000);

  it('a 0A.4.0 world lives in its own store: save, recover (with memory), and no mixing with a 0A.3.0 world', () => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'store-'));
    saveToStore(dir, snapshots.get(1500)!);
    const r = recoverLatestValid(dir);
    expect(r.snapshot.snapshotFormatVersion).toBe(2);
    expect(canonicalStateHash(r.world)).toBe(reference.get(1500));
    expect(r.world.organisms.every((o) => o.hiddenState?.length === 8)).toBe(true);
    expect(() => saveToStore(dir, parseSnapshot(v21Text))).toThrow(expect.objectContaining({ code: 'WORLD_IDENTITY_MISMATCH' }));
  });

  it('snapshotting reads only: memory and the world are untouched, and a 0A.3.0 config cannot snapshot a 0A.4.0 world', () => {
    const w = runTo(bootstrapWorld(c), c, 300);
    const before = canonicalStateString(w);
    serializeSnapshot(createSnapshot(w, c));
    expect(canonicalStateString(w)).toBe(before);
    const c3 = organismSensingModelConfig();
    c3.rootSeed = LIVING_SEED;
    expect(() => createSnapshot(w, c3)).toThrow(SnapshotError);
  });
});
