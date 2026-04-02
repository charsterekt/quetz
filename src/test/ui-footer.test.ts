import { beforeEach, describe, expect, it, vi } from 'vitest';

const { textMock } = vi.hoisted(() => ({
  textMock: vi.fn((content: string) => ({ content })),
}));

vi.mock('@rezi-ui/core', () => ({
  rgb: vi.fn(() => 'rgb'),
  ui: {
    box: vi.fn((_props, children) => ({ children })),
    row: vi.fn((_props, children) => ({ children })),
    text: textMock,
  },
}));

import { Footer } from '../ui/components/Footer.js';

describe('Footer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders session-focused controls in running mode', () => {
    Footer({
      mode: 'running',
      runMode: 'pr',
      focusedPane: 'agent',
      hasHistory: true,
      phase: 'agent_running',
      issueId: 'mock-001',
      issueCount: { current: 1, total: 3 },
      prNumber: null,
      elapsed: '0m 13s',
      version: '0.5.3',
      viewingSession: null,
      failureData: null,
    });

    const rendered = textMock.mock.calls.map(([content]) => content).join(' ');
    expect(rendered).toContain('\u25c6 issue 1/3  |  mock-001  |  agent running');
    expect(rendered).not.toContain('\u2190\u2192 panes');
    expect(rendered).toContain('\u2191\u2193 sessions');
    expect(rendered).toContain('enter open');
    expect(rendered).toContain('\u25c6  v0.5.3');
  });

  it('renders background context for session detail mode', () => {
    Footer({
      mode: 'session_detail',
      runMode: 'pr',
      focusedPane: 'sessions',
      hasHistory: true,
      phase: 'pr_polling',
      issueId: 'mock-002',
      issueCount: { current: 2, total: 3 },
      prNumber: 42,
      elapsed: '8m 22s',
      version: '0.5.3',
      viewingSession: {
        id: 'bd-a1b2',
        title: 'Inspect middleware',
        duration: '14m 06s',
        outcome: 'merged',
        lines: [],
        prNumber: 38,
      },
      failureData: null,
    });

    const rendered = textMock.mock.calls.map(([content]) => content).join(' ');
    expect(rendered).toContain('session: bd-a1b2');
    expect(rendered).toContain('bg: mock-002 waiting for merge  |  8m 22s');
    expect(rendered).toContain('\u25c6  v0.5.3');
  });

  it('renders distinct outcome footer text for victory and failure', () => {
    Footer({
      mode: 'victory',
      runMode: 'pr',
      focusedPane: 'sessions',
      hasHistory: true,
      phase: 'completed',
      issueId: 'mock-003',
      issueCount: { current: 3, total: 3 },
      prNumber: 77,
      elapsed: '0m 21s',
      version: '0.5.3',
      viewingSession: null,
      failureData: null,
    });
    Footer({
      mode: 'failure',
      runMode: 'pr',
      focusedPane: 'sessions',
      hasHistory: true,
      phase: 'error',
      issueId: 'mock-004',
      issueCount: { current: 2, total: 3 },
      prNumber: 78,
      elapsed: '0m 18s',
      version: '0.5.3',
      viewingSession: null,
      failureData: {
        reason: 'CI failed',
        detail: 'run tests',
        issueId: 'mock-004',
        elapsed: '0m 18s',
        failedChecks: 'run_tests',
        prNumber: 78,
      },
    });

    const rendered = textMock.mock.calls.map(([content]) => content).join(' ');
    expect(rendered).toContain('\u25c6 all done  |  exit code 0');
    expect(rendered).toContain('\u25cf ci failed  |  pr: #78  |  issue: mock-004  |  exit code 1');
    expect(rendered).toContain('q quit  \u25c6  v0.5.3');
    expect(rendered).not.toContain('enter open');
    expect(rendered).not.toContain('esc back');
  });

  it('shows commit and amend modes instead of an empty PR slot', () => {
    Footer({
      mode: 'running',
      runMode: 'commit',
      focusedPane: 'agent',
      hasHistory: false,
      phase: 'commit_verifying',
      issueId: 'mock-005',
      issueCount: { current: 1, total: 2 },
      prNumber: null,
      elapsed: '0m 04s',
      version: '0.5.3',
      viewingSession: null,
      failureData: null,
    });
    Footer({
      mode: 'running',
      runMode: 'amend',
      focusedPane: 'agent',
      hasHistory: false,
      phase: 'amend_verifying',
      issueId: 'mock-006',
      issueCount: { current: 2, total: 2 },
      prNumber: null,
      elapsed: '0m 08s',
      version: '0.5.3',
      viewingSession: null,
      failureData: null,
    });

    const rendered = textMock.mock.calls.map(([content]) => content).join(' ');
    expect(rendered).toContain('mode: commit');
    expect(rendered).toContain('mode: amend');
    expect(rendered).not.toContain('pr: ---');
  });
});
