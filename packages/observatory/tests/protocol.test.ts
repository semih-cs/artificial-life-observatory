import { describe, expect, it } from 'vitest';
import { parseObserverMessage, parseObserverValue, SUPPORTED_OBSERVER_PROTOCOL_VERSION } from '../src/protocol/observerV1.js';
import { frame, frameText, organism } from './fixtures.js';

describe('observer protocol v1 parsing', () => {
  it('accepts a valid observer-v1 frame', () => {
    const result = parseObserverMessage(frameText({ tick: 4321, organisms: [organism({ id: 7, parentId: 3, generationDepth: 2, lineageRootId: 1 })] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frame.tick).toBe(4321);
    expect(result.frame.observerProtocolVersion).toBe(SUPPORTED_OBSERVER_PROTOCOL_VERSION);
    expect(result.frame.organisms).toHaveLength(1);
    expect(result.frame.organisms[0]).toMatchObject({ id: 7, parentId: 3, generationDepth: 2, lineageRootId: 1 });
    expect(result.frame.food).toHaveLength(1);
    expect(result.frame.world).toEqual({ width: 500, height: 500 });
  });

  it('accepts the README example shape (founder with null parent)', () => {
    const text = JSON.stringify({
      type: 'frame', observerProtocolVersion: 1, simulationVersion: '0A.2.0', configHash: 'd42a0b850f579fb2', rootSeed: 20260910,
      tick: 1000, snapshotTick: 1000, world: { width: 500, height: 500 }, population: 1, foodCount: 1,
      organisms: [{ id: 1, parentId: null, generationDepth: 0, lineageRootId: 1, x: 246.36, y: 333.77, heading: 3.43, size: 0.994, energy: 57.32, age: 1000, maxSpeed: 1.282, visionRange: 148.021, visionAngle: 1.788, metabolism: 0.995 }],
      food: [{ id: 5, x: 372.6, y: 430.11 }],
    });
    const result = parseObserverMessage(text);
    expect(result.ok).toBe(true);
  });

  it('rejects non-JSON and non-text messages without throwing', () => {
    expect(parseObserverMessage('{not json')).toMatchObject({ ok: false, kind: 'not-json' });
    expect(parseObserverMessage(new ArrayBuffer(4))).toMatchObject({ ok: false, kind: 'not-json' });
    expect(parseObserverMessage(undefined)).toMatchObject({ ok: false, kind: 'not-json' });
  });

  it('rejects malformed frames safely', () => {
    const cases: unknown[] = [
      null,
      42,
      [],
      { type: 'status' },
      { ...frame(), observerProtocolVersion: undefined },
      { ...frame(), tick: 'soon' },
      { ...frame(), world: { width: 0, height: 500 } },
      { ...frame(), organisms: 'many' },
      { ...frame(), organisms: [{ id: 1 }] },
      { ...frame(), organisms: [organism({ x: Number.NaN })] },
      { ...frame(), organisms: [{ ...organism(), parentId: 'none' }] },
      { ...frame(), food: [{ id: 1, x: 'a', y: 2 }] },
    ];
    for (const c of cases) {
      const result = parseObserverValue(c);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.kind).toBe('malformed');
    }
  });

  it('reports an unsupported protocol version explicitly instead of interpreting it', () => {
    const result = parseObserverMessage(frameText({ observerProtocolVersion: 2 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe('unsupported-version');
    expect(result.version).toBe(2);
    expect(result.message).toContain('v2');
    expect(result.message).toContain('v1');
  });

  it('does not depend on organism or food array length', () => {
    const result = parseObserverMessage(frameText({ organisms: [], food: [], population: 0, foodCount: 0 }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.frame.organisms).toEqual([]);
  });
});
