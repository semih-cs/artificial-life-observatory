import { describe, it, expect } from 'vitest';
import { senseOrganism, SenseContext } from '../src/perception/sense.js';
import { OrganismRuntimeState } from '../src/organism/types.js';
import { Genome } from '../src/genome/types.js';

function makeGenome(overrides: Partial<Genome['morphology']> = {}): Genome {
  return {
    morphology: {
      size: 1,
      maxSpeed: 1,
      visionRange: 20,
      visionAngle: Math.PI / 2, // 90 degrees total, +-45deg
      metabolism: 1,
      ...overrides,
    },
    neural: {
      inputHiddenWeights: new Array(6 * 4).fill(0),
      hiddenBiases: new Array(4).fill(0),
      hiddenOutputWeights: new Array(4 * 4).fill(0),
      outputBiases: new Array(4).fill(0),
    },
  };
}

function makeOrganism(x: number, y: number, heading: number, energy = 50, genome = makeGenome()): OrganismRuntimeState {
  return {
    id: 1,
    genome,
    parentId: null,
    generationDepth: 0,
    lineageRootId: 1,
    birthTick: 0,
    x,
    y,
    heading,
    energy,
    age: 0,
    alive: true,
    deathCause: null,
    deathTick: null,
  };
}

const world = { width: 100, height: 100 };

