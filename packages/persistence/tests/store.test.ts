/**
 * Phase 0C slice 2: the folder-based snapshot store — naming, retention,
 * world identity, duplicate ticks, atomic-write leftovers, and recovery from
 * the newest valid snapshot with explicit failure when there is none.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { bootstrapWorld, canonicalStateHash, singleFounderModelConfig } from '@alo/simulation-core';
import {
  createSnapshot, serializeSnapshot, restoreSnapshot, loadSnapshot, computeSnapshotChecksum, configHash,
  saveToStore, listSnapshots, recoverLatestValid, pruneSnapshots, snapshotFileName, readStoreIdentity, worldIdentityOf,
  SnapshotError, SnapshotStoreError, SnapshotStoreErrorCode, STORE_IDENTITY_FILE, DEFAULT_SNAPSHOT_RETENTION, MAX_SNAPSHOT_TICK,
  WorldSnapshotV1,
} from '../src/index.js';
import { defaultConfig, runTo, worldAt } from './helpers.js';

const SEED = 11;
const config = defaultConfig(SEED);

// One uninterrupted reference run to tick 1000; snapshots are taken from the live world.
const snaps = new Map<number, WorldSnapshotV1>();
const ref = new Map<number, string>();
runTo(bootstrapWorld(config), config, 1000, (w) => {
  if (w.tick % 100 !== 0) return;
  ref.set(w.tick, canonicalStateHash(w));
  if (w.tick <= 800) snaps.set(w.tick, createSnapshot(w, config));
});
const snap = (t: number) => snaps.get(t)!;

const newDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'alo-store-'));
const fileOf = (d: string, t: number) => path.join(d, snapshotFileName(t));
const ticksIn = (d: string) => listSnapshots(d).map((e) => e.tick);

function storeWith(ticks: number[], keep?: number): string {
  const d = newDir();
  for (const t of ticks) saveToStore(d, snap(t), keep === undefined ? {} : { keep });
  return d;
}

/** Every file name and content hash in a directory: proves an operation changed nothing. */
function dirState(d: string): string[] {
  return fs.readdirSync(d).sort().map((n) => {
    const p = path.join(d, n);
    return fs.statSync(p).isFile() ? `${n}:${createHash('sha256').update(fs.readFileSync(p)).digest('hex')}` : `${n}/`;
  });
}

const flipByte = (file: string) => { const b = fs.readFileSync(file); b[Math.floor(b.length / 2)]! ^= 0x01; fs.writeFileSync(file, b); };
const truncate = (file: string) => { const b = fs.readFileSync(file); fs.writeFileSync(file, b.subarray(0, Math.floor(b.length * 0.7))); };
const empty = (file: string) => fs.writeFileSync(file, '');

function expectStoreError(fn: () => unknown, code: SnapshotStoreErrorCode): SnapshotStoreError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(SnapshotStoreError);
    expect((err as SnapshotStoreError).code).toBe(code);
    expect((err as SnapshotStoreError).message).toContain(code);
    return err as SnapshotStoreError;
  }
  throw new Error(`expected ${code}, but nothing was thrown`);
}

describe('file naming', () => {
  it('fixed-width, tick-ordered names; lexical order equals tick order', () => {
    expect(snapshotFileName(10000)).toBe('snapshot-000000010000.json');
    expect(snapshotFileName(0)).toBe('snapshot-000000000000.json');
    const ticks = [999999999999, 100, 9, 12345, 0, 10, 99];
    const lexical = ticks.map(snapshotFileName).sort();
    expect(lexical).toEqual([...ticks].sort((a, b) => a - b).map(snapshotFileName));
    expect(MAX_SNAPSHOT_TICK).toBe(999999999999);
    for (const bad of [-1, 1.5, 1e12, Number.NaN]) expectStoreError(() => snapshotFileName(bad), 'TICK_OUT_OF_RANGE');
  });
});

