import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import {
  bootstrapWorld, canonicalStateHash, canonicalStateString, regulatedRecurrentInitModelConfig, runTicks,
} from '@alo/simulation-core';
import { configHash, listSnapshots, readStoreIdentity } from '@alo/persistence';
import { OBSERVER_PROTOCOL_VERSION, toObserverFrame, WorldRunner } from '../src/index.js';
import { newWorldDir } from './helpers.js';

const makeConfig = () => { const c = regulatedRecurrentInitModelConfig(); c.rootSeed = 8; return c; };

describe('0A.8.0 persistent runner, snapshot v3 and unchanged observer protocol', () => {
  it('(30, 35) creates a format v3 store, recovers it and continues exactly', () => {
    const c = makeConfig(); const dir = newWorldDir();
    const first = WorldRunner.create(dir, c, { saveEvery: 50 });
    first.runUntil(250); first.close();
    expect(readStoreIdentity(dir)).toEqual({ simulationVersion: '0A.8.0', configHash: configHash(c) });
    const stored = JSON.parse(fs.readFileSync(listSnapshots(dir).at(-1)!.path, 'utf8'));
    expect(stored.snapshotFormatVersion).toBe(3);
    // Recurrent memory is stored; no plastic runtime state exists to store.
    expect(stored.state.organisms[0].hiddenState).toHaveLength(8);
    expect('hiddenOutputWeightOffsets' in stored.state.organisms[0]).toBe(false);

    const recovered = WorldRunner.open(dir, { saveEvery: 50 });
    expect(canonicalStateString(recovered.world)).toBe(canonicalStateString(first.world));
    recovered.runUntil(500); recovered.close();
    const direct = runTicks(bootstrapWorld(c), c, 500).world;
    expect(canonicalStateHash(recovered.world)).toBe(canonicalStateHash(direct));
  }, 60_000);

  it('(36) a multi-restart run equals the uninterrupted run tick for tick', () => {
    const c = makeConfig(); const dir = newWorldDir();
    let runner = WorldRunner.create(dir, c, { saveEvery: 25 });
    runner.runUntil(100); runner.close();
    for (const until of [200, 300, 400]) {
      runner = WorldRunner.open(dir, { saveEvery: 25 });
      runner.runUntil(until); runner.close();
    }
    expect(canonicalStateHash(runner.world)).toBe(canonicalStateHash(runTicks(bootstrapWorld(c), c, 400).world));
  }, 60_000);

  it('observer stays pure protocol v1 and leaks no recurrent or initialization internals', () => {
    const c = makeConfig();
    const world = runTicks(bootstrapWorld(c), c, 20).world;
    const before = canonicalStateString(world);
    const frame = toObserverFrame(world, { configHash: configHash(c), rootSeed: c.rootSeed, snapshotTick: 0 });
    expect(OBSERVER_PROTOCOL_VERSION).toBe(1);
    expect(frame.simulationVersion).toBe('0A.8.0');
    expect(canonicalStateString(world)).toBe(before);
    const text = JSON.stringify(frame);
    for (const forbidden of ['hiddenState', 'recurrentHiddenWeights', 'recurrentInitSigma', 'WeightOffsets', 'Eligibility']) {
      expect(text).not.toContain(forbidden);
    }
  });
});
