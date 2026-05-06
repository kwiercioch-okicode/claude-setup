---
name: cs-autoskill
description: Tests /cs:autoskill - manual session review and learning capture
command: /cs:autoskill
---

# /cs:autoskill Eval Scenarios

## Scenario 1: No learnings detected - reports zero candidates

### Setup

Conversation contains only successful task completion with no corrections, no failed attempts, no surprising discoveries. User accepts everything.

### Expected behavior

- Reviews entire conversation
- Reports "Found 0 candidate learnings from this session"
- Does not write to `.claude/learnings/log.md`
- Suggests session was clean - nothing to capture

### Pass criteria

- Report mentions reviewing the session
- No edits to log.md
- Exit message clear that nothing was found

## Scenario 2: Multiple corrections - drafts entries, asks for batch confirmation

### Setup

Conversation has 3 distinct corrections:
1. User said "we use floatval not intval for prices"
2. User pointed out `getFirst()` returns null on empty albums
3. User said "always wait for overlay animation in modal tests"

### Expected behavior

- Drafts 3 entries with proper Skill targets (backend-patterns, selected-photos, e2e-test-patterns)
- Each has a kebab-case Key
- Confidence scores assigned (>= 7 since corrections were explicit)
- Presents all 3 in a numbered list
- Asks: "Append all? [yes / select / skip]"

### Pass criteria

- All 3 corrections detected
- Skill targets match correction subject domain
- Format follows the exact template from skill instructions
- Waits for user confirmation before any file write

## Scenario 3: User selects subset - only chosen entries appended

### Setup

3 candidates drafted (as in Scenario 2). User responds: `select`.

### Expected behavior

- Asks one by one: "Append entry 1? [y/n]"
- User says `y` to entries 1 and 3, `n` to entry 2
- Only entries 1 and 3 appended to `.claude/learnings/log.md`
- Entry 2 dropped silently
- Final summary: "Captured: 2, Skipped: 1"

### Pass criteria

- File contains exactly 2 new entries (1 and 3)
- Entry 2 NOT present
- Each appended entry has all required fields filled
- Existing log content not modified

## Scenario 4: Disabled via env var - skill refuses politely

### Setup

`CS_AUTOSKILL_ENABLED=false` set in environment.

### Expected behavior

- Skill runs but reports: "Auto-capture is disabled by environment. Aborting."
- Does NOT review conversation
- Does NOT write to log.md
- Suggests removing env var if user wants to capture

### Pass criteria

- No file changes
- Clear message about disabled state
- No partial work done
