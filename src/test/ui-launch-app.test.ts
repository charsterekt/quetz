import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LaunchSelection } from '../ui/LaunchApp.js';
import { mountLaunchApp } from '../ui/LaunchApp.js';

const {
  mockCreateNodeApp,
  textMock,
  boxMock,
  columnMock,
  rowMock,
  selectMock,
  textareaMock,
  inputMock,
  buttonMock,
} = vi.hoisted(() => ({
  mockCreateNodeApp: vi.fn(),
  textMock: vi.fn((content: string) => ({ content })),
  boxMock: vi.fn((_props: Record<string, unknown>, children: unknown) => ({ children })),
  columnMock: vi.fn((_props: Record<string, unknown>, children: unknown) => ({ children })),
  rowMock: vi.fn((_props: Record<string, unknown>, children: unknown) => ({ children })),
  selectMock: vi.fn((props: Record<string, unknown>) => props),
  textareaMock: vi.fn((props: Record<string, unknown>) => props),
  inputMock: vi.fn((props: Record<string, unknown>) => props),
  buttonMock: vi.fn((props: Record<string, unknown>) => props),
}));

vi.mock('@rezi-ui/node', () => ({
  createNodeApp: mockCreateNodeApp,
}));

vi.mock('@rezi-ui/core', () => ({
  rgb: vi.fn(() => 'rgb'),
  ui: {
    box: boxMock,
    column: columnMock,
    row: rowMock,
    text: textMock,
    select: selectMock,
    textarea: textareaMock,
    input: inputMock,
    button: buttonMock,
  },
}));

function createAppMock(overrides: Record<string, unknown> = {}) {
  return {
    keys: vi.fn(),
    view: vi.fn(),
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

const baseSelection: LaunchSelection = {
  provider: 'claude',
  model: 'sonnet',
  effort: 'medium',
  simulate: false,
  localCommits: false,
  amend: false,
  beadsMode: 'all',
};

describe('mountLaunchApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the launch hero subtitle, version, and primary action', () => {
    let viewFn!: (state: unknown) => unknown;
    mockCreateNodeApp.mockReturnValue(createAppMock({
      view: vi.fn((fn: (state: unknown) => unknown) => {
        viewFn = fn;
      }),
    }));

    void mountLaunchApp({
      version: '0.7.6',
      initialSelection: baseSelection,
      issueCounts: { live: 14, simulate: 3 },
    });

    viewFn({
      provider: 'claude',
      model: 'sonnet',
      effort: 'medium',
      customPrompt: '',
      beadsMode: 'all',
      epicId: '',
      simulate: false,
      runMode: 'pr',
      issueCounts: { live: 14, simulate: 3 },
    });

    const renderedText = textMock.mock.calls.map(([content]) => content);
    expect(renderedText).toContain('// autonomous_code_agent');
    expect(renderedText).toContain('v0.7.6');
    expect(renderedText).toContain('thinking');
    expect(renderedText).toContain('14');
    expect(renderedText).toContain('total_issues');
    expect(renderedText).toContain('← esc quit  |  ↑↓ navigate  |  ↵ select');
    expect(renderedText).not.toContain('Screen 0 - Entry');
    expect(buttonMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'launch-start',
      label: '$ quetz start',
    }));
    expect(buttonMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'launch-provider-claude',
      label: 'claude',
    }));
    expect(buttonMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'launch-run-mode-pr',
      label: 'pr',
    }));
    expect(buttonMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'launch-effort-off',
      label: 'off',
    }));
    expect(buttonMock).not.toHaveBeenCalledWith(expect.objectContaining({
      id: 'launch-effort-max',
      label: 'max',
    }));
    expect(selectMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'launch-model',
      value: 'sonnet',
    }));
    expect(textareaMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'launch-custom-prompt',
    }));
    expect(inputMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'launch-epic-id',
    }));
  });

  it('returns the selected launch values when start is pressed', async () => {
    let viewFn!: (state: unknown) => unknown;
    mockCreateNodeApp.mockReturnValue(createAppMock({
      view: vi.fn((fn: (state: unknown) => unknown) => {
        viewFn = fn;
      }),
    }));

    const handle = mountLaunchApp({
      version: '0.7.6',
      initialSelection: baseSelection,
      issueCounts: { live: 14, simulate: 3 },
    });

    viewFn({
      provider: 'codex',
      model: 'gpt-5.1',
      effort: 'high',
      customPrompt: 'Use repo conventions',
      beadsMode: 'epic',
      epicId: 'quetz-8z8',
      simulate: true,
      runMode: 'commit',
      issueCounts: { live: 14, simulate: 3 },
    });

    const startCall = buttonMock.mock.calls.find(([props]) => (props as { id?: string }).id === 'launch-start');
    expect(startCall).toBeTruthy();

    (startCall?.[0] as { onPress: () => void }).onPress();

    await expect(handle.result).resolves.toEqual({
      provider: 'codex',
      model: 'gpt-5.1',
      effort: 'high',
      simulate: true,
      localCommits: true,
      amend: false,
      customPrompt: 'Use repo conventions',
      beadsMode: 'epic',
      epicId: 'quetz-8z8',
    });
  });

  it('shows the simulate issue total and copy when simulate is enabled', () => {
    let viewFn!: (state: unknown) => unknown;
    mockCreateNodeApp.mockReturnValue(createAppMock({
      view: vi.fn((fn: (state: unknown) => unknown) => {
        viewFn = fn;
      }),
    }));

    void mountLaunchApp({
      version: '0.7.6',
      initialSelection: baseSelection,
      issueCounts: { live: 14, simulate: 3 },
    });

    viewFn({
      provider: 'codex',
      model: 'gpt-5-codex',
      effort: 'high',
      customPrompt: '',
      beadsMode: 'all',
      epicId: '',
      simulate: true,
      runMode: 'pr',
      issueCounts: { live: 14, simulate: 3 },
    });

    const renderedText = textMock.mock.calls.map(([content]) => content);
    expect(renderedText).toContain('3');
    expect(renderedText).not.toContain('14');
    expect(renderedText).toContain('dry_run — mock issues and restricted tools');
  });
});
