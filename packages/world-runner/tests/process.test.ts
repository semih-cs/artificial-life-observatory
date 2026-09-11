/**
 * The runner as separate OS processes through the built CLI (dist/cli.js):
 * process A creates and runs, process B recovers and continues; graceful
 * SIGINT/SIGTERM stops; a hard SIGKILL between saves; CLI refusals.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { canonicalStateHash } from '@alo/simulation-core';
import { listSnapshots, recoverLatestValid, snapshotFileName } from '@alo/persistence';
import { WorldRunner } from '../src/index.js';
import { GOLDEN_SEED, GOLDEN_HASH_10000, directHash, newWorldDir, dirState, flipByte } from './helpers.js';
import { recordingClient, until } from './wsHelpers.js';
import * as net from 'node:net';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');
type Event = Record<string, any> & { event: string };

/** Run the CLI to completion; returns exit code, JSON events and stderr. */
function cli(args: string[]) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf-8', env: { ...process.env, INIT_CWD: process.cwd() } });
  const events = r.stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l) as Event);
  return { code: r.status, events, stdout: r.stdout, stderr: r.stderr, pid: r.pid };
}

/**
 * Start the CLI with --json, send `signal` once a status event reaches `atTick`,
 * and resolve with the exit code/signal and all events.
 */
function runAndSignal(args: string[], atTick: number, signal: NodeJS.Signals): Promise<{ code: number | null; signal: NodeJS.Signals | null; events: Event[]; lastStatusTick: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args, '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const events: Event[] = [];
    let sent = false;
    let lastStatusTick = -1;
    createInterface({ input: child.stdout }).on('line', (line) => {
      if (!line.startsWith('{')) return;
      const e = JSON.parse(line) as Event;
      events.push(e);
      if (e.event === 'status') lastStatusTick = e['tick'];
      if (!sent && e.event === 'status' && e['tick'] >= atTick) { sent = true; child.kill(signal); }
    });
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += String(c); });
    child.on('error', reject);
    child.on('close', (code, sig) => {
      if (!sent) reject(new Error(`process ended before tick ${atTick}: ${stderr}`));
      else resolve({ code, signal: sig, events, lastStatusTick });
    });
  });
}

describe('9. separate-process restart', () => {
  it('process A creates and runs to 4,321 and exits; process B recovers and runs to 10,000: b95a0b4ef7dd8449', () => {
    const d = newWorldDir();
    const a = cli(['--dir', d, '--new', '--seed', String(GOLDEN_SEED), '--until-tick', '4321', '--json']);
    expect(a.code, a.stderr).toBe(0);
    expect(a.events[0]).toMatchObject({ event: 'started', origin: 'fresh', tick: 0, rootSeed: GOLDEN_SEED, simulationVersion: '0A.2.0' });
    expect(a.events.at(-1)).toMatchObject({ event: 'stopped', reason: 'until-tick', tick: 4321, snapshotTick: 4321 });
    const b = cli(['--dir', d, '--until-tick', '10000', '--json']);
    expect(b.code, b.stderr).toBe(0);
    expect(b.pid).not.toBe(a.pid);
    expect(b.events[0]).toMatchObject({ event: 'started', origin: 'recovered', tick: 4321, recoveredFromTick: 4321, rootSeed: GOLDEN_SEED, skipped: [] });
    expect(b.events.filter((e) => e.event === 'status').map((e) => e['tick'])).toEqual([5000, 6000, 7000, 8000, 9000, 10000]);
    expect(b.events.at(-1)).toMatchObject({ event: 'stopped', tick: 10000, snapshotTick: 10000 });
    const r = recoverLatestValid(d);
    expect(r.report.selected?.stateHash).toBe(GOLDEN_HASH_10000);
    expect(canonicalStateHash(r.world)).toBe(GOLDEN_HASH_10000);
  }, 300_000);
});

