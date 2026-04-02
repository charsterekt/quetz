# Smarter Beads Integration Design

## Summary

This spec covers delivery of epic `quetz-a0p`: smarter beads integration for Quetz. The goal is to make beads-backed runs accurate and dependency-aware across the entire user experience by:

- scoping runs to either all open work or a specific epic,
- deriving progress totals from the selected open scope instead of `bd ready`,
- validating the dependency graph before the first issue pickup,
- surfacing dependency context in the TUI so single-ready chains do not look stalled, and
- preserving the existing rule that Quetz never overrides beads ordering.

This delivery also absorbs `quetz-y4v`, which was previously marked `in_progress` but should be treated as part of the epic.

## Goals

- Add explicit run scoping for all-open work versus a single epic.
- Make issue totals reflect open work in scope, not currently-ready work.
- Keep issue selection fully delegated to `bd ready`.
- Detect invalid dependency graphs before the loop starts.
- Show dependency context in the TUI log and counters so dependency chains are understandable.
- Preserve backward compatibility for existing CLI usage and launch-screen flows.

## Non-Goals

- Changing how beads itself computes readiness, validation, or epic membership.
- Adding arbitrary issue filtering beyond all-open versus epic scope.
- Reworking the TUI layout beyond what is needed to display new scope and dependency context.
- Replacing the current sequential loop with parallel issue execution.

## User-Facing Behavior

### Run Scope

Quetz runs in one of two beads scopes:

- `all`: operate on all open issues in the repository, using `bd ready --json` for pickup and `bd list --status open --json` for totals.
- `epic`: operate only on children of a specific epic, using `bd ready --parent <epic-id> --json` for pickup and `bd list --parent <epic-id> --json` for totals.

The launch screen already exposes `all` versus `epic`. This delivery wires that selection into the real loop behavior. The CLI also gains `--epic <id>` so non-TTY and scripted usage can select the same scoped behavior.

### Accurate Progress Totals

The header/footer issue counter must represent:

- `current`: the current iteration number within the run, and
- `total`: the number of open issues in the active scope.

`total` must never be derived from the size of the `bd ready` result. In a dependency chain where only one issue is ready at a time, the counter must still show progress such as `3/8`, not `1/1`.

Totals are computed:

- once before the first pickup,
- again after each issue is completed, and
- from the same scope as issue selection.

### Dependency Ordering

Quetz continues to respect dependency ordering by default without configuration:

- it never sorts or reorders `bd ready` results,
- it never treats a single ready issue as suspicious,
- it re-queries `bd ready` after each completion, and
- docs/config text make that behavior explicit.

### Pre-Run Validation

Before the first issue is picked:

- always run `bd dep cycles --json`,
- if scope is `epic`, also run `bd swarm validate <epic-id>`.

Validation behavior:

- cycles or validation errors stop the run with exit code `2`,
- epic validation warnings are surfaced in the TUI log before startup,
- epic validation informational output such as ready fronts or estimated worker-sessions is also logged when available.

### Dependency Context Logging

When Quetz picks up an issue, the log rail shows scope context:

- global scope: `ready: <n>  open: <m>`
- epic scope: `scope: <done> done  <active> active  <ready> ready  <blocked> blocked`

This is informational only. It does not change issue selection.

## Architecture

### Scope Model

Introduce a first-class runtime scope model that is passed from CLI/launch selection into the loop:

- `{ mode: 'all' }`
- `{ mode: 'epic', epicId: string }`

The loop must not infer epic scope indirectly from UI state. CLI flags, launch-screen selections, and config defaults all normalize into the same runtime shape before `runLoop()` begins.

### Beads Access Layer

`src/beads.ts` becomes the single place that knows how to talk to beads for:

- ready issue selection,
- listing open issues in scope,
- counting open issues in scope,
- epic validation,
- cycle validation,
- dependency status summaries, and
- epic existence/type validation.

This avoids duplicating command construction in `src/cli.ts` and `src/loop.ts`.

### Loop Orchestration

`src/loop.ts` remains the source of truth for run orchestration and consumes a higher-level beads API. The loop flow becomes:

1. Resolve scope.
2. Validate scope and dependency graph.
3. Fetch total open issues in scope.
4. Fetch next ready issues in scope.
5. Pick the first ready issue exactly as returned.
6. Emit scoped counters and dependency-context log information.
7. Run the agent lifecycle.
8. Re-fetch totals and readiness for the next iteration.

### TUI/Event Flow

The event bus continues to drive UI state. New data should be expressed as explicit events or explicit payload additions, rather than having the UI derive it from old counters.

The TUI should be able to show:

- scoped total count at loop start,
- current issue iteration against the scoped total,
- dependency-context log entries after pickup,
- validation warnings before issue pickup when relevant.

## Detailed Design

### CLI and Launch Integration

`quetz run` gains `--epic <id>`.

Behavior rules:

- `quetz run --epic quetz-a0p` starts immediately in epic-scoped mode.
- `quetz run` with no run flags still opens the launch screen.
- launch-screen selection of `epic` plus an epic ID produces the same runtime options as `--epic`.
- if both CLI `--epic` and launch-screen state could exist, the CLI path wins because launch is bypassed when explicit flags are provided.

Validation rules:

