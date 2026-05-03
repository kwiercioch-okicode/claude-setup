'use strict';

/**
 * git-cache.js - Cached git state with short TTL.
 *
 * Hooks fire many times per session. Each execSync('git ...') costs 30-80ms.
 * Cache the result in /tmp keyed by cwd; refresh when older than TTL_MS.
 */

const { execSync } = require('node:child_process');
const { existsSync, readFileSync, writeFileSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createHash } = require('node:crypto');

const TTL_MS = 5000;

function cachePath(cwd) {
  const hash = createHash('sha1').update(cwd).digest('hex').slice(0, 12);
  return join(tmpdir(), `devflow-git-${hash}.json`);
}

function readCache(cwd) {
  const p = cachePath(cwd);
  if (!existsSync(p)) return null;
  try {
    const ageMs = Date.now() - statSync(p).mtimeMs;
    if (ageMs > TTL_MS) return null;
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(cwd, state) {
  try {
    writeFileSync(cachePath(cwd), JSON.stringify(state));
  } catch {
    // Cache failure is non-fatal.
  }
}

function loadGitState(cwd = process.cwd()) {
  const cached = readCache(cwd);
  if (cached) return cached;

  const state = { branch: null, gitDir: null, hasMergeHead: false, inRepo: false };
  try {
    state.branch = execSync('git branch --show-current', { encoding: 'utf8', cwd }).trim();
    state.gitDir = execSync('git rev-parse --git-dir', { encoding: 'utf8', cwd }).trim();
    state.inRepo = true;
    const mergeHead = state.gitDir.startsWith('/')
      ? join(state.gitDir, 'MERGE_HEAD')
      : join(cwd, state.gitDir, 'MERGE_HEAD');
    state.hasMergeHead = existsSync(mergeHead);
  } catch {
    // Not a git repo or git missing.
  }

  writeCache(cwd, state);
  return state;
}

module.exports = { loadGitState };
