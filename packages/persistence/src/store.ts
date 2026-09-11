/**
 * Folder-based snapshot store (Phase 0C slice 2): operational persistence for
 * one canonical world. Spec v4 §14.38, §18.61, §19.21–§19.25.
 *
 * Directory layout:
 *
 *   <dir>/world-identity.json            the one world this directory belongs to
 *   <dir>/snapshot-000000010000.json     a snapshot (format v1) of the world after tick 10,000
 *   <dir>/.snapshot-….json.<pid>.<n>.tmp a transient atomic-write file — never a snapshot
 *
 * Rules:
 *
 *   - One directory = one world. The world identity is the pair
 *     (simulationVersion, configHash). configHash covers the complete immutable
 *     SimulationConfig, rootSeed included, so it already names the world; the
 *     version is kept explicit so a refusal says which one differs. The first
 *     save writes world-identity.json; every later save and every recovery is
 *     checked against it. Snapshots of another world are refused — never
 *     deleted, never mixed in.
 *   - File names are `snapshot-<tick, 12 digits zero-padded>.json`, so lexical
 *     order is tick order. Only exact matches are snapshot candidates.
 *   - Saves are atomic (temp → fsync → rename → fsync dir) and tick-monotonic.
 *     A save at an existing tick is accepted only if it is byte-identical
 *     (idempotent); different content at an existing tick is refused.
 *   - Retention: after a save is committed and read back byte-identical, all but
 *     the newest `keep` snapshots (default 5) are deleted, oldest first.
 *   - Recovery tries snapshots newest → oldest with full validation, skips and
 *     reports each invalid one, and returns the newest valid one. If none is
 *     valid it throws. It never creates a fresh world, and it never modifies
 *     the directory.
 *
 * Single writer: one process owns a store directory at a time.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
  parseSnapshot, restoreSnapshot, serializeSnapshot, validateSnapshot, computeSnapshotChecksum,
  SNAPSHOT_FORMAT_ID, WorldSnapshotV1, RestoredWorld,
} from './snapshot.js';
import { writeFileAtomic } from './file.js';
import { stableStringify } from './stableStringify.js';
import { SnapshotError, SnapshotErrorCode, SnapshotStoreError, SnapshotStoreErrorCode } from './errors.js';

export const STORE_IDENTITY_FILE = 'world-identity.json';
export const STORE_IDENTITY_FORMAT_ID = 'alo-snapshot-store-identity' as const;
export const STORE_IDENTITY_FORMAT_VERSION = 1;
export const DEFAULT_SNAPSHOT_RETENTION = 5;
export const SNAPSHOT_TICK_DIGITS = 12;
export const MAX_SNAPSHOT_TICK = 10 ** SNAPSHOT_TICK_DIGITS - 1;
const SNAPSHOT_FILE_RE = /^snapshot-(\d{12})\.json$/;

/** Which canonical world a snapshot or a store directory belongs to. */
export interface WorldIdentity {
  simulationVersion: string;
  configHash: string;
}

export interface StoredSnapshotEntry {
  tick: number;
  fileName: string;
  path: string;
}

export interface SaveToStoreOptions {
  /** How many of the newest snapshots to retain. Default 5. */
  keep?: number;
}

export interface SaveToStoreResult {
  tick: number;
  fileName: string;
  /** false when an identical snapshot for this tick was already stored. */
  written: boolean;
  /** File names deleted by retention, oldest first. */
  pruned: string[];
}

export interface SkippedSnapshot {
  fileName: string;
  tick: number;
  code: SnapshotErrorCode | SnapshotStoreErrorCode;
  reason: string;
}

/** What recovery looked at and decided. Plain data, no paths or timestamps: deterministic for a given directory content. */
export interface RecoveryReport {
  identity: WorldIdentity;
  /** Snapshot file names considered, newest first. */
  candidates: string[];
  selected: { fileName: string; tick: number; stateHash: string } | null;
  /** Newest first, each with its refusal code and reason. */
  skipped: SkippedSnapshot[];
}

export interface RecoveredWorld extends RestoredWorld {
  snapshot: WorldSnapshotV1;
  report: RecoveryReport;
}

// ---- identity --------------------------------------------------------------

export function worldIdentityOf(snapshot: WorldSnapshotV1): WorldIdentity {
  return { simulationVersion: snapshot.simulationVersion, configHash: snapshot.configHash };
}

export function sameWorldIdentity(a: WorldIdentity, b: WorldIdentity): boolean {
  return a.simulationVersion === b.simulationVersion && a.configHash === b.configHash;
}