- blank epic IDs are rejected before the run starts,
- invalid or missing epic IDs cause exit code `2`,
- non-epic issue IDs cause exit code `2`,
- the launch UI no longer labels epic mode as "coming soon".

Config support:

- `.quetzrc.yml` may include an optional default epic scope field for non-interactive runs,
- if absent, behavior remains all-open by default,
- CLI flags override config values.

### Beads Commands

The beads layer uses these commands:

- all scope ready issues: `bd ready --json`
- epic scope ready issues: `bd ready --parent <epic-id> --json`
- all scope total open issues: `bd list --status open --json`
- epic scope total open issues: `bd list --parent <epic-id> --json`, with Quetz filtering the returned children to open statuses before counting
- epic existence/type validation: `bd show <epic-id> --json`
- cycle validation: `bd dep cycles --json`
- epic graph validation: `bd swarm validate <epic-id>`
- epic dependency summary: `bd swarm status <epic-id> --json`

If a beads command fails, the wrapper should throw a descriptive error containing the exact command.

### Epic Validation Semantics

Epic validation consists of two separate checks:

- `bd show <epic-id> --json` confirms the issue exists and has `issue_type: epic`.
- `bd swarm validate <epic-id>` validates dependency topology within that epic.

If `bd show` returns no issue or a non-epic issue, the run exits with code `2`.

If `bd swarm validate` reports errors, the run exits with code `2`.

If `bd swarm validate` reports warnings but no errors, the run continues and logs those warnings before the first pickup.

### Global Validation Semantics

Global runs do not use `bd swarm validate`. They only use `bd dep cycles --json`.

If cycles are present:

- Quetz logs the involved issues,
- exits with code `2`, and
- does not start the loop.

### Counter Semantics

The loop start event carries the scoped total, not the number of currently-ready issues.

Per-issue pickup continues to carry:

- `iteration`: the 1-based count of issues processed in this run,
- `total`: the latest scoped open total for the run.

After each completion, `total` is recomputed from the remaining open work in scope so the counter remains accurate when work closes during the run.

### Dependency Context Semantics

For all-open scope:

- `ready` is `bd ready --json`.length
- `open` is the scoped open total

For epic scope:

- use `bd swarm status <epic-id> --json`
- extract completed, active, ready, and blocked counts from the response
- log a single summary line after each pickup and after successful validation startup

If summary commands fail, Quetz logs a warning but does not fail the run. These summaries are observability, not correctness.

## Error Handling

- Beads command failure during validation or scope resolution: exit `2` if this blocks startup correctness, otherwise exit `1` if it occurs mid-run.
- Invalid epic ID: exit `2`.
- Graph validation error: exit `2`.
- Summary/logging command failure: warning only.
- `bd ready` failure during loop execution: existing runtime failure path remains exit `1`.

This keeps configuration/validation failures distinct from runtime failures.

## Testing Strategy

### Unit Tests

Add or update tests for:

- scoped ready-issue queries in `src/test/beads.test.ts`
- scoped total counting in `src/test/beads.test.ts`
- epic validation and cycle validation wrappers in `src/test/beads.test.ts`
- CLI parsing of `--epic` in `src/test/cli.test.ts`
- launch-screen epic-mode behavior in `src/test/ui-launch-app.test.ts`
- loop startup validation, scoped totals, and scoped pickup behavior in `src/test/loop.test.ts`
- UI state logging/event handling in `src/test/ui-state.test.ts`

### Regression Coverage

Add explicit regressions for:

- a dependency chain where only one issue is ready but total open issues is greater than one,
- epic mode using `bd ready --parent`,
- invalid epic IDs,
- non-epic IDs passed to `--epic`,
- cycle detection aborting before pickup,
- epic validation warnings being logged without aborting,
- summary logging for all scope and epic scope.

### Verification Commands

Minimum verification before merge:

- `npm test`
- `npm run build`

Targeted suites should be used during development before the full pass.

## Parallelization Plan

Implementation is intentionally split into mostly independent workstreams:

1. Scope and counts
   - CLI flag
   - launch wiring
   - config normalization
   - scoped ready/list/count wrappers

2. Validation
   - epic existence/type checks
   - cycle detection
   - swarm validate parsing
   - exit-code behavior

3. Observability
   - dependency-context summary events/log lines
   - scoped counter propagation
   - README/config messaging for dependency ordering

Final integration remains local because the workstreams converge in `src/beads.ts`, `src/loop.ts`, and shared tests.

## Files Expected To Change

- `src/beads.ts`
- `src/cli.ts`
- `src/config.ts`
- `src/loop.ts`
- `src/events.ts`
- `src/ui/LaunchApp.tsx`
- `src/ui/state.ts`
- `src/test/beads.test.ts`
- `src/test/cli.test.ts`
- `src/test/loop.test.ts`
- `src/test/ui-launch-app.test.ts`
- `src/test/ui-state.test.ts`
- `README.md`
- `.quetzrc.yml` (schema/docs only if the config surface changes)

## Open Decisions Resolved

- `quetz-y4v` is included in this delivery branch.
- Delivery is one integration branch with parallel subagent/worktree execution, not one branch per child issue.
- Dependency summaries are informative and non-fatal.
- Validation failures are treated as configuration/preflight errors with exit code `2`.
