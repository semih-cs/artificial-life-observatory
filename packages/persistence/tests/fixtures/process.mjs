// Separate-process fixture for the §18.60 continuation test. Uses only the BUILT
// packages, so nothing can leak from the test process's memory.
//
//   node process.mjs create <seed> <tick> <snapshotPath>
//   node process.mjs resume <snapshotPath> <toTick> <every>   → prints JSON hashes
import { bootstrapWorld, cloneConfig, DEFAULT_SIMULATION_CONFIG, stepWorld, canonicalStateHash } from '@alo/simulation-core';
import { createSnapshot, saveSnapshotAtomic, loadSnapshot, restoreSnapshot } from '../../dist/index.js';

const [mode, ...args] = process.argv.slice(2);
if (mode === 'create') {
  const [seed, tick, file] = args;
  const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
  config.rootSeed = Number(seed);
  let world = bootstrapWorld(config);
  while (world.tick < Number(tick)) world = stepWorld(world, config).world;
  saveSnapshotAtomic(file, createSnapshot(world, config));
  process.stdout.write(JSON.stringify({ pid: process.pid, tick: world.tick, hash: canonicalStateHash(world) }));
} else if (mode === 'resume') {
  const [file, toTick, every] = args;
  const { world: restored, config } = restoreSnapshot(loadSnapshot(file));
  let world = restored;
  const hashes = {};
  while (world.tick < Number(toTick)) {
    world = stepWorld(world, config).world;
    if (world.tick % Number(every) === 0) hashes[world.tick] = canonicalStateHash(world);
  }
  process.stdout.write(JSON.stringify({ pid: process.pid, startTick: restored.tick, hashes }));
} else {
  process.stderr.write(`unknown mode ${mode}\n`);
  process.exit(2);
}
