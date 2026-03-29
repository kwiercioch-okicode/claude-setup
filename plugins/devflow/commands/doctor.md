---
description: "Check guardrails health - hooks installed, dimensions discovered, verdict gates working."
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent]
---

# /df:doctor

Check guardrails health - verify hooks, dimensions, verdict gates, and project detection.

**Announce at start:** "I'm using the df:doctor command."

## Step 0 - Run doctor.js

```bash
SCRIPT=$(find ~/.claude/plugins -name "doctor.js" -path "*/devflow/*" 2>/dev/null | head -1)
[ -z "$SCRIPT" ] && [ -f "plugins/devflow/scripts/doctor.js" ] && SCRIPT="plugins/devflow/scripts/doctor.js"
[ -z "$SCRIPT" ] && { echo "ERROR: Could not locate doctor.js. Is the df plugin installed?" >&2; exit 2; }

DOCTOR_DATA=$(mktemp /tmp/doctor-XXXXXX.json)
node "$SCRIPT" > "$DOCTOR_DATA"
EXIT_CODE=$?
echo "DOCTOR_DATA=$DOCTOR_DATA"
echo "EXIT_CODE=$EXIT_CODE"
```

## Step 1 - Display Report

Read `$DOCTOR_DATA` JSON. Display as a checklist:

```
df:doctor - Guardrails Health Check
====================================

Hooks:
  [pass] hooks.json (devflow): 3 hooks configured
  [pass] Detect active worktrees and inject context
  [pass] Block commits and pushes to main/master
  [pass] Block PR creation without review verdict

Discovery:
  [pass] review dimensions: 10 found (security, tests, architecture, ...)
  [pass] multi-repo: 2 repos (api-fotigo, fotigo)
  [pass] worktrees: Main worktree (2 active worktrees)
  [info] OpenSpec: Detected
  [pass] .dev-env.yml: Found
  [pass] gh CLI: Authenticated

Verdict files:
  [info] review-verdict.json: Not present (no review run yet)
```

Use `[pass]` for checks that passed, `[fail]` for failures, `[info]` for informational.

## Step 2 - Suggest Fixes

For each `[fail]` result, suggest a specific fix:
- Missing hooks -> "Reinstall the df plugin: /plugin install df@devflow"
- No dimensions -> "Create dimensions with /cs:init or add .claude/review-dimensions/*.md"
- gh CLI not authenticated -> "Run: gh auth login"
- Corrupt verdict -> "Delete .devflow/review-verdict.json and re-run /df:review"

Clean up: `rm -f "$DOCTOR_DATA"`

## DO NOT

- Skip any section of the report
- Report pass for checks that actually failed
- Attempt to auto-fix issues - only suggest fixes
