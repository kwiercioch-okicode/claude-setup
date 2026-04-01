#!/usr/bin/env node

/**
 * ship-prepare.js - Pre-compute pipeline steps for ship orchestrator.
 *
 * Detects context and determines which steps to run/skip.
 *
 * Usage: node ship-prepare.js [--skip step1,step2] [--auto] [--dry-run] [--draft]
 * Exit 0: success (JSON on stdout)
 * Exit 1: user error (message on stderr)
 */

'use strict';

const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { checkGitState, detectBaseBranch, exec } = require('./lib/git');

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    skip: [],
    auto: args.includes('--auto'),
    dryRun: args.includes('--dry-run'),
    draft: args.includes('--draft'),
    ticket: null,
    phase: null,
  };

  const skipIdx = args.indexOf('--skip');
  if (skipIdx !== -1 && args[skipIdx + 1]) {
    flags.skip = args[skipIdx + 1].split(',').map(s => s.trim());
  }

  const phaseIdx = args.indexOf('--phase');
  if (phaseIdx !== -1 && args[phaseIdx + 1]) {
    flags.phase = args[phaseIdx + 1];
  }

  // First positional arg matching TICKET-ID pattern
  for (const arg of args) {
    if (arg.startsWith('--')) continue;
    if (/^[A-Z]+-\d+$/.test(arg)) {
      flags.ticket = arg;
      break;
    }
  }

  return flags;
}

const VALID_STEPS = ['jira-fetch', 'plan', 'jira-post-plan', 'worktree', 'execute', 'commit', 'review', 'pr', 'jira-post-result'];
const VALID_PHASES = ['plan', 'impl', 'fix'];

