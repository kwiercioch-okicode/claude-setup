---
name: df-doctor
description: Tests /df:doctor - guardrails health check (zero LLM, deterministic)
command: /df:doctor
prepare_script: doctor.js
---

# /df:doctor Eval Scenarios

## Scenario 1: All hooks present - all checks pass

### Setup

Project has all expected hooks, review dimensions, and configuration.

```json
// doctor.js output
{
  "checks": [
    {"name": "branch-protection-hook", "status": "pass", "detail": "PreToolUse:Bash hook installed"},
    {"name": "secret-detection-hook", "status": "pass", "detail": "PreToolUse:Bash hook installed"},
    {"name": "review-dimensions", "status": "pass", "detail": "5 dimensions found in .claude/skills/review/prompts/"},
    {"name": "review-verdict-gate", "status": "pass", "detail": "PreToolUse:Bash hook for gh pr create installed"},
    {"name": "worktree-guard", "status": "pass", "detail": "SessionStart hook installed"}
  ],
  "summary": {"pass": 5, "fail": 0, "warn": 0}
}
```

### Expected behavior

- Reads doctor.js output (zero LLM, pure deterministic check)
- Displays all checks with pass status
- Shows summary: 5/5 passed
- No remediation suggestions needed

### Pass criteria

- [ ] All 5 checks displayed with pass status
- [ ] Summary shows 5 pass, 0 fail
- [ ] No remediation actions suggested
- [ ] Output is deterministic (no LLM generation needed)


## Scenario 2: No review dimensions - check fails

### Setup

Hooks are installed but no review dimensions directory exists.

```json
// doctor.js output
{
  "checks": [
    {"name": "branch-protection-hook", "status": "pass", "detail": "PreToolUse:Bash hook installed"},
    {"name": "secret-detection-hook", "status": "pass", "detail": "PreToolUse:Bash hook installed"},
    {"name": "review-dimensions", "status": "fail", "detail": "No dimensions found. Checked: .claude/review-dimensions/, .claude/skills/review/prompts/"},
    {"name": "review-verdict-gate", "status": "pass", "detail": "PreToolUse:Bash hook for gh pr create installed"},
    {"name": "worktree-guard", "status": "pass", "detail": "SessionStart hook installed"}
  ],
  "summary": {"pass": 4, "fail": 1, "warn": 0}
}
```

### Expected behavior

- Displays all checks, with review-dimensions showing fail
- Shows summary: 4 pass, 1 fail
- Provides remediation for the failing check:
  - Suggests creating `.claude/skills/review/prompts/` with dimension files
  - Or running `/cs:init` to generate review dimensions from codebase
- Exit indicates failure (non-zero or explicit fail status)

### Pass criteria

- [ ] review-dimensions check shows fail with detail
- [ ] Summary shows 4 pass, 1 fail
- [ ] Remediation suggestion for missing dimensions
- [ ] Clear indication of overall health failure
