# Quetz — The Feathered Serpent Dev Loop

**Quetz** is a local npm package that wraps the Claude Code CLI into a self-feeding development loop. It reads prioritized issues from a Beads issue graph, spawns a fully autonomous Claude Code agent for each one, monitors the resulting GitHub PR through to merge, and repeats until done. This is very much a tool for a one-dev workflow. Auto-merging PRs per Beads issues allows for isolation of changes and rollbacks, but does not wait for or consider approvals.

> *Quetzalcoatl, the feathered serpent — a winged reptile that bridges earth and sky.*

## Table of Contents

- [Quetz — The Feathered Serpent Dev Loop](#quetz--the-feathered-serpent-dev-loop)
  - [Table of Contents](#table-of-contents)
  - [What Quetz Does](#what-quetz-does)
  - [Prerequisites](#prerequisites)
    - [Claude Code CLI](#claude-code-cli)
    - [GitHub CLI (`gh`)](#github-cli-gh)
    - [Beads CLI (`bd`)](#beads-cli-bd)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
    - [Setup](#setup)
    - [Run](#run)
  - [Usage](#usage)
    - [Commands](#commands)
    - [Dry Run](#dry-run)
  - [How the Loop Works](#how-the-loop-works)
    - [Issue Selection](#issue-selection)
    - [Agent Spawning](#agent-spawning)
    - [PR Detection](#pr-detection)
    - [Merge Polling](#merge-polling)
  - [Configuration](#configuration)
    - [Config Schema](#config-schema)
    - [Example Config](#example-config)
    - [GitHub Actions for Auto-Merge](#github-actions-for-auto-merge)
  - [Exit Codes](#exit-codes)
  - [Architecture](#architecture)
    - [Project Structure](#project-structure)
    - [Dependencies](#dependencies)
    - [Key Design Constraints](#key-design-constraints)
  - [License](#license)

---

## What Quetz Does

Quetz is **a wrapper.** It manages the lifecycle of autonomous agent sessions:

1. **Picks an issue** from your Beads issue graph (in priority order)
2. **Spawns a Claude Code agent** with full context
3. **Watches the agent work** in real time (you see everything it does)
4. **Detects the PR** it creates on GitHub
5. **Waits for merge**, then repeats

The agent does all the real work: implementing features, running tests, committing code, pushing branches, and opening PRs. Quetz orchestrates the flow and handles the handoff between sessions.

**Key principle:** If something goes wrong, Quetz notifies you and exits cleanly. No retries, no auto-fixes. You review, fix, and run again.

---

## Prerequisites

Quetz requires three CLI tools to be installed and authenticated:

### Claude Code CLI
The agent itself. Install from https://docs.claude.com

```bash
claude --version
```

### GitHub CLI (`gh`)
For PR detection and GitHub API access. Install from https://cli.github.com

```bash
gh auth status
```

### Beads CLI (`bd`)
For issue tracking and workflow primitives. Install from https://github.com/steveyegge/beads

```bash
bd --version
```

Quetz verifies all three are installed and authenticated during `quetz init`.

---

## Installation

### Local (Recommended)
Install Quetz as a local npm dependency in your project:

```bash
npm install quetz
npm run build  # (if you modified source)
npx quetz init
```

After installation, use with `npx quetz <command>` or add to your `package.json` scripts:

```json
{
  "scripts": {
    "quetz": "quetz",
    "quetz:run": "quetz run",
    "quetz:status": "quetz status"
  }
}
```

Then use: `npm run quetz:run`

### Global
For system-wide access:

```bash
npm install -g quetz
quetz init
```

Then use `quetz <command>` anywhere. To uninstall: `npm uninstall -g quetz`

### Setup

Both methods require first-time setup:

```bash
quetz init  # or `npx quetz init` if installed locally
```

This generates `.quetzrc.yml` in your project root, runs preflight checks (claude, gh, bd), and optionally scaffolds a GitHub Actions automerge workflow.

---

## Quick Start

### Setup

```bash
# First time only
npx quetz init
```

You'll be prompted to:
- Confirm GitHub owner/repo (inferred from `git remote`)
- Confirm default branch (inferred from GitHub)
- Set automerge label (defaults to `"automerge"`)
- Optionally scaffold GitHub Actions for auto-merge

**After setup:**
- Review `.quetzrc.yml` in your project root
- Create the `automerge` label on your GitHub repo: https://github.com/{owner}/{repo}/labels
- If you didn't scaffold Actions, add `.github/workflows/quetz-automerge.yml` manually (see [Configuration](#configuration))

### Run

```bash
# Start the loop
npx quetz run

# Preview without executing (dry run)
npx quetz run --dry

# Check loop status
npx quetz status
```

Watch the agents work. Quetz prints colorful status messages between agent sessions. When all issues are resolved, you'll see a victory screen.

**Example output:**

```
 ╔══════════════════════════════════════════╗
 ║   QUETZ — The Feathered Serpent Loop     ║
 ║                                          ║
 ║   init     Setup config & checks         ║
 ║   run      Start the dev loop            ║
 ║   run --dry  Preview without executing   ║
 ║   status   Show loop progress            ║
 ║   help     Show all commands             ║
 ╚══════════════════════════════════════════╝

🐉 Picking up quetz-ko5: "Add clear README.md for npm publishing" [P1 feature]
   ──── Summoning agent ────

[Agent output — you see everything the agent does]

   ──── Agent session complete ────
🔍 Searching for PR...
✓  Found PR #42: "feat: add README (quetz-ko5)"
   Watching for merge...

✅ PR #42 merged! The serpent devours quetz-ko5.
   ─────────────────────────────────────────
   Issues remaining: 6
   ─────────────────────────────────────────
```

---

## Usage

### Commands

```bash
quetz init              First-time setup. Generates .quetzrc.yml, runs preflight
                        checks, and optionally scaffolds GitHub Actions.

quetz run               Start the dev loop. Runs until all issues are resolved
                        or a failure occurs.

quetz validate          Validate .quetzrc.yml without running the loop. Useful for
                        testing config before a full run.

quetz config show       Display the parsed configuration. Shows how quetz interprets
                        your .quetzrc.yml (includes defaults).

quetz status            Show current loop state: issues remaining, in progress,
                        and completed count.

quetz help, -h, --help  Show all commands with descriptions.

quetz --version, -v     Show installed quetz version.
```

### Flags for `quetz run`

```bash
quetz run --dry               Preview mode: list issues, print first prompt, exit
                              without spawning agent.

quetz run --model <model>     Override agent model (haiku or sonnet).
                              Default: sonnet. Example: quetz run --model haiku

quetz run --timeout <minutes> Override agent timeout in minutes.
                              Default: 30. Example: quetz run --timeout 60

quetz run --verbose           Enable debug logging (currently parses flag; debug
                              output implementation in progress).

quetz run --no-animate        Disable terminal animations (serpent, spinner).
```

### Dry Run

Use `quetz run --dry` to preview what Quetz will do without executing anything:

```bash
npx quetz run --dry
```

This prints:
1. Number of ready issues
2. The order Quetz will process them (by priority)
3. The full prompt for the first issue
4. Then exits

Useful for testing your configuration and prompts before committing a full run.

---

## How the Loop Works

Quetz's core loop orchestrates agent sessions, GitHub PR detection, and merge polling:

```
┌─────────────────────────────────────────┐
│       QUETZ RUN LOOP                    │
│                                         │
│  1. bd ready --json                     │  Get next issue (if none → DONE)
│  2. git checkout <default-branch>       │  Reset to clean state
│     git pull origin <default-branch>    │
│  3. Assemble prompt (issue + context)   │
│  4. Spawn: claude -p <prompt> ...       │  Agent runs in real time
│  5. Detect PR on GitHub                 │  Search recent PRs for issue ID
│  6. Poll for merge                      │  Check PR status every 30s
│     └─ if merged → go to step 1         │
│     └─ if failed → NOTIFY + EXIT        │
│     └─ if timeout → NOTIFY + EXIT       │
│                                         │
└─────────────────────────────────────────┘
```

### Issue Selection

Quetz calls `bd ready --json` to get the next unblocked, highest-priority issue. It takes the **first** issue without filtering or re-sorting. Beads owns the priority graph; Quetz trusts it.

### Agent Spawning

The agent runs with `stdio: 'inherit'`, meaning you see every keystroke, every file edit, every test output. Quetz gets out of the way and lets the agent work.

**Timeout:** Default 30 minutes. If the agent hangs, Quetz kills it, prints a timeout message, and exits.

### PR Detection

After the agent exits, Quetz searches for a newly created PR that references the issue ID. It looks at the PR title, body, and branch name. This is intentionally loose — Quetz doesn't dictate branch naming.

### Merge Polling

Quetz polls the PR every 30 seconds (configurable). When it merges, Quetz confirms and loops back to issue selection.

**Merge timeout:** Default 15 minutes from agent exit. If the PR doesn't merge within this window, Quetz exits with an error.

---

## Configuration

All configuration lives in `.quetzrc.yml` at your project root. Generated by `quetz init`.

### Config Schema

```yaml
# .quetzrc.yml

# GitHub settings
github:
  owner: "dk"                          # repo owner / org
  repo: "aegis"                        # repo name
  defaultBranch: "main"                # branch to pull between iterations
  automergeLabel: "automerge"          # label that triggers auto-merge action

# Agent settings
agent:
  timeout: 30                          # minutes — kill agent if it runs longer
  model: "sonnet"                      # claude model: sonnet or haiku (default: sonnet)
  prompt: |                            # override default prompt template (optional)
    {{bdPrime}}
    ...custom prompt...

# Polling settings
poll:
  interval: 30                         # seconds between merge status checks
  mergeTimeout: 15                     # minutes — give up waiting for merge
  prDetectionTimeout: 60               # seconds — give up finding the PR

# Display settings (optional)
display:
  animations: true                     # enable/disable terminal animations
  colors: true                         # enable/disable colors (auto-detected)
```

### Example Config

A typical `.quetzrc.yml`:

```yaml
github:
  owner: "my-org"
  repo: "my-project"
  defaultBranch: "main"
  automergeLabel: "automerge"

agent:
  timeout: 30
  model: "sonnet"                # Use sonnet for all issues (default)
  # prompt: |                    # Optional: override default prompt
  #   Custom prompt here...

poll:
  interval: 30
  mergeTimeout: 15
  prDetectionTimeout: 60

display:
  animations: true
  colors: true
```

**To override at runtime:**

```bash
quetz run --model haiku            # Use haiku instead of sonnet for this run
quetz run --timeout 60             # Give agents 60 minutes instead of 30
quetz run --model haiku --timeout 60 --dry  # Combine flags
```

### GitHub Actions for Auto-Merge

Quetz agents open PRs with the `automerge` label. You need a GitHub Action to merge them when CI passes.

Use the template Quetz provides (`quetz init` scaffolds this), or add it manually:

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
          MERGE_LABELS: "automerge"     # matches github.automergeLabel
          MERGE_METHOD: "squash"
          MERGE_DELETE_BRANCH: "true"
          UPDATE_METHOD: "rebase"
```

**Important:** Don't forget to create the `automerge` label on your GitHub repo:
https://github.com/{owner}/{repo}/labels

---

## Exit Codes

| Code | Meaning |
|---|---|
| **0** | All issues resolved (victory) or clean exit (no issues found) |
| **1** | Runtime failure — CI failed, timeout, missing PR, git error, network error |
| **2** | Config error — missing or invalid `.quetzrc.yml` |
| **3** | Preflight failure — missing CLI tool (`claude`, `gh`, `bd`) or auth not configured |

Check the error message in your terminal for details on what went wrong.

---

## Architecture

### Project Structure

Quetz is a thin orchestration layer. All work happens in spawned agents; Quetz just manages the flow.

```
src/
├── cli.ts              Entry point, command router, exit codes
├── config.ts           .quetzrc.yml loader/validator
├── init.ts             quetz init — preflight, config generation, Actions
├── loop.ts             Main run loop — orchestrates everything
├── agent.ts            Claude Code process spawning + lifecycle
├── beads.ts            bd CLI wrapper (ready, show, prime)
├── github.ts           GitHub API — PR detection, merge polling
├── prompt.ts           Prompt template assembly
├── git.ts              git operations (checkout, pull)
├── preflight.ts        CLI availability checks
├── display/
│   ├── banner.ts       ASCII art, startup animation
│   ├── spinner.ts      Animated spinner for polling
│   ├── messages.ts     User-facing strings
│   ├── status.ts       Persistent status line
│   └── terminal.ts     ANSI color helpers
└── templates/
    └── quetz-automerge.yml   GitHub Actions template
```

### Dependencies

Kept minimal for fast installs and reliability:

- **@octokit/rest** — GitHub API (PR detection, merge polling)
- **chalk** — Terminal colors
- **ora** — Spinner animations
- **yaml** — Parse/write `.quetzrc.yml`
- **handlebars** — Prompt template rendering

No heavy frameworks. Just Node.js, process spawning, and API polling.

### Key Design Constraints

- **No retries.** Every failure mode: notify and exit.
- **Agent is a black box.** Quetz never parses agent output.
- **Sequential only.** One loop, one agent at a time.
- **Minimal dependencies.** Fast installs, rare breakage.
- **PR detection is loose.** Discover what the agent did; don't dictate branch names.

---

## License

MIT — See LICENSE file for details.

---

**Questions?** Check the [Quetz specification](SPEC.md) for deeper details on design decisions and edge cases.

Happy automating! 🐉
