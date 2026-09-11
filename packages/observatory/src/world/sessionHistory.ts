/**
 * Session-only evolution history — bounded, frontend-only, non-scientific.
 *
 * Everything here is derived from the observer frames received by *this*
 * browser tab while it is open. Nothing is persisted, nothing is sent, nothing
 * is replayed from the runner, and nothing is interpreted: a "birth" is an id
 * that appeared between two consecutive received frames, a "death" is an id
 * that disappeared. Where frames are not consecutive enough to say that
 * (see `CONTINUOUS_TICK_GAP`), a single coalesced "observation gap" marker is
 * recorded instead of inferred events.
 *
 * Bounds (all fixed): the event feed keeps at most `maxEvents` entries, the
 * trend keeps at most `maxTrendPoints` samples taken every `sampleTicks`
 * ticks, the recently-extinct list keeps at most `maxRecentExtinct`
 * lineages, and the morphology cache keeps at most `maxMorphologyEntries`
 * organisms (least-recently-seen evicted). Per-lineage counts exist only
 * inside retained trend samples, so memory is bounded by (samples × lineages
 * alive in them).
 *
 * The history belongs to one world identity `(simulationVersion, configHash,
 * rootSeed)`. A frame from a different identity clears it; a reconnect to the
 * same world continues it (with a gap marker where frames were missed).
 */
import type { ObserverFrame, ObserverOrganism } from '../protocol/observerV1.js';
import { summarizeLineages, type LineageAggregate } from './lineages.js';
import { MorphologyCache, DEFAULT_MAX_MORPHOLOGY_ENTRIES } from './morphologyCache.js';
import { morphologyChangesFromCache } from './inheritance.js';

/** Largest forward tick step between two received frames that still counts as continuous observation. */
export const CONTINUOUS_TICK_GAP = 8;
export const DEFAULT_MAX_EVENTS = 80;
export const DEFAULT_MAX_TREND_POINTS = 300;
export const DEFAULT_TREND_SAMPLE_TICKS = 10;
export const DEFAULT_MAX_RECENT_EXTINCT = 6;

export interface WorldIdentity {
  simulationVersion: string;
  configHash: string;
  rootSeed: number;
}

export function sameWorldIdentity(a: WorldIdentity, b: WorldIdentity): boolean {
  return a.simulationVersion === b.simulationVersion && a.configHash === b.configHash && a.rootSeed === b.rootSeed;
}

export interface BirthEvent {
  kind: 'birth';
  seq: number;
  /** Tick of the frame in which the organism was first observed. */
  tick: number;
  id: number;
  parentId: number | null;
  lineageRootId: number;
  generationDepth: number;
  /**
   * Morphology genes (of 5) that differ from the parent at protocol
   * precision, or null when the parent was not observed this session.
   * Never guessed.
   */
  morphologyChanges: number | null;
}

export interface DeathEvent {
  kind: 'death';
  seq: number;
  /** Tick of the first frame in which the organism was absent. */
  tick: number;
  id: number;
  lineageRootId: number;
  generationDepth: number;
  /** Age and tick from the last frame in which it was observed. */
  lastAge: number;
  lastSeenTick: number;
}

export interface ExtinctionEvent {
  kind: 'extinction';
  seq: number;
  tick: number;
  lineageRootId: number;
  /** Living count in the last frame that still held the lineage. */
  lastCount: number;
}

export interface GapEvent {
  kind: 'gap';
  seq: number;
  /** Tick of the last frame before the gap (or the first, when consecutive gaps are coalesced). */
  fromTick: number;
  /** Tick of the newest frame after the gap. */
  toTick: number;
  /** Frames received across the (coalesced) gap. */
  frames: number;
}

export type FeedEvent = BirthEvent | DeathEvent | ExtinctionEvent | GapEvent;

export interface TrendPoint {
  tick: number;
  population: number;
  foodCount: number;
  maxGeneration: number;
  lineageCount: number;
  /** Living count per lineage in this sample. Only lineages alive in the sample are present. */
  lineageCounts: ReadonlyMap<number, number>;
}

export interface ExtinctLineage {
  lineageRootId: number;
  /** Tick of the last frame in which the lineage had living organisms. */
  lastSeenTick: number;
  /** Tick of the frame in which it was first observed absent. */
  observedTick: number;
  lastCount: number;
  lastMaxGeneration: number;
}

export interface HistorySnapshot {
  /** Increments on every accepted frame and on every reset. */
  seq: number;
  identity: WorldIdentity | null;
  tick: number | null;
  lineages: LineageAggregate | null;
  recentlyExtinct: readonly ExtinctLineage[];
  /** Oldest → newest, at most `maxEvents`. */
  events: readonly FeedEvent[];
  /** Oldest → newest, at most `maxTrendPoints`. */
  trend: readonly TrendPoint[];
  /** Times the history was cleared because a different world identity arrived. */
  resets: number;
  /** Frames folded into this history since the last reset. */
  framesObserved: number;
  /** Observed births (consecutive frames) whose parent morphology was known, and how many of those differed in ≥ 1 gene. Session counters. */
  birthsComparable: number;
  birthsChanged: number;
}

