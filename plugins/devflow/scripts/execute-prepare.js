#!/usr/bin/env node

/**
 * execute-prepare.js - Pre-compute data for plan execution.
 *
 * Parses a plan file, extracts tasks with dependencies,
 * builds wave grouping for parallel dispatch.
 *
 * Usage: node execute-prepare.js [plan-file-path]
 * Exit 0: success (JSON on stdout)
 * Exit 1: user error (message on stderr)
 * Exit 2: script error
 */

'use strict';

const { existsSync, readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { checkGitState, detectBaseBranch } = require('./lib/git');
const { discoverWorktree } = require('./lib/discovery');

function parseArgs(argv) {
  const args = argv.slice(2);
  return {
    planFile: args.find(a => !a.startsWith('--')) || null,
  };
}

/**
 * Find the most recent plan file in .devflow/
 */
function findLatestPlan(cwd) {
  const devflowDir = join(cwd, '.devflow');
  if (!existsSync(devflowDir)) return null;

  const plans = readdirSync(devflowDir)
    .filter(f => f.startsWith('plan-') && f.endsWith('.md'))
    .sort()
    .reverse();

  return plans.length > 0 ? join(devflowDir, plans[0]) : null;
}

/**
 * Parse a markdown plan into task groups with dependencies.
 */
function parsePlan(content) {
  const groups = [];
  let currentGroup = null;

  for (const line of content.split('\n')) {
    // Match group header: ### Group N: name
    const groupMatch = line.match(/^###\s+(?:Group\s+\d+:\s*)?(.+)/);
    if (groupMatch) {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = {
        name: groupMatch[1].trim(),
        dependsOn: [],
        tasks: [],
      };
      continue;
    }

    // Match depends on line
    if (currentGroup && /^Depends on:/i.test(line)) {
      const deps = line.replace(/^Depends on:\s*/i, '').trim();
      if (deps.toLowerCase() !== 'none') {
        currentGroup.dependsOn = deps.split(',')
          .map(d => d.trim().replace(/^Group\s+\d+:\s*/i, ''))
          .filter(Boolean);
      }
      continue;
    }

    // Match task: - [ ] N.M description
    const taskMatch = line.match(/^-\s+\[[ x]\]\s+(?:(\d+\.\d+)\s+)?(.+)/);
    if (taskMatch && currentGroup) {
      currentGroup.tasks.push({
        id: taskMatch[1] || `${groups.length + 1}.${currentGroup.tasks.length + 1}`,
        description: taskMatch[2].trim(),
        done: line.includes('[x]'),
      });
    }
  }

  if (currentGroup) groups.push(currentGroup);
  return groups;
}

/**
 * Validate the dependency DAG: detect missing references and cycles.
 * Returns { error: string | null }.
 */
function validateDag(groups) {
  const byName = new Map(groups.map(g => [g.name, g]));

  // Missing deps
  const missing = [];
  for (const g of groups) {
    for (const dep of g.dependsOn) {
      if (!byName.has(dep)) missing.push(`${g.name} → ${dep}`);
    }
  }
  if (missing.length > 0) {
    return { error: `Missing dependency references:\n${missing.join('\n')}` };
  }

  // Cycle detection — DFS with three colors (white/gray/black).
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(groups.map(g => [g.name, WHITE]));
  const stack = [];
  let cycle = null;

  function visit(name) {
    if (cycle) return;
    if (color.get(name) === GRAY) {
      const i = stack.indexOf(name);
      cycle = stack.slice(i).concat(name);
      return;
    }
    if (color.get(name) === BLACK) return;
    color.set(name, GRAY);
    stack.push(name);
    for (const dep of byName.get(name).dependsOn) visit(dep);
    stack.pop();
    color.set(name, BLACK);
  }

  for (const g of groups) {
    visit(g.name);
    if (cycle) break;
  }

  if (cycle) {
    return { error: `Circular dependency: ${cycle.join(' → ')}` };
  }

  return { error: null };
}

/**
 * Compute topological level per group (longest path from a root).
 * Levels are display-only — dispatch is event-driven on `dependsOn`.
 */
function computeLevels(groups) {
  const byName = new Map(groups.map(g => [g.name, g]));
  const level = new Map();

  function depthOf(name) {
    if (level.has(name)) return level.get(name);
    const g = byName.get(name);
    const d = g.dependsOn.length === 0
      ? 0
      : 1 + Math.max(...g.dependsOn.map(depthOf));
    level.set(name, d);
    return d;
  }

  for (const g of groups) depthOf(g.name);
  return level;
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

  // Find plan file
  let planPath = flags.planFile;
  if (!planPath) {
    planPath = findLatestPlan(cwd);
  }

  let planContent = null;
  let planSource = 'conversation';

  if (planPath) {
    if (!existsSync(planPath)) {
      process.stderr.write(`Plan file not found: ${planPath}\n`);
      process.exit(1);
    }
    planContent = readFileSync(planPath, 'utf8');
    planSource = 'file';
  } else {
    // No plan file - will use conversation context
    planSource = 'conversation';
  }

  // Parse plan if we have content
  let groups = [];
  let dagError = null;
  let maxLevel = 0;

  if (planContent) {
    groups = parsePlan(planContent);

    if (groups.length === 0) {
      process.stderr.write('No task groups found in plan. Expected ### Group headers with - [ ] tasks.\n');
      process.exit(1);
    }

    const validation = validateDag(groups);
    dagError = validation.error;

    if (!dagError) {
      const levels = computeLevels(groups);
      groups = groups.map(g => ({
        ...g,
        level: levels.get(g.name),
        taskCount: g.tasks.length,
        pendingTasks: g.tasks.filter(t => !t.done).length,
      }));
      maxLevel = Math.max(0, ...groups.map(g => g.level));
    }
  }

  const totalTasks = groups.reduce((sum, g) => sum + g.tasks.length, 0);
  const pendingTasks = groups.reduce((sum, g) => sum + g.tasks.filter(t => !t.done).length, 0);
  const worktree = discoverWorktree(cwd);

  const result = {
    planSource,
    planPath,
    groups,
    groupCount: groups.length,
    totalTasks,
    pendingTasks,
    completedTasks: totalTasks - pendingTasks,
    maxLevel,
    dagError,
    project: {
      branch: gitState.currentBranch,
      baseBranch: detectBaseBranch(cwd),
      inWorktree: worktree.inWorktree,
    },
  };

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

main();
