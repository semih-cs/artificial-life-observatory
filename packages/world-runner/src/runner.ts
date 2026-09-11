/**
 * The persistent world runner (Phase 0C): one canonical world, stored in one
 * snapshot-store directory, stepped continuously and saved periodically.
 *
 *   WorldRunner.create(dir, config)  explicit fresh launch: bootstrap, save tick 0
 *   WorldRunner.open(dir)            recover the newest valid snapshot, quarantine
 *                                    the corrupt ones it skipped, continue
 *
 * Rules:
 *   - The runner never changes the simulation. Each tick is exactly
 *     `stepWorld(world, config)`; saving only reads the world (snapshot
 *     purity, slice 1). Nothing depends on wall-clock time.
 *   - A fresh world is created only by an explicit `create`, and never over a
 *     directory that already holds a world (WORLD_EXISTS) — not even a broken
 *     one. `open` never creates a world: if recovery fails it throws.
 *   - Periodic saves happen when the tick is a multiple of `saveEvery`, so the
 *     cadence depends on simulation ticks only and is the same before and
 *     after a restart. A stop saves the current tick if it is not yet saved.
 *   - A hard kill loses at most the ticks since the last save. A restart
 *     recovers the newest valid snapshot; unsaved ticks are not reconstructed,
 *     and the future from the recovered tick is the canonical one.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { bootstrapWorld, stepWorld, cloneConfig } from '@alo/simulation-core';
import type { SimulationConfig, WorldState } from '@alo/simulation-core';
import {
  createSnapshot, saveToStore, recoverLatestValid, quarantineSkippedSnapshots, listSnapshots, configHash,
  STORE_IDENTITY_FILE, QUARANTINE_DIR, DEFAULT_SNAPSHOT_RETENTION,
} from '@alo/persistence';
import type { RecoveryReport, QuarantineResult } from '@alo/persistence';

export const DEFAULT_SAVE_EVERY = 1000;
/** Ticks run between yields to the event loop in `run`, so signals and `stop()` are seen promptly. */
export const DEFAULT_BATCH_TICKS = 100;

export type WorldRunnerErrorCode = 'WORLD_EXISTS' | 'INVALID_OPTIONS' | 'ALREADY_RUNNING';

export class WorldRunnerError extends Error {
  readonly code: WorldRunnerErrorCode;
  constructor(code: WorldRunnerErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'WorldRunnerError';
    this.code = code;
  }
}

export interface WorldRunnerOptions {
  /** Save a snapshot whenever the tick is a multiple of this. Default 1000. */
  saveEvery?: number;
  /** Snapshots retained by the store. Default 5. */
  keep?: number;
}

export interface RecoveryInfo {
  report: RecoveryReport;
  /** null when recovery skipped nothing. */
  quarantine: QuarantineResult | null;
}

/** Minimal operational status. Plain data; no timestamps. */
export interface RunnerStatus {
  dir: string;
  origin: 'fresh' | 'recovered';
  tick: number;
  population: number;
  food: number;
  /** The newest tick durably saved by this runner (or recovered from). */
  snapshotTick: number;
  simulationVersion: string;
  configHash: string;
  rootSeed: number;
  saveEvery: number;
  recoveredFromTick: number | null;
  stopRequested: boolean;
}

export interface WorldRunOptions {
  /** Stop when this tick is reached. Without it, run until `stop()`. */
  untilTick?: number;
  /** Called with the status whenever the tick is a multiple of `statusEvery`. */
  statusEvery?: number;
  onStatus?: (status: RunnerStatus) => void;
  batchTicks?: number;
  /**
   * Wall-clock pacing: run about this many ticks per real second. It only
   * decides WHEN ticks run, never what they compute. If the loop falls more
   * than a second behind (a slow machine, a paused process), the backlog is
   * dropped rather than replayed in a burst. Default: as fast as possible.
   */
  ticksPerSecond?: number;
}

export interface WorldRunResult {
  reason: 'until-tick' | 'stopped';
  tick: number;
  snapshotTick: number;
}

