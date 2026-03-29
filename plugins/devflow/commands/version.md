---
description: "Bump version with semantic versioning, changelog generation, multi-repo tags."
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent]
---

# /df:version

Bump version with semantic versioning, generate changelog, tag repos.

**Announce at start:** "I'm using the df:version command."

## Step 0 - Run version-prepare.js

```bash
SCRIPT=$(find ~/.claude/plugins -name "version-prepare.js" 2>/dev/null | head -1)
[ -z "$SCRIPT" ] && [ -f "plugins/devflow/scripts/version-prepare.js" ] && SCRIPT="plugins/devflow/scripts/version-prepare.js"
[ -z "$SCRIPT" ] && { echo "ERROR: Could not locate version-prepare.js. Is the df plugin installed?" >&2; exit 2; }

VER_DATA=$(mktemp /tmp/version-prepare-XXXXXX.json)
node "$SCRIPT" $ARGUMENTS > "$VER_DATA"
EXIT_CODE=$?
echo "VER_DATA=$VER_DATA"
echo "EXIT_CODE=$EXIT_CODE"
```

On non-zero exit: show stderr message and stop.

## Step 1 - Display Version Plan

Read `$VER_DATA` JSON. Display:

```
Version plan:
  Current:  v1.2.3
  Next:     v1.3.0 (minor - auto-detected from 5 commits)
  Commits:  5 since last tag

Changelog draft:
  - feat(auth): add PKCE flow (a1b2c3d)
  - fix(api): handle timeout on slow networks (d4e5f6a)
  ...
```

Show warnings (uncommitted changes, no current version).

## Step 2 - Confirm

**If `--auto`:** proceed without asking.
**Otherwise:** ask user to confirm version, bump type, and changelog.

## Step 3 - Tag and Push

```bash
git tag -a v<next> -m "Release v<next>"
git push origin v<next>
```

If multi-repo: tag each repo with the same version.

Update CHANGELOG.md if it exists (prepend new section).

Clean up: `rm -f "$VER_DATA"`

## Arguments

| Flag | Description |
|---|---|
| `--bump patch\|minor\|major` | Override auto-detected bump type |
| `--auto` | Skip confirmation |
| (positional) | `patch`, `minor`, or `major` |

## DO NOT

- Tag without user confirmation (unless --auto)
- Push tags to remote without local tag first
- Modify CHANGELOG.md format if it already exists - follow existing pattern
