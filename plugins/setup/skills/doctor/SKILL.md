---
description: "Diagnose claude-setup installation, templates, project configuration, and ecosystem tools."
---

# /cs:doctor - Diagnostic Check

You are the diagnostic agent for `claude-setup`. Run all checks and present a clean, concise report.

## Step 1: Plugin Check

Check plugin installation:

```bash
# Check if cs plugin is in installed_plugins.json
cat ~/.claude/plugins/installed_plugins.json 2>/dev/null | grep -o '"cs@claude-setup"'
# Get installed version
cat ~/.claude/plugins/installed_plugins.json 2>/dev/null | grep -A5 '"cs@claude-setup"' | grep '"version"'
```

## Step 2: Templates Check

Verify all required templates exist and are readable. Check each one:

```bash
PLUGIN_DIR="${CLAUDE_SKILL_DIR}/.."

# Core templates
ls -la "$PLUGIN_DIR/templates/CLAUDE.md.template" 2>/dev/null
ls -la "$PLUGIN_DIR/templates/review-skill.md.template" 2>/dev/null
ls -la "$PLUGIN_DIR/templates/ecosystem-registry.json" 2>/dev/null

# Review prompt templates (expect 6)
ls "$PLUGIN_DIR/templates/review-prompts/"*.md.template 2>/dev/null | wc -l

# Stack detection script
node "$PLUGIN_DIR/scripts/detect-stack.js" --version 2>/dev/null || node -e "console.log('node ok')"
```

Count: X/9 templates (CLAUDE.md.template, review-skill.md.template, ecosystem-registry.json, + 6 review prompts).

## Step 3: Project Configuration Check

Check if current project has `.claude/` configuration:

```bash
ls -la .claude/ 2>/dev/null
ls -la CLAUDE.md 2>/dev/null
find .claude/skills/ -name "SKILL.md" 2>/dev/null
find .claude/docs/ -name "*.md" 2>/dev/null
find .claude/agents/ -name "*.md" 2>/dev/null
```

For each skill found, verify:
- Has valid YAML frontmatter (`name` and `description` fields)
- File is not empty

Check review setup:
- Does `.claude/skills/review/SKILL.md` exist?
- How many review dimensions in `.claude/skills/review/prompts/`?
- Compare against 6 base dimensions (security, tests, architecture, performance, naming, error-handling)

## Step 4: Quick Broken References Check

For each skill, scan for file path references and verify they still exist. Only check explicit paths (starting with `/`, `./`, or `src/`), not general mentions.

## Step 5: Ecosystem Detection

Read the ecosystem registry from `${CLAUDE_SKILL_DIR}/../templates/ecosystem-registry.json`.
Also check for project-local registry at `.claude/setup-registry.json`.

For each tool in registry, run its `detect` command to check if installed. Report status.

Additionally detect these common tools:
```bash
# CLI tools
which node 2>/dev/null
which bun 2>/dev/null
which docker 2>/dev/null
which kubectl 2>/dev/null
which terraform 2>/dev/null
which gh 2>/dev/null
which composer 2>/dev/null
which php 2>/dev/null
which python3 2>/dev/null
which go 2>/dev/null
which cargo 2>/dev/null

# MCP servers (from Claude settings)
cat ~/.claude/settings.json 2>/dev/null | grep -o '"[^"]*mcp[^"]*"' | head -20

# Claude Code version
claude --version 2>/dev/null
```

## Step 6: Present Report

Format output as a clean diagnostic report:

```
claude-setup doctor

  Plugin: v0.3.0 (installed) ✓
  Templates: 9/9 ✓
  Stack detector: PASS (node v22.x)

  Project (.claude/):
    CLAUDE.md: PASS | MISSING
    Skills: N found, M invalid
    Review: X/6 base dimensions
    Broken refs: N found

  Ecosystem:
    Installed: superpowers, gh, context7, ...
    Suggested: [tool] - [reason]
    Not relevant: [tool] - [why skipped]

  Runtime:
    Node: v22.x
    Claude Code: v1.x
    OS: darwin/linux
```

Use ✓ for PASS, ✗ for FAIL, ⚠ for WARNING (partial/degraded).

If there are issues, add a section at the bottom:

```
  Issues found:
    1. [CATEGORY] description - how to fix
    2. ...
```

Categories: MISSING, BROKEN, OUTDATED, SUGGESTION
