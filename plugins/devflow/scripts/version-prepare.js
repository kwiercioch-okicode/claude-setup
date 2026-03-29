#!/usr/bin/env node

/**
 * version-prepare.js - Pre-compute data for version bumping.
 *
 * Usage: node version-prepare.js [--bump patch|minor|major]
 * Exit 0: success (JSON on stdout)
 * Exit 1: user error (message on stderr)
 */

'use strict';

const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { checkGitState, getCommitLog, exec } = require('./lib/git');
const { discoverMultiRepo } = require('./lib/discovery');

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = { bump: null, auto: args.includes('--auto') };
  const bumpIdx = args.indexOf('--bump');
  if (bumpIdx !== -1 && args[bumpIdx + 1]) {
    flags.bump = args[bumpIdx + 1];
  }
  // Positional: patch, minor, major
  for (const a of args) {
    if (['patch', 'minor', 'major'].includes(a)) flags.bump = a;
  }
  return flags;
}

function getCurrentVersion(cwd) {
  // Try git tags
  const tag = exec('git describe --tags --abbrev=0', { cwd });
  if (tag) return tag.replace(/^v/, '');

  // Try package.json
  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      return JSON.parse(readFileSync(pkgPath, 'utf8')).version || null;
    } catch { /* ignore */ }
  }

  return null;
}

function detectBumpType(commits) {
  let hasBreaking = false;
  let hasFeat = false;

  for (const c of commits) {
    const msg = c.subject + ' ' + c.body;
    if (/BREAKING CHANGE/i.test(msg) || /^.*!:/.test(c.subject)) hasBreaking = true;
    if (/^feat/i.test(c.subject)) hasFeat = true;
  }

  if (hasBreaking) return 'major';
  if (hasFeat) return 'minor';
  return 'patch';
}

function bumpVersion(current, type) {
  const parts = current.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  switch (type) {
    case 'major': return `${parts[0] + 1}.0.0`;
    case 'minor': return `${parts[0]}.${parts[1] + 1}.0`;
    case 'patch': return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    default: return null;
  }
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

  const currentVersion = getCurrentVersion(cwd);
  const lastTag = exec('git describe --tags --abbrev=0', { cwd });
  const commits = lastTag
    ? getCommitLog(cwd, { base: lastTag })
    : getCommitLog(cwd, { base: 'HEAD~20' });

  const autoBump = detectBumpType(commits);
  const bumpType = flags.bump || autoBump;
  const nextVersion = currentVersion ? bumpVersion(currentVersion, bumpType) : null;
  const multiRepo = discoverMultiRepo(cwd);

  // Build changelog draft
  const changelog = commits.map(c => `- ${c.subject} (${c.shortHash})`).join('\n');

  const result = {
    flags,
    current: {
      version: currentVersion,
      tag: lastTag,
    },
    next: {
      version: nextVersion,
      bumpType,
      autoDetected: !flags.bump,
      autoReason: !flags.bump
        ? `auto-detected '${autoBump}' from ${commits.length} commits`
        : null,
    },
    commits: {
      count: commits.length,
      subjects: commits.slice(0, 10).map(c => c.subject),
    },
    changelog,
    context: {
      multiRepo: multiRepo.isMultiRepo,
      repos: multiRepo.repos.map(r => r.name),
      uncommittedChanges: gitState.uncommittedChanges,
    },
    warnings: [],
  };

  if (gitState.uncommittedChanges) {
    result.warnings.push('Uncommitted changes detected - commit first');
  }
  if (!currentVersion) {
    result.warnings.push('No current version found (no git tags, no package.json)');
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

main();
