import { describe, expect, it } from 'vitest';
import {
  bootstrapWorld, canonicalStateHash, lifetimePlasticityModelConfig, stepWorld,
  foodHandlingModelConfig,
} from '@alo/simulation-core';
import type { WorldState } from '@alo/simulation-core';
import {
  computeSnapshotChecksum, configHash, createSnapshot, LIFETIME_PLASTICITY_SNAPSHOT_FORMAT_VERSION,
  parseSnapshot, restoreSnapshot, serializeSnapshot, snapshotFormatVersionFor, SnapshotError,
  SUPPORTED_SNAPSHOT_FORMAT_VERSIONS, validateSnapshot,
} from '../src/index.js';

const config = () => { const c = lifetimePlasticityModelConfig(); c.rootSeed = 8; return c; };
const runTo = (start: WorldState, c: ReturnType<typeof config>, tick: number) => {
  let w = start; while (w.tick < tick) w = stepWorld(w, c).world; return w;
};
function reseal(snapshot: unknown, mutate: (copy: any) => void): any {
  const copy = JSON.parse(JSON.stringify(snapshot)); mutate(copy);
  copy.configHash = configHash(copy.config); copy.checksum = computeSnapshotChecksum(copy); return copy;
}
function expectMalformed(value: unknown): void {
  expect(() => validateSnapshot(value)).toThrow(expect.objectContaining<Partial<SnapshotError>>({ code: 'MALFORMED_WORLD_STATE' }));
}
function expectOneStepResumeExact(world: WorldState, c: ReturnType<typeof config>): void {
  const restored = restoreSnapshot(parseSnapshot(serializeSnapshot(createSnapshot(world, c))));
  expect(canonicalStateHash(stepWorld(restored.world, restored.config).world))
    .toBe(canonicalStateHash(stepWorld(world, c).world));
}
function reinforcementSign(before: WorldState, after: WorldState): -1 | 0 | 1 {
  for (const next of after.organisms) {
    const prior = before.organisms.find((o) => o.id === next.id);
    if (prior === undefined) continue;
    for (let i = 0; i < next.hiddenOutputWeightOffsets!.length; i++) {
      const delta = next.hiddenOutputWeightOffsets![i]! - prior.hiddenOutputWeightOffsets![i]!;
      const trace = next.hiddenOutputEligibilityTraces![i]!;
      const signedEvidence = delta * trace;
      if (signedEvidence > 1e-14) return 1;
      if (signedEvidence < -1e-14) return -1;
    }
  }
  return 0;
}

