/**
 * xoshiro128** — Phase 0A canonical PRNG core generator.
 *
 * Classification: [BASELINE — VERSIONED] per specification §18.70 / §5.3.
 * The underlying RNG contract (determinism, stream isolation, no
 * Math.random() in canonical logic, serializable state) is [LOCKED]; this
 * specific algorithm and its exact bit-level step are replaceable only under
 * an explicit simulationVersion bump, because changing it changes what a
 * given seed reproduces.
 *
 * All state words and intermediate values are treated as unsigned 32-bit
 * integers: every value that feeds back into state is coerced with `>>> 0`
 * (or produced via Math.imul for multiplication) rather than using ordinary
 * float64 arithmetic.
 */

export interface Xoshiro128State {
  s0: number;
  s1: number;
  s2: number;
  s3: number;
}

function rotl(x: number, k: number): number {
  return (((x << k) | (x >>> (32 - k))) >>> 0);
}

const ALL_ZERO: Xoshiro128State = { s0: 0, s1: 0, s2: 0, s3: 0 };

export function isAllZeroState(state: Xoshiro128State): boolean {
  return state.s0 === 0 && state.s1 === 0 && state.s2 === 0 && state.s3 === 0;
}

/**
 * A single xoshiro128** generator instance. Owns a mutable four-word state.
 * The all-zero state is prohibited by contract (§18.70) — it is checked at
 * construction time, not on every draw, since the only way to reach it is
 * via seeding.
 */
export class Xoshiro128StarStar {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(state: Xoshiro128State) {
    if (isAllZeroState(state)) {
      throw new Error(
        'Xoshiro128StarStar: refused to construct from an all-zero state (§18.70 contract). ' +
          'Seeding must apply the documented all-zero fallback before constructing this generator.'
      );
    }
    this.s0 = state.s0 >>> 0;
    this.s1 = state.s1 >>> 0;
    this.s2 = state.s2 >>> 0;
    this.s3 = state.s3 >>> 0;
  }

  /** Snapshot the current state (for serialization / determinism tests). */
  getState(): Xoshiro128State {
    return { s0: this.s0, s1: this.s1, s2: this.s2, s3: this.s3 };
  }

  /** Restore a previously exported state in place. */
  setState(state: Xoshiro128State): void {
    if (isAllZeroState(state)) {
      throw new Error('Xoshiro128StarStar: refused to restore an all-zero state.');
    }
    this.s0 = state.s0 >>> 0;
    this.s1 = state.s1 >>> 0;
    this.s2 = state.s2 >>> 0;
    this.s3 = state.s3 >>> 0;
  }

  /** xoshiro128** reference step (Blackman & Vigna). Advances state, returns one uint32. */
  next(): number {
    const { s0, s1, s2, s3 } = this;
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;

    const t = (s1 << 9) >>> 0;

    let ns2 = (s2 ^ s0) >>> 0;
    let ns3 = (s3 ^ s1) >>> 0;
    let ns1 = (s1 ^ ns2) >>> 0;
    let ns0 = (s0 ^ ns3) >>> 0;

    ns2 = (ns2 ^ t) >>> 0;
    ns3 = rotl(ns3, 11);

    this.s0 = ns0;
    this.s1 = ns1;
    this.s2 = ns2;
    this.s3 = ns3;

    return result;
  }

  /** Uniform float in [0, 1). next() / 2^32 — exact in float64, no precision loss. */
  nextFloat(): number {
    return this.next() / 4294967296;
  }

  /**
   * Uniform float strictly in (0, 1), excluding both 0 and 1, via a fixed
   * one-draw mapping: (next() + 0.5) / 2^32. Used to close the Box–Muller
   * ln(0) edge case (§18.70) without a retry loop or unpredictable draw count.
   */
  nextFloatOpen01(): number {
    return (this.next() + 0.5) / 4294967296;
  }

  /** Uniform float in [lo, hi). */
  nextInRange(lo: number, hi: number): number {
    return lo + this.nextFloat() * (hi - lo);
  }

  /**
   * Standard normal via Box–Muller, consuming exactly two draws per result.
   * u1 = nextFloatOpen01() (never 0 — ln(u1) always defined).
   * u2 = nextFloat() (may legitimately be 0; only feeds cos()).
   * The paired sin()-based value is deterministically discarded, not cached:
   * gaussian() always consumes exactly two draws and returns exactly one
   * result, so RNG consumption count is a fixed function of call count.
   */
  gaussian(mean: number, sigma: number): number {
    const u1 = this.nextFloatOpen01();
    const u2 = this.nextFloat();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + sigma * z;
  }
}

export { rotl, ALL_ZERO };
