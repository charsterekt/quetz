// State bridge: QuetzBus events -> Rezi app state (spec 6, 11)
// Adapted from the spec's createSignal pattern to Rezi's app.update() model.

import type { QuetzBus, QuetzEvent, QuetzPhase } from '../events.js';
import { c } from './theme.js';

export type ScreenMode = 'running' | 'polling' | 'session_detail' | 'victory' | 'failure';
export type FocusPane = 'agent' | 'sessions';

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
export type FailureData = QuetzEvent['loop:failure'] & {
  issueId?: string;
  elapsed?: string;
  failedChecks?: string;
};

export interface AppState {
  mode: ScreenMode;
  focusedPane: FocusPane;
  issueCount: { current: number; total: number };
  phase: QuetzPhase;
  agentIssueId: string;
  currentIssueTitle: string;
  agentProvider: string;
  agentModel: string;
  agentEffort: string;
  agentLines: AgentLine[];
  agentScrollOffset: number;
  agentHorizontalScrollOffset: number;
  agentAutoScroll: boolean;
  sessionComplete: SessionCompleteState | null;
  completedSessions: CompletedSession[];
  selectedSessionIdx: number;
  sessionsScrollOffset: number;
  logLines: LogLine[];
  logScrollOffset: number;
  logAutoScroll: boolean;
  issueId: string;
  prNumber: number | null;
  elapsed: string;
  viewingSession: CompletedSession | null;
  sessionLogScrollOffset: number;
  priorMode: ScreenMode;
  victoryData: VictoryData | null;
  failureData: FailureData | null;
  bgStatus: string;
}

export const INITIAL_STATE: AppState = {
  mode: 'running',
  focusedPane: 'agent',
  issueCount: { current: 0, total: 0 },
  phase: 'idle',
  agentIssueId: '',
  currentIssueTitle: '',
  agentProvider: '',
  agentModel: '',
  agentEffort: '',
  agentLines: [],
  agentScrollOffset: 0,
  agentHorizontalScrollOffset: 0,
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
  elapsed: '0m 00s',
  viewingSession: null,
  sessionLogScrollOffset: 0,
  priorMode: 'running',
  victoryData: null,
  failureData: null,
  bgStatus: '',
};

const MAX_AGENT_LINES = 500;

function phaseStatusLabel(phase: QuetzPhase): string {
  switch (phase) {
    case 'agent_running':
      return 'agent running';
    case 'pr_detecting':
      return 'finding pr';
    case 'pr_polling':
      return 'waiting for merge';
    case 'commit_verifying':
      return 'verifying commit';
    case 'amend_verifying':
      return 'verifying amend';
    case 'completed':
      return 'session complete';
    case 'error':
      return 'error';
    case 'fetching':
      return 'fetching issue';
    case 'git_reset':
      return 'resetting git';
    case 'assembling':
      return 'assembling context';
    case 'idle':
    default:
      return 'preparing';
  }
}

function buildBgStatus(issueId: string, phase: QuetzPhase, elapsed: string): string {
  if (!issueId) return '';
  return `${issueId}  |  ${phaseStatusLabel(phase)}  |  ${elapsed}`;
}

