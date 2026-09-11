/**
 * The live world as the UI needs it: the newest observer frame, the one
 * before it (for display interpolation), and a small derived summary.
 *
 * Nothing else is retained. There is no history, no queue and no replay:
 * every new frame replaces the previous "latest".
 */
import type { ObserverFrame, ObserverOrganism } from '../protocol/observerV1.js';
import { updateIntervalEstimate } from './interpolation.js';

export interface FrameSummary {
  tick: number;
  snapshotTick: number;
  population: number;
  foodCount: number;
  simulationVersion: string;
  configHash: string;
  rootSeed: number;
  worldWidth: number;
  worldHeight: number;
  /** Distinct lineageRootId values among living organisms (derived per frame). */
  lineageCount: number;
  /** Largest generationDepth among living organisms (derived per frame). */
  maxGeneration: number;
  /** Largest energy value in the frame (used only to scale the energy ring). */
  maxEnergy: number;
  /** Frames received since this store was created. */
  framesReceived: number;
}

export const DEFAULT_FRAME_INTERVAL_MS = 100;

export class FrameStore {
  private latestFrame: ObserverFrame | null = null;
  private prevFrame: ObserverFrame | null = null;
  private latestById: Map<number, ObserverOrganism> = new Map();
  private prevById: Map<number, ObserverOrganism> = new Map();
  private latestAt = 0;
  private intervalMs = DEFAULT_FRAME_INTERVAL_MS;
  private summaryValue: FrameSummary | null = null;
  private frames = 0;
  private readonly listeners = new Set<() => void>();

  /** Accept a new frame. `now` is a monotonic clock in ms (performance.now()). */
  push(frame: ObserverFrame, now: number): void {
    if (this.latestFrame !== null) {
      this.intervalMs = updateIntervalEstimate(this.intervalMs, now - this.latestAt);
      this.prevFrame = this.latestFrame;
      this.prevById = this.latestById;
    }
    this.latestFrame = frame;
    this.latestAt = now;
    this.frames++;
    const byId = new Map<number, ObserverOrganism>();
    const lineages = new Set<number>();
    let maxGeneration = 0;
    let maxEnergy = 0;
    for (const o of frame.organisms) {
      byId.set(o.id, o);
      lineages.add(o.lineageRootId);
      if (o.generationDepth > maxGeneration) maxGeneration = o.generationDepth;
      if (o.energy > maxEnergy) maxEnergy = o.energy;
    }
    this.latestById = byId;
    this.summaryValue = {
      tick: frame.tick,
      snapshotTick: frame.snapshotTick,
      population: frame.population,
      foodCount: frame.foodCount,
      simulationVersion: frame.simulationVersion,
      configHash: frame.configHash,
      rootSeed: frame.rootSeed,
      worldWidth: frame.world.width,
      worldHeight: frame.world.height,
      lineageCount: lineages.size,
      maxGeneration,
      maxEnergy,
      framesReceived: this.frames,
    };
    for (const l of this.listeners) l();
  }

  /** Forget the previous frame so the next draw jumps straight to the newest state. */
  collapseToLatest(): void {
    this.prevFrame = null;
    this.prevById = new Map();
  }

  latest(): ObserverFrame | null { return this.latestFrame; }
  previous(): ObserverFrame | null { return this.prevFrame; }
  latestReceivedAt(): number { return this.latestAt; }
  frameIntervalMs(): number { return this.intervalMs; }
  organism(id: number): ObserverOrganism | undefined { return this.latestById.get(id); }
  previousOrganism(id: number): ObserverOrganism | undefined { return this.prevById.get(id); }
  /** Read-only id → organism map of the newest frame. A new Map is built per frame, so a held reference stays fixed. */
  latestOrganisms(): ReadonlyMap<number, ObserverOrganism> { return this.latestById; }
  /** Read-only id → organism map of the previous frame (empty when there is none). */
  previousOrganisms(): ReadonlyMap<number, ObserverOrganism> { return this.prevById; }
  summary(): FrameSummary | null { return this.summaryValue; }

  /** Number of frames currently retained — always at most 2. */
  retainedFrames(): number {
    return (this.latestFrame !== null ? 1 : 0) + (this.prevFrame !== null ? 1 : 0);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}
