---
description: "Smart commit with style detection, multi-repo support, and --auto mode."
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent]
---

# /df:commit

Smart commit that detects project commit style and generates appropriate messages.

**Announce at start:** "I'm using the df:commit command."

## Step 0 - Run commit-prepare.js

```bash
SCRIPT=$(find ~/.claude/plugins -name "commit-prepare.js" 2>/dev/null | head -1)
[ -z "$SCRIPT" ] && [ -f "plugins/devflow/scripts/commit-prepare.js" ] && SCRIPT="plugins/devflow/scripts/commit-prepare.js"
[ -z "$SCRIPT" ] && { echo "ERROR: Could not locate commit-prepare.js. Is the df plugin installed?" >&2; exit 2; }

COMMIT_DATA=$(mktemp /tmp/commit-prepare-XXXXXX.json)
node "$SCRIPT" $ARGUMENTS > "$COMMIT_DATA"
EXIT_CODE=$?
echo "COMMIT_DATA=$COMMIT_DATA"
echo "EXIT_CODE=$EXIT_CODE"
```

On non-zero exit: show stderr message and stop.

## Step 1 - Read and Analyze

Read `$COMMIT_DATA` JSON. Extract:
- `git.staged` - list of staged files with status (A/M/D)
- `git.stagedDiffContent` - full diff of staged changes
- `style.detected` - commit style (conventional, bracketed, emoji, freeform)
- `style.recentMessages` - last 5 commit messages for tone matching
- `context.multiRepo` - whether multi-repo setup detected

## Step 2 - Generate Commit Message

Based on the detected style:

**conventional:** `type(scope): description` where type is inferred from changes:
- New files in src/ -> `feat`
- Modified test files -> `test`
- Config/CI changes -> `chore`
- Bug fix patterns -> `fix`
- Documentation -> `docs`

**bracketed:** `[Type] Description`

**freeform:** Match the tone and casing of recent messages.

Rules:
- First line under 72 characters
- Focus on WHY, not WHAT (the diff shows what)
- If multi-repo, mention which repo the changes affect
- No trailing period on first line

## Step 3 - Present and Confirm

Display:
```
Staged: 5 files (3 modified, 2 added)
Style:  conventional (detected from 15 recent commits)
Branch: feature/my-feature

Proposed commit message:
  feat(auth): add OAuth2 PKCE flow for mobile clients

  Replaces implicit grant which is deprecated in OAuth 2.1.
  Mobile clients now use PKCE with S256 challenge method.
```

**If `--auto`:** commit immediately without asking.

**Otherwise:** Ask user to confirm, edit, or cancel.

## Step 4 - Commit

```bash
git commit -m "<message>"
```

Display the commit hash and short log entry.

Clean up: `rm -f "$COMMIT_DATA"`

## Multi-repo

If `context.multiRepo` is true and changes span multiple repos, commit to each repo separately. Run commit-prepare.js in each repo directory.

## DO NOT

- Generate commit messages without running the prepare script first
- Include file lists in the commit message body (the diff has that)
- Use emojis unless the detected style uses them
- Amend previous commits unless `--amend` was explicitly passed
