/**
 * The V2.4 contestable-food-handling model 0A.6.0 in the persistent world
 * runner: create / stop / recover continues exactly WITH handling in progress
 * (snapshot format v3), the CLI's --model, and the read-only observer
 * (protocol v1, frame shape unchanged, no holder, progress, possession or
 * dislodgement data in frames) leaving the trajectory untouched.
 *
 * A held item is visible to an observer exactly as any other food item is:
 * through its ordinary x / y, which move because the item moves.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  bootstrapWorld, stepWorld, runTicks, canonicalStateHash, canonicalStateString, foodHandlingModelConfig,
} from '@alo/simulation-core';
import type { SimulationConfig, WorldState } from '@alo/simulation-core';
import { recoverLatestValid, readStoreIdentity, configHash, listSnapshots } from '@alo/persistence';
import { WorldRunner, observeRunner, toObserverFrame, OBSERVER_PROTOCOL_VERSION } from '../src/index.js';
import { newWorldDir } from './helpers.js';
import { recordingClient, until } from './wsHelpers.js';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');
/** Coverage seed (NOT canonical): the 0A.6.0 world with the most handling, births and contact. */
const ACTIVE_SEED = 8;
const V1_FRAME_KEYS = ['configHash', 'food', 'foodCount', 'observerProtocolVersion', 'organisms', 'population', 'rootSeed', 'simulationVersion', 'snapshotTick', 'tick', 'type', 'world'];
const V1_FRAME_ORGANISM_KEYS = ['age', 'energy', 'generationDepth', 'heading', 'id', 'lineageRootId', 'maxSpeed', 'metabolism', 'parentId', 'size', 'visionAngle', 'visionRange', 'x', 'y'];
const V1_FRAME_FOOD_KEYS = ['id', 'x', 'y'];

function v6(seed: number): SimulationConfig { const c = foodHandlingModelConfig(); c.rootSeed = seed; return c; }
const direct = (seed: number, ticks: number) => canonicalStateHash(runTicks(bootstrapWorld(v6(seed)), v6(seed), ticks).world);

function cli(args: string[]) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf-8', env: { ...process.env, INIT_CWD: process.cwd() } });
  const events = r.stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l) as Record<string, any>);
  return { code: r.status, events, stderr: r.stderr };
}

/**
 * The first tick at which an item is being handled with at least
 * `minProgress` — i.e. a tick whose SAVED state must carry holder identity and
 * progress for the resume to be exact.
 */
function tickWithHandling(c: SimulationConfig, minProgress = 2, limit = 2500): number {
  let w: WorldState = bootstrapWorld(c);
  for (let t = 1; t <= limit; t++) {
    w = stepWorld(w, c).world;
    if (w.food.some((f) => f.holderId !== null && (f.handlingProgress ?? 0) >= minProgress)) return t;
  }
  throw new Error(`no handling at progress >= ${minProgress} within ${limit} ticks`);
}

describe('0A.6.0 world runner', () => {
  it('create → run → stop → open → run continues exactly WITH food in hand; snapshots are format v3', () => {
    const c = v6(ACTIVE_SEED);
    // Stop on a tick where handling really is in progress, so the resume path
    // has to carry holder identity and progress across the file.
    const stopAt = tickWithHandling(c, 2);
    const d = newWorldDir();
    const a = WorldRunner.create(d, c, { saveEvery: 100 });
    a.runUntil(stopAt);
    const held = a.world.food.filter((f) => f.holderId !== null);
    expect(held.length).toBeGreaterThan(0);
    a.close();

    expect(readStoreIdentity(d)).toEqual({ simulationVersion: '0A.6.0', configHash: configHash(c) });
    const stored = JSON.parse(fs.readFileSync(listSnapshots(d).at(-1)!.path, 'utf-8'));
    expect(stored.snapshotFormatVersion).toBe(3);
    expect(stored.config.handling).toEqual({ ticksRequired: 5 });
    expect(stored.state.food.every((f: any) => 'holderId' in f && 'handlingProgress' in f)).toBe(true);

    const b = WorldRunner.open(d, { saveEvery: 100 });
    expect(b.status()).toMatchObject({ origin: 'recovered', tick: stopAt, simulationVersion: '0A.6.0' });
    expect(canonicalStateString(b.world)).toBe(canonicalStateString(a.world)); // the same hands came back
    expect(b.world.food.filter((f) => f.holderId !== null)).toHaveLength(held.length);
    b.runUntil(2500);
    b.close();
    expect(canonicalStateHash(b.world)).toBe(direct(ACTIVE_SEED, 2500));
    expect(canonicalStateHash(b.world)).toBe('e21dc19bcc7a85ec');

    // every stored item is well formed: one holder per organism, living holders
    const aliveIds = new Set(b.world.organisms.filter((o) => o.alive).map((o) => o.id));
    const holders = b.world.food.filter((f) => f.holderId !== null).map((f) => f.holderId as number);
    expect(new Set(holders).size).toBe(holders.length);
    for (const h of holders) expect(aliveIds.has(h)).toBe(true);
  }, 120_000);

  it('CLI: --new --model 0A.6.0 creates a handling world; recovery keeps it 0A.6.0 and continues exactly; --model on recovery is refused', () => {
    const d = newWorldDir();
    const a = cli(['--dir', d, '--new', '--seed', String(ACTIVE_SEED), '--model', '0A.6.0', '--until-tick', '777', '--json']);
    expect(a.code, a.stderr).toBe(0);
    expect(a.events[0]).toMatchObject({ event: 'started', origin: 'fresh', tick: 0, simulationVersion: '0A.6.0', rootSeed: ACTIVE_SEED });
    expect(cli(['--dir', d, '--model', '0A.6.0', '--until-tick', '800']).code).toBe(2);
    const b = cli(['--dir', d, '--until-tick', '2000', '--json']);
    expect(b.code, b.stderr).toBe(0);
    expect(b.events[0]).toMatchObject({ event: 'started', origin: 'recovered', tick: 777, simulationVersion: '0A.6.0' });
    expect(canonicalStateHash(recoverLatestValid(d).world)).toBe(direct(ACTIVE_SEED, 2000));
  }, 120_000);
});

