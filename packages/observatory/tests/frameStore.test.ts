import { describe, expect, it } from 'vitest';
import { FrameStore } from '../src/world/frameStore.js';
import { frame, organism } from './fixtures.js';

describe('frame store', () => {
  it('replaces the live state with each newer frame and keeps no history', () => {
    const store = new FrameStore();
    expect(store.latest()).toBeNull();
    expect(store.retainedFrames()).toBe(0);
    for (let i = 1; i <= 500; i++) {
      store.push(frame({ tick: i, organisms: [organism({ id: 1, x: i })] }), i * 100);
      expect(store.retainedFrames()).toBeLessThanOrEqual(2);
    }
    expect(store.latest()?.tick).toBe(500);
    expect(store.previous()?.tick).toBe(499);
    expect(store.organism(1)?.x).toBe(500);
    expect(store.previousOrganism(1)?.x).toBe(499);
    expect(store.summary()?.framesReceived).toBe(500);
  });

  it('derives the summary the HUD needs', () => {
    const store = new FrameStore();
    store.push(frame({
      tick: 77, snapshotTick: 70, foodCount: 3, food: [], population: 3,
      organisms: [
        organism({ id: 1, lineageRootId: 1, generationDepth: 0, energy: 40 }),
        organism({ id: 2, lineageRootId: 1, generationDepth: 4, energy: 120 }),
        organism({ id: 3, lineageRootId: 9, generationDepth: 2, energy: 10 }),
      ],
    }), 0);
    const s = store.summary();
    expect(s).toMatchObject({ tick: 77, snapshotTick: 70, population: 3, foodCount: 3, lineageCount: 2, maxGeneration: 4, maxEnergy: 120, worldWidth: 500 });
  });

  it('estimates the frame interval from arrival times and notifies subscribers', () => {
    const store = new FrameStore();
    let notified = 0;
    const unsubscribe = store.subscribe(() => { notified++; });
    store.push(frame({ tick: 1 }), 0);
    store.push(frame({ tick: 2 }), 200);
    store.push(frame({ tick: 3 }), 400);
    expect(notified).toBe(3);
    expect(store.frameIntervalMs()).toBeGreaterThan(100);
    expect(store.latestReceivedAt()).toBe(400);
    unsubscribe();
    store.push(frame({ tick: 4 }), 600);
    expect(notified).toBe(3);
  });

  it('collapseToLatest drops the previous frame so the view jumps instead of sweeping', () => {
    const store = new FrameStore();
    store.push(frame({ tick: 1 }), 0);
    store.push(frame({ tick: 2 }), 100);
    expect(store.retainedFrames()).toBe(2);
    store.collapseToLatest();
    expect(store.retainedFrames()).toBe(1);
    expect(store.previousOrganism(1)).toBeUndefined();
    expect(store.latest()?.tick).toBe(2);
  });
});
