#!/usr/bin/env node

/**
 * openspec-guard.js - PreToolUse hook for Edit/Write
 * Detects production file edits that may need an OpenSpec proposal.
 * Injects context warning (does not block).
 *
 * Reads tool input from stdin (JSON with tool_input).
 * Exit 0 always (context injection, not blocking).
 * Writes warning to stdout if applicable.
 */

'use strict';

const { existsSync, readdirSync } = require('node:fs');
const { join, extname } = require('node:path');

const PRODUCTION_EXTENSIONS = new Set([
  '.php', '.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte',
  '.py', '.rb', '.go', '.java', '.rs',
]);

const TEST_PATTERNS = [/test/i, /spec/i, /\.test\./, /\.spec\./, /Test\.php$/, /__tests__/];
const CONFIG_PATTERNS = [/config/i, /\.env/, /docker/i, /webpack/i, /vite/i, /tsconfig/i, /package\.json/];

function isProductionFile(filePath) {
  if (!filePath) return false;
  const ext = extname(filePath);
  if (!PRODUCTION_EXTENSIONS.has(ext)) return false;
  if (TEST_PATTERNS.some(p => p.test(filePath))) return false;
  if (CONFIG_PATTERNS.some(p => p.test(filePath))) return false;
  return true;
}

function hasOpenSpecDir(cwd) {
  return existsSync(join(cwd, 'openspec')) || existsSync(join(cwd, '..', 'openspec'));
}

function hasActiveProposal(cwd) {
  const changesDir = join(cwd, 'openspec', 'changes');
  const parentChangesDir = join(cwd, '..', 'openspec', 'changes');
  const dir = existsSync(changesDir) ? changesDir : existsSync(parentChangesDir) ? parentChangesDir : null;
  if (!dir) return false;

  try {
    const entries = readdirSync(dir);
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const filePath = data?.tool_input?.file_path || '';
  if (!isProductionFile(filePath)) {
    process.exit(0);
  }

  const cwd = process.cwd();
  if (!hasOpenSpecDir(cwd)) {
    process.exit(0);
  }

  // Only warn if no active proposals exist
  // If there's already a proposal, assume it covers this work
  if (hasActiveProposal(cwd)) {
    process.exit(0);
  }

  process.stdout.write(
    'OPENSPEC REMINDER: Editing production file without an active OpenSpec proposal. ' +
    'If this is a behavioral change or new capability, create a proposal first: /openspec:proposal'
  );
  process.exit(0);
}

main();
