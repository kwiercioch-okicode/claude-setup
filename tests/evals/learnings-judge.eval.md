---
name: learnings-judge
description: Tests UserPromptSubmit hook - background correction judge that appends to log.md
command: UserPromptSubmit hook (automatic)
---

# learnings-judge hook eval scenarios

Hook runs in two modes: hook-mode (fast, spawns worker) and worker-mode (calls claude -p, writes log).

## Scenario 1: Slash command prompt - skipped without spawning worker

### Setup

Stdin payload includes `prompt: "/cs:harvest"`. transcript_path exists.

### Expected behavior

- Hook reads payload
- Detects prompt starts with `/`
- Exits 0 immediately
- Does NOT spawn worker process
- Does NOT call claude -p

### Pass criteria

- Exit 0
- No worker process spawned (check via tmp file absence)
- Hook return time < 100ms

## Scenario 2: User correction detected - entry appended to log.md

### Setup

Transcript shows assistant just wrote: "I'll use intval() for the price..."
Stdin prompt: "no, use floatval - prices are decimal in mysql"
`CS_AUTOSKILL_MIN_CONFIDENCE=6`.

### Expected behavior

- Hook spawns detached worker, exits 0
- Worker calls claude -p with Haiku, judge prompt + last_assistant + prompt
- Haiku returns: `{is_correction: true, skill_target: "backend-patterns", key: "price-numeric-type", confidence: 9, ...}`
- Worker confidence >= threshold -> appendEntry to `.claude/learnings/log.md`
- New entry has `**Source:** auto-detected`

### Pass criteria

- Hook returns immediately (< 100ms)
- After ~10s, log.md contains new entry
- Entry has correct Skill, Key, Confidence
- Source field is `auto-detected`

## Scenario 3: Low confidence - entry dropped silently

### Setup

Transcript shows: "I'll use camelCase for variables."
Stdin prompt: "actually I prefer snake_case, but it's minor"
Threshold: 6.

### Expected behavior

- Worker calls Haiku
- Haiku returns: `{is_correction: true, confidence: 4, ...}`
- 4 < 6 threshold -> entry NOT appended
- Debug log shows "low confidence 4 < 6" if `CS_AUTOSKILL_DEBUG=1`

### Pass criteria

- log.md unchanged
- Worker exits 0 (no error)
- Debug log entry present when DEBUG enabled

## Scenario 4: claude binary missing - graceful failure

### Setup

`CS_AUTOSKILL_CLAUDE_BIN=/nonexistent/path`.
Worker spawned with valid payload.

### Expected behavior

- Worker spawns claude binary
- spawn fails with ENOENT
- error handler runs, logs to debug if enabled
- Worker exits 0 (no crash, no log corruption)

### Pass criteria

- Worker exits 0 (not 1, not crash)
- log.md unchanged
- No partial entry written
- Debug log mentions spawn error
