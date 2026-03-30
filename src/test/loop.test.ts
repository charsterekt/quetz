import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBus, type QuetzBus } from '../events.js';

// Mock all external dependencies before importing the module under test
vi.mock('../config.js', () => ({
  loadConfig: vi.fn(),
}));
vi.mock('../beads.js', () => ({
  getReadyIssues: vi.fn(),
  getIssueDetails: vi.fn(),
  getPrimeContext: vi.fn(),
  listAllIssues: vi.fn(() => []),
  enableMockMode: vi.fn(),
  disableMockMode: vi.fn(),
}));
vi.mock('../git.js', () => ({
  checkoutDefault: vi.fn(),
  pullDefault: vi.fn(),
  countNewCommits: vi.fn(),
  getCommitCountAhead: vi.fn(),
  getCurrentBranch: vi.fn(),
  deleteBranch: vi.fn(),
}));
vi.mock('../prompt.js', () => ({
  assemblePrompt: vi.fn(),
}));
vi.mock('../agent.js', () => ({
  spawnAgent: vi.fn(),
}));
vi.mock('../github.js', () => ({
  createOctokit: vi.fn(),
  findPR: vi.fn(),
  pollForMerge: vi.fn(),
}));
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { loadConfig } from '../config.js';
import { getReadyIssues, getIssueDetails, getPrimeContext } from '../beads.js';
import { checkoutDefault, pullDefault, countNewCommits, getCommitCountAhead, getCurrentBranch, deleteBranch } from '../git.js';
import { assemblePrompt } from '../prompt.js';
import { spawnAgent } from '../agent.js';
import { createOctokit, findPR, pollForMerge } from '../github.js';
import { runLoop, showStatus } from '../loop.js';

const mockLoadConfig = vi.mocked(loadConfig);
const mockGetReadyIssues = vi.mocked(getReadyIssues);
const mockGetIssueDetails = vi.mocked(getIssueDetails);
const mockGetPrimeContext = vi.mocked(getPrimeContext);
const mockCheckoutDefault = vi.mocked(checkoutDefault);
const mockPullDefault = vi.mocked(pullDefault);
const mockCountNewCommits = vi.mocked(countNewCommits);
const mockGetCommitCountAhead = vi.mocked(getCommitCountAhead);
const mockGetCurrentBranch = vi.mocked(getCurrentBranch);
const mockDeleteBranch = vi.mocked(deleteBranch);
const mockAssemblePrompt = vi.mocked(assemblePrompt);
const mockSpawnAgent = vi.mocked(spawnAgent);
const mockCreateOctokit = vi.mocked(createOctokit);
const mockFindPR = vi.mocked(findPR);
const mockPollForMerge = vi.mocked(pollForMerge);

const baseConfig = {
  github: { owner: 'acme', repo: 'myapp', defaultBranch: 'main', automergeLabel: 'automerge' },
  agent: { timeout: 30 },
  poll: { interval: 30, mergeTimeout: 15, prDetectionTimeout: 60 },
  display: { animations: false, colors: false },
};

const baseIssue = {
  id: 'quetz-abc',
  title: 'Add auth middleware',
  description: 'Implement JWT auth.',
  status: 'open',
  priority: 1,
  issue_type: 'feature',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  mockLoadConfig.mockReturnValue(baseConfig as never);
  mockGetPrimeContext.mockReturnValue('');
  mockAssemblePrompt.mockReturnValue('assembled prompt');
  mockCreateOctokit.mockReturnValue({} as never);
  mockCheckoutDefault.mockReturnValue(undefined as never);
  mockPullDefault.mockReturnValue(undefined as never);
  mockCountNewCommits.mockReturnValue(1);
  mockGetCommitCountAhead.mockReturnValue(1);
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

// ── showStatus ───────────────────────────────────────────────────────────────

describe('showStatus', () => {
  it('prints status with ready issues', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    await showStatus();
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => String(c[0])).join('');
    expect(output).toContain('Quetz Status');
    expect(output).toContain('quetz-abc');
    expect(output).toContain('acme/myapp');
  });

  it('handles empty ready issues gracefully', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    await showStatus();
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => String(c[0])).join('');
    expect(output).toContain('none');
  });
});

