import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MorphologyCache, morphologyOf } from '../src/world/morphologyCache.js';
import { compareMorphology, formatDelta, inheritanceSummary, inheritanceView, morphologyChangesFromCache, MORPHOLOGY_GENES } from '../src/world/inheritance.js';
import { SessionHistory, type BirthEvent } from '../src/world/sessionHistory.js';
import { resolveSelection } from '../src/world/selection.js';
import { Inspector } from '../src/ui/Inspector.js';
import { EventFeed } from '../src/ui/EventFeed.js';
import { EvolutionPanel } from '../src/ui/EvolutionPanel.js';
import { frame, organism } from './fixtures.js';

const parentGenes = { size: 1.0, maxSpeed: 1.25, visionRange: 150.0, visionAngle: 1.8, metabolism: 1.0 };
const parent = organism({ id: 10, parentId: null, lineageRootId: 10, generationDepth: 0, ...parentGenes });
const childChanged = organism({ id: 20, parentId: 10, lineageRootId: 10, generationDepth: 1, size: 1.032, maxSpeed: 1.25, visionRange: 141.5, visionAngle: 1.8, metabolism: 1.001 });
const childSame = organism({ id: 21, parentId: 10, lineageRootId: 10, generationDepth: 1, ...parentGenes });

describe('parent → child morphology comparison', () => {
  it('produces the five deltas exactly, positive and negative, with changed flags', () => {
    const c = compareMorphology(morphologyOf(parent), morphologyOf(childChanged));
    expect(c.total).toBe(5);
    expect(c.changedCount).toBe(3);
    expect(c.deltas.map((d) => d.key)).toEqual(['size', 'maxSpeed', 'visionRange', 'visionAngle', 'metabolism']);
    const byKey = Object.fromEntries(c.deltas.map((d) => [d.key, d]));
    expect(byKey['size']!.changed).toBe(true);
    expect(byKey['size']!.delta).toBeCloseTo(0.032, 12);
    expect(byKey['size']!.relative).toBeCloseTo(0.032, 12);
    expect(byKey['visionRange']!.delta).toBeCloseTo(-8.5, 12);
    expect(byKey['visionRange']!.changed).toBe(true);
    expect(byKey['metabolism']!.delta).toBeCloseTo(0.001, 12); // a 0.001 step is a real protocol-visible change, never rounded away
    expect(byKey['maxSpeed']).toMatchObject({ changed: false, delta: 0, relative: 0 });
    expect(byKey['visionAngle']).toMatchObject({ changed: false, delta: 0 });
    const size = MORPHOLOGY_GENES[0]!;
    expect(formatDelta(byKey['size']!.delta, size)).toBe('+0.032');
    expect(formatDelta(byKey['visionRange']!.delta, MORPHOLOGY_GENES[2]!)).toBe('−8.500');
    expect(formatDelta(0, size)).toBe('0');
  });

  it('represents an unchanged child as zero differences', () => {
    const c = compareMorphology(morphologyOf(parent), morphologyOf(childSame));
    expect(c.changedCount).toBe(0);
    expect(c.deltas.every((d) => !d.changed && d.delta === 0)).toBe(true);
  });

  it('founder: no parent comparison', () => {
    const view = inheritanceView(parent, new MorphologyCache(), () => true);
    expect(view.parent.kind).toBe('founder');
    expect(view.comparison).toBeNull();
    expect(inheritanceSummary(view)).toBe('Founder — no parent comparison');
  });

  it('missing parent: unavailable, never guessed', () => {
    const cache = new MorphologyCache();
    cache.observe([childChanged], 5); // the child itself is cached, its parent never was
    const view = inheritanceView(childChanged, cache, () => false);
    expect(view.parent).toEqual({ kind: 'unavailable', parentId: 10 });
    expect(view.comparison).toBeNull();
    expect(inheritanceSummary(view)).toBe('Parent comparison unavailable');
    expect(morphologyChangesFromCache(childChanged, cache)).toBeNull();
  });

  it('alive parent vs recently dead cached parent', () => {
    const cache = new MorphologyCache();
    cache.observe([parent], 100);
    cache.observe([childChanged], 101); // parent absent from this frame (dead), still cached
    const dead = inheritanceView(childChanged, cache, () => false);
    expect(dead.parent).toMatchObject({ kind: 'observed', parentId: 10, lastSeenTick: 100 });
    expect(dead.comparison?.changedCount).toBe(3);
    expect(inheritanceSummary(dead)).toBe('3 / 5 morphology genes differ from parent');
    const alive = inheritanceView(childChanged, cache, (id) => id === 10);
    expect(alive.parent.kind).toBe('alive');
    expect(inheritanceSummary(inheritanceView(childSame, cache, () => false))).toBe('No morphology difference from parent at protocol precision');
  });
});

