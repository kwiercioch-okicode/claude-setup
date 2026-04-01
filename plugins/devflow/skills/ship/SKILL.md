---
description: "Ship end-to-end: commit, review, PR in one flow. With ticket ID: full SDLC pipeline (Jira fetch, plan, worktree, execute, ship, Jira update)."
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, mcp__atlassian__getJiraIssue, mcp__atlassian__addCommentToJiraIssue]
---

# /df:ship

Ship end-to-end. Full SDLC pipeline from plan to PR.

- **Default:** `plan → [checkpoint] → execute → commit → review → PR`
- **Ticket:** `jira fetch → plan → [jira post] → worktree → execute → commit → review → PR → jira update`
- **Legacy:** `/df:ship --skip plan,execute` for commit → review → PR only

**Announce at start:** "I'm using the df:ship command."

## Step 0 - Run ship-prepare.js

```bash
SCRIPT=$(find ~/.claude/plugins -name "ship-prepare.js" 2>/dev/null | head -1)
[ -z "$SCRIPT" ] && [ -f "plugins/devflow/scripts/ship-prepare.js" ] && SCRIPT="plugins/devflow/scripts/ship-prepare.js"
[ -z "$SCRIPT" ] && { echo "ERROR: Could not locate ship-prepare.js. Is the df plugin installed?" >&2; exit 2; }

SHIP_DATA=$(mktemp /tmp/ship-prepare-XXXXXX.json)
node "$SCRIPT" $ARGUMENTS > "$SHIP_DATA"
EXIT_CODE=$?
echo "SHIP_DATA=$SHIP_DATA"
echo "EXIT_CODE=$EXIT_CODE"
```

On non-zero exit: show stderr message and stop.

## Step 1 - Display Pipeline

Read `$SHIP_DATA` JSON. Display:

```
Ship Pipeline
=============
  Ticket: FO-XXX (or: none)
  Phase:  plan | impl | full
  Branch: <branch> -> <baseBranch>

| Step            | Status   | Reason                      | Args          |
|-----------------|----------|-----------------------------|---------------|
| jira-fetch      | will_run | fetch FO-512                | fetch FO-512  |
| plan            | will_run | generate implementation plan| FO-512        |
| jira-post-plan  | will_run | post plan to Jira           | post-plan ... |
| ...             | ...      | ...                         | ...           |

Warnings:
  - <any warnings>
```

If `context.onDefaultBranch` is true AND no ticket: show warning and stop. User needs a feature branch.

If any step is `blocked`: show reason and stop.

**If `--dry-run`:** display pipeline and stop. Clean up: `rm -f "$SHIP_DATA"`.

## Step 2 - Confirm

**If `--auto`:** proceed without asking.

**If `--phase` is set:** proceed without asking (triggered by webhook, not interactive).

**Otherwise:** ask user to confirm or cancel.

## Step 3 - Execute Pipeline

For each step with `status: "will_run"`, invoke the corresponding skill:

```
Step 1/N: Jira Fetch
  Invoking: /df:jira fetch FO-512
```

### Ticket-mode step details

#### jira-fetch
Invoke: `skill: "df:jira", args: "<step.args>"`
Store the returned ticket data in conversation context for the plan step.

#### plan
Invoke: `skill: "df:plan", args: "<step.args>"`
The plan step uses ticket data from jira-fetch as requirements.

**CHECKPOINT (interactive only):** After plan is generated, if `--auto` is NOT set:
- Display the plan
- Ask: approve / edit / cancel
- On cancel: clean up and stop
- On approve: continue to next step

#### jira-post-plan
Post the generated plan as a Jira comment and transition ticket.
Invoke: `skill: "df:jira", args: "<step.args>"`

**If `--phase plan`:** pipeline STOPS here. The plan is in Jira, waiting for human approval. A second invocation with `--phase impl` continues the work.

#### worktree
Invoke: `skill: "df:worktree", args: "<step.args>"`
Only runs if on default branch. Creates isolated worktree named after ticket.

#### execute
Invoke: `skill: "df:execute"`
Executes the plan from the previous step (loaded from `.devflow/plan-*.md`).

#### commit
Invoke: `skill: "df:commit", args: "<step.args>"`

#### review
Invoke: `skill: "df:review", args: "<step.args>"`

**Review gate with auto-fix loop (ticket mode):**

In ticket mode, review failures trigger an automatic fix cycle instead of stopping immediately:

1. Read `.devflow/review-verdict.json`
2. If `CHANGES_REQUESTED`: spawn a fix agent (`model: "sonnet"`) to address findings
3. Re-commit and re-review (max 2 auto-fix attempts)
4. If `APPROVED` or `APPROVED_WITH_NOTES` after fix: continue to PR
5. If still `CHANGES_REQUESTED` after 2 attempts: transition Jira to "Wymaga uwagi" and stop

**Review gate (classic mode):**