function positiveInt(v: number, name: string): number {
  if (!Number.isInteger(v) || v < 1) throw new WorldRunnerError('INVALID_OPTIONS', `${name} must be an integer >= 1, got ${v}`);
  return v;
}

/** True when `dir` already holds (part of) a world: an identity, a snapshot, or quarantined snapshots. */
export function worldExists(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  return fs.existsSync(path.join(dir, STORE_IDENTITY_FILE))
    || listSnapshots(dir).length > 0
    || fs.existsSync(path.join(dir, QUARANTINE_DIR));
}

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** Longest single wait while paced, so stop() is still seen promptly at very low rates. */
const MAX_PACED_WAIT_MS = 50;

export class WorldRunner {
  readonly dir: string;
  readonly origin: 'fresh' | 'recovered';
  readonly recovery: RecoveryInfo | null;
  readonly saveEvery: number;
  readonly keep: number;
  private readonly cfg: SimulationConfig;
  private readonly cfgHash: string;
  private current: WorldState;
  private savedTick: number;
  private stopFlag = false;
  private running = false;

  private constructor(dir: string, config: SimulationConfig, world: WorldState, origin: 'fresh' | 'recovered',
    savedTick: number, recovery: RecoveryInfo | null, options: WorldRunnerOptions) {
    this.dir = dir;
    this.cfg = config;
    this.cfgHash = configHash(config);
    this.current = world;
    this.origin = origin;
    this.savedTick = savedTick;
    this.recovery = recovery;
    this.saveEvery = positiveInt(options.saveEvery ?? DEFAULT_SAVE_EVERY, 'saveEvery');
    this.keep = positiveInt(options.keep ?? DEFAULT_SNAPSHOT_RETENTION, 'keep');
  }

  /**
   * Explicit fresh launch. Refuses a directory that already holds a world.
   * Bootstraps the world from `config` and saves it as the tick-0 snapshot,
   * which also records the store's world identity.
   */
  static create(dir: string, config: SimulationConfig, options: WorldRunnerOptions = {}): WorldRunner {
    positiveInt(options.saveEvery ?? DEFAULT_SAVE_EVERY, 'saveEvery');
    positiveInt(options.keep ?? DEFAULT_SNAPSHOT_RETENTION, 'keep');
    if (worldExists(dir)) {
      throw new WorldRunnerError('WORLD_EXISTS', `${dir} already holds a world; refusing to create a new one over it (open it to recover, or choose another directory)`);
    }
    const cfg = cloneConfig(config);
    const world = bootstrapWorld(cfg);
    saveToStore(dir, createSnapshot(world, cfg), { keep: options.keep ?? DEFAULT_SNAPSHOT_RETENTION });
    return new WorldRunner(dir, cfg, world, 'fresh', world.tick, null, options);
  }

  /**
   * Recover the world stored in `dir`: newest valid snapshot, corrupt newer
   * ones quarantined. Throws — and creates nothing — if recovery fails.
   */
  static open(dir: string, options: WorldRunnerOptions = {}): WorldRunner {
    positiveInt(options.saveEvery ?? DEFAULT_SAVE_EVERY, 'saveEvery');
    positiveInt(options.keep ?? DEFAULT_SNAPSHOT_RETENTION, 'keep');
    const r = recoverLatestValid(dir);
    const quarantine = r.report.skipped.length > 0 ? quarantineSkippedSnapshots(dir, r.report) : null;
    return new WorldRunner(dir, r.config, r.world, 'recovered', r.snapshot.tick, { report: r.report, quarantine }, options);
  }

  /** The live world. Read it; never modify it. */
  get world(): WorldState { return this.current; }
  /** A copy of the world's immutable configuration. */
  get config(): SimulationConfig { return cloneConfig(this.cfg); }
  get tick(): number { return this.current.tick; }
  get snapshotTick(): number { return this.savedTick; }

  /** Advance one tick; save if the new tick is on the save cadence. */
  step(): void {
    this.current = stepWorld(this.current, this.cfg).world;
    if (this.current.tick % this.saveEvery === 0) this.saveNow();
  }