// ── runLoop (normal) ─────────────────────────────────────────────────────────

describe('runLoop normal', () => {
  it('returns exitCode 0 with no_issues when no issues on first iteration', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    const bus = createBus();
    const result = await runLoop({}, bus);
    expect(result.exitCode).toBe(0);
    expect(result.reason).toBe('no_issues');
  });

  it('calls getIssueDetails for full issue data', async () => {
    const detailedIssue = { ...baseIssue, description: 'full details' };
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]); // second iteration → victory exit
    mockGetIssueDetails.mockReturnValue(detailedIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue({ number: 42, title: 'Fix auth', html_url: 'https://gh/pr/42' } as never);
    mockPollForMerge.mockResolvedValue({ status: 'merged', pr: { html_url: 'https://gh/pr/42' } } as never);

    const bus = createBus();
    const result = await runLoop({}, bus);
    expect(result.exitCode).toBe(0);
    expect(result.reason).toBe('victory');
    expect(mockGetIssueDetails).toHaveBeenCalledWith('quetz-abc');
    expect(mockAssemblePrompt).toHaveBeenCalledWith(detailedIssue, '', baseConfig, false, false, true, false, undefined);
  });

  it('falls back to ready data if getIssueDetails throws', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockImplementation(() => { throw new Error('show failed'); });
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue({ number: 42, title: 'Fix', html_url: 'https://gh/pr/42' } as never);
    mockPollForMerge.mockResolvedValue({ status: 'merged', pr: { html_url: 'https://gh/pr/42' } } as never);

    const bus = createBus();
    const result = await runLoop({}, bus);
    expect(result.exitCode).toBe(0);
    expect(mockAssemblePrompt).toHaveBeenCalledWith(baseIssue, '', baseConfig, false, false, true, false, undefined);
  });

  it('forwards launch customPrompt into assemblePrompt', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue({ number: 42, title: 'Fix', html_url: 'https://gh/pr/42' } as never);
    mockPollForMerge.mockResolvedValue({ status: 'merged', pr: { html_url: 'https://gh/pr/42' } } as never);

    const bus = createBus();
    const result = await runLoop({ customPrompt: 'Prefer immutable helpers.' }, bus);
    expect(result.exitCode).toBe(0);
    expect(mockAssemblePrompt).toHaveBeenCalledWith(
      baseIssue,
      '',
      baseConfig,
      false,
      false,
      true,
      false,
      'Prefer immutable helpers.',
    );
  });

  it('returns exitCode 1 if git pull fails', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockCheckoutDefault.mockImplementation(() => { /* ok */ });
    mockPullDefault.mockImplementation(() => { throw new Error('merge conflict'); });

    const bus = createBus();
    const failHandler = vi.fn();
    bus.on('loop:failure', failHandler);
    const result = await runLoop({}, bus);
    expect(result.exitCode).toBe(1);
    expect(failHandler).toHaveBeenCalledWith(expect.objectContaining({ reason: expect.stringContaining('merge conflict') }));
  });

  it('returns exitCode 1 if no PR found after agent exit', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue(null);

    const bus = createBus();
    const failHandler = vi.fn();
    bus.on('loop:failure', failHandler);
    const result = await runLoop({}, bus);
    expect(result.exitCode).toBe(1);
    expect(failHandler).toHaveBeenCalledWith(expect.objectContaining({ reason: expect.stringContaining('No PR found') }));
  });

  it('returns exitCode 1 on ci_failed merge result', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue({ number: 42, title: 'Fix', html_url: 'https://gh/pr/42' } as never);
    mockPollForMerge.mockResolvedValue({ status: 'ci_failed', details: 'tests failed', pr: { html_url: 'https://gh/pr/42' } } as never);

    const bus = createBus();
    const failHandler = vi.fn();
    bus.on('loop:failure', failHandler);
    const result = await runLoop({}, bus);
    expect(result.exitCode).toBe(1);
    expect(failHandler).toHaveBeenCalledWith(expect.objectContaining({ reason: 'CI failed', prNumber: 42 }));
  });

  it('returns exitCode 1 on closed merge result', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue({ number: 42, title: 'Fix', html_url: 'https://gh/pr/42' } as never);
    mockPollForMerge.mockResolvedValue({ status: 'closed', pr: { html_url: 'https://gh/pr/42' } } as never);

    const bus = createBus();
    const failHandler = vi.fn();
    bus.on('loop:failure', failHandler);
    const result = await runLoop({}, bus);
    expect(result.exitCode).toBe(1);
    expect(failHandler).toHaveBeenCalledWith(expect.objectContaining({ reason: expect.stringContaining('closed') }));
  });

  it('returns exitCode 1 on timeout merge result', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue({ number: 42, title: 'Fix', html_url: 'https://gh/pr/42' } as never);
    mockPollForMerge.mockResolvedValue({ status: 'timeout', pr: { html_url: 'https://gh/pr/42' } } as never);

    const bus = createBus();
    const failHandler = vi.fn();
    bus.on('loop:failure', failHandler);
    const result = await runLoop({}, bus);
    expect(result.exitCode).toBe(1);
    expect(failHandler).toHaveBeenCalledWith(expect.objectContaining({ reason: expect.stringContaining('timeout') }));
  });

  it('emits loop:victory after successful merge and no more issues', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]); // second iteration → no more issues
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue({ number: 42, title: 'Fix', html_url: 'https://gh/pr/42' } as never);
    mockPollForMerge.mockResolvedValue({ status: 'merged', pr: { html_url: 'https://gh/pr/42' } } as never);

    const bus = createBus();
    const victoryHandler = vi.fn();
    bus.on('loop:victory', victoryHandler);
    const result = await runLoop({}, bus);
    expect(result.exitCode).toBe(0);
    expect(result.reason).toBe('victory');
    expect(victoryHandler).toHaveBeenCalledWith(expect.objectContaining({
      issuesCompleted: 1,
      prsMerged: 1,
      mode: 'pr',
    }));
  });

  it('returns exitCode 1 immediately when agent exits non-zero without attempting PR detection', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(1); // non-zero exit

    const bus = createBus();
    const failHandler = vi.fn();
    bus.on('loop:failure', failHandler);
    const result = await runLoop({}, bus);
    expect(result.exitCode).toBe(1);
    expect(result.reason).toBe('error');
    expect(mockFindPR).not.toHaveBeenCalled();
    expect(failHandler).toHaveBeenCalledWith(expect.objectContaining({ reason: expect.stringContaining('Agent exited with code 1') }));
  });

  it('emits loop:issue_pickup and loop:phase events', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue({ number: 42, title: 'Fix', html_url: 'https://gh/pr/42' } as never);
    mockPollForMerge.mockResolvedValue({ status: 'merged', pr: { html_url: 'https://gh/pr/42' } } as never);

    const bus = createBus();
    const pickupHandler = vi.fn();
    const phaseHandler = vi.fn();
    bus.on('loop:issue_pickup', pickupHandler);
    bus.on('loop:phase', phaseHandler);
    await runLoop({}, bus);
    expect(pickupHandler).toHaveBeenCalledWith(expect.objectContaining({ id: 'quetz-abc', title: 'Add auth middleware' }));
    expect(phaseHandler).toHaveBeenCalledWith(expect.objectContaining({ phase: 'agent_running' }));
    expect(phaseHandler).toHaveBeenCalledWith(expect.objectContaining({ phase: 'pr_detecting' }));
  });

  it('forwards effort to the agent and agent_running event', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue({ number: 42, title: 'Fix', html_url: 'https://gh/pr/42' } as never);
    mockPollForMerge.mockResolvedValue({ status: 'merged', pr: { html_url: 'https://gh/pr/42' } } as never);

    const bus = createBus();
    const phaseHandler = vi.fn();
    bus.on('loop:phase', phaseHandler);

    await runLoop({effort: 'medium' }, bus);

    expect(mockSpawnAgent).toHaveBeenCalledWith(
      'assembled prompt',
      expect.any(String),
      30,
      'sonnet',
      bus,
      'medium',
      false,
      'claude',
      expect.any(Object),
    );
    expect(phaseHandler).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'agent_running',
      agentProvider: 'claude',
      agentModel: 'sonnet',
      agentEffort: 'medium',
    }));
  });
});

