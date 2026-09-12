/**
 * Snapshot format v3 (V2.4, model 0A.6.0) next to formats v1 and v2.
 *
 *  - Who is handling which item, and how far along, decides who is about to be
 *    fed — future-affecting state — so a 0A.6.0 world is stored in format v3,
 *    which carries `holderId` and `handlingProgress` per FOOD item.
 *  - Formats v1 and v2 are untouched: the v1.0.0 and V2.1 fixtures still load
 *    byte-exactly, and 0A.4.0 / 0A.5.0 still store as v2 with no handling
 *    state anywhere.
 *  - Nothing is converted: a v2 world cannot pass as 0A.6.0 and a v3 world
 *    cannot pass as 0A.5.0, in either direction.
 *  - Exact resume is proved at every handling progress, and immediately after
 *    a dislodgement.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  bootstrapWorld, stepWorld, canonicalStateHash, canonicalStateString,
  foodHandlingModelConfig, physicalBodiesModelConfig, recurrentMemoryModelConfig,
  FOOD_HANDLING_GOLDEN_HASH, HANDLING_TICKS_REQUIRED,
} from '@alo/simulation-core';
import type { WorldState, FoodItem } from '@alo/simulation-core';
import type { WorldSnapshot } from '../src/index.js';
import {
  createSnapshot, serializeSnapshot, parseSnapshot, restoreSnapshot, validateSnapshot,
  saveSnapshotAtomic, loadSnapshot, computeSnapshotChecksum, configHash, saveToStore,
  recoverLatestValid, SnapshotError, SUPPORTED_SIMULATION_VERSIONS, SUPPORTED_SNAPSHOT_FORMAT_VERSIONS,
  FOOD_HANDLING_SNAPSHOT_FORMAT_VERSION, snapshotFormatVersionFor,
} from '../src/index.js';
import { runTo } from './helpers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alo-handling-'));
/** Coverage seed (NOT canonical): the 0A.6.0 world with the most handling, births and contact. */
const ACTIVE_SEED = 8;

function v6(seed: number) { const c = foodHandlingModelConfig(); c.rootSeed = seed; return c; }

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

/** Step a world until at least one item is held with the given progress; returns that world. */
function worldWithProgress(c: ReturnType<typeof v6>, progress: number, limit = 4000): WorldState {
  let w = bootstrapWorld(c);
  for (let t = 0; t < limit; t++) {
    w = stepWorld(w, c).world;
    if (w.food.some((f) => f.holderId !== null && f.handlingProgress === progress)) return w;
  }
  throw new Error(`no world reached handling progress ${progress} within ${limit} ticks`);
}

