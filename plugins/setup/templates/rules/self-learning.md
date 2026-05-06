# Self-Learning

The cs plugin runs an automatic capture/recall loop. Most of this happens without you doing anything; the rest is when to intervene.

## How auto-capture works

The plugin registers two hooks:

| Hook | What it does |
|---|---|
| `SessionStart` | Reads `.claude/learnings/log.md`, injects top N ACTIVE entries (sorted by confidence) as a system reminder. You see them BEFORE doing any work. |
| `UserPromptSubmit` | Spawns a detached background process. A small model (Haiku) judges whether the user just corrected the assistant. If yes, it appends a new ACTIVE entry to `log.md`. Zero added latency on your turn. |

**Trust the loop.** Past learnings already in your context. Apply them. Say "Prior learning applied: <key>" when one drives a decision - it's visible to the user that the system worked.

## When to act manually

- **Hook missed a learning.** Run `/cs:autoskill` to review the session and append entries the judge skipped.
- **A learning you wrote is wrong.** Edit `log.md` directly - change `**Status:** ACTIVE` to `**Status:** STALE` and add a one-line reason.
- **`log.md` reached 10+ ACTIVE entries.** Run `/cs:harvest` to promote them into permanent skill files (Gotchas / Anti-Patterns / Rules sections).

## Manual capture format (when you must)

If you append to `log.md` directly, follow this exact format so harvest can parse it:

```markdown
## YYYY-MM-DD HH:MM - <6-10 word title>
**Status:** ACTIVE
**Skill:** <skill-name | rule:<name> | docs | new:<name>>
**Key:** <kebab-case-key>
**Context:** <what you were doing>
**Learning:** <the actual lesson>
**Action:** <concrete next step>
**Source:** manual
**Confidence:** <1-10>/10
```

**Skill field values:**
- Existing skill: `selected-photos`, `backend-patterns`, `e2e-test-patterns`, etc.
- Process rule: `rule:test-first`, `rule:fact-check`, etc.
- Documentation: `docs`
- New skill needed: `new:<proposed-name>`

## Disabling auto-capture

Set `CS_AUTOSKILL_ENABLED=false` to disable the hook entirely. Recall and judge both honor this. `/cs:autoskill` and `/cs:harvest` still work for manual flow.

Other env vars:
- `CS_RECALL_LIMIT` (default 10) - how many learnings SessionStart injects
- `CS_RECALL_MIN_CONFIDENCE` (default 6) - filter out low-confidence noise
- `CS_AUTOSKILL_MIN_CONFIDENCE` (default 6) - judge skips entries below this
- `CS_AUTOSKILL_MODEL` (default `claude-haiku-4-5`) - judge model
- `CS_AUTOSKILL_DEBUG=1` - write `.claude/learnings/.judge-debug.log`

## Harvest

When `log.md` has 10+ ACTIVE entries, run `/cs:harvest`. It groups entries by Skill field and promotes each to the right file:

- Skill entry -> Gotchas or Patterns section in that skill's `SKILL.md`
- Rule entry -> update or create `.claude/rules/<name>.md`
- Docs entry -> `.claude/docs/traps.md` or relevant doc
- `new:<name>` entry -> new skill candidate (always asks)

Promoted entries change to `**Status:** PROMOTED`. They stay in the log for audit but are no longer surfaced by recall.