// ── runLoop (local-commits) ──────────────────────────────────────────────────

describe('runLoop local-commits', () => {
  it('does not call findPR or pollForMerge when localCommits=true', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockCountNewCommits.mockReturnValue(1);

    const bus = createBus();
    const result = await runLoop({localCommits: true }, bus);
    expect(result.exitCode).toBe(0);
    expect(mockFindPR).not.toHaveBeenCalled();
    expect(mockPollForMerge).not.toHaveBeenCalled();
  });

  it('does not call createOctokit when localCommits=true', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    const bus = createBus();
    await runLoop({localCommits: true }, bus);
    expect(mockCreateOctokit).not.toHaveBeenCalled();
  });

  it('passes localCommits=true to assemblePrompt', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockCountNewCommits.mockReturnValue(1);

    const bus = createBus();
    await runLoop({localCommits: true }, bus);
    expect(mockAssemblePrompt).toHaveBeenCalledWith(baseIssue, '', baseConfig, true, false, true, false, undefined);
  });

  it('emits loop:commit_landed when agent commits', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockCountNewCommits.mockReturnValue(2);

    const bus = createBus();
    const commitHandler = vi.fn();
    bus.on('loop:commit_landed', commitHandler);
    const result = await runLoop({localCommits: true }, bus);
    expect(result.exitCode).toBe(0);
    expect(result.reason).toBe('victory');
    expect(commitHandler).toHaveBeenCalledWith(expect.objectContaining({ issueId: 'quetz-abc' }));
  });

  it('emits loop:warning when no new commit found', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockCountNewCommits.mockReturnValue(0);

    const bus = createBus();
    const warningHandler = vi.fn();
    bus.on('loop:warning', warningHandler);
    const result = await runLoop({localCommits: true }, bus);
    expect(result.exitCode).toBe(0);
    expect(warningHandler).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('No new commit found') }));
  });
});

