import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MorphologyCache } from '../src/world/morphologyCache.js';
import { ancestryChain, DEFAULT_MAX_ANCESTRY_DEPTH } from '../src/world/ancestry.js';
import { compareMorphology } from '../src/world/inheritance.js';
import { morphologyOf } from '../src/world/morphologyCache.js';
import { SessionHistory } from '../src/world/sessionHistory.js';
import { Ancestry } from '../src/ui/Ancestry.js';
import { frame, organism } from './fixtures.js';

// founder 1 → 2 → 3 → 4 (selected); each hop changes a known number of genes
const founder = organism({ id: 1, parentId: null, lineageRootId: 1, generationDepth: 0, size: 1.0, maxSpeed: 1.2, visionRange: 150, visionAngle: 1.8, metabolism: 1.0 });
const g1 = organism({ id: 2, parentId: 1, lineageRootId: 1, generationDepth: 1, size: 1.05, maxSpeed: 1.2, visionRange: 150, visionAngle: 1.8, metabolism: 1.0 }); // Δ1
const g2 = organism({ id: 3, parentId: 2, lineageRootId: 1, generationDepth: 2, size: 1.05, maxSpeed: 1.2, visionRange: 150, visionAngle: 1.8, metabolism: 1.0 }); // Δ0
const g3 = organism({ id: 4, parentId: 3, lineageRootId: 1, generationDepth: 3, size: 1.1, maxSpeed: 1.3, visionRange: 140, visionAngle: 1.8, metabolism: 1.0 }); // Δ3

function cached(...orgs: ReturnType<typeof organism>[]): MorphologyCache {
  const c = new MorphologyCache();
  orgs.forEach((o, i) => c.observe([o], 100 + i));
  return c;
}

describe('ancestry chain', () => {
  it('walks a fully cached chain to the founder with per-hop morphology-change counts', () => {
    const chain = ancestryChain(g3, cached(founder, g1, g2, g3), (id) => id === 3);
    expect(chain.boundary).toEqual({ kind: 'founder' });
    expect(chain.observedHops).toBe(3);
    expect(chain.nodes.map((n) => [n.id, n.generationDepth, n.state, n.changesFromParent])).toEqual([
      [1, 0, 'observed', null],
      [2, 1, 'observed', 1],
      [3, 2, 'alive', 0],
      [4, 3, 'selected', 3],
    ]);
    // hop counts reuse the slice 3 comparison
    expect(chain.nodes[3]!.changesFromParent).toBe(compareMorphology(morphologyOf(g2), morphologyOf(g3)).changedCount);
    expect(chain.nodes[0]!.parentId).toBeNull();
    expect(chain.nodes[1]!.lastSeenTick).toBe(101);
  });

  it('stops at the first ancestor the cache does not hold and never invents it', () => {
    const chain = ancestryChain(g3, cached(g2, g3), () => false); // g1 and the founder were never observed
    expect(chain.boundary).toEqual({ kind: 'unobserved', parentId: 2 });
    expect(chain.nodes.map((n) => n.id)).toEqual([3, 4]);
    expect(chain.nodes[0]!.changesFromParent).toBeNull(); // parent of #3 unknown → no Δ
    expect(chain.nodes[1]!.changesFromParent).toBe(3);
  });

  it('a founder is a one-node chain, complete', () => {
    const chain = ancestryChain(founder, new MorphologyCache(), () => true);
    expect(chain.nodes).toHaveLength(1);
    expect(chain.boundary).toEqual({ kind: 'founder' });
    expect(chain.observedHops).toBe(0);
    expect(chain.nodes[0]).toMatchObject({ id: 1, state: 'selected', parentId: null, changesFromParent: null });
  });

  it('truncates a long chain to the closest ancestors', () => {
    const cache = new MorphologyCache();
    const orgs = [organism({ id: 1, parentId: null, generationDepth: 0 })];
    for (let i = 2; i <= 30; i++) orgs.push(organism({ id: i, parentId: i - 1, generationDepth: i - 1 }));
    cache.observe(orgs, 1);
    const chain = ancestryChain(orgs[29]!, cache, () => false);
    expect(chain.nodes).toHaveLength(DEFAULT_MAX_ANCESTRY_DEPTH + 1);
    expect(chain.boundary).toEqual({ kind: 'truncated', parentId: 30 - DEFAULT_MAX_ANCESTRY_DEPTH - 1 });
    expect(chain.nodes[chain.nodes.length - 1]!.id).toBe(30);
    expect(chain.nodes[0]!.id).toBe(30 - DEFAULT_MAX_ANCESTRY_DEPTH);
    const short = ancestryChain(orgs[29]!, cache, () => false, 3);
    expect(short.nodes.map((n) => n.id)).toEqual([27, 28, 29, 30]);
  });

  it('an evicted ancestor ends the chain honestly', () => {
    const cache = new MorphologyCache(3);
    cache.observe([founder], 1);
    cache.observe([g1, g2, g3], 2); // bound 3 → the founder is evicted
    expect(cache.has(1)).toBe(false);
    const chain = ancestryChain(g3, cache, () => false);
    expect(chain.boundary).toEqual({ kind: 'unobserved', parentId: 1 });
    expect(chain.nodes.map((n) => n.id)).toEqual([2, 3, 4]);
  });

  it('survives a same-world reconnect and clears on a world identity change (through the session history)', () => {
    const h = new SessionHistory();
    h.push(frame({ tick: 1, organisms: [founder, g1] }));
    h.push(frame({ tick: 2, organisms: [g1, g2] }));
    h.push(frame({ tick: 90, organisms: [g2, g3] })); // gap = reconnect, same world
    let chain = ancestryChain(g3, h.morphology(), (id) => id === 3);
    expect(chain.boundary.kind).toBe('founder');
    expect(chain.nodes.map((n) => [n.id, n.state])).toEqual([[1, 'observed'], [2, 'observed'], [3, 'alive'], [4, 'selected']]);
    h.push(frame({ rootSeed: 77, tick: 91, organisms: [g3] }));
    chain = ancestryChain(g3, h.morphology(), () => false);
    expect(chain.boundary).toEqual({ kind: 'unobserved', parentId: 3 });
    expect(chain.nodes.map((n) => n.id)).toEqual([4]);
  });
});

