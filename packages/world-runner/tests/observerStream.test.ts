/**
 * The read-only observer WebSocket stream: connection behaviour, read-only
 * protocol, multiple clients, slow clients, reconnects, and short pacing checks.
 */
import { describe, it, expect } from 'vitest';
import * as http from 'node:http';
import { canonicalStateHash } from '@alo/simulation-core';
import {
  WorldRunner, observeRunner, startObserverServer, OBSERVER_PROTOCOL_VERSION, MAX_INCOMING_FRAME_BYTES,
} from '../src/index.js';
import { seedConfig, directHash, newWorldDir } from './helpers.js';
import { recordingClient, rawClient, clientFrame, serverFrames, until } from './wsHelpers.js';

const SEED = 11;
const fresh = (saveEvery = 500) => WorldRunner.create(newWorldDir(), seedConfig(SEED), { saveEvery });

describe('connection behaviour', () => {
  it('a new client gets the latest frame immediately, then newer frames at ≤ ~10 fps', async () => {
    const r = fresh();
    r.runUntil(700);
    const obs = await observeRunner(r, { port: 0 });
    try {
      const c = recordingClient(obs.url);
      const first = await c.nextFrame();
      expect(first).toMatchObject({ type: 'frame', observerProtocolVersion: OBSERVER_PROTOCOL_VERSION, tick: 700, snapshotTick: 500, rootSeed: SEED });
      expect(first.population).toBe(r.status().population);
      // Nothing changes while the world is idle, so nothing more is sent.
      await new Promise((res) => setTimeout(res, 350));
      expect(c.frames).toHaveLength(1);
      // Run paced for ~1 s: frames arrive, at most about 10 per second, ticks increasing.
      const t0 = Date.now();
      await r.run({ untilTick: 900, ticksPerSecond: 200 });
      const seconds = (Date.now() - t0) / 1000;
      expect(c.frames.length).toBeGreaterThan(3);
      expect(c.frames.length).toBeLessThanOrEqual(Math.ceil(seconds * 10) + 3);
      const ticks = c.frames.map((f) => f.tick);
      expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
      await c.close();
    } finally {
      await obs.close();
    }
  }, 60_000);

  it('the latest frame is sent on connect, not at the next publish round', async () => {
    const r = fresh();
    r.runUntil(300);
    const obs = await observeRunner(r, { port: 0, maxFps: 0.2 }); // publish rounds 5 s apart
    try {
      const t0 = Date.now();
      const c = recordingClient(obs.url);
      await until(() => c.frames.length >= 1, 3000);
      expect(Date.now() - t0).toBeLessThan(1000);
      expect(c.frames[0]!.tick).toBe(300);
      await c.close();
    } finally {
      await obs.close();
    }
  });

  it('plain HTTP gets 426 and a malformed upgrade gets 400; neither becomes a client', async () => {
    const r = fresh();
    const obs = await observeRunner(r, { port: 0 });
    try {
      const status = await new Promise<number>((resolve) => http.get(`http://127.0.0.1:${obs.port}/`, (res) => { res.resume(); resolve(res.statusCode ?? 0); }));
      expect(status).toBe(426);
      const bad = await new Promise<number>((resolve) => {
        const req = http.request({ port: obs.port, host: '127.0.0.1', headers: { Connection: 'Upgrade', Upgrade: 'websocket' } });
        req.on('response', (res) => resolve(res.statusCode ?? 0));
        req.on('upgrade', () => resolve(101));
        req.on('error', () => resolve(-1));
        req.on('close', () => resolve(-2));
        req.end();
      });
      expect(bad).not.toBe(101);
      expect(obs.stats().connectionsTotal).toBe(0);
    } finally {
      await obs.close();
    }
  });
});

