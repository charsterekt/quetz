# Smarter Beads Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add epic-scoped beads runs, accurate dependency-aware issue counts, pre-run graph validation, and dependency-context logging without changing Quetz's rule that issue ordering comes entirely from `bd ready`.

**Architecture:** Introduce a first-class beads scope model and centralize scoped beads commands in `src/beads.ts`, then thread that scope through config/CLI/launch into `runLoop()`. Keep loop orchestration in `src/loop.ts`, add explicit preflight validation and dependency summary logging there, and extend event/state plumbing so the TUI reflects scoped counts and validation output.

**Tech Stack:** TypeScript, Vitest, Node.js child-process wrappers, Rezi TUI state/event bus

---

### Task 1: Add Scoped Beads Primitives

**Files:**
- Modify: `src/beads.ts`
- Test: `src/test/beads.test.ts`

- [ ] **Step 1: Write the failing scope-wrapper tests**

```ts
describe('scoped beads queries', () => {
  it('uses bd ready --parent for epic-scoped ready issues', () => {
    mockExecFileSync.mockReturnValue(JSON.stringify([]) as never);
    getReadyIssues({ mode: 'epic', epicId: 'quetz-a0p' });
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['ready', '--parent', 'quetz-a0p', '--json'],
      expect.any(Object),
    );
  });

  it('counts open issues from bd list scoped to the epic', () => {
    mockExecFileSync.mockReturnValue(JSON.stringify([
      { id: 'quetz-1', status: 'open' },
      { id: 'quetz-2', status: 'closed' },
    ]) as never);
    expect(countOpenIssues({ mode: 'epic', epicId: 'quetz-a0p' })).toBe(1);
  });
});

describe('validation wrappers', () => {
  it('returns epic metadata from bd show', () => {
    mockExecFileSync.mockReturnValue(JSON.stringify({
      id: 'quetz-a0p',
      issue_type: 'epic',
    }) as never);
    expect(getIssueDetails('quetz-a0p').issue_type).toBe('epic');
  });

  it('calls bd dep cycles --json', () => {
    mockExecFileSync.mockReturnValue(JSON.stringify([]) as never);
    getDependencyCycles();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['dep', 'cycles', '--json'],
      expect.any(Object),
    );
  });
});
```

- [ ] **Step 2: Run the scoped beads tests to verify they fail**

Run: `npm test -- src/test/beads.test.ts`

Expected: FAIL because `getReadyIssues()` does not accept a scope object, `countOpenIssues()` still uses `bd count`, and validation helpers do not exist yet.

- [ ] **Step 3: Add the scope types and scoped wrappers in `src/beads.ts`**

```ts
export type BeadsScope =
  | { mode: 'all' }
  | { mode: 'epic'; epicId: string };

function readyArgs(scope: BeadsScope): string[] {
  return scope.mode === 'epic'
    ? ['ready', '--parent', scope.epicId]
    : ['ready'];
}

function listArgs(scope: BeadsScope): string[] {
  return scope.mode === 'epic'
    ? ['list', '--parent', scope.epicId]
    : ['list', '--status', 'open'];
}

function isOpenStatus(status: string | undefined): boolean {
  return status === 'open' || status === 'ready' || status === 'in_progress' || status === 'active';
}

export function getReadyIssues(scope: BeadsScope = { mode: 'all' }): BeadsIssue[] {
  if (mockMode) return MOCK_ISSUES.filter(i => i.status === 'ready');
  const parsed = execBdJson(readyArgs(scope));
  return Array.isArray(parsed) ? (parsed as BeadsIssue[]) : [];
}

export function listScopedIssues(scope: BeadsScope = { mode: 'all' }): BeadsIssue[] {
  if (mockMode) return MOCK_ISSUES;
  const parsed = execBdJson(listArgs(scope));
  return Array.isArray(parsed) ? (parsed as BeadsIssue[]) : [];
}

export function countOpenIssues(scope: BeadsScope = { mode: 'all' }): number {
  if (mockMode) return MOCK_ISSUES.filter(issue => issue.status === 'ready').length;
  return listScopedIssues(scope).filter(issue => isOpenStatus(issue.status)).length;
}
```

