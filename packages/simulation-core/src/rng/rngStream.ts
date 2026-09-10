import { Xoshiro128StarStar, Xoshiro128State } from './xoshiro128starstar.js';
import { initialState, RngPurpose } from './streamSeed.js';

/**
 * A named, purpose-isolated RNG stream. Phase 0A instantiates exactly two:
 * BootstrapRNG (purpose: 'bootstrap', initialization only) and CanonicalRNG
 * (purpose: 'canonical', ongoing biological/environmental randomness). This
 * is the minimum design that preserves the required isolation (§18.70) — no
 * canonical code may ever call Math.random().
 */
export class RngStream {
  readonly purpose: RngPurpose;
  private readonly generator: Xoshiro128StarStar;

  constructor(rootSeed: number, purpose: RngPurpose) {
    this.purpose = purpose;
    this.generator = new Xoshiro128StarStar(initialState(rootSeed, purpose));
  }

  next(): number {
    return this.generator.next();
  }

  nextFloat(): number {
    return this.generator.nextFloat();
  }

  nextFloatOpen01(): number {
    return this.generator.nextFloatOpen01();
  }

  nextInRange(lo: number, hi: number): number {
    return this.generator.nextInRange(lo, hi);
  }

  gaussian(mean: number, sigma: number): number {
    return this.generator.gaussian(mean, sigma);
  }

  /** A uniformly random point in [0, width) x [0, height). */
  uniformPointInWorld(width: number, height: number): { x: number; y: number } {
    return { x: this.nextInRange(0, width), y: this.nextInRange(0, height) };
  }

  getState(): Xoshiro128State {
    return this.generator.getState();
  }

  setState(state: Xoshiro128State): void {
    this.generator.setState(state);
  }
}

/** The two Phase 0A canonical streams, constructed together from one root seed. */
export interface RngStreams {
  bootstrap: RngStream;
  canonical: RngStream;
}

export function createRngStreams(rootSeed: number): RngStreams {
  return {
    bootstrap: new RngStream(rootSeed, 'bootstrap'),
    canonical: new RngStream(rootSeed, 'canonical'),
  };
}

export interface RngStreamsState {
  bootstrap: Xoshiro128State;
  canonical: Xoshiro128State;
}

export function exportRngStreamsState(streams: RngStreams): RngStreamsState {
  return { bootstrap: streams.bootstrap.getState(), canonical: streams.canonical.getState() };
}

export function restoreRngStreamsState(streams: RngStreams, state: RngStreamsState): void {
  streams.bootstrap.setState(state.bootstrap);
  streams.canonical.setState(state.canonical);
}