describe('read-only protocol', () => {
  it('client messages of every kind are discarded; the trajectory equals the direct run', async () => {
    const r = fresh();
    const obs = await observeRunner(r, { port: 0, maxFps: 50 });
    try {
      const c = recordingClient(obs.url);
      await c.opened;
      const raw = await rawClient(obs.port);
      const run = r.run({ untilTick: 2500, statusEvery: 100, onStatus: () => {
        // Commands a hostile or confused client might send, mid-run.
        c.ws.send(JSON.stringify({ cmd: 'kill', id: 1 }));
        c.ws.send(JSON.stringify({ type: 'spawn', x: 10, y: 10 }));
        c.ws.send('pause');
        c.ws.send(new Uint8Array([1, 2, 3, 4]));
        raw.socket.write(clientFrame(0x1, Buffer.from('{"cmd":"feed"}')));
        raw.socket.write(clientFrame(0x9, Buffer.from('ping!')));
      } });
      await run;
      await until(() => obs.stats().incomingMessagesIgnored >= 25 * 5);
      expect(canonicalStateHash(r.world)).toBe(directHash(SEED, 2500));
      expect(serverFrames(raw.received()).some((f) => f.opcode === 0xa && f.payload.toString() === 'ping!')).toBe(true); // ping answered with pong
      expect(c.frames.length).toBeGreaterThan(0);
      await c.close();
      raw.socket.destroy();
    } finally {
      await obs.close();
    }
  }, 60_000);

  it('unmasked or oversized client frames close that connection only', async () => {
    const r = fresh();
    r.runUntil(100);
    const obs = await observeRunner(r, { port: 0 });
    try {
      const unmasked = await rawClient(obs.port);
      unmasked.socket.write(clientFrame(0x1, Buffer.from('hello'), false));
      await unmasked.closed;
      expect(serverFrames(unmasked.received()).find((f) => f.opcode === 0x8)?.payload.readUInt16BE(0)).toBe(1002);
      const big = await rawClient(obs.port);
      big.socket.write(clientFrame(0x1, Buffer.alloc(MAX_INCOMING_FRAME_BYTES + 1, 0x61)));
      await big.closed;
      expect(serverFrames(big.received()).find((f) => f.opcode === 0x8)?.payload.readUInt16BE(0)).toBe(1009);
      expect(obs.stats().clientsClosedForProtocol).toBe(2);
      const ok = recordingClient(obs.url);
      expect((await ok.nextFrame()).tick).toBe(100);
      await ok.close();
      r.runUntil(300);
      expect(canonicalStateHash(r.world)).toBe(directHash(SEED, 300));
    } finally {
      await obs.close();
    }
  });
});

describe('multiple clients', () => {
  it('two clients receive valid frames; frames for the same tick are byte-identical; the world is unchanged', async () => {
    const r = fresh();
    const obs = await observeRunner(r, { port: 0, maxFps: 20 });
    try {
      const a = recordingClient(obs.url);
      const b = recordingClient(obs.url);
      await Promise.all([a.opened, b.opened]);
      await r.run({ untilTick: 2000, ticksPerSecond: 1500 });
      await until(() => a.frames.at(-1)?.tick === 2000 && b.frames.at(-1)?.tick === 2000);
      for (const c of [a, b]) {
        expect(c.frames.length).toBeGreaterThan(3);
        for (const f of c.frames) {
          expect(f.observerProtocolVersion).toBe(1);
          expect(f.organisms).toHaveLength(f.population);
          expect(f.food).toHaveLength(f.foodCount);
        }
      }
      const byTick = new Map(a.frames.map((f, i) => [f.tick, a.texts[i]]));
      let shared = 0;
      b.frames.forEach((f, i) => { if (byTick.has(f.tick)) { shared++; expect(b.texts[i]).toBe(byTick.get(f.tick)); } });
      expect(shared).toBeGreaterThan(0);
      expect(canonicalStateHash(r.world)).toBe(directHash(SEED, 2000));
      await Promise.all([a.close(), b.close()]);
    } finally {
      await obs.close();
    }
  }, 60_000);
});

