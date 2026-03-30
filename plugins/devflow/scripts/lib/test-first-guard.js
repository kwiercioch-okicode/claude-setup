#!/usr/bin/env node

/**
 * test-first-guard.js - PreToolUse hook for Edit/Write
 * Reminds to write tests before production code.
 * Injects context warning (does not block).
 *
 * Reads tool input from stdin (JSON with tool_input).
 * Exit 0 always (context injection, not blocking).
 * Writes warning to stdout if applicable.
 */

'use strict';

const { extname } = require('node:path');

const PRODUCTION_EXTENSIONS = new Set([
  '.php', '.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte',
  '.py', '.rb', '.go', '.java', '.rs',
]);

const TEST_PATTERNS = [/test/i, /spec/i, /\.test\./, /\.spec\./, /Test\.php$/, /__tests__/];
const CONFIG_PATTERNS = [/config/i, /\.env/, /docker/i, /webpack/i, /vite/i, /tsconfig/i, /package\.json/, /\.css$/, /\.scss$/, /\.md$/];

function isProductionFile(filePath) {
  if (!filePath) return false;
  const ext = extname(filePath);
  if (!PRODUCTION_EXTENSIONS.has(ext)) return false;
  if (TEST_PATTERNS.some(p => p.test(filePath))) return false;
  if (CONFIG_PATTERNS.some(p => p.test(filePath))) return false;
  return true;
}

function isTestFile(filePath) {
  return TEST_PATTERNS.some(p => p.test(filePath));
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

  // If editing a test file - that's good, no warning
  if (isTestFile(filePath)) {
    process.exit(0);
  }

  if (!isProductionFile(filePath)) {
    process.exit(0);
  }

  process.stdout.write(
    'TEST-FIRST REMINDER: Editing production code. ' +
    'Ensure a failing test exists before writing production code. ' +
    'Use /df:test-first for the TDD workflow.'
  );
  process.exit(0);
}

main();
