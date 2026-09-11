/**
 * A minimal, read-only WebSocket server for observer frames (RFC 6455 subset,
 * no dependencies).
 *
 *   - Server → client: text frames, each one complete JSON observer frame.
 *   - Latest frame only: every 1000 / maxFps ms (default 10 fps) each client is
 *     sent the newest frame if it has not had it yet. There is no queue and
 *     no history. A client whose socket still holds more than
 *     `maxClientBufferedBytes` unsent bytes is skipped for that round and
 *     simply gets a newer frame later, so a slow client never grows memory
 *     and never slows anyone else. The simulation never waits for this server.
 *   - New clients get the latest frame immediately on connect.
 *   - Client → server: nothing is ever routed anywhere. Data frames are
 *     counted and discarded; ping gets pong; close is answered. Unmasked or
 *     oversized frames (> 4 KiB) close the connection (1002 / 1009).
 *   - Plain HTTP requests get 426 Upgrade Required. Binds to 127.0.0.1 by default.
 */
import * as http from 'node:http';
import type { Socket } from 'node:net';
import { createHash } from 'node:crypto';

export const DEFAULT_OBSERVER_FPS = 10;
export const DEFAULT_MAX_CLIENT_BUFFERED_BYTES = 1 << 20; // 1 MiB
export const MAX_INCOMING_FRAME_BYTES = 4096;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** The newest frame, as text. `seq` changes whenever the text changes. */
export interface LatestFrame {
  seq: number;
  text: string;
}

export interface ObserverServerOptions {
  /** 0 picks a free port. */
  port: number;
  host?: string;
  maxFps?: number;
  maxClientBufferedBytes?: number;
  /** Returns the newest frame; called at most maxFps times a second and on connect. */
  latest: () => LatestFrame | null;
}

export interface ObserverStats {
  clients: number;
  connectionsTotal: number;
  framesSent: number;
  framesSkippedBackpressure: number;
  /** Largest unsent byte count seen on any client socket right after a send. */
  maxClientBufferedBytes: number;
  incomingMessagesIgnored: number;
  clientsClosedForProtocol: number;
}

export interface ObserverServer {
  readonly host: string;
  readonly port: number;
  readonly url: string;
  stats(): ObserverStats;
  close(): Promise<void>;
}

interface Client {
  socket: Socket;
  lastSentSeq: number;
  incoming: Buffer;
  closed: boolean;
}

function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const n = payload.length;
  let header: Buffer;
  if (n < 126) {
    header = Buffer.from([0x80 | opcode, n]);
  } else if (n < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(n, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode; header[1] = 127; header.writeUInt32BE(Math.floor(n / 2 ** 32), 2); header.writeUInt32BE(n >>> 0, 6);
  }
  return Buffer.concat([header, payload]);
}

const closePayload = (code: number) => { const b = Buffer.alloc(2); b.writeUInt16BE(code, 0); return b; };

