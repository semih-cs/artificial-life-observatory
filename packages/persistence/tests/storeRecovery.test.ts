/**
 * Phase 0C slice 2 regression: fallback recovery preserves deterministic
 * continuation. Golden seed, canonical 0A.2.0 model.
 *
 *   uninterrupted run to 10,000, saving to a store every 1,000 ticks (retention 5)
 *   → corrupt the newest snapshot(s) → recoverLatestValid → resume to 10,000
 *   == the uninterrupted run, hash-equal every 1,000 ticks, ending at b95a0b4ef7dd8449.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { bootstrapWorld, stepWorld, canonicalStateHash, MULTI_FOUNDER_MODEL_VERSION } from '@alo/simulation-core';
import type { WorldState } from '@alo/simulation-core';
import { createSnapshot, saveToStore, listSnapshots, recoverLatestValid, snapshotFileName } from '../src/index.js';
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
