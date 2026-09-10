import { describe, it, expect } from 'vitest';
import { resolveMovement, movementEnergyCost } from '../src/biology/movement.js';
import { basalEnergyCost } from '../src/biology/energy.js';
import { stepWorld } from '../src/world/stepWorld.js';
import { ActionIntent } from '../src/actions/types.js';
import { constantGenome, makeOrganism, makeWorld, testConfig, findOrganism } from './helpers.js';

const world = { width: 100, height: 100 };

function intent(forward: number, turn = 0): ActionIntent {
  return { organismId: 1, requestedForwardSpeed: forward, requestedTurnRate: turn, eatRequested: false, reproduceRequested: false };
}

describe('movement resolution (§20.72 phase 4)', () => {
  it('keeps organisms inside the world bounds', () => {
    const o = makeOrganism({ id: 1, genome: constantGenome({}), x: 99, y: 50, heading: 0 });
    resolveMovement(o, intent(50), world);
    expect(o.x).toBeLessThanOrEqual(world.width);
    expect(o.x).toBeGreaterThanOrEqual(0);

    const o2 = makeOrganism({ id: 2, genome: constantGenome({}), x: 1, y: 1, heading: Math.PI });
    resolveMovement(o2, intent(50), world);
    expect(o2.x).toBeGreaterThanOrEqual(0);
    expect(o2.y).toBeGreaterThanOrEqual(0);
  });

  it('requested forward speed is capped by the maxSpeed phenotype gene', () => {
    // decide.ts scales clamp(output,0,1) by maxSpeed, so requested speed can
    // never exceed maxSpeed; the resolved displacement is bounded by it too.
    const config = testConfig();
    const o = makeOrganism({
      id: 1,
      genome: constantGenome({ forward: 0.999, turn: 0 }, { maxSpeed: 1.5 }),
      x: 50,
      y: 50,
      heading: 0,
      energy: 90,
    });
    const w = makeWorld({ config, organisms: [o] });
    const after = stepWorld(w, config).world;
    const moved = findOrganism(after, 1)!;
    expect(Math.hypot(moved.x - 50, moved.y - 50)).toBeLessThanOrEqual(1.5 + 1e-9);
  });

  it('returns the ACTUAL resolved displacement, not the requested speed', () => {
    const o = makeOrganism({ id: 1, genome: constantGenome({}), x: 50, y: 50, heading: 0 });
    const actual = resolveMovement(o, intent(2), world);
    expect(actual).toBeCloseTo(2, 9);
  });

  it('wall-blocked movement reports the actual (reduced) displacement', () => {
    const o = makeOrganism({ id: 1, genome: constantGenome({}), x: 99.5, y: 50, heading: 0 });
    const actual = resolveMovement(o, intent(2), world); // only 0.5 units of room
    expect(actual).toBeCloseTo(0.5, 9);
    expect(o.x).toBe(100);
  });

  it('movement fully blocked by a wall yields zero displacement', () => {
    const o = makeOrganism({ id: 1, genome: constantGenome({}), x: 100, y: 50, heading: 0 });
    const actual = resolveMovement(o, intent(5), world);
    expect(actual).toBe(0);
  });
});

describe('movement energy cost (§12.7-§12.9, §20.72 phase 5)', () => {
  const coeff = 0.06;

  it('zero movement -> zero movement cost', () => {
    expect(movementEnergyCost(0, 1, coeff)).toBe(0);
    expect(movementEnergyCost(0, 1.5, coeff)).toBe(0);
  });

  it('doubling velocity quadruples the movement cost (velocity-squared term)', () => {
    const c1 = movementEnergyCost(1, 1, coeff);
    const c2 = movementEnergyCost(2, 1, coeff);
    expect(c2 / c1).toBeCloseTo(4, 9);
    const c4 = movementEnergyCost(4, 1, coeff);
    expect(c4 / c2).toBeCloseTo(4, 9);
  });

  it('larger size increases movement cost at the same velocity', () => {
    const small = movementEnergyCost(1, 0.5, coeff);
    const large = movementEnergyCost(1, 1.5, coeff);
    expect(large).toBeGreaterThan(small);
    expect(large / small).toBeCloseTo(3, 9);
  });

  it('matches movementCoefficient * size * velocity^2 exactly', () => {
    expect(movementEnergyCost(1.3, 0.8, coeff)).toBeCloseTo(coeff * 0.8 * 1.3 * 1.3, 12);
  });

  it('wall-blocked movement is charged for actual, not requested, movement', () => {
    const config = testConfig();
    config.world.width = 100;
    config.world.height = 100;

    // Two identical organisms with an identical full-throttle controller.
    // One sits against the right wall facing into it; the other has open room.
    const genome = constantGenome({ forward: 0.999, turn: 0 }, { maxSpeed: 2, size: 1, metabolism: 1 });
    const blocked = makeOrganism({ id: 1, genome, x: 100, y: 50, heading: 0, energy: 90 });
    const free = makeOrganism({ id: 2, genome, x: 50, y: 50, heading: 0, energy: 90 });

    const w = makeWorld({ config, organisms: [blocked, free] });
    const after = stepWorld(w, config).world;

    const a = findOrganism(after, 1)!;
    const b = findOrganism(after, 2)!;

    const basal = basalEnergyCost(1, config.energy.baseMetabolicConstant);
    // The blocked organism moved nowhere, so it pays basal metabolism only.
    expect(90 - a.energy).toBeCloseTo(basal, 9);
    // The free organism moved and paid strictly more.
    expect(90 - b.energy).toBeGreaterThan(basal);
  });

  it('basal metabolism is a separate charge from movement cost', () => {
    // Basal depends on metabolism and is independent of velocity and size.
    expect(basalEnergyCost(1.5, 0.02)).toBeCloseTo(0.03, 12);
    expect(basalEnergyCost(0.5, 0.02)).toBeCloseTo(0.01, 12);
    // A motionless organism still pays basal, but zero movement cost.
    const config = testConfig();
    const o = makeOrganism({
      id: 1,
      genome: constantGenome({ forward: 0.0000001, turn: 0 }, { metabolism: 1 }),
      x: 50,
      y: 50,
      energy: 90,
    });
    const after = stepWorld(makeWorld({ config, organisms: [o] }), config).world;
    const moved = findOrganism(after, 1)!;
    const basal = basalEnergyCost(1, config.energy.baseMetabolicConstant);
    expect(90 - moved.energy).toBeGreaterThan(basal * 0.99);
    expect(90 - moved.energy).toBeLessThan(basal * 1.01);
  });
});
