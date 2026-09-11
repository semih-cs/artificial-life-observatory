/**
 * The V2.1 model 0A.3.0 in the persistent world runner and its observer:
 * create / restart equivalence, the CLI's --model, and the read-only observer
 * (protocol v1, unchanged frame shape) leaving the 0A.3.0 trajectory untouched.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  bootstrapWorld, stepWorld, runTicks, canonicalStateHash, canonicalStateString, organismSensingModelConfig,
} from '@alo/simulation-core';
import type { SimulationConfig } from '@alo/simulation-core';
import { recoverLatestValid, readStoreIdentity, configHash } from '@alo/persistence';
import { WorldRunner, observeRunner, toObserverFrame, OBSERVER_PROTOCOL_VERSION } from '../src/index.js';
import { GOLDEN_SEED, newWorldDir, dirState } from './helpers.js';
import { recordingClient, until } from './wsHelpers.js';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');
const V1_FRAME_ORGANISM_KEYS = ['age', 'energy', 'generationDepth', 'heading', 'id', 'lineageRootId', 'maxSpeed', 'metabolism', 'parentId', 'size', 'visionAngle', 'visionRange', 'x', 'y'];
const V1_FRAME_KEYS = ['configHash', 'food', 'foodCount', 'observerProtocolVersion', 'organisms', 'population', 'rootSeed', 'simulationVersion', 'snapshotTick', 'tick', 'type', 'world'];

function v3(seed: number): SimulationConfig {
  const c = organismSensingModelConfig();
  c.rootSeed = seed;
  return c;
}
const directV3 = (seed: number, ticks: number) => canonicalStateHash(runTicks(bootstrapWorld(v3(seed)), v3(seed), ticks).world);

function cli(args: string[]) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf-8', env: { ...process.env, INIT_CWD: process.cwd() } });
  const events = r.stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l) as Record<string, any>);
  return { code: r.status, events, stderr: r.stderr };
}

describe('0A.3.0 world runner', () => {
  it('create → run → stop → open → run continues exactly, and the world stays 0A.3.0', () => {
    const d = newWorldDir();
    const a = WorldRunner.create(d, v3(GOLDEN_SEED), { saveEvery: 500 });
    a.runUntil(1234);
    a.close();
    expect(readStoreIdentity(d)).toEqual({ simulationVersion: '0A.3.0', configHash: configHash(v3(GOLDEN_SEED)) });
    const b = WorldRunner.open(d, { saveEvery: 500 });
    expect(b.status()).toMatchObject({ origin: 'recovered', tick: 1234, simulationVersion: '0A.3.0' });
    expect(b.config.simulationVersion).toBe('0A.3.0');
    b.runUntil(3000);
    b.close();
    expect(canonicalStateHash(b.world)).toBe(directV3(GOLDEN_SEED, 3000));
    expect(recoverLatestValid(d).report.selected?.stateHash).toBe(directV3(GOLDEN_SEED, 3000));
  }, 120_000);

  it('CLI: --new --model 0A.3.0 creates a V2.1 world; recovery without --model keeps it 0A.3.0 and continues exactly', () => {
    const d = newWorldDir();
    const a = cli(['--dir', d, '--new', '--seed', String(GOLDEN_SEED), '--model', '0A.3.0', '--until-tick', '777', '--json']);
    expect(a.code, a.stderr).toBe(0);
    expect(a.events[0]).toMatchObject({ event: 'started', origin: 'fresh', tick: 0, simulationVersion: '0A.3.0', rootSeed: GOLDEN_SEED });
    const b = cli(['--dir', d, '--until-tick', '2000', '--json']);
    expect(b.code, b.stderr).toBe(0);
    expect(b.events[0]).toMatchObject({ event: 'started', origin: 'recovered', tick: 777, simulationVersion: '0A.3.0' });
    expect(canonicalStateHash(recoverLatestValid(d).world)).toBe(directV3(GOLDEN_SEED, 2000));
  }, 120_000);

  it('CLI: --model is refused on recovery and for unknown versions, touching nothing', () => {
    const d = newWorldDir();
    expect(cli(['--dir', d, '--new', '--seed', '5', '--model', '0A.3.0', '--until-tick', '10']).code).toBe(0);
    const before = dirState(d);
    const recoverWithModel = cli(['--dir', d, '--model', '0A.2.0', '--until-tick', '20']);
    expect(recoverWithModel.code).toBe(2);
    expect(recoverWithModel.stderr).toMatch(/--model is only used with --new/);
    const unknown = cli(['--dir', newWorldDir(), '--new', '--seed', '5', '--model', '0A.9.0']);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toMatch(/--model must be one of 0A.1.0, 0A.2.0, 0A.3.0/);
    expect(dirState(d)).toEqual(before);
  });
});

describe('0A.3.0 observation stays read-only and pure (protocol v1 unchanged)', () => {
  it('(22) frames every tick leave the 0A.3.0 world, RNG and trajectory untouched; the frame shape is exactly v1', () => {
    const c = v3(11);
    let world = bootstrapWorld(c);
    const status = { configHash: configHash(c), rootSeed: 11, snapshotTick: 0 };
    while (world.tick < 1500) {
      world = stepWorld(world, c).world;
      const before = canonicalStateString(world);
      const frame = toObserverFrame(world, status);
      if (canonicalStateString(world) !== before) throw new Error(`frame changed the world at tick ${world.tick}`);
      if (world.tick % 500 === 0) {
        expect(frame.observerProtocolVersion).toBe(1);
        expect(frame.simulationVersion).toBe('0A.3.0');
        expect(Object.keys(frame).sort()).toEqual(V1_FRAME_KEYS);
        for (const o of frame.organisms) expect(Object.keys(o).sort()).toEqual(V1_FRAME_ORGANISM_KEYS);
        const text = JSON.stringify(frame);
        for (const forbidden of ['sensed', 'target', 'intent', 'inputHiddenWeights', 'organismVisible']) expect(text).not.toContain(forbidden);
      }
    }
    expect(OBSERVER_PROTOCOL_VERSION).toBe(1);
    expect(canonicalStateHash(world)).toBe(directV3(11, 1500));
  }, 60_000);

  it('(22) unpaced run with the observer on and a client connected reaches the same 0A.3.0 hash', async () => {
    const r = WorldRunner.create(newWorldDir(), v3(GOLDEN_SEED));
    const obs = await observeRunner(r, { port: 0 });
    try {
      const c = recordingClient(obs.url);
      await c.opened;
      await r.run({ untilTick: 3000 });
      await until(() => c.frames.at(-1)?.tick === 3000);
      expect(canonicalStateHash(r.world)).toBe(directV3(GOLDEN_SEED, 3000));
      expect(c.frames.every((f) => f.simulationVersion === '0A.3.0' && f.observerProtocolVersion === 1)).toBe(true);
      await c.close();
    } finally {
      await obs.close();
    }
  }, 120_000);
});