// ── runLoop (amend) ──────────────────────────────────────────────────────────

describe('runLoop amend', () => {
  it('does not call findPR, pollForMerge, or createOctokit when amend=true', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    const bus = createBus();
    await runLoop({amend: true }, bus);
    expect(mockCreateOctokit).not.toHaveBeenCalled();
    expect(mockFindPR).not.toHaveBeenCalled();
    expect(mockPollForMerge).not.toHaveBeenCalled();
  });

  it('does not call checkoutDefault or pullDefault when amend=true', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockGetCommitCountAhead.mockReturnValue(1);

    const bus = createBus();
    await runLoop({amend: true }, bus);
    expect(mockCheckoutDefault).not.toHaveBeenCalled();
    expect(mockPullDefault).not.toHaveBeenCalled();
  });

  it('passes amend=true and isFirstIssue=true to assemblePrompt on first issue', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockGetCommitCountAhead.mockReturnValue(1);

    const bus = createBus();
    await runLoop({amend: true }, bus);
    expect(mockAssemblePrompt).toHaveBeenCalledWith(baseIssue, '', baseConfig, false, true, true, false, undefined);
  });

  it('passes isFirstIssue=false to assemblePrompt on second issue after commit', async () => {
    const issue2 = { ...baseIssue, id: 'quetz-xyz' };
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([issue2])
      .mockReturnValueOnce([]);
    mockGetIssueDetails
      .mockReturnValueOnce(baseIssue as never)
      .mockReturnValueOnce(issue2 as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockGetCommitCountAhead.mockReturnValue(1); // commit found each time

    const bus = createBus();
    await runLoop({amend: true }, bus);
    expect(mockAssemblePrompt).toHaveBeenNthCalledWith(1, baseIssue, '', baseConfig, false, true, true, false, undefined);
    expect(mockAssemblePrompt).toHaveBeenNthCalledWith(2, issue2, '', baseConfig, false, true, false, false, undefined);
  });

  it('keeps isFirstIssue=true when agent makes no commit', async () => {
    const issue2 = { ...baseIssue, id: 'quetz-xyz' };
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([issue2])
      .mockReturnValueOnce([]);
    mockGetIssueDetails
      .mockReturnValueOnce(baseIssue as never)
      .mockReturnValueOnce(issue2 as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockGetCommitCountAhead
      .mockReturnValueOnce(0)  // first issue: no commit
      .mockReturnValueOnce(1); // second issue: commit found

    const bus = createBus();
    await runLoop({amend: true }, bus);
    // Second call should still have isFirstIssue=true since first had no commit
    expect(mockAssemblePrompt).toHaveBeenNthCalledWith(2, issue2, '', baseConfig, false, true, true, false, undefined);
  });

  it('emits loop:warning when agent creates multiple commits', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockGetCommitCountAhead.mockReturnValue(3);

    const bus = createBus();
    const warningHandler = vi.fn();
    bus.on('loop:warning', warningHandler);
    const result = await runLoop({amend: true }, bus);
    expect(result.exitCode).toBe(0);
    expect(warningHandler).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('3 commits found') }));
  });

  it('emits loop:amend_complete after single commit', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockGetCommitCountAhead.mockReturnValue(1);

    const bus = createBus();
    const amendHandler = vi.fn();
    bus.on('loop:amend_complete', amendHandler);
    const result = await runLoop({amend: true }, bus);
    expect(result.exitCode).toBe(0);
    expect(amendHandler).toHaveBeenCalledWith(expect.objectContaining({ issueId: 'quetz-abc' }));
  });

  it('emits loop:victory with amend mode', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockGetCommitCountAhead.mockReturnValue(1);

    const bus = createBus();
    const victoryHandler = vi.fn();
    bus.on('loop:victory', victoryHandler);
    const result = await runLoop({amend: true }, bus);
    expect(result.exitCode).toBe(0);
    expect(victoryHandler).toHaveBeenCalledWith(expect.objectContaining({ mode: 'amend' }));
  });
});

