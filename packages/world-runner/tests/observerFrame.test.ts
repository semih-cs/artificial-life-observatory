/** Observer protocol v1 frames: correctness and purity of toObserverFrame. */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { bootstrapWorld, stepWorld, canonicalStateHash, canonicalStateString, runTicks } from '@alo/simulation-core';
import { createSnapshot, restoreSnapshot, configHash } from '@alo/persistence';
import { toObserverFrame, OBSERVER_PROTOCOL_VERSION, WorldRunner } from '../src/index.js';
import { GOLDEN_SEED, seedConfig, directHash, newWorldDir } from './helpers.js';

const statusOf = (seed: number, snapshotTick = 0) => ({ configHash: configHash(seedConfig(seed)), rootSeed: seed, snapshotTick });

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

describe('frame correctness', () => {
  it('a known world (golden seed, tick 1,000) produces the expected frame', () => {
    const c = seedConfig(GOLDEN_SEED);
    const world = runTicks(bootstrapWorld(c), c, 1000).world;
    const frame = toObserverFrame(world, statusOf(GOLDEN_SEED, 1000));
    expect(OBSERVER_PROTOCOL_VERSION).toBe(1);
    expect(frame).toMatchObject({
      type: 'frame', observerProtocolVersion: 1, simulationVersion: '0A.2.0', configHash: configHash(c), rootSeed: GOLDEN_SEED,
      tick: 1000, snapshotTick: 1000, world: { width: c.world.width, height: c.world.height }, population: 34, foodCount: 60,
    });
    expect(frame.organisms).toHaveLength(34);
    expect(frame.food).toHaveLength(60);
    const o = world.organisms[0]!;
    expect(frame.organisms[0]).toEqual({
      id: o.id, parentId: o.parentId, generationDepth: o.generationDepth, lineageRootId: o.lineageRootId,
      x: Math.round(o.x * 100) / 100, y: Math.round(o.y * 100) / 100, heading: Math.round(o.heading * 1000) / 1000,
      size: Math.round(o.genome.morphology.size * 1000) / 1000, energy: Math.round(o.energy * 100) / 100, age: o.age,
      maxSpeed: Math.round(o.genome.morphology.maxSpeed * 1000) / 1000, visionRange: Math.round(o.genome.morphology.visionRange * 1000) / 1000,
      visionAngle: Math.round(o.genome.morphology.visionAngle * 1000) / 1000, metabolism: Math.round(o.genome.morphology.metabolism * 1000) / 1000,
    });
    expect(frame.organisms.map((x) => x.id)).toEqual(world.organisms.map((x) => x.id)); // world order (ascending id) kept
    expect(frame.food.map((f) => f.id)).toEqual(world.food.map((f) => f.id));
    expect(Object.keys(frame.organisms[0]!)).not.toContain('genome'); // no neural weights in live frames
    const text = JSON.stringify(frame);
    expect(text).not.toContain('inputHiddenWeights');
    expect(text).not.toContain('rng');
    // Deterministic: the same world always gives byte-identical frame text (pinned for protocol v1).
    expect(JSON.stringify(toObserverFrame(runTicks(bootstrapWorld(c), c, 1000).world, statusOf(GOLDEN_SEED, 1000)))).toBe(text);
    expect(createHash('sha256').update(text).digest('hex').slice(0, 16)).toBe("3e022ea0723de971");
  }, 60_000);

  it('the frame takes identity and snapshot position from the runner status', () => {
    const r = WorldRunner.create(newWorldDir(), seedConfig(11), { saveEvery: 100 });
    r.runUntil(150);
    const f = toObserverFrame(r.world, r.status());
    expect(f).toMatchObject({ tick: 150, snapshotTick: 100, rootSeed: 11, configHash: r.status().configHash, population: r.status().population, foodCount: r.status().food });
    expect(JSON.parse(JSON.stringify(f))).toEqual(f); // plain JSON data
  });
});

describe('frame purity', () => {
  it('observing every tick (three frames per tick) leaves world, RNG and config untouched and the trajectory unchanged', () => {
    const c = seedConfig(11);
    const cText = JSON.stringify(c);
    let world = bootstrapWorld(c);
    while (world.tick < 1500) {
      world = stepWorld(world, c).world;
      const before = canonicalStateString(world);
      const rng = JSON.stringify(world.rng);
      const a = JSON.stringify(toObserverFrame(world, statusOf(11)));
      toObserverFrame(world, statusOf(11));
      expect(JSON.stringify(toObserverFrame(world, statusOf(11)))).toBe(a);
      if (canonicalStateString(world) !== before || JSON.stringify(world.rng) !== rng) throw new Error(`frame changed the world at tick ${world.tick}`);
    }
    expect(JSON.stringify(c)).toBe(cText);
    expect(canonicalStateHash(world)).toBe(directHash(11, 1500));
  }, 60_000);

  it('works on a deeply frozen world and status (it cannot write to them)', () => {
    const c = seedConfig(11);
    const { world } = restoreSnapshot(createSnapshot(runTicks(bootstrapWorld(c), c, 300).world, c));
    const hash = canonicalStateHash(world);
    deepFreeze(world);
    const status = deepFreeze(statusOf(11, 300));
    expect(() => toObserverFrame(world, status)).not.toThrow();
    expect(canonicalStateHash(world)).toBe(hash);
  });
});
