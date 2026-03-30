---
name: df-pr
description: Tests /df:pr - auto PR description with review-gate and template support
command: /df:pr
prepare_script: pr-prepare.js
---

# /df:pr Eval Scenarios

## Scenario 1: No review verdict - warn about review-gate

### Setup

Feature branch with commits, but no `.devflow/review-verdict.json` exists.

```json
// pr-prepare.js output
{
  "commits": [
    {"hash": "abc1234", "message": "feat: add user profile endpoint"},
    {"hash": "def5678", "message": "test: add user profile tests"}
  ],
  "diffStat": "+180 -12 across 4 files",
  "remote": {"branch": "feat/user-profile", "pushed": true},
  "prTemplate": null,
  "reviewVerdict": null
}
```

### Expected behavior

- Detects missing review verdict from prepare script
- Warns user that PR review-gate hook will block `gh pr create`
- Suggests running `/df:review` first or using `/df:ship` for the full pipeline
- Still generates PR title and body (for preview)
- Does NOT attempt `gh pr create` (gate will reject it)

### Pass criteria

- [ ] Warning about missing review verdict
- [ ] Suggestion to run /df:review first
- [ ] PR title and body generated for preview
- [ ] gh pr create NOT executed


## Scenario 2: On default branch - error

### Setup

User is on main branch.

```json
// pr-prepare.js output
{
  "commits": [],
  "diffStat": null,
  "remote": {"branch": "main", "pushed": true},
  "prTemplate": null,
  "reviewVerdict": null,
  "error": "Cannot create PR from default branch (main)"
}
```

### Expected behavior

- Detects error from prepare script (on default branch)
- Shows error: cannot create PR from default branch
- Suggests creating a feature branch
- Does NOT generate PR description
- Does NOT attempt gh pr create

### Pass criteria

- [ ] Error about default branch
- [ ] Suggestion to create feature branch
- [ ] No PR description generated
- [ ] No gh pr create executed


## Scenario 3: --draft flag creates draft PR

### Setup

Feature branch with passing review verdict, `--draft` flag.

```json
// command args: --draft
// pr-prepare.js output
{
  "commits": [
    {"hash": "abc1234", "message": "feat: add notification system"},
    {"hash": "def5678", "message": "test: notification integration tests"}
  ],
  "diffStat": "+95 -8 across 3 files",
  "remote": {"branch": "feat/notifications", "pushed": true},
  "prTemplate": "## Summary\n\n## Test plan\n",
  "reviewVerdict": {
    "verdict": "APPROVED",
    "critical": 0,
    "high": 0,
    "medium": 1
  }
}
```

### Expected behavior

- Reads prepare script output with passing verdict and PR template
- Generates PR title and body using the template structure
- Because --draft flag is set, creates a draft PR (not ready for review)
- Executes `gh pr create --draft` with generated title and body

### Pass criteria

- [ ] PR body follows discovered template structure
- [ ] gh pr create called with --draft flag
- [ ] PR title is concise and reflects the commits
- [ ] Review verdict included/referenced in PR body
