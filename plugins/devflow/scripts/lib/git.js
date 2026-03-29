/**
 * git.js - Shared git utilities for devflow scripts.
 * Zero external dependencies - Node.js built-ins only.
 */

'use strict';

const { execSync } = require('node:child_process');

/**
 * Run a shell command and return trimmed stdout, or null on failure.
 */
function exec(cmd, opts = {}) {
  const { throwOnError, ...execOpts } = opts;
  try {
    return execSync(cmd, { encoding: 'utf8', ...execOpts }).trim();
  } catch (err) {
    if (throwOnError) throw err;
    return null;
  }
}

/**
 * Verify git repo and return basic state.
 */
function checkGitState(cwd) {
  const inside = exec('git rev-parse --is-inside-work-tree', { cwd });
  if (inside !== 'true') throw new Error('Not inside a git repository');

  const currentBranch = exec('git branch --show-current', { cwd }) || 'HEAD';
  const statusLines = exec('git status --porcelain', { cwd }) || '';
  const dirtyFiles = statusLines.split('\n').filter(Boolean).map(l => l.slice(3));

  return { currentBranch, uncommittedChanges: dirtyFiles.length > 0, dirtyFiles };
}

/**
 * Detect the default branch (main/master).
 */
function detectBaseBranch(cwd) {
  // Try symbolic ref first
  const ref = exec('git symbolic-ref refs/remotes/origin/HEAD', { cwd });
  if (ref) return ref.replace('refs/remotes/origin/', '');

  // Fallback: check if main or master exists
  for (const branch of ['main', 'master']) {
    if (exec(`git rev-parse --verify origin/${branch}`, { cwd })) return branch;
  }
  return 'main';
}

/**
 * Get changed files between base and current state.
 * @param {string} cwd
 * @param {object} opts
 * @param {string} opts.base - Base branch/ref
 * @param {'committed'|'staged'|'working'} opts.scope
 */
function getChangedFiles(cwd, { base, scope = 'committed' } = {}) {
  let cmd;
  switch (scope) {
    case 'staged':
      cmd = 'git diff --cached --name-status';
      break;
    case 'working':
      cmd = 'git diff --name-status';
      break;
    case 'committed':
    default:
      if (!base) base = detectBaseBranch(cwd);
      cmd = `git diff --name-status ${base}...HEAD`;
      break;
  }

  const output = exec(cmd, { cwd }) || '';
  return output.split('\n').filter(Boolean).map(line => {
    const [status, ...pathParts] = line.split('\t');
    return { status: status.trim(), path: pathParts.join('\t') };
  });
}

/**
 * Get structured commit log.
 */
function getCommitLog(cwd, { base, maxCount = 50 } = {}) {
  if (!base) base = detectBaseBranch(cwd);
  const format = '%H%n%h%n%s%n%b%n---COMMIT_END---';
  const output = exec(
    `git log --format="${format}" --max-count=${maxCount} ${base}...HEAD`,
    { cwd }
  );
  if (!output) return [];

  return output.split('---COMMIT_END---').filter(Boolean).map(block => {
    const lines = block.trim().split('\n');
    return {
      hash: lines[0],
      shortHash: lines[1],
      subject: lines[2],
      body: lines.slice(3).join('\n').trim(),
    };
  });
}

/**
 * Get diff content for specific files.
 */
function getDiffContent(cwd, { base, files, scope = 'committed' } = {}) {
  let cmd;
  switch (scope) {
    case 'staged':
      cmd = 'git diff --cached';
      break;
    case 'working':
      cmd = 'git diff';
      break;
    default:
      if (!base) base = detectBaseBranch(cwd);
      cmd = `git diff ${base}...HEAD`;
      break;
  }

  if (files && files.length > 0) {
    cmd += ' -- ' + files.map(f => `"${f}"`).join(' ');
  }

  return exec(cmd, { cwd }) || '';
}

/**
 * Get diff stat summary.
 */
function getDiffStat(cwd, { base } = {}) {
  if (!base) base = detectBaseBranch(cwd);
  return exec(`git diff --stat ${base}...HEAD`, { cwd }) || '';
}

/**
 * Get recent commit messages for style detection.
 */
function getRecentCommitMessages(cwd, { count = 10 } = {}) {
  const output = exec(`git log --format="%s" --max-count=${count}`, { cwd });
  return output ? output.split('\n').filter(Boolean) : [];
}

/**
 * Get count of commits between base and HEAD.
 */
function getCommitCount(cwd, { base } = {}) {
  if (!base) base = detectBaseBranch(cwd);
  const count = exec(`git rev-list --count ${base}...HEAD`, { cwd });
  return count ? parseInt(count, 10) : 0;
}

/**
 * Check remote state - does the branch exist on remote?
 */
function getRemoteState(cwd) {
  const branch = exec('git branch --show-current', { cwd });
  if (!branch) return { branch: null, hasRemote: false, ahead: 0, behind: 0 };

  const remote = exec(`git rev-parse --verify origin/${branch}`, { cwd });
  if (!remote) return { branch, hasRemote: false, ahead: 0, behind: 0 };

  const ahead = parseInt(exec(`git rev-list --count origin/${branch}..${branch}`, { cwd }) || '0', 10);
  const behind = parseInt(exec(`git rev-list --count ${branch}..origin/${branch}`, { cwd }) || '0', 10);

  return { branch, hasRemote: true, ahead, behind };
}

module.exports = {
  exec,
  checkGitState,
  detectBaseBranch,
  getChangedFiles,
  getCommitLog,
  getDiffContent,
  getDiffStat,
  getRecentCommitMessages,
  getCommitCount,
  getRemoteState,
};
