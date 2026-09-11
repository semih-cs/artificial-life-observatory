import { describe, it, expect } from 'vitest';
import {
  createSnapshot, serializeSnapshot, parseSnapshot, restoreSnapshot, validateSnapshot, computeSnapshotChecksum,
  SnapshotError, SnapshotErrorCode, WorldSnapshotV1,
} from '../src/index.js';
import { defaultConfig, worldAt } from './helpers.js';

const config = defaultConfig(7);
const good = createSnapshot(worldAt(7, 800, config), config);
const goodText = serializeSnapshot(good);

/** A mutable deep copy. */
const copy = (): Record<string, any> => JSON.parse(goodText);
/** Recompute the checksum so the failure is the targeted one, not CHECKSUM_MISMATCH. */
const reseal = (o: Record<string, any>) => { o['checksum'] = computeSnapshotChecksum(o); return o; };

function expectCode(fn: () => unknown, code: SnapshotErrorCode) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(SnapshotError);
    expect((err as SnapshotError).code).toBe(code);
    expect((err as SnapshotError).message).toContain(code);
    return;
  }
  throw new Error(`expected ${code}, but nothing was thrown`);
}
const rejects = (o: unknown, code: SnapshotErrorCode) => {
  expectCode(() => validateSnapshot(o), code);
  expectCode(() => parseSnapshot(JSON.stringify(o)), code);
  expectCode(() => restoreSnapshot(o as WorldSnapshotV1), code);
};

describe('corrupt snapshots are refused, never repaired', () => {
  it('the uncorrupted snapshot is accepted', () => {
    expect(() => parseSnapshot(goodText)).not.toThrow();
  });

  it('a single flipped byte anywhere is rejected (300 positions across the file)', () => {
    const n = goodText.length;
    let tested = 0;
    for (let k = 0; k < 300; k++) {
      const pos = Math.floor((k * (n - 1)) / 299);
      const flipped = goodText.slice(0, pos) + String.fromCharCode(goodText.charCodeAt(pos) ^ 1) + goodText.slice(pos + 1);
      expect(() => parseSnapshot(flipped), `flip at ${pos}`).toThrow(SnapshotError);
      tested++;
    }
    expect(tested).toBe(300);
  });

  it('text that decodes to identical values but is not the canonical serialization', () => {
    // Find a 17-significant-digit double whose last digit can flip without changing
    // the float it parses to: the value-level checksum cannot see that change, the
    // byte-level canonical check must.
    const re = /-?\d\.\d{16}(?=[,\]}])/g;
    let alt: string | null = null;
    for (let m = re.exec(goodText); m && !alt; m = re.exec(goodText)) {
      const last = m.index + m[0].length - 1;
      const variant = m[0].slice(0, -1) + String.fromCharCode(m[0].charCodeAt(m[0].length - 1) ^ 1);
      if (Number(variant) === Number(m[0])) alt = goodText.slice(0, last) + variant.slice(-1) + goodText.slice(last + 1);
    }
    expect(alt).not.toBeNull();
    expect(computeSnapshotChecksum(JSON.parse(alt!))).toBe(good.checksum); // invisible to the value checksum
    expectCode(() => parseSnapshot(alt!), 'NON_CANONICAL_SERIALIZATION');
    expectCode(() => parseSnapshot(goodText.trimEnd()), 'NON_CANONICAL_SERIALIZATION'); // missing trailing newline
    expectCode(() => parseSnapshot(JSON.stringify(good)), 'NON_CANONICAL_SERIALIZATION'); // same content, unsorted keys
  });

  it('malformed or truncated serialization', () => {
    expectCode(() => parseSnapshot(''), 'INVALID_SERIALIZATION');
    expectCode(() => parseSnapshot('not json'), 'INVALID_SERIALIZATION');
    expectCode(() => parseSnapshot(goodText.slice(0, Math.floor(goodText.length / 2))), 'INVALID_SERIALIZATION');
    expectCode(() => parseSnapshot('{}'), 'MALFORMED_SNAPSHOT');
    expectCode(() => parseSnapshot('[1,2,3]'), 'MALFORMED_SNAPSHOT');
  });

  it('wrong checksum', () => {
    const o = copy();
    o['checksum'] = '0'.repeat(64);
    rejects(o, 'CHECKSUM_MISMATCH');
    const p = copy();
    p['state']['organisms'][0]['energy'] += 1; // content changed, checksum stale
    rejects(p, 'CHECKSUM_MISMATCH');
  });

  it('wrong state hash', () => {
    const o = copy();
    o['stateHash'] = '0123456789abcdef';
    rejects(reseal(o), 'STATE_HASH_MISMATCH');
    const p = copy();
    p['state']['organisms'][0]['energy'] += 1; // tampered and resealed, stateHash stale
    rejects(reseal(p), 'STATE_HASH_MISMATCH');
  });

  it('missing RNG state', () => {
    for (const drop of ['canonical', 'bootstrap'] as const) {
      const o = copy();
      delete o['state']['rng'][drop];
      rejects(reseal(o), 'INVALID_RNG_STATE');
    }
    const o = copy();
    delete o['state']['rng'];
    rejects(reseal(o), 'INVALID_RNG_STATE');
  });

  it('malformed RNG state', () => {
    const bad: Array<(r: Record<string, any>) => void> = [
      (r) => { r['s0'] = -1; },
      (r) => { r['s1'] = 2 ** 32; },
      (r) => { r['s2'] = 1.5; },
      (r) => { r['s3'] = '7'; },
      (r) => { delete r['s0']; },
      (r) => { r['s0'] = 0; r['s1'] = 0; r['s2'] = 0; r['s3'] = 0; },
    ];
    for (const stream of ['canonical', 'bootstrap'] as const) {
      for (const f of bad) {
        const o = copy();
        f(o['state']['rng'][stream]);
        rejects(reseal(o), 'INVALID_RNG_STATE');
      }
    }
  });

  it('wrong snapshot format version', () => {
    const o = copy();
    o['snapshotFormatVersion'] = 2;
    rejects(o, 'UNSUPPORTED_FORMAT_VERSION');
    rejects(reseal(o), 'UNSUPPORTED_FORMAT_VERSION');
  });

  it('incompatible simulation version', () => {
    const o = copy();
    o['simulationVersion'] = '0A.9.9';
    o['config']['simulationVersion'] = '0A.9.9';
    o['state']['simulationVersion'] = '0A.9.9';
    o['configHash'] = '';
    rejects(reseal(o), 'INCOMPATIBLE_SIMULATION_VERSION');
    const p = copy();
    p['simulationVersion'] = '0A.1.0'; // supported, but disagrees with its own config and state
    rejects(reseal(p), 'INCOMPATIBLE_SIMULATION_VERSION');
  });

  it('modified config with a stale configHash', () => {
    const o = copy();
    o['config']['energy']['foodEnergyValue'] = 26;
    rejects(reseal(o), 'CONFIG_HASH_MISMATCH');
  });

  it('structurally broken world state', () => {
    const o = copy();
    o['state']['organisms'] = 'none';
    rejects(reseal(o), 'MALFORMED_WORLD_STATE');
    const p = copy();
    p['state']['organisms'][0]['genome']['neural']['outputBiases'].pop();
    rejects(reseal(p), 'MALFORMED_WORLD_STATE');
    const q = copy();
    q['state']['organisms'].reverse(); // canonical order is ascending id
    rejects(reseal(q), 'MALFORMED_WORLD_STATE');
  });
});
