import { Column, Row, Text, Spacer } from '@rezi-ui/jsx';
import type { VNode } from '@rezi-ui/core';
import { createNodeApp } from '@rezi-ui/node';
import type { QuetzBus } from '../events.js';
import { createInitialState, wireAppState, type AppState } from './state.js';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { AgentPanel } from './components/AgentPanel.js';
import { SessionsPanel } from './components/SessionsPanel.js';
import { LogPanel } from './components/LogPanel.js';
import { SessionDetail } from './components/SessionDetail.js';
import { VictoryCard } from './components/VictoryCard.js';
import { FailureCard } from './components/FailureCard.js';
import { formatDuration, sessionDetailMaxOffset } from './components/SessionDetail.js';
import { SNAKE_FRAMES } from './snake.js';

interface AppProps {
  state: AppState;
  version: string;
  cwd: string;
  branch: string;
}

// Right column width: 26% of terminal, min 36
function rightCols(termCols: number): number {
  return Math.max(36, Math.round(termCols * 0.26));
}

export function App(props: AppProps): VNode {
  const { state, version, cwd, branch } = props;
  const termCols = process.stdout.columns ?? 120;
  const termRows = process.stdout.rows ?? 40;

  const rCols = rightCols(termCols);
  const agentCols = termCols - rCols - 1;

  const headerDone = state.issueCount > 0 ? state.issueCount - 1 : 0;
  const snakeFrame = SNAKE_FRAMES[state.snakeFrame % SNAKE_FRAMES.length] ?? SNAKE_FRAMES[0];

  // Victory screen
  if (state.mode === 'victory' && state.victoryData) {
    return (
      <Column height="full">
        <Header mode="victory" done={state.total} total={state.total} snakeFrame={snakeFrame} />
        <VictoryCard data={state.victoryData} termCols={termCols} termRows={termRows} />
        <Footer variant="victory" version={version} />
      </Column>
    );
  }

  // Failure screen
  if (state.mode === 'failure' && state.failureData) {
    return (
      <Column height="full">
        <Header mode="failure" done={headerDone} total={state.total} snakeFrame={snakeFrame} />
        <FailureCard data={state.failureData} termCols={termCols} termRows={termRows} />
        <Footer
          variant="failure"
          version={version}
          failureIssueId={state.failureData.issueId}
          failurePrNumber={state.failureData.prNumber}
        />
      </Column>
    );
  }

  // Session detail screen
  if (state.mode === 'session_detail' && state.viewingSession) {
    const session = state.viewingSession;
    const duration = formatDuration(session.finishedAt - session.startedAt);
    const prNum = (session as any).prNumber as number | undefined;
    const prStr = prNum != null ? `pr #${prNum}` : '—';
    return (
      <Column height="full">
        <Header
          mode="session_detail"
          done={headerDone}
          total={state.total}
          snakeFrame={snakeFrame}
          sessionId={session.issueId}
          elapsed={state.elapsed}
        />
        <SessionDetail
          session={session}
          scrollOffset={state.sessionLogScrollOffset}
          termCols={termCols}
          termRows={termRows}
          version={version}
        />
        <Footer
          variant="detail"
          version={version}
          detailSessionId={session.issueId}
          detailPrStr={prStr}
          detailDuration={duration}
        />
      </Column>
    );
  }

  // Running / polling screen (default)
  const sessionsRowCount = Math.max(4, Math.round(termRows * 0.24));

  return (
    <Column height="full">
      <Header
        mode={state.mode === 'polling' ? 'polling' : 'running'}
        done={headerDone}
        total={state.total}
        snakeFrame={snakeFrame}
      />
      <Row flex={1}>
        <AgentPanel
          agentLines={state.agentLines}
          agentScrollTop={state.agentScrollTop}
          agentAutoScroll={state.agentAutoScroll}
          agentMode={state.agentMode}
          issueId={state.issueId}
          prNumber={state.agentPrNumber}
          prBranch={state.agentPrBranch}
          spinnerFrame={state.spinnerFrame}
          width={agentCols}
          height={termRows}
        />
        <Text>{' '}</Text>
        <Column width={rCols}>
          <SessionsPanel
            sessions={state.sessions}
            selectedIdx={state.selectedSessionIdx}
            width={rCols}
            height={sessionsRowCount}
          />
          <LogPanel
            lines={state.logLines}
            scrollOffset={state.logScrollOffset}
            width={rCols}
            height={termRows - sessionsRowCount}
          />
        </Column>
      </Row>
      <Footer
        variant="normal"
        version={version}
        issueId={state.issueId}
        iteration={state.issueCount}
        total={state.total}
        phase={state.phase}
        prNumber={state.prNumber}
        elapsed={state.elapsed}
        cwd={cwd}
        branch={branch}
      />
    </Column>
  );
}