describe('V2.5 snapshot format v4', () => {
  it('maps exactly v1/v2/v3/v4 and stores complete learned runtime state', () => {
    expect(SUPPORTED_SNAPSHOT_FORMAT_VERSIONS).toEqual([1, 2, 3, 4]);
    expect(LIFETIME_PLASTICITY_SNAPSHOT_FORMAT_VERSION).toBe(4);
    expect(['0A.1.0','0A.2.0','0A.3.0','0A.4.0','0A.5.0','0A.6.0','0A.7.0'].map(snapshotFormatVersionFor)).toEqual([1,1,1,2,2,3,4]);
    const c = config(); const w = runTo(bootstrapWorld(c), c, 20);
    const snapshot = createSnapshot(w, c);
    expect(snapshot.snapshotFormatVersion).toBe(4);
    const o = (snapshot.state as any).organisms[0];
    expect(o.hiddenState).toHaveLength(8);
    expect(o.hiddenOutputWeightOffsets).toHaveLength(32);
    expect(o.outputBiasOffsets).toHaveLength(4);
    expect(o.hiddenOutputEligibilityTraces).toHaveLength(32);
    expect(o.outputBiasEligibilityTraces).toHaveLength(4);
    expect(o.hiddenOutputEligibilityTraces.some((x: number) => x !== 0)).toBe(true);
    expect(o.hiddenOutputWeightOffsets.some((x: number) => x !== 0)).toBe(true);
  });

  it('rejects missing, malformed, non-finite, and historical-model plastic state', () => {
    const c = config(); const snapshot = createSnapshot(runTo(bootstrapWorld(c), c, 2), c);
    expectMalformed(reseal(snapshot, (o) => { delete o.state.organisms[0].outputBiasOffsets; }));
    expectMalformed(reseal(snapshot, (o) => { o.state.organisms[0].hiddenOutputWeightOffsets.pop(); }));
    expectMalformed(reseal(snapshot, (o) => { o.state.organisms[0].hiddenOutputWeightOffsets[0] = 100; }));
    // JSON cannot encode NaN; validate the in-memory candidate after checksum is recomputed over a finite placeholder,
    // then introduce the non-finite value to prove validation refuses it before restore.
    const bad = reseal(snapshot, () => {}); bad.state.organisms[0].outputBiasEligibilityTraces[0] = Number.NaN;
    expect(() => validateSnapshot(bad)).toThrow(SnapshotError);

    const c6 = foodHandlingModelConfig(); c6.rootSeed = 8;
    const old = createSnapshot(runTo(bootstrapWorld(c6), c6 as any, 2), c6);
    expectMalformed(reseal(old, (o) => { o.state.organisms[0].outputBiasOffsets = [0,0,0,0]; }));
  });

  it('rejects cross-model/format relabelling', () => {
    const c = config(); const snapshot = createSnapshot(runTo(bootstrapWorld(c), c, 2), c);
    expect(() => validateSnapshot(reseal(snapshot, (o) => { o.snapshotFormatVersion = 3; })))
      .toThrow(expect.objectContaining<Partial<SnapshotError>>({ code: 'UNSUPPORTED_FORMAT_VERSION' }));
    expect(() => validateSnapshot(reseal(snapshot, (o) => {
      o.simulationVersion = o.config.simulationVersion = o.state.simulationVersion = '0A.6.0';
      delete o.config.plasticity;
    }))).toThrow(expect.objectContaining<Partial<SnapshotError>>({ code: 'UNSUPPORTED_FORMAT_VERSION' }));
  });

  it('continuous execution equals serialize/load/restore/resume with nonzero offsets, traces and handling state', () => {
    const c = config(); let boundary = runTo(bootstrapWorld(c), c, 300);
    expect(boundary.organisms.some((o) => o.hiddenOutputWeightOffsets!.some((x) => x !== 0))).toBe(true);
    const restored = restoreSnapshot(parseSnapshot(serializeSnapshot(createSnapshot(boundary, c))));
    const continuous = runTo(boundary, c, 700);
    const resumed = runTo(restored.world, restored.config as ReturnType<typeof config>, 700);
    expect(canonicalStateHash(resumed)).toBe(canonicalStateHash(continuous));
  }, 60_000);

  it('resumes exactly at every active handling progress and just after positive and negative learning updates', () => {
    const c = config();
    let world = bootstrapWorld(c);
    const handlingBoundaries = new Map<number, WorldState>();
    let afterPositive: WorldState | undefined;
    let afterNegative: WorldState | undefined;
    while (world.tick < 2_000 && (handlingBoundaries.size < 4 || afterPositive === undefined || afterNegative === undefined)) {
      for (const food of world.food) {
        if (food.holderId !== null && food.holderId !== undefined && food.handlingProgress !== undefined) {
          handlingBoundaries.set(food.handlingProgress, handlingBoundaries.get(food.handlingProgress) ?? world);
        }
      }
      const next = stepWorld(world, c).world;
      const sign = reinforcementSign(world, next);
      if (sign > 0 && afterPositive === undefined) afterPositive = next;
      if (sign < 0 && afterNegative === undefined) afterNegative = next;
      world = next;
    }
    expect([...handlingBoundaries.keys()].sort()).toEqual([1, 2, 3, 4]);
    expect(afterPositive).toBeDefined();
    expect(afterNegative).toBeDefined();
    for (const boundary of handlingBoundaries.values()) expectOneStepResumeExact(boundary, c);
    expectOneStepResumeExact(afterPositive!, c);
    expectOneStepResumeExact(afterNegative!, c);
  }, 60_000);
});
