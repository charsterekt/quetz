import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all external dependencies before importing the module under test
vi.mock('../config.js', () => ({
  loadConfig: vi.fn(),
}));
vi.mock('../beads.js', () => ({
  getReadyIssues: vi.fn(),
  getIssueDetails: vi.fn(),
  getPrimeContext: vi.fn(),
}));
vi.mock('../git.js', () => ({
  checkoutDefault: vi.fn(),
  pullDefault: vi.fn(),
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
import { checkoutDefault, pullDefault } from '../git.js';
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

let exitSpy: ReturnType<typeof vi.spyOn>;
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
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => { throw new Error(`process.exit(${code})`); });
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  exitSpy.mockRestore();
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

// ── runLoop (dry-run) ────────────────────────────────────────────────────────

describe('runLoop dry-run', () => {
  it('exits 0 with "serpent sleeps" when no issues', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    await expect(runLoop({ dry: true })).rejects.toThrow('process.exit(0)');
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => String(c[0])).join('');
    expect(output).toContain('serpent sleeps');
  });

  it('prints full issue list in priority order', async () => {
    const issues = [
      { ...baseIssue, id: 'quetz-1', priority: 0, issue_type: 'bug', title: 'Fix crash' },
      { ...baseIssue, id: 'quetz-2', priority: 2, issue_type: 'feature', title: 'Add logging' },
    ];
    mockGetReadyIssues.mockReturnValue(issues);
    mockGetIssueDetails.mockReturnValue(issues[0] as never);
    await expect(runLoop({ dry: true })).rejects.toThrow('process.exit(0)');
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => String(c[0])).join('');
    expect(output).toContain('quetz-1');
    expect(output).toContain('quetz-2');
    expect(output).toContain('[P0]');
    expect(output).toContain('[P2]');
    expect(output).toContain('[bug]');
    expect(output).toContain('[feature]');
    expect(output).toContain('Fix crash');
    expect(output).toContain('Add logging');
  });

  it('assembles prompt for the first issue using getIssueDetails', async () => {
    const issues = [baseIssue];
    mockGetReadyIssues.mockReturnValue(issues);
    mockGetIssueDetails.mockReturnValue({ ...baseIssue, description: 'detailed' } as never);
    await expect(runLoop({ dry: true })).rejects.toThrow('process.exit(0)');
    expect(mockGetIssueDetails).toHaveBeenCalledWith('quetz-abc');
    expect(mockAssemblePrompt).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'detailed' }),
      expect.any(String),
      baseConfig
    );
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => String(c[0])).join('');
    expect(output).toContain('assembled prompt');
  });

  it('falls back to ready data if getIssueDetails fails', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    mockGetIssueDetails.mockImplementation(() => { throw new Error('bd show failed'); });
    await expect(runLoop({ dry: true })).rejects.toThrow('process.exit(0)');
    expect(mockAssemblePrompt).toHaveBeenCalledWith(baseIssue, expect.any(String), baseConfig);
  });

  it('does not spawn agent, touch git, or call github in dry-run', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    await expect(runLoop({ dry: true })).rejects.toThrow('process.exit(0)');
    expect(mockSpawnAgent).not.toHaveBeenCalled();
    expect(mockCheckoutDefault).not.toHaveBeenCalled();
    expect(mockPullDefault).not.toHaveBeenCalled();
    expect(mockFindPR).not.toHaveBeenCalled();
    expect(mockPollForMerge).not.toHaveBeenCalled();
  });

  it('exits 1 if bd ready fails in dry-run', async () => {
    mockGetReadyIssues.mockImplementation(() => { throw new Error('bd not found'); });
    await expect(runLoop({ dry: true })).rejects.toThrow('process.exit(1)');
    const errOutput = stderrSpy.mock.calls.map((c: Parameters<typeof process.stderr.write>) => String(c[0])).join('');
    expect(errOutput).toContain('bd ready failed');
  });
});

// ── runLoop (normal) ─────────────────────────────────────────────────────────