export interface MountOptions {
  onQuit: () => void;
  version?: string;
  cwd?: string;
  branch?: string;
}

export interface MountHandle {
  unmount(): void;
}

/**
 * Mount the Quetz TUI using Rezi. Replaces Ink's render().
 */
export function mount(bus: QuetzBus, opts: MountOptions): MountHandle {
  const { onQuit, version = '', cwd = '', branch = '' } = opts;

  const app = createNodeApp<AppState>({ initialState: createInitialState() });

  const destroyWire = wireAppState(bus, fn => app.update(fn));

  app.view(state => (
    <App state={state} version={version} cwd={cwd} branch={branch} />
  ));

  // Keyboard bindings
  app.keys({
    'q': () => { onQuit(); },
    'ctrl+c': () => { onQuit(); },
    'escape': ({ update, state }) => {
      if (state.mode === 'session_detail') {
        update(s => ({ ...s, mode: 'running' as const, viewingSession: null, sessionLogScrollOffset: 0 }));
      }
    },
    'b': ({ update, state }) => {
      if (state.mode === 'session_detail') {
        update(s => ({ ...s, mode: 'running' as const, viewingSession: null, sessionLogScrollOffset: 0 }));
      }
    },
    'h': ({ update, state }) => {
      if ((state.mode === 'running' || state.mode === 'polling') && state.sessions.length > 0) {
        const idx = state.selectedSessionIdx;
        const session = state.sessions[idx] ?? state.sessions[0];
        if (session) {
          update(s => ({ ...s, viewingSession: session, mode: 'session_detail' as const, sessionLogScrollOffset: 0 }));
        }
      }
    },
    'enter': ({ update, state }) => {
      if ((state.mode === 'running' || state.mode === 'polling') && state.sessions.length > 0) {
        const session = state.sessions[state.selectedSessionIdx] ?? state.sessions[0];
        if (session) {
          update(s => ({ ...s, viewingSession: session, mode: 'session_detail' as const, sessionLogScrollOffset: 0 }));
        }
      }
    },
    'up': ({ update, state }) => {
      if (state.mode === 'session_detail') {
        update(s => ({ ...s, sessionLogScrollOffset: Math.max(0, s.sessionLogScrollOffset - 3) }));
      } else if (state.mode === 'running' || state.mode === 'polling') {
        update(s => ({
          ...s,
          agentAutoScroll: false,
          agentScrollTop: Math.max(0, s.agentScrollTop - 1),
        }));
      }
    },
    'down': ({ update, state }) => {
      if (state.mode === 'session_detail' && state.viewingSession) {
        const totalLines = state.viewingSession.lines.length + 1;
        const termRowsNow = process.stdout.rows ?? 40;
        const maxOffset = sessionDetailMaxOffset(totalLines, termRowsNow);
        update(s => ({
          ...s,
          sessionLogScrollOffset: Math.min(s.sessionLogScrollOffset + 3, maxOffset),
        }));
      } else if (state.mode === 'running' || state.mode === 'polling') {
        update(s => {
          const maxScroll = Math.max(0, s.agentLines.length - 1);
          const next = Math.min(maxScroll, s.agentScrollTop + 1);
          return { ...s, agentScrollTop: next, agentAutoScroll: next >= maxScroll };
        });
      }
    },
    '[': ({ update }) => {
      update(s => ({
        ...s,
        logAutoScroll: false,
        logScrollOffset: Math.min(s.logLines.length, s.logScrollOffset + 3),
      }));
    },
    ']': ({ update }) => {
      update(s => {
        const next = Math.max(0, s.logScrollOffset - 3);
        return { ...s, logScrollOffset: next, logAutoScroll: next === 0 };
      });
    },
  });

  // Start the Rezi event loop (non-blocking)
  app.start().catch(() => { /* ignore stop errors */ });

  return {
    unmount(): void {
      destroyWire();
      app.stop().catch(() => { /* ignore */ });
    },
  };
}