describe('1. retention: the newest 5 remain', () => {
  it('after 8 saves exactly the newest 5 remain, with the right names, and the newest is valid', () => {
    expect(DEFAULT_SNAPSHOT_RETENTION).toBe(5);
    const d = newDir();
    const prunedBy: string[][] = [];
    for (const t of [100, 200, 300, 400, 500, 600, 700, 800]) {
      const r = saveToStore(d, snap(t));
      expect(r).toMatchObject({ tick: t, fileName: snapshotFileName(t), written: true });
      prunedBy.push(r.pruned);
    }
    expect(prunedBy).toEqual([[], [], [], [], [], [snapshotFileName(100)], [snapshotFileName(200)], [snapshotFileName(300)]]);
    expect(ticksIn(d)).toEqual([400, 500, 600, 700, 800]);
    expect(fs.readdirSync(d).sort()).toEqual([...[400, 500, 600, 700, 800].map(snapshotFileName), STORE_IDENTITY_FILE].sort());
    for (const t of [400, 500, 600, 700, 800]) expect(fs.readFileSync(fileOf(d, t), 'utf-8')).toBe(serializeSnapshot(snap(t)));
    expect(canonicalStateHash(restoreSnapshot(loadSnapshot(fileOf(d, 800))).world)).toBe(ref.get(800));
  });

  it('a custom retention is honoured, and an invalid one is refused', () => {
    const d = storeWith([100, 200, 300, 400], 2);
    expect(ticksIn(d)).toEqual([300, 400]);
    expectStoreError(() => saveToStore(d, snap(500), { keep: 0 }), 'INVALID_RETENTION');
    expectStoreError(() => pruneSnapshots(d, 1.5), 'INVALID_RETENTION');
    expect(ticksIn(d)).toEqual([300, 400]);
  });

  it('pruneSnapshots keeps the newest K and never prunes when no retained snapshot is valid', () => {
    const d = storeWith([100, 200, 300, 400, 500, 600, 700, 800], 10);
    expect(ticksIn(d)).toHaveLength(8);
    expect(pruneSnapshots(d, 6)).toEqual([100, 200].map(snapshotFileName));
    expect(ticksIn(d)).toEqual([300, 400, 500, 600, 700, 800]);
    for (const t of [400, 500, 600, 700, 800]) flipByte(fileOf(d, t));
    const before = dirState(d);
    expectStoreError(() => pruneSnapshots(d), 'NO_VALID_SNAPSHOT');
    expect(dirState(d)).toEqual(before); // the only valid snapshot (300) survives
    expect(pruneSnapshots(d, 6)).toEqual([]);
  });
});

describe('2. corrupt newest snapshot: fall back to the previous one', () => {
  it('skips and reports the corrupt newest, restores the previous, and resumes exactly', () => {
    const d = storeWith([100, 200, 300, 400, 500, 600, 700, 800]);
    flipByte(fileOf(d, 800));
    const r = recoverLatestValid(d);
    expect(r.report.candidates).toEqual([800, 700, 600, 500, 400].map(snapshotFileName));
    expect(r.report.selected).toEqual({ fileName: snapshotFileName(700), tick: 700, stateHash: ref.get(700) });
    expect(r.report.skipped).toHaveLength(1);
    expect(r.report.skipped[0]).toMatchObject({ fileName: snapshotFileName(800), tick: 800 });
    expect(r.report.skipped[0]!.reason).toContain(r.report.skipped[0]!.code);
    expect(r.snapshot.tick).toBe(700);
    expect(r.world.tick).toBe(700);
    expect(canonicalStateHash(r.world)).toBe(ref.get(700));
    // Continue from the recovered snapshot: the future equals the uninterrupted run.
    const hashes = new Map<number, string>();
    runTo(r.world, r.config, 1000, (w) => { if (w.tick % 100 === 0) hashes.set(w.tick, canonicalStateHash(w)); });
    for (const t of [800, 900, 1000]) expect(hashes.get(t), `tick ${t}`).toBe(ref.get(t));
  });
});

describe('3. several corrupt snapshots: fall back to the newest remaining valid one', () => {
  it('corrupt newest 3 (flipped byte, truncated, empty) → the 4th newest is selected', () => {
    const d = storeWith([100, 200, 300, 400, 500, 600, 700, 800]);
    flipByte(fileOf(d, 800));
    truncate(fileOf(d, 700));
    empty(fileOf(d, 600));
    const r = recoverLatestValid(d);
    expect(r.report.selected?.tick).toBe(500);
    expect(r.report.skipped.map((s) => s.tick)).toEqual([800, 700, 600]);
    expect(r.report.skipped[1]!.code).toBe('INVALID_SERIALIZATION');
    expect(r.report.skipped[2]!.code).toBe('INVALID_SERIALIZATION');
    expect(canonicalStateHash(r.world)).toBe(ref.get(500));
  });

  it('a valid snapshot stored under the wrong tick name is skipped, not trusted', () => {
    const d = storeWith([100, 200, 300, 400, 500]);
    fs.copyFileSync(fileOf(d, 400), fileOf(d, 500));
    const r = recoverLatestValid(d);
    expect(r.report.skipped).toEqual([expect.objectContaining({ tick: 500, code: 'FILENAME_TICK_MISMATCH' })]);
    expect(r.report.selected?.tick).toBe(400);
  });
});

