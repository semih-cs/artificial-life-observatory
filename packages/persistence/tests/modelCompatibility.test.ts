/**
 * Snapshot format v1 across models (V2.1).
 *
 *  - Snapshots written by the FROZEN v1 code (git tag v1.0.0, fixtures/v1/)
 *    still load byte-exactly, restore as their own model with six-input
 *    genomes, and continue exactly as the frozen v1 code continued them. They
 *    are never routed through the ten-input controller.
 *  - The V2.1 model 0A.3.0 obeys the same exact-resume invariant:
 *    continuous == save → serialize → file → load → restore → resume.
 *  - Neural dimensions are validated per model; a snapshot is never converted
 *    between models.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  bootstrapWorld, stepWorld, canonicalStateHash, modelConfig, organismSensingModelConfig, senseContextFor, senseOrganism,
  ORGANISM_SENSING_GOLDEN_HASH, ORGANISM_SENSING_MODEL_VERSION,
} from '@alo/simulation-core';
import type { WorldState } from '@alo/simulation-core';
import {
  createSnapshot, serializeSnapshot, parseSnapshot, restoreSnapshot, validateSnapshot, saveSnapshotAtomic, loadSnapshot,
  computeSnapshotChecksum, configHash, saveToStore, recoverLatestValid, SnapshotError, SNAPSHOT_FORMAT_VERSION,
} from '../src/index.js';
import type { WorldSnapshotV1 } from '../src/index.js';
import { runTo } from './helpers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, 'fixtures', 'v1');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alo-models-'));
const meta = JSON.parse(fs.readFileSync(path.join(fixtures, 'v1-frozen-snapshots.json'), 'utf-8')) as {
  seed: number; saveTick: number; continueToTick: number;
  models: Record<string, { file: string; v1ContinuousHashes: Record<string, string> }>;
};

function expectCode(fn: () => unknown, code: string): void {
  try { fn(); } catch (err) {
    expect(err).toBeInstanceOf(SnapshotError);
    expect((err as SnapshotError).code).toBe(code);
    return;
  }
  throw new Error(`expected SnapshotError ${code}`);
}

/** Deep copy with a mutation applied, then resealed (checksum recomputed) so only the intended check can fail. */
function resealed(s: WorldSnapshotV1, mutate: (o: any) => void): any {
  const o = JSON.parse(JSON.stringify(s));
  mutate(o);
  o.configHash = configHash(o.config);
  o.checksum = computeSnapshotChecksum(o);
  return o;
}

describe('frozen v1 snapshots (written by git tag v1.0.0) under the V2.1 code', () => {
  for (const version of ['0A.2.0', '0A.1.0']) {
    it(`${version}: accepted byte-exactly, restored as ${version}, and continued exactly as the v1 code continued it`, () => {
      const { file, v1ContinuousHashes } = meta.models[version]!;
      const text = fs.readFileSync(path.join(fixtures, file), 'utf-8');
      const snap = parseSnapshot(text); // also requires the text to be its own canonical serialization
      expect(snap.snapshotFormatVersion).toBe(SNAPSHOT_FORMAT_VERSION);
      expect(snap.simulationVersion).toBe(version);
      expect(snap.tick).toBe(meta.saveTick);

      const { world, config } = restoreSnapshot(snap);
      expect(world.simulationVersion).toBe(version);
      // The stored config is exactly the model's configuration — not upgraded to 0A.3.0.
      const expected = modelConfig(version);
      expected.rootSeed = meta.seed;
      expect(config).toEqual(expected);
      for (const o of world.organisms) expect(o.genome.neural.inputHiddenWeights.length).toBe(8 * 6);
      expect(canonicalStateHash(world)).toBe(v1ContinuousHashes[String(meta.saveTick)]);

      // Six-input semantics: no organism context, six-value vectors — never the 10-input controller.
      const ctx = senseContextFor(world, config);
      expect(ctx.organisms).toBeUndefined();
      expect(world.organisms.every((o) => senseOrganism(o, ctx).length === 6)).toBe(true);
      // Stepping it under the 0A.3.0 configuration is refused rather than reinterpreted.
      const v3 = organismSensingModelConfig();
      v3.rootSeed = meta.seed;
      expect(() => stepWorld(world, v3)).toThrow(/never stepped under another model/);

      // Continuation under the new code == the frozen v1 code's own continuous run.
      let w: WorldState = world;
      while (w.tick < meta.continueToTick) {
        w = stepWorld(w, config).world;
        const want = v1ContinuousHashes[String(w.tick)];
        if (want !== undefined) expect(canonicalStateHash(w), `${version} tick ${w.tick}`).toBe(want);
      }
      // And re-saving it with the new code reproduces the v1 file byte for byte: format v1 is unchanged.
      expect(serializeSnapshot(createSnapshot(world, config))).toBe(text);
    });
  }
});

