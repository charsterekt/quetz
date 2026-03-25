import type { QuetzBus, QuetzEvent, QuetzPhase } from '../events.js';
import {
  createSessionHistoryState,
  reduceSessionHistory,
  type CompletedSession,
} from './session-history.js';
import type { FailureData } from './components/FailureCard.js';
import type { VictoryData } from './components/VictoryCard.js';

export type ScreenMode = 'running' | 'polling' | 'session_detail' | 'victory' | 'failure';

export interface AgentLine {
  type: 'text' | 'tool' | 'bash' | 'success' | 'error';
  content: string;
  toolName?: string;
}

export interface AppState {
  mode: ScreenMode;
  // Header / progress
  issueId: string;
  issueCount: number;
  total: number;
  snakeFrame: number;
  phase: QuetzPhase;
  // Agent panel
  agentLines: AgentLine[];
  agentScrollTop: number;
  agentAutoScroll: boolean;
  agentMode: 'running' | 'polling';
  agentPrNumber: number | null;
  agentPrBranch: string;
  spinnerFrame: number;
  // Sessions panel
  sessions: CompletedSession[];
  selectedSessionIdx: number;
  // Quetz log panel
  logLines: string[];
  logScrollOffset: number;
  logAutoScroll: boolean;
  // Session detail
  viewingSession: CompletedSession | null;
  sessionLogScrollOffset: number;
  // Footer
  elapsed: string;
  elapsedMs: number;
  prNumber: number | null;
  // Victory / failure overlay
  victoryData: VictoryData | null;
  failureData: FailureData | null;
}