- [ ] **Step 4: Add validation and summary helpers in `src/beads.ts`**

```ts
export interface BeadsCycle {
  issues?: string[];
}

export interface BeadsValidationResult {
  errors: string[];
  warnings: string[];
  info: string[];
}

export function getDependencyCycles(): BeadsCycle[] {
  if (mockMode) return [];
  const parsed = execBdJson(['dep', 'cycles']);
  return Array.isArray(parsed) ? (parsed as BeadsCycle[]) : [];
}

export function assertEpicIssue(issue: BeadsIssue, epicId: string): void {
  if (issue.issue_type !== 'epic') {
    throw new Error(`Issue ${epicId} is not an epic.`);
  }
}

export function parseSwarmValidateOutput(output: string): BeadsValidationResult {
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return {
    errors: lines.filter(line => /^error[:\s]/i.test(line)),
    warnings: lines.filter(line => /^warning[:\s]/i.test(line)),
    info: lines.filter(line => !/^error[:\s]/i.test(line) && !/^warning[:\s]/i.test(line)),
  };
}

export function validateEpicGraph(epicId: string): BeadsValidationResult {
  if (mockMode) return { errors: [], warnings: [], info: [] };
  return parseSwarmValidateOutput(execBd(['swarm', 'validate', epicId]));
}
```

- [ ] **Step 5: Add an epic status summary wrapper in `src/beads.ts`**

```ts
export interface BeadsScopeSummary {
  done?: number;
  active?: number;
  ready?: number;
  blocked?: number;
}

export function getEpicScopeSummary(epicId: string): BeadsScopeSummary {
  if (mockMode) return { done: 0, active: 0, ready: 0, blocked: 0 };
  const parsed = execBdJson(['swarm', 'status', epicId]);
  if (!parsed || typeof parsed !== 'object') return {};
  const obj = parsed as Record<string, unknown>;
  return {
    done: typeof obj.completed === 'number' ? obj.completed : 0,
    active: typeof obj.active === 'number' ? obj.active : 0,
    ready: typeof obj.ready === 'number' ? obj.ready : 0,
    blocked: typeof obj.blocked === 'number' ? obj.blocked : 0,
  };
}
```

- [ ] **Step 6: Run the beads tests to verify they pass**

Run: `npm test -- src/test/beads.test.ts`

Expected: PASS with scoped command construction, open-count filtering, and validation helpers covered.

- [ ] **Step 7: Commit the scoped beads foundation**

```bash
git add src/beads.ts src/test/beads.test.ts
git commit -m "feat: add scoped beads query helpers"
```

### Task 2: Thread Scope Through Config, CLI, and Launch

**Files:**
- Modify: `src/config.ts`
- Modify: `src/cli.ts`
- Modify: `src/ui/LaunchApp.tsx`
- Test: `src/test/cli.test.ts`
- Test: `src/test/ui-launch-app.test.ts`
- Test: `src/test/config.test.ts`

- [ ] **Step 1: Write the failing CLI/config tests**

```ts
it('parses --epic and forwards scoped options to runLoop', async () => {
  process.argv = ['node', 'quetz', 'run', '--epic', 'quetz-a0p'];
  setStdoutSize(false, 120, 40);

  await expect(main()).rejects.toMatchObject({ code: 0 });

  expect(mockRunLoop).toHaveBeenCalledWith(
    expect.objectContaining({
      scope: { mode: 'epic', epicId: 'quetz-a0p' },
    }),
    bus,
  );
});

it('rejects a blank --epic value', async () => {
  process.argv = ['node', 'quetz', 'run', '--epic'];
  await expect(main()).rejects.toMatchObject({ code: 1 });
  expect(stderrOutput()).toContain('--epic requires a value');
});
```

