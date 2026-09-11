/**
 * Observer WebSocket lifecycle.
 *
 *   connecting → live → disconnected → reconnecting → live …
 *                                  ↘ error (unsupported protocol; no automatic retry)
 *
 * The connection is strictly read-only. The socket type it accepts has no
 * `send` at all, so nothing in this module can ever transmit to the runner —
 * the runner would discard it anyway (Spec §14.50), but the guarantee is
 * kept on this side too. WebSocket protocol housekeeping (ping/pong, close)
 * is handled by the browser.
 *
 * Only the newest frame matters: each valid message is handed to `onFrame`
 * and nothing is queued or kept here.
 */
import { parseObserverMessage, type ObserverFrame } from '../protocol/observerV1.js';

export type ConnectionState = 'connecting' | 'live' | 'disconnected' | 'reconnecting' | 'error';

export interface ConnectionStatus {
  state: ConnectionState;
  url: string;
  /** Reconnect attempts since the last successful frame. */
  attempt: number;
  /** While disconnected: milliseconds until the next attempt. */
  retryInMs: number | null;
  framesReceived: number;
  malformedMessages: number;
  /** Compact debug information about the most recent problem, if any. */
  lastError: string | null;
  /** Whether at least one frame has ever been received on this connection object. */
  everLive: boolean;
}

/** The minimal read-only socket surface the connection uses. Deliberately without `send`. */
export interface ReadOnlySocket {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  close(code?: number, reason?: string): void;
}

export interface BackoffOptions {
  initialMs: number;
  maxMs: number;
  factor: number;
}

export interface ObserverConnectionOptions {
  url: string;
  onFrame: (frame: ObserverFrame) => void;
  onStatus?: (status: ConnectionStatus) => void;
  /** Socket factory; defaults to the browser WebSocket. Injectable for tests. */
  createSocket?: (url: string) => ReadOnlySocket;
  backoff?: Partial<BackoffOptions>;
  /** Timer functions; injectable for tests. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export const DEFAULT_BACKOFF: BackoffOptions = { initialMs: 500, maxMs: 5000, factor: 2 };

export function backoffDelay(attempt: number, b: BackoffOptions = DEFAULT_BACKOFF): number {
  return Math.min(b.maxMs, b.initialMs * Math.pow(b.factor, Math.max(0, attempt)));
}

const defaultCreateSocket = (url: string): ReadOnlySocket => new WebSocket(url) as unknown as ReadOnlySocket;

export class ObserverConnection {
  private readonly url: string;
  private readonly onFrame: (frame: ObserverFrame) => void;
  private readonly onStatus: ((status: ConnectionStatus) => void) | undefined;
  private readonly createSocket: (url: string) => ReadOnlySocket;
  private readonly backoff: BackoffOptions;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  private socket: ReadOnlySocket | null = null;
  private retryHandle: unknown = null;
  private stopped = false;
  private fatal = false;
  private current: ConnectionStatus;

  constructor(options: ObserverConnectionOptions) {
    this.url = options.url;
    this.onFrame = options.onFrame;
    this.onStatus = options.onStatus;
    this.createSocket = options.createSocket ?? defaultCreateSocket;
    this.backoff = { ...DEFAULT_BACKOFF, ...options.backoff };
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.current = {
      state: 'disconnected', url: this.url, attempt: 0, retryInMs: null,
      framesReceived: 0, malformedMessages: 0, lastError: null, everLive: false,
    };
  }

  status(): ConnectionStatus {
    return this.current;
  }

  /** Connect now (idempotent while a socket is open or an attempt is scheduled). */
  start(): void {
    this.stopped = false;
    this.fatal = false;
    if (this.socket !== null || this.retryHandle !== null) return;
    this.open(this.current.attempt > 0 ? 'reconnecting' : 'connecting');
  }

  /** Close the socket and cancel any pending retry. */
  stop(): void {
    this.stopped = true;
    this.cancelRetry();
    const s = this.socket;
    this.socket = null;
    if (s !== null) {
      s.onopen = s.onmessage = s.onclose = s.onerror = null;
      try { s.close(1000, 'observatory closed'); } catch { /* already closed */ }
    }
    this.update({ state: 'disconnected', retryInMs: null });
  }

  /** Skip the backoff wait (or leave the error state) and try again immediately. */
  retryNow(): void {
    this.cancelRetry();
    if (this.socket !== null) return;
    this.stopped = false;
    this.fatal = false;
    this.open(this.current.everLive || this.current.attempt > 0 ? 'reconnecting' : 'connecting');
  }

  private update(patch: Partial<ConnectionStatus>): void {
    this.current = { ...this.current, ...patch };
    this.onStatus?.(this.current);
  }

  private cancelRetry(): void {
    if (this.retryHandle !== null) {
      this.clearTimer(this.retryHandle);
      this.retryHandle = null;
    }
  }

  private open(state: 'connecting' | 'reconnecting'): void {
    let socket: ReadOnlySocket;
    try {
      socket = this.createSocket(this.url);
    } catch (err) {
      // A socket that cannot even be constructed (e.g. an invalid URL) will not fix itself.
      this.fatal = true;
      this.update({ state: 'error', retryInMs: null, lastError: `cannot open ${this.url}: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }
    this.socket = socket;
    this.update({ state, retryInMs: null });

    socket.onopen = () => { /* 'live' is declared on the first valid frame, not on open */ };
    socket.onerror = () => {
      if (this.socket !== socket) return;
      // The close event that follows carries the state change; keep a compact note.
      this.current = { ...this.current, lastError: `socket error on ${this.url}` };
    };
    socket.onmessage = (ev) => {
      if (this.socket !== socket) return;
      this.handleMessage(ev.data);
    };
    socket.onclose = (ev) => {
      if (this.socket !== socket) return;
      this.socket = null;
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      if (this.stopped) return;
      if (this.fatal) return; // error state already published; the user may retry
      const reason = ev && typeof ev.code === 'number' && ev.code !== 1000 && ev.code !== 1005 ? `closed (${ev.code})` : null;
      this.update({ state: 'disconnected', ...(reason !== null ? { lastError: reason } : {}) });
      this.scheduleRetry();
    };
  }

  private handleMessage(data: unknown): void {
    const result = parseObserverMessage(data);
    if (result.ok) {
      this.onFrame(result.frame);
      this.update({
        state: 'live', attempt: 0, retryInMs: null, everLive: true,
        framesReceived: this.current.framesReceived + 1,
      });
      return;
    }
    if (result.kind === 'unsupported-version') {
      // Never interpret unknown data: stop, report, and wait for the user.
      this.fatal = true;
      const s = this.socket;
      this.socket = null;
      if (s !== null) {
        s.onopen = s.onmessage = s.onclose = s.onerror = null;
        try { s.close(1000, 'unsupported observer protocol'); } catch { /* ignore */ }
      }
      this.update({ state: 'error', retryInMs: null, lastError: result.message });
      return;
    }
    // Malformed frame: ignore it safely and keep the connection.
    this.update({ malformedMessages: this.current.malformedMessages + 1, lastError: result.message });
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retryHandle !== null) return;
    const delay = backoffDelay(this.current.attempt, this.backoff);
    this.update({ retryInMs: delay });
    this.retryHandle = this.setTimer(() => {
      this.retryHandle = null;
      if (this.stopped) return;
      this.current = { ...this.current, attempt: this.current.attempt + 1 };
      this.open('reconnecting');
    }, delay);
  }
}
