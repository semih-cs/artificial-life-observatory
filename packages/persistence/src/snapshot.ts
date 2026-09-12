/**
 * Canonical world snapshot — format v1 (Phase 0C slice 1) and format v2 (V2.2).
 *
 * Two formats, one per controller kind, chosen by the snapshot's model:
 *   - format v1: the feed-forward models 0A.1.0, 0A.2.0, 0A.3.0 — exactly the
 *     historical format; every existing v1 file reads, re-serialises and
 *     resumes as before.
 *   - format v2: the recurrent models 0A.4.0 and 0A.5.0. Their canonical state additionally
 *     stores each organism's runtime memory `hiddenState` and its genome's
 *     `recurrentHiddenWeights`. Memory is future-affecting runtime state, so a
 *     recurrent world is never stored without it — hence a new format rather
 *     than a silent extension of v1.
 * A snapshot's format must match its model (checked before anything else is
 * trusted); nothing is ever converted between formats or models.
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
 *   - One format, several models. The stored record has the same shape for
 *     every supported model; what differs by model is the neural input
 *     dimension of every genome (6 for 0A.1.0 / 0A.2.0, 10 for 0A.3.0). The
 *     snapshot's own `simulationVersion` — which must agree with its config and
 *     state — selects that dimension through simulation-core's model registry,
 *     and genomes of any other length are refused. A snapshot is never
 *     converted between models: a 0A.2.0 snapshot restores and resumes as
 *     0A.2.0, under its historical six-input semantics.
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
  ORGANISM_SENSING_MODEL_VERSION,
  RECURRENT_MEMORY_MODEL_VERSION,
  PHYSICAL_BODIES_MODEL_VERSION,
  NEURAL_OUTPUT_SIZE,
  simulationModel,
} from '@alo/simulation-core';
import type { SimulationConfig, WorldState, OrganismRuntimeState, Xoshiro128State } from '@alo/simulation-core';
import { stableStringify } from './stableStringify.js';
import { SnapshotError } from './errors.js';

export const SNAPSHOT_FORMAT_ID = 'alo-canonical-world-snapshot' as const;
/** Format v1: the feed-forward models (0A.1.0, 0A.2.0, 0A.3.0). */
export const SNAPSHOT_FORMAT_VERSION = 1;
/** Format v2: the recurrent models 0A.4.0 and 0A.5.0 — v1 plus per-organism memory and recurrent weights. */
export const RECURRENT_SNAPSHOT_FORMAT_VERSION = 2;
/** Every format this loader reads. */
export const SUPPORTED_SNAPSHOT_FORMAT_VERSIONS: readonly number[] = [SNAPSHOT_FORMAT_VERSION, RECURRENT_SNAPSHOT_FORMAT_VERSION];

/**
 * Simulation versions this package can restore. `0A.5.0` is the V2.3
 * physical-bodies model and `0A.4.0` the V2.2 recurrent-memory model (both
 * format v2); `0A.3.0` is the V2.1 organism-sensing model (10-input
 * feed-forward controllers); `0A.2.0` is the frozen v1 canonical model;
 * `0A.1.0` is the historical single-founder model. Adding 0A.3.0 did not
 * change the stored shape (format v1); adding 0A.4.0 did (format v2). Adding
 * 0A.5.0 did NOT: physical bodies add no future-affecting per-organism state
 * beyond position, morphology and the existing memory, all of which format v2
 * already stores — so 0A.5.0 reuses format v2 unchanged, and no format v3
 * exists.
 */
export const SUPPORTED_SIMULATION_VERSIONS: readonly string[] = [
  PHYSICAL_BODIES_MODEL_VERSION, RECURRENT_MEMORY_MODEL_VERSION, ORGANISM_SENSING_MODEL_VERSION, MULTI_FOUNDER_MODEL_VERSION, SINGLE_FOUNDER_MODEL_VERSION,
];

/** The one format a supported model is stored in: 2 for the recurrent models, 1 for the feed-forward ones. */
export function snapshotFormatVersionFor(simulationVersion: string): 1 | 2 {
  return simulationModel(simulationVersion).recurrent ? 2 : 1;
}

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

/**
 * The world record stored in a v2 snapshot (models 0A.4.0 and 0A.5.0): the v1 record,
 * with every organism also carrying `hiddenState` and its neural genome
 * `recurrentHiddenWeights` — exactly `canonicalizeWorldState` for a recurrent
 * world.
 */
export interface CanonicalWorldStateV2 extends Omit<CanonicalWorldStateV1, 'organisms'> {
  organisms: Array<CanonicalWorldStateV1['organisms'][number] & {
    genome: {
      morphology: CanonicalWorldStateV1['organisms'][number]['genome']['morphology'];
      neural: CanonicalWorldStateV1['organisms'][number]['genome']['neural'] & { recurrentHiddenWeights: number[] };
    };
    hiddenState: number[];
  }>;
}

export interface WorldSnapshotV2 extends Omit<WorldSnapshotV1, 'snapshotFormatVersion' | 'state'> {
  snapshotFormatVersion: 2;
  state: CanonicalWorldStateV2;
}

