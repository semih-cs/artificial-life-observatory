/**
 * Parent → child morphology comparison — pure, frontend only.
 *
 * What can be said, and why: an organism's genome is fixed for life
 * (Spec §13.4) and a child's genome is an exact clone of its parent's
 * followed by the reproduction-time mutation channels (§13, `mutation.ts`).
 * So any difference between a parent's and a child's morphology genes is a
 * morphology mutation at that birth. The values in protocol v1 are rounded
 * to 0.001 for display, and rounding is a pure function of the stored value,
 * so equal stored genes always show equal — an observed difference is real.
 * The converse is weaker: a mutation smaller than the rounding step can show
 * as "no difference". The UI therefore says "at protocol precision".
 *
 * Comparison rule: two protocol values differ iff they are not identical.
 * No epsilon is applied to the comparison; the values are already quantised
 * to 0.001. Deltas are shown with 3 decimals (the protocol precision) and
 * are never rounded away.
 *
 * Nothing here says whether a change is good, bad, adaptive or fit.
 */
import type { ObserverOrganism } from '../protocol/observerV1.js';
import { MORPHOLOGY_GENE_KEYS, morphologyOf, type Morphology, type MorphologyCache, type MorphologyGeneKey, type MorphologyRecord } from './morphologyCache.js';

export interface GeneSpec {
  key: MorphologyGeneKey;
  label: string;
  /** Decimals shown (protocol precision is 3). */
  decimals: number;
  unit?: string;
}

export const MORPHOLOGY_GENES: readonly GeneSpec[] = [
  { key: 'size', label: 'Size', decimals: 3 },
  { key: 'maxSpeed', label: 'Max speed', decimals: 3 },
  { key: 'visionRange', label: 'Vision range', decimals: 3 },
  { key: 'visionAngle', label: 'Vision angle', decimals: 3, unit: 'rad' },
  { key: 'metabolism', label: 'Metabolism', decimals: 3 },
];

export interface GeneDelta {
  key: MorphologyGeneKey;
  label: string;
  parent: number;
  child: number;
  /** child − parent, exactly. */
  delta: number;
  /** child − parent as a fraction of the parent value (0 when the parent value is 0). */
  relative: number;
  changed: boolean;
}

export interface MorphologyComparison {
  deltas: GeneDelta[];
  changedCount: number;
  total: number;
}

export function compareMorphology(parent: Morphology, child: Morphology): MorphologyComparison {
  const deltas: GeneDelta[] = [];
  let changedCount = 0;
  for (const g of MORPHOLOGY_GENES) {
    const p = parent[g.key];
    const c = child[g.key];
    const changed = p !== c;
    if (changed) changedCount++;
    deltas.push({ key: g.key, label: g.label, parent: p, child: c, delta: changed ? c - p : 0, relative: p !== 0 && changed ? (c - p) / p : 0, changed });
  }
  return { deltas, changedCount, total: MORPHOLOGY_GENES.length };
}

/** Number of morphology genes that differ from the parent, or null when the parent was not observed this session. */
export function morphologyChangesFromCache(child: ObserverOrganism, cache: Pick<MorphologyCache, 'get'>): number | null {
  if (child.parentId === null) return null;
  const parent = cache.get(child.parentId);
  if (parent === undefined) return null;
  return compareMorphology(parent.morphology, morphologyOf(child)).changedCount;
}

export type ParentStatus =
  | { kind: 'founder' }
  | { kind: 'unavailable'; parentId: number }
  | { kind: 'alive'; parentId: number; record: MorphologyRecord }
  | { kind: 'observed'; parentId: number; record: MorphologyRecord; lastSeenTick: number };

export interface InheritanceView {
  organism: Morphology;
  parent: ParentStatus;
  /** Present only when the parent's morphology is known. */
  comparison: MorphologyComparison | null;
}

/**
 * Build the inspector's inheritance view for one organism. `parentAlive`
 * says whether the parent is in the newest frame; the cache supplies the
 * morphology either way (living organisms are always in it).
 */
export function inheritanceView(
  organism: ObserverOrganism,
  cache: Pick<MorphologyCache, 'get'>,
  parentAlive: (id: number) => boolean,
): InheritanceView {
  const own = morphologyOf(organism);
  if (organism.parentId === null) return { organism: own, parent: { kind: 'founder' }, comparison: null };
  const record = cache.get(organism.parentId);
  if (record === undefined) return { organism: own, parent: { kind: 'unavailable', parentId: organism.parentId }, comparison: null };
  const comparison = compareMorphology(record.morphology, own);
  const parent: ParentStatus = parentAlive(organism.parentId)
    ? { kind: 'alive', parentId: organism.parentId, record }
    : { kind: 'observed', parentId: organism.parentId, record, lastSeenTick: record.lastSeenTick };
  return { organism: own, parent, comparison };
}

/** Factual summary line for the inheritance section. */
export function inheritanceSummary(view: InheritanceView): string {
  switch (view.parent.kind) {
    case 'founder': return 'Founder — no parent comparison';
    case 'unavailable': return 'Parent comparison unavailable';
    default: {
      const c = view.comparison!;
      return c.changedCount === 0
        ? `No morphology difference from parent at protocol precision`
        : `${c.changedCount} / ${c.total} morphology genes differ from parent`;
    }
  }
}

export function formatGene(value: number, spec: GeneSpec): string {
  return value.toFixed(spec.decimals);
}

/** Signed delta with the gene's precision; exact zero renders as "0". */
export function formatDelta(delta: number, spec: GeneSpec): string {
  if (delta === 0) return '0';
  const s = Math.abs(delta).toFixed(spec.decimals);
  return `${delta > 0 ? '+' : '−'}${s}`;
}

export { MORPHOLOGY_GENE_KEYS };
