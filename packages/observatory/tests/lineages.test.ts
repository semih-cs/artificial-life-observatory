import { describe, expect, it } from 'vitest';
import { summarizeFrameLineages, summarizeLineages, toggleLineageFocus } from '../src/world/lineages.js';
import { frame, organism } from './fixtures.js';

describe('lineage aggregation (per frame)', () => {
  it('counts living organisms, fraction, max and mean generation per lineage', () => {
    const f = frame({
      organisms: [
        organism({ id: 1, lineageRootId: 1, generationDepth: 0 }),
        organism({ id: 2, lineageRootId: 1, generationDepth: 4 }),
        organism({ id: 3, lineageRootId: 1, generationDepth: 2 }),
        organism({ id: 4, lineageRootId: 9, generationDepth: 7 }),
      ],
    });
    const agg = summarizeFrameLineages(f);
    expect(agg.population).toBe(4);
    expect(agg.maxGeneration).toBe(7);
    expect(agg.meanGeneration).toBeCloseTo(13 / 4, 9);
    expect(agg.lineages).toEqual([
      { lineageRootId: 1, count: 3, fraction: 0.75, maxGeneration: 4, meanGeneration: 2 },
      { lineageRootId: 9, count: 1, fraction: 0.25, maxGeneration: 7, meanGeneration: 7 },
    ]);
    expect(agg.counts.get(1)).toBe(3);
    expect(agg.counts.get(9)).toBe(1);
  });

  it('sorts by count descending, then lineageRootId ascending — deterministic regardless of input order', () => {
    const organisms = [
      organism({ id: 10, lineageRootId: 7 }), organism({ id: 11, lineageRootId: 7 }),
      organism({ id: 12, lineageRootId: 3 }), organism({ id: 13, lineageRootId: 3 }),
      organism({ id: 14, lineageRootId: 5 }), organism({ id: 15, lineageRootId: 5 }), organism({ id: 16, lineageRootId: 5 }),
      organism({ id: 17, lineageRootId: 1 }),
    ];
    const ids = summarizeLineages(organisms).lineages.map((l) => l.lineageRootId);
    expect(ids).toEqual([5, 3, 7, 1]);
    const reversed = summarizeLineages([...organisms].reverse()).lineages.map((l) => l.lineageRootId);
    expect(reversed).toEqual(ids);
  });

  it('handles an empty frame', () => {
    const agg = summarizeLineages([]);
    expect(agg.lineages).toEqual([]);
    expect(agg.population).toBe(0);
    expect(agg.maxGeneration).toBe(0);
    expect(agg.meanGeneration).toBe(0);
  });

  it('focus toggles: clicking the focused lineage clears it (frontend state only)', () => {
    expect(toggleLineageFocus(null, 3)).toBe(3);
    expect(toggleLineageFocus(3, 3)).toBeNull();
    expect(toggleLineageFocus(3, 4)).toBe(4);
  });
});