export function startObserverServer(options: ObserverServerOptions): Promise<ObserverServer> {
  const host = options.host ?? '127.0.0.1';
  const maxFps = options.maxFps ?? DEFAULT_OBSERVER_FPS;
  if (!(maxFps > 0) || !Number.isFinite(maxFps)) throw new RangeError(`maxFps must be a positive number, got ${maxFps}`);
  const bufferCap = options.maxClientBufferedBytes ?? DEFAULT_MAX_CLIENT_BUFFERED_BYTES;
  const clients = new Set<Client>();
  const stats: ObserverStats = {
    clients: 0, connectionsTotal: 0, framesSent: 0, framesSkippedBackpressure: 0,
    maxClientBufferedBytes: 0, incomingMessagesIgnored: 0, clientsClosedForProtocol: 0,
  };
  let encoded: { seq: number; buf: Buffer } | null = null;

  const current = (): { seq: number; buf: Buffer } | null => {
    const f = options.latest();
    if (f === null) return null;
    if (encoded === null || encoded.seq !== f.seq) encoded = { seq: f.seq, buf: encodeFrame(0x1, Buffer.from(f.text, 'utf-8')) };
    return encoded;
  };

  const send = (c: Client, f: { seq: number; buf: Buffer }) => {
    if (c.closed || c.lastSentSeq === f.seq) return;
    if (c.socket.writableLength > bufferCap) { stats.framesSkippedBackpressure++; return; }
    c.socket.write(f.buf);
    c.lastSentSeq = f.seq;
    stats.framesSent++;
    stats.maxClientBufferedBytes = Math.max(stats.maxClientBufferedBytes, c.socket.writableLength);
  };

  const closeClient = (c: Client, code: number) => {
    if (c.closed) return;
    c.closed = true;
    c.socket.end(encodeFrame(0x8, closePayload(code)));
    setTimeout(() => c.socket.destroy(), 250).unref();
  };

  const onData = (c: Client, chunk: Buffer) => {
    if (c.closed) return;
    c.incoming = c.incoming.length === 0 ? chunk : Buffer.concat([c.incoming, chunk]);
    for (;;) {
      const b = c.incoming;
      if (b.length < 2) return;
      const opcode = b[0]! & 0x0f;
      const masked = (b[1]! & 0x80) !== 0;
      let len = b[1]! & 0x7f;
      let off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = b.readUInt32BE(2) !== 0 ? Infinity : b.readUInt32BE(6); off = 10; }
      if (len > MAX_INCOMING_FRAME_BYTES) { stats.clientsClosedForProtocol++; closeClient(c, 1009); return; }
      if (!masked) { stats.clientsClosedForProtocol++; closeClient(c, 1002); return; }
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      const payload = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i]! ^= mask[i % 4]!;
      c.incoming = b.subarray(off + 4 + len);
      switch (opcode) {
        case 0x8: closeClient(c, 1000); return;
        case 0x9: if (!c.closed) c.socket.write(encodeFrame(0xa, payload)); break;
        case 0xa: break;
        case 0x0: case 0x1: case 0x2: stats.incomingMessagesIgnored++; break; // read-only: discarded, never routed
        default: stats.clientsClosedForProtocol++; closeClient(c, 1002); return;
      }
    }
  };

  const server = http.createServer((_req, res) => {
    res.writeHead(426, { 'Content-Type': 'text/plain; charset=utf-8', Upgrade: 'websocket', Connection: 'close' });
    res.end('Artificial Life Observatory observer stream (read-only). Connect with a WebSocket client.\n');
  });

  server.on('upgrade', (req: http.IncomingMessage, socket: Socket, head: Buffer) => {
    const key = req.headers['sec-websocket-key'];
    if (String(req.headers['upgrade']).toLowerCase() !== 'websocket' || typeof key !== 'string' || req.headers['sec-websocket-version'] !== '13') {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      return;
    }
    const accept = createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.setNoDelay(true);
    const c: Client = { socket, lastSentSeq: -1, incoming: Buffer.alloc(0), closed: false };
    clients.add(c);
    stats.connectionsTotal++;
    socket.on('data', (chunk: Buffer) => onData(c, chunk));
    socket.on('error', () => { /* a client's network error only ends that client */ });
    socket.on('close', () => { c.closed = true; clients.delete(c); });
    if (head.length > 0) onData(c, head);
    const f = current();
    if (f !== null) send(c, f);
  });

  const timer = setInterval(() => {
    if (clients.size === 0) return;
    const f = current();
    if (f === null) return;
    for (const c of clients) send(c, f);
  }, 1000 / maxFps);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, host, () => {
      server.off('error', reject);
      const addr = server.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : options.port;
      resolve({
        host,
        port,
        url: `ws://${host}:${port}/`,
        stats: () => ({ ...stats, clients: clients.size }),
        close: () => new Promise<void>((done) => {
          clearInterval(timer);
          for (const c of clients) closeClient(c, 1001);
          server.close(() => done());
          setTimeout(() => { for (const c of clients) c.socket.destroy(); server.closeAllConnections(); }, 300).unref();
        }),
      });
    });
  });
}
