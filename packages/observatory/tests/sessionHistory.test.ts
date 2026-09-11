import { describe, expect, it } from 'vitest';
import { CONTINUOUS_TICK_GAP, SessionHistory, lineageTrend, sameWorldIdentity, type FeedEvent } from '../src/world/sessionHistory.js';
import { frame, organism } from './fixtures.js';

const kinds = (events: readonly FeedEvent[]) => events.map((e) => e.kind);

describe('session history — birth / death derivation', () => {
  it('derives births and deaths from consecutive frames', () => {
    const h = new SessionHistory();
    h.push(frame({ tick: 100, organisms: [organism({ id: 1, lineageRootId: 1, age: 500 }), organism({ id: 2, lineageRootId: 1, age: 20 })] }));
    expect(h.snapshot().events).toEqual([]);
    h.push(frame({ tick: 101, organisms: [organism({ id: 2, lineageRootId: 1, age: 21 }), organism({ id: 3, parentId: 2, lineageRootId: 1, generationDepth: 5 })] }));
    const events = h.snapshot().events;
    expect(kinds(events)).toEqual(['death', 'birth']);
    expect(events[0]).toMatchObject({ kind: 'death', tick: 101, id: 1, lineageRootId: 1, lastAge: 500, lastSeenTick: 100 });
    expect(events[1]).toMatchObject({ kind: 'birth', tick: 101, id: 3, parentId: 2, lineageRootId: 1, generationDepth: 5 });
    // an unchanged frame produces nothing
    h.push(frame({ tick: 102, organisms: [organism({ id: 2 }), organism({ id: 3, parentId: 2 })] }));
    expect(h.snapshot().events).toHaveLength(2);
  });

  it('records a lineage extinction when its last organism disappears, and lists it as recently extinct', () => {
    const h = new SessionHistory();
    h.push(frame({ tick: 10, organisms: [organism({ id: 1, lineageRootId: 1 }), organism({ id: 2, lineageRootId: 4, generationDepth: 3 })] }));
    h.push(frame({ tick: 11, organisms: [organism({ id: 1, lineageRootId: 1 })] }));
    const s = h.snapshot();
    expect(kinds(s.events)).toEqual(['death', 'extinction']);
    expect(s.events[1]).toMatchObject({ kind: 'extinction', tick: 11, lineageRootId: 4, lastCount: 1 });
    expect(s.recentlyExtinct).toEqual([{ lineageRootId: 4, lastSeenTick: 10, observedTick: 11, lastCount: 1, lastMaxGeneration: 3 }]);
    expect(s.lineages?.lineages.map((l) => l.lineageRootId)).toEqual([1]);
  });

  it('frame-gap safety: a large tick jump yields one gap marker and no fabricated births or deaths', () => {
    const h = new SessionHistory();
    h.push(frame({ tick: 100, organisms: [organism({ id: 1 }), organism({ id: 2 })] }));
    // 200 organisms replaced across a 500-tick jump: none of it is observed as events
    const many = Array.from({ length: 200 }, (_, i) => organism({ id: 100 + i, lineageRootId: 1 + (i % 5) }));
    h.push(frame({ tick: 600, organisms: many }));
    let s = h.snapshot();
    expect(kinds(s.events)).toEqual(['gap']);
    expect(s.events[0]).toMatchObject({ kind: 'gap', fromTick: 100, toTick: 600, frames: 1 });
    // consecutive gapped frames coalesce into the same marker
    h.push(frame({ tick: 1200, organisms: many.slice(0, 150) }));
    s = h.snapshot();
    expect(kinds(s.events)).toEqual(['gap']);
    expect(s.events[0]).toMatchObject({ fromTick: 100, toTick: 1200, frames: 2 });
    // a backwards tick (runner restarted from an older snapshot) is a gap too
    h.push(frame({ tick: 900, organisms: many.slice(0, 120) }));
    expect(h.snapshot().events).toHaveLength(1);
    // exactly the continuity limit is still continuous; one more is not
    h.push(frame({ tick: 900 + CONTINUOUS_TICK_GAP, organisms: many.slice(0, 119) }));
    expect(kinds(h.snapshot().events)).toEqual(['gap', 'death']);
    h.push(frame({ tick: 900 + CONTINUOUS_TICK_GAP * 2 + 1, organisms: many.slice(0, 118) }));
    expect(kinds(h.snapshot().events)).toEqual(['gap', 'death', 'gap']);
    // the trend still continues across gaps
    expect(h.snapshot().trend.map((p) => p.population)).toEqual([2, 200, 150, 120, 118]);
  });

  it('keeps the event feed bounded', () => {
    const h = new SessionHistory({ maxEvents: 50 });
    let alive: number[] = [];
    let next = 1;
    for (let t = 1; t <= 300; t++) {
      // each tick: two births and one death
      alive.push(next++, next++);
      if (alive.length > 5) alive = alive.slice(1);
      h.push(frame({ tick: t, organisms: alive.map((id) => organism({ id })) }));
      expect(h.snapshot().events.length).toBeLessThanOrEqual(50);
    }
    const s = h.snapshot();
    expect(s.events).toHaveLength(50);
    expect(s.events[s.events.length - 1]!.kind).toBe('birth');
    expect((s.events[s.events.length - 1] as { id: number }).id).toBe(next - 1);
  });
});

