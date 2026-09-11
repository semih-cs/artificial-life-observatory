import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { inspectorGroups, resolveSelection } from '../src/world/selection.js';
import { Inspector } from '../src/ui/Inspector.js';
import { Hud } from '../src/ui/Hud.js';
import { FrameStore } from '../src/world/frameStore.js';
import { MorphologyCache } from '../src/world/morphologyCache.js';
import { inheritanceView } from '../src/world/inheritance.js';
import { ancestryChain } from '../src/world/ancestry.js';

const inspector = (view: NonNullable<ReturnType<typeof resolveSelection>>) => (
  <Inspector
    selection={view}
    energyScale={100}
    lineageFocused={false}
    inheritance={inheritanceView(view.organism, new MorphologyCache(), () => false)}
    ancestry={ancestryChain(view.organism, new MorphologyCache(), () => false)}
    isAlive={() => false}
    onSelectOrganism={() => {}}
    onToggleLineageFocus={() => {}}
    onDeselect={() => {}}
  />
);
import { frame, organism } from './fixtures.js';

describe('organism selection', () => {
  it('shows the selected organism data from the newest frame', () => {
    const f = frame({ tick: 3000, organisms: [organism({ id: 42, parentId: 7, generationDepth: 3, lineageRootId: 2, energy: 63.4, age: 812, size: 1.234, maxSpeed: 1.5, visionRange: 120.5, visionAngle: 1.571, metabolism: 0.9 })] });
    const view = resolveSelection(null, 42, f);
    expect(view).not.toBeNull();
    expect(view!.alive).toBe(true);
    expect(view!.lastSeenTick).toBe(3000);
    const groups = inspectorGroups(view!, 100);
    expect(groups.map((g) => g.title)).toEqual(['Identity', 'Life']);
    const flat = Object.fromEntries(groups.flatMap((g) => g.fields.map((x) => [x.label, x.value])));
    expect(flat).toMatchObject({
      'ID': '#42', 'Parent': '#7', 'Lineage root': '#2', 'Generation': '3', 'Age': '812 ticks', 'Energy': '63.4',
    });
    expect(groups[0]!.fields.find((f) => f.label === 'Parent')!.organismId).toBe(7);
    const energy = groups[1]!.fields.find((x) => x.label === 'Energy')!;
    expect(energy.fraction).toBeCloseTo(0.634, 6);

    const html = renderToStaticMarkup(inspector(view!));
    expect(html).toContain('Organism #42');
    // morphology now lives in the inheritance section, at protocol precision
    expect(html).toContain('1.234');
    expect(html).toContain('1.500');
    expect(html).toContain('120.500');
    expect(html).toContain('1.571');
    expect(html).toContain('90.0°');
    expect(html).toContain('0.900');
    expect(html).toContain('alive · observed at tick 3,000');
    expect(html).toContain('Focus lineage');
    expect(html).not.toMatch(/healthy|weak|strong|dying|intelligent|aggressive|fit\b/i);
  });

  it('labels founders and never invents qualitative labels', () => {
    const view = resolveSelection(null, 1, frame({ organisms: [organism({ id: 1, parentId: null })] }))!;
    const flat = Object.fromEntries(inspectorGroups(view, 100).flatMap((g) => g.fields.map((x) => [x.label, x.value])));
    expect(flat['Parent']).toBe('founder');
  });

  it('keeps the last known data, marked not alive, when the organism disappears', () => {
    const alive = resolveSelection(null, 5, frame({ tick: 10, organisms: [organism({ id: 5, energy: 12 })] }));
    const gone = resolveSelection(alive, 5, frame({ tick: 11, organisms: [organism({ id: 6 })] }));
    expect(gone).not.toBeNull();
    expect(gone!.alive).toBe(false);
    expect(gone!.lastSeenTick).toBe(10);
    expect(gone!.organism.energy).toBe(12);
    // stays stable across further frames, and never resurrects on its own
    const later = resolveSelection(gone, 5, frame({ tick: 12, organisms: [] }));
    expect(later).toBe(gone);
    const html = renderToStaticMarkup(inspector(gone!));
    expect(html).toContain('no longer alive');
    expect(html).toContain('last seen at tick 10');
  });

  it('clears when nothing is selected or the id was never observed', () => {
    expect(resolveSelection(null, null, frame())).toBeNull();
    expect(resolveSelection(null, 999, frame())).toBeNull();
    expect(resolveSelection(null, 999, null)).toBeNull();
  });

  it('uses the store lookup when provided and reuses the view for an unchanged organism', () => {
    const store = new FrameStore();
    store.push(frame({ tick: 1, organisms: [organism({ id: 3 })] }), 0);
    const a = resolveSelection(null, 3, store.latest(), (id) => store.organism(id));
    const b = resolveSelection(a, 3, store.latest(), (id) => store.organism(id));
    expect(b).toBe(a);
    store.push(frame({ tick: 2, organisms: [organism({ id: 3, x: 1 })] }), 100);
    const c = resolveSelection(b, 3, store.latest(), (id) => store.organism(id));
    expect(c).not.toBe(b);
    expect(c!.lastSeenTick).toBe(2);
  });
});

describe('HUD', () => {
  it('renders connection state, tick and population', () => {
    const store = new FrameStore();
    store.push(frame({ tick: 12345, population: 2, organisms: [organism({ id: 1 }), organism({ id: 2, lineageRootId: 4, generationDepth: 6 })] }), 0);
    const html = renderToStaticMarkup(
      <Hud
        status={{ state: 'live', url: 'ws://127.0.0.1:8787/', attempt: 0, retryInMs: null, framesReceived: 1, malformedMessages: 0, lastError: null, everLive: true }}
        summary={store.summary()}
        viewPaused={false}
      />,
    );
    expect(html).toContain('Live');
    expect(html).toContain('12,345');
    expect(html).toContain('0A.2.0');
    expect(html).toContain('seed 20260910');
    expect(html).toContain('d42a0b85');
    expect(html).toContain('500×500');
  });

  it('shows every connection state and the view-paused note', () => {
    for (const state of ['connecting', 'live', 'disconnected', 'reconnecting', 'error'] as const) {
      const html = renderToStaticMarkup(
        <Hud status={{ state, url: 'ws://x/', attempt: 0, retryInMs: null, framesReceived: 0, malformedMessages: 1, lastError: 'tick is not a finite number', everLive: false }} summary={null} viewPaused />,
      );
      expect(html).toContain(`conn-${state}`);
      expect(html).toContain('View paused');
      expect(html).toContain('1 malformed frame ignored');
    }
  });
});
