---
name: df-review
description: Tests /df:review - multi-dimension code review with parallel dispatch
command: /df:review
prepare_script: review-prepare.js
---

# /df:review Eval Scenarios

## Scenario 1: No review dimensions found

### Setup

Project has no `.claude/review-dimensions/` or `.claude/skills/review/prompts/` directory.

```json
// review-prepare.js output
{
  "changedFiles": ["src/index.ts"],
  "diffHunks": [{"file": "src/index.ts", "hunks": ["+console.log('hello')"]}],
  "dimensions": [],
  "fileDimensionMap": {}
}
```

### Expected behavior

- Detects empty dimensions array from prepare script
- Informs user that no review dimensions were discovered
- Suggests creating dimensions in `.claude/review-dimensions/` or `.claude/skills/review/prompts/`
- Does NOT dispatch any review agents
- Does NOT create verdict file

### Pass criteria

- [ ] Output mentions no dimensions found
- [ ] Output suggests where to add dimensions
- [ ] No subagents dispatched
- [ ] No `.devflow/review-verdict.json` created


## Scenario 2: --dry-run shows plan without dispatch

### Setup

Two dimensions discovered, `--dry-run` flag set.

```json
// command args: --dry-run
// review-prepare.js output
{
  "changedFiles": ["src/Handler/UserHandler.php", "src/Entity/User.php"],
  "diffHunks": [
    {"file": "src/Handler/UserHandler.php", "hunks": ["+$user = $repo->find($id);"]},
    {"file": "src/Entity/User.php", "hunks": ["+private string $email;"]}
  ],
  "dimensions": ["security", "architecture"],
  "fileDimensionMap": {
    "src/Handler/UserHandler.php": ["security", "architecture"],
    "src/Entity/User.php": ["architecture"]
  }
}
```

### Expected behavior

- Reads prepare script output with 2 dimensions
- Displays review plan: which dimensions, which files each covers
- Because --dry-run is set, stops after showing the plan
- Does NOT dispatch dimension subagents
- Does NOT create verdict file

### Pass criteria

- [ ] Output shows review plan with both dimensions
- [ ] Output shows file-to-dimension mapping
- [ ] No dimension agents dispatched
- [ ] Execution stops after plan display


## Scenario 3: Staged changes only (--staged scope)

### Setup

User runs `/df:review --staged`. Only staged diff is analyzed.

```json
// command args: --staged
// review-prepare.js output
{
  "scope": "staged",
  "changedFiles": ["src/utils/validate.ts"],
  "diffHunks": [{"file": "src/utils/validate.ts", "hunks": ["+if (!email.includes('@')) return false;"]}],
  "dimensions": ["security"],
  "fileDimensionMap": {
    "src/utils/validate.ts": ["security"]
  }
}
```

### Expected behavior

- Prepare script was called with --staged scope (only staged diff)
- Reviews only the staged changes, not full branch diff
- Dispatches security dimension agent with staged hunks
- Creates verdict file after review completes

### Pass criteria

- [ ] Review scope limited to staged files only
- [ ] Dimension agent receives only staged diff hunks
- [ ] Verdict written to `.devflow/review-verdict.json`
