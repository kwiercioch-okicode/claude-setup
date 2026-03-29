# devflow

Claude Code plugin marketplace for SDLC automation and project configuration.

Two plugins in one marketplace:

- **devflow** - SDLC workflow: plan, execute, commit, review, PR, version, ship. With guardrail hooks and worktree management.
- **setup** - Generate and maintain `.claude/` configuration from codebase analysis.

## Installation

### Via Claude Code UI

1. Open Claude Code and run `/plugin`
2. Go to **Marketplaces** -> **Add marketplace** -> enter `kwiercioch-okicode/devflow`
3. Go to **Discover**, select the plugin you want, then **Install**

### Command line

```
/plugin marketplace add kwiercioch-okicode/devflow
/plugin install devflow@devflow
/plugin install setup@devflow
```

## devflow plugin

| Skill | Description |
|---|---|
| `/dev` | Worktree management (create, remove, up, down, status) |
| `/plan` | Generate structured implementation plan from any input |
| `/execute` | Wave-based plan execution with dependency tracking |
| `/commit` | Smart commit with style detection |
| `/review` | Multi-dimension code review with prepare scripts |
| `/pr` | Auto-generated PR description |
| `/version` | Semantic versioning + changelog |
| `/ship` | Thin orchestrator: commit -> review -> PR |
| `/test-first` | TDD workflow enforcement |
| `/doctor` | Guardrails health check |

### Guardrails

Deterministic hooks that enforce workflow rules without relying on LLM behavior:

- **Branch protection** - blocks commits/pushes to main/master
- **Worktree guard** - detects active worktrees, injects context
- **Review gate** - blocks PR creation without review verdict
- **Secret detection** - scans staged files for credentials

### Prepare Scripts

Every skill that touches git has a JS prepare script that pre-computes data and returns JSON. The LLM never parses raw git output - scripts do the dirty work. Zero npm dependencies.

## setup plugin

| Command | Description |
|---|---|
| `/cs:init` | Generate `.claude/` configuration from codebase |
| `/cs:sync` | Synchronize config with current codebase state |
| `/cs:doctor` | Diagnose `.claude/` configuration health |

## Design

See [design document](docs/plans/2026-03-29-devflow-plugin-design.md) for architecture decisions, skill details, and phased delivery plan.
