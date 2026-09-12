/**
 * The V2.3 physical-bodies model 0A.5.0 in the persistent world runner:
 * create / stop / recover continues exactly (positions the physics produced
 * included, snapshot format v2), the CLI's --model, and the read-only observer
 * (protocol v1, frame shape unchanged, nothing about bodies, contact or
 * displacement in frames) leaving the trajectory untouched.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  bootstrapWorld, stepWorld, runTicks, canonicalStateHash, canonicalStateString,
  physicalBodiesModelConfig, countBodyOverlaps, physicalRadiusFromSize,
} from '@alo/simulation-core';
import type { SimulationConfig } from '@alo/simulation-core';
import { recoverLatestValid, readStoreIdentity, configHash, listSnapshots } from '@alo/persistence';
import { WorldRunner, observeRunner, toObserverFrame, OBSERVER_PROTOCOL_VERSION } from '../src/index.js';
import { newWorldDir } from './helpers.js';
import { recordingClient, until } from './wsHelpers.js';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');
/** The test/live-verification seed whose 0A.5.0 world keeps reproducing (first of 1, 2, 3, … alive at tick 10,000). */
const LIVING_SEED = 8;
const V1_FRAME_KEYS = ['configHash', 'food', 'foodCount', 'observerProtocolVersion', 'organisms', 'population', 'rootSeed', 'simulationVersion', 'snapshotTick', 'tick', 'type', 'world'];
const V1_FRAME_ORGANISM_KEYS = ['age', 'energy', 'generationDepth', 'heading', 'id', 'lineageRootId', 'maxSpeed', 'metabolism', 'parentId', 'size', 'visionAngle', 'visionRange', 'x', 'y'];

function v5(seed: number): SimulationConfig { const c = physicalBodiesModelConfig(); c.rootSeed = seed; return c; }
const direct = (seed: number, ticks: number) => canonicalStateHash(runTicks(bootstrapWorld(v5(seed)), v5(seed), ticks).world);

function cli(args: string[]) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf-8', env: { ...process.env, INIT_CWD: process.cwd() } });
  const events = r.stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l) as Record<string, any>);
  return { code: r.status, events, stderr: r.stderr };
}

describe('0A.5.0 world runner', () => {
  it('create → run → stop → open → run continues exactly; snapshots are format v2 and carry the body configuration', () => {
    const d = newWorldDir();
    const a = WorldRunner.create(d, v5(LIVING_SEED), { saveEvery: 500 });
    a.runUntil(1234);
    a.close();
    expect(readStoreIdentity(d)).toEqual({ simulationVersion: '0A.5.0', configHash: configHash(v5(LIVING_SEED)) });
    const stored = JSON.parse(fs.readFileSync(listSnapshots(d).at(-1)!.path, 'utf-8'));
    expect(stored.snapshotFormatVersion).toBe(2); // physical bodies need no new format
    expect(stored.config.body).toEqual({ radiusBase: 2.0, radiusPerSize: 2.2, separationPasses: 4 });
    expect(stored.state.organisms.every((o: any) => o.hiddenState.length === 8)).toBe(true);

    const b = WorldRunner.open(d, { saveEvery: 500 });
    expect(b.status()).toMatchObject({ origin: 'recovered', tick: 1234, simulationVersion: '0A.5.0' });
    expect(canonicalStateString(b.world)).toBe(canonicalStateString(a.world)); // the same positions came back
    b.runUntil(2500);
    b.close();
    expect(canonicalStateHash(b.world)).toBe(direct(LIVING_SEED, 2500));
    expect(canonicalStateHash(b.world)).toBe('f398b7b9229d447c');

    // the world really is physical: no living pair is deeply interpenetrating
    const c = v5(LIVING_SEED);
    let worst = 0;
    const living = b.world.organisms.filter((o) => o.alive);
    for (let i = 0; i < living.length; i++) {
      for (let j = i + 1; j < living.length; j++) {
        const sum = physicalRadiusFromSize(living[i]!.genome.morphology.size, c) + physicalRadiusFromSize(living[j]!.genome.morphology.size, c);
        const dist = Math.hypot(living[i]!.x - living[j]!.x, living[i]!.y - living[j]!.y);
        if (dist < sum) worst = Math.max(worst, sum - dist);
      }
    }
    expect(worst).toBeLessThan(0.1); // world units, against radii of 3.1–5.3
  }, 120_000);

  it('CLI: --new --model 0A.5.0 creates a physical world; recovery keeps it 0A.5.0 and continues exactly; --model on recovery is refused', () => {
    const d = newWorldDir();
    const a = cli(['--dir', d, '--new', '--seed', String(LIVING_SEED), '--model', '0A.5.0', '--until-tick', '777', '--json']);
    expect(a.code, a.stderr).toBe(0);
    expect(a.events[0]).toMatchObject({ event: 'started', origin: 'fresh', tick: 0, simulationVersion: '0A.5.0', rootSeed: LIVING_SEED });
    expect(cli(['--dir', d, '--model', '0A.5.0', '--until-tick', '800']).code).toBe(2);
    const b = cli(['--dir', d, '--until-tick', '2000', '--json']);
    expect(b.code, b.stderr).toBe(0);
    expect(b.events[0]).toMatchObject({ event: 'started', origin: 'recovered', tick: 777, simulationVersion: '0A.5.0' });
    expect(canonicalStateHash(recoverLatestValid(d).world)).toBe(direct(LIVING_SEED, 2000));
  }, 120_000);
});