  /** Synchronously step until `tick` (no-op if already there or past it). Does not do a final save; see `close`. */
  runUntil(tick: number): void {
    while (this.current.tick < tick) this.step();
  }

  /** Persist the current tick unless it is already saved. Returns the saved tick. */
  saveNow(): number {
    if (this.savedTick === this.current.tick) return this.savedTick;
    saveToStore(this.dir, createSnapshot(this.current, this.cfg), { keep: this.keep });
    this.savedTick = this.current.tick;
    return this.savedTick;
  }

  /** Clean stop for synchronous use: save the current tick if needed. */
  close(): number {
    return this.saveNow();
  }

  /** Ask a running `run` to stop after the current tick; it then saves and resolves. */
  stop(): void {
    this.stopFlag = true;
  }

  /**
   * Run continuously until `untilTick` or `stop()`, yielding to the event loop
   * every `batchTicks` ticks. On return the current tick is durably saved.
   */
  async run(options: WorldRunOptions = {}): Promise<WorldRunResult> {
    if (this.running) throw new WorldRunnerError('ALREADY_RUNNING', 'run() is already in progress');
    const batch = positiveInt(options.batchTicks ?? DEFAULT_BATCH_TICKS, 'batchTicks');
    const statusEvery = options.statusEvery === undefined ? undefined : positiveInt(options.statusEvery, 'statusEvery');
    const until = options.untilTick;
    if (until !== undefined && (!Number.isInteger(until) || until < 0)) {
      throw new WorldRunnerError('INVALID_OPTIONS', `untilTick must be a non-negative integer, got ${until}`);
    }
    const tps = options.ticksPerSecond;
    if (tps !== undefined && !(Number.isFinite(tps) && tps > 0)) {
      throw new WorldRunnerError('INVALID_OPTIONS', `ticksPerSecond must be a positive number, got ${tps}`);
    }
    this.running = true;
    // Pacing anchor: tick `anchorTick` was due at wall-clock `anchorMs`.
    let anchorMs = performance.now();
    let anchorTick = this.current.tick;
    try {
      while (!this.stopFlag && (until === undefined || this.current.tick < until)) {
        let budget = batch;
        if (tps !== undefined) {
          const now = performance.now();
          let due = anchorTick + Math.floor(((now - anchorMs) * tps) / 1000) - this.current.tick;
          if (due > tps) { anchorMs = now; anchorTick = this.current.tick; due = 0; } // more than 1 s behind: drop the backlog
          if (due <= 0) {
            const nextAt = anchorMs + ((this.current.tick - anchorTick + 1) * 1000) / tps;
            await sleep(Math.min(MAX_PACED_WAIT_MS, Math.max(1, nextAt - now)));
            continue;
          }
          budget = Math.min(batch, due);
        }
        for (let i = 0; i < budget && !this.stopFlag && (until === undefined || this.current.tick < until); i++) {
          this.step();
          if (statusEvery !== undefined && this.current.tick % statusEvery === 0) options.onStatus?.(this.status());
        }
        await yieldToEventLoop();
      }
      const reason: WorldRunResult['reason'] = this.stopFlag ? 'stopped' : 'until-tick';
      this.saveNow();
      return { reason, tick: this.current.tick, snapshotTick: this.savedTick };
    } finally {
      this.running = false;
    }
  }

  status(): RunnerStatus {
    let population = 0;
    for (const o of this.current.organisms) if (o.alive) population++;
    return {
      dir: this.dir,
      origin: this.origin,
      tick: this.current.tick,
      population,
      food: this.current.food.length,
      snapshotTick: this.savedTick,
      simulationVersion: this.current.simulationVersion,
      configHash: this.cfgHash,
      rootSeed: this.cfg.rootSeed,
      saveEvery: this.saveEvery,
      recoveredFromTick: this.recovery === null ? null : this.recovery.report.selected!.tick,
      stopRequested: this.stopFlag,
    };
  }
}
