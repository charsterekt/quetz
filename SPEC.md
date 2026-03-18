# Quetz — Product Specification

> *The Feathered Serpent Dev Loop*
>
> Quetz automates the agentic coding workflow: pick up a Beads issue, spawn a Claude Code agent, wait for the PR to merge, repeat until done.

**Version:** 0.1.0 (spec draft)
**Author:** DK + Claude
**Date:** 2026-03-17

---

## 1. What Quetz Is

Quetz is a local npm package that wraps the Claude Code CLI into a self-feeding development loop. It reads prioritised issues from a Beads issue graph, spawns a fully autonomous Claude Code agent for each one, monitors the resulting GitHub PR through to merge, and then spawns the next agent. The user watches Claude work in real time, same as if they'd typed the prompt themselves — Quetz just removes the manual handoff.

**Quetz is a wrapper.** It does not interpret, constrain, or second-guess agent behaviour. It does not claim issues, run tests, commit code, or push branches. The agent does all of that. Quetz manages the lifecycle around the agent: what issue to work on next, when to start, when to stop, and what to tell the user.

### 1.1 Name

Quetz, short for Quetzalcoatl — the feathered serpent of Mesoamerican mythology. A winged reptile that bridges earth and sky. Fitting for a tool that bridges the gap between a human's intent and an autonomous agent's execution. Also a dinosaur (Quetzalcoatlus), which is cool.

### 1.2 Installation

```bash
npm install quetz        # local to project (recommended)
npx quetz init           # first-time setup
npx quetz run            # start the loop
```

Quetz is always a local dependency, never global. It lives in the project it serves.

---

## 2. Core Loop

The loop is the entire product. Everything else is setup or polish.

```
┌─────────────────────────────────────────────────────┐
│                   QUETZ RUN LOOP                    │
│                                                     │
│  1. bd ready --json → get next issue                │
│     └─ if empty → DONE (victory screen)             │
│                                                     │
│  2. git checkout <default-branch>                   │
│     git pull origin <default-branch>                │
│                                                     │
│  3. Assemble prompt (issue + bd prime + template)   │
│                                                     │
│  4. Spawn: claude -p <prompt>                       │
│        --dangerously-skip-permissions               │
│     └─ stdio: inherit (user sees everything)        │
│                                                     │
│  5. Agent process exits                             │
│                                                     │
│  6. Detect PR on GitHub                             │
│     └─ search by branch pattern or recent PR        │
│                                                     │
│  7. Poll PR for merge                               │
│     └─ if merged → go to step 1                     │
│     └─ if checks failed → NOTIFY + EXIT             │
│     └─ if timeout → NOTIFY + EXIT                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 2.1 Issue Selection

Quetz calls `bd ready --json` at the start of each iteration. This returns the dependency-resolved, priority-sorted list of unblocked issues. Quetz takes the **first** item. If the list is empty:

- **On first iteration (nothing to do):** Print a message like *"No ready issues found. The serpent sleeps."* and exit cleanly.
- **Mid-loop (all work complete):** Print the victory screen and exit with code 0.

Quetz does not filter, re-sort, or skip issues. Beads owns the priority graph. Quetz trusts it.

### 2.2 Git Choreography

Before each agent spawn, Quetz performs a deterministic git reset:

```bash
git checkout <defaultBranch>    # e.g. main, master — user-configured
git pull origin <defaultBranch> # ensure up-to-date with merged PRs
```

This is the **only** git operation Quetz performs. The agent handles branching, committing, pushing, and PR creation. Quetz does not dictate branch names to the agent — it discovers the PR after the fact.

If `git pull` fails (e.g. merge conflict from manual changes), Quetz prints an error and exits. It does not attempt recovery.

### 2.3 Prompt Assembly

The prompt sent to the agent is assembled from three sources:

1. **`bd prime` output** — dynamic project context (ready work, recent activity, project state). Captured via `bd prime --json` or plain text.

2. **Issue details** — from `bd show <issue-id> --json`. Includes title, description, priority, type, dependencies, and any linked context.

3. **User prompt template** — from `.quetzrc.yml`. This is the instruction set that tells the agent what to do. It has access to template variables for the issue.

**Default prompt template:**

```
{{bdPrime}}

---

You are picking up Beads issue {{issue.id}}: "{{issue.title}}"
Priority: {{issue.priority}} | Type: {{issue.type}}