```ts
it('returns epic selection from launch state', () => {
  const selection = toSelection({
    ...baseLaunchState,
    beadsMode: 'epic',
    epicId: 'quetz-a0p',
  });
  expect(selection).toMatchObject({
    beadsMode: 'epic',
    epicId: 'quetz-a0p',
  });
});
```

- [ ] **Step 2: Run the CLI and launch tests to verify they fail**

Run: `npm test -- src/test/cli.test.ts src/test/ui-launch-app.test.ts src/test/config.test.ts`

Expected: FAIL because `runLoop()` has no `scope` option, config does not know about epic defaults, and the CLI does not parse `--epic`.

- [ ] **Step 3: Extend config shape with an optional beads scope default**

```ts
export interface QuetzConfig {
  github: {
    owner: string;
    repo: string;
    defaultBranch: string;
    automergeLabel: string;
  };
  agent: AgentConfig;
  beads?: {
    epic?: string;
  };
  poll: {
    interval: number;
    mergeTimeout: number;
    prDetectionTimeout: number;
  };
  display: {
    animations: boolean;
    colors: boolean;
  };
}

const beads = (obj['beads'] as Record<string, unknown> | undefined) ?? {};

return {
  github: {
    owner: owner.trim(),
    repo: (repo as string).trim(),
    defaultBranch:
      typeof github['defaultBranch'] === 'string'
        ? github['defaultBranch']
        : DEFAULTS.github.defaultBranch,
    automergeLabel:
      typeof github['automergeLabel'] === 'string'
        ? github['automergeLabel']
        : DEFAULTS.github.automergeLabel,
  },
  agent: {
    provider,
    timeout:
      typeof agent['timeout'] === 'number'
        ? agent['timeout']
        : DEFAULTS.agent.timeout,
    model:
      typeof agent['model'] === 'string'
        ? agent['model']
        : DEFAULTS.agent.model,
    effort: effort as AgentEffortLevel | undefined,
    prompt: typeof agent['prompt'] === 'string' ? agent['prompt'] : undefined,
    providers: {
      claude: {
        model:
          typeof claudeProvider['model'] === 'string'
            ? claudeProvider['model']
            : undefined,
        effort: claudeEffort as AgentEffortLevel | undefined,
        settingSources:
          Array.isArray(claudeProvider['settingSources'])
            ? claudeProvider['settingSources'].filter((value): value is string => typeof value === 'string')
            : [...DEFAULT_CLAUDE_SETTING_SOURCES],
      },
      codex: {
        model:
          typeof codexProvider['model'] === 'string'
            ? codexProvider['model']
            : undefined,
        effort: codexEffort as AgentEffortLevel | undefined,
        baseUrl:
          typeof codexProvider['baseUrl'] === 'string'
            ? codexProvider['baseUrl']
            : undefined,
        approvalPolicy:
          isCodexApprovalPolicy(codexApprovalPolicy)
            ? codexApprovalPolicy
            : undefined,
        sandboxMode:
          isCodexSandboxMode(codexSandboxMode)
            ? codexSandboxMode
            : undefined,
        networkAccessEnabled:
          typeof codexProvider['networkAccessEnabled'] === 'boolean'
            ? codexProvider['networkAccessEnabled']
            : undefined,
        webSearchMode:
          isCodexWebSearchMode(codexWebSearchMode)
            ? codexWebSearchMode
            : undefined,
      },
    },
  },
  beads: {
    epic: typeof beads['epic'] === 'string' && beads['epic'].trim()
      ? beads['epic'].trim()
      : undefined,
  },
  poll: {
    interval:
      typeof poll['interval'] === 'number'
        ? poll['interval']
        : DEFAULTS.poll.interval,
    mergeTimeout:
      typeof poll['mergeTimeout'] === 'number'
        ? poll['mergeTimeout']
        : DEFAULTS.poll.mergeTimeout,
    prDetectionTimeout:
      typeof poll['prDetectionTimeout'] === 'number'
        ? poll['prDetectionTimeout']
        : DEFAULTS.poll.prDetectionTimeout,
  },
  display: {
    animations:
      typeof display['animations'] === 'boolean'
        ? display['animations']
        : DEFAULTS.display.animations,
    colors:
      typeof display['colors'] === 'boolean'
        ? display['colors']
        : DEFAULTS.display.colors,
  },
};
```