describe('graceful shutdown and hard kill', () => {
  it('SIGINT: stops after the current tick, saves it, exits 0; a new process continues exactly to b95a0b4ef7dd8449', async () => {
    const d = newWorldDir();
    const run = await runAndSignal(['--dir', d, '--new', '--seed', String(GOLDEN_SEED), '--save-every', '500', '--status-every', '250'], 2000, 'SIGINT');
    expect(run.code).toBe(0);
    const stopping = run.events.find((e) => e.event === 'stopping');
    const stopped = run.events.at(-1)!;
    expect(stopping).toMatchObject({ signal: 'SIGINT' });
    expect(stopped).toMatchObject({ event: 'stopped', reason: 'stopped' });
    expect(stopped['snapshotTick']).toBe(stopped['tick']);
    expect(listSnapshots(d).at(-1)?.tick).toBe(stopped['tick']); // the final tick is durably saved
    const b = cli(['--dir', d, '--until-tick', '10000', '--json']);
    expect(b.code, b.stderr).toBe(0);
    expect(b.events[0]).toMatchObject({ origin: 'recovered', tick: stopped['tick'] });
    expect(recoverLatestValid(d).report.selected?.stateHash).toBe(GOLDEN_HASH_10000);
  }, 300_000);

  it('SIGTERM: same graceful stop; the saved final tick continues exactly', async () => {
    const d = newWorldDir();
    const run = await runAndSignal(['--dir', d, '--new', '--seed', '11', '--save-every', '300', '--status-every', '100'], 800, 'SIGTERM');
    expect(run.code).toBe(0);
    const stopped = run.events.at(-1)!;
    expect(stopped).toMatchObject({ event: 'stopped', reason: 'stopped' });
    expect(listSnapshots(d).at(-1)?.tick).toBe(stopped['tick']);
    const w = WorldRunner.open(d);
    expect(w.tick).toBe(stopped['tick']);
    w.runUntil(3000);
    expect(canonicalStateHash(w.world)).toBe(directHash(11, 3000));
  }, 300_000);

  it('SIGKILL between saves: unsaved ticks are lost, the newest durable snapshot recovers, the future is exact', async () => {
    const d = newWorldDir();
    const run = await runAndSignal(['--dir', d, '--new', '--seed', String(GOLDEN_SEED), '--save-every', '1000', '--status-every', '250'], 3250, 'SIGKILL');
    expect(run.signal).toBe('SIGKILL');
    expect(run.events.some((e) => e.event === 'stopped')).toBe(false);
    const newest = listSnapshots(d).at(-1)!.tick;
    expect(newest % 1000).toBe(0); // only scheduled saves happened; nothing at the kill tick
    expect(newest).toBeGreaterThanOrEqual(3000); // status 3,250 was printed, so the 3,000 save had completed
    const b = cli(['--dir', d, '--until-tick', '10000', '--json']);
    expect(b.code, b.stderr).toBe(0);
    expect(b.events[0]).toMatchObject({ origin: 'recovered', recoveredFromTick: newest, skipped: [] });
    expect(recoverLatestValid(d).report.selected?.stateHash).toBe(GOLDEN_HASH_10000);
  }, 300_000);
});

