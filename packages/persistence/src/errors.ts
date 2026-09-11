import type { RecoveryReport } from './store.js';

/** Every way a snapshot can be refused. A refused snapshot is never repaired. */
export type SnapshotErrorCode =
  | 'INVALID_SERIALIZATION'
  | 'NON_CANONICAL_SERIALIZATION'
  | 'UNSUPPORTED_FORMAT_VERSION'
  | 'MALFORMED_SNAPSHOT'
  | 'CHECKSUM_MISMATCH'
  | 'INCOMPATIBLE_SIMULATION_VERSION'
  | 'CONFIG_HASH_MISMATCH'
  | 'INVALID_CONFIG'
  | 'INVALID_RNG_STATE'
  | 'MALFORMED_WORLD_STATE'
  | 'STATE_HASH_MISMATCH'
  | 'FILE_ERROR';

export class SnapshotError extends Error {
  readonly code: SnapshotErrorCode;
  constructor(code: SnapshotErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'SnapshotError';
    this.code = code;
  }
}

/**
 * Every way the snapshot store (a directory of snapshots belonging to one world)
 * can refuse an operation. Like SnapshotError, nothing is ever repaired: a
 * refused directory is left exactly as it was found.
 */
export type SnapshotStoreErrorCode =
  | 'WORLD_IDENTITY_MISMATCH'
  | 'STORE_IDENTITY_MISSING'
  | 'STORE_IDENTITY_INVALID'
  | 'DUPLICATE_TICK'
  | 'NON_MONOTONIC_TICK'
  | 'TICK_OUT_OF_RANGE'
  | 'FILENAME_TICK_MISMATCH'
  | 'INVALID_RETENTION'
  | 'NO_VALID_SNAPSHOT'
  | 'STORE_IO_ERROR';

export class SnapshotStoreError extends Error {
  readonly code: SnapshotStoreErrorCode;
  /** For recovery failures: every candidate that was tried and why it was skipped. */
  readonly report: RecoveryReport | undefined;
  constructor(code: SnapshotStoreErrorCode, message: string, report?: RecoveryReport) {
    super(`[${code}] ${message}`);
    this.name = 'SnapshotStoreError';
    this.code = code;
    this.report = report;
  }
}