describe('format v3 is the 0A.6.0 format, and v1 / v2 are untouched', () => {
  it('(49, 50) the model -> format mapping gained one entry and nothing else moved', () => {
    expect(SUPPORTED_SIMULATION_VERSIONS).toEqual(['0A.6.0', '0A.5.0', '0A.4.0', '0A.3.0', '0A.2.0', '0A.1.0']);
    expect(SUPPORTED_SNAPSHOT_FORMAT_VERSIONS).toEqual([1, 2, 3]);
    expect(FOOD_HANDLING_SNAPSHOT_FORMAT_VERSION).toBe(3);
    expect(['0A.1.0', '0A.2.0', '0A.3.0', '0A.4.0', '0A.5.0', '0A.6.0'].map(snapshotFormatVersionFor))
      .toEqual([1, 1, 1, 2, 2, 3]);
  });

  it('(50) 0A.4.0 and 0A.5.0 still store as v2, with no handling state on any food item', () => {
    for (const make of [recurrentMemoryModelConfig, physicalBodiesModelConfig]) {
      const c = make();
      c.rootSeed = ACTIVE_SEED;
      const w = runTo(bootstrapWorld(c), c, 200);
      const snap = createSnapshot(w, c);
      expect(snap.snapshotFormatVersion).toBe(2);
      const state = snap.state as any;
      expect(state.food.length).toBeGreaterThan(0);
      for (const f of state.food) expect(Object.keys(f).sort()).toEqual(['id', 'x', 'y']);
      expect((snap.config as any).handling).toBeUndefined();
    }
  });

  it('(49) a 0A.6.0 snapshot is format v3 and stores every item\'s holder and progress exactly', () => {
    const c = v6(ACTIVE_SEED);
    const w = worldWithProgress(c, 2);
    const snap = createSnapshot(w, c);
    expect(snap.snapshotFormatVersion).toBe(3);
    expect(snap.simulationVersion).toBe('0A.6.0');
    expect((snap.config as any).handling).toEqual({ ticksRequired: 5 });

    const state = snap.state as any;
    for (const f of state.food) {
      // The stored state is the canonical record written through the
      // deterministic serializer, so its keys are sorted.
      expect(Object.keys(f).sort()).toEqual(['handlingProgress', 'holderId', 'id', 'x', 'y']);
      expect(f.holderId === null || Number.isInteger(f.holderId)).toBe(true);
      expect(Number.isInteger(f.handlingProgress)).toBe(true);
    }
    expect(state.food.some((f: any) => f.holderId !== null)).toBe(true);

    // Nothing derived is persisted: no contact, collision or dislodgement data.
    const stateText = JSON.stringify(state);
    for (const forbidden of ['contact', 'collision', 'dislodg', 'steal', 'overlap', 'possess', 'damage']) {
      expect(stateText.includes(forbidden), forbidden).toBe(false);
    }

    const restored = restoreSnapshot(parseSnapshot(serializeSnapshot(snap)));
    expect(canonicalStateString(restored.world)).toBe(canonicalStateString(w));
  }, 60_000);

  it('(51, 52, 53) invalid handling state is rejected, never repaired', () => {
    const c = v6(ACTIVE_SEED);
    const w = worldWithProgress(c, 2);
    const snap = createSnapshot(w, c);
    const heldIndex = (snap.state as any).food.findIndex((f: any) => f.holderId !== null);
    const freeIndex = (snap.state as any).food.findIndex((f: any) => f.holderId === null);
    expect(heldIndex).toBeGreaterThanOrEqual(0);
    expect(freeIndex).toBeGreaterThanOrEqual(0);

    // (51) a holder id that is not a living organism of this world
    expectCode(() => validateSnapshot(resealed(snap, (o: any) => { o.state.food[heldIndex].holderId = 999999; })), 'MALFORMED_WORLD_STATE');
    // (52) one organism holding two items
    expectCode(() => validateSnapshot(resealed(snap, (o: any) => {
      o.state.food[freeIndex].holderId = o.state.food[heldIndex].holderId;
      o.state.food[freeIndex].handlingProgress = 1;
    })), 'MALFORMED_WORLD_STATE');
    // (53) progress out of range, non-integer, or non-zero on a free item
    for (const bad of [0, HANDLING_TICKS_REQUIRED + 1, -1, 2.5]) {
      expectCode(() => validateSnapshot(resealed(snap, (o: any) => { o.state.food[heldIndex].handlingProgress = bad; })), 'MALFORMED_WORLD_STATE');
    }
    expectCode(() => validateSnapshot(resealed(snap, (o: any) => { o.state.food[freeIndex].handlingProgress = 3; })), 'MALFORMED_WORLD_STATE');
    // missing keys entirely
    expectCode(() => validateSnapshot(resealed(snap, (o: any) => { delete o.state.food[freeIndex].holderId; })), 'MALFORMED_WORLD_STATE');
    expectCode(() => validateSnapshot(resealed(snap, (o: any) => { delete o.state.food[heldIndex].handlingProgress; })), 'MALFORMED_WORLD_STATE');
    // a dead organism can never be a holder: kill one and point an item at it
    expectCode(() => validateSnapshot(resealed(snap, (o: any) => {
      const victim = o.state.organisms[0];
      victim.alive = false;
      victim.deathCause = 'MAX_AGE';
      victim.deathTick = o.state.tick;
      o.state.food[freeIndex].holderId = victim.id;
      o.state.food[freeIndex].handlingProgress = 1;
    })), 'MALFORMED_WORLD_STATE');
    // and the untouched snapshot is still perfectly valid
    expect(() => validateSnapshot(JSON.parse(JSON.stringify(snap)))).not.toThrow();
  }, 60_000);

  it('(54) cross-model relabelling is refused in both directions', () => {
    const c6 = v6(ACTIVE_SEED);
    const w6 = worldWithProgress(c6, 1);
    const snap6 = createSnapshot(w6, c6);

    // v3 state relabelled as 0A.5.0: the format is checked against the model
    // before anything else is trusted, so this is refused immediately — with
    // or without the `handling` config section.
    expectCode(() => validateSnapshot(resealed(snap6, (o: any) => {
      o.simulationVersion = o.state.simulationVersion = o.config.simulationVersion = '0A.5.0';
    })), 'UNSUPPORTED_FORMAT_VERSION');
    expectCode(() => validateSnapshot(resealed(snap6, (o: any) => {
      o.simulationVersion = o.state.simulationVersion = o.config.simulationVersion = '0A.5.0';
      delete o.config.handling;
    })), 'UNSUPPORTED_FORMAT_VERSION');
    // …and relabelling the format too then fails on the config: a 0A.5.0
    // configuration may never carry a handling contract.
    expectCode(() => validateSnapshot(resealed(snap6, (o: any) => {
      o.simulationVersion = o.state.simulationVersion = o.config.simulationVersion = '0A.5.0';
      o.snapshotFormatVersion = 2;
    })), 'INVALID_CONFIG');
    // 0A.6.0 is never stored as v2
    expectCode(() => validateSnapshot(resealed(snap6, (o: any) => { o.snapshotFormatVersion = 2; })), 'UNSUPPORTED_FORMAT_VERSION');

    // v2 state relabelled as 0A.6.0: wrong format, and no handling state
    const c5 = physicalBodiesModelConfig(); c5.rootSeed = ACTIVE_SEED;
    const snap5 = createSnapshot(runTo(bootstrapWorld(c5), c5, 200), c5);
    expectCode(() => validateSnapshot(resealed(snap5, (o: any) => {
      o.simulationVersion = o.state.simulationVersion = o.config.simulationVersion = '0A.6.0';
    })), 'UNSUPPORTED_FORMAT_VERSION');
    expectCode(() => validateSnapshot(resealed(snap5, (o: any) => {
      o.simulationVersion = o.state.simulationVersion = o.config.simulationVersion = '0A.6.0';
      o.snapshotFormatVersion = 3;
      o.config.handling = { ticksRequired: 5 };
    })), 'MALFORMED_WORLD_STATE'); // food carries no holder/progress
    // a historical model may never carry handling state on its food
    expectCode(() => validateSnapshot(resealed(snap5, (o: any) => {
      for (const f of o.state.food) { f.holderId = null; f.handlingProgress = 0; }
    })), 'MALFORMED_WORLD_STATE');
    // and a 0A.6.0 world cannot be stepped under a 0A.5.0 configuration
    expect(() => stepWorld(w6, c5)).toThrow(/never stepped under another model/);
    expect(() => createSnapshot(w6, c5)).toThrow(SnapshotError);
  }, 60_000);
});

