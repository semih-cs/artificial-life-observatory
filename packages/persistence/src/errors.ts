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
