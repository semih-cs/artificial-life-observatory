/**
 * splitmix32 — deterministic state-expansion generator.
 *
 * Used ONLY to expand a single 32-bit seed integer into the well-distributed
 * multi-word state required by xoshiro128** (§18.70). It is never used as a
 * running draw generator for canonical/bootstrap randomness itself.
 */
export function splitmix32Next(state: number): { value: number; nextState: number } {
  let z = (state + 0x9e3779b9) >>> 0;
  let s = z;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  z = (z ^ (z >>> 15)) >>> 0;
  return { value: z, nextState: s };
}

/**
 * Expand a single uint32 seed into `count` uint32 words via repeated
 * splitmix32 stepping — the standard xoshiro seeding idiom.
 */
export function splitmix32Expand(seed: number, count: number): number[] {
  const words: number[] = [];
  let state = seed >>> 0;
  for (let i = 0; i < count; i++) {
    const { value, nextState } = splitmix32Next(state);
    words.push(value);
    state = nextState;
  }
  return words;
}