describe('0A.6.0 observation stays read-only and pure (protocol v1 unchanged)', () => {
  it('frames leave the world untouched; the frame shape is exactly v1, with no handling data at all', () => {
    const c = v6(ACTIVE_SEED);
    let world = bootstrapWorld(c);
    const status = { configHash: configHash(c), rootSeed: ACTIVE_SEED, snapshotTick: 0 };
    let sawHeldFoodInFrame = false;
    let movedHeldFood = false;
    let previousFood = new Map<number, { x: number; y: number }>();

    while (world.tick < 1500) {
      world = stepWorld(world, c).world;
      const before = canonicalStateString(world);
      const frame = toObserverFrame(world, status);
      if (canonicalStateString(world) !== before) throw new Error(`frame changed the world at tick ${world.tick}`);

      // A held item is in the frame like any other, and its ordinary x / y move.
      for (const f of world.food) {
        if (f.holderId === null) continue;
        sawHeldFoodInFrame = true;
        const shown = frame.food.find((g) => g.id === f.id);
        expect(shown).toBeDefined();
        const was = previousFood.get(f.id);
        if (was && (was.x !== shown!.x || was.y !== shown!.y)) movedHeldFood = true;
      }
      previousFood = new Map(frame.food.map((f) => [f.id, { x: f.x, y: f.y }]));

      if (world.tick % 500 === 0) {
        expect(frame.observerProtocolVersion).toBe(1);
        expect(frame.simulationVersion).toBe('0A.6.0');
        expect(Object.keys(frame).sort()).toEqual(V1_FRAME_KEYS);
        for (const o of frame.organisms) expect(Object.keys(o).sort()).toEqual(V1_FRAME_ORGANISM_KEYS);
        for (const f of frame.food) expect(Object.keys(f).sort()).toEqual(V1_FRAME_FOOD_KEYS);
        const text = JSON.stringify(frame);
        for (const forbidden of ['holderId', 'handlingProgress', 'holder', 'handling', 'possess', 'dislodg', 'steal', 'contact', 'collision', 'hiddenState', 'recurrent', 'intent']) {
          expect(text, forbidden).not.toContain(forbidden);
        }
      }
    }
    expect(OBSERVER_PROTOCOL_VERSION).toBe(1);
    expect(sawHeldFoodInFrame).toBe(true);   // handling really happened in this window
    expect(movedHeldFood).toBe(true);        // and a held item visibly travelled
    expect(canonicalStateHash(world)).toBe(direct(ACTIVE_SEED, 1500));
  }, 60_000);

  it('unpaced run with the observer on and a client connected reaches the same 0A.6.0 hash', async () => {
    const r = WorldRunner.create(newWorldDir(), v6(ACTIVE_SEED));
    const obs = await observeRunner(r, { port: 0 });
    try {
      const client = recordingClient(obs.url);
      await client.opened;
      await r.run({ untilTick: 2500 });
      await until(() => client.frames.at(-1)?.tick === 2500);
      expect(canonicalStateHash(r.world)).toBe('e21dc19bcc7a85ec');
      expect(client.frames.every((f) => f.simulationVersion === '0A.6.0' && f.observerProtocolVersion === 1)).toBe(true);
      await client.close();
    } finally {
      await obs.close();
    }
  }, 120_000);
});
