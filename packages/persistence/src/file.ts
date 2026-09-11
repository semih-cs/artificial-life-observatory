/**
 * Local-file persistence for snapshots, with an atomic replace (Spec §19.18):
 *
 *   write <target>.<unique>.tmp  →  fsync  →  close  →  rename over <target>  →  fsync directory
 *
 * rename(2) within one directory is atomic on POSIX filesystems, so a reader
 * sees either the previous complete snapshot or the new complete snapshot,
 * never a partial one. A stray temporary file is never read by loadSnapshot.
 * Anything at the target that does not validate is refused, not repaired.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { serializeSnapshot, parseSnapshot, validateSnapshot, WorldSnapshotV1 } from './snapshot.js';
import { SnapshotError } from './errors.js';

let tmpCounter = 0;

export function saveSnapshotAtomic(filePath: string, snapshot: WorldSnapshotV1): void {
  // Never write a snapshot that would not load.
  validateSnapshot(snapshot);
  const text = serializeSnapshot(snapshot);
  const dir = path.dirname(path.resolve(filePath));
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${++tmpCounter}.tmp`);
  let fd: number | null = null;
  try {
    fd = fs.openSync(tmp, 'wx');
    fs.writeFileSync(fd, text, 'utf-8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, filePath);
  } catch (err) {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* already failing */ } }
    try { fs.unlinkSync(tmp); } catch { /* may not exist */ }
    throw new SnapshotError('FILE_ERROR', `could not save snapshot to ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  // Make the rename itself durable where the platform allows it.
  try {
    const dfd = fs.openSync(dir, 'r');
    try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); }
  } catch { /* directory fsync is unsupported on some platforms */ }
}

export function loadSnapshot(filePath: string): WorldSnapshotV1 {
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new SnapshotError('FILE_ERROR', `could not read snapshot ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return parseSnapshot(text);
}