describe('ancestry strip', () => {
  const render = (chain: ReturnType<typeof ancestryChain>) => renderToStaticMarkup(<Ancestry chain={chain} onSelectOrganism={() => {}} />);

  it('renders the founder, hops with Δ badges, an alive ancestor as a button, a dead one as observed, and the selected node', () => {
    const html = render(ancestryChain(g3, cached(founder, g1, g2, g3), (id) => id === 3));
    expect(html).toContain('Founder #1');
    expect(html).toContain('complete to founder');
    expect(html).toContain('observed ancestry: 3 hops');
    expect((html.match(/data-testid="ancestry-delta"/g) ?? []).length).toBe(3);
    expect(html).toContain('>Δ1<');
    expect(html).toContain('>Δ0<');
    expect(html).toContain('>Δ3<');
    expect(html).toContain('chain-link');
    expect(html).toContain('data-testid="ancestry-node-3" data-state="alive"');
    expect(html).toContain('data-testid="ancestry-node-2" data-state="observed"');
    expect(html).toContain('observed · last seen t 101');
    expect(html).toContain('data-testid="ancestry-node-4" data-state="selected"');
    expect(html).not.toContain('ancestry-boundary');
    expect(html).not.toMatch(/\b(fit|fitter|strong|weak|successful|superior|adapted)\b/i);
  });

  it('shows the honest boundary for an unobserved ancestor and for truncation', () => {
    const missing = render(ancestryChain(g3, cached(g2, g3), () => false));
    expect(missing).toContain('data-testid="ancestry-boundary-unobserved"');
    expect(missing).toContain('Earlier ancestor <span class="mono">#2</span> not observed this session');
    expect(missing).toContain('data-testid="ancestry-delta-unavailable"');
    expect(missing).not.toContain('Founder');
    const cache = new MorphologyCache();
    const orgs = [organism({ id: 1, parentId: null, generationDepth: 0 })];
    for (let i = 2; i <= 20; i++) orgs.push(organism({ id: i, parentId: i - 1, generationDepth: i - 1 }));
    cache.observe(orgs, 1);
    const truncated = render(ancestryChain(orgs[19]!, cache, () => false, 4));
    expect(truncated).toContain('data-testid="ancestry-boundary-truncated"');
    expect(truncated).toContain('4 closest hops kept');
  });
});
