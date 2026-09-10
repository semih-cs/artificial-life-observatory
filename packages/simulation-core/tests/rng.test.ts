import { describe, it, expect } from 'vitest';
import { RngStream, createRngStreams, exportRngStreamsState, restoreRngStreamsState } from '../src/rng/rngStream.js';
import { Xoshiro128StarStar } from '../src/rng/xoshiro128starstar.js';
import { initialState } from '../src/rng/streamSeed.js';

describe('xoshiro128** determinism', () => {
  it('same seed + same purpose produces the same sequence', () => {
    const a = new RngStream(12345, 'canonical');
    const b = new RngStream(12345, 'canonical');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('different purpose produces a deterministic but distinct stream from the same root seed', () => {
    const bootstrap = new RngStream(12345, 'bootstrap');
    const canonical = new RngStream(12345, 'canonical');
    const seqBootstrap = Array.from({ length: 20 }, () => bootstrap.next());
    const seqCanonical = Array.from({ length: 20 }, () => canonical.next());
    expect(seqBootstrap).not.toEqual(seqCanonical);

    // and each is independently reproducible
    const bootstrap2 = new RngStream(12345, 'bootstrap');
    const seqBootstrap2 = Array.from({ length: 20 }, () => bootstrap2.next());
    expect(seqBootstrap2).toEqual(seqBootstrap);
  });

  it('different root seeds produce different sequences', () => {
    const a = new RngStream(1, 'canonical');
    const b = new RngStream(2, 'canonical');
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('export state -> continue -> restore state -> identical continuation', () => {
    const stream = new RngStream(999, 'canonical');
    // burn some draws
    for (let i = 0; i < 7; i++) stream.next();
    const snapshot = stream.getState();

    const continuedA = Array.from({ length: 15 }, () => stream.next());

    // restore a fresh stream to the snapshot and replay
    const replay = new RngStream(1, 'canonical'); // arbitrary seed, state will be overwritten
    replay.setState(snapshot);
    const continuedB = Array.from({ length: 15 }, () => replay.next());

    expect(continuedB).toEqual(continuedA);
  });

  it('createRngStreams / export / restore round-trips both streams together', () => {
    const streams = createRngStreams(42);
    for (let i = 0; i < 5; i++) {
      streams.bootstrap.next();
      streams.canonical.next();
    }
    const snapshot = exportRngStreamsState(streams);

    const expectedBootstrap = Array.from({ length: 10 }, () => streams.bootstrap.next());
    const expectedCanonical = Array.from({ length: 10 }, () => streams.canonical.next());

    const restored = createRngStreams(1); // arbitrary seed, overwritten below
    restoreRngStreamsState(restored, snapshot);
    const actualBootstrap = Array.from({ length: 10 }, () => restored.bootstrap.next());
    const actualCanonical = Array.from({ length: 10 }, () => restored.canonical.next());

    expect(actualBootstrap).toEqual(expectedBootstrap);
    expect(actualCanonical).toEqual(expectedCanonical);
  });

  it('refuses to construct from an all-zero state', () => {
    expect(() => new Xoshiro128StarStar({ s0: 0, s1: 0, s2: 0, s3: 0 })).toThrow();
  });

  it('initialState never produces an all-zero state for ordinary seeds', () => {
    for (let seed = 0; seed < 500; seed++) {
      const state = initialState(seed, 'canonical');
      expect(state.s0 === 0 && state.s1 === 0 && state.s2 === 0 && state.s3 === 0).toBe(false);
    }
  });
});

describe('nextFloat / nextFloatOpen01 / nextInRange', () => {
  it('nextFloat stays within [0, 1)', () => {
    const s = new RngStream(7, 'canonical');
    for (let i = 0; i < 1000; i++) {
      const v = s.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextFloatOpen01 is strictly within (0, 1) for every draw, closing the Box-Muller ln(0) edge case', () => {
    const s = new RngStream(7, 'canonical');
    for (let i = 0; i < 5000; i++) {
      const v = s.nextFloatOpen01();
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
      expect(Number.isFinite(Math.log(v))).toBe(true);
    }
  });

  it('nextInRange stays within [lo, hi)', () => {
    const s = new RngStream(7, 'canonical');
    for (let i = 0; i < 500; i++) {
      const v = s.nextInRange(-3, 5);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(5);
    }
  });
});

describe('gaussian()', () => {
  it('consumes exactly two draws per call (fixed draw-count model)', () => {
    const raw = new RngStream(55, 'canonical');
    const viaGaussian = new RngStream(55, 'canonical');

    const before = viaGaussian.gaussian(0, 1);
    // two draws should have been consumed on the raw stream to match
    const r1 = raw.next();
    const r2 = raw.next();
    expect(typeof before).toBe('number');
    expect(typeof r1).toBe('number');
    expect(typeof r2).toBe('number');

    // Now confirm draw-count parity holds over many calls: calling gaussian()
    // N times and next() 2N times from identically-seeded streams leaves both
    // streams in the same underlying state.
    const gStream = new RngStream(9001, 'canonical');
    const nStream = new RngStream(9001, 'canonical');
    for (let i = 0; i < 37; i++) gStream.gaussian(0, 1);
    for (let i = 0; i < 74; i++) nStream.next();
    expect(gStream.getState()).toEqual(nStream.getState());
  });

  it('never evaluates ln(0): produces only finite results across many draws', () => {
    const s = new RngStream(3, 'canonical');
    for (let i = 0; i < 20000; i++) {
      const v = s.gaussian(0, 1);
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = new RngStream(321, 'canonical');
    const b = new RngStream(321, 'canonical');
    const seqA = Array.from({ length: 50 }, () => a.gaussian(0, 1));
    const seqB = Array.from({ length: 50 }, () => b.gaussian(0, 1));
    expect(seqA).toEqual(seqB);
  });
});
