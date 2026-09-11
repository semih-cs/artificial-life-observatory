/**
 * The Phase 0C slice-1 invariant (Spec v4 §18.60, §19.27 [LOCKED]):
 * continuous run == save → serialize → file → load → restore → resume,
 * compared by canonical state hash every 1,000 ticks. Canonical 0A.2.0 model.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bootstrapWorld, stepWorld, canonicalStateHash, MULTI_FOUNDER_MODEL_VERSION } from '@alo/simulation-core';
import type { WorldState } from '@alo/simulation-core';
import {
  createSnapshot, serializeSnapshot, parseSnapshot, restoreSnapshot, saveSnapshotAtomic, loadSnapshot, WorldSnapshotV1,
} from '../src/index.js';
import { defaultConfig } from './helpers.js';

const GOLDEN_SEED = 20260910;
const GOLDEN_HASH_10000 = 'b95a0b4ef7dd8449';
const EVERY = 1000;
const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alo-persistence-'));

const reference = new Map<number, string>();
const snapshots = new Map<number, WorldSnapshotV1>();

beforeAll(() => {
  // One uninterrupted reference run to 20,000 ticks. Snapshots are taken from the
  // LIVE world at 5,000 and 10,000 and the run simply carries on — so the golden
  // hash at 10,000 below also proves that saving does not disturb the world.
  const config = defaultConfig(GOLDEN_SEED);
  expect(config.simulationVersion).toBe(MULTI_FOUNDER_MODEL_VERSION);
  expect(config.bootstrap.founderGroupCount).toBe(5);
  let world: WorldState = bootstrapWorld(config);
  while (world.tick < 20000) {
    world = stepWorld(world, config).world;
    if (world.tick === 5000 || world.tick === 10000) snapshots.set(world.tick, createSnapshot(world, config));
    if (world.tick % EVERY === 0) reference.set(world.tick, canonicalStateHash(world));
  }
}, 300_000);

function resumeFromFile(snapshot: WorldSnapshotV1, name: string, toTick: number): Map<number, string> {
  const file = path.join(tmpDir, name);
  saveSnapshotAtomic(file, parseSnapshot(serializeSnapshot(snapshot)));
  const { world: restored, config } = restoreSnapshot(loadSnapshot(file));
  let world = restored;
  const hashes = new Map<number, string>();
  while (world.tick < toTick) {
    world = stepWorld(world, config).world;
    if (world.tick % EVERY === 0) hashes.set(world.tick, canonicalStateHash(world));
  }
  return hashes;
}

describe('save → load → resume continues the canonical trajectory exactly', () => {
  it('the uninterrupted reference reproduces the golden hash despite live snapshots', () => {
    expect(reference.get(10000)).toBe(GOLDEN_HASH_10000);
    expect(reference.size).toBe(20);
  });

  it('continuous 20,000 == 10,000 → snapshot → file → load → restore → 20,000, hash-equal every 1,000 ticks', () => {
    const resumed = resumeFromFile(snapshots.get(10000)!, 'at-10000.snapshot.json', 20000);
    expect(resumed.size).toBe(10);
    for (let t = 11000; t <= 20000; t += EVERY) expect(resumed.get(t), `tick ${t}`).toBe(reference.get(t));
  }, 300_000);

  it('golden resume: seed 20260910 saved at 5,000 and resumed to 10,000 gives b95a0b4ef7dd8449', () => {
    const resumed = resumeFromFile(snapshots.get(5000)!, 'at-5000.snapshot.json', 10000);
    for (let t = 6000; t <= 10000; t += EVERY) expect(resumed.get(t), `tick ${t}`).toBe(reference.get(t));
    expect(resumed.get(10000)).toBe(GOLDEN_HASH_10000);
  }, 300_000);

  it('separate processes: A creates and saves, a fresh B loads and resumes; hashes match the reference', () => {
    const fixture = path.join(here, 'fixtures', 'process.mjs');
    const file = path.join(tmpDir, 'separate-process.snapshot.json');
    const a = JSON.parse(execFileSync(process.execPath, [fixture, 'create', String(GOLDEN_SEED), '10000', file], { encoding: 'utf-8' }));
    expect(a.tick).toBe(10000);
    expect(a.hash).toBe(GOLDEN_HASH_10000);
    expect(a.pid).not.toBe(process.pid);
    const b = JSON.parse(execFileSync(process.execPath, [fixture, 'resume', file, '20000', String(EVERY)], { encoding: 'utf-8' }));
    expect(b.pid).not.toBe(process.pid);
    expect(b.pid).not.toBe(a.pid);
    expect(b.startTick).toBe(10000);
    for (let t = 11000; t <= 20000; t += EVERY) expect(b.hashes[String(t)], `tick ${t}`).toBe(reference.get(t));
  }, 300_000);
});
