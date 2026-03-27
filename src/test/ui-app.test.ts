import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createBus } from '../events.js';
import type { AppState, CompletedSession } from '../ui/state.js';
import { INITIAL_STATE } from '../ui/state.js';
import { mountApp } from '../ui/App.js';
import { AgentPanel } from '../ui/components/AgentPanel.js';
import { SessionsPanel } from '../ui/components/SessionsPanel.js';
import { LogPanel } from '../ui/components/LogPanel.js';
import { Footer } from '../ui/components/Footer.js';

const { mockCreateNodeApp } = vi.hoisted(() => ({
  mockCreateNodeApp: vi.fn(),
}));

const mockAgentPanel = vi.mocked(AgentPanel);
const mockSessionsPanel = vi.mocked(SessionsPanel);
const mockLogPanel = vi.mocked(LogPanel);
const mockFooter = vi.mocked(Footer);

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

function makeSession(id: string, title: string, outcome: CompletedSession['outcome'] = 'merged'): CompletedSession {
  return {
    id,
    title,
    duration: '0:42',
    outcome,
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

  it('uses h to focus history and enter to open the selected session', () => {
    const bus = createBus();
    let state = makeState({
      focusedPane: 'agent',
      completedSessions: [
        makeSession('bd-1', 'First fix'),
        makeSession('bd-2', 'Second fix'),
      ],
      selectedSessionIdx: -1,
      sessionsScrollOffset: 0,
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

    bindings.h();
    expect(state.focusedPane).toBe('sessions');
    expect(state.selectedSessionIdx).toBe(1);
    expect(state.sessionsScrollOffset).toBe(0);

    bindings.enter();
    expect(state.mode).toBe('session_detail');
    expect(state.viewingSession?.id).toBe('bd-2');

    bindings.escape();
    expect(state.mode).toBe('running');
    expect(state.focusedPane).toBe('sessions');
    expect(state.viewingSession).toBeNull();
  });

  it('uses h to open session detail from outcome screens', () => {
    const bus = createBus();
    let state = makeState({
      mode: 'failure',
      focusedPane: 'agent',
      completedSessions: [makeSession('bd-9', 'Inspect failed run', 'failed')],
      selectedSessionIdx: -1,
      sessionsScrollOffset: 0,
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

    bindings.h();
    expect(state.mode).toBe('session_detail');
    expect(state.priorMode).toBe('failure');
    expect(state.viewingSession?.id).toBe('bd-9');

    bindings.escape();
    expect(state.mode).toBe('failure');
    expect(state.focusedPane).toBe('sessions');
    expect(state.viewingSession).toBeNull();
  });

  it('keeps the selected session visible while scrolling through a long rail', () => {
    const bus = createBus();
    let state = makeState({
      focusedPane: 'sessions',
      completedSessions: Array.from({ length: 12 }, (_, i) => makeSession(`bd-${i + 1}`, `Issue ${i + 1}`)),
      selectedSessionIdx: 0,
      sessionsScrollOffset: 0,
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

    for (let i = 0; i < 8; i++) {
      bindings.down();
    }

    expect(state.selectedSessionIdx).toBe(8);
    expect(state.sessionsScrollOffset).toBe(2);

    bindings.down();
    expect(state.selectedSessionIdx).toBe(9);
    expect(state.sessionsScrollOffset).toBe(3);
  });

  it('supports horizontal agent transcript inspection without mutating vertical scroll', () => {
    const bus = createBus();
    let state = makeState({
      focusedPane: 'agent',
      agentLines: [{ type: 'text', content: 'A very long transcript line that should require horizontal scrolling to inspect fully.' }],
      agentScrollOffset: 4,
      agentHorizontalScrollOffset: 0,
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

    Object.defineProperty(process.stdout, 'columns', { value: 120, configurable: true });

    void mountApp({ bus, version: '0.5.3', onQuit: vi.fn() });

    bindings['.']();
    expect(state.agentHorizontalScrollOffset).toBeGreaterThan(0);
    expect(state.agentScrollOffset).toBe(4);

    bindings[',']();
    expect(state.agentHorizontalScrollOffset).toBe(0);
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
    expect(mockAgentPanel).toHaveBeenCalledWith(expect.objectContaining({
      width: 72,
      height: expect.any(Number),
      effort: '',
      horizontalScrollOffset: expect.any(Number),
    }));
    expect(mockSessionsPanel).toHaveBeenCalledWith(expect.objectContaining({
      width: 48,
      height: expect.any(Number),
    }));
    expect(mockLogPanel).toHaveBeenCalledWith(expect.objectContaining({
      width: 48,
      height: expect.any(Number),
    }));
    expect(mockFooter).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'running',
      focusedPane: 'agent',
      hasHistory: false,
    }));
  });

  it('keeps both panes usable on narrow terminals', () => {
    const bus = createBus();
    let viewFn!: (state: AppState) => unknown;

    Object.defineProperty(process.stdout, 'columns', { value: 50, configurable: true });
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

    expect(mockAgentPanel).toHaveBeenCalledWith(expect.objectContaining({ width: 30 }));
    expect(mockSessionsPanel).toHaveBeenCalledWith(expect.objectContaining({ width: 20 }));
    expect(mockLogPanel).toHaveBeenCalledWith(expect.objectContaining({ width: 20 }));
  });

  it('keeps the shared footer mounted for outcome and detail screens', () => {
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

    viewFn(makeState({
      mode: 'victory',
      phase: 'completed',
      issueId: 'bd-777',
      issueCount: { current: 3, total: 3 },
      prNumber: 77,
      elapsed: '0m 09s',
      completedSessions: [makeSession('bd-777', 'Keep footer visible')],
    }));
    viewFn(makeState({
      mode: 'failure',
      phase: 'error',
      issueId: 'bd-778',
      issueCount: { current: 2, total: 3 },
      prNumber: 78,
      elapsed: '0m 12s',
      completedSessions: [makeSession('bd-778', 'Keep footer visible', 'failed')],
    }));
    viewFn(makeState({
      mode: 'session_detail',
      phase: 'pr_polling',
      issueId: 'bd-779',
      prNumber: 79,
      elapsed: '0m 15s',
      focusedPane: 'sessions',
      completedSessions: [makeSession('bd-779', 'Inspect session detail')],
      viewingSession: makeSession('bd-779', 'Inspect session detail'),
    }));

    expect(mockFooter).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'victory',
      phase: 'completed',
      hasHistory: true,
    }));
    expect(mockFooter).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'failure',
      phase: 'error',
      hasHistory: true,
    }));
    expect(mockFooter).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'session_detail',
      focusedPane: 'sessions',
      hasHistory: true,
    }));
  });
});