describe('session history — trend', () => {
  it('samples every N ticks with correct population, food, max generation and lineage count', () => {
    const h = new SessionHistory({ sampleTicks: 10 });
    for (let t = 0; t <= 45; t++) {
      h.push(frame({
        tick: t, foodCount: 3 + t, food: [],
        organisms: [
          organism({ id: 1, lineageRootId: 1, generationDepth: 0 }),
          organism({ id: 2, lineageRootId: 2, generationDepth: t >= 20 ? 6 : 2 }),
          ...(t >= 30 ? [organism({ id: 3, lineageRootId: 7, generationDepth: 9 })] : []),
        ],
        population: t >= 30 ? 3 : 2,
      }));
    }
    const trend = h.snapshot().trend;
    expect(trend.map((p) => p.tick)).toEqual([0, 10, 20, 30, 40]);
    expect(trend.map((p) => p.population)).toEqual([2, 2, 2, 3, 3]);
    expect(trend.map((p) => p.foodCount)).toEqual([3, 13, 23, 33, 43]);
    expect(trend.map((p) => p.maxGeneration)).toEqual([2, 2, 6, 9, 9]);
    expect(trend.map((p) => p.lineageCount)).toEqual([2, 2, 2, 3, 3]);
    expect(lineageTrend(trend, 7)).toEqual([0, 0, 0, 1, 1]);
    expect(lineageTrend(trend, 1)).toEqual([1, 1, 1, 1, 1]);
  });

  it('keeps the trend bounded and per-lineage counts only inside retained samples', () => {
    const h = new SessionHistory({ sampleTicks: 1, maxTrendPoints: 40 });
    for (let t = 1; t <= 500; t++) {
      h.push(frame({ tick: t, organisms: [organism({ id: 1, lineageRootId: t }), organism({ id: 2, lineageRootId: 1 })] }));
      expect(h.snapshot().trend.length).toBeLessThanOrEqual(40);
    }
    const trend = h.snapshot().trend;
    expect(trend).toHaveLength(40);
    expect(trend[0]!.tick).toBe(461);
    expect(trend[39]!.tick).toBe(500);
    expect(lineageTrend(trend, 1).every((v) => v === 1)).toBe(true);
    expect(lineageTrend(trend, 100).every((v) => v === 0)).toBe(true); // fell out of the window
    expect(trend.every((p) => p.lineageCounts.size === 2)).toBe(true);
  });
});

