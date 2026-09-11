/**
 * Per-organism life-history recorder and analysis for
 * `diagnostic-reproducer-lifecycle-v1` (docs/Phase 0B Pilot Report.md §22,
 * precommitted in ff7e2b1).
 *
 * The recorder is a read-only `onTick(before, after, telemetry)` observer. It
 * reads the pre- and post-step world states, which stepWorld never modifies,
 * and keeps its own records. It draws no RNG, writes to no organism, genome or
 * world, and cannot influence ordering or any decision. simulation-core is not
 * changed.
 *
 * Tick convention (§22.4): every event is stamped with the tick of the
 * post-step world in which its result first appears. Birth and reproduction =
 * the offspring's birthTick; death = the first post-step tick in which the
 * organism is absent (the core's internal deathTick is one lower).
 */

import type { WorldState, TickTelemetry } from '@alo/simulation-core';
import type { TickObserver } from '../runner/replicate.js';
import { bestSingleCut, BestCut } from './earlyEstablishment.js';

export type DerivedDeathCause = 'ENERGY_DEPLETION' | 'AT_MAX_AGE';

export interface OrganismLifecycle {
  id: number;
  parentId: number | null;
  generationDepth: number;
  birthTick: number;
  reproductionTicks: number[];
  /** Parent energy after the step of its first reproduction (post-cost); null if it died that step. */
  energyAfterFirstReproduction: number | null;
  deathTick: number | null;
  ageAtDeath: number | null;
  deathCause: DerivedDeathCause | null;
}

export interface LifecycleRecorder {
  readonly observer: TickObserver;
  readonly organisms: Map<number, OrganismLifecycle>;
}

export function createLifecycleRecorder(maxAge: number, extra?: TickObserver): LifecycleRecorder {
  const organisms = new Map<number, OrganismLifecycle>();
  let initialised = false;

  const register = (o: WorldState['organisms'][number]): OrganismLifecycle => {
    const rec: OrganismLifecycle = {
      id: o.id, parentId: o.parentId, generationDepth: o.generationDepth, birthTick: o.birthTick,
      reproductionTicks: [], energyAfterFirstReproduction: null, deathTick: null, ageAtDeath: null, deathCause: null,
    };
    organisms.set(o.id, rec);
    return rec;
  };

  const observer: TickObserver = (before: WorldState, after: WorldState, telemetry: TickTelemetry) => {
    if (!initialised) {
      for (const o of before.organisms) if (o.alive && !organisms.has(o.id)) register(o);
      initialised = true;
    }
    const beforeById = new Map(before.organisms.filter(o => o.alive).map(o => [o.id, o] as const));
    const afterById = new Map(after.organisms.filter(o => o.alive).map(o => [o.id, o] as const));

    let births = 0;
    for (const o of after.organisms) {
      if (!o.alive || beforeById.has(o.id) || organisms.has(o.id)) continue;
      if (o.birthTick !== after.tick) throw new Error(`organism ${o.id}: birthTick ${o.birthTick} != tick ${after.tick}`);
      register(o);
      births++;
      if (o.parentId !== null) {
        const parent = organisms.get(o.parentId);
        if (!parent) throw new Error(`organism ${o.id}: unknown parent ${o.parentId}`);
        if (parent.reproductionTicks.includes(after.tick)) throw new Error(`parent ${parent.id} reproduced twice at tick ${after.tick}`);
        if (parent.reproductionTicks.length === 0) parent.energyAfterFirstReproduction = afterById.get(parent.id)?.energy ?? null;
        parent.reproductionTicks.push(after.tick);
      }
    }

    let deaths = 0;
    for (const [id, o] of beforeById) {
      if (afterById.has(id)) continue;
      const rec = organisms.get(id);
      if (!rec) throw new Error(`organism ${id} died without a record`);
      rec.deathTick = after.tick;
      rec.ageAtDeath = o.age + 1;
      rec.deathCause = rec.ageAtDeath >= maxAge ? 'AT_MAX_AGE' : 'ENERGY_DEPLETION';
      deaths++;
    }

    // Balance with the core's own telemetry: a disagreement means the recorder is wrong.
    if (births !== telemetry.births) throw new Error(`tick ${after.tick}: recorded ${births} births, telemetry ${telemetry.births}`);
    if (deaths !== telemetry.deaths) throw new Error(`tick ${after.tick}: recorded ${deaths} deaths, telemetry ${telemetry.deaths}`);

    extra?.(before, after, telemetry);
  };

  return { observer, organisms };
}

// ---- analysis (§22.6–§22.8) ---------------------------------------------------

export const LIFECYCLE_BIRTH_WINDOW = { from: 3001, to: 9000 } as const;

export interface ReproducerMeasures {
  id: number;
  ageAtFirstReproduction: number;
  reproductionEvents: number;
  /** Median of this organism's own inter-reproduction intervals; null with < 2 events. */
  medianInterval: number | null;
  intervals: number[];
  postFirstReproductionSurvival: number;
  diedBeforeSecondReproduction: boolean;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  return v.length % 2 ? v[(v.length - 1) / 2]! : (v[v.length / 2 - 1]! + v[v.length / 2]!) / 2;
}