export interface SessionHistoryOptions {
  maxEvents?: number;
  maxTrendPoints?: number;
  sampleTicks?: number;
  maxRecentExtinct?: number;
  continuousTickGap?: number;
  maxMorphologyEntries?: number;
}

const EMPTY_EVENTS: readonly FeedEvent[] = Object.freeze([]);
const EMPTY_TREND: readonly TrendPoint[] = Object.freeze([]);
const EMPTY_EXTINCT: readonly ExtinctLineage[] = Object.freeze([]);

export class SessionHistory {
  private readonly maxEvents: number;
  private readonly maxTrendPoints: number;
  private readonly sampleTicks: number;
  private readonly maxRecentExtinct: number;
  private readonly continuousTickGap: number;
  private readonly morphologyCache: MorphologyCache;

  private identity: WorldIdentity | null = null;
  private lastFrame: ObserverFrame | null = null;
  private lastById: ReadonlyMap<number, ObserverOrganism> = new Map();
  private lastLineages: LineageAggregate | null = null;
  private lastSampleTick: number | null = null;

  private events: FeedEvent[] = [];
  private trend: TrendPoint[] = [];
  private recentlyExtinct: ExtinctLineage[] = [];
  private eventsView: readonly FeedEvent[] = EMPTY_EVENTS;
  private trendView: readonly TrendPoint[] = EMPTY_TREND;
  private extinctView: readonly ExtinctLineage[] = EMPTY_EXTINCT;

  private seq = 0;
  private eventSeq = 0;
  private resets = 0;
  private framesObserved = 0;
  private birthsComparable = 0;
  private birthsChanged = 0;
  private snapshotValue: HistorySnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(options: SessionHistoryOptions = {}) {
    this.maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
    this.maxTrendPoints = options.maxTrendPoints ?? DEFAULT_MAX_TREND_POINTS;
    this.sampleTicks = options.sampleTicks ?? DEFAULT_TREND_SAMPLE_TICKS;
    this.maxRecentExtinct = options.maxRecentExtinct ?? DEFAULT_MAX_RECENT_EXTINCT;
    this.continuousTickGap = options.continuousTickGap ?? CONTINUOUS_TICK_GAP;
    this.morphologyCache = new MorphologyCache(options.maxMorphologyEntries ?? DEFAULT_MAX_MORPHOLOGY_ENTRIES);
    this.snapshotValue = this.buildSnapshot();
  }

  /**
   * Fold one received frame into the history. `byId` may be the frame store's
   * id → organism map of the same frame (to avoid building it twice).
   */
  push(frame: ObserverFrame, byId?: ReadonlyMap<number, ObserverOrganism>): void {
    const identity: WorldIdentity = { simulationVersion: frame.simulationVersion, configHash: frame.configHash, rootSeed: frame.rootSeed };
    if (this.identity === null) {
      this.identity = identity;
    } else if (!sameWorldIdentity(this.identity, identity)) {
      this.clear();
      this.resets++;
      this.identity = identity;
    }

    let map = byId;
    if (map === undefined) {
      const m = new Map<number, ObserverOrganism>();
      for (const o of frame.organisms) m.set(o.id, o);
      map = m;
    }
    const lineages = summarizeLineages(frame.organisms);
    const last = this.lastFrame;
    let eventsChanged = false;

    // Events are derived before this frame's organisms enter the cache, so a
    // birth is compared against a parent seen in an earlier frame only.
    // (A parent is always older than its child, so it is already cached
    // whenever it was observed at all.)

    if (last !== null) {
      const step = frame.tick - last.tick;
      const continuous = step > 0 && step <= this.continuousTickGap;
      if (continuous) {
        eventsChanged = this.deriveEvents(frame, map, lineages) || eventsChanged;
      } else {
        this.recordGap(last.tick, frame.tick);
        eventsChanged = true;
      }
      eventsChanged = this.updateExtinct(frame, lineages) || eventsChanged;
    }

    const trendChanged = this.maybeSample(frame, lineages);
    this.morphologyCache.observe(frame.organisms, frame.tick);

    this.lastFrame = frame;
    this.lastById = map;
    this.lastLineages = lineages;
    this.framesObserved++;
    this.seq++;
    if (eventsChanged) this.eventsView = this.events.slice();
    if (trendChanged) this.trendView = this.trend.slice();
    this.snapshotValue = this.buildSnapshot();
    for (const l of this.listeners) l();
  }

  /** Clear every session-derived record (the identity is kept by the caller when it decides to). */
  private clear(): void {
    this.identity = null;
    this.lastFrame = null;
    this.lastById = new Map();
    this.lastLineages = null;
    this.lastSampleTick = null;
    this.events = [];
    this.trend = [];
    this.recentlyExtinct = [];
    this.eventsView = EMPTY_EVENTS;
    this.trendView = EMPTY_TREND;
    this.extinctView = EMPTY_EXTINCT;
    this.framesObserved = 0;
    this.birthsComparable = 0;
    this.birthsChanged = 0;
    this.morphologyCache.clear();
  }