describe('session history — world identity', () => {
  it('clears everything when a different world identity arrives', () => {
    const h = new SessionHistory({ sampleTicks: 1 });
    h.push(frame({ tick: 1, organisms: [organism({ id: 1, lineageRootId: 1 }), organism({ id: 2, lineageRootId: 2 })] }));
    h.push(frame({ tick: 2, organisms: [organism({ id: 1, lineageRootId: 1 })] }));
    let s = h.snapshot();
    expect(s.events.length).toBeGreaterThan(0);
    expect(s.trend).toHaveLength(2);
    expect(s.recentlyExtinct).toHaveLength(1);

    for (const other of [{ rootSeed: 7 }, { configHash: 'ffffffffffffffff' }, { simulationVersion: '0A.1.0' }] as const) {
      h.push(frame({ ...other, tick: 3, organisms: [organism({ id: 50, lineageRootId: 50 })] }));
      s = h.snapshot();
      expect(s.events).toEqual([]);
      expect(s.trend).toHaveLength(1);
      expect(s.trend[0]).toMatchObject({ tick: 3, population: 1 });
      expect(s.recentlyExtinct).toEqual([]);
      expect(s.framesObserved).toBe(1);
      expect(s.identity).toMatchObject(other);
      expect(s.lineages?.lineages.map((l) => l.lineageRootId)).toEqual([50]);
    }
    expect(s.resets).toBe(3);
    // the next frame of the new world is compared only with frames of that world
    h.push(frame({ simulationVersion: '0A.1.0', tick: 4, organisms: [organism({ id: 50, lineageRootId: 50 }), organism({ id: 51, lineageRootId: 50 })] }));
    expect(kinds(h.snapshot().events)).toEqual(['birth']);
  });

  it('a reconnect to the same world keeps the history and continues it', () => {
    const h = new SessionHistory({ sampleTicks: 1 });
    h.push(frame({ tick: 1, organisms: [organism({ id: 1 })] }));
    h.push(frame({ tick: 2, organisms: [organism({ id: 1 }), organism({ id: 2 })] }));
    const before = h.snapshot();
    expect(kinds(before.events)).toEqual(['birth']);
    // frames missed while disconnected, then the same world resumes
    h.push(frame({ tick: 40, organisms: [organism({ id: 1 }), organism({ id: 2 }), organism({ id: 3 })] }));
    h.push(frame({ tick: 41, organisms: [organism({ id: 2 }), organism({ id: 3 })] }));
    const after = h.snapshot();
    expect(after.resets).toBe(0);
    expect(after.framesObserved).toBe(4);
    expect(kinds(after.events)).toEqual(['birth', 'gap', 'death']);
    expect(after.trend.map((p) => p.tick)).toEqual([1, 2, 40, 41]);
    expect(after.events[0]).toBe(before.events[0]);
  });

  it('compares identity on all three fields', () => {
    const a = { simulationVersion: '0A.2.0', configHash: 'x', rootSeed: 1 };
    expect(sameWorldIdentity(a, { ...a })).toBe(true);
    expect(sameWorldIdentity(a, { ...a, rootSeed: 2 })).toBe(false);
    expect(sameWorldIdentity(a, { ...a, configHash: 'y' })).toBe(false);
    expect(sameWorldIdentity(a, { ...a, simulationVersion: '0A.1.0' })).toBe(false);
  });

  it('exposes a new snapshot object per frame and notifies subscribers', () => {
    const h = new SessionHistory();
    let n = 0;
    const off = h.subscribe(() => { n++; });
    const s0 = h.snapshot();
    h.push(frame({ tick: 1 }));
    const s1 = h.snapshot();
    expect(s1).not.toBe(s0);
    expect(h.snapshot()).toBe(s1);
    expect(n).toBe(1);
    off();
    h.push(frame({ tick: 2 }));
    expect(n).toBe(1);
  });
});