function main() {
  const flags = parseArgs(process.argv);
  const cwd = process.cwd();

  // Validate phase
  if (flags.phase && !VALID_PHASES.includes(flags.phase)) {
    process.stderr.write(
      `Unknown phase: ${flags.phase}\nValid phases: ${VALID_PHASES.join(', ')}\n`
    );
    process.exit(1);
  }

  // Validate skip values
  const invalidSkips = flags.skip.filter(s => !VALID_STEPS.includes(s));
  if (invalidSkips.length > 0) {
    process.stderr.write(
      `Unknown skip values: ${invalidSkips.join(', ')}\n` +
      `Valid steps: ${VALID_STEPS.join(', ')}\n`
    );
    process.exit(1);
  }

  let gitState;
  try {
    gitState = checkGitState(cwd);
  } catch (err) {
    process.stderr.write(err.message + '\n');
    process.exit(1);
  }

  const baseBranch = detectBaseBranch(cwd);

  // Check gh CLI
  const ghAuth = exec('gh auth status', { cwd });
  const ghAvailable = ghAuth !== null;

  // Check Jira env vars (for ticket mode)
  const jiraEnv = {
    url: !!process.env.JIRA_URL,
    email: !!process.env.JIRA_EMAIL,
    token: !!process.env.JIRA_API_TOKEN,
  };
  const jiraConfigured = jiraEnv.url && jiraEnv.email && jiraEnv.token;

  // Check review verdict
  const verdictPath = join(cwd, '.devflow', 'review-verdict.json');
  let verdict = null;
  if (existsSync(verdictPath)) {
    try {
      verdict = JSON.parse(readFileSync(verdictPath, 'utf8'));
    } catch { /* corrupt */ }
  }

  // Determine which steps to include based on ticket + phase
  const isTicketMode = !!flags.ticket;
  const phase = flags.phase;

  // Build steps
  const steps = [];

  if (isTicketMode) {
    const inPlan = !phase || phase === 'plan';
    const inImpl = !phase || phase === 'impl';
    const inFix = phase === 'fix';

    // --- Ticket pipeline steps ---

    // Jira fetch (plan + fix phases)
    if (inPlan || inFix) {
      steps.push({
        name: 'jira-fetch',
        skill: 'df:jira',
        status: flags.skip.includes('jira-fetch') ? 'skipped' : 'will_run',
        reason: flags.skip.includes('jira-fetch') ? 'in skip set' : `fetch ${flags.ticket}`,
        args: `fetch ${flags.ticket}`,
      });
    }

    // Plan (plan phase only)
    if (inPlan) {
      steps.push({
        name: 'plan',
        skill: 'df:plan',
        status: flags.skip.includes('plan') ? 'skipped' : 'will_run',
        reason: flags.skip.includes('plan') ? 'in skip set' : 'generate implementation plan',
        args: flags.ticket,
      });

      steps.push({
        name: 'jira-post-plan',
        skill: 'df:jira',
        status: flags.skip.includes('jira-post-plan') ? 'skipped' : 'will_run',
        reason: flags.skip.includes('jira-post-plan') ? 'in skip set' : 'post plan to Jira + transition',
        args: `post-plan ${flags.ticket}`,
      });
    }

    // Worktree (impl phase)
    if (inImpl) {
      steps.push({
        name: 'worktree',
        skill: 'df:worktree',
        status: flags.skip.includes('worktree') ? 'skipped'
          : gitState.currentBranch === baseBranch ? 'will_run'
          : 'skipped',
        reason: flags.skip.includes('worktree') ? 'in skip set'
          : gitState.currentBranch === baseBranch ? 'create isolated worktree'
          : 'already on feature branch',
        args: `create ${flags.ticket.toLowerCase()}`,
      });

      // Execute
      steps.push({
        name: 'execute',
        skill: 'df:execute',
        status: flags.skip.includes('execute') ? 'skipped' : 'will_run',
        reason: flags.skip.includes('execute') ? 'in skip set' : 'execute implementation plan',
        args: '',
      });
    }

    // Commit + Review + PR (impl + fix phases)
    if (inImpl || inFix) {
      steps.push({
        name: 'commit',
        skill: 'df:commit',
        status: flags.skip.includes('commit') ? 'skipped' : 'will_run',
        reason: flags.skip.includes('commit') ? 'in skip set' : 'commit changes',
        args: flags.auto ? '--auto' : '',
      });

      steps.push({
        name: 'review',
        skill: 'df:review',
        status: flags.skip.includes('review') ? 'skipped' : 'will_run',
        reason: flags.skip.includes('review') ? 'in skip set' : 'code review',
        args: '--committed',
      });

      steps.push({
        name: 'pr',
        skill: 'df:pr',
        status: flags.skip.includes('pr') ? 'skipped'
          : !ghAvailable ? 'blocked'
          : 'will_run',
        reason: flags.skip.includes('pr') ? 'in skip set'
          : !ghAvailable ? 'gh CLI not authenticated'
          : 'create pull request',
        args: [flags.auto ? '--auto' : '', flags.draft ? '--draft' : ''].filter(Boolean).join(' '),
      });

      steps.push({
        name: 'jira-post-result',
        skill: 'df:jira',
        status: flags.skip.includes('jira-post-result') ? 'skipped' : 'will_run',
        reason: flags.skip.includes('jira-post-result') ? 'in skip set' : 'post PR link + transition Jira',
        args: `post-result ${flags.ticket}`,
      });
    }
  } else {
    // --- Classic ship pipeline (no ticket) ---
    // Full pipeline: plan → execute → commit → review → PR
    // Use --skip plan,execute to get legacy behavior (commit → review → PR only)

    const hasUncommitted = gitState.uncommittedChanges;

    // Plan
    steps.push({
      name: 'plan',
      skill: 'df:plan',
      status: flags.skip.includes('plan') ? 'skipped' : 'will_run',
      reason: flags.skip.includes('plan') ? 'in skip set' : 'generate implementation plan',
      args: '',
    });

    // Execute
    steps.push({
      name: 'execute',
      skill: 'df:execute',
      status: flags.skip.includes('execute') ? 'skipped' : 'will_run',
      reason: flags.skip.includes('execute') ? 'in skip set' : 'execute implementation plan',
      args: '',
    });

    // Commit
    steps.push({
      name: 'commit',
      skill: 'df:commit',
      status: flags.skip.includes('commit') ? 'skipped'
        : 'will_run',
      reason: flags.skip.includes('commit') ? 'in skip set'
        : hasUncommitted ? `${gitState.dirtyFiles.length} uncommitted files`
        : 'commit after execution',
      args: flags.auto ? '--auto' : '',
    });

    // Review
    steps.push({
      name: 'review',
      skill: 'df:review',
      status: flags.skip.includes('review') ? 'skipped' : 'will_run',
      reason: flags.skip.includes('review') ? 'in skip set' : 'code review',
      args: '--committed',
    });

    // PR
    steps.push({
      name: 'pr',
      skill: 'df:pr',
      status: flags.skip.includes('pr') ? 'skipped'
        : !ghAvailable ? 'blocked'
        : 'will_run',
      reason: flags.skip.includes('pr') ? 'in skip set'
        : !ghAvailable ? 'gh CLI not authenticated'
        : 'create pull request',
      args: [flags.auto ? '--auto' : '', flags.draft ? '--draft' : ''].filter(Boolean).join(' '),
    });
  }

  const result = {
    flags,
    context: {
      branch: gitState.currentBranch,
      baseBranch,
      onDefaultBranch: gitState.currentBranch === baseBranch,
      uncommittedFiles: gitState.dirtyFiles.length,
      ghAvailable,
      jiraConfigured,
      jiraEnv,
      hasVerdict: verdict !== null,
      verdict: verdict ? verdict.verdict : null,
    },
    steps,
    summary: {
      willRun: steps.filter(s => s.status === 'will_run').length,
      skipped: steps.filter(s => s.status === 'skipped').length,
      blocked: steps.filter(s => s.status === 'blocked').length,
    },
  };

  // Warnings
  result.warnings = [];
  if (!isTicketMode && result.context.onDefaultBranch) {
    result.warnings.push(`On default branch '${baseBranch}' - create a feature branch first`);
  }
  if (isTicketMode && !jiraConfigured) {
    const missing = Object.entries(jiraEnv).filter(([,v]) => !v).map(([k]) => k.toUpperCase());
    result.warnings.push(`Jira env vars missing: ${missing.join(', ')} - Jira steps will use MCP fallback`);
  }
  if (invalidSkips.length > 0) {
    result.warnings.push(`Unknown skip values ignored: ${invalidSkips.join(', ')}`);
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

main();
