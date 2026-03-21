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
  isMockMode: vi.fn(() => false),
}));
vi.mock('../git.js', () => ({
  checkoutDefault: vi.fn(),
  pullDefault: vi.fn(),
  countNewCommits: vi.fn(),
  getCommitCountAhead: vi.fn(),
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
vi.mock('../display/status.js', () => ({
  formatElapsed: (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  },
  updateStatusLine: vi.fn(),
  clearStatusLine: vi.fn(),
}));

import { loadConfig } from '../config.js';
import { getReadyIssues, getIssueDetails, getPrimeContext } from '../beads.js';
import { checkoutDefault, pullDefault, countNewCommits, getCommitCountAhead } from '../git.js';
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

// ── runLoop (dry-run) with bus ───────────────────────────────────────────────

describe('runLoop dry-run', () => {
  it('returns exitCode 0 with no_issues when no issues', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    const bus = createBus();
    const result = await runLoop({ dry: true }, bus);
    expect(result.exitCode).toBe(0);
    expect(result.reason).toBe('no_issues');
  });

  it('emits loop:warning when no issues', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    const bus = createBus();
    const handler = vi.fn();
    bus.on('loop:warning', handler);
    await runLoop({ dry: true }, bus);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('serpent sleeps') }));
  });

  it('returns dry_run with exitCode 0 and emits loop:dry_issues', async () => {
    const issues = [
      { ...baseIssue, id: 'quetz-1', priority: 0, issue_type: 'bug', title: 'Fix crash' },
      { ...baseIssue, id: 'quetz-2', priority: 2, issue_type: 'feature', title: 'Add logging' },
    ];
    mockGetReadyIssues.mockReturnValue(issues);
    mockGetIssueDetails.mockReturnValue(issues[0] as never);
    const bus = createBus();
    const handler = vi.fn();
    bus.on('loop:dry_issues', handler);
    const result = await runLoop({ dry: true }, bus);
    expect(result.exitCode).toBe(0);
    expect(result.reason).toBe('dry_run');
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      issues: expect.arrayContaining([
        expect.objectContaining({ id: 'quetz-1' }),
        expect.objectContaining({ id: 'quetz-2' }),
      ]),
      prompt: 'assembled prompt',
    }));
  });

  it('assembles prompt for the first issue using getIssueDetails', async () => {
    const issues = [baseIssue];
    mockGetReadyIssues.mockReturnValue(issues);
    mockGetIssueDetails.mockReturnValue({ ...baseIssue, description: 'detailed' } as never);
    const bus = createBus();
    const result = await runLoop({ dry: true }, bus);
    expect(result.exitCode).toBe(0);
    expect(mockGetIssueDetails).toHaveBeenCalledWith('quetz-abc');
    expect(mockAssemblePrompt).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'detailed' }),
      expect.any(String),
      baseConfig,
      false,
      false,
      true
    );
  });

  it('falls back to ready data if getIssueDetails fails', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    mockGetIssueDetails.mockImplementation(() => { throw new Error('bd show failed'); });
    const bus = createBus();
    await runLoop({ dry: true }, bus);
    expect(mockAssemblePrompt).toHaveBeenCalledWith(baseIssue, expect.any(String), baseConfig, false, false, true);
  });

  it('does not spawn agent, touch git, or call github in dry-run', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    const bus = createBus();
    await runLoop({ dry: true }, bus);
    expect(mockSpawnAgent).not.toHaveBeenCalled();
    expect(mockCheckoutDefault).not.toHaveBeenCalled();
    expect(mockPullDefault).not.toHaveBeenCalled();
    expect(mockFindPR).not.toHaveBeenCalled();
    expect(mockPollForMerge).not.toHaveBeenCalled();
  });

  it('returns exitCode 1 if bd ready fails in dry-run', async () => {
    mockGetReadyIssues.mockImplementation(() => { throw new Error('bd not found'); });
    const bus = createBus();
    const failHandler = vi.fn();
    bus.on('loop:failure', failHandler);
    const result = await runLoop({ dry: true }, bus);
    expect(result.exitCode).toBe(1);
    expect(result.reason).toBe('error');
    expect(failHandler).toHaveBeenCalledWith(expect.objectContaining({ reason: expect.stringContaining('bd ready failed') }));
  });

  // Non-bus fallback tests (plain text output)
  it('writes "serpent sleeps" to stdout when no bus and no issues', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    const result = await runLoop({ dry: true });
    expect(result.exitCode).toBe(0);
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => String(c[0])).join('');
    expect(output).toContain('serpent sleeps');
  });

  it('writes issue list to stdout when no bus', async () => {
    const issues = [
      { ...baseIssue, id: 'quetz-1', priority: 0, issue_type: 'bug', title: 'Fix crash' },
    ];
    mockGetReadyIssues.mockReturnValue(issues);
    mockGetIssueDetails.mockReturnValue(issues[0] as never);
    const result = await runLoop({ dry: true });
    expect(result.exitCode).toBe(0);
    expect(result.reason).toBe('dry_run');
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => String(c[0])).join('');
    expect(output).toContain('quetz-1');
    expect(output).toContain('assembled prompt');
  });
});

// ── runLoop (normal) ─────────────────────────────────────────────────────────

