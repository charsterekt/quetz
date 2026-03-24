# Quetz — The Feathered Serpent Dev Loop

**Quetz** is a local npm package that wraps the Claude Code CLI into a self-feeding development loop. It reads prioritized issues from a Beads issue graph, spawns a fully autonomous Claude Code agent for each one, monitors the resulting GitHub PR through to merge, and repeats until done.

> *Quetzalcoatl, the feathered serpent — a winged reptile that bridges earth and sky.*

**Quetz is a wrapper.** It does not claim issues, run tests, commit code, or push branches. The spawned agent does all of that. Quetz manages lifecycle only: what issue to work on next, when to start, when to stop.

---

## Table of Contents

- [What Quetz Does](#what-quetz-does)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [The TUI](#the-tui)
- [Commands](#commands)
- [How the Loop Works](#how-the-loop-works)
- [Configuration](#configuration)
- [Exit Codes](#exit-codes)
- [Architecture](#architecture)

---

## What Quetz Does

1. **Picks an issue** from your Beads issue graph (in priority order)
2. **Spawns a Claude Code agent** with a context-rich prompt
3. **Watches the agent work** inside a full-screen TUI
4. **Detects the PR** the agent creates on GitHub
5. **Waits for merge**, then loops back to step 1

The agent does all the real work: implementing features, running tests, committing code, pushing branches, and opening PRs.

**Key principle:** If something goes wrong, Quetz notifies you and exits cleanly. No retries. You review, fix, and rerun.

---

## Prerequisites

Quetz requires three CLI tools installed and authenticated:

| Tool | Purpose | Check |
|---|---|---|
| **Claude Code** (`claude`) | The agent that does the work | `claude --version` |
| **GitHub CLI** (`gh`) | PR detection, GitHub API | `gh auth status` |
| **Beads CLI** (`bd`) | Issue tracking | `bd --version` |

`quetz init` verifies all three before generating config.

---

## Installation

Quetz is currently a **local development tool** — not yet published to npm. Install it into a project via `npm link` or reference it directly:

```bash
# Clone and link globally
git clone <this-repo>
cd quetz
npm install
npm run build
npm link

# Then in your target project:
quetz init
```

Or invoke directly without linking:

```bash
node /path/to/quetz/dist/cli.js init
```

Once linked, use `quetz <command>` in any project directory.

---

## Quick Start

```bash
# 1. First-time setup (run once per project)
quetz init

# 2. Start the loop
quetz run

# 3. Preview without executing
quetz run --dry
```

`quetz init` generates `.quetzrc.yml`, runs preflight checks, and optionally scaffolds a GitHub Actions automerge workflow.

**After init:**
- Review `.quetzrc.yml` in your project root
- Create the `automerge` label on your GitHub repo
- Ensure your GitHub Actions workflow is in place (see [Automerge](#github-actions-for-automerge))

---

## The TUI

When `stdout` is a TTY and you're not in `--dry` mode, `quetz run` automatically activates a **full-screen terminal UI** using an alternate screen buffer. Your existing terminal content is preserved and restored on exit.

### Layout

```
╭──────────────────────────────────────────────────────────────────────────────╮
│ ▐ QUETZ ▌  quetz-abc  · "Fix the thing"          ◈ AGENT   Issue 3/12  ⏱ 2m │
╰──────────────────────────────────────────────────────────────────────────────╯

  [scrollable agent output fills this region]

──────────────────────────────────────────────────────────────────────────────
 [quetz]  quetz-abc  │  Agent running…                                    2m14s
```

- **Header** (3 lines): issue ID, title, phase badge, iteration counter, elapsed time
- **Content region**: scrollable area where agent output streams in real time
- **Footer** (2 lines): separator + sticky status line with phase and elapsed

### Phases

| Phase badge | Meaning |
|---|---|
| `◦ START` | Startup / between issues |
| `◈ AGENT` | Agent is running |
| `◈ POLLING` | Searching for PR or waiting for merge |
| `◈ COMMIT` | Verifying commits |
| `✓ MERGED` | PR merged, celebration |
| `✓ DONE` | All issues resolved |

### Disabling the TUI

```bash
quetz run --no-animate    # Plain scrolling output, no alternate screen
```

The TUI also disables itself automatically when stdout is not a TTY (e.g. in CI or when piped).

---

## Commands

### `quetz init`

First-time setup. Runs preflight checks, generates `.quetzrc.yml` from your `git remote`, and optionally scaffolds `.github/workflows/quetz-automerge.yml`.

### `quetz run`

Start the dev loop. Runs until all issues are resolved or a failure occurs.

| Flag | Default | Description |
|---|---|---|
| `--dry` | — | Preview mode: list issues, print first prompt, exit without spawning |
| `--model <model>` | `sonnet` | Override agent model (e.g. `haiku`, `sonnet`, `opus`) |
| `--thinking-level <level>` | config | Override Claude effort level (`low`, `medium`, `high`, `max`) |
| `--timeout <minutes>` | `30` | Kill agent if it runs longer than this |
| `--local-commits` | — | Skip PR lifecycle; verify local commits only |
| `--amend` | — | Accumulate all issue work into a single rolling commit (no PR) |
| `--mock` | — | Use built-in fake issues instead of calling `bd` |
| `--simulate` | — | Full visual test run: mock issues, real agent, simulated PR lifecycle |

`--local-commits` and `--amend` are mutually exclusive. Both skip GitHub API access entirely.

### `quetz validate`

Validate `.quetzrc.yml` without running the loop. Exits 0 on success, 2 on config error.

### `quetz config show`

Display the parsed configuration, including applied defaults.

### `quetz status`

Show current loop state: issues ready, in progress, and completed.

```bash
quetz status           # Snapshot
quetz status --watch   # Refresh every 5 seconds
quetz status -w        # Same
quetz status --mock    # Use fake issues (no bd required)
```

### `quetz help`

```bash
quetz help
quetz --help
quetz -h
```

### `quetz --version`

```bash
quetz --version
quetz -v
```

---

## How the Loop Works

```
bd ready → git checkout+pull → assemble prompt → spawn claude
       → detect PR → poll for merge → repeat
```

### Issue selection

Quetz calls `bd ready --json` and takes the first unblocked, highest-priority issue. Beads owns the priority graph; Quetz trusts it.

### Agent spawning

The agent runs via the `@anthropic-ai/claude-agent-sdk`, which streams `SDKMessage` events back to Quetz in real time. These events (tool starts, tool completions, text output) are forwarded through a typed event bus (`QuetzBus`) to the Ink TUI — you see everything the agent does in the TUI's agent panel. Quetz displays agent activity but does not make control-flow decisions based on it. It spawns, waits for completion, then looks for the PR.

If the agent runs past `agent.timeout` minutes, Quetz kills it and exits with code 1.

### PR detection

After the agent exits, Quetz searches recent GitHub PRs for one that references the issue ID (in title, body, or branch name). This is **intentionally loose** — Quetz doesn't dictate branch naming conventions. The agent opens whatever PR it wants; Quetz finds it.

If no PR is found within `poll.prDetectionTimeout` seconds, Quetz exits with code 1.

### Merge polling

Quetz polls the PR state every `poll.interval` seconds. When it merges, Quetz celebrates and loops back to issue selection. If the PR doesn't merge within `poll.mergeTimeout` minutes, Quetz exits with code 1.

### `--local-commits` mode

Skips PR detection and merge polling entirely. After the agent exits, Quetz verifies that new commits exist on the current branch, then moves on. No GitHub API access required.

### `--amend` mode

Accumulates all issue work into a single rolling commit. The first issue creates a new commit; subsequent issues amend onto it. Useful for bundling multiple small issues into one atomic change. No GitHub API access required.

### `--simulate` mode

End-to-end visual test of the full Quetz loop without needing `bd` or GitHub:

- Uses built-in mock issues (implies `--mock`)
- Skips git checkout/pull
- Spawns a real Claude agent for each mock issue
- After the agent finishes, simulates PR detection (1.5s), merge polling (3s), and celebration
- Loops through all mock issues and shows the victory screen

This lets you see every TUI phase — pickup, agent streaming, PR found, merge, celebration — without touching real infrastructure.

```bash
quetz run --simulate                    # full visual test
quetz run --simulate --model haiku      # faster/cheaper agents
quetz run --simulate --timeout 2        # 2-min agent cap per issue
quetz run --simulate --no-animate       # skip serpent animation
```

---

## Configuration

All configuration lives in `.quetzrc.yml` at your project root. Generated by `quetz init`.

### Schema

```yaml
# .quetzrc.yml

github:
  owner: "my-org"           # GitHub owner or org (required)
  repo: "my-project"        # Repository name (required)
  defaultBranch: "main"     # Branch to checkout between iterations (default: main)
  automergeLabel: "automerge"  # PR label that triggers auto-merge (default: automerge)

agent:
  timeout: 30               # Minutes before killing the agent (default: 30)
  model: "sonnet"           # Claude model to use (default: sonnet)
  thinkingLevel: "medium"   # Optional Claude effort level: low|medium|high|max
  prompt: |                 # Optional: override the default prompt template
    {{bdPrime}}
    ... custom instructions ...

poll:
  interval: 30              # Seconds between merge-status checks (default: 30)
  mergeTimeout: 15          # Minutes to wait for PR to merge (default: 15)
  prDetectionTimeout: 60    # Seconds to find the PR after agent exits (default: 60)

display:
  animations: true          # Enable TUI and animations (default: true)
  colors: true              # Enable colors (default: auto-detected from TTY)
```

### Runtime overrides

Command-line flags override config values for a single run:

```bash
quetz run --model haiku --thinking-level low --timeout 60 --no-animate
```

### GitHub Actions for automerge

Quetz agents open PRs with the `automerge` label. A GitHub Action merges them once CI passes.

`quetz init` can scaffold this file, or add it manually:

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

Create the `automerge` label on your GitHub repo before running the loop.

---

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | All issues resolved, or clean exit (no issues ready) |
| `1` | Runtime failure — CI failed, timeout, missing PR, git error |
| `2` | Config error — missing or invalid `.quetzrc.yml` |
| `3` | Preflight failure — missing tool (`claude`, `gh`, `bd`) or auth not configured |

---

## Architecture

### Project structure

```
src/
├── cli.ts              Entry point, command router, help text
├── config.ts           .quetzrc.yml loader/validator/defaults
├── init.ts             quetz init — preflight, config gen, Actions scaffold
├── loop.ts             Main run loop orchestration (~600 lines)
├── agent.ts            Spawns agent via @anthropic-ai/claude-agent-sdk with streaming
├── beads.ts            Typed wrappers around bd ready/show/prime + mock mode
├── mock-data.ts        Built-in fake issues for --mock and --simulate
├── events.ts           Typed event bus (QuetzBus) for loop→TUI communication
├── github.ts           Octokit-based PR detection and merge polling
├── prompt.ts           Handlebars template assembly
├── git.ts              git checkout and git pull only
├── preflight.ts        CLI availability and auth checks
├── verbose.ts          Global verbose flag, log() helper (stderr output)
├── display/
│   ├── terminal.ts     ANSI color helpers wrapping chalk
│   └── quetz.ts        ANSI art logo, printLogo() startup banner
├── ui/
│   ├── App.tsx         Main TUI root — layout, panels, keyboard navigation
│   ├── AgentPanel.tsx  Live agent output with scrolling + tool icons
│   ├── QuetzPanel.tsx  Loop event log (pickup, phase, merge, etc.)
│   ├── StatusBar.tsx   Header — phase, issue, iteration, mode, elapsed
│   ├── HistoryPanel.tsx  Completed session list with outcome badges
│   ├── SessionDetailPanel.tsx  Session transcript viewer
│   ├── Logo.tsx        Branded logo component
│   ├── hooks.ts        React hooks (useProgress, usePhase, etc.)
│   ├── theme.ts        Color constants, phase icons, tool styles
│   ├── viewport.ts     Terminal size detection + resize hook
│   ├── session-history.ts  Session state machine (active/completed tracking)
│   └── ink-imports.ts  ESM bridge for Ink (CJS compatibility)
└── templates/
    └── quetz-automerge.yml   GitHub Actions template (copied by quetz init)
```

### Dependencies

| Package | Used for |
|---|---|
| `@anthropic-ai/claude-agent-sdk` | Agent spawning and streaming via SDK |
| `@octokit/rest` | GitHub API — PR detection, merge polling |
| `chalk` | Terminal colors (via `display/terminal.ts` named helpers) |
| `handlebars` | Prompt template rendering |
| `ink` | React-based terminal UI (full-screen TUI) |
| `react` | Component model for Ink TUI |
| `yaml` | Parse and write `.quetzrc.yml` |

### Key design constraints

- **No retries.** Every failure mode: notify and exit. The user fixes and reruns.
- **Agent is autonomous.** Quetz displays agent activity in real time but makes no control-flow decisions based on agent output.
- **Sequential only.** One loop, one agent at a time. No parallelism in v0.1.
- **PR detection is loose.** Discover what the agent did; don't dictate branch names.
- **Under 2000 lines of TypeScript** total for v0.1.0.

---

See [spec.md](spec.md) for full design rationale and edge case decisions.
