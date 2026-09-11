import { bootstrapWorld, cloneConfig, DEFAULT_SIMULATION_CONFIG, stepWorld, canonicalStateHash } from '@alo/simulation-core';
import type { SimulationConfig, WorldState } from '@alo/simulation-core';

export function defaultConfig(seed: number): SimulationConfig {
  const c = cloneConfig(DEFAULT_SIMULATION_CONFIG);
  c.rootSeed = seed;
  return c;
}

/** Step `world` until it reaches `toTick`, calling `each` after every step. */
export function runTo(world: WorldState, config: SimulationConfig, toTick: number, each?: (w: WorldState) => void): WorldState {
  let w = world;
  while (w.tick < toTick) {
    w = stepWorld(w, config).world;
    each?.(w);
  }
  return w;
}

export function worldAt(seed: number, tick: number, config = defaultConfig(seed)): WorldState {
  return runTo(bootstrapWorld(config), config, tick);
}

export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

export { canonicalStateHash };
