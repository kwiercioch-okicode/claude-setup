---
name: learnings-recall
description: Tests SessionStart hook - inject prior learnings into conversation
command: SessionStart hook (automatic)
---

# learnings-recall hook eval scenarios

These tests run the script directly: `node plugins/setup/scripts/learnings-recall.js < payload.json`

## Scenario 1: No log file - exit clean

### Setup

`.claude/learnings/log.md` does not exist.
Stdin payload: `{"cwd": "/path/to/project", "session_id": "abc"}`

### Expected behavior

- Script exits 0
- No stdout output
- No errors

### Pass criteria

- `process.exit(0)` reached
- stdout is empty
- stderr is empty (no parse errors)

## Scenario 2: Log with only PROMOTED entries - no recall surfaced

### Setup

`.claude/learnings/log.md` contains 5 entries, all `**Status:** PROMOTED`.

### Expected behavior

- Script reads log
- Filters by `status === 'ACTIVE'` - 0 matches
- Exits without stdout
- No reminder injected

### Pass criteria

- Empty stdout (no top entries to surface)
- Exit code 0

## Scenario 3: Mixed log - top N ACTIVE by confidence injected

### Setup

`.claude/learnings/log.md` contains 15 ACTIVE entries with confidence 1-10 mixed, plus 3 PROMOTED.
`CS_RECALL_LIMIT=10`, `CS_RECALL_MIN_CONFIDENCE=6`.

### Expected behavior

- Reads log, parses 18 entries
- Filters to ACTIVE only (15)
- Filters by confidence >= 6 (let's say 11 match)
- Sorts by confidence descending, then date descending
- Takes top 10
- Dedups by Key (so duplicates don't repeat)
- Outputs: "PRIOR LEARNINGS LOADED: 10 of 15 ACTIVE entries (confidence >= 6/10)."
- Lists each with `[skill] key (N/10): learning -> action`

### Pass criteria

- Output starts with "PRIOR LEARNINGS LOADED"
- Exactly 10 entries (or fewer if dedup hit)
- All entries have confidence >= 6
- Top entry has highest confidence
- Above-threshold note appears: "Note: 15 ACTIVE entries... run /cs:harvest"

## Scenario 4: Disabled via env - zero output

### Setup

`CS_AUTOSKILL_ENABLED=false`. Log has 10 high-confidence ACTIVE entries.

### Expected behavior

- Script reads env var
- Exits immediately
- No stdout
- Log file not even read

### Pass criteria

- Exit code 0
- Empty stdout
- No reminder injected (so user-disabled state is honored)