describe('runLoop normal', () => {
  it('exits 0 with "serpent sleeps" when no issues on first iteration', async () => {
    mockGetReadyIssues.mockReturnValue([]);
    await expect(runLoop({ dry: false })).rejects.toThrow('process.exit(0)');
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => String(c[0])).join('');
    expect(output).toContain('serpent sleeps');
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

    await expect(runLoop({ dry: false })).rejects.toThrow('process.exit(0)');
    expect(mockGetIssueDetails).toHaveBeenCalledWith('quetz-abc');
    expect(mockAssemblePrompt).toHaveBeenCalledWith(detailedIssue, '', baseConfig);
  });

  it('falls back to ready data if getIssueDetails throws', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]);
    mockGetIssueDetails.mockImplementation(() => { throw new Error('show failed'); });
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue({ number: 42, title: 'Fix', html_url: 'https://gh/pr/42' } as never);
    mockPollForMerge.mockResolvedValue({ status: 'merged', pr: { html_url: 'https://gh/pr/42' } } as never);

    await expect(runLoop({ dry: false })).rejects.toThrow('process.exit(0)');
    expect(mockAssemblePrompt).toHaveBeenCalledWith(baseIssue, '', baseConfig);
  });

  it('exits 1 if git pull fails', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockCheckoutDefault.mockImplementation(() => { /* ok */ });
    mockPullDefault.mockImplementation(() => { throw new Error('merge conflict'); });

    await expect(runLoop({ dry: false })).rejects.toThrow('process.exit(1)');
    const errOutput = stderrSpy.mock.calls.map((c: Parameters<typeof process.stderr.write>) => String(c[0])).join('');
    expect(errOutput).toContain('merge conflict');
  });

  it('exits 1 if no PR found after agent exit', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue(null);

    await expect(runLoop({ dry: false })).rejects.toThrow('process.exit(1)');
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => String(c[0])).join('');
    expect(output).toContain('No PR found');
  });

  it('exits 1 on ci_failed merge result', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue({ number: 42, title: 'Fix', html_url: 'https://gh/pr/42' } as never);
    mockPollForMerge.mockResolvedValue({ status: 'ci_failed', details: 'tests failed', pr: { html_url: 'https://gh/pr/42' } } as never);

    await expect(runLoop({ dry: false })).rejects.toThrow('process.exit(1)');
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => String(c[0])).join('');
    expect(output).toContain('CI failed');
  });

  it('exits 1 on closed merge result', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue({ number: 42, title: 'Fix', html_url: 'https://gh/pr/42' } as never);
    mockPollForMerge.mockResolvedValue({ status: 'closed', pr: { html_url: 'https://gh/pr/42' } } as never);

    await expect(runLoop({ dry: false })).rejects.toThrow('process.exit(1)');
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => String(c[0])).join('');
    expect(output).toContain('closed without merging');
  });

  it('exits 1 on timeout merge result', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue({ number: 42, title: 'Fix', html_url: 'https://gh/pr/42' } as never);
    mockPollForMerge.mockResolvedValue({ status: 'timeout', pr: { html_url: 'https://gh/pr/42' } } as never);

    await expect(runLoop({ dry: false })).rejects.toThrow('process.exit(1)');
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => String(c[0])).join('');
    expect(output).toContain('timeout');
  });

  it('continues loop after successful merge', async () => {
    mockGetReadyIssues
      .mockReturnValueOnce([baseIssue])
      .mockReturnValueOnce([]); // second iteration → no more issues
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(0);
    mockFindPR.mockResolvedValue({ number: 42, title: 'Fix', html_url: 'https://gh/pr/42' } as never);
    mockPollForMerge.mockResolvedValue({ status: 'merged', pr: { html_url: 'https://gh/pr/42' } } as never);

    await expect(runLoop({ dry: false })).rejects.toThrow('process.exit(0)');
    expect(mockGetReadyIssues).toHaveBeenCalledTimes(2);
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => String(c[0])).join('');
    expect(output).toContain('QUETZ VICTORY');
  });

  it('still attempts PR detection even when agent exits non-zero', async () => {
    mockGetReadyIssues.mockReturnValue([baseIssue]);
    mockGetIssueDetails.mockReturnValue(baseIssue as never);
    mockSpawnAgent.mockResolvedValue(1); // non-zero exit
    mockFindPR.mockResolvedValue(null);

    await expect(runLoop({ dry: false })).rejects.toThrow('process.exit(1)');
    expect(mockFindPR).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => String(c[0])).join('');
    expect(output).toContain('Agent exited with code 1');
  });
});
