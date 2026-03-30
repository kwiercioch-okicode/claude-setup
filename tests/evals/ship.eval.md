---
name: df-ship
description: Tests /df:ship - thin orchestrator for commit, review, PR pipeline
command: /df:ship
prepare_script: ship-prepare.js
---

# /df:ship Eval Scenarios

## Scenario 1: --dry-run shows pipeline table and stops

### Setup

Dirty working tree, no prior review verdict. `--dry-run` flag set.

```json
// command args: --dry-run
// ship-prepare.js output
{
  "pipeline": [
    {"step": "commit", "status": "pending", "reason": "dirty files detected"},
    {"step": "review", "status": "pending", "reason": "no verdict found"},
    {"step": "pr", "status": "pending", "reason": "no remote PR"}
  ],
  "currentBranch": "feat/user-profile",
  "defaultBranch": "main",
  "dirtyFiles": ["src/UserProfile.tsx"],
  "reviewVerdict": null
}
```

### Expected behavior

- Displays pipeline table with all 3 steps and their status
- Shows current branch info
- Because --dry-run, stops after displaying table
- Does NOT invoke /df:commit, /df:review, or /df:pr
- Does NOT modify any files or git state

### Pass criteria

- [ ] Pipeline table displayed with commit, review, pr steps
- [ ] Each step shows pending status with reason
- [ ] No skills invoked (commit, review, pr)
- [ ] Execution stops after table display


## Scenario 2: On default branch - warn and stop

### Setup

User is on main branch.

```json
// ship-prepare.js output
{
  "pipeline": [],
  "currentBranch": "main",
  "defaultBranch": "main",
  "dirtyFiles": ["src/index.ts"],
  "reviewVerdict": null,
  "error": "Cannot ship from default branch (main)"
}
```

### Expected behavior

- Detects currentBranch === defaultBranch from prepare script
- Shows error: cannot ship from default branch
- Suggests creating a feature branch first
- Pipeline does NOT execute any steps

### Pass criteria

- [ ] Error about shipping from default branch
- [ ] Suggestion to create feature branch
- [ ] No pipeline steps executed


## Scenario 3: --skip review skips review step

### Setup

Feature branch with dirty files, `--skip review` flag.

```json
// command args: --skip review
// ship-prepare.js output
{
  "pipeline": [
    {"step": "commit", "status": "pending", "reason": "dirty files detected"},
    {"step": "review", "status": "skipped", "reason": "skipped by --skip flag"},
    {"step": "pr", "status": "pending", "reason": "no remote PR"}
  ],
  "currentBranch": "feat/new-feature",
  "defaultBranch": "main",
  "dirtyFiles": ["src/feature.ts"],
  "reviewVerdict": null,
  "skipped": ["review"]
}
```

### Expected behavior

- Pipeline table shows review as "skipped"
- Invokes /df:commit for dirty files
- Skips /df:review entirely (no dimension agents)
- Invokes /df:pr to create pull request
- Does NOT block on missing review verdict (review was explicitly skipped)

### Pass criteria

- [ ] Review step marked as skipped in pipeline
- [ ] /df:commit invoked
- [ ] /df:review NOT invoked
- [ ] /df:pr invoked
- [ ] No review-gate block
