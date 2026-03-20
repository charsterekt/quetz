import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock terminal helpers to return plain text
vi.mock('../display/terminal.js', () => ({
  brand: (t: string) => t,
  issueId: (t: string) => t,
  success: (t: string) => t,
  waiting: (t: string) => t,
  error: (t: string) => t,
  dim: (t: string) => t,
  separator: (t: string) => t,
  chrome: (t: string) => t,
}));

// Mock tui so isActive() returns false — tests use plain-text fallback paths
vi.mock('../display/tui.js', () => ({
  isActive: () => false,
  clearContentArea: vi.fn(),
  writePanel: vi.fn(),
  ANSI: { resetScroll: '' },
  HEADER_ROWS: 3,
}));

import { printPickup, printAgentComplete, printPRFound, printMerged, printVictory, printFailure } from '../display/messages.js';

let stdoutSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stdoutSpy.mockRestore();
});

function getOutput(): string {
  return stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => String(c[0])).join('');
}

describe('printPickup', () => {
  it('displays issue ID, title, priority, and type', () => {
    printPickup('bd-a1b2', 'Add auth middleware', 1, 'task');
    const out = getOutput();
    expect(out).toContain('bd-a1b2');
    expect(out).toContain('Add auth middleware');
    expect(out).toContain('P1');
    expect(out).toContain('task');
    expect(out).toContain('Summoning agent');
  });
});

describe('printAgentComplete', () => {
  it('displays completion message and PR search', () => {
    printAgentComplete();
    const out = getOutput();
    expect(out).toContain('Agent session complete');
    expect(out).toContain('Searching for PR');
  });
});

describe('printPRFound', () => {
  it('displays PR number, title, and URL', () => {
    printPRFound(42, 'feat: add auth', 'https://github.com/org/repo/pull/42');
    const out = getOutput();
    expect(out).toContain('PR #42');
    expect(out).toContain('feat: add auth');
    expect(out).toContain('https://github.com/org/repo/pull/42');
    expect(out).toContain('Watching for merge');
  });
});

describe('printMerged', () => {
  it('displays merge success with remaining count', () => {
    printMerged(42, 'bd-a1b2', 7);
    const out = getOutput();
    expect(out).toContain('PR #42 merged!');
    expect(out).toContain('serpent devours bd-a1b2');
    expect(out).toContain('Issues remaining: 7');
  });
});

describe('printVictory', () => {
  it('displays victory screen with stats', () => {
    printVictory({ issuesCompleted: 14, totalTime: '3h 42m', prsMerged: 14 });
    const out = getOutput();
    expect(out).toContain('QUETZ VICTORY');
    expect(out).toContain('All issues resolved');
    expect(out).toContain('14');
    expect(out).toContain('3h 42m');
    expect(out).toContain('serpent rests');
  });
});

describe('printFailure', () => {
  it('displays CI failure message', () => {
    printFailure('ci_failed', { prNumber: 42, prUrl: 'https://gh/pr/42', details: 'tests failed' });
    const out = getOutput();
    expect(out).toContain('CI failed on PR #42');
    expect(out).toContain('tests failed');
    expect(out).toContain('serpent retreats');
  });

  it('displays timeout message', () => {
    printFailure('timeout', { prNumber: 42, prUrl: 'https://gh/pr/42', timeoutMinutes: 15 });
    const out = getOutput();
    expect(out).toContain('timeout (15m)');
    expect(out).toContain('PR #42');
    expect(out).toContain('serpent retreats');
  });

  it('displays no PR found message', () => {
    printFailure('no_pr', { issueIdStr: 'bd-a1b2' });
    const out = getOutput();
    expect(out).toContain('No PR found');
    expect(out).toContain('bd-a1b2');
    expect(out).toContain('serpent retreats');
  });

  it('displays closed without merge message', () => {
    printFailure('closed', { prNumber: 42, prUrl: 'https://gh/pr/42' });
    const out = getOutput();
    expect(out).toContain('PR #42 closed without merging');
    expect(out).toContain('serpent retreats');
  });
});