const describeIdentity = (id: WorldIdentity) => `${id.simulationVersion}/${id.configHash}`;

function serializeIdentity(id: WorldIdentity): string {
  const payload = {
    format: STORE_IDENTITY_FORMAT_ID,
    storeFormatVersion: STORE_IDENTITY_FORMAT_VERSION,
    simulationVersion: id.simulationVersion,
    configHash: id.configHash,
  };
  const checksum = createHash('sha256').update(stableStringify(payload)).digest('hex');
  return stableStringify({ ...payload, checksum }) + '\n';
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const errnoCode = (err: unknown) => (err as NodeJS.ErrnoException | undefined)?.code ?? 'UNKNOWN';

/** The identity recorded in a store directory, or null if it has none. Refuses an invalid identity file. */
export function readStoreIdentity(dir: string): WorldIdentity | null {
  const file = path.join(dir, STORE_IDENTITY_FILE);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf-8');
  } catch (err) {
    if (errnoCode(err) === 'ENOENT') return null;
    throw new SnapshotStoreError('STORE_IO_ERROR', `could not read ${file}: ${errText(err)}`);
  }
  const invalid = (why: string) => new SnapshotStoreError('STORE_IDENTITY_INVALID', `${file} ${why}; the store is refused, not repaired`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw invalid('is not valid JSON');
  }
  if (!isObject(raw) || raw['format'] !== STORE_IDENTITY_FORMAT_ID || raw['storeFormatVersion'] !== STORE_IDENTITY_FORMAT_VERSION
    || typeof raw['simulationVersion'] !== 'string' || typeof raw['configHash'] !== 'string') {
    throw invalid('is not a store identity document of a supported version');
  }
  const id = { simulationVersion: raw['simulationVersion'], configHash: raw['configHash'] };
  if (serializeIdentity(id) !== text) throw invalid('does not match its checksum and canonical form');
  return id;
}

// ---- naming and listing ----------------------------------------------------

/** `snapshot-<tick, 12 digits>.json` — lexical order equals tick order. */
export function snapshotFileName(tick: number): string {
  if (!Number.isInteger(tick) || tick < 0 || tick > MAX_SNAPSHOT_TICK) {
    throw new SnapshotStoreError('TICK_OUT_OF_RANGE', `tick ${tick} cannot be stored (integer 0..${MAX_SNAPSHOT_TICK})`);
  }
  return `snapshot-${String(tick).padStart(SNAPSHOT_TICK_DIGITS, '0')}.json`;
}

/**
 * Snapshot files in a store directory, oldest first. Only regular files whose
 * name is exactly `snapshot-<12 digits>.json` count; temporary files and
 * anything else are ignored. A missing directory lists as empty.
 */
export function listSnapshots(dir: string): StoredSnapshotEntry[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (errnoCode(err) === 'ENOENT') return [];
    throw new SnapshotStoreError('STORE_IO_ERROR', `could not list ${dir}: ${errText(err)}`);
  }
  const out: StoredSnapshotEntry[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const m = SNAPSHOT_FILE_RE.exec(e.name);
    if (!m) continue;
    out.push({ tick: Number(m[1]), fileName: e.name, path: path.join(dir, e.name) });
  }
  return out.sort((a, b) => a.tick - b.tick);
}

// ---- save and retention ----------------------------------------------------

function checkRetention(keep: number): number {
  if (!Number.isInteger(keep) || keep < 1) throw new SnapshotStoreError('INVALID_RETENTION', `keep must be an integer >= 1, got ${keep}`);
  return keep;
}

/** Delete all but the newest `keep` entries, oldest first. */
function deleteBeyond(entries: StoredSnapshotEntry[], keep: number): string[] {
  const doomed = entries.slice(0, Math.max(0, entries.length - keep));
  for (const e of doomed) {
    try {
      fs.unlinkSync(e.path);
    } catch (err) {
      throw new SnapshotStoreError('STORE_IO_ERROR', `could not delete ${e.path}: ${errText(err)}`);
    }
  }
  return doomed.map((e) => e.fileName);
}

/**
 * Save a snapshot into a store directory, then apply retention.
 *
 * Refuses (and changes nothing) when: the snapshot is invalid; it belongs to
 * another world than the directory; its tick is older than the newest stored
 * snapshot; or its tick is already stored with different content. Saving a
 * byte-identical snapshot for an existing tick is a no-op. Older snapshots are
 * deleted only after the new file is committed and read back byte-identical.
 */