// ── quetz-qmq: loop:start emitted on first issue fetch ────────────────────────

describe('runLoop loop:start event (quetz-qmq)', () => {
  it('emits loop:start with total count before first issue_pickup', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue({ number: 42, title: 'Fix', html_url: 'https://gh/pr/42' } as never);
    mockPollForMerge.mockResolvedValue({ status: 'merged', pr: { html_url: 'https://gh/pr/42' } } as never);

    const bus = createBus();
    const startHandler = vi.fn();
    const pickupHandler = vi.fn();
    bus.on('loop:start', startHandler);
    bus.on('loop:issue_pickup', pickupHandler);

    await runLoop({}, bus);

    expect(startHandler).toHaveBeenCalledTimes(1);
    expect(startHandler).toHaveBeenCalledWith({ total: 1 });
    // loop:start fires before loop:issue_pickup
    const startOrder = startHandler.mock.invocationCallOrder[0];
    const pickupOrder = pickupHandler.mock.invocationCallOrder[0];
    expect(startOrder).toBeLessThan(pickupOrder);
  });

  it('emits loop:start only once even across multiple iterations', async () => {
    const issue2 = { ...baseIssue, id: 'quetz-xyz' };
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue, issue2])
      .mockReturnValueOnce([issue2])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue({ number: 42, title: 'Fix', html_url: 'https://gh/pr/42' } as never);
    mockPollForMerge.mockResolvedValue({ status: 'merged', pr: { html_url: 'https://gh/pr/42' } } as never);

    const bus = createBus();
    const startHandler = vi.fn();
    bus.on('loop:start', startHandler);

    await runLoop({}, bus);

    expect(startHandler).toHaveBeenCalledTimes(1);
    expect(startHandler).toHaveBeenCalledWith({ total: 2 });
  });

  it('does not emit loop:start when there are no issues', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    const bus = createBus();
    const startHandler = vi.fn();
    bus.on('loop:start', startHandler);

    await runLoop({}, bus);

    expect(startHandler).not.toHaveBeenCalled();
  });
});

