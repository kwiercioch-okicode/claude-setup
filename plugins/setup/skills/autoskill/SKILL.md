---
description: "Manual session review - extract learnings from current conversation and append to .claude/learnings/log.md."
allowed-tools: [Read, Write, Edit, Glob, Bash]
---

# /cs:autoskill

Manual fallback for the auto-capture system. Reviews the current conversation and appends learnings to `.claude/learnings/log.md`.

**Use when:** auto-capture (UserPromptSubmit hook) is disabled, was wrong, or missed something. The hook handles 80% automatically; this skill catches the rest.

**Announce at start:** "I'm using the cs:autoskill command."

## Step 0 - Verify log path

Check `.claude/learnings/log.md` exists in the current project. If not, create it with header:

```markdown
# Learnings Log

Append entries when: user corrects you, you discover a non-obvious gotcha, a pattern fails unexpectedly, or you find a gap in skills/rules.
```

## Step 1 - Review the conversation

Look back over the entire current session. Identify moments where ANY of these happened:

| Signal | Example |
|---|---|
| User correction | "no, do X instead", "wrong approach", "we always Y", "don't Z" |
| Discovered gotcha | API/library behaved unlike documented or expected |
| Failed pattern | An approach you tried did not work and you had to abandon it |
| Domain rule revealed | Business rule, naming convention, or invariant the user mentioned |
| Confirmed pattern | Non-obvious choice you made that the user explicitly approved |

For each moment, draft an entry in this format:

```markdown
## YYYY-MM-DD HH:MM - <6-10 word title>
**Status:** ACTIVE
**Skill:** <skill-name | rule:<name> | docs | new:<name>>
**Key:** <kebab-case-key>
**Context:** <what you were doing>
**Learning:** <the actual lesson>
**Action:** <concrete next step>
**Source:** manual (autoskill review)
**Confidence:** <1-10>/10
```

## Step 2 - Present and confirm

Show ALL drafted entries to the user as a single list:

```
Found N candidate learnings from this session:

1. [backend-patterns] price-numeric-type (9/10): Ceny w fotigo są DECIMAL...
2. [e2e-test-patterns] modal-overlay-timing (7/10): czekaj na overlay animation...

Append all? [yes / select / skip]
```

- `yes` -> append all
- `select` -> ask one by one
- `skip` -> abort, no changes

## Step 3 - Append approved entries

For each approved entry: append to `.claude/learnings/log.md` (do NOT overwrite). Use the format from Step 1.

## Step 4 - Summary

```
Captured: N entries
Skipped:  N entries
Total ACTIVE in log: N

Next step: when ACTIVE >= 10, run /cs:harvest to promote into skill files.
```

## DO NOT

- Capture flattery, social comments, or scope additions ("also do X")
- Capture one-time formatting nits unless the user emphasized them
- Modify existing entries - always append new ones
- Commit log.md without showing the user first
- Run if user explicitly disables capture (`CS_AUTOSKILL_ENABLED=false` in env)

## Relationship to auto-capture

The plugin's `UserPromptSubmit` hook auto-detects corrections via background Haiku judge. This skill is a manual top-up:

- When to skip this skill: hook is enabled and you trust its capture
- When to run this skill: end of session, you remember a learning the hook missed, you want full session review