function buildCompletedSession(
  state: AppState,
  issueId: string,
  duration: string,
  outcome: CompletedSession['outcome'],
  extras: Partial<Pick<CompletedSession, 'prNumber'>> = {},
): CompletedSession {
  return {
    id: issueId,
    title: state.currentIssueTitle || issueId,
    duration,
    outcome,
    lines: [...state.agentLines],
    ...extras,
  };
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function phaseLogLine(phase: QuetzPhase, elapsedSeconds: number): LogLine | null {
  switch (phase) {
    case 'agent_running':
      return { icon: '·', color: c.dim, text: 'AGENT running' };
    case 'completed':
      return { icon: '✓', color: c.brand, text: `AGENT done  (${formatElapsed(elapsedSeconds)})` };
    case 'pr_detecting':
      return { icon: '🔍', color: c.dim, text: 'PR search...' };
    case 'pr_polling':
      return { icon: '⏳', color: c.accent, text: 'MERGE polling...' };
    default:
      return null;
  }
}

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
      update(s => {
        const elapsed = formatElapsed(elapsedSeconds);
        return {
          ...s,
          elapsed,
          sessionComplete: s.sessionComplete
            ? { ...s.sessionComplete, elapsed }
            : s.sessionComplete,
          bgStatus: buildBgStatus(s.issueId, s.phase, elapsed),
        };
      });
    }, 1000);
  };

  const stopElapsedTimer = () => {
    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
  };

  const onStart = (p: QuetzEvent['loop:start']) => {
    update(s => ({
      ...s,
      logLines: [...s.logLines, { icon: '▶', color: c.brand, text: `START ${p.total} issues` }],
      issueCount: { current: 0, total: p.total },
    }));
  };

  const onPickup = (p: QuetzEvent['loop:issue_pickup']) => {
    startElapsedTimer();
    update(s => ({
      ...s,
      logLines: [
        ...s.logLines,
        { icon: '→', color: c.cyan, text: `PICKUP ${p.id}  ${p.title}  [P${p.priority} ${p.type}]` },
      ],
      issueId: p.id,
      agentIssueId: p.id,
      currentIssueTitle: p.title,
      agentProvider: '',
      agentModel: '',
      agentEffort: '',
      issueCount: { current: p.iteration, total: p.total },
      agentLines: [],
      agentScrollOffset: 0,
      agentHorizontalScrollOffset: 0,
      agentAutoScroll: true,
      sessionComplete: null,
      prNumber: null,
      phase: 'idle',
      elapsed: '0m 00s',
      victoryData: null,
      failureData: null,
      bgStatus: buildBgStatus(p.id, 'idle', '0m 00s'),
    }));
  };

  const onPhase = (p: QuetzEvent['loop:phase']) => {
    const logLine = phaseLogLine(p.phase, elapsedSeconds);
    update(s => {
      const next: Partial<AppState> = {
        phase: p.phase,
        bgStatus: buildBgStatus(s.issueId, p.phase, s.elapsed),
      };

      if (p.agentProvider) next.agentProvider = p.agentProvider;
      if (p.agentModel) next.agentModel = p.agentModel;
      if (p.agentEffort) next.agentEffort = p.agentEffort;
      if (s.mode !== 'session_detail') {
        if (p.phase === 'pr_polling') next.mode = 'polling';
        if (p.phase === 'agent_running') next.mode = 'running';
      }

      return {
        ...s,
        ...(logLine ? { logLines: [...s.logLines, logLine] } : {}),
        ...next,
      };
    });
  };

  const onText = (p: QuetzEvent['agent:text']) => {
    update(s => ({
      ...s,
      agentLines: [...s.agentLines.slice(-(MAX_AGENT_LINES - 1)), { type: 'text', content: p.text }],
    }));
  };

  const onToolDone = (p: QuetzEvent['agent:tool_done']) => {
    update(s => ({
      ...s,
      agentLines: [
        ...s.agentLines.slice(-(MAX_AGENT_LINES - 1)),
        { type: 'tool', content: p.summary, toolName: p.name },
      ],
    }));
  };

  const onPrFound = (p: QuetzEvent['loop:pr_found']) => {
    const elapsed = formatElapsed(Math.floor((Date.now() - sessionStartTime) / 1000));
    update(s => ({
      ...s,
      prNumber: p.number,
      sessionComplete: {
        issueId: s.issueId,
        prNumber: p.number,
        elapsed,
      },
    }));
  };

  const onVictory = (p: QuetzEvent['loop:victory']) => {
    stopElapsedTimer();
    update(s => {
      const issueId = s.sessionComplete?.issueId ?? s.issueId;
      const elapsed = s.sessionComplete?.elapsed ?? s.elapsed;
      return {
        ...s,
        mode: 'victory',
        phase: 'completed',
        focusedPane: 'agent',
        selectedSessionIdx: -1,
        viewingSession: null,
        victoryData: p,
        bgStatus: buildBgStatus(issueId, 'completed', elapsed),
      };
    });
  };

  const onFailure = (p: QuetzEvent['loop:failure']) => {
    stopElapsedTimer();
    const elapsed = formatElapsed(Math.floor((Date.now() - sessionStartTime) / 1000));
    update(s => {
      const issueId = s.issueId || s.agentIssueId;
      const prNumber = p.prNumber ?? s.sessionComplete?.prNumber;
      const failureData: FailureData = {
        ...p,
        issueId: issueId || undefined,
        elapsed,
        failedChecks: p.reason === 'CI failed' ? p.detail : undefined,
        prNumber,
      };
      return {
        ...s,
        mode: 'failure',
        phase: 'error',
        focusedPane: 'agent',
        selectedSessionIdx: -1,
        viewingSession: null,
        elapsed,
        prNumber: prNumber ?? s.prNumber,
        sessionComplete: issueId
          ? {
              issueId,
              ...(prNumber != null ? { prNumber } : {}),
              elapsed,
            }
          : s.sessionComplete,
        failureData,
        completedSessions: issueId
          ? [...s.completedSessions, buildCompletedSession(s, issueId, elapsed, 'failed', { prNumber })]
          : s.completedSessions,
        bgStatus: buildBgStatus(issueId, 'error', elapsed),
      };
    });
  };

  const onMerged = (p: QuetzEvent['loop:merged']) => {
    stopElapsedTimer();
    const elapsed = formatElapsed(Math.floor((Date.now() - sessionStartTime) / 1000));
    update(s => {
      const session = buildCompletedSession(s, p.issueId, elapsed, 'merged', { prNumber: p.prNumber });
      return {
        ...s,
        phase: 'completed',
        elapsed,
        completedSessions: [...s.completedSessions, session],
        sessionComplete: { issueId: p.issueId, prNumber: p.prNumber, elapsed },
        bgStatus: buildBgStatus(p.issueId, 'completed', elapsed),
      };
    });
  };

  const onCommitLanded = (p: QuetzEvent['loop:commit_landed']) => {
    stopElapsedTimer();
    const elapsed = formatElapsed(Math.floor((Date.now() - sessionStartTime) / 1000));
    update(s => {
      const session = buildCompletedSession(s, p.issueId, elapsed, 'merged');
      return {
        ...s,
        phase: 'completed',
        elapsed,
        completedSessions: [...s.completedSessions, session],
        sessionComplete: { issueId: p.issueId, elapsed },
        bgStatus: buildBgStatus(p.issueId, 'completed', elapsed),
      };
    });
  };

  const onAmendComplete = (p: QuetzEvent['loop:amend_complete']) => {
    stopElapsedTimer();
    const elapsed = formatElapsed(Math.floor((Date.now() - sessionStartTime) / 1000));
    update(s => {
      const session = buildCompletedSession(s, p.issueId, elapsed, 'merged');
      return {
        ...s,
        phase: 'completed',
        elapsed,
        completedSessions: [...s.completedSessions, session],
        sessionComplete: { issueId: p.issueId, elapsed },
        bgStatus: buildBgStatus(p.issueId, 'completed', elapsed),
      };
    });
  };

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
  bus.on('loop:amend_complete', onAmendComplete);

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
    bus.off('loop:amend_complete', onAmendComplete);
  };
}
