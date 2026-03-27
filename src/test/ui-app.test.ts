import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createBus } from '../events.js';
import type { AppState, CompletedSession } from '../ui/state.js';
import { INITIAL_STATE } from '../ui/state.js';
import { mountApp } from '../ui/App.js';
import { SessionsPanel } from '../ui/components/SessionsPanel.js';
import { LogPanel } from '../ui/components/LogPanel.js';

const { mockCreateNodeApp } = vi.hoisted(() => ({
  mockCreateNodeApp: vi.fn(),
}));

const mockSessionsPanel = vi.mocked(SessionsPanel);
const mockLogPanel = vi.mocked(LogPanel);

vi.mock('@rezi-ui/node', () => ({
  createNodeApp: mockCreateNodeApp,
}));

vi.mock('@rezi-ui/core', () => {
  const node = {};
  return {
    rgb: vi.fn(() => 'rgb'),
    ui: {
      box: vi.fn(() => node),
      column: vi.fn(() => node),
      row: vi.fn(() => node),
      text: vi.fn(() => node),
      spacer: vi.fn(() => node),
    },
  };
});

vi.mock('../ui/components/Header.js', () => ({ Header: vi.fn(() => ({})) }));
vi.mock('../ui/components/Footer.js', () => ({ Footer: vi.fn(() => ({})) }));
vi.mock('../ui/components/AgentPanel.js', () => ({ AgentPanel: vi.fn(() => ({})) }));
vi.mock('../ui/components/SessionsPanel.js', () => ({ SessionsPanel: vi.fn(() => ({})) }));
vi.mock('../ui/components/LogPanel.js', () => ({ LogPanel: vi.fn(() => ({})) }));
vi.mock('../ui/components/SessionDetail.js', () => ({ SessionDetail: vi.fn(() => ({})) }));
vi.mock('../ui/components/VictoryCard.js', () => ({ VictoryCard: vi.fn(() => ({})) }));
vi.mock('../ui/components/FailureCard.js', () => ({ FailureCard: vi.fn(() => ({})) }));

function makeSession(id: string, title: string): CompletedSession {
  return {
    id,
    title,
    duration: '0:42',
    outcome: 'merged',
    lines: [],
  };
}

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    ...INITIAL_STATE,
    issueCount: { ...INITIAL_STATE.issueCount },
    agentLines: [...INITIAL_STATE.agentLines],
    completedSessions: [...INITIAL_STATE.completedSessions],
    logLines: [...INITIAL_STATE.logLines],
    ...overrides,
  };
}

describe('mountApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('waits for startup to finish before stopping during unmount', async () => {
    const bus = createBus();
    let resolveStart!: () => void;

    const app = {
      update: vi.fn(),
      keys: vi.fn(),
      view: vi.fn(),
      start: vi.fn(() => new Promise<void>(resolve => { resolveStart = resolve; })),
      stop: vi.fn(() => Promise.resolve()),
    };
    mockCreateNodeApp.mockReturnValue(app);

    const handle = mountApp({ bus, version: '0.5.3', onQuit: vi.fn() });
    const unmountPromise = handle.unmount();

    expect(app.stop).not.toHaveBeenCalled();

    resolveStart();
    await unmountPromise;

    expect(app.stop).toHaveBeenCalledTimes(1);
  });

  it('keeps arrow scrolling on the agent panel until sessions are explicitly focused', () => {
    const bus = createBus();
    let state = makeState({
      focusedPane: 'agent',
      completedSessions: [makeSession('bd-1', 'First fix')],
      selectedSessionIdx: -1,
      agentScrollOffset: 9,
      agentAutoScroll: false,
    });
    let bindings: Record<string, () => void> = {};

    const app = {
      update: vi.fn((updater: AppState | ((prev: Readonly<AppState>) => AppState)) => {
        state = typeof updater === 'function' ? updater(state) : updater;
      }),
      keys: vi.fn((nextBindings: Record<string, () => void>) => {
        bindings = nextBindings;
      }),
      view: vi.fn(),
      start: vi.fn(() => Promise.resolve()),
      stop: vi.fn(() => Promise.resolve()),
    };
    mockCreateNodeApp.mockReturnValue(app);

    void mountApp({ bus, version: '0.5.3', onQuit: vi.fn() });

    bindings.up();
    expect(state.agentScrollOffset).toBe(6);
    expect(state.selectedSessionIdx).toBe(-1);

    bindings.right();
    expect(state.focusedPane).toBe('sessions');
    expect(state.selectedSessionIdx).toBe(0);

    bindings.down();
    expect(state.selectedSessionIdx).toBe(0);

    bindings.left();
    expect(state.focusedPane).toBe('agent');
  });

  it('renders both the sessions panel and quetz log in running mode', () => {
    const bus = createBus();
    let viewFn!: (state: AppState) => unknown;

    Object.defineProperty(process.stdout, 'columns', { value: 120, configurable: true });
    Object.defineProperty(process.stdout, 'rows', { value: 40, configurable: true });

    const app = {
      update: vi.fn(),
      keys: vi.fn(),
      view: vi.fn((fn: (state: AppState) => unknown) => {
        viewFn = fn;
      }),
      start: vi.fn(() => Promise.resolve()),
      stop: vi.fn(() => Promise.resolve()),
    };
    mockCreateNodeApp.mockReturnValue(app);

    void mountApp({ bus, version: '0.5.3', onQuit: vi.fn() });
    viewFn(makeState({ mode: 'running' }));

    expect(mockSessionsPanel).toHaveBeenCalledTimes(1);
    expect(mockLogPanel).toHaveBeenCalledTimes(1);
    expect(mockSessionsPanel).toHaveBeenCalledWith(expect.objectContaining({
      width: expect.any(Number),
      height: expect.any(Number),
    }));
    expect(mockLogPanel).toHaveBeenCalledWith(expect.objectContaining({
      width: expect.any(Number),
      height: expect.any(Number),
    }));
  });
});
