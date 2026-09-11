/**
 * Per-frame lineage aggregation — derived from the newest observer frame only.
 *
 * A lineage is the set of living organisms sharing a `lineageRootId`. Nothing
 * here is stored, sent or interpreted: counts and generation depths are the
 * frame's own numbers. Lineages are lineages — not species, not "winners".
 */
import type { ObserverFrame, ObserverOrganism } from '../protocol/observerV1.js';

export interface LineageSummary {
  lineageRootId: number;
  /** Living organisms with this lineageRootId in the frame. */
  count: number;
  /** count / frame population, in [0, 1]. */
  fraction: number;
  /** Largest generationDepth among the lineage's living organisms. */
  maxGeneration: number;
  /** Mean generationDepth among the lineage's living organisms. */
  meanGeneration: number;
}

export interface LineageAggregate {
  /** Sorted by count descending, then lineageRootId ascending — deterministic for equal counts. */
  lineages: LineageSummary[];
  /** lineageRootId → living count, for O(1) lookups. */
  counts: ReadonlyMap<number, number>;
  population: number;
  maxGeneration: number;
  meanGeneration: number;
}

interface Accumulator { count: number; maxGeneration: number; generationSum: number }

export function summarizeLineages(organisms: readonly ObserverOrganism[]): LineageAggregate {
  const acc = new Map<number, Accumulator>();
  let maxGeneration = 0;
  let generationSum = 0;
  for (const o of organisms) {
    const a = acc.get(o.lineageRootId);
    if (a === undefined) {
      acc.set(o.lineageRootId, { count: 1, maxGeneration: o.generationDepth, generationSum: o.generationDepth });
    } else {
      a.count++;
      a.generationSum += o.generationDepth;
      if (o.generationDepth > a.maxGeneration) a.maxGeneration = o.generationDepth;
    }
    if (o.generationDepth > maxGeneration) maxGeneration = o.generationDepth;
    generationSum += o.generationDepth;
  }
  const population = organisms.length;
  const lineages: LineageSummary[] = [];
  const counts = new Map<number, number>();
  for (const [lineageRootId, a] of acc) {
    counts.set(lineageRootId, a.count);
    lineages.push({
      lineageRootId,
      count: a.count,
      fraction: population > 0 ? a.count / population : 0,
      maxGeneration: a.maxGeneration,
      meanGeneration: a.generationSum / a.count,
    });
  }
  lineages.sort((x, y) => (y.count - x.count) || (x.lineageRootId - y.lineageRootId));
  return { lineages, counts, population, maxGeneration, meanGeneration: population > 0 ? generationSum / population : 0 };
}

export function summarizeFrameLineages(frame: ObserverFrame): LineageAggregate {
  return summarizeLineages(frame.organisms);
}

/** Toggle semantics for lineage focus: clicking the focused lineage clears it. Display state only. */
export function toggleLineageFocus(current: number | null, lineageRootId: number): number | null {
  return current === lineageRootId ? null : lineageRootId;
}
