/**
 * V2.6 — `0A.8.0` persistence.
 *
 * The point of these cases: `0A.8.0` REUSES snapshot format v3. Its
 * future-affecting state shape is `0A.6.0`'s exactly — recurrent memory,
 * recurrent weights, per-food handling state, and NO lifetime-plasticity state
 * — because the V2.6 change is an initialization rule, and an initialization
 * rule is not stored state. A newer model version does not earn a newer format;
 * a different stored SHAPE does. `0A.7.0` keeps v4 and relabelling stays
 * refused in both directions.
 */
import { describe, expect, it } from 'vitest';
import {
  bootstrapWorld, canonicalStateHash, foodHandlingModelConfig, lifetimePlasticityModelConfig,
  regulatedRecurrentInitModelConfig, stepWorld,
} from '@alo/simulation-core';
import type { SimulationConfig, WorldState } from '@alo/simulation-core';
import {
  computeSnapshotChecksum, configHash, createSnapshot, FOOD_HANDLING_SNAPSHOT_FORMAT_VERSION,
  parseSnapshot, restoreSnapshot, serializeSnapshot, snapshotFormatVersionFor, SnapshotError,
  SUPPORTED_SIMULATION_VERSIONS, SUPPORTED_SNAPSHOT_FORMAT_VERSIONS, validateSnapshot,
} from '../src/index.js';

const config = (seed = 8) => { const c = regulatedRecurrentInitModelConfig(); c.rootSeed = seed; return c; };
const runTo = (start: WorldState, c: SimulationConfig, tick: number) => {
  let w = start; while (w.tick < tick) w = stepWorld(w, c).world; return w;
};
function reseal(snapshot: unknown, mutate: (copy: any) => void): any {
  const copy = JSON.parse(JSON.stringify(snapshot)); mutate(copy);
  copy.configHash = configHash(copy.config); copy.checksum = computeSnapshotChecksum(copy); return copy;
}
const codeIs = (code: string) => expect.objectContaining<Partial<SnapshotError>>({ code });

