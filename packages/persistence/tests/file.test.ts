import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { canonicalStateHash } from '@alo/simulation-core';
import {
  createSnapshot, serializeSnapshot, saveSnapshotAtomic, loadSnapshot, restoreSnapshot, SnapshotError, WorldSnapshotV1,
} from '../src/index.js';
import { defaultConfig, worldAt } from './helpers.js';

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'alo-snapfile-'));
const config = defaultConfig(11);
const worldA = worldAt(11, 400, config);
const worldB = worldAt(11, 900, config);
const snapA = createSnapshot(worldA, config);
const snapB = createSnapshot(worldB, config);

describe('atomic local-file persistence', () => {
  it('saves the deterministic serialization and loads it back exactly', () => {
    const d = dir();
    const file = path.join(d, 'world.snapshot.json');
    saveSnapshotAtomic(file, snapA);
    expect(fs.readFileSync(file, 'utf-8')).toBe(serializeSnapshot(snapA));
    expect(canonicalStateHash(restoreSnapshot(loadSnapshot(file)).world)).toBe(canonicalStateHash(worldA));
    expect(fs.readdirSync(d)).toEqual(['world.snapshot.json']); // no temporary file left behind
  });

  it('replaces an existing snapshot whole', () => {
    const d = dir();
    const file = path.join(d, 'world.snapshot.json');
    saveSnapshotAtomic(file, snapA);
    saveSnapshotAtomic(file, snapB);
    expect(loadSnapshot(file).tick).toBe(900);
    expect(fs.readdirSync(d)).toEqual(['world.snapshot.json']);
  });

  it('a partially written target is refused', () => {
    const d = dir();
    const file = path.join(d, 'world.snapshot.json');
    const text = serializeSnapshot(snapA);
    fs.writeFileSync(file, text.slice(0, text.length - 100));
    expect(() => loadSnapshot(file)).toThrow(SnapshotError);
    try { loadSnapshot(file); } catch (e) { expect((e as SnapshotError).code).toBe('INVALID_SERIALIZATION'); }
  });

  it('an interrupted write (stray temp file) never replaces the good snapshot', () => {
    const d = dir();
    const file = path.join(d, 'world.snapshot.json');
    saveSnapshotAtomic(file, snapA);
    // What a crash mid-write leaves: a partial temp file next to the intact target.
    fs.writeFileSync(path.join(d, '.world.snapshot.json.12345.1.tmp'), serializeSnapshot(snapB).slice(0, 500));
    expect(loadSnapshot(file).tick).toBe(400);
  });

  it('refuses to write an invalid snapshot and leaves the target untouched', () => {
    const d = dir();
    const file = path.join(d, 'world.snapshot.json');
    saveSnapshotAtomic(file, snapA);
    const tampered = JSON.parse(serializeSnapshot(snapB)) as WorldSnapshotV1;
    tampered.stateHash = 'ffffffffffffffff';
    expect(() => saveSnapshotAtomic(file, tampered)).toThrow(SnapshotError);
    expect(loadSnapshot(file).tick).toBe(400);
    expect(fs.readdirSync(d)).toEqual(['world.snapshot.json']);
  });

  it('reports file errors clearly', () => {
    const d = dir();
    try { loadSnapshot(path.join(d, 'missing.json')); throw new Error('no throw'); } catch (e) { expect((e as SnapshotError).code).toBe('FILE_ERROR'); }
    try { saveSnapshotAtomic(path.join(d, 'no-such-dir', 'x.json'), snapA); throw new Error('no throw'); } catch (e) { expect((e as SnapshotError).code).toBe('FILE_ERROR'); }
    expect(fs.existsSync(path.join(d, 'no-such-dir'))).toBe(false);
  });
});