  private deriveEvents(frame: ObserverFrame, byId: ReadonlyMap<number, ObserverOrganism>, lineages: LineageAggregate): boolean {
    let changed = false;
    for (const [id, o] of this.lastById) {
      if (!byId.has(id)) {
        this.addEvent({ kind: 'death', seq: 0, tick: frame.tick, id, lineageRootId: o.lineageRootId, generationDepth: o.generationDepth, lastAge: o.age, lastSeenTick: this.lastFrame!.tick });
        changed = true;
      }
    }
    for (const o of frame.organisms) {
      if (!this.lastById.has(o.id)) {
        const morphologyChanges = morphologyChangesFromCache(o, this.morphologyCache);
        if (morphologyChanges !== null) {
          this.birthsComparable++;
          if (morphologyChanges > 0) this.birthsChanged++;
        }
        this.addEvent({ kind: 'birth', seq: 0, tick: frame.tick, id: o.id, parentId: o.parentId, lineageRootId: o.lineageRootId, generationDepth: o.generationDepth, morphologyChanges });
        changed = true;
      }
    }
    const prev = this.lastLineages;
    if (prev !== null) {
      for (const [lineageRootId, lastCount] of prev.counts) {
        if (!lineages.counts.has(lineageRootId)) {
          this.addEvent({ kind: 'extinction', seq: 0, tick: frame.tick, lineageRootId, lastCount });
          changed = true;
        }
      }
    }
    return changed;
  }

  private recordGap(fromTick: number, toTick: number): void {
    const lastEvent = this.events[this.events.length - 1];
    if (lastEvent !== undefined && lastEvent.kind === 'gap') {
      lastEvent.toTick = toTick;
      lastEvent.frames++;
      return;
    }
    this.addEvent({ kind: 'gap', seq: 0, fromTick, toTick, frames: 1 });
  }

  private addEvent(event: FeedEvent): void {
    event.seq = ++this.eventSeq;
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
  }

  /** Track lineages that left the living set (regardless of continuity — absence is a frame fact, not an inferred event). */
  private updateExtinct(frame: ObserverFrame, lineages: LineageAggregate): boolean {
    const prev = this.lastLineages;
    if (prev === null) return false;
    let changed = false;
    // A lineage seen alive again (e.g. a runner restarted from an older snapshot) leaves the list.
    const before = this.recentlyExtinct.length;
    this.recentlyExtinct = this.recentlyExtinct.filter((e) => !lineages.counts.has(e.lineageRootId));
    if (this.recentlyExtinct.length !== before) changed = true;
    for (const s of prev.lineages) {
      if (!lineages.counts.has(s.lineageRootId)) {
        this.recentlyExtinct.unshift({ lineageRootId: s.lineageRootId, lastSeenTick: this.lastFrame!.tick, observedTick: frame.tick, lastCount: s.count, lastMaxGeneration: s.maxGeneration });
        changed = true;
      }
    }
    if (this.recentlyExtinct.length > this.maxRecentExtinct) this.recentlyExtinct.length = this.maxRecentExtinct;
    if (changed) this.extinctView = this.recentlyExtinct.slice();
    return changed;
  }

  private maybeSample(frame: ObserverFrame, lineages: LineageAggregate): boolean {
    const last = this.lastSampleTick;
    const due = last === null || frame.tick >= last + this.sampleTicks || frame.tick < last;
    if (!due) return false;
    this.trend.push({
      tick: frame.tick,
      population: frame.population,
      foodCount: frame.foodCount,
      maxGeneration: lineages.maxGeneration,
      lineageCount: lineages.lineages.length,
      lineageCounts: lineages.counts,
    });
    if (this.trend.length > this.maxTrendPoints) this.trend.splice(0, this.trend.length - this.maxTrendPoints);
    this.lastSampleTick = frame.tick;
    return true;
  }

  private buildSnapshot(): HistorySnapshot {
    return {
      seq: this.seq,
      identity: this.identity,
      tick: this.lastFrame?.tick ?? null,
      lineages: this.lastLineages,
      recentlyExtinct: this.extinctView,
      events: this.eventsView,
      trend: this.trendView,
      resets: this.resets,
      framesObserved: this.framesObserved,
      birthsComparable: this.birthsComparable,
      birthsChanged: this.birthsChanged,
    };
  }

  /** The bounded session morphology cache (read-only use: parent lookups for the inspector). */
  morphology(): MorphologyCache { return this.morphologyCache; }

  /** Stable between pushes; a new object after each push, so it works with useSyncExternalStore. */
  snapshot(): HistorySnapshot { return this.snapshotValue; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}

/** Living count of one lineage across the retained trend samples (0 where it was absent). */
export function lineageTrend(trend: readonly TrendPoint[], lineageRootId: number): number[] {
  const out = new Array<number>(trend.length);
  for (let i = 0; i < trend.length; i++) out[i] = trend[i]!.lineageCounts.get(lineageRootId) ?? 0;
  return out;
}