// ── quetz-3nd: no stdout writes during polling when bus is present ─────────────

describe('runLoop no stdout corruption in TUI mode (quetz-3nd)', () => {
  it('does not write to stdout during PR polling when bus is provided', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue({ number: 42, title: 'Fix', html_url: 'https://gh/pr/42' } as never);
    mockPollForMerge.mockResolvedValue({ status: 'merged', pr: { html_url: 'https://gh/pr/42' } } as never);

    const bus = createBus();
    await runLoop({}, bus);

    // stdout should not be written when bus is provided (Ink handles output)
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('does not write to stdout during local-commits path when bus is provided', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockCountNewCommits.mockReturnValue(1);

    const bus = createBus();
    await runLoop({localCommits: true }, bus);

    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});

// ── loop:mode event ───────────────────────────────────────────────────────────

describe('runLoop loop:mode event', () => {
  it('emits loop:mode pr for default run', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    const bus = createBus();
    const modeHandler = vi.fn();
    bus.on('loop:mode', modeHandler);
    await runLoop({}, bus);
    expect(modeHandler).toHaveBeenCalledWith({ mode: 'pr' });
  });

  it('emits loop:mode commit for --local-commits', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    const bus = createBus();
    const modeHandler = vi.fn();
    bus.on('loop:mode', modeHandler);
    await runLoop({localCommits: true }, bus);
    expect(modeHandler).toHaveBeenCalledWith({ mode: 'commit' });
  });

  it('emits loop:mode amend for --amend', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    const bus = createBus();
    const modeHandler = vi.fn();
    bus.on('loop:mode', modeHandler);
    await runLoop({amend: true }, bus);
    expect(modeHandler).toHaveBeenCalledWith({ mode: 'amend' });
  });

});

// ── runLoop (simulate) ────────────────────────────────────────────────────────