- [ ] **Step 4: Parse `--epic` and normalize runtime scope in `src/cli.ts`**

```ts
const epicIdx = args.indexOf('--epic');
let epicId: string | undefined;
if (epicIdx !== -1) {
  const value = args[epicIdx + 1];
  if (!value) {
    process.stderr.write('Error: --epic requires a value.\n');
    process.exit(EXIT_FAILURE);
  }
  epicId = value.trim();
}

function resolveRunScope(config: QuetzConfig, explicitEpicId?: string, launchSelection?: LaunchSelection) {
  if (explicitEpicId) return { mode: 'epic', epicId: explicitEpicId } as const;
  if (launchSelection?.beadsMode === 'epic' && launchSelection.epicId) {
    return { mode: 'epic', epicId: launchSelection.epicId } as const;
  }
  if (config.beads?.epic) return { mode: 'epic', epicId: config.beads.epic } as const;
  return { mode: 'all' } as const;
}
```

- [ ] **Step 5: Remove the launch-screen "coming soon" label and keep epic entry active**

```ts
const beadsOptions = [
  { value: 'all', label: 'all' },
  { value: 'epic', label: 'epic' },
];

ui.textarea({
  id: 'launch-epic-id',
  disabled: state.beadsMode !== 'epic',
  focusable: state.beadsMode === 'epic',
  placeholder: 'enter_epic_id...',
  onInput: value => app.update(prev => ({ ...prev, epicId: value })),
});
```

- [ ] **Step 6: Forward the normalized scope to `runLoop()`**

```ts
const config = loadConfig();
const scope = resolveRunScope(config, epicId, launchSelection ?? undefined);

const result = await runLoop({
  provider,
  model,
  effort,
  timeout,
  localCommits,
  amend,
  simulate,
  customPrompt,
  scope,
}, bus);
```

- [ ] **Step 7: Run the CLI/config/launch tests to verify they pass**

Run: `npm test -- src/test/cli.test.ts src/test/ui-launch-app.test.ts src/test/config.test.ts`

Expected: PASS with `--epic`, config defaulting, and launch epic mode wired.

- [ ] **Step 8: Commit the runtime scope plumbing**

```bash
git add src/config.ts src/cli.ts src/ui/LaunchApp.tsx src/test/cli.test.ts src/test/ui-launch-app.test.ts src/test/config.test.ts
git commit -m "feat: thread beads scope through cli and launch"
```

### Task 3: Add Loop Validation, Accurate Totals, and Dependency Context Logging

**Files:**
- Modify: `src/loop.ts`
- Modify: `src/events.ts`
- Modify: `src/ui/state.ts`
- Test: `src/test/loop.test.ts`
- Test: `src/test/ui-state.test.ts`

- [ ] **Step 1: Write the failing loop/state tests**

```ts
it('emits loop:start with the scoped open total instead of ready length', async () => {
  mockCountOpenIssues.mockReturnValue(8);
  mockGetReadyIssues
    .mockReturnValueOnce([baseIssue])
    .mockReturnValueOnce([]);

  const bus = createBus();
  const startHandler = vi.fn();
  bus.on('loop:start', startHandler);

  await runLoop({ scope: { mode: 'all' } }, bus);

  expect(startHandler).toHaveBeenCalledWith({ total: 8 });
});

it('fails with exitCode 2 when epic validation reports errors', async () => {
  mockGetIssueDetails.mockReturnValue({ ...baseIssue, issue_type: 'epic' } as never);
  mockValidateEpicGraph.mockReturnValue({
    errors: ['error: inverted chain'],
    warnings: [],
    info: [],
  });

  const result = await runLoop({ scope: { mode: 'epic', epicId: 'quetz-a0p' } }, createBus());
  expect(result).toEqual({ exitCode: 2, reason: 'error' });
});
```

