# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.7] - 2026-03-30

### Added
- Zero-arg `quetz run` launch experience with a full pre-run control screen for provider, model, thinking level, run mode, beads scope, custom prompt, and simulate mode.
- Launch-screen support for additive custom prompt input using native multiline textarea behavior and focus handling.
- Terminal size guardrails with explicit warning text:
  - Launch screen warns below `175x55`.
  - Main loop header warns below `230x55`.

### Changed
- Launch screen visual system refined for parity with the intended design language (panel chrome, control focus treatment, spacing, and issue counter presentation).
- Beads scope selector now labels epic mode as `epic - coming soon`.
- Launch and main TUI warning sizing now tracks Rezi resize events so visibility updates live while resizing.
- README now documents the zero-arg launch flow, current run/model flags, and terminal-size warning behavior.

### Fixed
- Short-terminal launch regressions where controls/footer clipped or compressed under low row counts.
- Header warning clipping in the main TUI caused by fixed right-column height constraints.
- Epic ID input behavior and styling consistency with the launch form controls.

## [0.7.6] - 2026-03-28

### Added
- First-class Codex runtime support via `codex exec --json`, including streamed event normalization, timeout handling, and provider-aware runtime selection across supported loop modes.
- Provider-neutral agent configuration and runtime descriptors, including shared `provider`, `model`, and `effort` plumbing plus provider-scoped config blocks for Claude and Codex.
- `quetz models` and `quetz models --provider <provider>` to print known model names and defaults for each supported provider.
- Explicit preflight provider checklist output in `quetz init`, showing shared CLI checks plus provider-by-provider `✓`/`✗` readiness.

### Changed
- Quetz loop, CLI, preflight, init flow, and TUI metadata now carry provider-aware labels instead of assuming Claude-specific runtime vocabulary.
- Agent/session log rails now restore lifecycle cues for ready-work fetches, git reset, prompt assembly, PR discovery, merge polling, merge success, and commit/amend completion.
- The agent panel now shows startup loader text in the natural top-left log area before the first streamed agent output arrives, improving clarity during slower Codex startup.
- README image asset refreshed to the current project artwork.
- README and sample config now describe provider selection explicitly.

### Fixed
- Victory and failure screens now advertise the existing `enter` / `esc` session-detail navigation in the footer instead of leaving it hidden.
- Outcome-screen history navigation now stays locked to the completed state instead of drifting back into the live layout after victory or failure.

## [0.6.4] - 2026-03-27

### Removed
- `TUI_V2_SPEC.md` deleted — spec has shipped; no longer needed in the repo

## [0.6.3] - 2026-03-27

### Changed
- **TUI rewritten from Ink (React) to [Rezi](https://rezitui.dev)** (`@rezi-ui/node`). The full-screen terminal UI is now driven by Rezi's declarative node backend, which manages layout, input handling, scrolling, and rendering. The component tree (`Header`, `Footer`, `AgentPanel`, `SessionsPanel`, `LogPanel`, `SessionDetail`, `VictoryCard`, `FailureCard`) has been ported from Ink JSX to Rezi's `ui.*` widget API. Mouse wheel scrolling, element measurement, and the animation loop are all handled by the Rezi runtime.
- Header subtitle ("the feathered serpent dev loop") repositioned to the bottom-right, aligned with the bottom of the Quetz wordmark, using a `justify: 'between'` column spanning the logo height.
- Agent header now displays the effort/thinking level alongside the model name (e.g. `claude haiku  turbo  [running]`).
- Footer controls simplified: removed `, . line` horizontal-scroll cue (appeared/disappeared inconsistently with pane focus) and `[ ] log` hint. Removed redundant `h history` — `↑↓ sessions  enter open` covers the same navigation.

### Fixed
- Session-detail exit trap: when the loop reached victory or failure while the user was viewing a past session, the exit screen would not render (mode was `victory`/`failure` but `viewingSession` was still set, causing the view to fall through to the main layout). `onVictory` and `onFailure` in `state.ts` now clear `viewingSession` immediately.
- Removed explicit border-colored separator row between the sessions and log panels; the panel borders provide sufficient visual separation. Adjusted `logRows` calculation to reclaim the freed row.

## [0.5.3] - 2026-03-24

### Fixed
- `q` and Ctrl+C now both show the same interrupted message: "The serpent withdraws — interrupted by user." Previously `q` mid-run would incorrectly show the victory message because `loopResult` hadn't been set yet (#67)
- StatusBar elapsed timer now ticks every second reliably. Timer moved from shared `usePhase` hook into local component `useState`/`useEffect` — the ink-spinner pattern. Ink wasn't reliably flushing re-renders from shared hook `setState` calls during agent streaming (#68)

### Removed
- `--dry` / `--dry-run` flag removed — it was dead code that provided no preview safety and actively misled users into thinking they were running safely (#65)

### Security
- `--simulate` mode now restricts agent tools to read-only operations. Previously the agent ran with full permissions and made real git commits, pushed real branches, and merged real PRs into user repos (#64)

## [0.5.2] - 2026-03-24

### Fixed
- README install command updated to `npm install -g @dkchar/quetz`

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

[0.8.7]: https://github.com/dkchar/quetz/releases/tag/v0.8.7
[0.7.6]: https://github.com/dkchar/quetz/releases/tag/v0.7.6
[0.6.4]: https://github.com/dkchar/quetz/releases/tag/v0.6.4
[0.6.3]: https://github.com/dkchar/quetz/releases/tag/v0.6.3
[0.5.3]: https://github.com/dkchar/quetz/releases/tag/v0.5.3
[0.5.2]: https://github.com/dkchar/quetz/releases/tag/v0.5.2
[0.5.1]: https://github.com/dkchar/quetz/releases/tag/v0.5.1
[0.5.0]: https://github.com/dkchar/quetz/releases/tag/v0.5.0
