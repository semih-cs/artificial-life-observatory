/**
 * V2.1 — other organisms enter the sensory world (model 0A.3.0).
 *
 * The authoritative semantics of the four appended inputs, tested directly on
 * the Sense phase: target selection (self, dead, range, cone, nearest, id tie,
 * zero distance), exact normalization and defaults, the unchanged first six
 * inputs, and purity (no RNG, no mutation, no dependence on array order).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  senseOrganism, senseNearestOrganism, findNearestVisibleOrganism, SenseContext, OrganismSensingContext,
} from '../src/perception/sense.js';
import { senseContextFor, stepWorld } from '../src/world/stepWorld.js';
import { bootstrapWorld } from '../src/world/bootstrap.js';
import { organismSensingModelConfig, DEFAULT_SIMULATION_CONFIG } from '../src/config/defaults.js';
import { canonicalStateString } from '../src/serialization/canonicalState.js';
import { OrganismRuntimeState } from '../src/organism/types.js';
import { constantGenome, makeOrganism } from './helpers.js';

const world = { width: 500, height: 500 };
const SIZE_BOUNDS = { min: 0.5, max: 1.5 }; // DEFAULT_SIMULATION_CONFIG.bootstrap.geneBounds.size

/** An organism with the given morphology; the controller is irrelevant to sensing. */
function org(id: number, x: number, y: number, opts: { heading?: number; size?: number; visionRange?: number; visionAngle?: number; alive?: boolean } = {}): OrganismRuntimeState {
  return makeOrganism({
    id,
    x,
    y,
    heading: opts.heading ?? 0,
    alive: opts.alive ?? true,
    genome: constantGenome({}, { size: opts.size ?? 1, visionRange: opts.visionRange ?? 100, visionAngle: opts.visionAngle ?? Math.PI / 2 }),
  });
}

function organismCtx(snapshot: OrganismRuntimeState[], sizeBounds = SIZE_BOUNDS): OrganismSensingContext {
  return { snapshot, sizeBounds };
}

function ctx(snapshot: OrganismRuntimeState[], food: { id: number; x: number; y: number }[] = []): SenseContext {
  return { world, food, energyCapacity: 100, organisms: organismCtx(snapshot) };
}

/** The four organism inputs of `self` against `others` (self included in the snapshot, as in stepWorld). */
function sense4(self: OrganismRuntimeState, others: OrganismRuntimeState[]): number[] {
  return senseNearestOrganism(self, organismCtx([self, ...others]));
}

const isExactZeros = (v: readonly number[]) => v.length === 4 && v.every((x) => Object.is(x, 0));

