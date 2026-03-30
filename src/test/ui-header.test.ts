import { beforeEach, describe, expect, it, vi } from 'vitest';

const { defineWidgetMock, textMock, boxMock, columnMock, rowMock, useIntervalMock } = vi.hoisted(() => ({
  defineWidgetMock: vi.fn((impl: unknown) => impl),
  textMock: vi.fn((content: string) => ({ content })),
  boxMock: vi.fn((_props: Record<string, unknown>, children: unknown) => ({ children })),
  columnMock: vi.fn((_props: Record<string, unknown>, children: unknown) => ({ children })),
  rowMock: vi.fn((_props: Record<string, unknown>, children: unknown) => ({ children })),
  useIntervalMock: vi.fn(),
}));

vi.mock('@rezi-ui/core', () => ({
  defineWidget: defineWidgetMock,
  rgb: vi.fn(() => 'rgb'),
  ui: {
    box: boxMock,
    column: columnMock,
    row: rowMock,
    text: textMock,
  },
  useInterval: useIntervalMock,
}));

import { Header } from '../ui/components/Header.js';
import { LOGO_LINES, logoSubtitle } from '../ui/logo.js';

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the block logo and top-aligned header chrome', () => {
    const ctx = {
      useState: vi.fn(() => [0, vi.fn()]),
    };

    Header({
      mode: 'running',
      issueCount: { current: 2, total: 5 },
      phase: 'agent_running',
      bgStatus: 'bd-1  |  running  |  0m 12s',
      version: '0.5.3',
      termCols: 230,
      termRows: 55,
    }, ctx as never);

    expect(boxMock).toHaveBeenCalledTimes(1);
    expect(boxMock.mock.calls[0][0]).toMatchObject({
      px: 2,
      py: 1,
      borderBottom: true,
    });

    const outerRowCall = rowMock.mock.calls.find(([props]) => (props as { justify?: string }).justify === 'between');
    expect(outerRowCall?.[0]).toMatchObject({
      justify: 'between',
      items: 'start',
    });

    expect(columnMock.mock.calls[1][0]).toMatchObject({
      items: 'end',
      gap: 0,
    });

    const renderedText = textMock.mock.calls.map(([content]) => content);
    for (const line of LOGO_LINES) {
      expect(renderedText).toContain(line);
    }
    expect(renderedText).toContain(logoSubtitle('0.5.3'));
    expect(renderedText.join(' ')).toContain('~*~*~*~>');
    expect(renderedText.join(' ')).toContain('2/5');
  });

  it('shows split width/height warning lines when terminal is below minimum size', () => {
    const ctx = {
      useState: vi.fn(() => [0, vi.fn()]),
    };

    Header({
      mode: 'running',
      issueCount: { current: 2, total: 5 },
      phase: 'agent_running',
      bgStatus: 'bd-1  |  running  |  0m 12s',
      version: '0.5.3',
      termCols: 120,
      termRows: 40,
    }, ctx as never);

    const renderedText = textMock.mock.calls.map(([content]) => content);
    expect(renderedText).toContain('warning: terminal width 120 < 230');
    expect(renderedText).toContain('warning: terminal height 40 < 55');
  });

  it('hides header terminal-size warnings when terminal meets minimums', () => {
    const ctx = {
      useState: vi.fn(() => [0, vi.fn()]),
    };

    Header({
      mode: 'running',
      issueCount: { current: 2, total: 5 },
      phase: 'agent_running',
      bgStatus: 'bd-1  |  running  |  0m 12s',
      version: '0.5.3',
      termCols: 230,
      termRows: 55,
    }, ctx as never);

    const renderedText = textMock.mock.calls.map(([content]) => content);
    expect(renderedText.some(text => typeof text === 'string' && text.startsWith('warning: terminal'))).toBe(false);
  });
});
