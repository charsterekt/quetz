import { describe, it, expect, vi } from 'vitest';

// Minimal Octokit mock
function makeOctokit(prs: object[] = [], checks: object[] = []) {
  return {
    pulls: {
      list: vi.fn().mockResolvedValue({ data: prs }),
      get: vi.fn().mockResolvedValue({ data: prs[0] ?? {} }),
    },
    checks: {
      listForRef: vi.fn().mockResolvedValue({ data: { check_runs: checks } }),
    },
  };
}

function makePR(overrides: Record<string, unknown> = {}) {
  return {
    number: 42,
    title: 'feat: add auth (bd-001)',
    html_url: 'https://github.com/owner/repo/pull/42',
    state: 'open',
    merged_at: null,
    head: { ref: 'feat/bd-001' },
    body: 'Resolves bd-001',
    created_at: new Date(Date.now() - 1000).toISOString(),
    ...overrides,
  };
}

describe('findPR', () => {
  it('returns PR when issueId found in title', async () => {
    const { findPR } = await import('../github.js');
    const octokit = makeOctokit([makePR()]);
    const spawnTime = new Date(Date.now() - 5000);
    const pr = await findPR(octokit as never, 'owner', 'repo', 'bd-001', spawnTime, 10, 100);
    expect(pr).not.toBeNull();
    expect(pr!.number).toBe(42);
  });

  it('returns PR when issueId found in branch name', async () => {
    const { findPR } = await import('../github.js');
    const octokit = makeOctokit([makePR({ title: 'no match', body: '' })]);
    const spawnTime = new Date(Date.now() - 5000);
    const pr = await findPR(octokit as never, 'owner', 'repo', 'bd-001', spawnTime, 10, 100);
    expect(pr!.number).toBe(42);
  });

  it('returns null when no PR references issueId', async () => {
    const { findPR } = await import('../github.js');
    const octokit = makeOctokit([makePR({ title: 'unrelated', body: '', head: { ref: 'unrelated' } })]);
    const spawnTime = new Date(Date.now() - 5000);
    const pr = await findPR(octokit as never, 'owner', 'repo', 'bd-999', spawnTime, 0, 100);
    expect(pr).toBeNull();
  });

  it('ignores PRs created before spawnTime', async () => {
    const { findPR } = await import('../github.js');
    const oldPR = makePR({ created_at: new Date(Date.now() - 10000).toISOString() });
    const octokit = makeOctokit([oldPR]);
    const spawnTime = new Date(); // now — PR is in the past
    const pr = await findPR(octokit as never, 'owner', 'repo', 'bd-001', spawnTime, 0, 100);
    expect(pr).toBeNull();
  });
});

describe('pollForMerge', () => {
  const baseConfig = {
    github: { owner: 'o', repo: 'r', defaultBranch: 'main', automergeLabel: 'automerge' },
    agent: { timeout: 30 },
    poll: { interval: 0.001, mergeTimeout: 1, prDetectionTimeout: 60 }, // tiny values for tests
    display: { animations: false, colors: false },
  };

  it('returns merged when PR is merged', async () => {
    const { pollForMerge } = await import('../github.js');
    const mergedPR = { ...makePR(), merged_at: new Date().toISOString(), merged: true, state: 'closed' };
    const octokit = makeOctokit([], []);
    octokit.pulls.get.mockResolvedValue({ data: mergedPR });
    const result = await pollForMerge(octokit as never, 'o', 'r', 42, baseConfig);
    expect(result.status).toBe('merged');
  });

  it('returns closed when PR is closed without merge', async () => {
    const { pollForMerge } = await import('../github.js');
    const closedPR = { ...makePR(), merged_at: null, merged: false, state: 'closed' };
    const octokit = makeOctokit([], []);
    octokit.pulls.get.mockResolvedValue({ data: closedPR });
    const result = await pollForMerge(octokit as never, 'o', 'r', 42, baseConfig);
    expect(result.status).toBe('closed');
  });

  it('returns ci_failed when a check fails', async () => {
    const { pollForMerge } = await import('../github.js');
    const openPR = makePR();
    const failedCheck = { name: 'CI', conclusion: 'failure', html_url: 'https://...' };
    const octokit = makeOctokit([], [failedCheck]);
    octokit.pulls.get.mockResolvedValue({ data: openPR });
    const result = await pollForMerge(octokit as never, 'o', 'r', 42, baseConfig);
    expect(result.status).toBe('ci_failed');
    expect(result.details).toMatch(/CI/);
  });
});
