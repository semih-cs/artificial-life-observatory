/**
 * Serve a WorldRunner's live world as observer frames. Read-only: it only
 * reads `runner.world` and `runner.status()`, between ticks.
 */
import type { WorldRunner } from '../runner.js';
import { toObserverFrame } from './frame.js';
import { startObserverServer, ObserverServer, LatestFrame } from './server.js';

export interface RunnerObserverOptions {
  port: number;
  host?: string;
  maxFps?: number;
  maxClientBufferedBytes?: number;
}

/**
 * A `latest()` source for the observer server. The frame is rebuilt only when
 * the tick or the snapshot tick has changed; `seq` changes with it.
 */
export function runnerFrameSource(getRunner: () => WorldRunner | undefined): () => LatestFrame | null {
  let cache: { seq: number; text: string; tick: number; snapshotTick: number } | null = null;
  let seq = 0;
  return () => {
    const runner = getRunner();
    if (runner === undefined) return null;
    const world = runner.world;
    if (cache === null || cache.tick !== world.tick || cache.snapshotTick !== runner.snapshotTick) {
      cache = { seq: ++seq, text: JSON.stringify(toObserverFrame(world, runner.status())), tick: world.tick, snapshotTick: runner.snapshotTick };
    }
    return cache;
  };
}

export function observeRunner(runner: WorldRunner, options: RunnerObserverOptions): Promise<ObserverServer> {
  return startObserverServer({ ...options, latest: runnerFrameSource(() => runner) });
}