export function saveToStore(dir: string, snapshot: WorldSnapshotV1, options: SaveToStoreOptions = {}): SaveToStoreResult {
  const keep = checkRetention(options.keep ?? DEFAULT_SNAPSHOT_RETENTION);
  validateSnapshot(snapshot); // never store a snapshot that would not load
  const fileName = snapshotFileName(snapshot.tick);
  const text = serializeSnapshot(snapshot);
  const identity = worldIdentityOf(snapshot);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    throw new SnapshotStoreError('STORE_IO_ERROR', `could not create store directory ${dir}: ${errText(err)}`);
  }

  const existing = listSnapshots(dir);
  const stored = readStoreIdentity(dir);
  if (stored === null) {
    if (existing.length > 0) {
      throw new SnapshotStoreError('STORE_IDENTITY_MISSING', `${dir} holds snapshots but no ${STORE_IDENTITY_FILE}; refusing to guess which world it belongs to`);
    }
    try {
      writeFileAtomic(path.join(dir, STORE_IDENTITY_FILE), serializeIdentity(identity));
    } catch (err) {
      throw new SnapshotStoreError('STORE_IO_ERROR', `could not write ${STORE_IDENTITY_FILE} in ${dir}: ${errText(err)}`);
    }
  } else if (!sameWorldIdentity(stored, identity)) {
    throw new SnapshotStoreError('WORLD_IDENTITY_MISMATCH',
      `snapshot belongs to world ${describeIdentity(identity)} but ${dir} belongs to ${describeIdentity(stored)}; worlds are never mixed`);
  }

  const target = path.join(dir, fileName);
  const bytes = Buffer.from(text, 'utf-8');
  if (existing.some((e) => e.tick === snapshot.tick)) {
    let current: Buffer;
    try {
      current = fs.readFileSync(target);
    } catch (err) {
      throw new SnapshotStoreError('STORE_IO_ERROR', `could not read existing ${target}: ${errText(err)}`);
    }
    if (current.equals(bytes)) return { tick: snapshot.tick, fileName, written: false, pruned: [] };
    throw new SnapshotStoreError('DUPLICATE_TICK', `${fileName} already exists with different content; it is never overwritten`);
  }
  const newest = existing[existing.length - 1];
  if (newest !== undefined && snapshot.tick < newest.tick) {
    throw new SnapshotStoreError('NON_MONOTONIC_TICK', `tick ${snapshot.tick} is older than the newest stored snapshot (${newest.fileName})`);
  }

  try {
    writeFileAtomic(target, text);
  } catch (err) {
    throw new SnapshotStoreError('STORE_IO_ERROR', `could not save ${target}: ${errText(err)}`);
  }
  // Commit check: nothing is deleted unless the new snapshot reads back exactly.
  let readBack: Buffer;
  try {
    readBack = fs.readFileSync(target);
  } catch (err) {
    throw new SnapshotStoreError('STORE_IO_ERROR', `could not read back ${target}; nothing pruned: ${errText(err)}`);
  }
  if (!readBack.equals(bytes)) throw new SnapshotStoreError('STORE_IO_ERROR', `${target} did not read back byte-identical; nothing pruned`);

  const pruned = deleteBeyond(listSnapshots(dir), keep);
  return { tick: snapshot.tick, fileName, written: true, pruned };
}

/**
 * Delete all but the newest `keep` snapshots (default 5). Refuses, deleting
 * nothing, unless at least one retained snapshot is valid and belongs to this
 * store's world — so the last valid snapshot is never pruned away.
 */
export function pruneSnapshots(dir: string, keep: number = DEFAULT_SNAPSHOT_RETENTION): string[] {
  checkRetention(keep);
  const entries = listSnapshots(dir);
  if (entries.length <= keep) return [];
  const identity = readStoreIdentity(dir);
  if (identity === null) {
    throw new SnapshotStoreError('STORE_IDENTITY_MISSING', `${dir} holds snapshots but no ${STORE_IDENTITY_FILE}; refusing to prune`);
  }
  const retained = entries.slice(entries.length - keep).reverse();
  if (!retained.some((e) => inspectCandidate(e, identity).ok)) {
    throw new SnapshotStoreError('NO_VALID_SNAPSHOT', `none of the newest ${keep} snapshots in ${dir} is valid; refusing to prune older ones`);
  }
  return deleteBeyond(entries, keep);
}

// ---- recovery --------------------------------------------------------------

type Inspection = { ok: true; snapshot: WorldSnapshotV1 } | { ok: false; skip: SkippedSnapshot };