Read `.devflow/review-verdict.json`. If verdict is `CHANGES_REQUESTED`:
```
Review verdict: CHANGES REQUESTED (<critical> critical, <high> high)
Pipeline stopped. Fix findings and re-run /df:ship, or:
  1. Fix the issues
  2. /df:commit
  3. /df:ship --skip commit
```
Stop the pipeline. Do not create a PR.

If verdict is `APPROVED` or `APPROVED_WITH_NOTES`: continue to PR.

#### pr
Invoke: `skill: "df:pr", args: "<step.args>"`

#### jira-post-result
Post PR link as Jira comment and transition ticket.
Invoke: `skill: "df:jira", args: "<step.args>"`

After each step, print result:
```
  [done] Step 1: jira-fetch - FO-512: Add crystal album support
  [done] Step 2: plan - 4 groups, 12 tasks
  [done] Step 3: jira-post-plan - plan posted, ticket transitioned
  ...
```

## Step 4 - Summary

```
Ship Pipeline Complete
======================
  Ticket: FO-512
  Phase:  impl

  worktree:        [done] .worktrees/fo-512
  execute:         [done] 4/4 groups, 12/12 tasks
  commit:          [done] a1b2c3d feat(crystal): add album support
  review:          [done] APPROVED WITH NOTES (2 medium)
  pr:              [done] https://github.com/.../pull/42
  jira-post-result:[done] PR posted, ticket transitioned

Deferred findings (2 medium):
  1. [medium] src/auth.ts:42 - Token in localStorage
  2. [medium] src/config.ts:10 - Hardcoded timeout
```

Clean up: `rm -f "$SHIP_DATA"`

## Usage

```
/df:ship                           # Full: plan -> execute -> commit -> review -> PR
/df:ship FO-512                    # Ticket: jira fetch -> plan -> execute -> ship -> jira update
/df:ship FO-512 --phase plan       # Ticket phase 1: fetch -> plan -> post to Jira -> STOP
/df:ship FO-512 --phase impl       # Ticket phase 2: worktree -> execute -> ship -> jira update
/df:ship FO-512 --auto             # Ticket pipeline, no confirmations (for webhooks)
/df:ship --skip plan,execute       # Legacy: commit -> review -> PR only
/df:ship --skip plan               # Skip planning, execute existing plan
/df:ship --dry-run                 # Show pipeline plan without executing
/df:ship --draft                   # Create PR as draft
```

## Jira Workflow (ticket mode)

Separate Jira project with a dedicated workflow. 6 statuses:

```
Do realizacji ──[Claude: plan]──> Plan do akceptacji
Plan do akceptacji ──[human: approve]──> Zaakceptowany
Plan do akceptacji ──[human: reject]──> Wymaga uwagi
Zaakceptowany ──[Claude: impl success]──> PR gotowy
Zaakceptowany ──[Claude: impl failure]──> Wymaga uwagi
PR gotowy ──[human: merge]──> Gotowy
Wymaga uwagi ──[human: retry]──> Do realizacji
```

| Jira Status | Who acts | Webhook trigger? |
|---|---|---|
| Do realizacji | Claude | YES → `--phase plan` |
| Plan do akceptacji | Human (reads plan) | no |
| Zaakceptowany | Claude | YES → `--phase impl` |
| PR gotowy | Human (merge PR) | no |
| Wymaga uwagi | Human (plan rejected or Claude stuck) | no |
| Gotowy | terminal | no |

Each phase is a separate `claude -p` invocation. Jira is the control plane.

### Phase plan (Do realizacji → Plan do akceptacji)

1. Fetch ticket requirements
2. Analyze codebase
3. Assess whether OpenSpec is needed - if new capability/behavioral change, recommend it in comment
4. Generate plan (`/df:plan`)
5. Post plan as Jira comment
6. Transition → "Plan do akceptacji"

### Phase impl (Zaakceptowany → PR gotowy / Wymaga uwagi)

1. Create worktree (`/df:worktree create`)
2. Execute plan (`/df:execute`)
3. Ship: commit → review → auto-fix loop (max 2 attempts) → PR
4. If review APPROVED → post PR link, transition → "PR gotowy"
5. If review CHANGES_REQUESTED after 2 auto-fix attempts → post issue list, transition → "Wymaga uwagi"

## Arguments

| Flag | Description |
|---|---|
| (positional) | Ticket ID (e.g. `FO-512`) - enables ticket mode |
| `--phase plan\|impl` | Run specific phase only |
| `--skip step1,step2` | Skip specified steps |
| `--auto` | Skip all confirmation prompts |
| `--dry-run` | Show pipeline plan without executing |
| `--draft` | Create PR as draft |

## DO NOT

- Skip steps marked `will_run` in the pipeline
- Create a PR when review verdict is CHANGES_REQUESTED (in classic mode)
- Run steps in parallel - the pipeline is strictly sequential
- Invoke sub-commands via Agent tool - use the Skill tool
- Continue after `--phase plan` posts to Jira - the pipeline must STOP for human approval
- Transition Jira ticket without posting a comment explaining what was done