describe('runLoop normal', () => {
  it('returns exitCode 0 with no_issues when no issues on first iteration', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    const bus = createBus();
    const result = await runLoop({ dry: false }, bus);
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
    const result = await runLoop({ dry: false }, bus);
    expect(result.exitCode).toBe(0);
    expect(result.reason).toBe('victory');
    expect(mockGetIssueDetails).toHaveBeenCalledWith('quetz-abc');
    expect(mockAssemblePrompt).toHaveBeenCalledWith(detailedIssue, '', baseConfig, false, false, true);
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
    const result = await runLoop({ dry: false }, bus);
    expect(result.exitCode).toBe(0);
    expect(mockAssemblePrompt).toHaveBeenCalledWith(baseIssue, '', baseConfig, false, false, true);
  });

  it('returns exitCode 1 if git pull fails', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockCheckoutDefault.mockImplementation(() => { /* ok */ });
    mockPullDefault.mockImplementation(() => { throw new Error('merge conflict'); });

    const bus = createBus();
    const failHandler = vi.fn();
    bus.on('loop:failure', failHandler);
    const result = await runLoop({ dry: false }, bus);
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
    const result = await runLoop({ dry: false }, bus);
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
    const result = await runLoop({ dry: false }, bus);
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
    const result = await runLoop({ dry: false }, bus);
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
    const result = await runLoop({ dry: false }, bus);
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
    const result = await runLoop({ dry: false }, bus);
    expect(result.exitCode).toBe(0);
    expect(result.reason).toBe('victory');
    expect(victoryHandler).toHaveBeenCalledWith(expect.objectContaining({
      issuesCompleted: 1,
      prsMerged: 1,
      mode: 'pr',
    }));
  });

  it('emits loop:warning when agent exits non-zero and still attempts PR detection', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(1); // non-zero exit
    mockFindPR.mockResolvedValue(null);

    const bus = createBus();
    const warningHandler = vi.fn();
    bus.on('loop:warning', warningHandler);
    const result = await runLoop({ dry: false }, bus);
    expect(result.exitCode).toBe(1);
    expect(mockFindPR).toHaveBeenCalled();
    expect(warningHandler).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Agent exited with code 1') }));
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
    await runLoop({ dry: false }, bus);
    expect(pickupHandler).toHaveBeenCalledWith(expect.objectContaining({ id: 'quetz-abc', title: 'Add auth middleware' }));
    expect(phaseHandler).toHaveBeenCalledWith(expect.objectContaining({ phase: 'agent_running' }));
    expect(phaseHandler).toHaveBeenCalledWith(expect.objectContaining({ phase: 'pr_detecting' }));
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
    const result = await runLoop({ dry: false, localCommits: true }, bus);
    expect(result.exitCode).toBe(0);
    expect(mockFindPR).not.toHaveBeenCalled();
    expect(mockPollForMerge).not.toHaveBeenCalled();
  });

  it('does not call createOctokit when localCommits=true', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    const bus = createBus();
    await runLoop({ dry: false, localCommits: true }, bus);
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
    await runLoop({ dry: false, localCommits: true }, bus);
    expect(mockAssemblePrompt).toHaveBeenCalledWith(baseIssue, '', baseConfig, true, false, true);
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
    const result = await runLoop({ dry: false, localCommits: true }, bus);
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
    const result = await runLoop({ dry: false, localCommits: true }, bus);
    expect(result.exitCode).toBe(0);
    expect(warningHandler).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('No new commit found') }));
  });
});

// ── runLoop (amend) ──────────────────────────────────────────────────────────

describe('runLoop amend', () => {
  it('does not call findPR, pollForMerge, or createOctokit when amend=true', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    const bus = createBus();
    await runLoop({ dry: false, amend: true }, bus);
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
    await runLoop({ dry: false, amend: true }, bus);
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
    await runLoop({ dry: false, amend: true }, bus);
    expect(mockAssemblePrompt).toHaveBeenCalledWith(baseIssue, '', baseConfig, false, true, true);
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
    await runLoop({ dry: false, amend: true }, bus);
    expect(mockAssemblePrompt).toHaveBeenNthCalledWith(1, baseIssue, '', baseConfig, false, true, true);
    expect(mockAssemblePrompt).toHaveBeenNthCalledWith(2, issue2, '', baseConfig, false, true, false);
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
    await runLoop({ dry: false, amend: true }, bus);
    // Second call should still have isFirstIssue=true since first had no commit
    expect(mockAssemblePrompt).toHaveBeenNthCalledWith(2, issue2, '', baseConfig, false, true, true);
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
    const result = await runLoop({ dry: false, amend: true }, bus);
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
    const result = await runLoop({ dry: false, amend: true }, bus);
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
    const result = await runLoop({ dry: false, amend: true }, bus);
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

    await runLoop({ dry: false }, bus);

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

    await runLoop({ dry: false }, bus);

    expect(startHandler).toHaveBeenCalledTimes(1);
    expect(startHandler).toHaveBeenCalledWith({ total: 2 });
  });

  it('does not emit loop:start when there are no issues', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    const bus = createBus();
    const startHandler = vi.fn();
    bus.on('loop:start', startHandler);

    await runLoop({ dry: false }, bus);

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
    await runLoop({ dry: false }, bus);

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
    await runLoop({ dry: false, localCommits: true }, bus);

    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});
