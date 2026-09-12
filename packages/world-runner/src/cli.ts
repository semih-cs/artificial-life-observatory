/**
 * World runner CLI.
 *
 *   npm run world -- --dir worlds/demo --new --seed 20260910   create a world, then run it
 *   npm run world -- --dir worlds/v2 --new --seed 20260910 --model 0A.3.0   create a V2.1 world
 *   npm run world -- --dir worlds/demo                         recover it and keep running
 *
 * Options:
 *   --dir <path>          world directory (required). Relative paths resolve from where npm was invoked.
 *   --new                 create a fresh world. Requires --seed. Refused if --dir already holds a world.
 *   --seed <uint32>       root seed for --new (default canonical config otherwise). Not accepted on recovery:
 *                         the stored world's config is used.
 *   --model <version>     model for --new: any registered model 0A.1.0-0A.7.0 (default 0A.2.0, frozen v1).
 *                         Not accepted on recovery: a recovered world always keeps its stored model.
 *   --save-every <ticks>  snapshot cadence in simulation ticks (default 1000)
 *   --keep <n>            snapshots retained (default 5)
 *   --until-tick <tick>   stop, save and exit at this tick (default: run until SIGINT/SIGTERM)
 *   --status-every <n>    print a status line every n ticks (default: --save-every)
 *   --json                print status as JSON lines
 *   --ticks-per-second <n>  pace the simulation to about n ticks per real second (default: as fast as possible)
 *   --observe <port>      serve read-only observer frames over WebSocket on ws://127.0.0.1:<port>/ (≤ 10 fps)
 *
 * SIGINT / SIGTERM stop the run after the current tick, save it, then exit 0.
 * A second signal exits immediately; the newest saved snapshot is still intact.
 */
import * as path from 'node:path';
import { modelConfig, MULTI_FOUNDER_MODEL_VERSION, SUPPORTED_MODEL_VERSIONS } from '@alo/simulation-core';
import { WorldRunner, DEFAULT_SAVE_EVERY } from './runner.js';
import type { RunnerStatus } from './runner.js';
import { startObserverServer } from './observer/server.js';
import type { ObserverServer } from './observer/server.js';
import { runnerFrameSource } from './observer/runnerObserver.js';
import { OBSERVER_PROTOCOL_VERSION } from './observer/frame.js';

interface Args {
  dir: string;
  create: boolean;
  seed?: number;
  model?: string;
  saveEvery: number;
  keep?: number;
  untilTick?: number;
  statusEvery?: number;
  json: boolean;
  ticksPerSecond?: number;
  observePort?: number;
}

const USAGE = 'usage: world --dir <path> [--new --seed <uint32> [--model <version>]] [--save-every <ticks>] [--keep <n>] [--until-tick <tick>] [--status-every <ticks>] [--ticks-per-second <n>] [--observe <port>] [--json]';

function fail(message: string): never {
  process.stderr.write(`error: ${message}\n${USAGE}\n`);
  process.exit(2);
}

function intArg(key: string, value: string | undefined, min: number): number {
  const n = Number(value);
  if (value === undefined || !Number.isInteger(n) || n < min) fail(`${key} needs an integer >= ${min}, got ${value}`);
  return n;
}

