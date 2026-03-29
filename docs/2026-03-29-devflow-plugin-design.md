# devflow - Claude Code Plugin Design

**Data:** 2026-03-29
**Repo:** `kwiercioch-okicode/claude-setup` → rename `devflow`
**Inspiracja:** `rnagrodzki/sdlc-marketplace` (wzorce, nie fork)

## Decyzje

- Jeden marketplace (`devflow`), dwa pluginy: `devflow` (SDLC workflow) + `setup` (config generation)
- Plugin devflow: bez suffixów w komendach (`/review` nie `/review-sdlc`)
- Scope devflow: generyczne SDLC + dev environments (worktrees)
- Scope setup: generowanie i utrzymanie `.claude/` config z codebase (scanner, compositor, doctor)
- Domain-specific skille (fotigo-expert, selected-photos, backend-patterns etc.) zostają w `.claude/` projektu
- Prepare scripts: każdy skill ma JS prepare script, zero npm dependencies
- Ship: cienki orchestrator ~60 linii, verdict jako JSON plik
- Testy: claude skill evals (nie promptfoo)
- Guardrails: deterministyczne hooki + context injection + mandatory skill chain gates

## Struktura repo

```
devflow/                                  # marketplace repo
+-- .claude-plugin/
|   +-- marketplace.json                  # lists both plugins: devflow + setup
+-- plugins/
|   +-- devflow/                          # Plugin 1: SDLC workflow
|   |   +-- .claude-plugin/
|   |   |   +-- plugin.json              # name: "devflow"
|   |   +-- skills/
|   |   |   +-- dev/SKILL.md             # worktree management
|   |   |   +-- plan/SKILL.md            # structured plan z dowolnego inputu
|   |   |   +-- execute/SKILL.md         # wave dispatch, verify, structured logging
|   |   |   +-- commit/SKILL.md          # smart commit, style detection
|   |   |   +-- review/SKILL.md          # multi-dimension code review
|   |   |   +-- pr/SKILL.md              # auto PR description
|   |   |   +-- version/SKILL.md         # semver + changelog
|   |   |   +-- ship/SKILL.md            # cienki orchestrator
|   |   |   +-- test-first/SKILL.md      # TDD workflow
|   |   |   +-- doctor/SKILL.md          # guardrails health check
|   |   +-- agents/
|   |   |   +-- review-orchestrator.md
|   |   +-- hooks/
|   |   |   +-- hooks.json
|   |   +-- scripts/
|   |       +-- dev-env.sh               # worktree management
|   |       +-- plan-prepare.js
|   |       +-- execute-prepare.js
|   |       +-- commit-prepare.js
|   |       +-- review-prepare.js
|   |       +-- pr-prepare.js
|   |       +-- version-prepare.js
|   |       +-- ship-prepare.js
|   |       +-- doctor.js                # guardrails health check (zero LLM)
|   |       +-- lib/
|   |           +-- git.js               # shared git utilities, zero deps
|   |           +-- discovery.js         # project detection
|   +-- setup/                            # Plugin 2: Config generation (z claude-setup)
|       +-- .claude-plugin/
|       |   +-- plugin.json              # name: "setup"
|       +-- skills/
|       |   +-- scanner/SKILL.md         # deep codebase scanning (non-inferable info)
|       |   +-- compositor/SKILL.md      # combines scanner output -> .claude/ files
|       |   +-- doctor/SKILL.md          # .claude/ config health (drift, broken refs)
|       +-- commands/
|       |   +-- init.md                  # /cs:init - generate .claude/ from scratch
|       |   +-- sync.md                  # /cs:sync - sync config with codebase
|       |   +-- doctor.md               # /cs:doctor - diagnose config health
|       +-- scripts/
|       |   +-- detect-stack.js          # tech stack detection
|       +-- templates/
|           +-- CLAUDE.md.template
|           +-- review-prompts/          # review dimension templates
+-- tests/
|   +-- evals/                           # claude skill evals
+-- docs/
+-- README.md
```

## Skille

### /dev - Worktree Management

Przeniesiony z `kwiercioch-okicode/dev-env-claude-plugin`. Shell-based (`dev-env.sh`).

Komendy: `create <branch>`, `remove <name>`, `up <name>`, `down <name>`, `status <name>`, `list`.

Czyta `.dev-env.yml` z project root. Multi-repo aware (tworzy worktree w każdym repo).

### /plan - Structured Plan Generation

