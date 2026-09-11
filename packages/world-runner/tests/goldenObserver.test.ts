/** Golden determinism with an observer: seed 20260910 to 10,000, unpaced, observer on, one client connected throughout. */
import { describe, it, expect } from 'vitest';
import { canonicalStateHash } from '@alo/simulation-core';
import { WorldRunner, observeRunner } from '../src/index.js';
import { GOLDEN_SEED, GOLDEN_HASH_10000, seedConfig, newWorldDir } from './helpers.js';
import { recordingClient, until } from './wsHelpers.js';

describe('observer-connected golden run', () => {
  it('unpaced, observer enabled, client connected: tick 10,000 = b95a0b4ef7dd8449', async () => {
    const r = WorldRunner.create(newWorldDir(), seedConfig(GOLDEN_SEED));
    const obs = await observeRunner(r, { port: 0 });
    try {
      const c = recordingClient(obs.url);
      await c.opened;
      await r.run({ untilTick: 10000 });
      await until(() => c.frames.at(-1)?.tick === 10000);
      expect(canonicalStateHash(r.world)).toBe(GOLDEN_HASH_10000);
      expect(c.frames.length).toBeGreaterThan(10);
      const ticks = c.frames.map((f) => f.tick);
      expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
      expect(c.frames.at(-1)).toMatchObject({ tick: 10000, snapshotTick: 10000, population: r.status().population });
      await c.close();
    } finally {
      await obs.close();
    }
  }, 300_000);
});
