/**
 * Observer frames — observer protocol v1.
 *
 * A frame is a read-only, JSON-serializable picture of the world for
 * visualization. `toObserverFrame` is a pure projection: it reads the world,
 * draws no random numbers, writes nothing, and makes no simulation decision.
 * Organisms and food keep the world's own (ascending id) order.
 *
 * Numbers are rounded for display (positions and energy to 0.01, heading and
 * morphology to 0.001) to keep frames compact. Frames are a view, never
 * canonical state: nothing may be restored from them.
 *
 * Not in live frames: neural weights, RNG state, the fertility lattice.
 */
import type { WorldState } from '@alo/simulation-core';
import type { RunnerStatus } from '../runner.js';

export const OBSERVER_PROTOCOL_VERSION = 1;

export interface ObserverOrganism {
  id: number;
  parentId: number | null;
  generationDepth: number;
  lineageRootId: number;
  x: number;
  y: number;
  heading: number;
  size: number;
  energy: number;
  age: number;
  maxSpeed: number;
  visionRange: number;
  visionAngle: number;
  metabolism: number;
}

export interface ObserverFood {
  id: number;
  x: number;
  y: number;
}

export interface ObserverFrame {
  type: 'frame';
  observerProtocolVersion: typeof OBSERVER_PROTOCOL_VERSION;
  simulationVersion: string;
  configHash: string;
  rootSeed: number;
  tick: number;
  snapshotTick: number;
  world: { width: number; height: number };
  population: number;
  foodCount: number;
  organisms: ObserverOrganism[];
  food: ObserverFood[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** The subset of runner status a frame needs (identity and persistence position). */
export type FrameStatus = Pick<RunnerStatus, 'configHash' | 'rootSeed' | 'snapshotTick'>;

export function toObserverFrame(world: WorldState, status: FrameStatus): ObserverFrame {
  const organisms: ObserverOrganism[] = [];
  for (const o of world.organisms) {
    if (!o.alive) continue;
    const m = o.genome.morphology;
    organisms.push({
      id: o.id,
      parentId: o.parentId,
      generationDepth: o.generationDepth,
      lineageRootId: o.lineageRootId,
      x: r2(o.x),
      y: r2(o.y),
      heading: r3(o.heading),
      size: r3(m.size),
      energy: r2(o.energy),
      age: o.age,
      maxSpeed: r3(m.maxSpeed),
      visionRange: r3(m.visionRange),
      visionAngle: r3(m.visionAngle),
      metabolism: r3(m.metabolism),
    });
  }
  const food: ObserverFood[] = world.food.map((f) => ({ id: f.id, x: r2(f.x), y: r2(f.y) }));
  return {
    type: 'frame',
    observerProtocolVersion: OBSERVER_PROTOCOL_VERSION,
    simulationVersion: world.simulationVersion,
    configHash: status.configHash,
    rootSeed: status.rootSeed,
    tick: world.tick,
    snapshotTick: status.snapshotTick,
    world: { width: world.worldConfig.width, height: world.worldConfig.height },
    population: organisms.length,
    foodCount: food.length,
    organisms,
    food,
  };
}
