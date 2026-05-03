#!/usr/bin/env node

/**
 * edit-write-guards.js - Combined PreToolUse hook for Edit/Write.
 *
 * Runs both reminder checks in one Node process:
 *   1. test-first-guard - remind to write tests before production code
 *   2. openspec-guard   - remind about OpenSpec proposal for production edits
 *
 * Both are non-blocking (exit 0 with stdout context injection).
 */

'use strict';

const { existsSync, readdirSync } = require('node:fs');
const { join, extname } = require('node:path');

const PRODUCTION_EXTENSIONS = new Set([
  '.php', '.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte',
  '.py', '.rb', '.go', '.java', '.rs',
]);

const TEST_PATTERNS = [/test/i, /spec/i, /\.test\./, /\.spec\./, /Test\.php$/, /__tests__/];
const CONFIG_PATTERNS_TEST = [/config/i, /\.env/, /docker/i, /webpack/i, /vite/i, /tsconfig/i, /package\.json/, /\.css$/, /\.scss$/, /\.md$/];
const CONFIG_PATTERNS_OS = [/config/i, /\.env/, /docker/i, /webpack/i, /vite/i, /tsconfig/i, /package\.json/];

const USER_FACING_PATTERNS = [
  /Handler\.php$/,
  /Controller\.php$/,
  /routes?\.(php|ts|tsx|js)$/i,
  /\/pages\//,
  /\/views\//,
  /Page\.(tsx|jsx|ts|js)$/,
  /Modal\.(tsx|jsx|ts|js)$/,
  /Wizard\.(tsx|jsx|ts|js)$/,
  /Form\.(tsx|jsx|ts|js)$/,
];

function isTestFile(filePath) {
  return TEST_PATTERNS.some(p => p.test(filePath));
}

function isProductionFile(filePath, configPatterns) {
  if (!filePath) return false;
  if (!PRODUCTION_EXTENSIONS.has(extname(filePath))) return false;
  if (TEST_PATTERNS.some(p => p.test(filePath))) return false;
  if (configPatterns.some(p => p.test(filePath))) return false;
  return true;
}

function isUserFacingFile(filePath) {
  return USER_FACING_PATTERNS.some(p => p.test(filePath));
}

function hasOpenSpecDir(cwd) {
  return existsSync(join(cwd, 'openspec')) || existsSync(join(cwd, '..', 'openspec'));
}

function hasActiveProposal(cwd) {
  const candidates = [join(cwd, 'openspec', 'changes'), join(cwd, '..', 'openspec', 'changes')];
  const dir = candidates.find(existsSync);
  if (!dir) return false;
  try {
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

function testFirstMessage(filePath) {
  if (isTestFile(filePath)) return null;
  if (!isProductionFile(filePath, CONFIG_PATTERNS_TEST)) return null;

  const e2eNote = isUserFacingFile(filePath)
    ? ' If this is a user-facing change, also add an E2E task to tasks.md (see e2e-coverage rule).'
    : '';

  return (
    'TEST-FIRST REMINDER: Editing production code. ' +
    'Ensure a failing test exists before writing production code.' +
    e2eNote
  );
}

function openSpecMessage(filePath, cwd) {
  if (!isProductionFile(filePath, CONFIG_PATTERNS_OS)) return null;
  if (!hasOpenSpecDir(cwd)) return null;
  if (hasActiveProposal(cwd)) return null;

  return (
    'OPENSPEC REMINDER: Editing production file without an active OpenSpec proposal. ' +
    'If this is a behavioral change or new capability, create a proposal first: /openspec:proposal'
  );
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const filePath = data?.tool_input?.file_path || '';
  if (!filePath) process.exit(0);

  const cwd = process.cwd();
  const messages = [testFirstMessage(filePath), openSpecMessage(filePath, cwd)].filter(Boolean);

  if (messages.length > 0) {
    process.stdout.write(messages.join('\n'));
  }
  process.exit(0);
}

main();
