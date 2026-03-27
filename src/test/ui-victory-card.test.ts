import { beforeEach, describe, expect, it, vi } from 'vitest';

const { textMock } = vi.hoisted(() => ({
  textMock: vi.fn((content: string) => ({ content })),
}));

vi.mock('@rezi-ui/core', () => ({
  rgb: vi.fn(() => 'rgb'),
  ui: {
    box: vi.fn((_props, children) => ({ children })),
    column: vi.fn((_props, children) => ({ children })),
    row: vi.fn((_props, children) => ({ children })),
    text: textMock,
    spacer: vi.fn(() => ({})),
  },
}));

import { VictoryCard } from '../ui/components/VictoryCard.js';

describe('VictoryCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process.stdout, 'columns', { value: 120, configurable: true });
  });

  it('renders commit-based stats for amend mode victories', () => {
    VictoryCard({
      version: '0.5.3',
      data: {
        issuesCompleted: 3,
        totalTime: '12:34',
        prsMerged: 0,
        mode: 'amend',
        commitsLanded: 3,
        commitHash: 'abc1234def',
        commitMsg: 'squash all fixes',
      },
    });

    const labels = textMock.mock.calls.map(call => call[0]);
    expect(labels).toContain('◆ all done  |  exit code 0');
    expect(labels).toContain('q quit');
    expect(labels).toContain('commit_ready');
    expect(labels).toContain('abc1234');
    expect(labels).toContain('the serpent prepares a final commit.');
    expect(labels).toContain('latest: squash all fixes');
  });
});