describe('0A.3.0 exact save → load → resume', () => {
  const reference = new Map<number, string>();
  const snapshots = new Map<number, WorldSnapshotV1>();

  beforeAll(() => {
    const c = organismSensingModelConfig();
    c.rootSeed = meta.seed; // the canonical regression seed, 20260910
    let w = bootstrapWorld(c);
    while (w.tick < 10000) {
      w = stepWorld(w, c).world;
      if (w.tick === 2500 || w.tick === 5000) snapshots.set(w.tick, createSnapshot(w, c));
      if (w.tick % 500 === 0) reference.set(w.tick, canonicalStateHash(w));
    }
  }, 120_000);

  function resumeFromFile(snapshot: WorldSnapshotV1, name: string, toTick: number): Map<number, string> {
    const file = path.join(tmpDir, name);
    saveSnapshotAtomic(file, parseSnapshot(serializeSnapshot(snapshot)));
    const loaded = loadSnapshot(file);
    expect(loaded.simulationVersion).toBe(ORGANISM_SENSING_MODEL_VERSION);
    const { world: restored, config } = restoreSnapshot(loaded);
    expect(config.simulationVersion).toBe(ORGANISM_SENSING_MODEL_VERSION);
    for (const o of restored.organisms) expect(o.genome.neural.inputHiddenWeights.length).toBe(8 * 10);
    const hashes = new Map<number, string>();
    runTo(restored, config, toTick, (w) => { if (w.tick % 500 === 0) hashes.set(w.tick, canonicalStateHash(w)); });
    return hashes;
  }

  it('the uninterrupted reference reaches the 0A.3.0 golden hash despite live snapshots', () => {
    expect(reference.get(10000)).toBe(ORGANISM_SENSING_GOLDEN_HASH);
  });

  it('continuous 10,000 == 2,500 → snapshot → file → load → restore → 10,000, hash-equal every 500 ticks', () => {
    const resumed = resumeFromFile(snapshots.get(2500)!, 'v3-at-2500.snapshot.json', 10000);
    expect(resumed.size).toBe(15);
    for (let t = 3000; t <= 10000; t += 500) expect(resumed.get(t), `tick ${t}`).toBe(reference.get(t));
  }, 120_000);

  it('golden resume: 0A.3.0 saved at 5,000 and resumed to 10,000 gives the 0A.3.0 golden hash', () => {
    const resumed = resumeFromFile(snapshots.get(5000)!, 'v3-at-5000.snapshot.json', 10000);
    expect(resumed.get(10000)).toBe(ORGANISM_SENSING_GOLDEN_HASH);
  }, 120_000);

  it('separate processes: A creates a 0A.3.0 world and saves at 5,000; a fresh B resumes it to 10,000', () => {
    const fixture = path.join(here, 'fixtures', 'process.mjs');
    const file = path.join(tmpDir, 'v3-separate-process.snapshot.json');
    const a = JSON.parse(execFileSync(process.execPath, [fixture, 'create', String(meta.seed), '5000', file, '0A.3.0'], { encoding: 'utf-8' }));
    expect(a.hash).toBe(reference.get(5000));
    const b = JSON.parse(execFileSync(process.execPath, [fixture, 'resume', file, '10000', '500'], { encoding: 'utf-8' }));
    expect(b.pid).not.toBe(a.pid);
    expect(b.simulationVersion).toBe('0A.3.0');
    for (let t = 5500; t <= 10000; t += 500) expect(b.hashes[String(t)], `tick ${t}`).toBe(reference.get(t));
  }, 120_000);

  it('a 0A.3.0 world keeps its own store identity; a v1 world cannot be mixed into its folder', () => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'store-'));
    saveToStore(dir, snapshots.get(2500)!);
    const r = recoverLatestValid(dir);
    expect(r.config.simulationVersion).toBe('0A.3.0');
    expect(canonicalStateHash(r.world)).toBe(reference.get(2500));
    const v1 = parseSnapshot(fs.readFileSync(path.join(fixtures, meta.models['0A.2.0']!.file), 'utf-8'));
    const before = fs.readdirSync(dir).sort();
    expect(() => saveToStore(dir, v1)).toThrow(expect.objectContaining({ code: 'WORLD_IDENTITY_MISMATCH' }));
    expect(fs.readdirSync(dir).sort()).toEqual(before);
  });
});

describe('neural dimensions are validated per model, and snapshots are never converted', () => {
  const v1Text = fs.readFileSync(path.join(fixtures, meta.models['0A.2.0']!.file), 'utf-8');
  const v1 = parseSnapshot(v1Text);
  const c3 = organismSensingModelConfig();
  c3.rootSeed = 42;
  const v3 = createSnapshot(runTo(bootstrapWorld(c3), c3, 300), c3);

  it('a 0A.2.0 snapshot with ten-input genomes is refused', () => {
    const forged = resealed(v1, (o) => {
      for (const org of o.state.organisms) org.genome.neural.inputHiddenWeights = new Array(80).fill(0.1);
    });
    expectCode(() => validateSnapshot(forged), 'MALFORMED_WORLD_STATE');
  });

  it('a 0A.3.0 snapshot with six-input genomes is refused', () => {
    const forged = resealed(v3, (o) => {
      for (const org of o.state.organisms) org.genome.neural.inputHiddenWeights = org.genome.neural.inputHiddenWeights.slice(0, 48);
    });
    expectCode(() => validateSnapshot(forged), 'MALFORMED_WORLD_STATE');
  });

  it('relabelling a 0A.3.0 snapshot as 0A.2.0 (or the reverse) is refused, not reinterpreted', () => {
    const asV2 = resealed(v3, (o) => { o.simulationVersion = o.config.simulationVersion = o.state.simulationVersion = '0A.2.0'; });
    expectCode(() => validateSnapshot(asV2), 'MALFORMED_WORLD_STATE');
    const asV3 = resealed(v1, (o) => { o.simulationVersion = o.config.simulationVersion = o.state.simulationVersion = '0A.3.0'; });
    expectCode(() => validateSnapshot(asV3), 'MALFORMED_WORLD_STATE');
    // an unsealed edit is caught even earlier
    const raw = JSON.parse(v1Text);
    raw.simulationVersion = raw.config.simulationVersion = raw.state.simulationVersion = '0A.3.0';
    expectCode(() => validateSnapshot(raw), 'CHECKSUM_MISMATCH');
  });

  it('an unknown future model version is still refused', () => {
    const future = resealed(v3, (o) => { o.simulationVersion = o.config.simulationVersion = o.state.simulationVersion = '0A.4.0'; });
    expectCode(() => validateSnapshot(future), 'INCOMPATIBLE_SIMULATION_VERSION');
  });
});