export function createInitialState(): AppState {
  return {
    mode: 'running',
    issueId: '',
    issueCount: 0,
    total: 0,
    snakeFrame: 0,
    phase: 'idle',
    agentLines: [],
    agentScrollTop: 0,
    agentAutoScroll: true,
    agentMode: 'running',
    agentPrNumber: null,
    agentPrBranch: '',
    spinnerFrame: 0,
    sessions: [],
    selectedSessionIdx: 0,
    logLines: [],
    logScrollOffset: 0,
    logAutoScroll: true,
    viewingSession: null,
    sessionLogScrollOffset: 0,
    elapsed: '0m 00s',
    elapsedMs: 0,
    prNumber: null,
    victoryData: null,
    failureData: null,
  };
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

const MAX_AGENT_LINES = 500;
const MAX_LOG_LINES = 200;

function formatLogLine(event: string, payload: Record<string, unknown>): string {
  switch (event) {
    case 'loop:start':      return `START ${payload['total']} issues`;
    case 'loop:mode':       return `MODE ${payload['mode']}`;
    case 'loop:issue_pickup': return `PICKUP ${payload['id']} "${payload['title']}" [P${payload['priority']} ${payload['type']}]`;
    case 'loop:phase': {
      const labels: Record<string, string> = {
        git_reset: 'GIT reset', agent_running: 'AGENT running',
        pr_detecting: 'PR detecting', pr_polling: 'PR polling',
        commit_verifying: 'COMMIT verifying', amend_verifying: 'AMEND verifying',
        completed: 'DONE', error: 'ERROR',
      };
      return labels[payload['phase'] as string] ?? String(payload['phase']);
    }
    case 'loop:pr_found':       return `PR #${payload['number']} "${payload['title']}"`;
    case 'loop:merged':         return `MERGED! ${payload['remaining']} remaining`;
    case 'loop:commit_landed':  return `COMMIT ${payload['issueId']}${payload['hash'] ? ' ' + String(payload['hash']).slice(0, 7) : ''}`;
    case 'loop:amend_complete': return `AMEND ${payload['issueId']} (#${payload['iteration']})`;
    case 'loop:victory':        return `VICTORY ${payload['issuesCompleted']} issues, ${payload['totalTime']}`;
    case 'loop:failure':        return `FAILURE ${payload['reason']}`;
    case 'loop:warning':        return `WARN ${payload['message']}`;
    default: return '';
  }
}

/**
 * Wire QuetzBus events to Rezi state updates.
 * Returns a cleanup function that removes all listeners and timers.
 */
export function wireAppState(
  bus: QuetzBus,
  update: (fn: (s: AppState) => AppState) => void,
): () => void {
  let textBuffer = '';
  let issueStartMs = Date.now();
  let sessionHistoryState = createSessionHistoryState();

  // Timers
  const snakeTimer = setInterval(() => {
    update(s => ({ ...s, snakeFrame: (s.snakeFrame + 1) % 4 }));
  }, 150);

  const spinnerTimer = setInterval(() => {
    update(s => s.agentMode === 'polling' ? { ...s, spinnerFrame: (s.spinnerFrame + 1) % 4 } : s);
  }, 300);

  const elapsedTimer = setInterval(() => {
    update(s => {
      if (!s.issueId) return s;
      const ms = Date.now() - issueStartMs;
      return { ...s, elapsedMs: ms, elapsed: formatElapsed(ms) };
    });
  }, 1000);

  // Bus event handlers
  const onStart = (p: QuetzEvent['loop:start']) => {
    update(s => ({ ...s, total: p.total }));
    const line = formatLogLine('loop:start', p as unknown as Record<string, unknown>);
    if (line) update(s => ({ ...s, logLines: addLogLine(s.logLines, line) }));
  };

  const onPickup = (p: QuetzEvent['loop:issue_pickup']) => {
    issueStartMs = Date.now();
    textBuffer = '';
    sessionHistoryState = reduceSessionHistory(sessionHistoryState, {
      type: 'loop:issue_pickup',
      payload: p,
    });
    const line = formatLogLine('loop:issue_pickup', p as unknown as Record<string, unknown>);
    update(s => ({
      ...s,
      issueId: p.id,
      issueCount: p.iteration,
      total: p.total,
      mode: 'running',
      agentLines: [],
      agentScrollTop: 0,
      agentAutoScroll: true,
      agentMode: 'running',
      agentPrNumber: null,
      agentPrBranch: '',
      spinnerFrame: 0,
      elapsedMs: 0,
      elapsed: '0m 00s',
      prNumber: null,
      viewingSession: null,
      logLines: line ? addLogLine(s.logLines, line) : s.logLines,
    }));
  };

  const onPhase = (p: QuetzEvent['loop:phase']) => {
    sessionHistoryState = reduceSessionHistory(sessionHistoryState, {
      type: 'loop:phase',
      payload: p,
    });
    const line = formatLogLine('loop:phase', p as unknown as Record<string, unknown>);
    update(s => {
      const isPolling = p.phase === 'pr_polling';
      return {
        ...s,
        phase: p.phase,
        mode: isPolling ? 'polling' : s.mode,
        agentMode: isPolling ? 'polling' : p.phase === 'agent_running' ? 'running' : s.agentMode,
        agentPrBranch: p.detail ?? s.agentPrBranch,
        logLines: line ? addLogLine(s.logLines, line) : s.logLines,
      };
    });
  };

  const onPrFound = (p: QuetzEvent['loop:pr_found']) => {
    const line = formatLogLine('loop:pr_found', p as unknown as Record<string, unknown>);
    update(s => ({
      ...s,
      prNumber: p.number,
      agentPrNumber: p.number,
      mode: 'polling',
      agentMode: 'polling',
      logLines: line ? addLogLine(s.logLines, line) : s.logLines,
    }));
  };

  const onMerged = (p: QuetzEvent['loop:merged']) => {
    sessionHistoryState = reduceSessionHistory(sessionHistoryState, { type: 'loop:merged' });
    const line = formatLogLine('loop:merged', p as unknown as Record<string, unknown>);
    update(s => ({
      ...s,
      sessions: sessionHistoryState.completedSessions,
      logLines: line ? addLogLine(s.logLines, line) : s.logLines,
    }));
  };

  const onCommitLanded = (p: QuetzEvent['loop:commit_landed']) => {
    sessionHistoryState = reduceSessionHistory(sessionHistoryState, { type: 'loop:commit_landed' });
    const line = formatLogLine('loop:commit_landed', p as unknown as Record<string, unknown>);
    update(s => ({
      ...s,
      sessions: sessionHistoryState.completedSessions,
      logLines: line ? addLogLine(s.logLines, line) : s.logLines,
    }));
  };

  const onAmendComplete = (p: QuetzEvent['loop:amend_complete']) => {
    sessionHistoryState = reduceSessionHistory(sessionHistoryState, { type: 'loop:amend_complete' });
    const line = formatLogLine('loop:amend_complete', p as unknown as Record<string, unknown>);
    update(s => ({
      ...s,
      sessions: sessionHistoryState.completedSessions,
      logLines: line ? addLogLine(s.logLines, line) : s.logLines,
    }));
  };

  const onVictory = (p: QuetzEvent['loop:victory']) => {
    const line = formatLogLine('loop:victory', p as unknown as Record<string, unknown>);
    update(s => ({
      ...s,
      mode: 'victory',
      victoryData: {
        totalSessions: p.issuesCompleted,
        totalTime: p.totalTime,
        prsMerged: p.prsMerged,
        sessionDate: new Date().toISOString().slice(0, 10),
      },
      logLines: line ? addLogLine(s.logLines, line) : s.logLines,
    }));
  };

  const onFailure = (p: QuetzEvent['loop:failure']) => {
    sessionHistoryState = reduceSessionHistory(sessionHistoryState, { type: 'loop:failure' });
    const line = formatLogLine('loop:failure', p as unknown as Record<string, unknown>);
    update(s => ({
      ...s,
      mode: 'failure',
      sessions: sessionHistoryState.completedSessions,
      failureData: {
        issueId: s.issueId,
        prNumber: p.prNumber ?? null,
        reason: p.reason,
      },
      logLines: line ? addLogLine(s.logLines, line) : s.logLines,
    }));
  };

  const onMode = (p: QuetzEvent['loop:mode']) => {
    const line = formatLogLine('loop:mode', p as unknown as Record<string, unknown>);
    if (line) update(s => ({ ...s, logLines: addLogLine(s.logLines, line) }));
  };

  const onWarning = (p: QuetzEvent['loop:warning']) => {
    const line = formatLogLine('loop:warning', p as unknown as Record<string, unknown>);
    if (line) update(s => ({ ...s, logLines: addLogLine(s.logLines, line) }));
  };

  const onText = (p: QuetzEvent['agent:text']) => {
    sessionHistoryState = reduceSessionHistory(sessionHistoryState, {
      type: 'agent:text',
      payload: p,
    });
    textBuffer += p.text;
    const parts = textBuffer.split('\n');
    textBuffer = parts.pop() ?? '';
    const newLines = parts.filter(l => l.trim()).map(l => ({
      type: 'text' as const, content: l,
    }));
    if (newLines.length === 0) return;
    update(s => {
      const combined = [...s.agentLines, ...newLines];
      const trimmed = combined.length > MAX_AGENT_LINES ? combined.slice(-MAX_AGENT_LINES) : combined;
      return {
        ...s,
        agentLines: trimmed,
        agentScrollTop: s.agentAutoScroll ? Math.max(0, trimmed.length - 1) : s.agentScrollTop,
      };
    });
  };

  const onToolDone = (p: QuetzEvent['agent:tool_done']) => {
    if (textBuffer.trim()) {
      const buffered = textBuffer;
      textBuffer = '';
      update(s => {
        const combined = [...s.agentLines, { type: 'text' as const, content: buffered }];
        const trimmed = combined.length > MAX_AGENT_LINES ? combined.slice(-MAX_AGENT_LINES) : combined;
        return { ...s, agentLines: trimmed };
      });
    }
    sessionHistoryState = reduceSessionHistory(sessionHistoryState, {
      type: 'agent:tool_done',
      payload: { name: p.name, summary: p.summary },
    });
    update(s => {
      const newLine: AgentLine = { type: 'tool', content: p.summary, toolName: p.name };
      const combined = [...s.agentLines, newLine];
      const trimmed = combined.length > MAX_AGENT_LINES ? combined.slice(-MAX_AGENT_LINES) : combined;
      return {
        ...s,
        agentLines: trimmed,
        agentScrollTop: s.agentAutoScroll ? Math.max(0, trimmed.length - 1) : s.agentScrollTop,
      };
    });
  };

  const onStderr = (p: QuetzEvent['agent:stderr']) => {
    sessionHistoryState = reduceSessionHistory(sessionHistoryState, {
      type: 'agent:stderr',
      payload: p,
    });
    const lines = p.data.split('\n')
      .filter(l => l.trim())
      .map(l => ({ type: 'error' as const, content: l }));
    if (lines.length === 0) return;
    update(s => {
      const combined = [...s.agentLines, ...lines];
      const trimmed = combined.length > MAX_AGENT_LINES ? combined.slice(-MAX_AGENT_LINES) : combined;
      return {
        ...s,
        agentLines: trimmed,
        agentScrollTop: s.agentAutoScroll ? Math.max(0, trimmed.length - 1) : s.agentScrollTop,
      };
    });
  };

  bus.on('loop:start', onStart);
  bus.on('loop:mode', onMode);
  bus.on('loop:issue_pickup', onPickup);
  bus.on('loop:phase', onPhase);
  bus.on('loop:pr_found', onPrFound);
  bus.on('loop:merged', onMerged);
  bus.on('loop:commit_landed', onCommitLanded);
  bus.on('loop:amend_complete', onAmendComplete);
  bus.on('loop:victory', onVictory);
  bus.on('loop:failure', onFailure);
  bus.on('loop:warning', onWarning);
  bus.on('agent:text', onText);
  bus.on('agent:tool_done', onToolDone);
  bus.on('agent:stderr', onStderr);

  return () => {
    clearInterval(snakeTimer);
    clearInterval(spinnerTimer);
    clearInterval(elapsedTimer);
    bus.off('loop:start', onStart);
    bus.off('loop:mode', onMode);
    bus.off('loop:issue_pickup', onPickup);
    bus.off('loop:phase', onPhase);
    bus.off('loop:pr_found', onPrFound);
    bus.off('loop:merged', onMerged);
    bus.off('loop:commit_landed', onCommitLanded);
    bus.off('loop:amend_complete', onAmendComplete);
    bus.off('loop:victory', onVictory);
    bus.off('loop:failure', onFailure);
    bus.off('loop:warning', onWarning);
    bus.off('agent:text', onText);
    bus.off('agent:tool_done', onToolDone);
    bus.off('agent:stderr', onStderr);
  };
}

function addLogLine(lines: string[], line: string): string[] {
  const next = [...lines, line];
  return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
}
