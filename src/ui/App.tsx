// Root Rezi TUI - spec section 11, adapted for the Rezi node app API

import { ui, rgb } from '@rezi-ui/core';
import { createNodeApp } from '@rezi-ui/node';
import type { QuetzBus } from '../events.js';
import { c, hexToRgb } from './theme.js';
import { wireState, INITIAL_STATE } from './state.js';
import type { AgentLine, AppState } from './state.js';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { AgentPanel } from './components/AgentPanel.js';
import { SessionsPanel } from './components/SessionsPanel.js';
import { LogPanel } from './components/LogPanel.js';
import { SessionDetail } from './components/SessionDetail.js';
import { VictoryCard } from './components/VictoryCard.js';
import { FailureCard } from './components/FailureCard.js';

function bgColor(hex: string) { const [r, g, b] = hexToRgb(hex); return rgb(r, g, b); }

function rightRailWidth(termCols: number): number {
  return Math.max(20, Math.min(Math.round(termCols * 0.4), termCols - 24));
}

function bodyRowCount(termRows: number): number {
  return Math.max(10, termRows - 6);
}

function sessionPanelRows(bodyRows: number): number {
  return Math.max(6, Math.round(bodyRows * 0.27));
}

function visibleSessionRows(termRows: number): number {
  const bodyRows = bodyRowCount(termRows);
  const sessionsRows = sessionPanelRows(bodyRows);
  return Math.max(1, sessionsRows - 2);
}

function syncSessionViewport(state: AppState, termRows: number): AppState {
  const visibleRows = visibleSessionRows(termRows);
  const total = state.completedSessions.length;

  if (total === 0) {
    return { ...state, selectedSessionIdx: -1, sessionsScrollOffset: 0 };
  }

  const selectedSessionIdx = Math.max(-1, Math.min(state.selectedSessionIdx, total - 1));
  const maxOffset = Math.max(0, total - visibleRows);
  let sessionsScrollOffset = Math.max(0, Math.min(state.sessionsScrollOffset, maxOffset));

  if (selectedSessionIdx >= 0) {
    if (selectedSessionIdx < sessionsScrollOffset) {
      sessionsScrollOffset = selectedSessionIdx;
    } else if (selectedSessionIdx >= sessionsScrollOffset + visibleRows) {
      sessionsScrollOffset = selectedSessionIdx - visibleRows + 1;
    }
  }

  return {
    ...state,
    selectedSessionIdx,
    sessionsScrollOffset,
  };
}

function agentLineText(line: AgentLine): string {
  return line.type === 'tool'
    ? `> ${(line.toolName ?? '').padEnd(5).slice(0, 5)}   ${line.content}`
    : line.content;
}

function maxAgentHorizontalOffset(state: AppState, termCols: number): number {
  const rightCols = rightRailWidth(termCols);
  const leftCols = Math.max(1, termCols - rightCols);
  const contentWidth = Math.max(1, leftCols - 6);
  const longestLine = state.agentLines.reduce((max, line) => Math.max(max, agentLineText(line).length), 0);
  return Math.max(0, longestLine - contentWidth);
}

function currentSessionSelection(state: AppState): number {
  if (state.completedSessions.length === 0) return -1;
  return state.selectedSessionIdx >= 0
    ? state.selectedSessionIdx
    : state.completedSessions.length - 1;
}

export interface MountOptions {
  bus: QuetzBus;
  version: string;
  onQuit: () => void;
}

export interface AppHandle {
  ready: Promise<void>;
  unmount: () => Promise<void>;
}