/** A snapshot of either format; `snapshotFormatVersion` discriminates. */
export type WorldSnapshot = WorldSnapshotV1 | WorldSnapshotV2;

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
export function computeSnapshotChecksum(snapshot: Omit<WorldSnapshot, 'checksum'> | Record<string, unknown>): string {
  const { checksum: _ignored, ...payload } = snapshot as Record<string, unknown>;
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

/** Deep, detached copy through the deterministic serializer. */
function detach<T>(value: T): T {
  return JSON.parse(stableStringify(value)) as T;
}

/**
 * Capture a world and the configuration it runs under. Reads only; the world
 * and config are never modified, and no RNG is touched. The format follows
 * the model: v2 (with memory) for 0A.4.0 and 0A.5.0, v1 for the feed-forward models.
 */
export function createSnapshot(world: WorldState, config: SimulationConfig): WorldSnapshot {
  if (world.simulationVersion !== config.simulationVersion) {
    throw new SnapshotError('INCOMPATIBLE_SIMULATION_VERSION',
      `world is ${world.simulationVersion} but config is ${config.simulationVersion}`);
  }
  if (!SUPPORTED_SIMULATION_VERSIONS.includes(world.simulationVersion)) {
    throw new SnapshotError('INCOMPATIBLE_SIMULATION_VERSION', `simulation version ${world.simulationVersion} is not supported by this snapshot loader`);
  }
  validateConfig(config);
  const payload = {
    format: SNAPSHOT_FORMAT_ID,
    snapshotFormatVersion: snapshotFormatVersionFor(world.simulationVersion),
    simulationVersion: world.simulationVersion,
    tick: world.tick,
    config: detach(config),
    configHash: configHash(config),
    state: detach(canonicalizeWorldState(world)) as CanonicalWorldStateV1,
    stateHash: canonicalStateHash(world),
  };
  return { ...payload, checksum: computeSnapshotChecksum(payload) } as WorldSnapshot;
}

/** Deterministic text form: sorted keys, no whitespace, trailing newline. */
export function serializeSnapshot(snapshot: WorldSnapshot): string {
  return stableStringify(snapshot) + '\n';
}

/** Parse and fully validate. Throws SnapshotError on any problem; never repairs. */
export function parseSnapshot(serialized: string): WorldSnapshot {
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
export function validateSnapshot(candidate: unknown): WorldSnapshot {
  validateAndRestore(candidate);
  return candidate as WorldSnapshot;
}

/**
 * Rebuild the live world and its configuration. Validates first; the result is
 * made of fresh objects that share nothing with the snapshot.
 */
export function restoreSnapshot(snapshot: WorldSnapshot): RestoredWorld {
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
  const formatVersion = candidate['snapshotFormatVersion'];
  if (typeof formatVersion !== 'number' || !SUPPORTED_SNAPSHOT_FORMAT_VERSIONS.includes(formatVersion)) {
    throw new SnapshotError('UNSUPPORTED_FORMAT_VERSION',
      `snapshot format version ${String(formatVersion)} is not supported (this loader reads ${SUPPORTED_SNAPSHOT_FORMAT_VERSIONS.join(', ')})`);
  }
  const s = candidate;
  if (typeof s['simulationVersion'] !== 'string') throw new SnapshotError('MALFORMED_SNAPSHOT', 'simulationVersion missing or not a string');
  // Each model has exactly one format: a feed-forward model is never stored as
  // v2 and the recurrent model never as v1 (it would lose its memory).
  if (SUPPORTED_SIMULATION_VERSIONS.includes(s['simulationVersion'])
    && snapshotFormatVersionFor(s['simulationVersion']) !== formatVersion) {
    throw new SnapshotError('UNSUPPORTED_FORMAT_VERSION',
      `model ${s['simulationVersion']} is stored in snapshot format v${snapshotFormatVersionFor(s['simulationVersion'])}, not v${formatVersion}`);
  }
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
  // The model's own layout — never one global count. The caller has already
  // checked that snapshot, config and state agree on the version, and that the
  // format matches it.
  const model = simulationModel(config.simulationVersion);
  const inputSize = model.neuralInputSize;
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
    // Recurrent (format v2): memory and recurrent weights are required, with
    // the configured sizes and finite values. Feed-forward (format v1): they
    // must be absent — an old model never carries memory, and a recurrent
    // record can never pass as feed-forward.
    let hiddenState: number[] | undefined;
    let recurrentHiddenWeights: number[] | undefined;
    if (model.recurrent) {
      hiddenState = numArray(o['hiddenState'], `organism[${i}] hiddenState`, hidden);
      recurrentHiddenWeights = numArray(n['recurrentHiddenWeights'], `organism[${i}] recurrentHiddenWeights`, hidden * hidden);
    } else if ('hiddenState' in o || 'recurrentHiddenWeights' in n) {
      malformed(`organism[${i}] carries recurrent state, but model ${config.simulationVersion} is feed-forward`);
    }
    const organism: OrganismRuntimeState = {
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
          inputHiddenWeights: numArray(n['inputHiddenWeights'], `organism[${i}] inputHiddenWeights`, hidden * inputSize),
          hiddenBiases: numArray(n['hiddenBiases'], `organism[${i}] hiddenBiases`, hidden),
          hiddenOutputWeights: numArray(n['hiddenOutputWeights'], `organism[${i}] hiddenOutputWeights`, NEURAL_OUTPUT_SIZE * hidden),
          outputBiases: numArray(n['outputBiases'], `organism[${i}] outputBiases`, NEURAL_OUTPUT_SIZE),
          ...(recurrentHiddenWeights !== undefined ? { recurrentHiddenWeights } : {}),
        },
      },
    };
    if (hiddenState !== undefined) organism.hiddenState = hiddenState;
    return organism;
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
