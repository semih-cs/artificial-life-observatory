/** Golden determinism with tick pacing: seed 20260910 to 10,000 at 1,500 ticks/s (no observer). */
import { describe, it, expect } from 'vitest';
import { canonicalStateHash } from '@alo/simulation-core';
import { WorldRunner } from '../src/index.js';
import { GOLDEN_SEED, GOLDEN_HASH_10000, seedConfig, newWorldDir } from './helpers.js';

describe('paced golden run', () => {
  it('paced at 1,500 ticks/s: pacing engages, and tick 10,000 = b95a0b4ef7dd8449', async () => {
    const r = WorldRunner.create(newWorldDir(), seedConfig(GOLDEN_SEED));
    const t0 = performance.now();
    let at3000 = 0;
    await r.run({ untilTick: 10000, ticksPerSecond: 1500, statusEvery: 3000, onStatus: (s) => { if (s.tick === 3000) at3000 = performance.now() - t0; } });
    // Unpaced, the small early world runs at several thousand ticks/s; paced, 3,000 ticks take ≈ 2 s.
    expect(at3000).toBeGreaterThanOrEqual(1900);
    expect(canonicalStateHash(r.world)).toBe(GOLDEN_HASH_10000);
  }, 300_000);
});