```ts
it('adds dependency summary warnings and info into the log rail', () => {
  bus.emit('loop:warning', { message: 'scope: 2 done  1 active  1 ready  4 blocked' });
  expect(state.logLines.at(-1)?.text).toContain('scope: 2 done');
});
```

- [ ] **Step 2: Run the loop/state tests to verify they fail**

Run: `npm test -- src/test/loop.test.ts src/test/ui-state.test.ts`

Expected: FAIL because `runLoop()` has no scoped validation path, still derives totals from ready issues, and the UI state has no dependency-context log coverage.

- [ ] **Step 3: Update `runLoop()` options and add startup validation**

```ts
export async function runLoop(
  opts: {
    provider?: AgentProvider;
    model?: string;
    effort?: AgentEffortLevel;
    timeout?: number;
    localCommits?: boolean;
    amend?: boolean;
    simulate?: boolean;
    customPrompt?: string;
    scope?: BeadsScope;
  },
  bus?: QuetzBus
): Promise<LoopResult> {
  const scope = opts.scope ?? { mode: 'all' };

  if (!simulate) {
    const cycles = getDependencyCycles();
    if (cycles.length > 0) {
      bus?.emit('loop:failure', { reason: `Dependency cycles detected: ${JSON.stringify(cycles)}` });
      return { exitCode: 2, reason: 'error' };
    }

    if (scope.mode === 'epic') {
      const epic = getIssueDetails(scope.epicId);
      assertEpicIssue(epic, scope.epicId);
      const validation = validateEpicGraph(scope.epicId);
      for (const line of [...validation.info, ...validation.warnings]) {
        bus?.emit('loop:warning', { message: line });
      }
      if (validation.errors.length > 0) {
        bus?.emit('loop:failure', { reason: validation.errors.join(' | ') });
        return { exitCode: 2, reason: 'error' };
      }
    }
  }
```

- [ ] **Step 4: Replace ready-length totals with scoped open totals**

```ts
let loopStartEmitted = false;
let currentTotal = 0;

while (true) {
  currentTotal = simulate
    ? issues.length + totalIssuesCompleted
    : countOpenIssues(scope);

  issues = getReadyIssues(scope);

  if (!loopStartEmitted && bus && currentTotal > 0) {
    bus.emit('loop:start', { total: currentTotal });
    loopStartEmitted = true;
  }

  const issueTotal = currentTotal;
  bus?.emit('loop:issue_pickup', {
    id: issue.id,
    title: issue.title,
    priority: issue.priority,
    type: issue.issue_type,
    iteration,
    total: issueTotal,
  });
```

- [ ] **Step 5: Emit dependency-context log lines after pickup**

```ts
function emitScopeSummary(scope: BeadsScope, bus?: QuetzBus): void {
  if (!bus) return;
  try {
    if (scope.mode === 'epic') {
      const summary = getEpicScopeSummary(scope.epicId);
      bus.emit('loop:warning', {
        message: `scope: ${summary.done ?? 0} done  ${summary.active ?? 0} active  ${summary.ready ?? 0} ready  ${summary.blocked ?? 0} blocked`,
      });
      return;
    }

    const ready = getReadyIssues(scope).length;
    const open = countOpenIssues(scope);
    bus.emit('loop:warning', { message: `ready: ${ready}  open: ${open}` });
  } catch (err) {
    bus.emit('loop:warning', { message: `Dependency summary unavailable: ${(err as Error).message}` });
  }
}
```