describe('0A.3.0 target selection', () => {
  it('(1) self is never selected — not even at zero distance with full-circle vision', () => {
    const self = org(1, 100, 100, { visionAngle: 2 * Math.PI });
    expect(findNearestVisibleOrganism(self, [self])).toBeNull();
    expect(isExactZeros(sense4(self, []))).toBe(true);
    // a DIFFERENT organism at the very same point is a candidate
    const twin = org(2, 100, 100);
    expect(findNearestVisibleOrganism(self, [self, twin])!.target.id).toBe(2);
  });

  it('(2) dead organisms are not candidates', () => {
    const self = org(1, 100, 100);
    const deadNear = org(2, 110, 100, { alive: false });
    const aliveFar = org(3, 150, 100);
    expect(findNearestVisibleOrganism(self, [self, deadNear, aliveFar])!.target.id).toBe(3);
    expect(isExactZeros(sense4(self, [deadNear]))).toBe(true);
  });

  it('(3) an organism outside visionRange is not visible', () => {
    const self = org(1, 100, 100, { visionRange: 40 });
    expect(isExactZeros(sense4(self, [org(2, 140.000001, 100)]))).toBe(true);
    expect(isExactZeros(sense4(self, [org(2, 100 + 40 * Math.cos(0.3) + 0.01, 100 + 40 * Math.sin(0.3))]))).toBe(true);
  });

  it('(4) an organism exactly on the range boundary is visible (inclusive)', () => {
    const self = org(1, 100, 100, { visionRange: 40 });
    const onBoundary = org(2, 140, 100); // distance exactly 40
    expect(Math.hypot(40, 0)).toBe(40);
    const v = sense4(self, [onBoundary]);
    expect(v[0]).toBe(1);
    expect(v[1]).toBe(1); // 40 / 40
  });

  it('(5) an organism outside the vision cone is not visible', () => {
    const self = org(1, 100, 100, { visionAngle: Math.PI / 2 }); // ±45°
    const a = Math.PI / 4 + 0.01;
    expect(isExactZeros(sense4(self, [org(2, 100 + 20 * Math.cos(a), 100 + 20 * Math.sin(a))]))).toBe(true);
    expect(isExactZeros(sense4(self, [org(2, 100 + 20 * Math.cos(-a), 100 + 20 * Math.sin(-a))]))).toBe(true);
    expect(isExactZeros(sense4(self, [org(2, 80, 100)]))).toBe(true); // directly behind
  });

  it('(6) an organism exactly on the angular boundary is visible (inclusive), on both sides', () => {
    const self = org(1, 100, 100, { visionAngle: Math.PI / 2 }); // half-angle exactly π/4
    // (10, 10) and (10, -10) are at exactly ±π/4 of heading 0
    expect(Math.atan2(10, 10)).toBe(Math.PI / 4);
    expect(Math.atan2(-10, 10)).toBe(-Math.PI / 4);
    const right = sense4(self, [org(2, 110, 110)]);
    const left = sense4(self, [org(2, 110, 90)]);
    expect(right[0]).toBe(1);
    expect(left[0]).toBe(1);
    expect(right[2]).toBe(0.25); // +π/4 / π
    expect(left[2]).toBe(-0.25);
  });

  it('(7) the nearest visible organism wins; nearer but invisible ones are ignored', () => {
    const self = org(1, 100, 100, { visionRange: 100, visionAngle: Math.PI / 2 });
    const behindButClosest = org(2, 95, 100); // distance 5, behind
    const aheadFar = org(3, 160, 100); // distance 60
    const aheadNear = org(4, 130, 100); // distance 30 — the target
    const farOutOfRange = org(5, 250, 100);
    const t = findNearestVisibleOrganism(self, [self, behindButClosest, aheadFar, aheadNear, farOutOfRange])!;
    expect(t.target.id).toBe(4);
    expect(t.dist).toBe(30);
  });

  it('(8) an exact-distance tie goes to the ascending organism id, independent of array order', () => {
    const self = org(1, 100, 100, { visionRange: 100, visionAngle: Math.PI });
    const a = org(9, 120, 100, { size: 1.4 }); // distance 20, straight ahead
    const b = org(4, 100, 120, { size: 0.6 }); // distance 20, 90° right
    for (const order of [[self, a, b], [b, a, self], [a, self, b]]) {
      expect(findNearestVisibleOrganism(self, order)!.target.id).toBe(4);
    }
    const v = sense4(self, [a, b]);
    expect(v[2]).toBe(0.5); // id 4 is at +90°
    expect(v[3]).toBeCloseTo(-0.4, 12); // and smaller — its size, not id 9's
  });

  it('(9) an exact zero-distance target is visible regardless of the cone: distance 0, angle 0', () => {
    // a very narrow cone pointing away from nothing in particular
    const self = org(1, 100, 100, { heading: 2.2, visionAngle: 0.01, size: 1.0 });
    const sameSpot = org(2, 100, 100, { size: 1.25 });
    const v = sense4(self, [sameSpot]);
    expect(v).toEqual([1, 0, 0, 0.25]);
    expect(Object.is(v[2], 0)).toBe(true);
  });

  it('(10) nothing visible → exactly [0, 0, 0, 0]', () => {
    const self = org(1, 100, 100);
    expect(isExactZeros(sense4(self, []))).toBe(true);
    expect(isExactZeros(sense4(self, [org(2, 400, 400), org(3, 60, 100), org(4, 100, 100, { alive: false })]))).toBe(true);
    const full = senseOrganism(self, ctx([self, org(2, 400, 400)]));
    expect(full.length).toBe(10);
    expect(isExactZeros(full.slice(6))).toBe(true);
  });
});

