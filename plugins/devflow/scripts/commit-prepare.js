#!/usr/bin/env node

/**
 * commit-prepare.js - Pre-compute data for smart commits.
 *
 * Outputs JSON with:
 * - staged files and their diff
 * - recent commit messages for style detection
 * - multi-repo context
 * - commit style analysis (conventional, simple, etc.)
 *
 * Usage: node commit-prepare.js [--auto] [--amend]
 * Exit 0: success (JSON on stdout)
 * Exit 1: user error (message on stderr)
 * Exit 2: script error
 */

'use strict';

const { checkGitState, getRecentCommitMessages, exec } = require('./lib/git');
const { discoverMultiRepo, discoverWorktree } = require('./lib/discovery');

function parseArgs(argv) {
  const args = argv.slice(2);
  return {
    auto: args.includes('--auto'),
    amend: args.includes('--amend'),
  };
}

function detectCommitStyle(messages) {
  if (messages.length === 0) return { style: 'unknown', prefix: null };

  // Check for conventional commits: type(scope): message
  const conventional = /^(feat|fix|chore|docs|style|refactor|perf|test|ci|build|revert)(\(.+\))?:\s/;
  const conventionalCount = messages.filter(m => conventional.test(m)).length;

  // Check for prefix style: [type] message
  const bracketed = /^\[.+\]\s/;
  const bracketedCount = messages.filter(m => bracketed.test(m)).length;

  // Check for emoji prefix
  const emoji = /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  const emojiCount = messages.filter(m => emoji.test(m)).length;

  const total = messages.length;
  const threshold = 0.5;

  if (conventionalCount / total >= threshold) {
    // Detect most common type
    const types = {};
    for (const m of messages) {
      const match = m.match(conventional);
      if (match) types[match[1]] = (types[match[1]] || 0) + 1;
    }
    return { style: 'conventional', types, example: messages[0] };
  }

  if (bracketedCount / total >= threshold) {
    return { style: 'bracketed', example: messages[0] };
  }

  if (emojiCount / total >= threshold) {
    return { style: 'emoji', example: messages[0] };
  }

  return { style: 'freeform', example: messages[0] };
}

function getStagedFiles(cwd) {
  const output = exec('git diff --cached --name-status', { cwd }) || '';
  return output.split('\n').filter(Boolean).map(line => {
    const [status, ...pathParts] = line.split('\t');
    return { status: status.trim(), path: pathParts.join('\t') };
  });
}

function getStagedDiff(cwd) {
  return exec('git diff --cached --stat', { cwd }) || '';
}

function getStagedDiffContent(cwd) {
  return exec('git diff --cached', { cwd }) || '';
}

function main() {
  const flags = parseArgs(process.argv);
  const cwd = process.cwd();

  let gitState;
  try {
    gitState = checkGitState(cwd);
  } catch (err) {
    process.stderr.write(err.message + '\n');
    process.exit(1);
  }

  const staged = getStagedFiles(cwd);

  if (staged.length === 0 && !flags.amend) {
    // Check if there are unstaged changes to suggest staging
    const unstaged = gitState.dirtyFiles;
    if (unstaged.length > 0) {
      process.stderr.write(
        `No staged files. ${unstaged.length} unstaged file(s) found.\n` +
        'Stage files with: git add <files>\n'
      );
    } else {
      process.stderr.write('Nothing to commit - no staged or unstaged changes.\n');
    }
    process.exit(1);
  }

  const recentMessages = getRecentCommitMessages(cwd, { count: 15 });
  const commitStyle = detectCommitStyle(recentMessages);
  const stagedDiffStat = getStagedDiff(cwd);
  const stagedDiffContent = getStagedDiffContent(cwd);
  const multiRepo = discoverMultiRepo(cwd);
  const worktree = discoverWorktree(cwd);

  const result = {
    flags,
    git: {
      branch: gitState.currentBranch,
      staged,
      stagedCount: staged.length,
      stagedDiffStat,
      stagedDiffContent,
      unstagedCount: gitState.dirtyFiles.length - staged.length,
    },
    style: {
      detected: commitStyle,
      recentMessages: recentMessages.slice(0, 5),
    },
    context: {
      multiRepo: multiRepo.isMultiRepo,
      repos: multiRepo.repos.map(r => r.name),
      inWorktree: worktree.inWorktree,
      worktreeBranch: worktree.inWorktree
        ? worktree.worktrees.find(w => w.path === cwd)?.branch
        : null,
    },
  };

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

main();
