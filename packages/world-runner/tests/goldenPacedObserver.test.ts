/** Golden determinism with pacing AND an observer with a connected client: seed 20260910 to 10,000. */
import { describe, it, expect } from 'vitest';
import { canonicalStateHash } from '@alo/simulation-core';
import { WorldRunner, observeRunner } from '../src/index.js';
import { GOLDEN_SEED, GOLDEN_HASH_10000, seedConfig, newWorldDir } from './helpers.js';
import { recordingClient, until } from './wsHelpers.js';

describe('paced + observer golden run', () => {
  it('paced at 1,500 ticks/s with an observer and a client (which also sends junk): tick 10,000 = b95a0b4ef7dd8449', async () => {
    const r = WorldRunner.create(newWorldDir(), seedConfig(GOLDEN_SEED));
    const obs = await observeRunner(r, { port: 0 });
    try {
      const c = recordingClient(obs.url);
      await c.opened;
      await r.run({ untilTick: 10000, ticksPerSecond: 1500, statusEvery: 500, onStatus: () => c.ws.send('{"cmd":"pause"}') });
      await until(() => c.frames.at(-1)?.tick === 10000);
      expect(canonicalStateHash(r.world)).toBe(GOLDEN_HASH_10000);
      expect(c.frames.length).toBeGreaterThan(20);
      await until(() => obs.stats().incomingMessagesIgnored >= 20);
      expect(obs.stats().incomingMessagesIgnored).toBe(20); // one per status call, all discarded
      await c.close();
    } finally {
      await obs.close();
    }
  }, 300_000);
});
