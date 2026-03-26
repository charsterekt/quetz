// State bridge: QuetzBus events → Rezi app state (spec §6, §11)
// Adapted from spec's createSignal pattern to Rezi's app.update() model.

import type { QuetzBus, QuetzPhase, QuetzEvent } from '../events.js';
import { c } from './theme.js';

// ── Screen modes ──────────────────────────────────────────────────
export type ScreenMode = 'running' | 'polling' | 'session_detail' | 'victory' | 'failure';

// ── Data types ────────────────────────────────────────────────────
export interface AgentLine {
  type: 'text' | 'tool';
  content: string;
  toolName?: string;
}

export interface LogLine {
  icon: string;
  color: string;
  text: string;
}

export interface CompletedSession {
  id: string;
  title: string;
  prNumber?: number;
  duration: string;
  outcome: 'merged' | 'failed';
  lines: AgentLine[];
}

export interface SessionCompleteState {
  issueId: string;
  prNumber?: number;
  elapsed: string;
}

export type VictoryData = QuetzEvent['loop:victory'];
export type FailureData = QuetzEvent['loop:failure'];

// ── App state ─────────────────────────────────────────────────────
export interface AppState {
  mode: ScreenMode;

  // Header
  issueCount: { current: number; total: number };
  phase: QuetzPhase;

  // Agent panel
  agentIssueId: string;
  agentModel: string;
  agentLines: AgentLine[];
  agentScrollOffset: number;
  agentAutoScroll: boolean;
  sessionComplete: SessionCompleteState | null;

  // Sessions panel
  completedSessions: CompletedSession[];
  selectedSessionIdx: number;
  sessionsScrollOffset: number;

  // Quetz log panel
  logLines: LogLine[];
  logScrollOffset: number;
  logAutoScroll: boolean;

  // Footer
  issueId: string;
  prNumber: number | null;
  elapsed: string;

  // Session detail
  viewingSession: CompletedSession | null;
  sessionLogScrollOffset: number;

  // Overlays
  victoryData: VictoryData | null;
  failureData: FailureData | null;

  // Background status
  bgStatus: string;
}

export const INITIAL_STATE: AppState = {
  mode: 'running',
  issueCount: { current: 0, total: 0 },
  phase: 'idle',
  agentIssueId: '',
  agentModel: '',
  agentLines: [],
  agentScrollOffset: 0,
  agentAutoScroll: true,
  sessionComplete: null,
  completedSessions: [],
  selectedSessionIdx: -1,
  sessionsScrollOffset: 0,
  logLines: [],
  logScrollOffset: 0,
  logAutoScroll: true,
  issueId: '',
  prNumber: null,
  elapsed: '0:00',
  viewingSession: null,
  sessionLogScrollOffset: 0,
  victoryData: null,
  failureData: null,
  bgStatus: '',
};

const MAX_AGENT_LINES = 500;

/** Format elapsed seconds as "M:SS" */
function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Wire all QuetzBus events to app.update() calls.
 * Returns a cleanup function that removes listeners and clears timers.
 */