describe('0A.5.0 observation stays read-only and pure (protocol v1 unchanged)', () => {
  it('frames every tick leave the world and trajectory untouched; the frame shape is exactly v1, with no body, contact or displacement data', () => {
    const c = v5(LIVING_SEED);
    let world = bootstrapWorld(c);
    const status = { configHash: configHash(c), rootSeed: LIVING_SEED, snapshotTick: 0 };
    let sawContact = false;
    while (world.tick < 1500) {
      world = stepWorld(world, c).world;
      const before = canonicalStateString(world);
      const frame = toObserverFrame(world, status);
      if (canonicalStateString(world) !== before) throw new Error(`frame changed the world at tick ${world.tick}`);
      if (countBodyOverlaps(world.organisms, c) > 0) sawContact = true;
      if (world.tick % 500 === 0) {
        expect(frame.observerProtocolVersion).toBe(1);
        expect(frame.simulationVersion).toBe('0A.5.0');
        expect(Object.keys(frame).sort()).toEqual(V1_FRAME_KEYS);
        for (const o of frame.organisms) expect(Object.keys(o).sort()).toEqual(V1_FRAME_ORGANISM_KEYS);
        const text = JSON.stringify(frame);
        for (const forbidden of ['hiddenState', 'recurrent', 'inputHiddenWeights', 'intent', 'sensed', 'memory', 'radius', 'overlap', 'collision', 'contact', 'push', 'displace']) {
          expect(text, forbidden).not.toContain(forbidden);
        }
      }
    }
    expect(OBSERVER_PROTOCOL_VERSION).toBe(1);
    expect(canonicalStateHash(world)).toBe(direct(LIVING_SEED, 1500));
    // `size` is in the frame, and it is all the Observatory needs: the drawn
    // body radius mirrors the simulation's size → radius mapping.
    expect(toObserverFrame(world, status).organisms.every((o) => typeof o.size === 'number')).toBe(true);
  }, 60_000);

  it('unpaced run with the observer on and a client connected reaches the same 0A.5.0 hash', async () => {
    const r = WorldRunner.create(newWorldDir(), v5(LIVING_SEED));
    const obs = await observeRunner(r, { port: 0 });
    try {
      const client = recordingClient(obs.url);
      await client.opened;
      await r.run({ untilTick: 2500 });
      await until(() => client.frames.at(-1)?.tick === 2500);
      expect(canonicalStateHash(r.world)).toBe('f398b7b9229d447c');
      expect(client.frames.every((f) => f.simulationVersion === '0A.5.0' && f.observerProtocolVersion === 1)).toBe(true);
      await client.close();
    } finally {
      await obs.close();
    }
  }, 120_000);
});