describe('morphology cache', () => {
  it('never exceeds its bound and evicts the least recently seen first', () => {
    const cache = new MorphologyCache(100);
    for (let t = 1; t <= 1000; t++) {
      // 40 long-lived organisms re-seen every frame plus 3 new ones per frame
      const living = Array.from({ length: 40 }, (_, i) => organism({ id: i + 1 }));
      const born = Array.from({ length: 3 }, (_, i) => organism({ id: 100 + t * 3 + i, parentId: 1 }));
      cache.observe([...living, ...born], t);
      expect(cache.size()).toBeLessThanOrEqual(100);
    }
    expect(cache.size()).toBe(100);
    for (let i = 1; i <= 40; i++) expect(cache.has(i)).toBe(true); // always re-seen → retained
    expect(cache.has(100 + 3 * 3)).toBe(false); // long-dead → evicted
    expect(cache.has(100 + 1000 * 3)).toBe(true); // newest → retained
    expect(cache.get(1)?.lastSeenTick).toBe(1000);
  });

  it('is cleared by a world identity change and survives a same-world reconnect', () => {
    const h = new SessionHistory();
    h.push(frame({ tick: 1, organisms: [parent] }));
    h.push(frame({ tick: 2, organisms: [parent, childChanged] }));
    expect(h.morphology().has(10)).toBe(true);
    // parent dies, frames are missed (reconnect), same world
    h.push(frame({ tick: 50, organisms: [childChanged] }));
    expect(h.morphology().has(10)).toBe(true);
    expect(inheritanceView(childChanged, h.morphology(), () => false).comparison?.changedCount).toBe(3);
    // a different world clears the cache: the "same" parent id is not compared against the old world
    h.push(frame({ rootSeed: 999, tick: 51, organisms: [childChanged] }));
    expect(h.morphology().has(10)).toBe(false);
    expect(h.morphology().has(20)).toBe(true);
    expect(inheritanceView(childChanged, h.morphology(), () => false).parent.kind).toBe('unavailable');
    expect(h.snapshot().resets).toBe(1);
  });
});

describe('birth feed integration', () => {
  it('a birth carries the morphology change count only when the parent morphology is known', () => {
    const h = new SessionHistory();
    h.push(frame({ tick: 1, organisms: [parent] }));
    h.push(frame({ tick: 2, organisms: [parent, childChanged] }));
    h.push(frame({ tick: 3, organisms: [parent, childChanged, childSame, organism({ id: 30, parentId: 77, lineageRootId: 77 })] }));
    const births = h.snapshot().events.filter((e): e is BirthEvent => e.kind === 'birth');
    expect(births.map((b) => [b.id, b.morphologyChanges])).toEqual([[20, 3], [21, 0], [30, null]]);
    expect(h.snapshot()).toMatchObject({ birthsComparable: 2, birthsChanged: 1 });
    const html = renderToStaticMarkup(<EventFeed events={h.snapshot().events} focusLineage={null} onSelectOrganism={() => {}} />);
    expect(html).toContain('feed-morph feed-morph-changed');
    expect(html).toContain('Δ3');
    expect(html).toContain('Δ0');
    expect((html.match(/data-testid="feed-morph"/g) ?? []).length).toBe(2); // #30's parent unknown → no indicator
    const panel = renderToStaticMarkup(<EvolutionPanel history={h.snapshot()} focusLineage={null} selectedLineage={null} onToggleFocus={() => {}} onHoverLineage={() => {}} onSelectOrganism={() => {}} />);
    expect(panel).toContain('data-testid="evo-morph">1 / 2<');
  });
});

describe('inspector inheritance section', () => {
  const render = (o: typeof childChanged, cache: MorphologyCache, alive: (id: number) => boolean) => {
    const view = resolveSelection(null, o.id, frame({ tick: 900, organisms: [o] }))!;
    return renderToStaticMarkup(
      <Inspector selection={view} energyScale={100} lineageFocused={false} inheritance={inheritanceView(o, cache, alive)} isAlive={alive} onSelectOrganism={() => {}} onToggleLineageFocus={() => {}} onDeselect={() => {}} />,
    );
  };

  it('shows parent, current and delta per gene with change marks and a clickable living parent', () => {
    const cache = new MorphologyCache();
    cache.observe([parent], 100);
    const html = render(childChanged, cache, (id) => id === 10);
    expect(html).toContain('3 / 5 morphology genes differ from parent');
    expect(html).toContain('data-testid="gene-size" data-changed="true"');
    expect(html).toContain('data-testid="gene-maxSpeed" data-changed="false"');
    expect(html).toContain('+0.032');
    expect(html).toContain('−8.500');
    expect(html).toContain('+0.001');
    expect(html).toContain('gene gene-up');
    expect(html).toContain('gene gene-down');
    expect(html).toContain('gene gene-same');
    expect(html).toContain('parent-btn');
    expect(html).toContain('Parent #10');
    expect(html).toContain('field-link'); // Identity → Parent is a button when the parent is alive
    expect(html).toContain('morphology mutations at this birth');
    expect(html).not.toMatch(/\b(fit|fitter|beneficial|harmful|adapted|superior|improved|mutation score)\b/i);
  });

  it('distinguishes an observed (dead) parent and an unavailable parent, and founders', () => {
    const cache = new MorphologyCache();
    cache.observe([parent], 100);
    const dead = render(childChanged, cache, () => false);
    expect(dead).toContain('observed · last seen at tick 100');
    expect(dead).not.toContain('parent-btn');
    expect(dead).not.toContain('field-link');
    const none = render(childChanged, new MorphologyCache(), () => false);
    expect(none).toContain('Parent comparison unavailable');
    expect(none).toContain('morphology not observed in this session');
    expect(none).not.toContain('data-changed=');
    const founder = render(parent, cache, () => false);
    expect(founder).toContain('Founder — no parent comparison');
    expect(founder).toContain('inheritance-founder');
    expect(founder).toContain('1.000'); // own values still shown
  });
});
