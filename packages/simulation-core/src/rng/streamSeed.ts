import { splitmix32Next } from './splitmix32.js';
import { Xoshiro128State, isAllZeroState } from './xoshiro128starstar.js';

/**
 * RNG stream purposes. Phase 0A only ever constructs streams for
 * 'bootstrap' and 'canonical'. The others are reserved purpose constants so
 * the derivation scheme does not need to change when those streams are
 * introduced in a later phase — none of them is implemented in Phase 0A.
 */
export type RngPurpose = 'bootstrap' | 'canonical' | 'analytics' | 'probeSampling' | 'probeExecution';

export const PURPOSE_CONSTANT: Record<RngPurpose, number> = {
  bootstrap: 0x9e3779b1,
  canonical: 0x85ebca77,
  analytics: 0xc2b2ae3d,
  probeSampling: 0x27d4eb2f,
  probeExecution: 0x165667b1,
};

/** streamSeed(purpose) = splitmix32(rootSeed XOR PURPOSE_CONSTANT[purpose]) */
export function streamSeed(rootSeed: number, purpose: RngPurpose): number {
  const input = (rootSeed >>> 0) ^ PURPOSE_CONSTANT[purpose];
  return splitmix32Next(input >>> 0).value;
}

/**
 * Expand a single stream seed into a full four-word xoshiro128** state via
 * repeated splitmix32 stepping. If the result would be all-zero (a
 * measure-zero event for any real seed), retry once with the seed XORed by
 * a fixed nonzero constant, per the §18.70 all-zero-state contract.
 */
export function initialState(rootSeed: number, purpose: RngPurpose): Xoshiro128State {
  const seed = streamSeed(rootSeed, purpose);
  const state = expandToState(seed);
  if (!isAllZeroState(state)) return state;
  return expandToState(seed ^ 0x1);
}

function expandToState(seed: number): Xoshiro128State {
  let s = seed >>> 0;
  const words: number[] = [];
  for (let i = 0; i < 4; i++) {
    const r = splitmix32Next(s);
    words.push(r.value);
    s = r.nextState;
  }
  return { s0: words[0]!, s1: words[1]!, s2: words[2]!, s3: words[3]! };
}