/**
 * The identity of an intact snapshot of ANOTHER world, else null. Identity
 * fields are only trusted when the content's checksum verifies: a corrupt
 * file is skipped as corrupt, while an intact foreign snapshot refuses the
 * whole directory.
 */
function intactForeignIdentity(text: string, identity: WorldIdentity): WorldIdentity | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(raw) || raw['format'] !== SNAPSHOT_FORMAT_ID || typeof raw['checksum'] !== 'string'
    || typeof raw['simulationVersion'] !== 'string' || typeof raw['configHash'] !== 'string') return null;
  let expected: string;
  try {
    expected = computeSnapshotChecksum(raw);
  } catch {
    return null;
  }
  if (expected !== raw['checksum']) return null;
  const id = { simulationVersion: raw['simulationVersion'], configHash: raw['configHash'] };
  return sameWorldIdentity(id, identity) ? null : id;
}

function inspectCandidate(e: StoredSnapshotEntry, identity: WorldIdentity): Inspection {
  const skip = (code: SkippedSnapshot['code'], reason: string): Inspection => ({ ok: false, skip: { fileName: e.fileName, tick: e.tick, code, reason } });
  let text: string;
  try {
    text = fs.readFileSync(e.path, 'utf-8');
  } catch (err) {
    return skip('FILE_ERROR', `could not read file (${errnoCode(err)})`);
  }
  const foreign = intactForeignIdentity(text, identity);
  if (foreign !== null) {
    throw new SnapshotStoreError('WORLD_IDENTITY_MISMATCH',
      `${e.fileName} is an intact snapshot of world ${describeIdentity(foreign)}, but this store belongs to ${describeIdentity(identity)}; refusing the mixed directory`);
  }
  let snapshot: WorldSnapshotV1;
  try {
    snapshot = parseSnapshot(text);
  } catch (err) {
    if (err instanceof SnapshotError) return skip(err.code, err.message);
    throw err;
  }
  if (snapshot.tick !== e.tick) return skip('FILENAME_TICK_MISMATCH', `file name says tick ${e.tick}, content is tick ${snapshot.tick}`);
  return { ok: true, snapshot };
}

/**
 * Recover the newest valid snapshot of the world stored in `dir`.
 *
 * Tries snapshots newest → oldest with full validation; skips and reports each
 * one that fails. Throws SnapshotStoreError:
 *   - NO_VALID_SNAPSHOT        the directory is missing, empty, or every snapshot is invalid
 *                              (the error carries the report);
 *   - WORLD_IDENTITY_MISMATCH  an intact snapshot of another world is present;
 *   - STORE_IDENTITY_MISSING / STORE_IDENTITY_INVALID.
 * Never creates a fresh world. Reads only: the directory is left unchanged.
 */
export function recoverLatestValid(dir: string): RecoveredWorld {
  if (!fs.existsSync(dir)) {
    throw new SnapshotStoreError('NO_VALID_SNAPSHOT', `store directory ${dir} does not exist; there is no world to recover, and recovery never creates one`);
  }
  const entries = listSnapshots(dir);
  const identity = readStoreIdentity(dir);
  if (identity === null) {
    if (entries.length > 0) {
      throw new SnapshotStoreError('STORE_IDENTITY_MISSING', `${dir} holds snapshots but no ${STORE_IDENTITY_FILE}; refusing to guess which world it belongs to`);
    }
    throw new SnapshotStoreError('NO_VALID_SNAPSHOT', `${dir} is not a snapshot store (no ${STORE_IDENTITY_FILE}, no snapshots); recovery never creates a world`);
  }
  const newestFirst = [...entries].reverse();
  const report: RecoveryReport = { identity, candidates: newestFirst.map((e) => e.fileName), selected: null, skipped: [] };
  for (const e of newestFirst) {
    const inspection = inspectCandidate(e, identity);
    if (!inspection.ok) {
      report.skipped.push(inspection.skip);
      continue;
    }
    const { snapshot } = inspection;
    report.selected = { fileName: e.fileName, tick: snapshot.tick, stateHash: snapshot.stateHash };
    return { snapshot, ...restoreSnapshot(snapshot), report };
  }
  const detail = report.skipped.map((s) => `${s.fileName}: ${s.code}`).join('; ');
  throw new SnapshotStoreError('NO_VALID_SNAPSHOT',
    entries.length === 0
      ? `${dir} contains no snapshots; recovery never creates a world`
      : `none of the ${entries.length} snapshots in ${dir} is valid (${detail}); recovery never creates a world`,
    report);
}
