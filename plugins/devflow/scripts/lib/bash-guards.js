#!/usr/bin/env node

/**
 * bash-guards.js - Combined PreToolUse hook for Bash.
 *
 * Runs three checks in one Node process (one cold start instead of three):
 *   1. secrets-guard  - block commands that may expose secrets
 *   2. branch-guard   - block commit/push on protected branches
 *   3. review-gate    - block `gh pr create` without an APPROVED verdict
 *
 * Exit 2 = block with stdout message. Exit 0 = allow.
 */

'use strict';

const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { loadGitState } = require('./git-cache');

const PROTECTED_BRANCHES = ['main', 'master', 'staging'];

const SECRET_BASH_PATTERNS = [
  /cat\s+.*\.env/i,
  /cat\s+.*credentials/i,
  /cat\s+.*secrets/i,
  /cat\s+.*\.pem/i,
  /cat\s+.*\.key/i,
  /cat\s+id_rsa/i,
  /printenv/i,
  /env\s*$/,
  /export\s+\w+_(?:KEY|SECRET|TOKEN|PASSWORD|PASS|PWD|API_KEY)\s*=/i,
];

const DANGEROUS_GIT_PATTERNS = [
  /\bgit\s+commit\b/,
  /\bgit\s+push\b/,
];

function block(message) {
  process.stdout.write(message);
  process.exit(2);
}

function checkSecrets(command) {
  if (SECRET_BASH_PATTERNS.some(p => p.test(command))) {
    block(
      'SECRETS GUARD: Blocked command that may expose secrets.\n' +
      'If you need a specific value, ask the user to provide it directly in the conversation.'
    );
  }
}

function checkBranch(command, cwd) {
  if (!DANGEROUS_GIT_PATTERNS.some(p => p.test(command))) return;

  const git = loadGitState(cwd);
  if (!git.inRepo) return;
  if (!PROTECTED_BRANCHES.includes(git.branch)) return;

  // Pushing a non-protected ref is fine (e.g. push from main checkout).
  if (/\bgit\s+push\s+\S+\s+(?!main|master|staging)\S+/.test(command)) return;

  // Merge in progress: commit + push are normal.
  if (git.hasMergeHead) return;

  // Allow git push origin <protected> and `commit --no-edit` (merge result).
  if (/\bgit\s+push\b/.test(command)) return;
  if (/\bgit\s+commit\s+--no-edit\b/.test(command)) return;

  block(
    `BLOCKED: Cannot commit directly on protected branch '${git.branch}'. ` +
    'Create a worktree first: /df:worktree create <branch-name>'
  );
}

function checkReviewGate(command, cwd) {
  if (!/\bgh\s+pr\s+create\b/.test(command)) return;

  const verdictPath = join(cwd, '.devflow', 'review-verdict.json');
  if (!existsSync(verdictPath)) {
    block(
      'BLOCKED: No review verdict found. Run /df:review before creating a PR.\n' +
      'To skip: create PR manually with `gh pr create` outside of Claude Code.'
    );
  }

  let verdict;
  try {
    verdict = JSON.parse(readFileSync(verdictPath, 'utf8'));
  } catch {
    block('BLOCKED: Review verdict file is corrupt. Re-run /df:review.');
  }

  if (verdict.verdict === 'CHANGES_REQUESTED') {
    const { critical = 0, high = 0 } = verdict.counts || {};
    block(
      `BLOCKED: Review verdict is CHANGES_REQUESTED (${critical} critical, ${high} high).\n` +
      'Fix the findings and re-run /df:review, or address with /df:commit.'
    );
  }
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

  const command = data?.tool_input?.command || '';
  if (!command) process.exit(0);

  const cwd = process.cwd();
  checkSecrets(command);
  checkBranch(command, cwd);
  checkReviewGate(command, cwd);

  process.exit(0);
}

main();
