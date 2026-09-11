/**
 * Compact ancestry — selected organism → parent → … → founder, walked
 * backwards through the session morphology cache. Pure and bounded.
 *
 * Only relationships actually observed in this browser session are shown:
 * the walk stops honestly at the first parent the cache does not hold
 * (`unobserved`), at a founder (`founder`), or at `maxDepth` ancestors
 * (`truncated`, closest ancestors kept). Nothing is guessed, and nothing
 * here is a genealogy store: it is a view over the existing bounded cache.
 */
import type { ObserverOrganism } from '../protocol/observerV1.js';
import type { Morphology, MorphologyCache } from './morphologyCache.js';
import { morphologyOf } from './morphologyCache.js';
import { compareMorphology } from './inheritance.js';

export const DEFAULT_MAX_ANCESTRY_DEPTH = 10;

export type AncestryNodeState = 'selected' | 'alive' | 'observed';

export interface AncestryNode {
  id: number;
  parentId: number | null;
  generationDepth: number;
  lineageRootId: number;
  state: AncestryNodeState;
  /** Tick of the last frame in which the organism was observed (for `observed` nodes). */
  lastSeenTick: number | null;
  /** Morphology genes that differ from this organism's parent, or null when the parent is a founder boundary / not observed. */
  changesFromParent: number | null;
}

/** Why the chain ends above its oldest shown node. */
export type AncestryBoundary =
  | { kind: 'founder' }
  | { kind: 'unobserved'; parentId: number }
  | { kind: 'truncated'; parentId: number };

export interface AncestryChain {
  /** Oldest shown ancestor first, the selected organism last. Always ≥ 1 node. */
  nodes: AncestryNode[];
  boundary: AncestryBoundary;
  /** Ancestors shown above the selected organism (nodes.length − 1). */
  observedHops: number;
}

interface Link { id: number; parentId: number | null; generationDepth: number; lineageRootId: number; morphology: Morphology; lastSeenTick: number | null }

export function ancestryChain(
  organism: ObserverOrganism,
  cache: Pick<MorphologyCache, 'get'>,
  parentAlive: (id: number) => boolean,
  maxDepth = DEFAULT_MAX_ANCESTRY_DEPTH,
): AncestryChain {
  const links: Link[] = [{ id: organism.id, parentId: organism.parentId, generationDepth: organism.generationDepth, lineageRootId: organism.lineageRootId, morphology: morphologyOf(organism), lastSeenTick: null }];
  let boundary: AncestryBoundary = { kind: 'founder' };
  let current = links[0]!;
  for (;;) {
    if (current.parentId === null) { boundary = { kind: 'founder' }; break; }
    if (links.length - 1 >= maxDepth) { boundary = { kind: 'truncated', parentId: current.parentId }; break; }
    const rec = cache.get(current.parentId);
    if (rec === undefined) { boundary = { kind: 'unobserved', parentId: current.parentId }; break; }
    const link: Link = { id: rec.id, parentId: rec.parentId, generationDepth: rec.generationDepth, lineageRootId: rec.lineageRootId, morphology: rec.morphology, lastSeenTick: rec.lastSeenTick };
    links.push(link);
    current = link;
  }
  // links[0] is the selected organism; links[i + 1] is the parent of links[i].
  const nodes: AncestryNode[] = links.map((l, i) => {
    const parent = links[i + 1];
    const state: AncestryNodeState = i === 0 ? 'selected' : parentAlive(l.id) ? 'alive' : 'observed';
    return {
      id: l.id, parentId: l.parentId, generationDepth: l.generationDepth, lineageRootId: l.lineageRootId, state,
      lastSeenTick: state === 'observed' ? l.lastSeenTick : null,
      changesFromParent: parent !== undefined ? compareMorphology(parent.morphology, l.morphology).changedCount : null,
    };
  }).reverse();
  return { nodes, boundary, observedHops: nodes.length - 1 };
}
