---
description: "Synchronize .claude/ configuration with current codebase. Detects drift, broken references, and missing coverage."
---

# /cs:sync - Synchronize Configuration

You are the orchestrator for `claude-setup` synchronization. Your job is to compare the existing `.claude/` configuration against the current state of the codebase and propose targeted updates.

**This command is STATELESS** - no cache, no sync timestamps. You compare skills directly against code every time.

## Step 1: Read Current Configuration

Read all existing configuration:

```bash
# List all skills
find .claude/skills/ -name "SKILL.md" 2>/dev/null
# List all docs
find .claude/docs/ -name "*.md" 2>/dev/null
# List all agents
find .claude/agents/ -name "*.md" 2>/dev/null
# Read CLAUDE.md
cat CLAUDE.md 2>/dev/null
```

Read each file to understand what the current configuration claims about the project.

## Step 2a: Mechanical Checks (Script — no LLM needed)

Run these checks directly with bash. They are pure file existence / pattern matching:

### Broken References (was Agent A)
```bash
# Extract file paths from skills and docs, test if they exist
grep -rn -oP '(?:src/|app/|lib/|tests?/|config/|\./)[\w/.-]+' .claude/skills/ .claude/docs/ 2>/dev/null | while IFS=: read -r source line path; do
  [ ! -e "$path" ] && echo "BROKEN: $source:$line -> $path"
done
```

### Gotcha Validation (was Agent D)
```bash
# Check if workaround markers still exist in code
grep -rn 'TODO\|HACK\|FIXME\|WORKAROUND\|XXX' --include='*.php' --include='*.ts' --include='*.js' --include='*.tsx' --include='*.jsx' . 2>/dev/null | grep -v node_modules | grep -v vendor
```

Compare against gotchas documented in skills. New markers not in any skill = undocumented gotcha. Markers referenced in skills but gone from code = obsolete gotcha.

## Step 2b: Diagnostics (Parallel Agents)

Launch 4 agents in parallel for checks requiring LLM judgment:

### Agent A: Drift Detection
Compare what skills describe vs what the code actually does:
- Has the pattern described in a skill changed in the code?
- Are there new modules/directories not covered by any skill?
- Have deleted modules left orphaned skills?
- Has the tech stack changed (new dependencies, removed dependencies)?

Output: list of drifts with before/after description.

### Agent B: Quality Check
Evaluate skill quality against research-backed criteria:
- Does the skill contain non-inferable information, or just generic knowledge?
- Is the skill specific enough (concrete examples) or too vague ("best practices")?
- Does the CLAUDE.md contain unnecessary architecture/structure descriptions?
- Are there duplicate skills covering the same domain?

Also check CLAUDE.md template completeness:
- Read the template from `${CLAUDE_SKILL_DIR}/../templates/CLAUDE.md.template`
- Compare existing CLAUDE.md against template section by section
- Flag missing framework sections (Decision Framework, Planning, Verification, Subagents, Code Standards, Lessons) as MISSING proposals
- Do NOT flag sections the user intentionally removed (check git history if available)

Output: list of quality issues + missing CLAUDE.md sections with suggested additions.

### Agent C: Review Completeness
Check the review skill configuration:
- Does `skills/review/SKILL.md` exist? If not, flag as MISSING.
- Read template dimensions from `${CLAUDE_SKILL_DIR}/../templates/review-prompts/`
- Compare against existing `skills/review/prompts/` files
- Flag missing base dimensions (security, tests, architecture, performance, naming, error-handling)
- Check if existing prompts are still generic (copy of template) vs adapted to the project
- If prompts are generic, flag as QUALITY: "Review prompt [X] has no project-specific checks - consider adapting"
- Do NOT propose replacing project-specific prompts with template versions

Output: list of obsolete gotchas + new undocumented gotchas.

### Agent D: Ecosystem Check
Check installed tools against the ecosystem registry:
- Read registry from `${CLAUDE_SKILL_DIR}/../templates/ecosystem-registry.json`
- Also check for project-local registry at `.claude/setup-registry.json`
- For each tool in registry, run its `detect` command to check if installed
- Evaluate `suggest_when` condition against current project (has_frontend, has_docker, etc.)
- Flag tools that match suggestion criteria but are not installed as INFO proposals
- Flag tools that are installed but no longer relevant (e.g., docker-mcp when Docker was removed) as OUTDATED

Output: list of ecosystem suggestions (install/remove).

## Step 3: Present Proposals

Combine all findings into a prioritized list. Group by category and present in batches:

### Categories (in priority order):
1. **BROKEN** - references to non-existent files/symbols
2. **OUTDATED** - gotchas for issues that were fixed
3. **DRIFT** - code changed but skill didn't follow
4. **MISSING** - new code areas without skill coverage
5. **QUALITY** - skill exists but is too generic or duplicated

### Presentation format:

First show the full summary:
```
/cs:sync — N proposals found

BROKEN (2):
  1. skill-name: path/to/file.php no longer exists
  2. skill-name: ClassName was renamed to NewClassName

DRIFT (1):
  3. skill-name: handler pattern changed from X to Y

MISSING (2):
  4. new-module: no skill covers src/payments/
  5. review: missing security dimension

Auto-apply BROKEN fixes? (a) | Review all one-by-one (r) | Skip (n)
```

### Batch logic:
- **BROKEN** — safe to auto-apply (just fixing references). Offer batch apply.
- **OUTDATED** — safe to auto-apply (removing stale content). Offer batch apply.
- **DRIFT, MISSING, QUALITY** — require judgment. Present one-by-one with context:

```
[3/5] DRIFT: skill-name
  → .claude/skills/skill-name/SKILL.md
  Handler pattern changed: was callback-based, now uses async/await.
  Skill still documents callback pattern.

  Apply (a) | Review code (r) | Skip (s)
```

### Rules:
- If user rejects, move to next without arguing
- Creating new skills MUST follow Anthropic standard (SKILL.md + frontmatter)
- Editing existing skills uses Edit tool (targeted changes, not full rewrites)
- Never delete a skill without user confirmation

## Step 4: Apply Changes

For each accepted proposal:
- Edit existing files with surgical changes (Edit tool)
- Create new skills with proper structure
- Remove obsolete content
- Update CLAUDE.md generated section if needed

## Step 5: Summary

After all proposals are processed:
```
Sync complete:
  Applied: X changes
  Skipped: Y proposals

  Skills: A created, B updated, C unchanged
  Docs: D updated
  CLAUDE.md: [updated/unchanged]
```