describe('V2.6 snapshot format: 0A.8.0 reuses v3', () => {
  it('(30, 31, 32) 0A.8.0 is v3, 0A.6.0 is still v3 and 0A.7.0 is still v4 — the number describes shape, not chronology', () => {
    expect(SUPPORTED_SNAPSHOT_FORMAT_VERSIONS).toEqual([1, 2, 3, 4]);
    expect(FOOD_HANDLING_SNAPSHOT_FORMAT_VERSION).toBe(3);
    expect(['0A.1.0', '0A.2.0', '0A.3.0', '0A.4.0', '0A.5.0', '0A.6.0', '0A.7.0', '0A.8.0'].map(snapshotFormatVersionFor))
      .toEqual([1, 1, 1, 2, 2, 3, 4, 3]);
    expect(SUPPORTED_SIMULATION_VERSIONS).toContain('0A.8.0');

    const c = config();
    const snapshot = createSnapshot(runTo(bootstrapWorld(c), c, 20), c);
    expect(snapshot.snapshotFormatVersion).toBe(3);
    expect(snapshot.simulationVersion).toBe('0A.8.0');
  });

  it('(34) a valid 0A.8.0 snapshot carries memory and handling state but no plastic state at all', () => {
    const c = config();
    const snapshot = createSnapshot(runTo(bootstrapWorld(c), c, 40), c);
    const state = snapshot.state as any;
    for (const o of state.organisms) {
      expect(o.hiddenState).toHaveLength(8);
      expect(o.genome.neural.recurrentHiddenWeights).toHaveLength(64);
      for (const key of ['hiddenOutputWeightOffsets', 'outputBiasOffsets', 'hiddenOutputEligibilityTraces', 'outputBiasEligibilityTraces']) {
        expect(key in o).toBe(false);
      }
    }
    for (const f of state.food) {
      expect('holderId' in f).toBe(true);
      expect('handlingProgress' in f).toBe(true);
    }
    const text = serializeSnapshot(snapshot);
    expect(text).not.toContain('EligibilityTraces');
    expect(text).not.toContain('Offsets');
    // The stored config carries the initialization sigma (it is configuration),
    // and nothing in the world STATE does.
    expect((snapshot.config as any).neural.recurrentInitSigma).toBe(0.8 / Math.sqrt(8));
    expect(JSON.stringify(state)).not.toContain('recurrentInitSigma');

    // Plastic state added to a 0A.8.0 record is refused, exactly as for 0A.6.0.
    expect(() => validateSnapshot(reseal(snapshot, (o) => {
      o.state.organisms[0].outputBiasOffsets = [0, 0, 0, 0];
    }))).toThrow(codeIs('MALFORMED_WORLD_STATE'));
  });

  it('(33) cross-model relabelling is refused in both directions', () => {
    const c = config();
    const snapshot = createSnapshot(runTo(bootstrapWorld(c), c, 5), c);

    // 0A.8.0 cannot be relabelled as a different format...
    expect(() => validateSnapshot(reseal(snapshot, (o) => { o.snapshotFormatVersion = 4; }))).toThrow(codeIs('UNSUPPORTED_FORMAT_VERSION'));
    expect(() => validateSnapshot(reseal(snapshot, (o) => { o.snapshotFormatVersion = 2; }))).toThrow(codeIs('UNSUPPORTED_FORMAT_VERSION'));

    // ...nor as 0A.6.0, even though both are v3: the stored config would then
    // carry a recurrentInitSigma that 0A.6.0 must not have.
    expect(() => validateSnapshot(reseal(snapshot, (o) => {
      o.simulationVersion = o.config.simulationVersion = o.state.simulationVersion = '0A.6.0';
    }))).toThrow(codeIs('INVALID_CONFIG'));

    // ...nor as 0A.7.0, which needs v4 and plastic state.
    expect(() => validateSnapshot(reseal(snapshot, (o) => {
      o.simulationVersion = o.config.simulationVersion = o.state.simulationVersion = '0A.7.0';
    }))).toThrow(codeIs('UNSUPPORTED_FORMAT_VERSION'));

    // And a 0A.6.0 snapshot cannot become 0A.8.0 by renaming.
    const c6 = foodHandlingModelConfig(); c6.rootSeed = 8;
    const s6 = createSnapshot(runTo(bootstrapWorld(c6), c6, 5), c6);
    expect(() => validateSnapshot(reseal(s6, (o) => {
      o.simulationVersion = o.config.simulationVersion = o.state.simulationVersion = '0A.8.0';
    }))).toThrow(codeIs('INVALID_CONFIG'));

    // A 0A.7.0 snapshot still requires its v4 plastic state.
    const c7 = lifetimePlasticityModelConfig(); c7.rootSeed = 8;
    const s7 = createSnapshot(runTo(bootstrapWorld(c7), c7, 5), c7);
    expect(s7.snapshotFormatVersion).toBe(4);
    expect(() => validateSnapshot(reseal(s7, (o) => { o.snapshotFormatVersion = 3; }))).toThrow(codeIs('UNSUPPORTED_FORMAT_VERSION'));
  });

  it('(35, 36) save → serialize → load → restore → resume is exact, including mid-handling', () => {
    const c = config();
    const boundary = runTo(bootstrapWorld(c), c, 300);
    const restored = restoreSnapshot(parseSnapshot(serializeSnapshot(createSnapshot(boundary, c))));
    expect(restored.config).toEqual(c);
    expect(canonicalStateHash(restored.world)).toBe(canonicalStateHash(boundary));

    const continuous = runTo(boundary, c, 800);
    const resumed = runTo(restored.world, restored.config, 800);
    expect(canonicalStateHash(resumed)).toBe(canonicalStateHash(continuous));

    // Every active handling progress resumes exactly.
    let world = bootstrapWorld(c);
    const seen = new Map<number, WorldState>();
    while (world.tick < 2_000 && seen.size < 4) {
      for (const food of world.food) {
        if (food.holderId !== null && food.holderId !== undefined && food.handlingProgress !== undefined) {
          seen.set(food.handlingProgress, seen.get(food.handlingProgress) ?? world);
        }
      }
      world = stepWorld(world, c).world;
    }
    expect([...seen.keys()].sort()).toEqual([1, 2, 3, 4]);
    for (const at of seen.values()) {
      const back = restoreSnapshot(parseSnapshot(serializeSnapshot(createSnapshot(at, c))));
      expect(canonicalStateHash(stepWorld(back.world, back.config).world))
        .toBe(canonicalStateHash(stepWorld(at, c).world));
    }
  }, 60_000);
});
