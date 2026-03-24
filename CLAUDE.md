# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Quetz is a local npm package that wraps the Claude Code CLI into a self-feeding development loop. It reads prioritized issues from a Beads issue graph, spawns a fully autonomous Claude Code agent for each one, monitors the resulting GitHub PR through to merge, and repeats until done. See `spec.md` for the full product specification.

**Quetz is a wrapper.** It does not claim issues, run tests, commit code, or push branches. The spawned agent does all of that. Quetz manages lifecycle only: what issue to work on next, when to start, when to stop.

## Build & Dev Commands

```bash
npm install              # install dependencies
npm run build            # compile TypeScript to dist/
npm run dev              # build in watch mode
npm run clean            # remove dist/
npm test                 # run all tests (vitest)
npm run test:watch       # run tests in watch mode
npx vitest run src/test/config.test.ts   # run a single test file
npx quetz init           # first-time project setup
npx quetz run            # start the dev loop
npx quetz run --dry      # preview without executing
npx quetz run --simulate # mock issues + real agent + fake PR lifecycle
npx quetz status         # show loop progress
```

There is no eslint or prettier config — TypeScript strict mode is the linter.

## Issue Tracking

This project uses **bd (beads)** for all issue tracking. Do NOT use markdown TODOs or external trackers.

```bash
bd ready --json          # find available work
bd show <id> --json      # view issue details
bd update <id> --claim   # claim work
bd close <id>            # complete work
bd create "title" --description="..." -t feature -p 1 --json
```

See `agents.md` for the full agent workflow including mandatory push-before-done rules.

## Architecture

The core loop (spec section 2) is the entire product:

```
bd ready → git checkout+pull → assemble prompt → spawn claude → detect PR → poll for merge → repeat
```

Key modules in `src/`:

| Module | Responsibility |
|---|---|
| `cli.ts` | Entry point, command router, exit codes (0/1/2/3) |
| `config.ts` | `.quetzrc.yml` loader/writer/validator |
| `loop.ts` | Main run loop orchestration (~550 lines, the core of the product) |
| `agent.ts` | Spawns agent via `@anthropic-ai/claude-agent-sdk` with streaming output |
| `beads.ts` | Typed wrappers around `bd ready`, `bd show`, `bd prime`; mock mode support |
| `github.ts` | Octokit-based PR detection and merge polling |
| `prompt.ts` | Handlebars template assembly with issue/context variables |
| `git.ts` | `git checkout`, `git pull`, branch/remote helpers |
| `preflight.ts` | Checks for claude, gh, bd, git availability and auth |
| `init.ts` | `quetz init` — preflight, config gen, Actions scaffolding |
| `events.ts` | Typed event bus (QuetzBus) for loop→TUI communication |
| `mock-data.ts` | Built-in fake issues for `--mock`/`--simulate` modes |
| `verbose.ts` | Global verbose flag and `log(category, msg)` helper |
| `display/` | Terminal color palette (chalk), ANSI helpers |
| `ui/` | Ink React components for full-screen TUI (App, AgentPanel, QuetzPanel, StatusBar) |

## Key Design Constraints

- **No retries.** Every failure mode is: notify and exit. The user fixes and reruns.
- **Agent is a black box.** Quetz never parses agent output or sends signals. It spawns, waits for exit, then looks for the PR.
- **Sequential only.** One loop, one agent at a time. No parallelism in v0.1.
- **Minimal deps.** @octokit/rest, chalk, yaml, handlebars, ink (React TUI). No heavy frameworks.
- **Under 2000 lines of TypeScript** total for v0.1.0.
- **PR detection is loose.** Quetz doesn't dictate branch names — it discovers what the agent did by searching recent PRs that reference the issue ID.
- **Config lives in `.quetzrc.yml`** at project root. See spec section 3.1 for full schema.

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | All issues resolved or clean exit |
| 1 | Runtime failure (CI, timeout, missing PR, git error) |
| 2 | Config error (missing/invalid `.quetzrc.yml`) |
| 3 | Preflight failure (missing CLI tool or auth) |