Generuje implementation plan z dowolnego inputu:
- Opis tekstowy w conversation
- Ticket URL (Jira - jeśli CLI dostępne)
- OpenSpec change path
- Plik markdown

Prepare script (`plan-prepare.js`) wykrywa source type i pre-fetchuje dane.

Output: structured plan z task groups, dependencies, wave structure - kompatybilny z `/execute`.

### /execute - Plan Execution

Lean skill - zapewnia prawidłowy dispatch:
- Parsuje plan → dependency graph → waves
- Dispatch agentów z precyzyjnymi promptami + context z poprzednich waves
- Verify po wave (czy pliki istnieją, czy testy przechodzą)
- Structured progress output

Nie reimplementuje: state persistence (Claude Code `--resume`), checkpoint management.

### /commit - Smart Commit

Prepare script (`commit-prepare.js`) pre-computuje:
- Staged files list
- Recent commit messages (style detection)
- Diff summary
- Multi-repo detection

LLM generuje commit message w stylu projektu. `--auto` skipuje approval.

### /review - Multi-dimension Code Review

Prepare script (`review-prepare.js`) pre-computuje:
- Changed files z diff hunks
- Dimension discovery z `.claude/review-dimensions/` lub `.claude/skills/review/prompts/`
- File → dimension mapping

Review orchestrator agent dispatches dimension subagentów równolegle.

Verdict zapisywany do `.devflow/review-verdict.json`:
```json
{
  "verdict": "CHANGES_REQUESTED",
  "critical": 1,
  "high": 2,
  "medium": 3,
  "findings": [...]
}
```

### /pr - Auto PR Description

Prepare script (`pr-prepare.js`) pre-computuje:
- Commits structured
- Diff stat
- Remote state
- PR template discovery z `.claude/pr-template.md`

LLM generuje PR title + body. `--auto` skipuje approval, `--draft` tworzy draft PR.

### /version - Semver + Changelog

Prepare script (`version-prepare.js`) pre-computuje:
- Current version (git tags)
- Commits since last tag
- Changelog draft
- Multi-repo detection (tag oba repos)

`--bump patch|minor|major` lub auto-detect z conventional commits.

### /ship - Thin Orchestrator

Max ~60 linii SKILL.md. Sekwencyjnie woła:

```
ship-prepare.js → JSON z pipeline steps
Wyświetl tabelę
Jeśli --dry-run → stop
Jeśli nie --auto → potwierdź z userem
Skill("commit")   → jeśli dirty files
Skill("review")   → jeśli nie skipped
Skill("pr")       → jeśli nie skipped
```

Flagii: `--skip step1,step2`, `--auto`, `--dry-run`.

Review gate: czyta `.devflow/review-verdict.json`. Jeśli critical > 0 lub high > 0 → pipeline stop.

Czego NIE robi (vs sdlc-marketplace):
- Brak presetów A/B/C
- Brak config file
- Brak fix loop (robisz ręcznie)
- Brak state persistence (Claude Code `--resume`)

### /test-first - TDD Workflow

Przeniesiony z obecnego `.claude/skills/test-first/`. Universal - działa w każdym projekcie.

Wymusza: failing test → production code → verify green.

## Guardrails

### Deterministyczne (hooks)

| Hook | Event | Akcja |
|---|---|---|
| Branch protection | `PreToolUse:Bash` (git commit/push) | Blokuje na main/master |
| Secret detection | `PreToolUse:Bash` (git add/commit) | Skanuje na .env, credentials, tokens |
| Worktree guard | `SessionStart` | Wykrywa aktywne worktree, wymusza `.worktrees/` |
| PR review gate | `PreToolUse:Bash` (gh pr create) | Blokuje jeśli `.devflow/review-verdict.json` nie istnieje lub ma critical/high |
| PR size warning | `PreToolUse:Bash` (gh pr create) | Warning gdy diff > N linii |

### Context injection (hook → LLM info)

| Hook | Event | Inject |
|---|---|---|
| Test-first reminder | `PreToolUse:Edit/Write` na prod files | "WARNING: no failing test in context" |
| OpenSpec check | `UserPromptSubmit` | "Behavioral change detected - check openspec/" |

### Mandatory skill chain (niedeterministyczne gate)

- `/ship` wymaga `.devflow/review-verdict.json` (tworzone przez `/review`)
- Hook na `gh pr create` sprawdza verdict file deterministycznie
- Verdict file to bridge: niedeterministyczny review → deterministyczny hook gate

