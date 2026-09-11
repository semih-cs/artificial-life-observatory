/**
 * Phase 0C slice 2 regression: fallback recovery preserves deterministic
 * continuation. Golden seed, canonical 0A.2.0 model.
 *
 *   uninterrupted run to 10,000, saving to a store every 1,000 ticks (retention 5)
 *   → corrupt the newest snapshot(s) → recoverLatestValid → resume to 10,000
 *   == the uninterrupted run, hash-equal every 1,000 ticks, ending at b95a0b4ef7dd8449.
 *
 * And the full cleanup flow: fallback → quarantine → resume → save → recover.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { bootstrapWorld, stepWorld, canonicalStateHash, MULTI_FOUNDER_MODEL_VERSION } from '@alo/simulation-core';
import type { WorldState } from '@alo/simulation-core';
import {
  createSnapshot, saveToStore, listSnapshots, recoverLatestValid, quarantineSkippedSnapshots, snapshotFileName, QUARANTINE_DIR,
} from '../src/index.js';
import { defaultConfig } from './helpers.js';

const GOLDEN_SEED = 20260910;
const GOLDEN_HASH_10000 = 'b95a0b4ef7dd8449';
const EVERY = 1000;
const reference = new Map<number, string>();
let pristine = '';

beforeAll(() => {
  const config = defaultConfig(GOLDEN_SEED);
  expect(config.simulationVersion).toBe(MULTI_FOUNDER_MODEL_VERSION);
  pristine = fs.mkdtempSync(path.join(os.tmpdir(), 'alo-store-recovery-'));
  let world: WorldState = bootstrapWorld(config);
  while (world.tick < 10000) {
    world = stepWorld(world, config).world;
    if (world.tick % EVERY !== 0) continue;
    reference.set(world.tick, canonicalStateHash(world));
    if (world.tick <= 9000) saveToStore(pristine, createSnapshot(world, config)); // saved from the LIVE world; the run carries on
  }
}, 300_000);

/** A private copy of the pristine store, with the given snapshots corrupted by one flipped byte. */
function storeWithCorrupt(ticks: number[]): string {
  const d = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'alo-store-recovery-case-')), 'store');
  fs.cpSync(pristine, d, { recursive: true });
  for (const t of ticks) {
    const f = path.join(d, snapshotFileName(t));
    const b = fs.readFileSync(f);
    b[Math.floor(b.length / 2)]! ^= 0x01;
    fs.writeFileSync(f, b);
  }
  return d;
}

function recoverAndResume(d: string, toTick: number) {
  const r = recoverLatestValid(d);
  let world = r.world;
  const hashes = new Map<number, string>();
  while (world.tick < toTick) {
    world = stepWorld(world, r.config).world;
    if (world.tick % EVERY === 0) hashes.set(world.tick, canonicalStateHash(world));
  }
  return { report: r.report, hashes };
}

describe('fallback recovery preserves exact continuation', () => {
  it('the uninterrupted run reaches the golden hash while saving; the store keeps the newest 5', () => {
    expect(reference.get(10000)).toBe(GOLDEN_HASH_10000);
    expect(listSnapshots(pristine).map((e) => e.tick)).toEqual([5000, 6000, 7000, 8000, 9000]);
  });

  it('corrupt newest (9,000) → recover 8,000 → resume to 10,000 == uninterrupted, ending at b95a0b4ef7dd8449', () => {
    const { report, hashes } = recoverAndResume(storeWithCorrupt([9000]), 10000);
    expect(report.selected?.tick).toBe(8000);
    expect(report.selected?.stateHash).toBe(reference.get(8000));
    expect(report.skipped.map((s) => s.tick)).toEqual([9000]);
    for (const t of [9000, 10000]) expect(hashes.get(t), `tick ${t}`).toBe(reference.get(t));
    expect(hashes.get(10000)).toBe(GOLDEN_HASH_10000);
  }, 300_000);

  it('corrupt newest three (9,000, 8,000, 7,000) → recover 6,000 → resume to 10,000 == uninterrupted', () => {
    const { report, hashes } = recoverAndResume(storeWithCorrupt([9000, 8000, 7000]), 10000);
    expect(report.selected?.tick).toBe(6000);
    expect(report.skipped.map((s) => s.tick)).toEqual([9000, 8000, 7000]);
    for (let t = 7000; t <= 10000; t += EVERY) expect(hashes.get(t), `tick ${t}`).toBe(reference.get(t));
    expect(hashes.get(10000)).toBe(GOLDEN_HASH_10000);
  }, 300_000);
});

describe('golden fallback → quarantine → resume → save → recover', () => {
  it('corrupt 9,000 is quarantined as evidence; the resumed world saves 9,000 and 10,000; recovery selects 10,000 at b95a0b4ef7dd8449', () => {
    // 1–3: canonical seed saved every 1,000 ticks (store holds 5,000–9,000); corrupt 9,000.
    const d = storeWithCorrupt([9000]);
    const f9000 = snapshotFileName(9000);
    const corruptBytes = fs.readFileSync(path.join(d, f9000));
    // 4: recovery falls back to 8,000.
    const r = recoverLatestValid(d);
    expect(r.report.selected?.tick).toBe(8000);
    expect(r.report.skipped.map((s) => s.fileName)).toEqual([f9000]);
    // 5: quarantine moves exactly the corrupt 9,000.
    const q = quarantineSkippedSnapshots(d, r.report);
    expect(q.moved).toEqual([expect.objectContaining({ fileName: f9000, quarantinedAs: f9000 })]);
    expect(q.kept).toEqual([]);
    expect(listSnapshots(d).map((e) => e.tick)).toEqual([5000, 6000, 7000, 8000]);
    // 6–8: resume from 8,000, saving 9,000 and 10,000 through the store.
    let world = r.world;
    const saved: Array<{ tick: number; written: boolean }> = [];
    while (world.tick < 10000) {
      world = stepWorld(world, r.config).world;
      if (world.tick % EVERY !== 0) continue;
      expect(canonicalStateHash(world), `tick ${world.tick}`).toBe(reference.get(world.tick));
      const res = saveToStore(d, createSnapshot(world, r.config));
      saved.push({ tick: res.tick, written: res.written });
    }
    expect(saved).toEqual([{ tick: 9000, written: true }, { tick: 10000, written: true }]);
    expect(listSnapshots(d).map((e) => e.tick)).toEqual([6000, 7000, 8000, 9000, 10000]);
    // 9–11: recovery now selects 10,000 with no skipped snapshots, at the golden hash.
    const after = recoverLatestValid(d);
    expect(after.report.selected).toEqual({ fileName: snapshotFileName(10000), tick: 10000, stateHash: GOLDEN_HASH_10000 });
    expect(after.report.skipped).toEqual([]);
    expect(canonicalStateHash(after.world)).toBe(GOLDEN_HASH_10000);
    expect(canonicalStateHash(world)).toBe(GOLDEN_HASH_10000);
    // 12: the corrupted 9,000 survives in quarantine, byte-identical.
    expect(fs.readdirSync(path.join(d, QUARANTINE_DIR))).toEqual([f9000]);
    expect(fs.readFileSync(path.join(d, QUARANTINE_DIR, f9000)).equals(corruptBytes)).toBe(true);
  }, 300_000);
});
