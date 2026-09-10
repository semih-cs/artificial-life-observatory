/**
 * Minimal Phase 0A telemetry (§15.10).
 *
 * Read-only observation. It is computed from final post-tick state, never
 * mutates canonical state, never consumes canonical RNG, and is excluded from
 * the canonical state hash (§6.24, §20.72 phase 19).
 */
export interface TickTelemetry {
  tick: number;
  populationCount: number;
  totalFood: number;
  births: number;
  deaths: number;
  meanEnergy: number;
  /** optional debugging telemetry (§15.10) */
  meanAge: number;
}

export function computeTickTelemetry(
  tick: number,
  populationCount: number,
  totalFood: number,
  births: number,
  deaths: number,
  meanEnergy: number,
  meanAge: number
): TickTelemetry {
  return { tick, populationCount, totalFood, births, deaths, meanEnergy, meanAge };
}