## Prepare Scripts - Pattern

Każdy prepare script:

```
Input:  CLI flags + git state
Output: JSON na stdout
Error:  stderr + exit code > 0
```

LLM nigdy nie parsuje raw git output. Script robi dirty work.

`lib/git.js` - zero dependencies, Node built-ins only:
- `exec()` - wrapper na execSync, null on failure
- `checkGitState()` - branch, dirty files
- `detectBaseBranch()` - origin/HEAD fallback
- `getChangedFiles()` - staged/unstaged/committed
- `getCommitLog()` - structured commits
- `getDiffContent()` - diff per file

`lib/discovery.js` - project detection:
- `discoverReviewDimensions()` - szuka `.claude/review-dimensions/` i `.claude/skills/review/prompts/`
- `discoverMultiRepo()` - wykrywa repos obok siebie
- `discoverWorktree()` - aktywny worktree context
- `discoverOpenSpec()` - openspec/ dir

## Podział: Plugin vs .claude/ projektu

### → devflow plugin (generyczne SDLC)

review, commit, pr, version, ship, plan, execute, dev, test-first, doctor, guardrail hooks

### -> setup plugin (config generation - z claude-setup)

scanner, compositor, cs:doctor, cs:init, cs:sync, detect-stack, templates

### → .claude/ projektu (domain-specific)

architecture, backend-patterns, data-flow, database-schema, debugging, e2e-test-patterns, error-handling, fotigo-expert, frontend-design, functional-tests, google-slides, naming, openspec-review, performance, polish-blog-writer, react-components, remotion-promo-video, security, selected-photos, skill-eval, sync-tools, tests-review, ticket-runner, tutorial-video, ui-ux, website-builder, autoskill

Review dimensions (architecture, security, naming etc.) zostają w `.claude/` - plugin `/review` je odkrywa automatycznie przez `discovery.js`.

## /doctor - Guardrails Health Check

Deterministyczny skill (zero LLM) - czysty JS prepare script (`doctor.js`).

Sprawdza czy guardrails w projekcie działają poprawnie:

```
/doctor

Hooks:
  [pass] hooks/hooks.json loaded (5 hooks active)
  [pass] branch-protection: blocks git push to main/master
  [pass] secret-detection: blocks staged .env/credentials
  [pass] worktree-guard: active worktrees detected, injection working
  [pass] review-gate: .devflow/review-verdict.json check wired to gh pr create
  [warn] test-first reminder: hook active but no test runner configured
  [fail] PR size warning: threshold not set (default: 500 lines)

Discovery:
  [pass] multi-repo: api-fotigo + fotigo
  [pass] worktree dir: .worktrees/
  [pass] .dev-env.yml found
  [pass] review dimensions: 10 found in .claude/skills/review/prompts/
  [pass] OpenSpec: openspec/ detected

Verdict files:
  [info] .devflow/review-verdict.json: not present (no review run yet)
```

Co robi `doctor.js`:
1. Sprawdza czy hooki są zainstalowane i odpowiadają
2. Dry-run testuje każdy hook (symuluje blocked event)
3. Sprawdza discovery (dimensions, multi-repo, worktrees)
4. Sprawdza verdict files i state
5. Raportuje gaps z actionable suggestions

## Phased Delivery

| Faza | Co | Wartość |
|---|---|---|
| 1 | Scaffolding: repo rename, marketplace.json (2 plugins), manifests, `lib/git.js`, `lib/discovery.js`, migracja setup plugin z claude-setup | Struktura obu pluginów działa |
| 2 | `/dev` (migracja dev-env.sh) + hooks (branch protection, worktree guard) | Worktree management + first guardrails |
| 3 | `/commit` + commit-prepare.js | Pierwszy SDLC skill z prepare script |
| 4 | `/review` + review-prepare.js + orchestrator agent + verdict JSON | Review z dimension discovery |
| 5 | `/pr` + pr-prepare.js + PR review gate hook | Auto PR + mandatory review gate |
| 6 | `/plan` + plan-prepare.js | Structured planning |
| 7 | `/execute` + execute-prepare.js | Wave dispatch |
| 8 | `/ship` + ship-prepare.js | Pipeline chain |
| 9 | `/version`, `/test-first`, `/doctor` | Kompletne portfolio + health check |
| 10 | Evals + migracja skilli z Fotigo `.claude/` | Quality gate + cleanup |

Każda faza to osobny PR, testowalny niezależnie.