function parseArgs(argv: readonly string[]): Args {
  let dir: string | undefined;
  const a: Omit<Args, 'dir'> = { create: false, saveEvery: DEFAULT_SAVE_EVERY, json: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]!;
    const value = argv[i + 1];
    switch (key) {
      case '--dir': if (value === undefined) fail('--dir needs a path'); dir = value; i++; break;
      case '--new': a.create = true; break;
      case '--seed': a.seed = intArg(key, value, 0); if (a.seed > 0xffffffff) fail('--seed must be a uint32'); i++; break;
      case '--model':
        if (value === undefined || !SUPPORTED_MODEL_VERSIONS.includes(value)) fail(`--model must be one of ${SUPPORTED_MODEL_VERSIONS.join(', ')}, got ${value}`);
        a.model = value; i++; break;
      case '--save-every': a.saveEvery = intArg(key, value, 1); i++; break;
      case '--keep': a.keep = intArg(key, value, 1); i++; break;
      case '--until-tick': a.untilTick = intArg(key, value, 0); i++; break;
      case '--status-every': a.statusEvery = intArg(key, value, 1); i++; break;
      case '--json': a.json = true; break;
      case '--observe': a.observePort = intArg(key, value, 0); if (a.observePort > 65535) fail('--observe needs a port 0..65535'); i++; break;
      case '--ticks-per-second': {
        const n = Number(value);
        if (value === undefined || !Number.isFinite(n) || n <= 0) fail(`--ticks-per-second needs a positive number, got ${value}`);
        a.ticksPerSecond = n; i++; break;
      }
      default: fail(`unknown argument ${key}`);
    }
  }
  if (dir === undefined) fail('--dir is required');
  if (a.create && a.seed === undefined) fail('--new requires --seed');
  if (!a.create && a.seed !== undefined) fail('--seed is only used with --new; a recovered world keeps its stored seed');
  if (!a.create && a.model !== undefined) fail('--model is only used with --new; a recovered world keeps its stored model');
  // npm runs workspace scripts inside the package directory; resolve relative to where it was invoked.
  const base = process.env['INIT_CWD'] ?? process.cwd();
  return { dir: path.resolve(base, dir), ...a };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const out = (event: string, data: Record<string, unknown>, human: string) => {
    process.stdout.write(args.json ? JSON.stringify({ event, ...data }) + '\n' : `[world] ${human}\n`);
  };
  const line = (s: RunnerStatus) =>
    `tick ${s.tick} | population ${s.population} | food ${s.food} | snapshot ${s.snapshotTick} | ${s.simulationVersion} config ${s.configHash} seed ${s.rootSeed} | ${s.origin}`;

  // The observer binds first, so a busy port fails before any world is created or opened.
  let runner: WorldRunner | undefined;
  let observer: ObserverServer | undefined;
  if (args.observePort !== undefined) {
    try {
      observer = await startObserverServer({ port: args.observePort, latest: runnerFrameSource(() => runner) });
    } catch (err) {
      process.stderr.write(`error: cannot serve observer frames on port ${args.observePort}: ${err instanceof Error ? err.message : String(err)}\nno world was created or modified; nothing is running\n`);
      process.exit(1);
    }
  }
  try {
    if (args.create) {
      // Without --model a new world is the frozen v1 model 0A.2.0, exactly as before V2.
      const config = modelConfig(args.model ?? MULTI_FOUNDER_MODEL_VERSION);
      config.rootSeed = args.seed!;
      runner = WorldRunner.create(args.dir, config, { saveEvery: args.saveEvery, keep: args.keep });
    } else {
      runner = WorldRunner.open(args.dir, { saveEvery: args.saveEvery, keep: args.keep });
    }
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\nno world was created or modified; nothing is running\n`
      + (args.create ? '' : 'to create a new world instead, use --new --seed <uint32> with a directory that holds no world\n'));
    process.exit(1);
  }
  const live: WorldRunner = runner; // narrowed for the closures below

  const started = live.status();
  const recovery = live.recovery;
  out('started', {
    ...started,
    ticksPerSecondTarget: args.ticksPerSecond ?? null,
    skipped: recovery?.report.skipped ?? [],
    quarantined: recovery?.quarantine?.moved ?? [],
  }, `${live.origin === 'fresh' ? 'created' : `recovered from snapshot ${started.recoveredFromTick}`} in ${args.dir} | ${line(started)}`
    + (args.ticksPerSecond !== undefined ? ` | paced at ${args.ticksPerSecond} ticks/s` : '')
    + (recovery && recovery.report.skipped.length > 0
      ? ` | skipped ${recovery.report.skipped.map((s) => `${s.fileName} (${s.code})`).join(', ')}; quarantined ${recovery.quarantine?.moved.length ?? 0}`
      : ''));
  if (observer !== undefined) {
    out('observing', { url: observer.url, observerProtocolVersion: OBSERVER_PROTOCOL_VERSION },
      `observer frames (read-only, protocol v${OBSERVER_PROTOCOL_VERSION}, ≤ 10 fps) on ${observer.url}`);
  }

  const shutdown = async (code: number): Promise<never> => {
    if (observer !== undefined) await observer.close();
    process.exit(code);
  };

  let signals = 0;
  const onSignal = (sig: NodeJS.Signals) => {
    signals++;
    if (signals > 1) {
      process.stderr.write(`[world] second ${sig}: exiting now; the newest saved snapshot (${live.snapshotTick}) is intact\n`);
      process.exit(130);
    }
    out('stopping', { signal: sig, tick: live.tick }, `${sig}: stopping after tick ${live.tick}, saving…`);
    live.stop();
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  // Throughput is wall-clock and observational only; it never reaches the simulation.
  let lastTick = live.tick;
  let lastTime = performance.now();
  const onStatus = (s: RunnerStatus) => {
    const now = performance.now();
    const tps = Math.round(((s.tick - lastTick) * 1000) / Math.max(1, now - lastTime));
    lastTick = s.tick;
    lastTime = now;
    out('status', { ...s, ticksPerSecond: tps }, `${line(s)} | ${tps} ticks/s`);
  };

  try {
    const result = await live.run({ untilTick: args.untilTick, statusEvery: args.statusEvery ?? args.saveEvery, onStatus, ticksPerSecond: args.ticksPerSecond });
    out('stopped', { ...result, ...live.status() }, `stopped (${result.reason}) at tick ${result.tick}; saved snapshot ${result.snapshotTick}`);
    await shutdown(0);
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\nthe newest saved snapshot (${live.snapshotTick}) is intact\n`);
    await shutdown(1);
  }
}

void main();