describe('0A.3.0 input normalization', () => {
  it('(11) organismDistance = distance / visionRange exactly, clamped to [0, 1]', () => {
    const self = org(1, 100, 100, { visionRange: 120, visionAngle: Math.PI });
    expect(sense4(self, [org(2, 130, 100)])[1]).toBe(0.25);
    expect(sense4(self, [org(2, 118, 124)])[1]).toBe(0.25); // hypot(18, 24) = 30
    expect(sense4(self, [org(2, 160, 100)])[1]).toBe(0.5);
    expect(sense4(self, [org(2, 220, 100)])[1]).toBe(1); // on the boundary
    expect(sense4(self, [org(2, 100, 100)])[1]).toBe(0);
  });

  it('(12) organismAngle uses the food bearing convention: positive = clockwise/right, negative = left, wrapped by π', () => {
    const cases: Array<{ heading: number; dx: number; dy: number }> = [
      { heading: 0, dx: 20, dy: 10 }, // right of +x heading (y down)
      { heading: 0, dx: 20, dy: -10 }, // left
      { heading: Math.PI / 2, dx: -10, dy: 20 }, // heading +y: -x is to the right
      { heading: Math.PI / 2, dx: 10, dy: 20 }, // +x is to the left
      { heading: Math.PI - 0.05, dx: -20, dy: 1 }, // near the ±π wrap
      { heading: 6.2, dx: 20, dy: 3 }, // heading just below 2π
    ];
    for (const { heading, dx, dy } of cases) {
      const self = org(1, 200, 200, { heading, visionAngle: Math.PI, visionRange: 100 });
      const other = org(2, 200 + dx, 200 + dy);
      const food = [{ id: 1, x: 200 + dx, y: 200 + dy }];
      const input = senseOrganism(self, ctx([self, other], food));
      expect(input[6]).toBe(1);
      expect(input[0]).toBe(1);
      // identical number to the food bearing computed for the same point
      expect(input[8]).toBe(input[2]);
    }
    const self = org(1, 200, 200, { heading: 0, visionAngle: Math.PI, visionRange: 100 });
    expect(sense4(self, [org(2, 220, 210)])[2]).toBeGreaterThan(0);
    expect(sense4(self, [org(2, 220, 190)])[2]).toBeLessThan(0);
    expect(sense4(self, [org(2, 220, 200)])[2]).toBe(0);
  });

  it('(13) organismRelativeSize = (target.size − self.size) / (sizeMax − sizeMin), clamped to [−1, 1]', () => {
    const self = org(1, 100, 100, { size: 1.0 });
    expect(sense4(self, [org(2, 120, 100, { size: 0.75 })])[3]).toBe(-0.25); // smaller → negative
    expect(sense4(self, [org(2, 120, 100, { size: 1.0 })])[3]).toBe(0); // equal
    expect(sense4(self, [org(2, 120, 100, { size: 1.5 })])[3]).toBe(0.5); // larger → positive
    const tiny = org(1, 100, 100, { size: 0.5 });
    expect(sense4(tiny, [org(2, 120, 100, { size: 1.5 })])[3]).toBe(1); // the full span
    const huge = org(1, 100, 100, { size: 1.5 });
    expect(sense4(huge, [org(2, 120, 100, { size: 0.5 })])[3]).toBe(-1);
    // clamped when the sizes exceed the bounds' span
    const narrow = { min: 0.9, max: 1.1 };
    expect(senseNearestOrganism(tiny, organismCtx([tiny, org(2, 120, 100, { size: 1.5 })], narrow))[3]).toBe(1);
    expect(senseNearestOrganism(huge, organismCtx([huge, org(2, 120, 100, { size: 0.5 })], narrow))[3]).toBe(-1);
    // a degenerate zero-width range can only hold equal sizes
    expect(senseNearestOrganism(self, organismCtx([self, org(2, 120, 100)], { min: 1, max: 1 }))[3]).toBe(0);
  });

  it('(13) the Sense context takes its size bounds from the authoritative bootstrap.geneBounds.size', () => {
    const c = organismSensingModelConfig();
    c.bootstrap.geneBounds.size = { min: 0.25, max: 2.25 };
    const w = bootstrapWorld(c);
    const sc = senseContextFor(w, c);
    expect(sc.organisms!.sizeBounds).toEqual({ min: 0.25, max: 2.25 });
    expect(sc.organisms!.snapshot).toBe(w.organisms); // S_t itself
  });

  it('(14) the first six 0A.3.0 inputs are exactly the v1 inputs, whatever organisms are around', () => {
    const food = [{ id: 1, x: 130, y: 95 }, { id: 2, x: 60, y: 60 }];
    const selves = [org(1, 100, 100), org(1, 3, 480, { heading: 4 }), org(1, 250, 250, { heading: 1, visionAngle: 2.5 })];
    const crowd = [org(2, 105, 100), org(3, 130, 95, { size: 1.4 }), org(4, 250, 260), org(5, 10, 470)];
    for (const self of selves) {
      const v1: SenseContext = { world, food, energyCapacity: 100 };
      const v1Input = senseOrganism(self, v1);
      expect(v1Input.length).toBe(6);
      for (const others of [[], crowd]) {
        const v3Input = senseOrganism(self, ctx([self, ...others], food));
        expect(v3Input.length).toBe(10);
        expect(v3Input.slice(0, 6)).toEqual(v1Input);
      }
    }
  });
});