describe('runLoop simulate', () => {
  it('simulate+localCommits: emits loop:commit_landed and advances without PR', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockGetCurrentBranch.mockReturnValue('main');

    const bus = createBus();
    const commitHandler = vi.fn();
    const prFoundHandler = vi.fn();
    bus.on('loop:commit_landed', commitHandler);
    bus.on('loop:pr_found', prFoundHandler);

    const result = await runLoop({simulate: true, localCommits: true }, bus);
    expect(result.exitCode).toBe(0);
    expect(result.reason).toBe('victory');
    expect(commitHandler).toHaveBeenCalledWith(expect.objectContaining({ issueId: 'quetz-abc' }));
    expect(prFoundHandler).not.toHaveBeenCalled();
    expect(mockFindPR).not.toHaveBeenCalled();
  });

  it('simulate+localCommits: emits loop:mode commit', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    mockGetCurrentBranch.mockReturnValue('main');

    const bus = createBus();
    const modeHandler = vi.fn();
    bus.on('loop:mode', modeHandler);

    await runLoop({simulate: true, localCommits: true }, bus);
    expect(modeHandler).toHaveBeenCalledWith({ mode: 'commit' });
  });

  it('simulate+amend: emits loop:amend_complete and advances without PR', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockGetCurrentBranch.mockReturnValue('main');

    const bus = createBus();
    const amendHandler = vi.fn();
    const prFoundHandler = vi.fn();
    bus.on('loop:amend_complete', amendHandler);
    bus.on('loop:pr_found', prFoundHandler);

    const result = await runLoop({simulate: true, amend: true }, bus);
    expect(result.exitCode).toBe(0);
    expect(result.reason).toBe('victory');
    expect(amendHandler).toHaveBeenCalledWith(expect.objectContaining({ issueId: 'quetz-abc' }));
    expect(prFoundHandler).not.toHaveBeenCalled();
    expect(mockFindPR).not.toHaveBeenCalled();
  });

  it('simulate+amend: emits loop:mode amend', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    mockGetCurrentBranch.mockReturnValue('main');

    const bus = createBus();
    const modeHandler = vi.fn();
    bus.on('loop:mode', modeHandler);

    await runLoop({simulate: true, amend: true }, bus);
    expect(modeHandler).toHaveBeenCalledWith({ mode: 'amend' });
  });

  it('simulate alone (no --local-commits/--amend): emits loop:pr_found and loop:merged', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockGetCurrentBranch.mockReturnValue('main');

    const bus = createBus();
    const prFoundHandler = vi.fn();
    const mergedHandler = vi.fn();
    bus.on('loop:pr_found', prFoundHandler);
    bus.on('loop:merged', mergedHandler);

    const result = await runLoop({simulate: true }, bus);
    expect(result.exitCode).toBe(0);
    expect(result.reason).toBe('victory');
    expect(prFoundHandler).toHaveBeenCalled();
    expect(mergedHandler).toHaveBeenCalled();
  }, 15000);

  it('simulate does not switch away from the branch it launched on when no temp branch was created', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockGetCurrentBranch
      .mockReturnValueOnce('quetz-7kh/rezi-migration')
      .mockReturnValueOnce('quetz-7kh/rezi-migration');

    const bus = createBus();
    const result = await runLoop({ simulate: true }, bus);

    expect(result.exitCode).toBe(0);
    expect(mockCheckoutDefault).not.toHaveBeenCalled();
    expect(mockDeleteBranch).not.toHaveBeenCalled();
  }, 15000);

  it('simulate+localCommits: does not call createOctokit', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    mockGetCurrentBranch.mockReturnValue('main');

    const bus = createBus();
    await runLoop({simulate: true, localCommits: true }, bus);
    expect(mockCreateOctokit).not.toHaveBeenCalled();
  });

  it('simulate+amend: does not call createOctokit', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    mockGetCurrentBranch.mockReturnValue('main');

    const bus = createBus();
    await runLoop({simulate: true, amend: true }, bus);
    expect(mockCreateOctokit).not.toHaveBeenCalled();
  });

  it('simulate+localCommits victory reports commit mode', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockGetCurrentBranch.mockReturnValue('main');

    const bus = createBus();
    const victoryHandler = vi.fn();
    bus.on('loop:victory', victoryHandler);

    await runLoop({simulate: true, localCommits: true }, bus);
    expect(victoryHandler).toHaveBeenCalledWith(expect.objectContaining({ mode: 'commit' }));
  });

  it('simulate+amend victory reports amend mode', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockGetCurrentBranch.mockReturnValue('main');

    const bus = createBus();
    const victoryHandler = vi.fn();
    bus.on('loop:victory', victoryHandler);

    await runLoop({simulate: true, amend: true }, bus);
    expect(victoryHandler).toHaveBeenCalledWith(expect.objectContaining({ mode: 'amend' }));
  });
});