{{#if issue.description}}
Description:
{{issue.description}}
{{/if}}

{{#if issue.dependencies}}
Dependencies (already resolved):
{{issue.dependencies}}
{{/if}}

Your task:
1. Claim this issue: bd update {{issue.id}} --claim
2. Review the project spec and relevant code to understand context.
3. Create a new branch for this work.
4. Implement the solution.
5. Run tests. Fix any failures.
6. Commit with a conventional commit message referencing the issue, e.g.: feat: add auth middleware ({{issue.id}})
7. Push your branch to origin.
8. Open a pull request with the "{{automergeLabel}}" label.
9. Close the issue: bd close {{issue.id}} --reason "Completed — PR raised"

Do not ask for confirmation. Complete all steps autonomously.
```

The user can fully override this template in `.quetzrc.yml`. The default is a starting point.

### 2.4 Agent Spawning

```typescript
const agent = spawn('claude', ['-p', prompt, '--dangerously-skip-permissions'], {
  stdio: 'inherit',  // all output goes straight to the user's terminal
  cwd: projectRoot,  // run in the project directory
});
```

`stdio: 'inherit'` is critical. The user sees exactly what they'd see running Claude Code manually — every file edit, every test run, every commit message. Quetz adds its own status chrome above and below this, but the agent session is unfiltered.

The agent process is a black box to Quetz. It does not parse agent output, detect intermediate states, or send signals to the agent. It waits for the process to exit.

**Timeout:** Configurable (default: 30 minutes). If the agent process hasn't exited after this duration, Quetz kills it, prints a timeout message, and exits the loop. This catches genuine hangs without interfering with long-running legitimate work.

### 2.5 PR Detection

After the agent process exits, Quetz needs to find the PR it (presumably) created. Strategy:

1. **Query GitHub API** for open PRs on the repo, sorted by creation date (newest first).
2. **Match** by: PR was created after the agent was spawned, and the PR body or branch name references the issue ID.
3. **Fallback:** If no PR is found within 60 seconds of agent exit, assume the agent didn't create one. Print an error and exit.

This is intentionally loose. We don't dictate branch naming — we discover what the agent did.

### 2.6 Merge Polling

Once a PR is found, Quetz polls its status:

```
every <pollInterval> seconds:
  GET /repos/{owner}/{repo}/pulls/{number}
  
  if pr.merged → SUCCESS, continue loop
  if pr.state == "closed" && !pr.merged → CLOSED WITHOUT MERGE, exit
  if any check run has conclusion "failure" → CI FAILED, exit
  if elapsed > mergeTimeout → TIMEOUT, exit
```

**Poll interval:** Configurable (default: 30 seconds).
**Merge timeout:** Configurable (default: 15 minutes from agent exit).

On success, Quetz prints a merge confirmation with the PR link, then loops back to step 1.

### 2.7 Failure Handling

Quetz has exactly one failure mode: **notify and exit.**

| Failure | Behaviour |
|---|---|
| `bd ready` returns error | Print error, exit |
| `git pull` fails | Print error, exit |
| Agent process exits with non-zero code | Print warning, still attempt PR detection (agent might have pushed before erroring) |
| Agent times out | Kill process, print timeout message, exit |
| No PR found after agent exits | Print error, exit |
| CI checks fail on PR | Print failure details + PR link, exit |
| PR closed without merge | Print message, exit |
| Merge timeout exceeded | Print message + PR link, exit |
| GitHub API error / network failure | Print error, exit |

No retries. No auto-fix. No "let me spawn another agent to debug this." The user reviews, fixes whatever went wrong, and runs `quetz run` again. The Beads graph persists — the issue is still there, still ready (or still claimed by the failed attempt).

---

## 3. Configuration

All configuration lives in `.quetzrc.yml` at the project root.

### 3.1 Full Config Schema

```yaml
# .quetzrc.yml

# GitHub settings
github:
  owner: "dk"                          # repo owner / org
  repo: "aegis"                        # repo name
  defaultBranch: "main"                # branch to pull from between iterations
  automergeLabel: "automerge"          # label that triggers auto-merge action

# Agent settings
agent:
  timeout: 30                          # minutes — kill agent if it runs longer
  prompt: |                            # override default prompt template
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
  colors: true                         # enable/disable colours (auto-detected)
```

### 3.2 Config Generation

`quetz init` generates this file interactively. It infers defaults where possible:

- `github.owner` and `github.repo` — parsed from `git remote get-url origin`
- `github.defaultBranch` — from `git symbolic-ref refs/remotes/origin/HEAD`
- `github.automergeLabel` — defaults to `"automerge"`

The user confirms or overrides each value.

---

## 4. CLI Interface

### 4.1 Commands

```
quetz init      First-time setup. Generates .quetzrc.yml, runs preflight checks,
                optionally scaffolds GitHub Actions.

quetz run       Start the dev loop. Runs until all issues are resolved or a
                failure occurs.

quetz run --dry Show what would happen: lists issues in order, prints the prompt
                for the first one, exits without spawning.

quetz status    Show current loop state: how many issues remain, what's in
                progress, last completed issue.

quetz help      Show all commands with descriptions.
```

### 4.2 Output Design

Quetz's terminal output is divided into two zones:

**Quetz chrome** — coloured status lines that appear between agent sessions. These show loop progress, issue transitions, GitHub polling status, and success/failure messages.

**Agent zone** — the raw Claude Code output, completely unmodified. When the agent is running, Quetz gets out of the way.

### 4.3 Usage Banner

Every invocation of `quetz` (including `quetz run`) prints a compact usage banner at the top:

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
```

---

## 5. Setup Flow (`quetz init`)

### 5.1 Preflight Checks

`quetz init` runs these checks in order. Any failure is blocking — init will not proceed past a failed check.

**1. Claude Code CLI**
```bash
claude --version
```
- If missing: *"Claude Code CLI not found. Install it: https://docs.claude.com"* → exit.
- If found, check auth:
```bash
claude --print "echo hello" 2>&1
```
- If auth fails: *"Claude Code is installed but not authenticated. Run `claude` and complete login."* → exit.

**2. GitHub CLI (`gh`)**
```bash
gh auth status
```
- If missing: *"GitHub CLI not found. Install it: https://cli.github.com"* → exit.
- If not authenticated: *"GitHub CLI is not authenticated. Run `gh auth login`."* → exit.

**3. Beads CLI (`bd`)**
```bash
bd --version
```
- If missing: *"Beads CLI not found. Install it: https://github.com/steveyegge/beads"* → exit.
- Check for initialised Beads in project:
```bash
bd ready --json
```
- If no `.beads/` directory or uninitialised: *"Beads is not initialised in this project. Run `bd init`."* → exit.

**4. Git remote**
```bash
git remote get-url origin
```
- If no remote: *"No git remote found. Quetz needs a GitHub remote to poll PRs."* → exit.
- Parse owner/repo from URL for config defaults.

### 5.2 GitHub Actions Setup

After preflight passes and config is generated, Quetz offers to scaffold the automerge action:

```
GitHub Actions Setup
════════════════════

Quetz needs one GitHub Action: an automerge workflow that merges PRs
when all checks pass and the "automerge" label is present.

Your CI (tests, linting, code review) is your business — Quetz
doesn't touch it.

  [1] Write automerge workflow to .github/workflows/quetz-automerge.yml
  [2] Have Claude Code raise a PR to add it
  [3] I'll handle it myself (show me what's needed)

Select [1/2/3]:
```

**Option 1** writes the file directly.
**Option 2** spawns a one-off Claude Code session to create the file, commit, push, and raise a PR.
**Option 3** prints the workflow YAML to the terminal for the user to copy.

### 5.3 Label Reminder

After actions setup:

```
⚠  Reminder: Create the "automerge" label on your GitHub repo.
   → https://github.com/dk/aegis/labels
   Quetz agents will tag PRs with this label to trigger auto-merge.
```

### 5.4 Automerge Action Template

```yaml
# .github/workflows/quetz-automerge.yml
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
          MERGE_LABELS: "automerge"     # matches quetzrc label
          MERGE_METHOD: "squash"
          MERGE_DELETE_BRANCH: "true"
          UPDATE_METHOD: "rebase"
```

The `MERGE_LABELS` value is injected from the user's configured `automergeLabel`.

---

## 6. Terminal Experience

Quetz should be **fun to watch.** The terminal is the only UI. It needs personality.

### 6.1 Colour Palette

All colours use ANSI 256 or basic ANSI codes for maximum terminal compatibility. Quetz auto-detects colour support and falls back to plain text if needed (`NO_COLOR` env var respected).

| Element | Colour | Purpose |
|---|---|---|
| Quetz branding / banner | Green (bold) | Identity |
| Issue ID | Cyan (bold) | Easy to spot in log |
| Success messages | Green | Merged, completed |
| Waiting / polling | Yellow | In progress |
| Errors / failures | Red (bold) | Attention |
| Dim info | Grey | Timestamps, metadata |
| Agent separator lines | Magenta | Visually separate agent sessions |

### 6.2 ASCII Art

On startup (`quetz run`), display a Quetzalcoatl ASCII art with a brief animation (the serpent "flies" in from the left over ~1 second):

```
        ___
    ~~~/ o \~~~>  
   ~~~|  =  |~~>  QUETZ v0.1.0
   ~~~\___/~~~>   The Feathered Serpent Dev Loop
       ||||
      ~~||~~
        ~~
```

*This is a placeholder — the actual art should be more elaborate and animated. Consider a frame-by-frame animation using something like `chalk-animation` or raw ANSI cursor movement. The serpent could undulate across the terminal. Keep it to 1-2 seconds max — cool but not annoying.*

### 6.3 Status Messages

Quetz's personality comes through in its status messages. These should be varied and fun. Examples:

**Issue pickup:**
```
🐉 Picking up bd-a1b2: "Add authentication middleware" [P1 task]
   ──── Summoning agent ────
```

**Agent handoff (between sessions):**
```
   ──── Agent session complete ────
🔍 Searching for PR...
✓  Found PR #42: "feat: add auth middleware (bd-a1b2)"
   Watching for merge...
```

**Polling (animated spinner or dots):**
```
⏳ Waiting for merge... ◐ (2m 30s elapsed)
```

**Merge success:**
```
✅ PR #42 merged! The serpent devours bd-a1b2.
   ────────────────────────────────────────
   Issues remaining: 7
   ────────────────────────────────────────
```

**All issues complete (victory screen):**
```
   ╔══════════════════════════════════════╗
   ║                                      ║
   ║    ALL ISSUES RESOLVED               ║
   ║                                      ║
   ║    Issues completed: 14              ║
   ║    Total time: 3h 42m               ║
   ║    PRs merged: 14                   ║
   ║                                      ║
   ║    The serpent rests. 🐉             ║
   ║                                      ║
   ╚══════════════════════════════════════╝
```

**Failure:**
```
💥 CI failed on PR #42
   → https://github.com/dk/aegis/pull/42
   
   The serpent retreats. Fix the issue and run quetz again.
```

### 6.4 Live Counters

During a run, maintain a persistent status line (using ANSI cursor positioning) that shows:

```
[quetz] Issue 3/14 | bd-c3d4 | Agent running... (4m 12s)
```

This sits above the agent's output and updates in place. When the agent finishes and Quetz is polling, it changes to:

```
[quetz] Issue 3/14 | bd-c3d4 | PR #42 — waiting for merge ◑ (1m 05s)
```

### 6.5 Animation Library

Use a small set of terminal animation utilities (not a heavy dependency — hand-roll or use `ora` for spinners and `chalk` for colours):

- **Spinner** for polling states (merge wait, PR detection)
- **Progress counter** for issue completion (3/14)
- **Wipe transition** between agent sessions (a horizontal line that sweeps across)
- **Startup animation** for the ASCII serpent (1-2 seconds, skippable with `--no-animate` or `display.animations: false`)

---

## 7. Technical Architecture

### 7.1 Project Structure

```
quetz/
├── src/
│   ├── cli.ts                 # Entry point, command router, usage banner
│   ├── config.ts              # .quetzrc.yml loader/writer, schema validation
│   ├── init.ts                # quetz init flow — preflight, config gen, actions
│   ├── loop.ts                # Main run loop — orchestrates everything
│   ├── agent.ts               # Claude Code process spawning + lifecycle
│   ├── beads.ts               # bd CLI wrapper — ready, show, prime
│   ├── github.ts              # Octokit — PR detection, merge polling
│   ├── prompt.ts              # Prompt template assembly + variable injection
│   ├── git.ts                 # Git operations — checkout, pull (minimal)
│   ├── preflight.ts           # CLI availability checks (claude, gh, bd, git)
│   ├── display/
│   │   ├── terminal.ts        # Colour helpers, ANSI codes, terminal size
│   │   ├── spinner.ts         # Animated spinner for polling states
│   │   ├── banner.ts          # ASCII art, startup animation, usage banner
│   │   ├── messages.ts        # All user-facing strings, fun status messages
│   │   └── status.ts          # Persistent status line management
│   └── templates/
│       └── quetz-automerge.yml  # GitHub Actions template
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE
```

### 7.2 Dependencies

Kept minimal. Quetz is a thin wrapper — it should install fast and break rarely.

| Dependency | Purpose |
|---|---|
| `@octokit/rest` | GitHub API client (PR polling, detection) |
| `chalk` | Terminal colours |
| `ora` | Spinner animations |
| `yaml` | Parse/write `.quetzrc.yml` |
| `mustache` or `handlebars` | Prompt template rendering |

**No heavy frameworks.** No Express, no React, no Ink. This is a Node script that spawns processes and polls an API.

### 7.3 Key Implementation Details

**Agent spawning (agent.ts):**
```typescript
import { spawn } from 'child_process';

export function spawnAgent(prompt: string, cwd: string, timeout: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', prompt, '--dangerously-skip-permissions'], {
      stdio: 'inherit',
      cwd,
    });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Agent timed out after ${timeout} minutes`));
    }, timeout * 60 * 1000);

    proc.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
