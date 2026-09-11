import * as net from 'node:net';
import { randomBytes } from 'node:crypto';
import type { ObserverFrame } from '../src/index.js';

/** A WebSocket client (Node's built-in WebSocket) that records every frame it receives. */
export interface RecordingClient {
  ws: WebSocket;
  texts: string[];
  frames: ObserverFrame[];
  opened: Promise<void>;
  /** Resolves with the next frame received after this call. */
  nextFrame(): Promise<ObserverFrame>;
  close(): Promise<void>;
}

export function recordingClient(url: string): RecordingClient {
  const ws = new WebSocket(url);
  const texts: string[] = [];
  const frames: ObserverFrame[] = [];
  let waiters: Array<(f: ObserverFrame) => void> = [];
  ws.addEventListener('message', (e) => {
    const text = String(e.data);
    const frame = JSON.parse(text) as ObserverFrame;
    texts.push(text);
    frames.push(frame);
    const w = waiters;
    waiters = [];
    for (const fn of w) fn(frame);
  });
  const opened = new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error(`cannot connect to ${url}`)), { once: true });
  });
  return {
    ws, texts, frames, opened,
    nextFrame: () => new Promise((resolve) => { waiters.push(resolve); }),
    close: () => new Promise((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) { resolve(); return; }
      ws.addEventListener('close', () => resolve(), { once: true });
      ws.close();
    }),
  };
}

/** A raw TCP WebSocket client: completes the handshake, then lets the test write arbitrary frames or stop reading. */
export async function rawClient(port: number): Promise<{ socket: net.Socket; received: () => Buffer; closed: Promise<void> }> {
  const socket = net.connect(port, '127.0.0.1');
  let buf = Buffer.alloc(0);
  let headerDone = false;
  const closed = new Promise<void>((resolve) => socket.on('close', () => resolve()));
  await new Promise<void>((resolve, reject) => {
    socket.on('error', reject);
    socket.on('connect', () => {
      socket.write([
        'GET / HTTP/1.1', `Host: 127.0.0.1:${port}`, 'Upgrade: websocket', 'Connection: Upgrade',
        `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}`, 'Sec-WebSocket-Version: 13', '', '',
      ].join('\r\n'));
    });
    socket.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      if (!headerDone) {
        const end = buf.indexOf('\r\n\r\n');
        if (end < 0) return;
        const head = buf.subarray(0, end).toString();
        if (!head.startsWith('HTTP/1.1 101')) { reject(new Error(head)); return; }
        headerDone = true;
        buf = buf.subarray(end + 4);
        resolve();
      }
    });
  });
  return { socket, received: () => buf, closed };
}

/** Encode one client → server frame (masked unless told otherwise). */
export function clientFrame(opcode: number, payload: Buffer, masked = true): Buffer {
  const n = payload.length;
  const len = n < 126 ? Buffer.from([n | (masked ? 0x80 : 0)])
    : n < 65536 ? Buffer.from([126 | (masked ? 0x80 : 0), n >> 8, n & 0xff])
      : (() => { const b = Buffer.alloc(9); b[0] = 127 | (masked ? 0x80 : 0); b.writeUInt32BE(n, 5); return b; })();
  if (!masked) return Buffer.concat([Buffer.from([0x80 | opcode]), len, payload]);
  const mask = randomBytes(4);
  const body = Buffer.from(payload);
  for (let i = 0; i < body.length; i++) body[i]! ^= mask[i % 4]!;
  return Buffer.concat([Buffer.from([0x80 | opcode]), len, mask, body]);
}

/** Parse the server → client frames in a buffer (unmasked). */
export function serverFrames(buf: Buffer): Array<{ opcode: number; payload: Buffer }> {
  const out: Array<{ opcode: number; payload: Buffer }> = [];
  let off = 0;
  while (off + 2 <= buf.length) {
    const opcode = buf[off]! & 0x0f;
    let len = buf[off + 1]! & 0x7f;
    let p = off + 2;
    if (len === 126) { len = buf.readUInt16BE(p); p += 2; } else if (len === 127) { len = buf.readUInt32BE(p + 4); p += 8; }
    if (p + len > buf.length) break;
    out.push({ opcode, payload: buf.subarray(p, p + len) });
    off = p + len;
  }
  return out;
}

export const until = async (cond: () => boolean, timeoutMs = 10_000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
};
