# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.1] - 2026-03-24

### Changed
- Exit messages now reflect the loop outcome instead of generic "Quetz stopped."
  - Victory: "The serpent rests — all issues resolved. 🐉"
  - No issues: "The serpent sleeps — no ready issues found."
  - Dry run: "The serpent scouts — dry run complete."
  - Error: "The serpent retreats (exit code 1 — runtime failure)."
  - SIGINT: "The serpent withdraws — interrupted by user."

### Removed
- Deleted dead `src/templates/quetz-automerge.yml` (was never loaded at runtime)

## [0.5.0] - 2026-03-24

### Added
- Core dev loop (`loop.ts`): reads prioritized issues from a Beads graph, spawns a Claude Code agent per issue, polls for PR merge, and repeats
- Full-screen Ink TUI with `AgentPanel`, `QuetzPanel`, `StatusBar`, `HistoryPanel`, and `SessionDetailPanel`
- Agent spawning via `@anthropic-ai/claude-agent-sdk` with streaming output (`agent.ts`)
- Typed wrappers around `bd ready`, `bd show`, `bd prime` with mock mode support (`beads.ts`)
- Octokit-based PR detection and merge polling (`github.ts`)
- Handlebars prompt template assembly (`prompt.ts`)
- `git checkout` / `git pull` / branch helpers (`git.ts`)
- Preflight checks for `claude`, `gh`, `bd`, `git` availability and auth (`preflight.ts`)
- `quetz init` command: preflight, `.quetzrc.yml` generation, GitHub Actions scaffolding (`init.ts`)
- `quetz run` and `quetz run --dry` / `--simulate` modes
- `quetz status` for loop progress
- Rate limiting and WebSocket support
- Typed event bus (`QuetzBus`) for loop→TUI communication (`events.ts`)
- Built-in fake issues for `--mock` / `--simulate` modes (`mock-data.ts`)
- Exit codes: 0 clean, 1 runtime failure, 2 config error, 3 preflight failure

[0.5.1]: https://github.com/dkchar/quetz/releases/tag/v0.5.1
[0.5.0]: https://github.com/dkchar/quetz/releases/tag/v0.5.0