export function wireState(
  bus: QuetzBus,
  update: (fn: (prev: AppState) => AppState) => void,
): () => void {
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;
  let elapsedSeconds = 0;
  let sessionStartTime = 0;

  const startElapsedTimer = () => {
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedSeconds = 0;
    sessionStartTime = Date.now();
    elapsedTimer = setInterval(() => {
      elapsedSeconds++;
      update(s => ({ ...s, elapsed: formatElapsed(elapsedSeconds) }));
    }, 1000);
  };

  const stopElapsedTimer = () => {
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
  };

  const addLogLine = (line: LogLine) => {
    update(s => ({ ...s, logLines: [...s.logLines, line] }));
  };

  const onStart = (p: QuetzEvent['loop:start']) => {
    addLogLine({ icon: '▶', color: c.brand, text: `START ${p.total} issues` });
    update(s => ({ ...s, issueCount: { current: 0, total: p.total } }));
  };

  const onPickup = (p: QuetzEvent['loop:issue_pickup']) => {
    addLogLine({ icon: '→', color: c.cyan, text: `PICKUP ${p.id}  ${p.title}  [P${p.priority} ${p.type}]` });
    startElapsedTimer();
    update(s => ({
      ...s,
      issueId: p.id,
      agentIssueId: p.id,
      issueCount: { current: p.iteration, total: p.total },
      agentLines: [],
      agentScrollOffset: 0,
      agentAutoScroll: true,
      sessionComplete: null,
      prNumber: null,
      phase: 'idle',
    }));
  };

  const onPhase = (p: QuetzEvent['loop:phase']) => {
    if (p.phase === 'agent_running') {
      addLogLine({ icon: '·', color: c.dim, text: 'AGENT running' });
    } else if (p.phase === 'completed') {
      addLogLine({ icon: '✓', color: c.brand, text: `AGENT done  (${formatElapsed(elapsedSeconds)})` });
    } else if (p.phase === 'pr_detecting') {
      addLogLine({ icon: '🔍', color: c.dim, text: 'PR search...' });
    } else if (p.phase === 'pr_polling') {
      addLogLine({ icon: '⏳', color: c.accent, text: 'MERGE polling...' });
    }
    update(s => {
      const next: Partial<AppState> = { phase: p.phase };
      if (p.agentModel) next.agentModel = p.agentModel;
      if (p.phase === 'pr_polling') next.mode = 'polling';
      if (p.phase === 'agent_running' && s.mode !== 'session_detail') next.mode = 'running';
      return { ...s, ...next };
    });
  };

  const onText = (p: QuetzEvent['agent:text']) => {
    update(s => ({
      ...s,
      agentLines: [...s.agentLines.slice(-(MAX_AGENT_LINES - 1)), { type: 'text' as const, content: p.text }],
    }));
  };

  const onToolDone = (p: QuetzEvent['agent:tool_done']) => {
    update(s => ({
      ...s,
      agentLines: [...s.agentLines.slice(-(MAX_AGENT_LINES - 1)), { type: 'tool' as const, content: p.summary, toolName: p.name }],
    }));
  };

  const onPrFound = (p: QuetzEvent['loop:pr_found']) => {
    update(s => ({ ...s, prNumber: p.number }));
  };

  const onVictory = (p: QuetzEvent['loop:victory']) => {
    stopElapsedTimer();
    update(s => ({ ...s, mode: 'victory', victoryData: p }));
  };

  const onFailure = (p: QuetzEvent['loop:failure']) => {
    stopElapsedTimer();
    update(s => ({ ...s, mode: 'failure', failureData: p }));
  };

  const onMerged = (p: QuetzEvent['loop:merged']) => {
    stopElapsedTimer();
    const elapsed = formatElapsed(Math.floor((Date.now() - sessionStartTime) / 1000));
    update(s => {
      const session: CompletedSession = {
        id: p.issueId,
        title: p.issueId,
        prNumber: p.prNumber,
        duration: elapsed,
        outcome: 'merged',
        lines: [...s.agentLines],
      };
      return {
        ...s,
        completedSessions: [...s.completedSessions, session],
        sessionComplete: { issueId: p.issueId, prNumber: p.prNumber, elapsed },
      };
    });
  };

  const onCommitLanded = (p: QuetzEvent['loop:commit_landed']) => {
    stopElapsedTimer();
    const elapsed = formatElapsed(Math.floor((Date.now() - sessionStartTime) / 1000));
    update(s => {
      const session: CompletedSession = {
        id: p.issueId,
        title: p.issueId,
        duration: elapsed,
        outcome: 'merged',
        lines: [...s.agentLines],
      };
      return {
        ...s,
        completedSessions: [...s.completedSessions, session],
        sessionComplete: { issueId: p.issueId, elapsed },
      };
    });
  };

  // Register all listeners
  bus.on('loop:start', onStart);
  bus.on('loop:issue_pickup', onPickup);
  bus.on('loop:phase', onPhase);
  bus.on('agent:text', onText);
  bus.on('agent:tool_done', onToolDone);
  bus.on('loop:pr_found', onPrFound);
  bus.on('loop:victory', onVictory);
  bus.on('loop:failure', onFailure);
  bus.on('loop:merged', onMerged);
  bus.on('loop:commit_landed', onCommitLanded);

  // Return cleanup
  return () => {
    stopElapsedTimer();
    bus.off('loop:start', onStart);
    bus.off('loop:issue_pickup', onPickup);
    bus.off('loop:phase', onPhase);
    bus.off('agent:text', onText);
    bus.off('agent:tool_done', onToolDone);
    bus.off('loop:pr_found', onPrFound);
    bus.off('loop:victory', onVictory);
    bus.off('loop:failure', onFailure);
    bus.off('loop:merged', onMerged);
    bus.off('loop:commit_landed', onCommitLanded);
  };
}
