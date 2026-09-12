import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import {
  bootstrapWorld, canonicalStateHash, canonicalStateString, lifetimePlasticityModelConfig, runTicks,
} from '@alo/simulation-core';
import { configHash, listSnapshots, readStoreIdentity } from '@alo/persistence';
import { OBSERVER_PROTOCOL_VERSION, toObserverFrame, WorldRunner } from '../src/index.js';
import { newWorldDir } from './helpers.js';

const makeConfig = () => { const c = lifetimePlasticityModelConfig(); c.rootSeed = 8; return c; };

describe('0A.7.0 persistent runner and unchanged observer protocol', () => {
  it('creates format v4, recovers learned state, and continues exactly', () => {
    const c = makeConfig(); const dir = newWorldDir();
    const first = WorldRunner.create(dir, c, { saveEvery: 50 });
    first.runUntil(250); first.close();
    expect(first.world.organisms.some((o) => o.hiddenOutputWeightOffsets!.some((x) => x !== 0))).toBe(true);
    expect(readStoreIdentity(dir)).toEqual({ simulationVersion: '0A.7.0', configHash: configHash(c) });
    const stored = JSON.parse(fs.readFileSync(listSnapshots(dir).at(-1)!.path, 'utf8'));
    expect(stored.snapshotFormatVersion).toBe(4);

    const recovered = WorldRunner.open(dir, { saveEvery: 50 });
    expect(canonicalStateString(recovered.world)).toBe(canonicalStateString(first.world));
    recovered.runUntil(500); recovered.close();
    const direct = runTicks(bootstrapWorld(c), c, 500).world;
    expect(canonicalStateHash(recovered.world)).toBe(canonicalStateHash(direct));
  }, 60_000);

  it('observer remains pure protocol v1 and leaks no plastic internals', () => {
    const c = makeConfig();
    const world = runTicks(bootstrapWorld(c), c, 20).world;
    const before = canonicalStateString(world);
    const frame = toObserverFrame(world, { configHash: configHash(c), rootSeed: c.rootSeed, snapshotTick: 0 });
    expect(OBSERVER_PROTOCOL_VERSION).toBe(1);
    expect(frame.simulationVersion).toBe('0A.7.0');
    expect(canonicalStateString(world)).toBe(before);
    const text = JSON.stringify(frame);
    for (const forbidden of ['hiddenState', 'WeightOffsets', 'BiasOffsets', 'Eligibility', 'reinforcement', 'reward']) {
      expect(text).not.toContain(forbidden);
    }
  });
});