describe('CLI refusals', () => {
  it('--new over an existing world is refused and changes nothing', () => {
    const d = newWorldDir();
    expect(cli(['--dir', d, '--new', '--seed', '11', '--until-tick', '200', '--save-every', '100']).code).toBe(0);
    const before = dirState(d);
    const r = cli(['--dir', d, '--new', '--seed', '12', '--until-tick', '300']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('WORLD_EXISTS');
    expect(r.stderr).toContain('no world was created or modified');
    expect(dirState(d)).toEqual(before);
  });

  it('recovery with no valid snapshot fails and never creates a world', () => {
    const d = newWorldDir();
    expect(cli(['--dir', d, '--new', '--seed', '11', '--until-tick', '500', '--save-every', '100']).code).toBe(0);
    for (const e of listSnapshots(d)) flipByte(e.path);
    const before = dirState(d);
    const r = cli(['--dir', d, '--until-tick', '1000']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('NO_VALID_SNAPSHOT');
    expect(dirState(d)).toEqual(before);
    const missing = newWorldDir();
    expect(cli(['--dir', missing]).code).toBe(1);
    expect(fs.existsSync(missing)).toBe(false);
  });

  it('a corrupt newest snapshot is recovered past and quarantined at startup', () => {
    const d = newWorldDir();
    expect(cli(['--dir', d, '--new', '--seed', '11', '--until-tick', '1000', '--save-every', '100']).code).toBe(0);
    flipByte(path.join(d, snapshotFileName(1000)));
    const r = cli(['--dir', d, '--until-tick', '1500', '--save-every', '100', '--json']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.events[0]).toMatchObject({ origin: 'recovered', recoveredFromTick: 900 });
    expect(r.events[0]!['skipped'].map((s: { fileName: string }) => s.fileName)).toEqual([snapshotFileName(1000)]);
    expect(r.events[0]!['quarantined'].map((s: { fileName: string }) => s.fileName)).toEqual([snapshotFileName(1000)]);
    expect(recoverLatestValid(d).report.selected?.stateHash).toBe(directHash(11, 1500));
  });

  it('bad arguments exit 2 without touching anything', () => {
    const d = newWorldDir();
    expect(cli(['--new', '--seed', '1']).code).toBe(2); // no --dir
    expect(cli(['--dir', d, '--new']).code).toBe(2); // no --seed
    expect(cli(['--dir', d, '--seed', '5']).code).toBe(2); // seed without --new
    expect(cli(['--dir', d, '--bogus']).code).toBe(2);
    expect(fs.existsSync(d)).toBe(false);
  });
});

describe('CLI observer and pacing', () => {
  it('--observe 0 --ticks-per-second: prints the stream URL, serves frames to a client, exits cleanly, exact result', async () => {
    const d = newWorldDir();
    const child = spawn(process.execPath, [CLI, '--dir', d, '--new', '--seed', '11', '--ticks-per-second', '400', '--observe', '0', '--until-tick', '800', '--save-every', '200', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const events: Event[] = [];
    let client: ReturnType<typeof recordingClient> | undefined;
    createInterface({ input: child.stdout }).on('line', (line) => {
      if (!line.startsWith('{')) return;
      const e = JSON.parse(line) as Event;
      events.push(e);
      if (e.event === 'observing') client = recordingClient(e['url']);
    });
    const t0 = Date.now();
    const code = await new Promise<number | null>((resolve) => child.on('close', (c) => resolve(c)));
    const seconds = (Date.now() - t0) / 1000;
    expect(code).toBe(0);
    expect(events.find((e) => e.event === 'started')).toMatchObject({ ticksPerSecondTarget: 400 });
    expect(events.find((e) => e.event === 'observing')).toMatchObject({ observerProtocolVersion: 1 });
    expect(events.at(-1)).toMatchObject({ event: 'stopped', tick: 800 });
    expect(seconds).toBeGreaterThanOrEqual(1.8); // 800 ticks at 400/s ≈ 2 s
    expect(client).toBeDefined();
    await until(() => client!.ws.readyState === WebSocket.CLOSED); // the server closed the stream on exit
    expect(client!.frames.length).toBeGreaterThan(5);
    expect(client!.frames.every((f) => f.rootSeed === 11 && f.observerProtocolVersion === 1)).toBe(true);
    expect(recoverLatestValid(d).report.selected?.stateHash).toBe(directHash(11, 800));
  }, 60_000);

  it('a busy --observe port fails before any world is created', async () => {
    const blocker = net.createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', () => resolve()));
    const port = (blocker.address() as net.AddressInfo).port;
    try {
      const d = newWorldDir();
      const r = cli(['--dir', d, '--new', '--seed', '11', '--observe', String(port), '--until-tick', '100']);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('cannot serve observer frames');
      expect(fs.existsSync(d)).toBe(false);
      expect(cli(['--dir', d, '--new', '--seed', '11', '--ticks-per-second', '0']).code).toBe(2);
      expect(cli(['--dir', d, '--new', '--seed', '11', '--observe', '70000']).code).toBe(2);
    } finally {
      blocker.close();
    }
  });
});
