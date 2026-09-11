import { describe, expect, it } from 'vitest';
import { ObserverConnection, backoffDelay, type ConnectionStatus, type ReadOnlySocket } from '../src/connection/observerConnection.js';
import type { ObserverFrame } from '../src/protocol/observerV1.js';
import { frameText } from './fixtures.js';

/** A fake WebSocket that records everything and can be driven by the test. */
class FakeSocket implements ReadOnlySocket {
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  closeCalls: Array<{ code?: number; reason?: string }> = [];
  sendCalls: unknown[] = [];
  constructor(readonly url: string) {}
  close(code?: number, reason?: string): void { this.closeCalls.push({ code, reason }); }
  /** Present only to prove it is never called: the connection's socket type has no `send`. */
  send(data: unknown): void { this.sendCalls.push(data); }
  open(): void { this.onopen?.({}); }
  message(data: unknown): void { this.onmessage?.({ data }); }
  serverClose(code = 1006): void { this.onclose?.({ code }); }
  error(): void { this.onerror?.({}); }
}

interface Harness {
  connection: ObserverConnection;
  sockets: FakeSocket[];
  frames: ObserverFrame[];
  statuses: ConnectionStatus[];
  timers: Array<{ fn: () => void; ms: number; cleared: boolean }>;
  fireTimers(): void;
}

function harness(): Harness {
  const sockets: FakeSocket[] = [];
  const frames: ObserverFrame[] = [];
  const statuses: ConnectionStatus[] = [];
  const timers: Harness['timers'] = [];
  const connection = new ObserverConnection({
    url: 'ws://127.0.0.1:8787/',
    onFrame: (f) => frames.push(f),
    onStatus: (s) => statuses.push(s),
    createSocket: (url) => { const s = new FakeSocket(url); sockets.push(s); return s; },
    setTimer: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
    clearTimer: (h) => { (h as { cleared: boolean }).cleared = true; },
    backoff: { initialMs: 500, maxMs: 5000, factor: 2 },
  });
  return {
    connection, sockets, frames, statuses, timers,
    fireTimers: () => { for (const t of timers.splice(0)) if (!t.cleared) t.fn(); },
  };
}

describe('observer connection lifecycle', () => {
  it('starts connecting and becomes live on the first valid frame', () => {
    const h = harness();
    h.connection.start();
    expect(h.connection.status().state).toBe('connecting');
    expect(h.sockets).toHaveLength(1);
    h.sockets[0]!.open();
    expect(h.connection.status().state).toBe('connecting'); // open alone is not live
    h.sockets[0]!.message(frameText({ tick: 12 }));
    expect(h.connection.status().state).toBe('live');
    expect(h.connection.status().everLive).toBe(true);
    expect(h.frames).toHaveLength(1);
    expect(h.frames[0]!.tick).toBe(12);
  });

  it('goes disconnected, retries with backoff and resumes on reconnect', () => {
    const h = harness();
    h.connection.start();
    h.sockets[0]!.open();
    h.sockets[0]!.message(frameText({ tick: 1 }));
    h.sockets[0]!.serverClose(1006);
    expect(h.connection.status().state).toBe('disconnected');
    expect(h.connection.status().retryInMs).toBe(500);
    expect(h.timers).toHaveLength(1);

    h.fireTimers();
    expect(h.connection.status().state).toBe('reconnecting');
    expect(h.sockets).toHaveLength(2);

    // the second attempt fails too: the delay grows
    h.sockets[1]!.serverClose(1006);
    expect(h.connection.status().state).toBe('disconnected');
    expect(h.connection.status().retryInMs).toBe(1000);
    h.fireTimers();
    expect(h.sockets).toHaveLength(3);
    h.sockets[2]!.serverClose(1006);
    expect(h.connection.status().retryInMs).toBe(2000);
    h.fireTimers();

    // reconnect: the newest frame is accepted, nothing is replayed, the backoff resets
    h.sockets[3]!.open();
    h.sockets[3]!.message(frameText({ tick: 900 }));
    expect(h.connection.status().state).toBe('live');
    expect(h.connection.status().attempt).toBe(0);
    expect(h.frames.map((f) => f.tick)).toEqual([1, 900]);
  });

  it('caps the backoff delay', () => {
    expect(backoffDelay(0)).toBe(500);
    expect(backoffDelay(3)).toBe(4000);
    expect(backoffDelay(4)).toBe(5000);
    expect(backoffDelay(20)).toBe(5000);
  });

  it('reports an unsupported protocol version as an error and does not retry by itself', () => {
    const h = harness();
    h.connection.start();
    h.sockets[0]!.open();
    h.sockets[0]!.message(frameText({ observerProtocolVersion: 3 }));
    const s = h.connection.status();
    expect(s.state).toBe('error');
    expect(s.lastError).toContain('v3');
    expect(h.frames).toHaveLength(0);
    expect(h.sockets[0]!.closeCalls).toHaveLength(1);
    expect(h.timers).toHaveLength(0);
    // a later close event on that socket changes nothing
    h.sockets[0]!.serverClose(1000);
    expect(h.connection.status().state).toBe('error');
    // the user can retry explicitly
    h.connection.retryNow();
    expect(h.sockets).toHaveLength(2);
  });

  it('ignores malformed frames safely and stays connected', () => {
    const h = harness();
    h.connection.start();
    h.sockets[0]!.open();
    h.sockets[0]!.message(frameText({ tick: 5 }));
    h.sockets[0]!.message('{"type":"frame"');
    h.sockets[0]!.message(JSON.stringify({ type: 'frame', observerProtocolVersion: 1 }));
    const s = h.connection.status();
    expect(s.state).toBe('live');
    expect(s.malformedMessages).toBe(2);
    expect(s.lastError).toBeTruthy();
    expect(h.frames).toHaveLength(1);
    h.sockets[0]!.message(frameText({ tick: 6 }));
    expect(h.frames).toHaveLength(2);
  });

  it('stop() closes the socket and cancels a pending retry', () => {
    const h = harness();
    h.connection.start();
    h.sockets[0]!.serverClose(1006);
    expect(h.timers).toHaveLength(1);
    h.connection.stop();
    expect(h.timers[0]!.cleared).toBe(true);
    expect(h.connection.status().state).toBe('disconnected');
    h.fireTimers();
    expect(h.sockets).toHaveLength(1);
  });

  it('never sends anything to the observer (read-only guarantee)', () => {
    const h = harness();
    h.connection.start();
    const s0 = h.sockets[0]!;
    s0.open();
    s0.message(frameText({ tick: 1 }));
    s0.message('garbage');
    s0.error();
    s0.serverClose(1006);
    h.fireTimers();
    const s1 = h.sockets[1]!;
    s1.open();
    s1.message(frameText({ tick: 2 }));
    h.connection.stop();
    for (const s of h.sockets) expect(s.sendCalls).toHaveLength(0);
    // the socket contract itself has no send: nothing typed as ReadOnlySocket can transmit
    const contract: ReadOnlySocket = s0;
    expect('send' in contract && typeof (contract as { send?: unknown }).send === 'function').toBe(true); // the fake has one…
    expect(s0.sendCalls).toHaveLength(0);                                                                   // …and it was never used
  });
});
