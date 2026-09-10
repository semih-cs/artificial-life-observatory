/**
 * Seed management — load and validate pilot/validation seed sets.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEEDS_DIR = path.resolve(__dirname, '../../seeds');

interface SeedFile {
  description: string;
  generationMethod: string;
  count: number;
  seeds: number[];
}

function loadSeedFile(name: string): SeedFile {
  const filePath = path.join(SEEDS_DIR, `${name}.json`);
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as SeedFile;
}

export function loadPilotSeeds(): number[] {
  return loadSeedFile('pilot').seeds;
}

export function loadValidationSeeds(): number[] {
  return loadSeedFile('validation').seeds;
}

/** Verify pilot and validation seeds are disjoint. */
export function verifySeedDisjointness(): boolean {
  const pilot = new Set(loadPilotSeeds());
  const validation = loadValidationSeeds();
  return validation.every(s => !pilot.has(s));
}
