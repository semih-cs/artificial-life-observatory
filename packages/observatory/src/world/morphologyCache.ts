/**
 * Bounded session-only cache of organism morphology — frontend only.
 *
 * Protocol v1 frames carry each living organism's five morphology genes.
 * Morphology is immutable for an organism's lifetime (Spec §13.4), so one
 * record per id is enough; the record is refreshed only for `lastSeenTick`.
 * The cache exists so a child can still be compared with a parent that has
 * died since it was last observed. It is never persisted, never sent, and
 * is cleared with the rest of the session history when the world identity
 * changes.
 *
 * Bound: at most `maxEntries` records. Eviction is least-recently-seen:
 * living organisms are re-touched every frame, so the records that leave
 * first are the organisms that died longest ago.
 */
import type { ObserverOrganism } from '../protocol/observerV1.js';

export const MORPHOLOGY_GENE_KEYS = ['size', 'maxSpeed', 'visionRange', 'visionAngle', 'metabolism'] as const;
export type MorphologyGeneKey = (typeof MORPHOLOGY_GENE_KEYS)[number];
export type Morphology = Readonly<Record<MorphologyGeneKey, number>>;

export interface MorphologyRecord {
  id: number;
  parentId: number | null;
  lineageRootId: number;
  generationDepth: number;
  morphology: Morphology;
  /** Tick of the newest frame in which the organism was observed. */
  lastSeenTick: number;
}

export const DEFAULT_MAX_MORPHOLOGY_ENTRIES = 4000;

export function morphologyOf(o: Pick<ObserverOrganism, MorphologyGeneKey>): Morphology {
  return { size: o.size, maxSpeed: o.maxSpeed, visionRange: o.visionRange, visionAngle: o.visionAngle, metabolism: o.metabolism };
}

export class MorphologyCache {
  private readonly entries = new Map<number, MorphologyRecord>();

  constructor(private readonly maxEntries = DEFAULT_MAX_MORPHOLOGY_ENTRIES) {}

  /** Record every organism of a frame (O(N)); a known id is only re-touched. */
  observe(organisms: readonly ObserverOrganism[], tick: number): void {
    for (const o of organisms) {
      const existing = this.entries.get(o.id);
      if (existing !== undefined) {
        existing.lastSeenTick = tick;
        // Re-insert so Map order stays least-recently-seen first.
        this.entries.delete(o.id);
        this.entries.set(o.id, existing);
      } else {
        this.entries.set(o.id, {
          id: o.id, parentId: o.parentId, lineageRootId: o.lineageRootId, generationDepth: o.generationDepth,
          morphology: morphologyOf(o), lastSeenTick: tick,
        });
      }
    }
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  get(id: number): MorphologyRecord | undefined { return this.entries.get(id); }
  has(id: number): boolean { return this.entries.has(id); }
  size(): number { return this.entries.size; }
  clear(): void { this.entries.clear(); }
}
