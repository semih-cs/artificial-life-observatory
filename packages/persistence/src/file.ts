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
import { serializeSnapshot, parseSnapshot, validateSnapshot, WorldSnapshot } from './snapshot.js';
import { SnapshotError } from './errors.js';

let tmpCounter = 0;

/**
 * Atomically replace `filePath` with `text`: write a uniquely named temporary
 * file in the same directory (`.<basename>.<pid>.<n>.tmp`), fsync it, rename it
 * over the target, then fsync the directory where the platform allows it. On
 * failure the temporary file is removed and the underlying error is rethrown;
 * the target is either untouched or wholly replaced.
 */
export function writeFileAtomic(filePath: string, text: string): void {
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
    throw err;
  }
  // Make the rename itself durable where the platform allows it.
  try {
    const dfd = fs.openSync(dir, 'r');
    try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); }
  } catch { /* directory fsync is unsupported on some platforms */ }
}

export function saveSnapshotAtomic(filePath: string, snapshot: WorldSnapshot): void {
  // Never write a snapshot that would not load.
  validateSnapshot(snapshot);
  const text = serializeSnapshot(snapshot);
  try {
    writeFileAtomic(filePath, text);
  } catch (err) {
    throw new SnapshotError('FILE_ERROR', `could not save snapshot to ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function loadSnapshot(filePath: string): WorldSnapshot {
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new SnapshotError('FILE_ERROR', `could not read snapshot ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return parseSnapshot(text);
}
