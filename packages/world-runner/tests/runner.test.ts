/**
 * The persistent world runner, in process: fresh launch, periodic saving,
 * restart/resume, multi-restart equivalence on the golden seed, corrupt
 * snapshot recovery, refusal to create over or without a world, save purity,
 * graceful stop.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { canonicalStateHash, MULTI_FOUNDER_MODEL_VERSION, DEFAULT_SIMULATION_CONFIG } from '@alo/simulation-core';
import {
  listSnapshots, readStoreIdentity, recoverLatestValid, snapshotFileName, configHash, SnapshotStoreError,
  STORE_IDENTITY_FILE, QUARANTINE_DIR,
} from '@alo/persistence';
import { WorldRunner, WorldRunnerError, worldExists, DEFAULT_SAVE_EVERY } from '../src/index.js';
import { GOLDEN_SEED, GOLDEN_HASH_10000, seedConfig, directHash, newWorldDir, dirState, flipByte } from './helpers.js';

const SEED = 11;
const ticksIn = (d: string) => listSnapshots(d).map((e) => e.tick);

function expectCode(fn: () => unknown, code: string): Error {
  try {
    fn();
  } catch (err) {
    expect((err as { code?: string }).code).toBe(code);
    return err as Error;
  }
  throw new Error(`expected ${code}, but nothing was thrown`);
}

describe('1. fresh launch', () => {
  it('creates the world, records its identity, saves tick 0, and advances', () => {
    const d = newWorldDir();
    expect(worldExists(d)).toBe(false);
    const r = WorldRunner.create(d, seedConfig(SEED), { saveEvery: 100 });
    expect(r.origin).toBe('fresh');
    expect(r.recovery).toBeNull();
    expect(r.config).toEqual(seedConfig(SEED));
    expect(r.world.simulationVersion).toBe(MULTI_FOUNDER_MODEL_VERSION);
    expect(r.tick).toBe(0);
    expect(readStoreIdentity(d)).toEqual({ simulationVersion: '0A.2.0', configHash: configHash(seedConfig(SEED)) });
    expect(ticksIn(d)).toEqual([0]);
    expect(worldExists(d)).toBe(true);
    r.runUntil(250);
    expect(r.tick).toBe(250);
    expect(ticksIn(d)).toEqual([0, 100, 200]);
    expect(r.snapshotTick).toBe(200);
    expect(r.close()).toBe(250);
    expect(ticksIn(d)).toEqual([0, 100, 200, 250]);
    expect(r.status()).toMatchObject({
      origin: 'fresh', tick: 250, snapshotTick: 250, simulationVersion: '0A.2.0', rootSeed: SEED,
      configHash: configHash(seedConfig(SEED)), saveEvery: 100, recoveredFromTick: null,
    });
    expect(DEFAULT_SAVE_EVERY).toBe(1000);
  });
});

describe('2. controlled run with periodic saves', () => {
  it('reaches the target tick with the same canonical hash as a direct uninterrupted simulation', () => {
    const d = newWorldDir();
    const r = WorldRunner.create(d, seedConfig(SEED), { saveEvery: 250 });
    r.runUntil(2000);
    r.close();
    expect(canonicalStateHash(r.world)).toBe(directHash(SEED, 2000));
    expect(ticksIn(d)).toEqual([1000, 1250, 1500, 1750, 2000]); // retention: newest 5
    expect(recoverLatestValid(d).report.selected?.stateHash).toBe(directHash(SEED, 2000));
  });
});

describe('3. restart / resume', () => {
  it('stop at a tick off the save cadence, reopen, continue: equal to the direct run', () => {
    const d = newWorldDir();
    const a = WorldRunner.create(d, seedConfig(SEED), { saveEvery: 500 });
    a.runUntil(1234);
    expect(a.close()).toBe(1234); // the stop saves the unsaved tick
    const b = WorldRunner.open(d, { saveEvery: 500 });
    expect(b.origin).toBe('recovered');
    expect(b.tick).toBe(1234);
    expect(b.config).toEqual(seedConfig(SEED)); // no seed needed: the stored config is used
    expect(b.recovery?.report.skipped).toEqual([]);
    expect(b.recovery?.quarantine).toBeNull();
    b.runUntil(2000);
    b.close();
    expect(canonicalStateHash(b.world)).toBe(directHash(SEED, 2000));
    expect(ticksIn(d)).toEqual([500, 1000, 1234, 1500, 2000]);
  });
});

describe('4. multi-restart equivalence on the golden seed', () => {
  it('0 → 3,000, restart, 3,000 → 7,000, restart, 7,000 → 10,000 == uninterrupted: b95a0b4ef7dd8449', () => {
    const d = newWorldDir();
    const first = WorldRunner.create(d, seedConfig(GOLDEN_SEED));
    first.runUntil(3000);
    first.close();
    const second = WorldRunner.open(d);
    expect(second.tick).toBe(3000);
    second.runUntil(7000);
    second.close();
    const third = WorldRunner.open(d);
    expect(third.tick).toBe(7000);
    third.runUntil(10000);
    third.close();
    expect(canonicalStateHash(third.world)).toBe(GOLDEN_HASH_10000);
    expect(recoverLatestValid(d).report.selected).toEqual({ fileName: snapshotFileName(10000), tick: 10000, stateHash: GOLDEN_HASH_10000 });
  }, 300_000);
});

describe('5. corrupt newest snapshot', () => {
  it('restart recovers the previous snapshot, quarantines the corrupt one, continues and saves, exactly', () => {
    const d = newWorldDir();
    const a = WorldRunner.create(d, seedConfig(SEED), { saveEvery: 100 });
    a.runUntil(1000);
    a.close();
    expect(ticksIn(d)).toEqual([600, 700, 800, 900, 1000]);
    const corrupt = flipByte(path.join(d, snapshotFileName(1000)));
    const b = WorldRunner.open(d, { saveEvery: 100 });
    expect(b.tick).toBe(900);
    expect(b.recovery?.report.skipped.map((s) => s.tick)).toEqual([1000]);
    expect(b.recovery?.quarantine?.moved.map((m) => m.fileName)).toEqual([snapshotFileName(1000)]);
    expect(b.status().recoveredFromTick).toBe(900);
    expect(fs.readFileSync(path.join(d, QUARANTINE_DIR, snapshotFileName(1000))).equals(corrupt)).toBe(true);
    b.runUntil(1500);
    b.close();
    expect(ticksIn(d)).toEqual([1100, 1200, 1300, 1400, 1500]); // saving resumed through and past 1000
    expect(canonicalStateHash(b.world)).toBe(directHash(SEED, 1500));
    const c = WorldRunner.open(d);
    expect(c.recovery?.report.skipped).toEqual([]);
    expect(c.tick).toBe(1500);
  });
});

describe('6. no valid snapshot: startup fails, no world is created', () => {
  it('all snapshots corrupt → refused, directory unchanged', () => {
    const d = newWorldDir();
    const a = WorldRunner.create(d, seedConfig(SEED), { saveEvery: 100 });
    a.runUntil(1000);
    a.close();
    for (const t of ticksIn(d)) flipByte(path.join(d, snapshotFileName(t)));
    const before = dirState(d);
    const err = expectCode(() => WorldRunner.open(d), 'NO_VALID_SNAPSHOT');
    expect(err).toBeInstanceOf(SnapshotStoreError);
    expect(dirState(d)).toEqual(before); // nothing quarantined, nothing written
  });

  it('a missing or empty directory is refused and left as it was', () => {
    const missing = newWorldDir();
    expectCode(() => WorldRunner.open(missing), 'NO_VALID_SNAPSHOT');
    expect(fs.existsSync(missing)).toBe(false);
    const empty = newWorldDir();
    fs.mkdirSync(empty);
    expectCode(() => WorldRunner.open(empty), 'NO_VALID_SNAPSHOT');
    expect(fs.readdirSync(empty)).toEqual([]);
  });
});

describe('7. creating over an existing world is refused', () => {
  it('a healthy world, a broken world, a bare identity, or quarantine leftovers all refuse create', () => {
    const d = newWorldDir();
    const a = WorldRunner.create(d, seedConfig(SEED), { saveEvery: 100 });
    a.runUntil(300);
    a.close();
    let before = dirState(d);
    expect(() => WorldRunner.create(d, seedConfig(SEED + 1))).toThrow(WorldRunnerError);
    expectCode(() => WorldRunner.create(d, seedConfig(SEED)), 'WORLD_EXISTS');
    expect(dirState(d)).toEqual(before);
    for (const t of ticksIn(d)) flipByte(path.join(d, snapshotFileName(t))); // a broken world is still a world
    before = dirState(d);
    expectCode(() => WorldRunner.create(d, seedConfig(SEED + 1)), 'WORLD_EXISTS');
    expect(dirState(d)).toEqual(before);
    const bare = newWorldDir();
    fs.mkdirSync(bare);
    fs.copyFileSync(path.join(d, STORE_IDENTITY_FILE), path.join(bare, STORE_IDENTITY_FILE));
    expectCode(() => WorldRunner.create(bare, seedConfig(SEED)), 'WORLD_EXISTS');
    const leftovers = newWorldDir();
    fs.mkdirSync(path.join(leftovers, QUARANTINE_DIR), { recursive: true });
    expectCode(() => WorldRunner.create(leftovers, seedConfig(SEED)), 'WORLD_EXISTS');
  });

  it('an existing empty directory, or one with unrelated files only, may hold a new world', () => {
    const d = newWorldDir();
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'notes.txt'), 'x');
    expect(WorldRunner.create(d, seedConfig(SEED)).tick).toBe(0);
    expect(fs.readFileSync(path.join(d, 'notes.txt'), 'utf-8')).toBe('x');
  });
});

describe('8. save purity', () => {
  it('saving every tick, every 37 ticks, or never in between gives the same final world as a direct run', () => {
    const every1 = WorldRunner.create(newWorldDir(), seedConfig(SEED), { saveEvery: 1 });
    every1.runUntil(300);
    expect(canonicalStateHash(every1.world)).toBe(directHash(SEED, 300));
    const every37 = WorldRunner.create(newWorldDir(), seedConfig(SEED), { saveEvery: 37 });
    every37.runUntil(1500);
    const never = WorldRunner.create(newWorldDir(), seedConfig(SEED), { saveEvery: 1_000_000 });
    never.runUntil(1500);
    expect(never.snapshotTick).toBe(0);
    expect(canonicalStateHash(every37.world)).toBe(canonicalStateHash(never.world));
    expect(canonicalStateHash(never.world)).toBe(directHash(SEED, 1500));
  });

  it('the runner never modifies the configuration it was given', () => {
    const c = seedConfig(SEED);
    const before = JSON.stringify(c);
    const r = WorldRunner.create(newWorldDir(), c, { saveEvery: 50 });
    r.runUntil(200);
    r.close();
    expect(JSON.stringify(c)).toBe(before);
    expect(JSON.stringify(DEFAULT_SIMULATION_CONFIG)).toBe(JSON.stringify(seedConfig(DEFAULT_SIMULATION_CONFIG.rootSeed)));
  });
});

describe('graceful stop through run()', () => {
  it('run(untilTick) saves the final tick; stop() mid-run stops after the current tick and saves it', async () => {
    const d = newWorldDir();
    const r = WorldRunner.create(d, seedConfig(SEED), { saveEvery: 400 });
    expect(await r.run({ untilTick: 1111 })).toEqual({ reason: 'until-tick', tick: 1111, snapshotTick: 1111 });
    const seen: number[] = [];
    const result = await r.run({
      batchTicks: 50,
      statusEvery: 100,
      onStatus: (s) => { seen.push(s.tick); if (s.tick === 1700) r.stop(); },
    });
    expect(result).toEqual({ reason: 'stopped', tick: 1700, snapshotTick: 1700 });
    expect(seen).toEqual([1200, 1300, 1400, 1500, 1600, 1700]);
    expect(r.status().stopRequested).toBe(true);
    expect(ticksIn(d)).toEqual([400, 800, 1111, 1200, 1600, 1700].slice(-5));
    const resumed = WorldRunner.open(d);
    expect(resumed.tick).toBe(1700);
    resumed.runUntil(2000);
    expect(canonicalStateHash(resumed.world)).toBe(directHash(SEED, 2000));
  });

  it('options are validated', async () => {
    expectCode(() => WorldRunner.create(newWorldDir(), seedConfig(SEED), { saveEvery: 0 }), 'INVALID_OPTIONS');
    expectCode(() => WorldRunner.open(newWorldDir(), { keep: 1.5 }), 'INVALID_OPTIONS');
    const r = WorldRunner.create(newWorldDir(), seedConfig(SEED));
    await expect(r.run({ untilTick: -1 })).rejects.toThrow(WorldRunnerError);
    const p = r.run({ untilTick: 50 });
    await expect(r.run({ untilTick: 60 })).rejects.toThrow('ALREADY_RUNNING');
    await p;
  });
});
