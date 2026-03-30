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
import { LOGO_LINES } from './logo.js';

function bgColor(hex: string) { const [r, g, b] = hexToRgb(hex); return rgb(r, g, b); }

function rightRailWidth(termCols: number): number {
  return Math.max(20, Math.min(Math.round(termCols * 0.265), termCols - 24));
}

const FOOTER_ROWS = 2;
const HEADER_ROWS = LOGO_LINES.length + 3;
const INFO_BAR_ROWS = 2;
const WHEEL_LINES = 3;

export const SCROLL_REGION_IDS = {
  agent: 'agent-scroll-region',
  sessions: 'sessions-scroll-region',
  log: 'log-scroll-region',
  sessionDetail: 'session-detail-scroll-region',
} as const;

function bodyRowCount(termRows: number): number {
  return Math.max(10, termRows - HEADER_ROWS - FOOTER_ROWS);
}

function sessionPanelRows(bodyRows: number): number {
  return Math.max(7, Math.round(bodyRows * 0.31));
}

function visibleSessionRows(termRows: number): number {
  const bodyRows = bodyRowCount(termRows);
  const sessionsRows = sessionPanelRows(bodyRows);
  return Math.max(1, sessionsRows - 2);
}

function agentVisibleRows(termRows: number): number {
  return Math.max(1, bodyRowCount(termRows) - 2);
}

function logVisibleRows(termRows: number): number {
  const bodyRows = bodyRowCount(termRows);
  const sessionsRows = sessionPanelRows(bodyRows);
  const logRows = Math.max(4, bodyRows - sessionsRows);
  return Math.max(1, logRows - 2);
}

function detailVisibleRows(termRows: number): number {
  return Math.max(1, termRows - HEADER_ROWS - INFO_BAR_ROWS - FOOTER_ROWS);
}

function clampScrollOffset(offset: number, maxOffset: number): number {
  return Math.max(0, Math.min(offset, maxOffset));
}

