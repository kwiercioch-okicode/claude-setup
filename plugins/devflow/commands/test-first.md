---
description: "TDD workflow: write failing test before production code. No exceptions."
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent]
---

# /df:test-first

Enforce TDD workflow: write a failing test before production code.

**This command is invoked automatically** when the user starts a code change (bug fix, feature, refactor). It can also be invoked manually.

## Workflow

### 1. Identify the Change

Determine what is being changed:
- Bug fix: what behavior is broken?
- Feature: what behavior should exist?
- Refactor: what behavior must be preserved?

### 2. Write Failing Test

Write a test that:
- **Bug fix:** reproduces the exact bug. Run it - it must FAIL (red).
- **Feature:** specifies the expected behavior. Run it - it must FAIL (red).
- **Refactor:** captures current behavior (characterization test). Run it - it must PASS (green). This test guards against accidental behavior change.

### 3. Verify Red (or Green for Refactor)

Run the test:
```bash
# Detect test runner from project
npm test          # JS/TS
php vendor/bin/phpunit  # PHP
pytest            # Python
go test           # Go
```

For bug/feature: test MUST fail. If it passes, the test doesn't test what you think.
For refactor: test MUST pass. If it fails, you don't understand the current behavior.

### 4. Hand Off

After the failing test exists, proceed to implementation. The test is the spec.

## Exceptions (no test needed)

- Infrastructure/config changes (Dockerfile, CI, .env)
- CSS-only visual fixes
- Pure typos with no logic change
- Documentation

## DO NOT

- Write production code before the test exists and fails
- Write a test that passes immediately for bug/feature work
- Skip this step because the change looks "simple"
- Write tests that test implementation details instead of behavior