export function mountApp({ bus, version, onQuit }: MountOptions): AppHandle {
  const app = createNodeApp<AppState>({
    initialState: INITIAL_STATE,
  });

  const cleanupWire = wireState(bus, app.update);

  app.keys({
    q: () => onQuit(),
    'ctrl+c': () => onQuit(),

    up: () => app.update(s => {
      const termRows = process.stdout.rows ?? 40;
      if (s.mode === 'session_detail') {
        return { ...s, sessionLogScrollOffset: Math.max(0, s.sessionLogScrollOffset - 3) };
      }
      if (s.focusedPane === 'sessions' && s.completedSessions.length > 0) {
        const newIdx = s.selectedSessionIdx <= 0
          ? s.completedSessions.length - 1
          : s.selectedSessionIdx - 1;
        return syncSessionViewport({ ...s, selectedSessionIdx: newIdx }, termRows);
      }
      return {
        ...s,
        agentAutoScroll: false,
        agentScrollOffset: Math.max(0, s.agentScrollOffset - 3),
      };
    }),

    down: () => app.update(s => {
      const termRows = process.stdout.rows ?? 40;
      if (s.mode === 'session_detail') {
        return { ...s, sessionLogScrollOffset: s.sessionLogScrollOffset + 3 };
      }
      if (s.focusedPane === 'sessions' && s.completedSessions.length > 0) {
        const newIdx = s.selectedSessionIdx < 0
          ? 0
          : Math.min(s.selectedSessionIdx + 1, s.completedSessions.length - 1);
        return syncSessionViewport({ ...s, selectedSessionIdx: newIdx }, termRows);
      }
      const newOffset = s.agentScrollOffset + 3;
      const atBottom = newOffset >= Math.max(0, s.agentLines.length - 1);
      return {
        ...s,
        agentScrollOffset: newOffset,
        agentAutoScroll: atBottom,
      };
    }),

    ',': () => app.update(s => {
      if (s.mode === 'session_detail' || s.focusedPane !== 'agent' || s.sessionComplete) return s;
      return {
        ...s,
        agentHorizontalScrollOffset: Math.max(0, s.agentHorizontalScrollOffset - 8),
      };
    }),

    '.': () => app.update(s => {
      if (s.mode === 'session_detail' || s.focusedPane !== 'agent' || s.sessionComplete) return s;
      return {
        ...s,
        agentHorizontalScrollOffset: Math.min(
          maxAgentHorizontalOffset(s, process.stdout.columns ?? 120),
          s.agentHorizontalScrollOffset + 8,
        ),
      };
    }),

    enter: () => app.update(s => {
      if (
        s.focusedPane === 'sessions' &&
        s.selectedSessionIdx >= 0 &&
        s.selectedSessionIdx < s.completedSessions.length
      ) {
        return {
          ...s,
          viewingSession: s.completedSessions[s.selectedSessionIdx],
          priorMode: s.mode,
          mode: 'session_detail',
          sessionLogScrollOffset: 0,
        };
      }
      return s;
    }),

    h: () => app.update(s => {
      const termRows = process.stdout.rows ?? 40;
      if (s.mode === 'session_detail') {
        return syncSessionViewport({
          ...s,
          mode: s.priorMode,
          viewingSession: null,
          focusedPane: 'sessions',
        }, termRows);
      }

      if (s.completedSessions.length === 0) return s;

      const selectedSessionIdx = currentSessionSelection(s);
      const nextState = syncSessionViewport({
        ...s,
        focusedPane: 'sessions',
        selectedSessionIdx,
      }, termRows);

      if (s.mode === 'victory' || s.mode === 'failure' || s.focusedPane === 'sessions') {
        return {
          ...nextState,
          viewingSession: nextState.completedSessions[nextState.selectedSessionIdx] ?? null,
          priorMode: s.mode,
          mode: 'session_detail',
          sessionLogScrollOffset: 0,
        };
      }

      return nextState;
    }),

    escape: () => app.update(s => {
      if (s.mode === 'session_detail') {
        return syncSessionViewport({
          ...s,
          mode: s.priorMode,
          viewingSession: null,
          focusedPane: 'sessions',
        }, process.stdout.rows ?? 40);
      }
      return { ...s, focusedPane: 'agent', selectedSessionIdx: -1 };
    }),

    right: () => app.update(s => {
      if (s.mode === 'session_detail' || s.completedSessions.length === 0) return s;
      return syncSessionViewport({
        ...s,
        focusedPane: 'sessions',
        selectedSessionIdx: s.selectedSessionIdx >= 0
          ? s.selectedSessionIdx
          : s.completedSessions.length - 1,
      }, process.stdout.rows ?? 40);
    }),

    left: () => app.update(s => {
      if (s.mode === 'session_detail') return s;
      return { ...s, focusedPane: 'agent' };
    }),

    '[': () => app.update(s => {
      const rows = process.stdout.rows ?? 40;
      const bodyRows = bodyRowCount(rows);
      const sessionsRows = sessionPanelRows(bodyRows);
      const logVisibleRows = Math.max(1, bodyRows - sessionsRows - 3);
      const currentOffset = s.logAutoScroll
        ? Math.max(0, s.logLines.length - logVisibleRows)
        : s.logScrollOffset;
      return { ...s, logAutoScroll: false, logScrollOffset: Math.max(0, currentOffset - 3) };
    }),

    ']': () => app.update(s => {
      const rows = process.stdout.rows ?? 40;
      const bodyRows = bodyRowCount(rows);
      const sessionsRows = sessionPanelRows(bodyRows);
      const logVisibleRows = Math.max(1, bodyRows - sessionsRows - 3);
      const currentOffset = s.logAutoScroll
        ? Math.max(0, s.logLines.length - logVisibleRows)
        : s.logScrollOffset;
      return { ...s, logAutoScroll: false, logScrollOffset: currentOffset + 3 };
    }),
  });

  app.view((state: AppState) => {
    const rootBg = bgColor(c.bg);
    const termCols = process.stdout.columns ?? 120;
    const termRows = process.stdout.rows ?? 40;
    const rightCols = rightRailWidth(termCols);
    const leftCols = Math.max(1, termCols - rightCols);
    const bodyRows = bodyRowCount(termRows);
    const sessionsRows = sessionPanelRows(bodyRows);
    const logRows = Math.max(4, bodyRows - sessionsRows - 1);
    const footerNode = Footer({
      mode: state.mode,
      focusedPane: state.focusedPane,
      hasHistory: state.completedSessions.length > 0,
      phase: state.phase,
      issueId: state.issueId,
      issueCount: state.issueCount,
      prNumber: state.prNumber,
      elapsed: state.elapsed,
      version,
    });

    if (state.mode === 'victory' && !state.viewingSession) {
      return ui.column({ width: 'full', height: 'full', style: { bg: rootBg } }, [
        Header({ mode: state.mode, issueCount: state.issueCount, phase: state.phase, bgStatus: state.bgStatus }),
        VictoryCard({ data: state.victoryData, version }),
        footerNode,
      ]);
    }

    if (state.mode === 'failure' && !state.viewingSession) {
      return ui.column({ width: 'full', height: 'full', style: { bg: rootBg } }, [
        Header({ mode: state.mode, issueCount: state.issueCount, phase: state.phase, bgStatus: state.bgStatus }),
        FailureCard({ data: state.failureData }),
        footerNode,
      ]);
    }

    if (state.mode === 'session_detail' && state.viewingSession) {
      return ui.column({ width: 'full', height: 'full', style: { bg: rootBg } }, [
        Header({ mode: state.mode, issueCount: state.issueCount, phase: state.phase, bgStatus: state.bgStatus }),
        SessionDetail({ session: state.viewingSession, scrollOffset: state.sessionLogScrollOffset }),
        footerNode,
      ]);
    }

    return ui.column({ width: 'full', height: 'full', style: { bg: rootBg } }, [
      Header({ mode: state.mode, issueCount: state.issueCount, phase: state.phase, bgStatus: state.bgStatus }),
      ui.row({ width: 'full', flex: 1 }, [
        AgentPanel({
          width: leftCols,
          height: bodyRows,
          phase: state.phase,
          issueId: state.agentIssueId,
          model: state.agentModel,
          effort: state.agentEffort,
          lines: state.agentLines,
          scrollOffset: state.agentScrollOffset,
          horizontalScrollOffset: state.agentHorizontalScrollOffset,
          autoScroll: state.agentAutoScroll,
          sessionComplete: state.sessionComplete,
        }),
        ui.column({ width: rightCols, height: 'full' }, [
          SessionsPanel({
            sessions: state.completedSessions,
            selectedIdx: state.selectedSessionIdx,
            isFocused: state.focusedPane === 'sessions',
            scrollOffset: state.sessionsScrollOffset,
            width: rightCols,
            height: sessionsRows,
          }),
          ui.box({ width: 'full', height: 1, style: { bg: bgColor(c.border) } }),
          LogPanel({
            lines: state.logLines,
            scrollOffset: state.logScrollOffset,
            autoScroll: state.logAutoScroll,
            width: rightCols,
            height: logRows,
          }),
        ]),
      ]),
      footerNode,
    ]);
  });

  const startPromise = app.start();
  let unmounted = false;

  return {
    ready: startPromise,
    unmount: async () => {
      if (unmounted) return;
      unmounted = true;
      cleanupWire();
      try {
        await startPromise;
      } catch {
        return;
      }
      await app.stop();
    },
  };
}
