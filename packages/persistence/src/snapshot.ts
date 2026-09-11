/**
 * Canonical world snapshot, format v1 (Phase 0C slice 1).
 *
 * Invariant (Spec v4 §18.60, §19.27 [LOCKED]): a world restored from a
 * snapshot continues bit-for-bit as if it had never stopped.
 *
 *   continuous run  ==  save → serialize → load → restore → resume
 *
 * Conventions:
 *   - A snapshot labelled tick N is the canonical world AFTER tick N has
 *     completed — exactly the `WorldState` whose `.tick` is N, i.e. the input
 *     to the step that produces tick N + 1 (closes §19.6 for this format).
 *   - The static fertility lattice is stored in full (closes §19.11 for this
 *     format).
 *   - The world state stored is exactly `canonicalizeWorldState(world)` from
 *     simulation-core — the same record the canonical hash is computed over —
 *     so there is one definition of "future-affecting state", not two. It
 *     contains both RNG stream states (§18.24, §19.12).
 *   - The complete SimulationConfig travels with the state (§19.14): the tick
 *     function is `stepWorld(state, config)`, so the state alone is ambiguous.
 *
 * Purity: creating, serializing, parsing, validating and restoring a snapshot
 * draw no random numbers from any stream and never write to the world or the
 * config they are given. Restore builds fresh objects.
 *
 * Integrity: `configHash` and `stateHash` use simulation-core's hash64
 * fingerprint; `checksum` is SHA-256 over the deterministic serialization of
 * every other field. parseSnapshot additionally requires the input text to be
 * byte-identical to the canonical serialization, so any altered byte is
 * refused. These detect corruption, not deliberate forgery.
 */

import { createHash } from 'node:crypto';
import {
  canonicalizeWorldState,
  canonicalStateHash,
  hash64,
  validateConfig,
  hasNonFiniteCanonicalValue,
  MULTI_FOUNDER_MODEL_VERSION,
  SINGLE_FOUNDER_MODEL_VERSION,
  NEURAL_INPUT_SIZE,
  NEURAL_OUTPUT_SIZE,
} from '@alo/simulation-core';
import type { SimulationConfig, WorldState, OrganismRuntimeState, Xoshiro128State } from '@alo/simulation-core';
import { stableStringify } from './stableStringify.js';
import { SnapshotError } from './errors.js';

export const SNAPSHOT_FORMAT_ID = 'alo-canonical-world-snapshot' as const;
export const SNAPSHOT_FORMAT_VERSION = 1;

/**
 * Simulation versions this format can restore. `0A.2.0` is the frozen v1
 * canonical model; `0A.1.0` is the historical single-founder model, still
 * runnable by the same core for regression.
 */
export const SUPPORTED_SIMULATION_VERSIONS: readonly string[] = [MULTI_FOUNDER_MODEL_VERSION, SINGLE_FOUNDER_MODEL_VERSION];

/** The world record stored in a v1 snapshot: `canonicalizeWorldState` output. */
export interface CanonicalWorldStateV1 {
  simulationVersion: string;
  tick: number;
  worldConfig: { width: number; height: number };
  fertility: { resolution: number; lattice: number[] };
  nextOrganismId: number;
  nextFoodId: number;
  organisms: Array<{
    id: number;
    parentId: number | null;
    generationDepth: number;
    lineageRootId: number;
    birthTick: number;
    x: number;
    y: number;
    heading: number;
    energy: number;
    age: number;
    alive: boolean;
    deathCause: 'ENERGY_DEPLETION' | 'MAX_AGE' | null;
    deathTick: number | null;
    genome: {
      morphology: { size: number; maxSpeed: number; visionRange: number; visionAngle: number; metabolism: number };
      neural: { inputHiddenWeights: number[]; hiddenBiases: number[]; hiddenOutputWeights: number[]; outputBiases: number[] };
    };
  }>;
  food: Array<{ id: number; x: number; y: number }>;
  rng: { bootstrap: Xoshiro128State; canonical: Xoshiro128State };
}

export interface WorldSnapshotV1 {
  format: typeof SNAPSHOT_FORMAT_ID;
  snapshotFormatVersion: 1;
  simulationVersion: string;
  /** The world after this tick has completed. */
  tick: number;
  config: SimulationConfig;
  configHash: string;
  state: CanonicalWorldStateV1;
  /** canonicalStateHash of the world at save time. */
  stateHash: string;
  /** SHA-256 over stableStringify of every field above. */
  checksum: string;
}

export interface RestoredWorld {
  world: WorldState;
  config: SimulationConfig;
}

/** Deterministic fingerprint of a configuration (key order independent). */
export function configHash(config: SimulationConfig): string {
  return hash64(stableStringify(config));
}

