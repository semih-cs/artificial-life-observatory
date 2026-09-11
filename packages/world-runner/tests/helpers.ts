import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { bootstrapWorld, cloneConfig, DEFAULT_SIMULATION_CONFIG, runTicks, canonicalStateHash } from '@alo/simulation-core';
import type { SimulationConfig } from '@alo/simulation-core';

export const GOLDEN_SEED = 20260910;
export const GOLDEN_HASH_10000 = 'b95a0b4ef7dd8449';

export function seedConfig(seed: number): SimulationConfig {
  const c = cloneConfig(DEFAULT_SIMULATION_CONFIG);
  c.rootSeed = seed;
  return c;
}

/** Canonical hash of one uninterrupted direct simulation (no runner, no saves). */
export function directHash(seed: number, ticks: number): string {
  const c = seedConfig(seed);
  return canonicalStateHash(runTicks(bootstrapWorld(c), c, ticks).world);
}

/** A fresh, not-yet-existing world directory. */
export const newWorldDir = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'alo-world-')), 'world');

/** Every file (recursively) with its content hash: proves an operation changed nothing. */
export function dirState(d: string): string[] {
  if (!fs.existsSync(d)) return ['<missing>'];
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const n of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, n);
      if (fs.statSync(p).isDirectory()) { out.push(`${prefix}${n}/`); walk(p, `${prefix}${n}/`); }
      else out.push(`${prefix}${n}:${createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
    }
  };
  walk(d, '');
  return out;
}

export function flipByte(file: string): Buffer {
  const b = fs.readFileSync(file);
  b[Math.floor(b.length / 2)]! ^= 0x01;
  fs.writeFileSync(file, b);
  return b;
}