```

**Beads integration (beads.ts):**
```typescript
import { execSync } from 'child_process';

export function getReadyIssues(): BeadsIssue[] {
  const output = execSync('bd ready --json', { encoding: 'utf-8' });
  return JSON.parse(output);
}

export function getIssueDetails(id: string): BeadsIssue {
  const output = execSync(`bd show ${id} --json`, { encoding: 'utf-8' });
  return JSON.parse(output);
}

export function getPrimeContext(): string {
  return execSync('bd prime', { encoding: 'utf-8' });
}
```

**PR detection (github.ts):**
```typescript
export async function findPR(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueId: string,
  since: Date
): Promise<PR | null> {
  const { data: prs } = await octokit.pulls.list({
    owner, repo,
    state: 'open',
    sort: 'created',
    direction: 'desc',
    per_page: 10,
  });

  return prs.find(pr => {
    const createdAfterSpawn = new Date(pr.created_at) >= since;
    const referencesIssue = pr.title.includes(issueId) 
                         || pr.body?.includes(issueId)
                         || pr.head.ref.includes(issueId);
    return createdAfterSpawn && referencesIssue;
  }) ?? null;
}
```

### 7.4 Exit Codes

| Code | Meaning |
|---|---|
| 0 | All issues resolved (victory) or clean exit |
| 1 | Failure — CI, timeout, missing PR, git error, etc. |
| 2 | Config error — missing `.quetzrc.yml`, invalid config |
| 3 | Preflight failure — missing CLI tool or auth |

---

## 8. What Quetz Does NOT Do

Drawing the boundary clearly:

- **Does not claim issues.** The agent does this via `bd update <id> --claim`.
- **Does not run tests.** The agent does this.
- **Does not commit or push code.** The agent does this.
- **Does not create branches.** The agent does this.
- **Does not open PRs.** The agent does this.
- **Does not manage CI configuration.** The user owns their test/review pipeline.
- **Does not retry failed issues.** Notify and exit.
- **Does not run multiple agents in parallel.** One loop, one agent, sequential.
- **Does not parse or interpret agent output.** It's a black box.
- **Does not interact with the Claude API directly.** It shells out to the CLI.
- **Does not manage GitHub labels.** It reminds the user to create them.
- **Does not handle merge conflicts.** If `git pull` fails, it exits.

---

## 9. Future Considerations (Not in v0.1)

These are explicitly out of scope but worth noting for later:

- **Retry with context** — on CI failure, spawn a new agent with the failure log and ask it to fix.
- **Parallel agents** — run multiple Quetz loops on non-overlapping issues (Beads' `--claim` supports this, but adds orchestration complexity).
- **Web dashboard** — a localhost UI showing loop progress, issue burndown, cost tracking.
- **Cost estimation** — before starting, estimate token usage based on issue count and complexity.
- **Token counter** — running total of API spend per session.
- **Webhook listener** — replace polling with GitHub webhook events for faster merge detection.
- **Plugin system** — hooks for custom behaviour at each loop stage (pre-agent, post-merge, etc.).
- **Support for other agents** — Codex, Amp, Cursor, etc. (different spawn commands, same loop).
- **`quetz watch`** — a mode that runs continuously, picking up new issues as they're created (daemon mode).

---

## 10. Success Criteria

Quetz v0.1.0 is done when:

1. `quetz init` runs preflight checks, generates config, and scaffolds the automerge action.
2. `quetz run` resolves at least 3 consecutive Beads issues end-to-end without manual intervention — from `bd ready` through PR merge.
3. `quetz run --dry` shows the issue queue and first prompt without side effects.
4. `quetz status` shows meaningful loop state.
5. Terminal output is colourful, animated, and genuinely fun to watch.
6. Failure on CI produces a clear, actionable error message and clean exit.
7. The whole thing is under 2000 lines of TypeScript.