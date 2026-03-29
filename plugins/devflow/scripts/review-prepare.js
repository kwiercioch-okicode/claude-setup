#!/usr/bin/env node

/**
 * review-prepare.js - Pre-compute data for multi-dimension code review.
 *
 * Outputs JSON manifest with:
 * - changed files with diff hunks
 * - discovered review dimensions
 * - file-to-dimension mapping
 * - plan critique (uncovered files, over-broad dimensions)
 *
 * Usage: node review-prepare.js [--base <branch>] [--committed|--staged|--working] [--dimensions <name,...>] [--dry-run] [--json]
 * Exit 0: success (JSON on stdout)
 * Exit 1: user error (message on stderr)
 * Exit 2: script error
 */

'use strict';

const { checkGitState, detectBaseBranch, getChangedFiles, getDiffContent, getDiffStat } = require('./lib/git');
const { discoverReviewDimensions, discoverMultiRepo, discoverWorktree } = require('./lib/discovery');
const { readFileSync } = require('node:fs');

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    base: null,
    scope: 'committed',
    dimensions: null,
    dryRun: args.includes('--dry-run'),
    json: args.includes('--json'),
  };

  const baseIdx = args.indexOf('--base');
  if (baseIdx !== -1 && args[baseIdx + 1]) {
    flags.base = args[baseIdx + 1];
  }

  if (args.includes('--staged')) flags.scope = 'staged';
  if (args.includes('--working')) flags.scope = 'working';
  if (args.includes('--committed')) flags.scope = 'committed';

  const dimIdx = args.indexOf('--dimensions');
  if (dimIdx !== -1 && args[dimIdx + 1]) {
    flags.dimensions = args[dimIdx + 1].split(',').map(d => d.trim());
  }

  return flags;
}

/**
 * Map file extensions to review dimension relevance.
 */
function getFileRelevance(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  const relevance = [];

  // Security - all code files
  if (['php', 'js', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'java'].includes(ext)) {
    relevance.push('security');
  }

  // Performance - backend and database
  if (['php', 'sql', 'py', 'go', 'java', 'rb'].includes(ext)) {
    relevance.push('performance');
  }

  // Tests
  if (filePath.includes('test') || filePath.includes('spec') || filePath.includes('Test')) {
    relevance.push('tests');
  }

  // Architecture - all source code
  if (['php', 'js', 'ts', 'tsx', 'jsx', 'py', 'go', 'java', 'rb'].includes(ext)) {
    relevance.push('architecture');
  }

  // Error handling - all code
  if (['php', 'js', 'ts', 'tsx', 'jsx', 'py', 'go', 'java', 'rb'].includes(ext)) {
    relevance.push('error-handling');
  }

  // Naming - all code
  if (['php', 'js', 'ts', 'tsx', 'jsx', 'py', 'go', 'java', 'rb'].includes(ext)) {
    relevance.push('naming');
  }

  // Frontend/UI
  if (['tsx', 'jsx', 'css', 'scss', 'less', 'vue', 'svelte'].includes(ext)) {
    relevance.push('ui-ux');
  }

  return relevance;
}

/**
 * Map changed files to dimensions.
 */
function mapFilesToDimensions(changedFiles, dimensions) {
  const mapping = {};

  for (const dim of dimensions) {
    mapping[dim.name] = {
      name: dim.name,
      path: dim.path,
      source: dim.source,
      files: [],
      fileCount: 0,
    };
  }

  const uncoveredFiles = [];

  for (const file of changedFiles) {
    const relevance = getFileRelevance(file.path);
    let covered = false;

    for (const dimName of relevance) {
      if (mapping[dimName]) {
        mapping[dimName].files.push(file);
        mapping[dimName].fileCount++;
        covered = true;
      }
    }

    if (!covered) {
      uncoveredFiles.push(file.path);
    }
  }

  return { mapping, uncoveredFiles };
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

  const baseBranch = flags.base || detectBaseBranch(cwd);
  const changedFiles = getChangedFiles(cwd, { base: baseBranch, scope: flags.scope });

  if (changedFiles.length === 0) {
    process.stderr.write(`No changed files found (scope: ${flags.scope}, base: ${baseBranch}).\n`);
    process.exit(1);
  }

  // Discover dimensions
  let dimensions = discoverReviewDimensions(cwd);

  // Filter to requested dimensions
  if (flags.dimensions) {
    dimensions = dimensions.filter(d => flags.dimensions.includes(d.name));
    const found = dimensions.map(d => d.name);
    const missing = flags.dimensions.filter(d => !found.includes(d));
    if (missing.length > 0) {
      process.stderr.write(`Warning: dimensions not found: ${missing.join(', ')}\n`);
    }
  }

  // Map files to dimensions
  const { mapping, uncoveredFiles } = mapFilesToDimensions(changedFiles, dimensions);

  // Read dimension content
  const dimensionsWithContent = dimensions.map(dim => {
    let content = '';
    try {
      content = readFileSync(dim.path, 'utf8');
    } catch { /* skip unreadable */ }
    return {
      ...mapping[dim.name],
      content,
    };
  });

  // Get diff content
  const diffContent = getDiffContent(cwd, { base: baseBranch, scope: flags.scope });
  const diffStat = getDiffStat(cwd, { base: baseBranch });

  // Plan critique
  const activeDimensions = dimensionsWithContent.filter(d => d.fileCount > 0);
  const skippedDimensions = dimensionsWithContent.filter(d => d.fileCount === 0);
  const overBroad = activeDimensions.filter(d => d.fileCount > changedFiles.length * 0.8);

  const multiRepo = discoverMultiRepo(cwd);
  const worktree = discoverWorktree(cwd);

  const manifest = {
    base_branch: baseBranch,
    scope: flags.scope,
    git: {
      branch: gitState.currentBranch,
      changed_files: changedFiles,
      changed_files_count: changedFiles.length,
      diff_stat: diffStat,
      diff_content: diffContent,
    },
    dimensions: dimensionsWithContent,
    summary: {
      active_dimensions: activeDimensions.length,
      skipped_dimensions: skippedDimensions.length,
      total_dimensions: dimensions.length,
    },
    plan_critique: {
      uncovered_files: uncoveredFiles,
      over_broad_dimensions: overBroad.map(d => d.name),
    },
    context: {
      multiRepo: multiRepo.isMultiRepo,
      repos: multiRepo.repos.map(r => r.name),
      inWorktree: worktree.inWorktree,
    },
  };

  process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
  process.exit(0);
}

main();
