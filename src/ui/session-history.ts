export type SessionTranscriptLineType = 'tool' | 'first-text' | 'text' | 'stderr';

export interface SessionTranscriptLine {
  text: string;
  type: SessionTranscriptLineType;
  toolName?: string;
}

export interface CompletedSession {
  issueId: string;
  title: string;
  priority: number;
  issueType: string;
  iteration: number;
  total: number;
  startedAt: number;
  finishedAt: number;
  model: string;
  outcome: 'merged' | 'local-commit' | 'amend' | 'failed';
  outcomeLabel: string;
  lines: SessionTranscriptLine[];
}

interface ActiveSession {
  issueId: string;
  title: string;
  priority: number;
  issueType: string;
  iteration: number;
  total: number;
  startedAt: number;
  model: string;
  lines: SessionTranscriptLine[];
  textBuffer: string;
  isFirstText: boolean;
}

export interface SessionHistoryState {
  activeSession: ActiveSession | null;
  completedSessions: CompletedSession[];
}

export type SessionHistoryEvent =
  | {
    type: 'loop:issue_pickup';
    payload: { id: string; title: string; priority: number; type: string; iteration: number; total: number };
  }
  | { type: 'loop:phase'; payload: { phase: string; detail?: string } }
  | { type: 'agent:text'; payload: { text: string } }
  | { type: 'agent:tool_done'; payload: { name: string; summary: string } }
  | { type: 'agent:stderr'; payload: { data: string } }
  | { type: 'loop:merged' }
  | { type: 'loop:commit_landed' }
  | { type: 'loop:amend_complete' }
  | { type: 'loop:failure' };

export function createSessionHistoryState(): SessionHistoryState {
  return {
    activeSession: null,
    completedSessions: [],
  };
}

export function reduceSessionHistory(
  state: SessionHistoryState,
  event: SessionHistoryEvent,
  maxSessions: number = 20
): SessionHistoryState {
  switch (event.type) {
    case 'loop:issue_pickup':
      return {
        ...state,
        activeSession: {
          issueId: event.payload.id,
          title: event.payload.title,
          priority: event.payload.priority,
          issueType: event.payload.type,
          iteration: event.payload.iteration,
          total: event.payload.total,
          startedAt: Date.now(),
          model: '',
          lines: [],
          textBuffer: '',
          isFirstText: true,
        },
      };

    case 'loop:phase':
      if (!state.activeSession || event.payload.phase !== 'agent_running' || !event.payload.detail) {
        return state;
      }
      return {
        ...state,
        activeSession: {
          ...state.activeSession,
          model: event.payload.detail,
        },
      };

    case 'agent:text':
      if (!state.activeSession) return state;
      return {
        ...state,
        activeSession: appendText(state.activeSession, event.payload.text),
      };

    case 'agent:tool_done':
      if (!state.activeSession) return state;
      return {
        ...state,
        activeSession: pushToolLine(state.activeSession, event.payload.name, event.payload.summary),
      };

    case 'agent:stderr':
      if (!state.activeSession) return state;
      return {
        ...state,
        activeSession: pushStderr(state.activeSession, event.payload.data),
      };

    case 'loop:merged':
      return finalizeSession(state, 'merged', 'Merged', maxSessions);

    case 'loop:commit_landed':
      return finalizeSession(state, 'local-commit', 'Commit landed', maxSessions);

    case 'loop:amend_complete':
      return finalizeSession(state, 'amend', 'Amended', maxSessions);

    case 'loop:failure':
      return finalizeSession(state, 'failed', 'Failed', maxSessions);
  }
}

function appendText(session: ActiveSession, text: string): ActiveSession {
  const next = { ...session, textBuffer: session.textBuffer + text, lines: [...session.lines] };
  const parts = next.textBuffer.split('\n');
  next.textBuffer = parts.pop() ?? '';

  for (const part of parts) {
    if (!part) continue;
    next.lines.push({
      text: part,
      type: next.isFirstText ? 'first-text' : 'text',
    });
    next.isFirstText = false;
  }

  return next;
}

function pushToolLine(session: ActiveSession, toolName: string, summary: string): ActiveSession {
  const next = flushBuffer({ ...session, lines: [...session.lines] });
  next.lines.push({
    text: `[${toolName}] ${summary}`,
    type: 'tool',
    toolName,
  });
  next.isFirstText = true;
  return next;
}

function pushStderr(session: ActiveSession, data: string): ActiveSession {
  const next = flushBuffer({ ...session, lines: [...session.lines] });
  const chunks = data
    .split(/\r?\n/)
    .map(chunk => chunk.trimEnd())
    .filter(Boolean);

  for (const chunk of chunks) {
    next.lines.push({
      text: chunk,
      type: 'stderr',
    });
  }
  return next;
}

function flushBuffer(session: ActiveSession): ActiveSession {
  if (!session.textBuffer.trim()) {
    return session;
  }

  return {
    ...session,
    lines: [
      ...session.lines,
      {
        text: session.textBuffer,
        type: session.isFirstText ? 'first-text' : 'text',
      },
    ],
    textBuffer: '',
    isFirstText: false,
  };
}

function finalizeSession(
  state: SessionHistoryState,
  outcome: CompletedSession['outcome'],
  outcomeLabel: string,
  maxSessions: number
): SessionHistoryState {
  if (!state.activeSession) return state;

  const session = flushBuffer({ ...state.activeSession, lines: [...state.activeSession.lines] });
  const completed: CompletedSession = {
    issueId: session.issueId,
    title: session.title,
    priority: session.priority,
    issueType: session.issueType,
    iteration: session.iteration,
    total: session.total,
    startedAt: session.startedAt,
    finishedAt: Date.now(),
    model: session.model,
    outcome,
    outcomeLabel,
    lines: session.lines,
  };

  return {
    activeSession: null,
    completedSessions: [completed, ...state.completedSessions].slice(0, maxSessions),
  };
}
