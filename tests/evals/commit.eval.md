---
name: df-commit
description: Tests /df:commit - smart commit with style detection and multi-repo support
command: /df:commit
prepare_script: commit-prepare.js
---

# /df:commit Eval Scenarios

## Scenario 1: No staged files

### Setup

Git working tree clean - no staged files, no unstaged changes.

```json
// commit-prepare.js output
{
  "staged": [],
  "recentMessages": ["feat: add user profile page", "fix: correct date formatting"],
  "diffSummary": null,
  "multiRepo": false
}
```

### Expected behavior

- Detects empty staged list from prepare script JSON
- Informs user there are no staged files to commit
- Suggests running `git add` to stage files
- Does NOT generate a commit message
- Does NOT invoke git commit

### Pass criteria

- [ ] Output contains error/warning about no staged files
- [ ] Output contains suggestion to stage files
- [ ] No git commit executed


## Scenario 2: Staged files with conventional commit style

### Setup

Three files staged. Recent history uses conventional commits.

```json
// commit-prepare.js output
{
  "staged": ["src/components/UserCard.tsx", "src/components/UserCard.test.tsx", "src/types/user.ts"],
  "recentMessages": [
    "feat(auth): add OAuth2 login flow",
    "fix(api): handle null response from /users endpoint",
    "refactor(components): extract shared Button styles",
    "test(auth): add integration tests for login"
  ],
  "diffSummary": "+142 -23 across 3 files. New UserCard component with tests, added UserProfile type.",
  "multiRepo": false
}
```

### Expected behavior

- Detects conventional commit style from recentMessages
- Generates message in `type(scope): description` format
- Message type is appropriate (feat, not fix or refactor)
- Presents message to user for approval before committing

### Pass criteria

- [ ] Generated message uses conventional commit format
- [ ] Message type matches the change (feat for new component)
- [ ] User is asked for confirmation before commit
- [ ] git commit executed after approval


## Scenario 3: --auto flag skips confirmation

### Setup

One file staged, `--auto` flag provided.

```json
// command args: --auto
// commit-prepare.js output
{
  "staged": ["src/utils/formatDate.ts"],
  "recentMessages": ["fix typo in header", "update dependencies", "add date util"],
  "diffSummary": "+8 -2 across 1 file. Fixed off-by-one in month calculation.",
  "multiRepo": false
}
```

### Expected behavior

- Detects casual commit style (no conventional prefix)
- Generates message matching casual style
- Skips user confirmation entirely (--auto)
- Executes git commit immediately

### Pass criteria

- [ ] Generated message matches casual style
- [ ] No confirmation prompt shown
- [ ] git commit executed immediately