describe('senseOrganism edge cases (§11.58)', () => {
  it('no food visible -> foodVisible=0, foodDistance=0, foodAngle=0', () => {
    const o = makeOrganism(50, 50, 0);
    const ctx: SenseContext = { world, food: [], energyCapacity: 100 };
    const input = senseOrganism(o, ctx);
    expect(input[0]).toBe(0);
    expect(input[1]).toBe(0);
    expect(input[2]).toBe(0);
  });

  it('food directly ahead is visible with foodAngle ~ 0', () => {
    const o = makeOrganism(50, 50, 0); // heading along +x
    const ctx: SenseContext = { world, food: [{ id: 1, x: 55, y: 50 }], energyCapacity: 100 };
    const input = senseOrganism(o, ctx);
    expect(input[0]).toBe(1);
    expect(input[2]).toBeCloseTo(0, 5);
  });

  it('equal-distance food ties broken by ascending food id', () => {
    const o = makeOrganism(50, 50, 0);
    const ctx: SenseContext = {
      world,
      food: [
        { id: 5, x: 55, y: 50 }, // dist 5, straight ahead
        { id: 2, x: 50, y: 55 }, // dist 5, but outside +-45deg vision (90deg away) -> not visible
      ],
      energyCapacity: 100,
    };
    const input = senseOrganism(o, ctx);
    // only food id 5 is within the vision cone; id 2 is out of view
    expect(input[0]).toBe(1);
    expect(input[2]).toBeCloseTo(0, 5);
  });

  it('true equal-distance, both-visible tie is broken by ascending id', () => {
    const wideGenome = makeGenome({ visionAngle: 2 * Math.PI }); // full circle, everything visible
    const o = makeOrganism(50, 50, 0, 50, wideGenome);
    const ctx: SenseContext = {
      world,
      food: [
        { id: 9, x: 55, y: 50 }, // dist 5, angle 0
        { id: 1, x: 50, y: 55 }, // dist 5, angle 90deg (not tied on distance being picked first... both dist=5)
      ],
      energyCapacity: 100,
    };
    const input = senseOrganism(o, ctx);
    // both are exactly distance 5; lower id (1) should win the tie
    expect(input[0]).toBe(1);
    // angle to food id=1 (50,55) relative to heading 0 is +90deg -> normalized +0.5 (90/180)
    expect(input[2]).toBeCloseTo(0.5, 5);
  });

  it('field-of-view boundary is inclusive', () => {
    const o = makeOrganism(50, 50, 0); // visionAngle = 90deg total => +-45deg
    // food at exactly +45 degrees, distance 10
    const angle = Math.PI / 4;
    const fx = 50 + 10 * Math.cos(angle);
    const fy = 50 + 10 * Math.sin(angle);
    const ctx: SenseContext = { world, food: [{ id: 1, x: fx, y: fy }], energyCapacity: 100 };
    const input = senseOrganism(o, ctx);
    expect(input[0]).toBe(1); // inclusive boundary -> visible
  });

  it('just outside field-of-view boundary is not visible', () => {
    const o = makeOrganism(50, 50, 0);
    const angle = Math.PI / 4 + 0.01; // just past +45deg
    const fx = 50 + 10 * Math.cos(angle);
    const fy = 50 + 10 * Math.sin(angle);
    const ctx: SenseContext = { world, food: [{ id: 1, x: fx, y: fy }], energyCapacity: 100 };
    const input = senseOrganism(o, ctx);
    expect(input[0]).toBe(0);
  });

  it('angular wrapping: heading near PI, food behind wraps correctly', () => {
    const o = makeOrganism(50, 50, Math.PI - 0.05); // heading near -x direction, slightly off
    const ctx: SenseContext = { world, food: [{ id: 1, x: 40, y: 50 }], energyCapacity: 100 }; // to the left (-x), close to heading
    const input = senseOrganism(o, ctx);
    expect(input[0]).toBe(1);
    expect(Math.abs(input[2] as number)).toBeLessThan(0.1);
  });

  it('zero-distance food: foodVisible=1, foodDistance=0, foodAngle=0 by convention', () => {
    const o = makeOrganism(50, 50, 1.23);
    const ctx: SenseContext = { world, food: [{ id: 1, x: 50, y: 50 }], energyCapacity: 100 };
    const input = senseOrganism(o, ctx);
    expect(input[0]).toBe(1);
    expect(input[1]).toBe(0);
    expect(input[2]).toBe(0);
  });

  it('wall contact: boundaryDistance=0, boundaryAngle=0 by convention', () => {
    const o = makeOrganism(0, 50, 0.7); // exactly on the left wall
    const ctx: SenseContext = { world, food: [], energyCapacity: 100 };
    const input = senseOrganism(o, ctx);
    expect(input[3]).toBe(0);
    expect(input[4]).toBe(0);
  });

  it('corner tie-break uses fixed edge priority: top, right, bottom, left', () => {
    // exact corner (0,0): distance to top (y=0) and left (x=0) are both 0
    const o = makeOrganism(0, 0, 0);
    const ctx: SenseContext = { world, food: [], energyCapacity: 100 };
    const input = senseOrganism(o, ctx);
    // both are 0 distance either way -> boundaryDistance 0, boundaryAngle 0 (degenerate, fine)
    expect(input[3]).toBe(0);

    // a non-degenerate corner-adjacent tie: equidistant from left and top edges but not AT distance 0
    const o2 = makeOrganism(5, 5, 0);
    const world2 = { width: 100, height: 100 };
    const ctx2: SenseContext = { world: world2, food: [], energyCapacity: 100 };
    const input2 = senseOrganism(o2, ctx2);
    // distance to top=5, left=5 tie -> top wins by priority -> boundary point is (5,0) -> angle is -90deg (up, i.e. -y)
    // normalized angle for direction (0,-5) relative to heading 0: atan2(-5,0) = -PI/2 -> normalized -0.5
    expect(input2[4]).toBeCloseTo(-0.5, 5);
  });

  it('phenotype-dependent vision range limits what is visible', () => {
    const shortSight = makeGenome({ visionRange: 3 });
    const o = makeOrganism(50, 50, 0, 50, shortSight);
    const ctx: SenseContext = { world, food: [{ id: 1, x: 60, y: 50 }], energyCapacity: 100 }; // dist 10 > visionRange 3
    const input = senseOrganism(o, ctx);
    expect(input[0]).toBe(0);
  });

  it('normalizedEnergy reflects energy/energyCapacity, clamped to [0,1]', () => {
    const o = makeOrganism(50, 50, 0, 250); // energy above capacity
    const ctx: SenseContext = { world, food: [], energyCapacity: 100 };
    const input = senseOrganism(o, ctx);
    expect(input[5]).toBe(1);
  });

  it('produces exactly six inputs, each finite', () => {
    const o = makeOrganism(50, 50, 0.4);
    const ctx: SenseContext = { world, food: [{ id: 1, x: 60, y: 60 }], energyCapacity: 100 };
    const input = senseOrganism(o, ctx);
    expect(input.length).toBe(6);
    for (const v of input) expect(Number.isFinite(v)).toBe(true);
  });
});