/** The checksum a snapshot should carry, computed over every field except `checksum`. */
export function computeSnapshotChecksum(snapshot: Omit<WorldSnapshotV1, 'checksum'> | Record<string, unknown>): string {
  const { checksum: _ignored, ...payload } = snapshot as Record<string, unknown>;
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

/** Deep, detached copy through the deterministic serializer. */
function detach<T>(value: T): T {
  return JSON.parse(stableStringify(value)) as T;
}

/**
 * Capture a world and the configuration it runs under. Reads only; the world
 * and config are never modified, and no RNG is touched.
 */
export function createSnapshot(world: WorldState, config: SimulationConfig): WorldSnapshotV1 {
  if (world.simulationVersion !== config.simulationVersion) {
    throw new SnapshotError('INCOMPATIBLE_SIMULATION_VERSION',
      `world is ${world.simulationVersion} but config is ${config.simulationVersion}`);
  }
  if (!SUPPORTED_SIMULATION_VERSIONS.includes(world.simulationVersion)) {
    throw new SnapshotError('INCOMPATIBLE_SIMULATION_VERSION', `simulation version ${world.simulationVersion} is not supported by snapshot format v1`);
  }
  validateConfig(config);
  const payload = {
    format: SNAPSHOT_FORMAT_ID,
    snapshotFormatVersion: 1 as const,
    simulationVersion: world.simulationVersion,
    tick: world.tick,
    config: detach(config),
    configHash: configHash(config),
    state: detach(canonicalizeWorldState(world)) as CanonicalWorldStateV1,
    stateHash: canonicalStateHash(world),
  };
  return { ...payload, checksum: computeSnapshotChecksum(payload) };
}

/** Deterministic text form: sorted keys, no whitespace, trailing newline. */
export function serializeSnapshot(snapshot: WorldSnapshotV1): string {
  return stableStringify(snapshot) + '\n';
}

/** Parse and fully validate. Throws SnapshotError on any problem; never repairs. */
export function parseSnapshot(serialized: string): WorldSnapshotV1 {
  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch (err) {
    throw new SnapshotError('INVALID_SERIALIZATION', `snapshot is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const snapshot = validateSnapshot(raw);
  // Byte-level integrity: a valid snapshot file is exactly its own canonical
  // serialization. This catches corruption that still decodes to the same
  // values — e.g. a flipped last digit of a 17-significant-digit double that
  // rounds back to the same float — which the value-level checksum cannot see.
  if (serializeSnapshot(snapshot) !== serialized) {
    throw new SnapshotError('NON_CANONICAL_SERIALIZATION',
      'snapshot text is not the canonical serialization of its content; the file has been altered or was not written by serializeSnapshot');
  }
  return snapshot;
}

/** Validate a candidate snapshot object. Throws SnapshotError; returns it typed on success. */
export function validateSnapshot(candidate: unknown): WorldSnapshotV1 {
  validateAndRestore(candidate);
  return candidate as WorldSnapshotV1;
}

/**
 * Rebuild the live world and its configuration. Validates first; the result is
 * made of fresh objects that share nothing with the snapshot.
 */
export function restoreSnapshot(snapshot: WorldSnapshotV1): RestoredWorld {
  return validateAndRestore(snapshot);
}

// ---- validation ------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validateAndRestore(candidate: unknown): RestoredWorld {
  if (!isObject(candidate) || candidate['format'] !== SNAPSHOT_FORMAT_ID) {
    throw new SnapshotError('MALFORMED_SNAPSHOT', `not a ${SNAPSHOT_FORMAT_ID} document`);
  }
  if (candidate['snapshotFormatVersion'] !== SNAPSHOT_FORMAT_VERSION) {
    throw new SnapshotError('UNSUPPORTED_FORMAT_VERSION',
      `snapshot format version ${String(candidate['snapshotFormatVersion'])} is not supported (this loader reads ${SNAPSHOT_FORMAT_VERSION})`);
  }
  const s = candidate;
  if (typeof s['simulationVersion'] !== 'string') throw new SnapshotError('MALFORMED_SNAPSHOT', 'simulationVersion missing or not a string');
  if (!isInt(s['tick']) || s['tick'] < 0) throw new SnapshotError('MALFORMED_SNAPSHOT', 'tick missing or not a non-negative integer');
  if (!isObject(s['config'])) throw new SnapshotError('MALFORMED_SNAPSHOT', 'config missing or not an object');
  if (typeof s['configHash'] !== 'string') throw new SnapshotError('MALFORMED_SNAPSHOT', 'configHash missing or not a string');
  if (!isObject(s['state'])) throw new SnapshotError('MALFORMED_SNAPSHOT', 'state missing or not an object');
  if (typeof s['stateHash'] !== 'string') throw new SnapshotError('MALFORMED_SNAPSHOT', 'stateHash missing or not a string');
  if (typeof s['checksum'] !== 'string') throw new SnapshotError('MALFORMED_SNAPSHOT', 'checksum missing or not a string');

  let expectedChecksum: string;
  try {
    expectedChecksum = computeSnapshotChecksum(s);
  } catch (err) {
    throw new SnapshotError('MALFORMED_SNAPSHOT', `snapshot cannot be canonically serialized: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (s['checksum'] !== expectedChecksum) {
    throw new SnapshotError('CHECKSUM_MISMATCH', `checksum ${s['checksum']} does not match content (${expectedChecksum}); the snapshot is corrupt`);
  }

  const version = s['simulationVersion'];
  const config = s['config'] as unknown as SimulationConfig;
  const state = s['state'] as Record<string, unknown>;
  if (!SUPPORTED_SIMULATION_VERSIONS.includes(version)) {
    throw new SnapshotError('INCOMPATIBLE_SIMULATION_VERSION',
      `simulation version ${version} is not supported (supported: ${SUPPORTED_SIMULATION_VERSIONS.join(', ')})`);
  }
  if (config.simulationVersion !== version || state['simulationVersion'] !== version) {
    throw new SnapshotError('INCOMPATIBLE_SIMULATION_VERSION',
      `snapshot says ${version}, config says ${String(config.simulationVersion)}, state says ${String(state['simulationVersion'])}`);
  }

  let actualConfigHash: string;
  try {
    actualConfigHash = configHash(config);
  } catch (err) {
    throw new SnapshotError('INVALID_CONFIG', `config cannot be serialized: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (actualConfigHash !== s['configHash']) {
    throw new SnapshotError('CONFIG_HASH_MISMATCH', `configHash ${s['configHash']} does not match the stored config (${actualConfigHash})`);
  }
  try {
    validateConfig(config);
  } catch (err) {
    throw new SnapshotError('INVALID_CONFIG', `stored config is invalid: ${err instanceof Error ? err.message : String(err)}`);
  }

  const rng = state['rng'];
  if (!isObject(rng)) throw new SnapshotError('INVALID_RNG_STATE', 'RNG state missing');
  const bootstrap = checkRngState(rng['bootstrap'], 'BootstrapRNG');
  const canonical = checkRngState(rng['canonical'], 'CanonicalRNG');

  const world = buildWorld(state, config, bootstrap, canonical);
  if (world.tick !== s['tick']) {
    throw new SnapshotError('MALFORMED_WORLD_STATE', `snapshot tick ${String(s['tick'])} but state tick ${world.tick}`);
  }
  const actualStateHash = canonicalStateHash(world);
  if (actualStateHash !== s['stateHash']) {
    throw new SnapshotError('STATE_HASH_MISMATCH', `restored state hashes to ${actualStateHash}, snapshot recorded ${s['stateHash']}`);
  }
  return { world, config: detach(config) };
}

function checkRngState(v: unknown, name: string): Xoshiro128State {
  if (v === undefined || v === null) throw new SnapshotError('INVALID_RNG_STATE', `${name} state missing`);
  if (!isObject(v)) throw new SnapshotError('INVALID_RNG_STATE', `${name} state is not an object`);
  const words = ['s0', 's1', 's2', 's3'].map((k) => v[k]);
  for (const [i, w] of words.entries()) {
    if (!isInt(w) || w < 0 || w > 0xffffffff) {
      throw new SnapshotError('INVALID_RNG_STATE', `${name} word s${i} is ${String(w)}; expected an unsigned 32-bit integer`);
    }
  }
  if (words.every((w) => w === 0)) throw new SnapshotError('INVALID_RNG_STATE', `${name} state is all zero, which xoshiro128** forbids`);
  return { s0: words[0] as number, s1: words[1] as number, s2: words[2] as number, s3: words[3] as number };
}

function malformed(what: string): never {
  throw new SnapshotError('MALFORMED_WORLD_STATE', what);
}

function numArray(v: unknown, what: string, length?: number): number[] {
  if (!Array.isArray(v) || !v.every(isNum)) malformed(`${what} is not an array of finite numbers`);
  if (length !== undefined && v.length !== length) malformed(`${what} has length ${v.length}, expected ${length}`);
  return [...v];
}

/** Build a fresh WorldState from the stored canonical record. Draws no RNG. */
function buildWorld(state: Record<string, unknown>, config: SimulationConfig, bootstrap: Xoshiro128State, canonical: Xoshiro128State): WorldState {
  if (!isInt(state['tick']) || state['tick'] < 0) malformed('state.tick');
  const wc = state['worldConfig'];
  if (!isObject(wc) || !isNum(wc['width']) || !isNum(wc['height'])) malformed('state.worldConfig');
  const fert = state['fertility'];
  if (!isObject(fert) || !isInt(fert['resolution']) || fert['resolution'] < 1) malformed('state.fertility');
  const res = fert['resolution'] as number;
  const lattice = numArray(fert['lattice'], 'fertility lattice', (res + 1) * (res + 1));
  if (!isInt(state['nextOrganismId']) || !isInt(state['nextFoodId'])) malformed('ID counters');
  if (!Array.isArray(state['organisms'])) malformed('state.organisms');
  if (!Array.isArray(state['food'])) malformed('state.food');

  const hidden = config.neural.hiddenLayerSize;
  const organisms: OrganismRuntimeState[] = (state['organisms'] as unknown[]).map((raw, i) => {
    if (!isObject(raw)) malformed(`organism[${i}]`);
    const o = raw;
    for (const k of ['id', 'generationDepth', 'lineageRootId', 'birthTick', 'age'] as const) if (!isInt(o[k])) malformed(`organism[${i}].${k}`);
    for (const k of ['x', 'y', 'heading', 'energy'] as const) if (!isNum(o[k])) malformed(`organism[${i}].${k}`);
    if (!(o['parentId'] === null || isInt(o['parentId']))) malformed(`organism[${i}].parentId`);
    if (typeof o['alive'] !== 'boolean') malformed(`organism[${i}].alive`);
    if (!(o['deathCause'] === null || o['deathCause'] === 'ENERGY_DEPLETION' || o['deathCause'] === 'MAX_AGE')) malformed(`organism[${i}].deathCause`);
    if (!(o['deathTick'] === null || isInt(o['deathTick']))) malformed(`organism[${i}].deathTick`);
    const g = o['genome'];
    if (!isObject(g) || !isObject(g['morphology']) || !isObject(g['neural'])) malformed(`organism[${i}].genome`);
    const m = g['morphology'] as Record<string, unknown>;
    for (const k of ['size', 'maxSpeed', 'visionRange', 'visionAngle', 'metabolism'] as const) if (!isNum(m[k])) malformed(`organism[${i}].genome.morphology.${k}`);
    const n = g['neural'] as Record<string, unknown>;
    return {
      id: o['id'] as number,
      parentId: o['parentId'] as number | null,
      generationDepth: o['generationDepth'] as number,
      lineageRootId: o['lineageRootId'] as number,
      birthTick: o['birthTick'] as number,
      x: o['x'] as number,
      y: o['y'] as number,
      heading: o['heading'] as number,
      energy: o['energy'] as number,
      age: o['age'] as number,
      alive: o['alive'] as boolean,
      deathCause: o['deathCause'] as OrganismRuntimeState['deathCause'],
      deathTick: o['deathTick'] as number | null,
      genome: {
        morphology: {
          size: m['size'] as number,
          maxSpeed: m['maxSpeed'] as number,
          visionRange: m['visionRange'] as number,
          visionAngle: m['visionAngle'] as number,
          metabolism: m['metabolism'] as number,
        },
        neural: {
          inputHiddenWeights: numArray(n['inputHiddenWeights'], `organism[${i}] inputHiddenWeights`, hidden * NEURAL_INPUT_SIZE),
          hiddenBiases: numArray(n['hiddenBiases'], `organism[${i}] hiddenBiases`, hidden),
          hiddenOutputWeights: numArray(n['hiddenOutputWeights'], `organism[${i}] hiddenOutputWeights`, NEURAL_OUTPUT_SIZE * hidden),
          outputBiases: numArray(n['outputBiases'], `organism[${i}] outputBiases`, NEURAL_OUTPUT_SIZE),
        },
      },
    };
  });
  const food = (state['food'] as unknown[]).map((raw, i) => {
    if (!isObject(raw) || !isInt(raw['id']) || !isNum(raw['x']) || !isNum(raw['y'])) malformed(`food[${i}]`);
    return { id: raw['id'] as number, x: raw['x'] as number, y: raw['y'] as number };
  });
  const ascending = (xs: { id: number }[]) => xs.every((x, i) => i === 0 || xs[i - 1]!.id < x.id);
  if (!ascending(organisms)) malformed('organisms are not in strictly ascending id order');
  if (!ascending(food)) malformed('food is not in strictly ascending id order');

  const world: WorldState = {
    tick: state['tick'] as number,
    simulationVersion: state['simulationVersion'] as string,
    worldConfig: { width: wc['width'] as number, height: wc['height'] as number },
    fertility: { resolution: res, lattice },
    organisms,
    food,
    nextOrganismId: state['nextOrganismId'] as number,
    nextFoodId: state['nextFoodId'] as number,
    rng: { bootstrap: { ...bootstrap }, canonical: { ...canonical } },
  };
  if (hasNonFiniteCanonicalValue(world)) malformed('non-finite value in world state');
  return world;
}
