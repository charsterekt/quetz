# Quetz — The Feathered Serpent Dev Loop

[![npm](https://img.shields.io/npm/v/@dkchar/quetz)](https://www.npmjs.com/package/@dkchar/quetz)

**Quetz** is a local npm package that wraps a supported agent CLI into a self-feeding development loop. It reads prioritized issues from an issue graph, spawns a fully autonomous agent for each one sequentially, monitors the resulting GitHub PR through to merge, and repeats until done.

> *Quetzalcoatl, the feathered serpent — a winged reptile that bridges earth and sky.*

```
████████████░                                                      
████░   ████░                               ████░                  
████░   ████░ ████░   ████░ ████████████░ ██████████░ ████████████░
████░   ████░ ████░   ████░ ████░   ████░   ████░           ████░  
████░   ████░ ████░   ████░ ████████████░   ████░         ████░    
████████████░ ████░   ████░ ████░           ████░       ████░      
████████████░ ████████████░ ████████████░   ████████░ ████████████░
    ████░                                                                                                              
```

> Quetz is _currently_ designed to work with **[Beads (`bd`)](https://github.com/steveyegge/beads)** — a local-first CLI issue tracker built around prioritized dependency graphs. Beads is the source of truth for what to work on next.

**Quetz is a wrapper.** It does not claim issues, run tests, commit code, or push branches. The spawned agent does all of that. Quetz manages lifecycle only: what issue to work on next, when to start, when to stop.

---

## Prerequisites

Quetz requires GitHub CLI, Beads CLI, and at least one supported agent CLI installed. Today the shared runtime path is implemented for Claude, with provider-neutral config and preflight groundwork in place for future adapters.

| Tool | Purpose | Check |
|---|---|---|
| **Claude Code** (`claude`) | Current runtime-backed agent provider | `claude --version` |
| **Codex CLI** (`codex`) | Detected during preflight for upcoming provider support | `codex --version` |
| **GitHub CLI** (`gh`) | PR detection, GitHub API | `gh auth status` |
| **Beads CLI** (`bd`) | Issue tracking | `bd --version` |

`quetz init` verifies GitHub, Beads, and the available agent providers before generating config.

---

## Installation

```bash
npm install -g @dkchar/quetz
```

Then verify the install:

```bash
quetz version
```

---

## Quick Start

```bash
quetz version     # Confirm installation
quetz init        # First-time setup (run once per project)
quetz run         # Start the loop
quetz run --simulate # Full visual test with actual agents and mock issues
quetz run --local-commits # The full Quetz loop but commit-only (no PRs)
quetz run --amend # The full Quetz loop but with a single rolling commit (no PRs)
```

`quetz init` generates `.quetzrc.yml`, runs preflight checks, and optionally scaffolds a GitHub Actions automerge workflow.

After init:
- Review `.quetzrc.yml` in your project root
- Create the `automerge` label on your GitHub repo
- Ensure your GitHub Actions workflow is in place

---

## Commands

### `quetz version`

Print the installed version. Use this to confirm installation.

```bash
quetz version
# quetz v0.1.0
```

### `quetz init`

First-time setup. Runs preflight checks, generates `.quetzrc.yml`, and optionally scaffolds `.github/workflows/quetz-automerge.yml`.

### `quetz run`

Start the dev loop. Runs until all issues are resolved or a failure occurs. Completed agent runs can be viewed through the TUI to track what was done.

<img width="2082" height="1277" alt="image" src="https://github.com/user-attachments/assets/a2da2281-e0d5-4090-b6b8-214a78e49fb4" /><br><br>


| Flag | Default | Description |
|---|---|---|
| `--provider <provider>` | config | Override agent provider (`claude`, `codex`) |
| `--model <model>` | `sonnet` | Override agent model (e.g. `haiku`, `sonnet`, `opus`) |
| `--effort <level>` | config | Override agent effort level (`low`, `medium`, `high`, `max`) |
| `--timeout <minutes>` | `30` | Kill agent if it runs longer than this |
| `--local-commits` | — | Skip PR lifecycle; verify local commits only |
| `--amend` | — | Accumulate all issue work into a single rolling commit (no PR) |
| `--simulate` | — | Full visual test: mock issues, real agent, simulated PR lifecycle |

`--local-commits` and `--amend` are mutually exclusive. Both skip GitHub API access entirely.

### `quetz status`

Show current loop state: issues ready, in progress, and completed.

### `quetz validate`

Validate `.quetzrc.yml` without running the loop. Exits 0 on success, 2 on config error.

### `quetz config show`

Display the parsed configuration, including applied defaults.

---

## The TUI

When `stdout` is a TTY, `quetz run` activates a full-screen terminal UI using an alternate screen buffer. Your existing terminal content is preserved and restored on exit.

The TUI is built on [Rezi](https://rezitui.dev) (`@rezi-ui/node`), a declarative terminal UI framework for Node.js. Rezi manages layout, input, scrolling, and rendering — Quetz drives it via a typed event bus that translates loop lifecycle events into state updates.

**Keyboard shortcuts:**

| Key | Action |
|---|---|
| `q` / Ctrl+C | Quit |
| `↑` / `↓` | Navigate completed sessions |
| `enter` | Open session detail view |
| `esc` | Return from session detail |

The TUI disables itself automatically when stdout is not a TTY (CI, piped output).

---

## Simulate Mode

`--simulate` runs an end-to-end visual test of the full loop without needing `bd` or GitHub:

- Uses built-in mock issues
- Skips git checkout/pull
- Spawns a real agent through the selected provider path
- Simulates PR detection (1.5s), merge (3s), and celebration
- Loops through all mock issues and shows the victory screen

```bash
quetz run --simulate                    # full visual test
quetz run --simulate --model haiku      # faster/cheaper agents
quetz run --simulate --timeout 2        # 2-min agent cap per issue
quetz run --simulate --local-commits    # simulate with commits (no PRs)
quetz run --simulate --amend            # simulate with amend commits
```

---

## Configuration

All configuration lives in `.quetzrc.yml` at your project root. Generated by `quetz init`.

```yaml
github:
  owner: "my-org"
  repo: "my-project"
  defaultBranch: "main"
  automergeLabel: "automerge"

agent:
  provider: "claude"
  timeout: 30               # minutes before killing the agent
  model: "sonnet"
  effort: "medium"         # low|medium|high|max
  providers:
    claude:
      settingSources: ["user", "project", "local"]
    codex: {}

poll:
  interval: 30              # seconds between merge-status checks
  mergeTimeout: 15          # minutes to wait for PR to merge
  prDetectionTimeout: 60    # seconds to find the PR after agent exits
```

Runtime overrides:

```bash
quetz run --provider claude --model haiku --effort low --timeout 60
```

### GitHub Actions for automerge

Quetz agents open PRs with the `automerge` label. A GitHub Action merges them once CI passes. `quetz init` can scaffold this file, or add it manually:

**.github/workflows/quetz-automerge.yml:**

```yaml
name: Auto-merge on checks pass

on:
  check_suite:
    types: [completed]
  pull_request_review:
    types: [submitted]
  status: {}

permissions:
  contents: write
  pull-requests: write

jobs:
  automerge:
    runs-on: ubuntu-latest
    if: >
      github.event.pull_request != null ||
      github.event.check_suite != null ||
      github.event.state != null
    steps:
      - uses: actions/checkout@v4
      - name: Auto-merge labelled PRs
        uses: pascalgn/automerge-action@v0.16.4
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          MERGE_LABELS: "automerge"
          MERGE_METHOD: "squash"
          MERGE_DELETE_BRANCH: "true"
          UPDATE_METHOD: "rebase"
```

---

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | All issues resolved, or clean exit (no issues ready) |
| `1` | Runtime failure — CI failed, timeout, missing PR, git error |
| `2` | Config error — missing or invalid `.quetzrc.yml` |
| `3` | Preflight failure — missing tool (`claude`, `gh`, `bd`) or auth not configured |

---
