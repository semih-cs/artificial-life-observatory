import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionHistory } from '../src/world/sessionHistory.js';
import { EvolutionPanel } from '../src/ui/EvolutionPanel.js';
import { Hud } from '../src/ui/Hud.js';
import { FrameStore } from '../src/world/frameStore.js';
import { sparklinePath } from '../src/ui/Sparkline.js';
import { frame, organism } from './fixtures.js';

function history(): SessionHistory {
  const h = new SessionHistory({ sampleTicks: 1 });
  h.push(frame({ tick: 500, organisms: [
    organism({ id: 1, lineageRootId: 1, generationDepth: 0 }),
    organism({ id: 2, lineageRootId: 1, generationDepth: 3 }),
    organism({ id: 3, lineageRootId: 2, generationDepth: 7 }),
    organism({ id: 4, lineageRootId: 6, generationDepth: 1 }),
  ] }));
  h.push(frame({ tick: 501, organisms: [
    organism({ id: 1, lineageRootId: 1, generationDepth: 0 }),
    organism({ id: 2, lineageRootId: 1, generationDepth: 3 }),
    organism({ id: 5, parentId: 2, lineageRootId: 1, generationDepth: 4 }),
    organism({ id: 3, lineageRootId: 2, generationDepth: 7, age: 900 }),
  ] }));
  h.push(frame({ tick: 502, organisms: [
    organism({ id: 1, lineageRootId: 1, generationDepth: 0 }),
    organism({ id: 2, lineageRootId: 1, generationDepth: 3 }),
    organism({ id: 5, parentId: 2, lineageRootId: 1, generationDepth: 4 }),
  ] }));
  return h;
}

const render = (h: SessionHistory, focus: number | null, selected: number | null) => renderToStaticMarkup(
  <EvolutionPanel history={h.snapshot()} focusLineage={focus} selectedLineage={selected} onToggleFocus={() => {}} onHoverLineage={() => {}} onSelectOrganism={() => {}} />,
);

describe('evolution panel', () => {
  it('lists living lineages most numerous first with count, share and max generation', () => {
    const html = render(history(), null, null);
    const i1 = html.indexOf('data-testid="lineage-1"');
    expect(i1).toBeGreaterThan(-1);
    expect(html).not.toContain('data-testid="lineage-2"'); // extinct at 502
    expect(html).not.toContain('data-testid="lineage-6"'); // extinct at 501
    expect(html).toContain('3 alive');
    expect(html).toContain('100%');
    expect(html).toContain('gen 4');
    expect(html).toContain('data-testid="evo-max-gen">4<');
    // recently extinct, still visible this session
    expect(html).toContain('data-testid="extinct-2"');
    expect(html).toContain('data-testid="extinct-6"');
    expect(html).toContain('No longer living');
  });

  it('shows births, deaths, extinctions and never invents qualitative labels', () => {
    const html = render(history(), null, null);
    expect(html).toContain('data-testid="feed-birth"');
    expect(html).toContain('born <button');
    expect(html).toContain('#5</button>');
    expect(html).toContain('title="parent #2"');
    expect(html).toContain('data-testid="feed-death"');
    expect(html).toContain('age 900');
    expect(html).toContain('data-testid="feed-extinction"');
    expect(html).toContain('no longer living');
    expect(html).not.toMatch(/\b(fit|fitter|fittest|superior|intelligent|adapted|successful|strong|weak|species|faction|race)\b/i);
  });

  it('marks the focused row and the selected organism lineage, and shows the focused lineage trend', () => {
    const html = render(history(), 1, 1);
    expect(html).toContain('lineage-row lineage-focused lineage-selected');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('living count · this session');
    expect(html).toContain('>selected<');
    const none = render(history(), null, null);
    expect(none).not.toContain('lineage-focused');
    expect(none).not.toContain('living count · this session');
  });

  it('shows an observation gap marker instead of inferred events', () => {
    const h = new SessionHistory();
    h.push(frame({ tick: 1, organisms: [organism({ id: 1 })] }));
    h.push(frame({ tick: 5000, organisms: [organism({ id: 900 })] }));
    const html = render(h, null, null);
    expect(html).toContain('data-testid="feed-gap"');
    expect(html).toContain('observation gap · ticks 1 → 5,000');
    expect(html).not.toContain('data-testid="feed-birth"');
    expect(html).not.toContain('data-testid="feed-death"');
  });

  it('renders trends with the newest values and a bounded sparkline path', () => {
    const html = render(history(), null, null);
    expect(html).toContain('data-testid="trend-population"');
    expect(html).toContain('data-testid="trend-generation"');
    expect(html).toContain('ticks 500 – 502 · 3 samples');
    const { line, last } = sparklinePath([4, 4, 3], 100, 20, 0);
    expect(line.startsWith('M')).toBe(true);
    expect(last).not.toBeNull();
    expect(last!.y).toBeGreaterThan(2); // 3 of max 4 sits below the top
    expect(sparklinePath([], 100, 20, 0)).toEqual({ line: '', area: '', last: null });
    const flat = sparklinePath([5, 5, 5], 100, 20, null);
    expect(flat.line).toContain('M2.0');
  });

  it('the HUD shows the maximum living generation prominently', () => {
    const store = new FrameStore();
    store.push(frame({ organisms: [organism({ id: 1, generationDepth: 2 }), organism({ id: 2, generationDepth: 11 })] }), 0);
    const html = renderToStaticMarkup(
      <Hud status={{ state: 'live', url: 'ws://x/', attempt: 0, retryInMs: null, framesReceived: 1, malformedMessages: 0, lastError: null, everLive: true }} summary={store.summary()} viewPaused={false} />,
    );
    expect(html).toContain('data-testid="hud-generation">11<');
  });
});