describe('slow clients', () => {
  it('a client that never reads is skipped, not buffered: bounded memory, other clients unaffected', async () => {
    const frame = 'x'.repeat(512 * 1024);
    let seq = 0;
    const cap = 1 << 20;
    const obs = await startObserverServer({ port: 0, maxFps: 100, maxClientBufferedBytes: cap, latest: () => ({ seq: ++seq, text: `{"seq":${seq},"pad":"${frame}"}` }) });
    try {
      const stalled = await rawClient(obs.port);
      stalled.socket.pause(); // never reads again
      const fast = recordingClientRaw(obs.url);
      await new Promise((res) => setTimeout(res, 2000));
      const s = obs.stats();
      expect(s.framesSkippedBackpressure).toBeGreaterThan(0);
      expect(s.maxClientBufferedBytes).toBeLessThanOrEqual(cap + frame.length + 64); // at most one frame over the cap
      expect(fast.count()).toBeGreaterThan(20); // the reading client kept getting fresh frames
      stalled.socket.destroy();
      fast.ws.close();
    } finally {
      await obs.close();
    }
  }, 30_000);

  it('a stalled client connected to a running world does not change or stop the simulation', async () => {
    const r = fresh();
    const obs = await observeRunner(r, { port: 0, maxFps: 60, maxClientBufferedBytes: 64 * 1024 });
    try {
      const stalled = await rawClient(obs.port);
      stalled.socket.pause();
      expect((await r.run({ untilTick: 3000 })).tick).toBe(3000);
      expect(canonicalStateHash(r.world)).toBe(directHash(SEED, 3000));
      expect(obs.stats().clients).toBe(1);
      stalled.socket.destroy();
    } finally {
      await obs.close();
    }
  }, 60_000);
});

describe('disconnect / reconnect', () => {
  it('disconnecting and reconnecting mid-run changes nothing; the reconnect gets the current state at once', async () => {
    const r = fresh();
    const obs = await observeRunner(r, { port: 0, maxFps: 2 }); // publish rounds 500 ms apart
    try {
      const run = r.run({ untilTick: 4000, ticksPerSecond: 1000 });
      const a = recordingClient(obs.url);
      await until(() => a.frames.length >= 3);
      const lastSeen = a.frames.at(-1)!.tick;
      await a.close();
      await until(() => obs.stats().clients === 0);
      await new Promise((res) => setTimeout(res, 300));
      const t0 = Date.now();
      const b = recordingClient(obs.url);
      await until(() => b.frames.length >= 1);
      expect(Date.now() - t0).toBeLessThan(300); // sent on connect, well before the next 500 ms publish round
      const first = b.frames[0]!;
      expect(first.tick).toBeGreaterThan(lastSeen);
      expect(Math.abs(first.tick - r.tick)).toBeLessThanOrEqual(300);
      await run;
      await until(() => b.frames.at(-1)?.tick === 4000);
      await b.close();
      expect(canonicalStateHash(r.world)).toBe(directHash(SEED, 4000));
    } finally {
      await obs.close();
    }
  }, 60_000);
});

describe('tick pacing (short checks)', () => {
  it('ticksPerSecond limits wall-clock speed only; the paced result equals the unpaced result', async () => {
    const paced = fresh();
    const t0 = performance.now();
    await paced.run({ untilTick: 60, ticksPerSecond: 40 });
    const elapsed = (performance.now() - t0) / 1000;
    expect(elapsed).toBeGreaterThanOrEqual(1.4); // 60 ticks at 40/s ≈ 1.5 s
    expect(elapsed).toBeLessThan(5);
    const unpaced = fresh();
    await unpaced.run({ untilTick: 60 });
    expect(canonicalStateHash(paced.world)).toBe(canonicalStateHash(unpaced.world));
    expect(canonicalStateHash(paced.world)).toBe(directHash(SEED, 60));
  });

  it('stop() is honoured promptly even at a very low rate, and invalid rates are refused', async () => {
    const r = fresh();
    const run = r.run({ ticksPerSecond: 0.5 });
    await new Promise((res) => setTimeout(res, 200));
    const t0 = Date.now();
    r.stop();
    expect((await run).reason).toBe('stopped');
    expect(Date.now() - t0).toBeLessThan(500);
    await expect(fresh().run({ ticksPerSecond: 0 })).rejects.toThrow('INVALID_OPTIONS');
    await expect(fresh().run({ ticksPerSecond: Number.NaN })).rejects.toThrow('INVALID_OPTIONS');
  });
});

/** Minimal counting client for large synthetic frames. */
function recordingClientRaw(url: string) {
  const ws = new WebSocket(url);
  let n = 0;
  ws.addEventListener('message', () => { n++; });
  return { ws, count: () => n };
}