function pointInRect(x: number, y: number, rect: { x: number; y: number; w: number; h: number } | null): boolean {
  return rect != null && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
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

function isOutcomeMode(mode: AppState['mode']): boolean {
  return mode === 'victory' || mode === 'failure';
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
  let viewportCols = process.stdout.columns ?? 120;
  let viewportRows = process.stdout.rows ?? 40;

  const cleanupWire = wireState(bus, app.update);

  app.keys({
    q: () => onQuit(),
    'ctrl+c': () => onQuit(),

    up: () => app.update(s => {
      const termRows = viewportRows;
      if (s.mode === 'session_detail') {
        return { ...s, sessionLogScrollOffset: Math.max(0, s.sessionLogScrollOffset - 3) };
      }
      if (isOutcomeMode(s.mode)) {
        return s;
      }
      if (s.completedSessions.length > 0) {
        const newIdx = s.selectedSessionIdx <= 0
          ? s.completedSessions.length - 1
          : s.selectedSessionIdx - 1;
        return syncSessionViewport({ ...s, focusedPane: 'sessions', selectedSessionIdx: newIdx }, termRows);
      }
      return s;
    }),

    down: () => app.update(s => {
      const termRows = viewportRows;
      if (s.mode === 'session_detail') {
        const maxOffset = Math.max(0, (s.viewingSession?.lines.length ?? 0) - detailVisibleRows(termRows));
        return { ...s, sessionLogScrollOffset: clampScrollOffset(s.sessionLogScrollOffset + 3, maxOffset) };
      }
      if (isOutcomeMode(s.mode)) {
        return s;
      }
      if (s.completedSessions.length > 0) {
        const newIdx = s.selectedSessionIdx < 0
          ? 0
          : Math.min(s.selectedSessionIdx + 1, s.completedSessions.length - 1);
        return syncSessionViewport({ ...s, focusedPane: 'sessions', selectedSessionIdx: newIdx }, termRows);
      }
      return s;
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
          maxAgentHorizontalOffset(s, viewportCols),
          s.agentHorizontalScrollOffset + 8,
        ),
      };
    }),

    enter: () => app.update(s => {
      if (isOutcomeMode(s.mode)) {
        return s;
      }
      if (
        s.mode !== 'session_detail' &&
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
      const termRows = viewportRows;
      if (s.mode === 'session_detail') {
        return syncSessionViewport({
          ...s,
          mode: s.priorMode,
          viewingSession: null,
          focusedPane: 'sessions',
        }, termRows);
      }

      if (isOutcomeMode(s.mode)) {
        return s;
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
        }, viewportRows);
      }
      if (isOutcomeMode(s.mode)) {
        return s;
      }
      return { ...s, focusedPane: 'agent', selectedSessionIdx: -1 };
    }),

    right: () => app.update(s => {
      if (s.mode === 'session_detail' || isOutcomeMode(s.mode) || s.completedSessions.length === 0) return s;
      return syncSessionViewport({
        ...s,
        focusedPane: 'sessions',
        selectedSessionIdx: s.selectedSessionIdx >= 0
          ? s.selectedSessionIdx
          : s.completedSessions.length - 1,
      }, viewportRows);
    }),

    left: () => app.update(s => {
      if (s.mode === 'session_detail' || isOutcomeMode(s.mode)) return s;
      return { ...s, focusedPane: 'agent' };
    }),

    '[': () => app.update(s => {
      const rows = viewportRows;
      const bodyRows = bodyRowCount(rows);
      const sessionsRows = sessionPanelRows(bodyRows);
      const logVisibleRows = Math.max(1, bodyRows - sessionsRows - 3);
      const currentOffset = s.logAutoScroll
        ? Math.max(0, s.logLines.length - logVisibleRows)
        : s.logScrollOffset;
      return { ...s, logAutoScroll: false, logScrollOffset: Math.max(0, currentOffset - 3) };
    }),

    ']': () => app.update(s => {
      const rows = viewportRows;
      const visibleRows = logVisibleRows(rows);
      const currentOffset = s.logAutoScroll
        ? Math.max(0, s.logLines.length - visibleRows)
        : s.logScrollOffset;
      const maxOffset = Math.max(0, s.logLines.length - visibleRows);
      return {
        ...s,
        logAutoScroll: false,
        logScrollOffset: clampScrollOffset(currentOffset + 3, maxOffset),
      };
    }),
  });

  const cleanupEvents = app.onEvent(ev => {
    if (ev.kind !== 'engine') {
      return;
    }

    if (ev.event.kind === 'resize') {
      if ('cols' in ev.event && typeof ev.event.cols === 'number') {
        viewportCols = ev.event.cols;
      }
      if ('rows' in ev.event && typeof ev.event.rows === 'number') {
        viewportRows = ev.event.rows;
      }
      app.update(s => syncSessionViewport({ ...s }, viewportRows));
      return;
    }

    if (ev.event.kind !== 'mouse' || ev.event.mouseKind !== 5) {
      return;
    }

    const { x, y, wheelY } = ev.event;
    if (wheelY === 0) return;

    const delta = wheelY * WHEEL_LINES;
    const agentRect = app.measureElement(SCROLL_REGION_IDS.agent);
    const sessionsRect = app.measureElement(SCROLL_REGION_IDS.sessions);
    const logRect = app.measureElement(SCROLL_REGION_IDS.log);
    const detailRect = app.measureElement(SCROLL_REGION_IDS.sessionDetail);

    app.update(s => {
      const termRows = viewportRows;

      if (s.mode === 'session_detail' && pointInRect(x, y, detailRect) && s.viewingSession) {
        const maxOffset = Math.max(0, s.viewingSession.lines.length - detailVisibleRows(termRows));
        const nextOffset = clampScrollOffset(s.sessionLogScrollOffset + delta, maxOffset);
        return nextOffset === s.sessionLogScrollOffset ? s : { ...s, sessionLogScrollOffset: nextOffset };
      }

      if (pointInRect(x, y, agentRect)) {
        const maxOffset = Math.max(0, s.agentLines.length - agentVisibleRows(termRows));
        const currentOffset = s.agentAutoScroll ? maxOffset : s.agentScrollOffset;
        const nextOffset = clampScrollOffset(currentOffset + delta, maxOffset);
        return nextOffset === currentOffset && !s.agentAutoScroll
          ? s
          : { ...s, agentAutoScroll: false, agentScrollOffset: nextOffset };
      }

      if (pointInRect(x, y, sessionsRect)) {
        const maxOffset = Math.max(0, s.completedSessions.length - visibleSessionRows(termRows));
        const nextOffset = clampScrollOffset(s.sessionsScrollOffset + delta, maxOffset);
        return nextOffset === s.sessionsScrollOffset ? s : { ...s, sessionsScrollOffset: nextOffset };
      }

      if (pointInRect(x, y, logRect)) {
        const maxOffset = Math.max(0, s.logLines.length - logVisibleRows(termRows));
        const currentOffset = s.logAutoScroll ? maxOffset : s.logScrollOffset;
        const nextOffset = clampScrollOffset(currentOffset + delta, maxOffset);
        return nextOffset === currentOffset && !s.logAutoScroll
          ? s
          : { ...s, logAutoScroll: false, logScrollOffset: nextOffset };
      }

      return s;
    });
  });

  app.view((state: AppState) => {
    const rootBg = bgColor(c.bg);
    const termCols = viewportCols;
    const termRows = viewportRows;
    const rightCols = rightRailWidth(termCols);
    const leftCols = Math.max(1, termCols - rightCols);
    const bodyRows = bodyRowCount(termRows);
    const sessionsRows = sessionPanelRows(bodyRows);
    const logRows = Math.max(4, bodyRows - sessionsRows);
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
      viewingSession: state.viewingSession,
      failureData: state.failureData,
    });

    if (state.mode === 'victory' && !state.viewingSession) {
      return ui.column({ width: 'full', height: 'full', style: { bg: rootBg } }, [
        Header({ mode: state.mode, issueCount: state.issueCount, phase: state.phase, bgStatus: state.bgStatus, version, termCols, termRows }),
        VictoryCard({ data: state.victoryData, version }),
        footerNode,
      ]);
    }

    if (state.mode === 'failure' && !state.viewingSession) {
      return ui.column({ width: 'full', height: 'full', style: { bg: rootBg } }, [
        Header({ mode: state.mode, issueCount: state.issueCount, phase: state.phase, bgStatus: state.bgStatus, version, termCols, termRows }),
        FailureCard({ data: state.failureData }),
        footerNode,
      ]);
    }

    if (state.mode === 'session_detail' && state.viewingSession) {
      return ui.column({ width: 'full', height: 'full', style: { bg: rootBg } }, [
        Header({ mode: state.mode, issueCount: state.issueCount, phase: state.phase, bgStatus: state.bgStatus, version, termCols, termRows }),
        SessionDetail({ session: state.viewingSession, scrollOffset: state.sessionLogScrollOffset }),
        footerNode,
      ]);
    }

    return ui.column({ width: 'full', height: 'full', style: { bg: rootBg } }, [
      Header({ mode: state.mode, issueCount: state.issueCount, phase: state.phase, bgStatus: state.bgStatus, version, termCols, termRows }),
      ui.row({ width: 'full', flex: 1 }, [
        AgentPanel({
          width: leftCols,
          height: bodyRows,
          phase: state.phase,
          issueId: state.agentIssueId,
          provider: state.agentProvider,
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
      cleanupEvents();
      try {
        await startPromise;
      } catch {
        return;
      }
      await app.stop();
    },
  };
}
