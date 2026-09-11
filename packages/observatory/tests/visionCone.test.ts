import { describe, expect, it } from 'vitest';
import { visionCone, visionConeOutline } from '../src/world/visionCone.js';
import { parseObserverValue } from '../src/protocol/observerV1.js';
import { organism, frame } from './fixtures.js';

describe('selected-organism vision cone (V2.1, display geometry only)', () => {
  it('is centred on the organism, reaches visionRange and spans heading ± visionAngle / 2', () => {
    const o = organism({ x: 120, y: 80, heading: 0.7, visionRange: 150, visionAngle: 1.8 });
    const cone = visionCone(o)!;
    expect(cone).toEqual({ cx: 120, cy: 80, radius: 150, halfAngle: 0.9, startAngle: 0.7 - 0.9, endAngle: 0.7 + 0.9 });
  });

  it('tracks the displayed (interpolated) position and heading, but range and angle always come from the frame', () => {
    const o = organism({ x: 10, y: 10, heading: 0, visionRange: 60, visionAngle: 1 });
    const cone = visionCone(o, { x: 12.5, y: 11, heading: 0.25 })!;
    expect([cone.cx, cone.cy, cone.radius, cone.halfAngle]).toEqual([12.5, 11, 60, 0.5]);
    expect(cone.startAngle).toBeCloseTo(-0.25, 12);
    expect(cone.endAngle).toBeCloseTo(0.75, 12);
  });

  it('outline = apex, then an arc whose points lie exactly on the range inside the angular bounds', () => {
    const o = organism({ x: 200, y: 300, heading: 2.5, visionRange: 90, visionAngle: 2.2 });
    const cone = visionCone(o)!;
    const pts = visionConeOutline(cone, 16);
    expect(pts.length).toBe(2 * (1 + 17));
    expect([pts[0], pts[1]]).toEqual([200, 300]);
    for (let i = 2; i < pts.length; i += 2) {
      const dx = pts[i]! - 200;
      const dy = pts[i + 1]! - 300;
      expect(Math.hypot(dx, dy)).toBeCloseTo(90, 9);
      let rel = Math.atan2(dy, dx) - 2.5;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      expect(Math.abs(rel)).toBeLessThanOrEqual(1.1 + 1e-9);
    }
    // the two arc ends are exactly the cone edges
    const first = Math.atan2(pts[3]! - 300, pts[2]! - 200);
    const last = Math.atan2(pts[pts.length - 1]! - 300, pts[pts.length - 2]! - 200);
    const wrapped = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    expect(first).toBeCloseTo(wrapped(2.5 - 1.1), 9);
    expect(last).toBeCloseTo(wrapped(2.5 + 1.1), 9);
  });

  it('positive angles are clockwise on screen (y down), matching the heading convention', () => {
    // heading 0 = +x; a cone of 90° spans from -45° (up-right on screen) to +45° (down-right)
    const cone = visionCone(organism({ x: 0, y: 0, heading: 0, visionRange: 10, visionAngle: Math.PI / 2 }))!;
    const pts = visionConeOutline(cone, 2);
    expect(pts[3]!).toBeLessThan(0); // start edge above the centre line (smaller y)
    expect(pts[pts.length - 1]!).toBeGreaterThan(0); // end edge below it
  });

  it('refuses values that cannot form a cone instead of guessing', () => {
    expect(visionCone(organism({ visionRange: 0 }))).toBeNull();
    expect(visionCone(organism({ visionRange: -5 }))).toBeNull();
    expect(visionCone(organism({ visionAngle: Number.NaN }))).toBeNull();
    expect(visionCone(organism(), { x: Number.POSITIVE_INFINITY, y: 0, heading: 0 })).toBeNull();
    // a (hypothetical) angle beyond 2π is clamped to a full disc, never wrapped
    expect(visionCone(organism({ visionAngle: 9 }))!.halfAngle).toBe(Math.PI);
  });

  it('reads only position, heading, visionRange and visionAngle, and modifies nothing', () => {
    const received = parseObserverValue(frame({ organisms: [organism({ id: 7, x: 50, y: 60 })] }));
    expect(received.ok).toBe(true);
    const o = Object.freeze({ ...(received as { ok: true; frame: ReturnType<typeof frame> }).frame.organisms[0]! });
    const read = new Set<string>();
    const spy = new Proxy(o, { get(target, key, recv) { read.add(String(key)); return Reflect.get(target, key, recv); } });
    const cone = visionCone(spy);
    expect(cone).not.toBeNull();
    expect([...read].sort()).toEqual(['heading', 'visionAngle', 'visionRange', 'x', 'y']);
    // pure: repeated calls are identical, the output names no organism, and nothing was written
    expect(visionCone(o)).toEqual(cone);
    expect(Object.keys(cone!).sort()).toEqual(['cx', 'cy', 'endAngle', 'halfAngle', 'radius', 'startAngle']);
    expect(o).toEqual(organism({ id: 7, x: 50, y: 60 }));
  });
});
