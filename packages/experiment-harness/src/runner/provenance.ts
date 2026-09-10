/**
 * Run provenance: which code actually produced a result.
 *
 * `gitCommit` alone is not enough. It says nothing about uncommitted changes,
 * and a run consumes the *built* `dist` of `@alo/simulation-core`, which can
 * differ from the source the recorded commit names. That gap is exactly how one
 * persisted replicate came to disagree with the tree it claimed to come from
 * (docs/Phase 0B Pilot Report.md §9).
 *
 * Three fields close it:
 *
 *   gitCommit      - HEAD at run time, or null outside a repository
 *   gitDirty       - whether the worktree had uncommitted changes
 *   sourceIdentity - a deterministic hash of the JavaScript that actually ran
 *
 * `sourceIdentity` hashes the built output of both workspace packages. Because
 * the `experiment` script rebuilds `simulation-core` before running, that build
 * reflects the working source including uncommitted edits - so two runs from
 * different source states get different identities even at the same commit, and
 * a run against a stale build is distinguishable from one against a fresh build.
 *
 * This is deliberately small. It records identity; it does not try to
 * reconstruct or diff code.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { hash64 } from '@alo/simulation-core';

export interface RunProvenance {
  /** HEAD commit at run time, or null when git is unavailable. */
  gitCommit: string | null;
  /** True when the worktree had uncommitted changes; null when unknown. */
  gitDirty: boolean | null;
  /** Deterministic hash of the built JavaScript that produced the result. */
  sourceIdentity: string;
}

/**
 * This module lives at `<package>/src/runner/` when running from source and
 * `<package>/dist/runner/` when running built, so two levels up is the package
 * directory in both layouts.
 */
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The built output whose hash identifies the code that actually runs. */
export const IDENTITY_DIRECTORIES: readonly string[] = [
  path.join(PACKAGE_ROOT, '..', 'simulation-core', 'dist'),
  path.join(PACKAGE_ROOT, 'dist'),
];

/**
 * Hash a set of directory trees: every file with one of `extensions`, ordered
 * by relative path, contributing both its path and its content.
 *
 * Path-inclusive so that renaming or adding a file changes the hash, and
 * independent of filesystem enumeration order so the result is stable.
 * A directory that does not exist contributes nothing rather than throwing -
 * a caller may legitimately have only one package built.
 */
export function hashDirectoryTrees(dirs: readonly string[], extensions: readonly string[] = ['.js']): string {
  const parts: string[] = [];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files: string[] = [];
    const walk = (current: string): void => {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (extensions.some((e) => entry.name.endsWith(e))) files.push(full);
      }
    };
    walk(dir);
    files.sort();
    for (const file of files) {
      parts.push(path.relative(dir, file).split(path.sep).join('/'));
      parts.push(fs.readFileSync(file, 'utf-8'));
    }
  }

  return hash64(parts.join(' '));
}

function readGit(): { gitCommit: string | null; gitDirty: boolean | null } {
  try {
    const gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: PACKAGE_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: PACKAGE_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { gitCommit, gitDirty: status.trim().length > 0 };
  } catch {
    return { gitCommit: null, gitDirty: null };
  }
}

let cached: RunProvenance | null = null;

/**
 * Provenance for this process. Computed once and reused: it describes the code
 * that is running, which cannot change while it runs.
 */
export function runProvenance(): RunProvenance {
  if (cached) return cached;
  const git = readGit();
  cached = {
    gitCommit: git.gitCommit,
    gitDirty: git.gitDirty,
    sourceIdentity: hashDirectoryTrees(IDENTITY_DIRECTORIES),
  };
  return cached;
}

/**
 * The hash of an empty file set. A `sourceIdentity` equal to this means nothing
 * was hashed — the identity would be a meaningless constant rather than a
 * description of the running code. Asserted against by test.
 */
export const EMPTY_IDENTITY = hashDirectoryTrees([]);

/** Test seam: drop the memoized value. */
export function resetRunProvenanceCache(): void {
  cached = null;
}