describe('4. every snapshot corrupt: recovery throws, no fresh world', () => {
  it('throws NO_VALID_SNAPSHOT with a full report and leaves the directory untouched', () => {
    const d = storeWith([100, 200, 300, 400, 500, 600, 700, 800]);
    for (const t of [400, 500, 600, 700, 800]) flipByte(fileOf(d, t));
    const before = dirState(d);
    const err = expectStoreError(() => recoverLatestValid(d), 'NO_VALID_SNAPSHOT');
    expect(err.report?.selected).toBeNull();
    expect(err.report?.skipped.map((s) => s.tick)).toEqual([800, 700, 600, 500, 400]);
    expect(err.message).toContain('recovery never creates a world');
    expect(dirState(d)).toEqual(before); // nothing written, nothing deleted, no fresh world
  });
});

describe('5. empty or missing store: recovery fails clearly', () => {
  it('an empty directory is refused and stays empty', () => {
    const d = newDir();
    expectStoreError(() => recoverLatestValid(d), 'NO_VALID_SNAPSHOT');
    expect(fs.readdirSync(d)).toEqual([]);
  });

  it('a missing directory is refused and not created', () => {
    const d = path.join(newDir(), 'no-such-store');
    expectStoreError(() => recoverLatestValid(d), 'NO_VALID_SNAPSHOT');
    expect(fs.existsSync(d)).toBe(false);
  });

  it('an identity with no snapshots (crash after the first identity write) is refused', () => {
    const d = storeWith([100]);
    fs.unlinkSync(fileOf(d, 100));
    const err = expectStoreError(() => recoverLatestValid(d), 'NO_VALID_SNAPSHOT');
    expect(err.report?.candidates).toEqual([]);
  });

  it('snapshots without an identity file, or with a corrupt one, are refused — by recovery and by save', () => {
    const d = storeWith([100, 200]);
    const idFile = path.join(d, STORE_IDENTITY_FILE);
    const idText = fs.readFileSync(idFile, 'utf-8');
    fs.writeFileSync(idFile, idText.replace('"format"', '"formaT"'));
    expectStoreError(() => recoverLatestValid(d), 'STORE_IDENTITY_INVALID');
    expectStoreError(() => saveToStore(d, snap(300)), 'STORE_IDENTITY_INVALID');
    fs.writeFileSync(idFile, idText.replace(/"checksum":"(.)/, (_m, c: string) => `"checksum":"${c === 'a' ? 'b' : 'a'}`));
    expectStoreError(() => recoverLatestValid(d), 'STORE_IDENTITY_INVALID');
    fs.unlinkSync(idFile);
    expectStoreError(() => recoverLatestValid(d), 'STORE_IDENTITY_MISSING');
    expectStoreError(() => saveToStore(d, snap(300)), 'STORE_IDENTITY_MISSING');
    expect(ticksIn(d)).toEqual([100, 200]);
  });
});

describe('6. one directory = one world', () => {
  it('the identity is (simulationVersion, configHash), recorded on the first save', () => {
    const d = storeWith([100]);
    expect(readStoreIdentity(d)).toEqual({ simulationVersion: '0A.2.0', configHash: configHash(config) });
    expect(readStoreIdentity(d)).toEqual(worldIdentityOf(snap(800)));
  });

  it('same simulationVersion + same configHash → allowed, even from an independent run', () => {
    const d = storeWith([100, 200]);
    const c = defaultConfig(SEED); // separately built, equal config
    const independent = createSnapshot(worldAt(SEED, 900, c), c);
    expect(saveToStore(d, independent).written).toBe(true);
    expect(recoverLatestValid(d).report.selected?.tick).toBe(900);
  });

  it('a different configHash is refused and the directory is unchanged', () => {
    const d = storeWith([100, 200]);
    const before = dirState(d);
    const otherSeed = defaultConfig(SEED + 1);
    expectStoreError(() => saveToStore(d, createSnapshot(worldAt(SEED + 1, 300, otherSeed), otherSeed)), 'WORLD_IDENTITY_MISMATCH');
    const otherEcology = defaultConfig(SEED);
    otherEcology.food.regenAttemptsPerTick += 1;
    expectStoreError(() => saveToStore(d, createSnapshot(worldAt(SEED, 300, otherEcology), otherEcology)), 'WORLD_IDENTITY_MISMATCH');
    expect(dirState(d)).toEqual(before);
  });

  it('a different simulationVersion is refused and the directory is unchanged', () => {
    const d = storeWith([100, 200]);
    const before = dirState(d);
    const historical = singleFounderModelConfig();
    historical.rootSeed = SEED;
    const err = expectStoreError(() => saveToStore(d, createSnapshot(worldAt(SEED, 300, historical), historical)), 'WORLD_IDENTITY_MISMATCH');
    expect(err.message).toContain('0A.1.0');
    expect(err.message).toContain('0A.2.0');
    expect(dirState(d)).toEqual(before);
  });

  it('recovery and pruning refuse a directory that contains an intact snapshot of another world; nothing is deleted', () => {
    const d = storeWith([100, 200, 300, 400, 500]);
    const other = defaultConfig(SEED + 1);
    fs.writeFileSync(fileOf(d, 900), serializeSnapshot(createSnapshot(worldAt(SEED + 1, 900, other), other)));
    const before = dirState(d);
    expectStoreError(() => recoverLatestValid(d), 'WORLD_IDENTITY_MISMATCH');
    expectStoreError(() => pruneSnapshots(d, 2), 'WORLD_IDENTITY_MISMATCH');
    expectStoreError(() => saveToStore(d, createSnapshot(worldAt(SEED + 1, 1000, other), other)), 'WORLD_IDENTITY_MISMATCH');
    expect(dirState(d)).toEqual(before);
  });

  it('an intact snapshot of an unsupported simulationVersion refuses the directory instead of being skipped', () => {
    const d = storeWith([100, 200, 300]);
    const future = JSON.parse(serializeSnapshot(snap(800))) as Record<string, any>;
    future['simulationVersion'] = '0A.9.0';
    future['config']['simulationVersion'] = '0A.9.0';
    future['state']['simulationVersion'] = '0A.9.0';
    future['configHash'] = configHash(future['config']);
    future['checksum'] = computeSnapshotChecksum(future);
    fs.writeFileSync(fileOf(d, 800), JSON.stringify(future));
    expectStoreError(() => recoverLatestValid(d), 'WORLD_IDENTITY_MISMATCH');
    // ... while the same file with broken integrity is only corruption: skipped and reported.
    future['checksum'] = '0'.repeat(64);
    fs.writeFileSync(fileOf(d, 800), JSON.stringify(future));
    const r = recoverLatestValid(d);
    expect(r.report.skipped).toEqual([expect.objectContaining({ tick: 800, code: 'CHECKSUM_MISMATCH' })]);
    expect(r.report.selected?.tick).toBe(300);
  });
});

describe('7. duplicate and out-of-order ticks never overwrite', () => {
  it('re-saving a byte-identical snapshot is an idempotent no-op', () => {
    const d = storeWith([100, 200, 300]);
    const before = dirState(d);
    expect(saveToStore(d, snap(300))).toEqual({ tick: 300, fileName: snapshotFileName(300), written: false, pruned: [] });
    expect(saveToStore(d, snap(200)).written).toBe(false);
    expect(dirState(d)).toEqual(before);
  });

  it('different content for an existing tick is refused; the stored file is untouched', () => {
    const d = storeWith([100, 200, 300]);
    const { world, config: c } = restoreSnapshot(snap(300));
    world.nextFoodId += 1; // a valid, different world at the same tick
    const different = createSnapshot(world, c);
    expect(different.tick).toBe(300);
    const before = dirState(d);
    expectStoreError(() => saveToStore(d, different), 'DUPLICATE_TICK');
    expect(dirState(d)).toEqual(before);
  });

  it('a tick older than the newest stored snapshot is refused', () => {
    const d = storeWith([100, 300]);
    expectStoreError(() => saveToStore(d, snap(200)), 'NON_MONOTONIC_TICK');
    expect(ticksIn(d)).toEqual([100, 300]);
  });

  it('after a fallback, the corrupt newer file is never overwritten by the resumed world', () => {
    const d = storeWith([400, 500, 600, 700, 800]);
    flipByte(fileOf(d, 800));
    const corrupt = fs.readFileSync(fileOf(d, 800));
    const r = recoverLatestValid(d);
    const resumed = runTo(r.world, r.config, 800);
    const again = createSnapshot(resumed, r.config);
    expect(serializeSnapshot(again)).toBe(serializeSnapshot(snap(800))); // determinism: the same snapshot is recomputed
    expectStoreError(() => saveToStore(d, again), 'DUPLICATE_TICK');
    expect(fs.readFileSync(fileOf(d, 800)).equals(corrupt)).toBe(true);
  });
});

describe('8. atomic writes: leftovers are never snapshot candidates', () => {
  it('temporary, partial and look-alike files are ignored by listing, recovery and retention', () => {
    const d = storeWith([100, 200, 300, 400, 500]);
    const full = serializeSnapshot(snap(800));
    const strays: Record<string, string> = {
      [`.${snapshotFileName(900)}.4242.1.tmp`]: full.slice(0, 500), // a crash mid-write
      [`.${snapshotFileName(900)}.4242.2.tmp`]: full, // complete, but never renamed into place
      'snapshot-900.json': full, // wrong width
      [`${snapshotFileName(900)}.tmp`]: full,
      [`${snapshotFileName(900)}.partial`]: full.slice(0, 500),
      'snapshot-000000000900.JSON': full,
      [`.${STORE_IDENTITY_FILE}.4242.3.tmp`]: '{"format":',
    };
    for (const [name, text] of Object.entries(strays)) fs.writeFileSync(path.join(d, name), text);
    fs.mkdirSync(path.join(d, snapshotFileName(950))); // a directory with a snapshot name
    expect(ticksIn(d)).toEqual([100, 200, 300, 400, 500]);
    const r = recoverLatestValid(d);
    expect(r.report.candidates).toEqual([500, 400, 300, 200, 100].map(snapshotFileName));
    expect(r.report.skipped).toEqual([]);
    expect(r.report.selected?.tick).toBe(500);
    expect(saveToStore(d, snap(600)).pruned).toEqual([snapshotFileName(100)]);
    for (const name of Object.keys(strays)) expect(fs.existsSync(path.join(d, name)), name).toBe(true);
    expect(ticksIn(d)).toEqual([200, 300, 400, 500, 600]);
  });

  it('a save leaves no temporary file behind, and an invalid snapshot is never written', () => {
    const d = storeWith([100, 200]);
    expect(fs.readdirSync(d).sort()).toEqual([snapshotFileName(100), snapshotFileName(200), STORE_IDENTITY_FILE].sort());
    const tampered = JSON.parse(serializeSnapshot(snap(300))) as WorldSnapshotV1;
    tampered.stateHash = 'ffffffffffffffff';
    const before = dirState(d);
    expect(() => saveToStore(d, tampered)).toThrow(SnapshotError);
    expect(dirState(d)).toEqual(before);
  });
});

describe('9. recovery is deterministic and read-only', () => {
  it('recovering twice selects the same snapshot with the same report, and changes nothing', () => {
    const d = storeWith([100, 200, 300, 400, 500, 600, 700, 800]);
    flipByte(fileOf(d, 800));
    truncate(fileOf(d, 700));
    const before = dirState(d);
    const a = recoverLatestValid(d);
    const b = recoverLatestValid(d);
    expect(b.report).toEqual(a.report);
    expect(JSON.stringify(b.report)).toBe(JSON.stringify(a.report));
    expect(canonicalStateHash(b.world)).toBe(canonicalStateHash(a.world));
    expect(dirState(d)).toEqual(before);
    // The report carries no paths or timestamps: a copy of the directory recovers identically.
    const copy = path.join(newDir(), 'copy');
    fs.cpSync(d, copy, { recursive: true });
    expect(JSON.stringify(recoverLatestValid(copy).report)).toBe(JSON.stringify(a.report));
  });
});