- [ ] **Step 6: Keep state wiring simple by treating summary lines as log warnings**

```ts
const onWarning = (p: QuetzEvent['loop:warning']) => {
  update(s => ({
    ...s,
    logLines: [...s.logLines, { icon: '!', color: c.warning, text: p.message }],
  }));
};

bus.on('loop:warning', onWarning);
bus.off('loop:warning', onWarning);
```

- [ ] **Step 7: Add explicit dependency-ordering comments and docs in the loop**

```ts
// Quetz never reorders beads work. The first item from bd ready is the only
// issue eligible to run in this iteration, even if the ready set has length 1.
const issue = issues[0];
```

- [ ] **Step 8: Run the loop/state tests to verify they pass**

Run: `npm test -- src/test/loop.test.ts src/test/ui-state.test.ts`

Expected: PASS with exit code `2` on validation failures, scoped totals, and log-rail summaries.

- [ ] **Step 9: Commit the loop validation and observability changes**

```bash
git add src/loop.ts src/events.ts src/ui/state.ts src/test/loop.test.ts src/test/ui-state.test.ts
git commit -m "feat: validate beads graphs and log scoped dependency context"
```

### Task 4: Finish Documentation, Full Regression Coverage, and Delivery Integration

**Files:**
- Modify: `README.md`
- Modify: `.quetzrc.yml`
- Modify: `src/test/loop.test.ts`
- Modify: `src/test/beads.test.ts`
- Modify: `src/test/cli.test.ts`

- [ ] **Step 1: Add failing doc-adjacent regressions for dependency ordering and epic mode**

```ts
it('re-queries scoped ready issues after each completion without reordering them', async () => {
  const issue2 = { ...baseIssue, id: 'quetz-next' };
  mockCountOpenIssues
    .mockReturnValueOnce(2)
    .mockReturnValueOnce(1)
    .mockReturnValueOnce(0);
  mockGetReadyIssues
    .mockReturnValueOnce([baseIssue])
    .mockReturnValueOnce([issue2])
    .mockReturnValueOnce([]);

  await runLoop({ scope: { mode: 'all' } }, createBus());

  expect(mockGetReadyIssues).toHaveBeenNthCalledWith(1, { mode: 'all' });
  expect(mockGetReadyIssues).toHaveBeenNthCalledWith(2, { mode: 'all' });
});
```

- [ ] **Step 2: Update README usage, flags, and dependency-ordering docs**

```md
| `--epic <id>` | — | Restrict issue pickup and counts to children of the given epic |

Dependency ordering notes:

- Quetz always defers to `bd ready` for issue ordering.
- A single ready issue in a dependency chain is normal.
- Progress totals come from open issues in scope, not the ready set.
```

- [ ] **Step 3: Document the optional config default in `.quetzrc.yml`**

```yaml
beads:
  epic: "" # optional default epic scope for non-interactive runs
```

- [ ] **Step 4: Run targeted docs-related regression tests**

Run: `npm test -- src/test/beads.test.ts src/test/cli.test.ts src/test/loop.test.ts`

Expected: PASS with final dependency-ordering and epic-scope regressions.

- [ ] **Step 5: Run the full verification suite**

Run: `npm test`

Expected: PASS with all Vitest suites green.

- [ ] **Step 6: Run the build verification**

Run: `npm run build`

Expected: PASS with TypeScript compilation succeeding and `dist/` updated.

- [ ] **Step 7: Review the final diff before landing**

Run: `git diff --stat main...HEAD`

Expected: only the planned files above, with no unrelated reversions.

- [ ] **Step 8: Commit the docs and final integration pass**

```bash
git add README.md .quetzrc.yml src/test/beads.test.ts src/test/cli.test.ts src/test/loop.test.ts
git commit -m "docs: document scoped beads runs and dependency ordering"
```