describe('(55, 56, 57) 0A.6.0 save / load / resume is exact, handling included', () => {
  const c = v6(ACTIVE_SEED);
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

  it('(55) continuous 2,500 == save at 500 / 1,000 / 1,500 / 2,000 -> file -> load -> restore -> 2,500', () => {
    for (const at of [500, 1000, 1500, 2000]) {
      const file = path.join(tmpDir, `v6-at-${at}.snapshot.json`);
      saveSnapshotAtomic(file, parseSnapshot(serializeSnapshot(snapshots.get(at)!)));
      const { world, config } = restoreSnapshot(loadSnapshot(file));
      expect(config.simulationVersion).toBe('0A.6.0');
      expect((config as any).handling).toEqual({ ticksRequired: 5 });
      let w = world;
      while (w.tick < 2500) {
        w = stepWorld(w, config).world;
        if (w.tick % 250 === 0) expect(canonicalStateHash(w), `resumed from ${at}, tick ${w.tick}`).toBe(reference.get(w.tick));
      }
    }
    expect(reference.get(2500)).toBe('e21dc19bcc7a85ec'); // the coverage checkpoint pinned in simulation-core
  }, 120_000);

  it('(55) resume is exact at EVERY handling progress — 1, 2, 3, 4 and the tick before completion', () => {
    for (let progress = 1; progress < HANDLING_TICKS_REQUIRED; progress++) {
      const w = worldWithProgress(c, progress);
      const held = w.food.filter((f) => f.holderId !== null && f.handlingProgress === progress);
      expect(held.length, `progress ${progress}`).toBeGreaterThan(0);

      // continuous: 40 more ticks from here
      let straight: WorldState = w;
      for (let t = 0; t < 40; t++) straight = stepWorld(straight, c).world;

      // through a file, and back
      const file = path.join(tmpDir, `v6-progress-${progress}.snapshot.json`);
      saveSnapshotAtomic(file, createSnapshot(w, c));
      const restored = restoreSnapshot(loadSnapshot(file));
      expect(restored.world.food.filter((f: FoodItem) => f.handlingProgress === progress && f.holderId !== null).length)
        .toBe(held.length);
      let resumed: WorldState = restored.world;
      for (let t = 0; t < 40; t++) resumed = stepWorld(resumed, restored.config).world;
      expect(canonicalStateHash(resumed), `progress ${progress}`).toBe(canonicalStateHash(straight));
    }
    // progress 4 is the highest a snapshot can ever record: an item that
    // reaches ticksRequired is consumed inside the same step.
    expect(() => worldWithProgress(c, HANDLING_TICKS_REQUIRED, 600)).toThrow(/no world reached handling progress 5/);
  }, 120_000);

  it('(56) resume is exact immediately after a dislodgement / drop', () => {
    // Find a tick where an item that WAS held becomes free again.
    let w = bootstrapWorld(c);
    let dropWorld: WorldState | null = null;
    let previous = new Map<number, number | null | undefined>();
    for (let t = 0; t < 4000 && dropWorld === null; t++) {
      const before = new Map(w.food.map((f) => [f.id, f.holderId]));
      w = stepWorld(w, c).world;
      for (const f of w.food) {
        const was = before.get(f.id);
        if (was !== undefined && was !== null && f.holderId === null) { dropWorld = w; break; }
      }
      previous = before;
    }
    expect(dropWorld, 'no drop observed').not.toBeNull();
    expect(previous.size).toBeGreaterThan(0);

    let straight: WorldState = dropWorld!;
    for (let t = 0; t < 60; t++) straight = stepWorld(straight, c).world;
    const restored = restoreSnapshot(parseSnapshot(serializeSnapshot(createSnapshot(dropWorld!, c))));
    let resumed: WorldState = restored.world;
    for (let t = 0; t < 60; t++) resumed = stepWorld(resumed, restored.config).world;
    expect(canonicalStateHash(resumed)).toBe(canonicalStateHash(straight));
  }, 120_000);

  it('(57) golden resume: the canonical seed saved at 1,000 and resumed to 10,000 gives the 0A.6.0 golden hash', () => {
    const g = v6(20260910);
    const at1000 = runTo(bootstrapWorld(g), g, 1000);
    const { world, config } = restoreSnapshot(parseSnapshot(serializeSnapshot(createSnapshot(at1000, g))));
    expect(canonicalStateHash(runTo(world, config, 10000))).toBe(FOOD_HANDLING_GOLDEN_HASH);
  }, 60_000);

  it('separate processes: A creates a 0A.6.0 world and saves at 1,000; a fresh B resumes it to 2,500', () => {
    const fixture = path.join(here, 'fixtures', 'process.mjs');
    const file = path.join(tmpDir, 'v6-separate-process.snapshot.json');
    const a = JSON.parse(execFileSync(process.execPath, [fixture, 'create', String(ACTIVE_SEED), '1000', file, '0A.6.0'], { encoding: 'utf-8' }));
    expect(a.hash).toBe(reference.get(1000));
    const b = JSON.parse(execFileSync(process.execPath, [fixture, 'resume', file, '2500', '250'], { encoding: 'utf-8' }));
    expect(b.pid).not.toBe(a.pid);
    expect(b.simulationVersion).toBe('0A.6.0');
    for (let t = 1250; t <= 2500; t += 250) expect(b.hashes[String(t)], `tick ${t}`).toBe(reference.get(t));
  }, 120_000);

  it('a 0A.6.0 world lives in its own store and never mixes with a 0A.5.0 world', () => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'store-'));
    saveToStore(dir, snapshots.get(1500)!);
    const r = recoverLatestValid(dir);
    expect(r.snapshot.snapshotFormatVersion).toBe(3);
    expect(canonicalStateHash(r.world)).toBe(reference.get(1500));
    expect(r.world.food.every((f: FoodItem) => f.handlingProgress !== undefined)).toBe(true);

    const c5 = physicalBodiesModelConfig(); c5.rootSeed = ACTIVE_SEED;
    const w5 = runTo(bootstrapWorld(c5), c5, 1500);
    expect(() => saveToStore(dir, createSnapshot(w5, c5))).toThrow(expect.objectContaining({ code: 'WORLD_IDENTITY_MISMATCH' }));
  }, 120_000);
});
