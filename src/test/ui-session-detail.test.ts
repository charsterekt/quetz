import { beforeEach, describe, expect, it, vi } from 'vitest';

const { textMock, boxMock, columnMock, rowMock } = vi.hoisted(() => ({
  textMock: vi.fn((content: string) => ({ content })),
  boxMock: vi.fn((_props: Record<string, unknown>, children: unknown) => ({ children })),
  columnMock: vi.fn((_props: Record<string, unknown>, children: unknown) => ({ children })),
  rowMock: vi.fn((_props: Record<string, unknown>, children: unknown) => ({ children })),
}));

vi.mock('@rezi-ui/core', () => ({
  rgb: vi.fn(() => 'rgb'),
  ui: {
    box: boxMock,
    column: columnMock,
    row: rowMock,
    text: textMock,
  },
}));

vi.mock('../ui/components/Scrollbar.js', () => ({
  Scrollbar: vi.fn(() => ({})),
}));

import { SessionDetail } from '../ui/components/SessionDetail.js';

describe('SessionDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the provided viewport height instead of process.stdout.rows', () => {
    Object.defineProperty(process.stdout, 'rows', { value: 12, configurable: true });

    SessionDetail({
      session: {
        id: 'bd-1',
        title: 'Inspect scroll sizing',
        duration: '0m 42s',
        outcome: 'merged',
        lines: Array.from({ length: 10 }, (_, i) => ({ type: 'text' as const, content: `detail ${i}` })),
      },
      scrollOffset: 0,
      height: 8,
    });

    const renderedText = textMock.mock.calls.map(([content]) => content);
    expect(renderedText).toContain('detail 5');
    expect(renderedText).not.toContain('detail 6');
  });
});