describe('0A.3.0 sensing is a pure read of the pre-decision snapshot', () => {
  it('(21) sensing consumes no RNG, calls no Math.random, and mutates neither the snapshot nor the world', () => {
    const c = organismSensingModelConfig();
    c.rootSeed = 20260910;
    let w = bootstrapWorld(c);
    for (let i = 0; i < 300; i++) w = stepWorld(w, c).world;
    const before = canonicalStateString(w);
    const random = vi.spyOn(Math, 'random');
    try {
      const sc = senseContextFor(w, c);
      const vectors = w.organisms.map((o) => senseOrganism(o, sc));
      expect(vectors.every((v) => v.length === 10 && v.every(Number.isFinite))).toBe(true);
      expect(vectors.some((v) => v[6] === 1)).toBe(true); // organisms do see one another in a real world
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
    expect(canonicalStateString(w)).toBe(before); // RNG words included
  });

  it('(21) the sensed vectors do not depend on the order of the snapshot array', () => {
    const c = organismSensingModelConfig();
    c.rootSeed = 7;
    let w = bootstrapWorld(c);
    for (let i = 0; i < 200; i++) w = stepWorld(w, c).world;
    const sc = senseContextFor(w, c);
    const reversed: SenseContext = { ...sc, organisms: { ...sc.organisms!, snapshot: [...w.organisms].reverse() } };
    for (const o of w.organisms) expect(senseOrganism(o, reversed)).toEqual(senseOrganism(o, sc));
    // and a whole tick with a reversed organism array reaches the same canonical state
    const flipped = { ...w, organisms: [...w.organisms].reverse() };
    expect(canonicalStateString(stepWorld(flipped, c).world)).toBe(canonicalStateString(stepWorld(w, c).world));
  });

  it('the v1 models get no organism context at all — their Sense phase is the six-input vector', () => {
    const c = { ...DEFAULT_SIMULATION_CONFIG, rootSeed: 3 };
    const w = bootstrapWorld(c);
    const sc = senseContextFor(w, c);
    expect(sc.organisms).toBeUndefined();
    expect(senseOrganism(w.organisms[0]!, sc).length).toBe(6);
  });
});
