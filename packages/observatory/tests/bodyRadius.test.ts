/**
 * V2.3 — the drawn body is the body that collides.
 *
 * The Observatory never imports simulation types (it owns its wire protocol),
 * so it keeps its own copy of the size → radius mapping. This test pins that
 * copy to the simulation's authoritative contract for model `0A.5.0`:
 *
 *     radius = radiusBase + radiusPerSize * size,  radiusBase 2.0, radiusPerSize 2.2
 *
 * (`physicalRadiusFromSize` / `DEFAULT_PHYSICAL_BODY_CONFIG` in
 * `simulation-core/src/biology/physicalBody.ts`). If the simulation contract
 * ever changes, this test must be updated deliberately — the renderer must
 * never drift away from what physically collides.
 *
 * Nothing else about the UI changes: no push indicator, force arrow, contact
 * counter or physics debug view exists, and the frontend stays read-only.
 */
import { describe, expect, it } from 'vitest';
import { BODY_RADIUS_BASE, BODY_RADIUS_PER_SIZE, bodyRadius } from '../src/render/WorldRenderer.js';

/** The simulation's DEFAULT_PHYSICAL_BODY_CONFIG, restated here as the pinned contract. */
const SIMULATION_BODY_CONTRACT = { radiusBase: 2.0, radiusPerSize: 2.2 };

describe('drawn body radius mirrors the simulation physical-radius contract', () => {
  it('uses exactly the simulation constants', () => {
    expect(BODY_RADIUS_BASE).toBe(SIMULATION_BODY_CONTRACT.radiusBase);
    expect(BODY_RADIUS_PER_SIZE).toBe(SIMULATION_BODY_CONTRACT.radiusPerSize);
  });

  it('agrees with the simulation formula across the whole §10.4 size range', () => {
    for (let size = 0.5; size <= 1.5001; size += 0.05) {
      expect(bodyRadius(size)).toBe(SIMULATION_BODY_CONTRACT.radiusBase + SIMULATION_BODY_CONTRACT.radiusPerSize * size);
    }
    // the mapping is unchanged from Phase 0D slice 1, so no world looks different
    expect(bodyRadius(0.5)).toBeCloseTo(3.1, 12);
    expect(bodyRadius(1.0)).toBeCloseTo(4.2, 12);
    expect(bodyRadius(1.5)).toBeCloseTo(5.3, 12);
  });

  it('is strictly increasing in size, like the physical radius', () => {
    let previous = -Infinity;
    for (let size = 0.5; size <= 1.5001; size += 0.01) {
      const r = bodyRadius(size);
      expect(r).toBeGreaterThan(previous);
      previous = r;
    }
  });
});
