// Root Rezi TUI — spec §11, adapted for actual Rezi createNodeApp API

import { ui, rgb } from '@rezi-ui/core';
import { createNodeApp } from '@rezi-ui/node';
import type { QuetzBus } from '../events.js';
import { c, hexToRgb } from './theme.js';
import { wireState, INITIAL_STATE } from './state.js';
import type { AppState } from './state.js';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { AgentPanel } from './components/AgentPanel.js';
import { SessionsPanel } from './components/SessionsPanel.js';
import { LogPanel } from './components/LogPanel.js';
import { SessionDetail } from './components/SessionDetail.js';
import { VictoryCard } from './components/VictoryCard.js';
import { FailureCard } from './components/FailureCard.js';

/** Parse a c.* hex color into an rgb() call */
function fg(hex: string) { const [r, g, b] = hexToRgb(hex); return rgb(r, g, b); }
function bgColor(hex: string) { const [r, g, b] = hexToRgb(hex); return rgb(r, g, b); }

export interface MountOptions {
  bus: QuetzBus;
  version: string;
  onQuit: () => void;
}

export interface AppHandle {
  unmount: () => void;
}

export function mountApp({ bus, version, onQuit }: MountOptions): AppHandle {
  const app = createNodeApp<AppState>({
    initialState: INITIAL_STATE,
  });

  // Wire QuetzBus events → state updates
  const cleanupWire = wireState(bus, app.update);

  // Key bindings
  app.keys({
    q: () => onQuit(),
    'ctrl+c': () => onQuit(),

    up: () => app.update(s => {
      if (s.mode === 'session_detail') {
        return { ...s, sessionLogScrollOffset: Math.max(0, s.sessionLogScrollOffset - 3) };
      }
      if (s.completedSessions.length > 0) {
        const newIdx = s.selectedSessionIdx <= 0
          ? s.completedSessions.length - 1
          : s.selectedSessionIdx - 1;
        return { ...s, selectedSessionIdx: newIdx };
      }
      return {
        ...s,
        agentAutoScroll: false,
        agentScrollOffset: Math.max(0, s.agentScrollOffset - 3),
      };
    }),

    down: () => app.update(s => {
      if (s.mode === 'session_detail') {
        return { ...s, sessionLogScrollOffset: s.sessionLogScrollOffset + 3 };
      }
      if (s.completedSessions.length > 0) {
        const newIdx = s.selectedSessionIdx < 0
          ? 0
          : Math.min(s.selectedSessionIdx + 1, s.completedSessions.length - 1);
        return { ...s, selectedSessionIdx: newIdx };
      }
      const newOffset = s.agentScrollOffset + 3;
      const atBottom = newOffset >= Math.max(0, s.agentLines.length - 1);
      return {
        ...s,
        agentScrollOffset: newOffset,
        agentAutoScroll: atBottom,
      };
    }),

    enter: () => app.update(s => {
      if (s.selectedSessionIdx >= 0 && s.selectedSessionIdx < s.completedSessions.length) {
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

    escape: () => app.update(s => {
      if (s.mode === 'session_detail') {
        return { ...s, mode: s.priorMode, viewingSession: null };
      }
      return { ...s, selectedSessionIdx: -1 };
    }),

    '[': () => app.update(s => {
      const rows = process.stdout.rows ?? 40;
      const bodyRows = rows - 8;
      const sessionsRows = Math.round(bodyRows * 0.24);
      const logVisibleRows = Math.max(1, bodyRows - sessionsRows - 2);
      const currentOffset = s.logAutoScroll
        ? Math.max(0, s.logLines.length - logVisibleRows)
        : s.logScrollOffset;
      return { ...s, logAutoScroll: false, logScrollOffset: Math.max(0, currentOffset - 3) };
    }),

    ']': () => app.update(s => {
      const rows = process.stdout.rows ?? 40;
      const bodyRows = rows - 8;
      const sessionsRows = Math.round(bodyRows * 0.24);
      const logVisibleRows = Math.max(1, bodyRows - sessionsRows - 2);
      const currentOffset = s.logAutoScroll
        ? Math.max(0, s.logLines.length - logVisibleRows)
        : s.logScrollOffset;
      return { ...s, logAutoScroll: false, logScrollOffset: currentOffset + 3 };
    }),
  });

  // View: renders based on current state
  app.view((state: AppState) => {
    const rootBg = bgColor(c.bg);
    const termCols = process.stdout.columns ?? 120;
    const termRows = process.stdout.rows ?? 40;
    const rightCols = Math.max(36, Math.round(termCols * 0.26));
    const bodyRows = termRows - 8;
    const sessionsRows = Math.max(4, Math.round(bodyRows * 0.24));
    const logRows = Math.max(4, bodyRows - sessionsRows);

    if (state.mode === 'victory') {
      return ui.column({ width: 'full', height: 'full', style: { bg: rootBg } }, [
        Header({ mode: state.mode, issueCount: state.issueCount, phase: state.phase, bgStatus: state.bgStatus }),
        VictoryCard({ data: state.victoryData, version }),
      ]);
    }

    if (state.mode === 'failure') {
      return ui.column({ width: 'full', height: 'full', style: { bg: rootBg } }, [
        Header({ mode: state.mode, issueCount: state.issueCount, phase: state.phase, bgStatus: state.bgStatus }),
        FailureCard({ data: state.failureData, version }),
      ]);
    }

    if (state.mode === 'session_detail' && state.viewingSession) {
      return ui.column({ width: 'full', height: 'full', style: { bg: rootBg } }, [
        Header({ mode: state.mode, issueCount: state.issueCount, phase: state.phase, bgStatus: state.bgStatus }),
        SessionDetail({
          session: state.viewingSession,
          scrollOffset: state.sessionLogScrollOffset,
          bgStatus: state.bgStatus,
          version,
        }),
      ]);
    }

    // Screens 1 & 2: running / polling
    return ui.column({ width: 'full', height: 'full', style: { bg: rootBg } }, [
      // Header
      Header({ mode: state.mode, issueCount: state.issueCount, phase: state.phase, bgStatus: state.bgStatus }),

      // Body: agent panel (left) + right column
      ui.row({ width: 'full', flex: 1 }, [
        // Agent panel
        AgentPanel({
          phase: state.phase,
          issueId: state.agentIssueId,
          model: state.agentModel,
          lines: state.agentLines,
          scrollOffset: state.agentScrollOffset,
          autoScroll: state.agentAutoScroll,
          sessionComplete: state.sessionComplete,
          viewportHeight: termRows,
        }),
        // Right column: sessions + log
        ui.column({ width: rightCols, height: 'full' }, [
          SessionsPanel({
            sessions: state.completedSessions,
            selectedIdx: state.selectedSessionIdx,
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

      // Footer
      Footer({ phase: state.phase, issueId: state.issueId, issueCount: state.issueCount, prNumber: state.prNumber, elapsed: state.elapsed, version }),
    ]);
  });

  // Start the app
  app.start();

  return {
    unmount: () => {
      cleanupWire();
      app.stop();
    },
  };
}