export function reproducerMeasures(r: OrganismLifecycle): ReproducerMeasures {
  if (r.reproductionTicks.length === 0 || r.deathTick === null) throw new Error(`organism ${r.id} is not an observed reproducer`);
  const ticks = r.reproductionTicks;
  const intervals = ticks.slice(1).map((t, i) => t - ticks[i]!);
  return {
    id: r.id,
    ageAtFirstReproduction: ticks[0]! - r.birthTick,
    reproductionEvents: ticks.length,
    medianInterval: median(intervals),
    intervals,
    postFirstReproductionSurvival: r.deathTick - ticks[0]!,
    diedBeforeSecondReproduction: ticks.length === 1,
  };
}

export interface WorldLifecycleSummary {
  included: number;
  censored: number;
  eligibleReproducers: number;
  reproducersWithTwoOrMore: number;
  medianAgeAtFirstReproduction: number | null;
  medianInterval: number | null;
  medianPostFirstReproductionSurvival: number | null;
  medianLifetimeEvents: number | null;
  fractionDyingBeforeSecond: number | null;
  deathCauses: Record<DerivedDeathCause, number>;
}

/** §22.6 inclusion and censoring, then §22.7 per-world summaries. */
export function summarizeWorld(
  organisms: Iterable<OrganismLifecycle>, window: { from: number; to: number } = LIFECYCLE_BIRTH_WINDOW
): { summary: WorldLifecycleSummary; reproducers: ReproducerMeasures[] } {
  const inWindow = [...organisms].filter(o => o.generationDepth >= 1 && o.birthTick >= window.from && o.birthTick <= window.to);
  const included = inWindow.filter(o => o.deathTick !== null);
  const reproducers = included.filter(o => o.reproductionTicks.length > 0).map(reproducerMeasures);
  const withInterval = reproducers.filter(r => r.medianInterval !== null);
  const deathCauses: Record<DerivedDeathCause, number> = { ENERGY_DEPLETION: 0, AT_MAX_AGE: 0 };
  for (const o of included) if (o.deathCause) deathCauses[o.deathCause]++;
  return {
    reproducers,
    summary: {
      included: included.length,
      censored: inWindow.length - included.length,
      eligibleReproducers: reproducers.length,
      reproducersWithTwoOrMore: withInterval.length,
      medianAgeAtFirstReproduction: median(reproducers.map(r => r.ageAtFirstReproduction)),
      medianInterval: median(withInterval.map(r => r.medianInterval!)),
      medianPostFirstReproductionSurvival: median(reproducers.map(r => r.postFirstReproductionSurvival)),
      medianLifetimeEvents: median(reproducers.map(r => r.reproductionEvents)),
      fractionDyingBeforeSecond: reproducers.length ? reproducers.filter(r => r.diedBeforeSecondReproduction).length / reproducers.length : null,
      deathCauses,
    },
  };
}

export type LifecycleMechanism = 'LONGER_GAPS' | 'EARLIER_DEATH' | 'MIXED' | 'NEITHER_INCONCLUSIVE';
export type LifecycleStrength = 'CLEAR' | 'STRONG_PARTIAL' | 'WEAK_NONE';

export const strengthOf = (c: BestCut): LifecycleStrength =>
  c.misclassified === 0 ? 'CLEAR' : c.misclassified === 1 ? 'STRONG_PARTIAL' : 'WEAK_NONE';

/**
 * §22.8. IV expected L shorter: supports iff CLEAR with E predicted when high
 * ('E_high'). SV expected L longer: supports iff CLEAR with 'E_low'.
 */
export function lifecycleDecision(
  extinct: readonly WorldLifecycleSummary[], late: readonly WorldLifecycleSummary[]
): { mechanism: LifecycleMechanism; iv: BestCut | null; sv: BestCut | null; reason: string } {
  const all = [...extinct, ...late];
  if (all.some(w => w.eligibleReproducers === 0 || w.medianInterval === null)) {
    return { mechanism: 'NEITHER_INCONCLUSIVE', iv: null, sv: null, reason: 'a world has no eligible reproducer or no reproducer with >= 2 events' };
  }
  const iv = bestSingleCut(extinct.map(w => w.medianInterval), late.map(w => w.medianInterval));
  const sv = bestSingleCut(extinct.map(w => w.medianPostFirstReproductionSurvival), late.map(w => w.medianPostFirstReproductionSurvival));
  const ivSupports = iv.misclassified === 0 && iv.direction === 'E_high';
  const svSupports = sv.misclassified === 0 && sv.direction === 'E_low';
  const mechanism: LifecycleMechanism = ivSupports && svSupports ? 'MIXED'
    : ivSupports ? 'LONGER_GAPS' : svSupports ? 'EARLIER_DEATH' : 'NEITHER_INCONCLUSIVE';
  return { mechanism, iv, sv, reason: 'rule applied' };
}
