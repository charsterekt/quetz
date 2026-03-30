import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LaunchSelection } from '../ui/LaunchApp.js';
import { mountLaunchApp } from '../ui/LaunchApp.js';

const {
  mockCreateNodeApp,
  textMock,
  boxMock,
  columnMock,
  rowMock,
  inputMock,
  checkboxMock,
  buttonMock,
  selectMock,
  focusZoneMock,
  spacerMock,
  textareaMock,
} = vi.hoisted(() => ({
  mockCreateNodeApp: vi.fn(),
  textMock: vi.fn((content: string) => ({ content })),
  boxMock: vi.fn((_props: Record<string, unknown>, children: unknown) => ({ children })),
  columnMock: vi.fn((_props: Record<string, unknown>, children: unknown) => ({ children })),
  rowMock: vi.fn((_props: Record<string, unknown>, children: unknown) => ({ children })),
  inputMock: vi.fn((props: Record<string, unknown>) => props),
  checkboxMock: vi.fn((props: Record<string, unknown>) => props),
  buttonMock: vi.fn((props: Record<string, unknown>) => props),
  selectMock: vi.fn((props: Record<string, unknown>) => props),
  focusZoneMock: vi.fn((_props: Record<string, unknown>, children: unknown) => ({ children })),
  spacerMock: vi.fn((props: Record<string, unknown>) => ({ spacer: true, ...props })),
  textareaMock: vi.fn((props: Record<string, unknown>) => props),
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
    input: inputMock,
    checkbox: checkboxMock,
    button: buttonMock,
    select: selectMock,
    focusZone: focusZoneMock,
    spacer: spacerMock,
    textarea: textareaMock,
  },
}));

function createAppMock(overrides: Record<string, unknown> = {}) {
  return {
    keys: vi.fn(),
    onFocusChange: vi.fn(() => vi.fn()),
    update: vi.fn(),
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
      initialSelection: {
        ...baseSelection,
        model: 'claude-sonnet-4-20250514',
      },
      issueCounts: { live: 14, simulate: 3 },
    });

    expect(mockCreateNodeApp).toHaveBeenCalledWith(expect.objectContaining({
      initialState: expect.objectContaining({
        model: 'sonnet',
      }),
    }));

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
      focusedId: null,
    });

    const renderedText = textMock.mock.calls.map(([content]) => content);
    expect(renderedText).toContain('// the feathered serpent dev loop');
    expect(renderedText).toContain('v0.7.6');
    expect(renderedText).toContain('thinking');
    expect(renderedText).toContain('14');
    expect(renderedText).toContain('total_issues');
    expect(renderedText).toContain('esc ctrl+c quit  |  ←→ navigate  |  tab switch  |  ↵ select');
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
    expect(selectMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'launch-model',
      value: 'sonnet',
    }));
    expect(buttonMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'launch-effort-max',
      label: 'max*',
    }));
    expect(buttonMock).not.toHaveBeenCalledWith(expect.objectContaining({
      id: 'launch-effort-off',
    }));

    expect(textareaMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'launch-custom-prompt',
      accessibleLabel: 'Custom prompt',
      placeholder: 'enter additional instructions...',
      rows: 6,
      wordWrap: true,
      focusConfig: expect.objectContaining({ indicator: 'none' }),
    }));
    expect(inputMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'launch-epic-id',
      accessibleLabel: 'Epic ID',
      placeholder: 'enter_epic_id...',
    }));
    expect(checkboxMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'launch-simulate',
      checked: false,
      dsSize: 'lg',
    }));
  });

  it('uses esc/ctrl+c for launch quit and does not bind q', () => {
    const appMock = createAppMock();
    mockCreateNodeApp.mockReturnValue(appMock);

    void mountLaunchApp({
      version: '0.7.6',
      initialSelection: baseSelection,
      issueCounts: { live: 14, simulate: 3 },
    });

    expect(appMock.keys).toHaveBeenCalledWith(expect.objectContaining({
      esc: expect.any(Function),
      'ctrl+c': expect.any(Function),
    }));
    const keyBindings = appMock.keys.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(keyBindings.q).toBeUndefined();
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
      focusedId: null,
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

  it('shows the simulate issue total and simplified codex model label', () => {
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
      focusedId: null,
    });

    const renderedText = textMock.mock.calls.map(([content]) => content);
    expect(renderedText).toContain('3');
    expect(renderedText).toContain('dry_run - mock issues and restricted tools');
    expect(selectMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'launch-model',
      value: 'gpt-5-codex',
    }));
  });

  it('renders custom prompt as a native textarea with wrapped multiline input', () => {
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
      customPrompt: 'x'.repeat(500),
      beadsMode: 'all',
      epicId: '',
      simulate: false,
      runMode: 'pr',
      issueCounts: { live: 14, simulate: 3 },
      focusedId: null,
    });

    expect(textareaMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'launch-custom-prompt',
      rows: 6,
      wordWrap: true,
    }));
    const renderedText = textMock.mock.calls.map(([content]) => content);
    expect(renderedText.some(text => typeof text === 'string' && text.startsWith('overflow: +'))).toBe(false);
  });
});
