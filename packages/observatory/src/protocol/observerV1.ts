/**
 * Observer protocol v1 — the wire contract the Observatory consumes.
 *
 * These types mirror the frame produced by
 * `packages/world-runner/src/observer/frame.ts`. They describe a *view* of the
 * world, never canonical state: nothing is restored from a frame, and nothing
 * here is ever sent back to the runner (the stream is read-only, Spec §14.50).
 *
 * The parser below is deliberately defensive: the frontend treats every
 * WebSocket message as untrusted input, so a malformed payload can never
 * crash the app.
 */

export const SUPPORTED_OBSERVER_PROTOCOL_VERSION = 1;

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
  observerProtocolVersion: number;
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

export type ParseFailureKind = 'not-json' | 'malformed' | 'unsupported-version';

export interface ParseFailure {
  ok: false;
  kind: ParseFailureKind;
  message: string;
  /** Present for 'unsupported-version': the version the runner announced. */
  version?: number;
}

export interface ParseSuccess {
  ok: true;
  frame: ObserverFrame;
}

export type ParseResult = ParseSuccess | ParseFailure;

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const ORGANISM_NUMBER_FIELDS = [
  'id', 'generationDepth', 'lineageRootId', 'x', 'y', 'heading', 'size', 'energy', 'age',
  'maxSpeed', 'visionRange', 'visionAngle', 'metabolism',
] as const;

function parseOrganism(v: unknown, index: number): ObserverOrganism | string {
  if (!isRecord(v)) return `organisms[${index}] is not an object`;
  for (const key of ORGANISM_NUMBER_FIELDS) {
    if (!isFiniteNumber(v[key])) return `organisms[${index}].${key} is not a finite number`;
  }
  const parentId = v['parentId'];
  if (parentId !== null && !isFiniteNumber(parentId)) return `organisms[${index}].parentId is not a number or null`;
  return {
    id: v['id'] as number,
    parentId: parentId as number | null,
    generationDepth: v['generationDepth'] as number,
    lineageRootId: v['lineageRootId'] as number,
    x: v['x'] as number,
    y: v['y'] as number,
    heading: v['heading'] as number,
    size: v['size'] as number,
    energy: v['energy'] as number,
    age: v['age'] as number,
    maxSpeed: v['maxSpeed'] as number,
    visionRange: v['visionRange'] as number,
    visionAngle: v['visionAngle'] as number,
    metabolism: v['metabolism'] as number,
  };
}

function parseFood(v: unknown, index: number): ObserverFood | string {
  if (!isRecord(v)) return `food[${index}] is not an object`;
  if (!isFiniteNumber(v['id']) || !isFiniteNumber(v['x']) || !isFiniteNumber(v['y'])) return `food[${index}] has a non-numeric field`;
  return { id: v['id'], x: v['x'], y: v['y'] };
}

/**
 * Parse one already-decoded JSON value as an observer-v1 frame.
 * Never throws.
 */
export function parseObserverValue(value: unknown): ParseResult {
  if (!isRecord(value)) return { ok: false, kind: 'malformed', message: 'message is not a JSON object' };
  if (value['type'] !== 'frame') return { ok: false, kind: 'malformed', message: `unexpected message type ${JSON.stringify(value['type'])}` };
  const version = value['observerProtocolVersion'];
  if (!isFiniteNumber(version)) return { ok: false, kind: 'malformed', message: 'observerProtocolVersion is missing' };
  if (version !== SUPPORTED_OBSERVER_PROTOCOL_VERSION) {
    return {
      ok: false,
      kind: 'unsupported-version',
      version,
      message: `observer protocol v${version} is not supported; this Observatory understands v${SUPPORTED_OBSERVER_PROTOCOL_VERSION}`,
    };
  }
  if (typeof value['simulationVersion'] !== 'string') return { ok: false, kind: 'malformed', message: 'simulationVersion is not a string' };
  if (typeof value['configHash'] !== 'string') return { ok: false, kind: 'malformed', message: 'configHash is not a string' };
  for (const key of ['rootSeed', 'tick', 'snapshotTick', 'population', 'foodCount'] as const) {
    if (!isFiniteNumber(value[key])) return { ok: false, kind: 'malformed', message: `${key} is not a finite number` };
  }
  const world = value['world'];
  if (!isRecord(world) || !isFiniteNumber(world['width']) || !isFiniteNumber(world['height']) || world['width'] <= 0 || world['height'] <= 0) {
    return { ok: false, kind: 'malformed', message: 'world.width / world.height are not positive numbers' };
  }
  if (!Array.isArray(value['organisms'])) return { ok: false, kind: 'malformed', message: 'organisms is not an array' };
  if (!Array.isArray(value['food'])) return { ok: false, kind: 'malformed', message: 'food is not an array' };

  const organisms: ObserverOrganism[] = new Array(value['organisms'].length);
  for (let i = 0; i < value['organisms'].length; i++) {
    const o = parseOrganism(value['organisms'][i], i);
    if (typeof o === 'string') return { ok: false, kind: 'malformed', message: o };
    organisms[i] = o;
  }
  const food: ObserverFood[] = new Array(value['food'].length);
  for (let i = 0; i < value['food'].length; i++) {
    const f = parseFood(value['food'][i], i);
    if (typeof f === 'string') return { ok: false, kind: 'malformed', message: f };
    food[i] = f;
  }

  return {
    ok: true,
    frame: {
      type: 'frame',
      observerProtocolVersion: version,
      simulationVersion: value['simulationVersion'],
      configHash: value['configHash'],
      rootSeed: value['rootSeed'] as number,
      tick: value['tick'] as number,
      snapshotTick: value['snapshotTick'] as number,
      world: { width: world['width'], height: world['height'] },
      population: value['population'] as number,
      foodCount: value['foodCount'] as number,
      organisms,
      food,
    },
  };
}

/** Parse one raw WebSocket text message. Never throws. */
export function parseObserverMessage(text: unknown): ParseResult {
  if (typeof text !== 'string') return { ok: false, kind: 'not-json', message: 'message is not text' };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    return { ok: false, kind: 'not-json', message: `message is not valid JSON (${err instanceof Error ? err.message : String(err)})` };
  }
  return parseObserverValue(value);
}
