import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createSessionHistoryState, reduceSessionHistory } from '../../ui/session-history.js';

describe('session history reducer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-22T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('captures tool output, multiline agent text, and finalizes merged sessions', () => {
    let state = createSessionHistoryState();

    state = reduceSessionHistory(state, {
      type: 'loop:issue_pickup',
      payload: { id: 'quetz-1', title: 'Build history view', priority: 1, type: 'feature', iteration: 1, total: 3 },
    });
    state = reduceSessionHistory(state, {
      type: 'loop:phase',
      payload: { phase: 'agent_running', detail: 'sonnet' },
    });
    state = reduceSessionHistory(state, {
      type: 'agent:tool_done',
      payload: { name: 'Read', summary: 'src/ui/App.tsx' },
    });
    state = reduceSessionHistory(state, {
      type: 'agent:text',
      payload: { text: 'Inspecting dashboard\nAdding history panel' },
    });
    vi.advanceTimersByTime(1000);
    state = reduceSessionHistory(state, { type: 'loop:merged' });

    expect(state.activeSession).toBeNull();
    expect(state.completedSessions).toHaveLength(1);
    expect(state.completedSessions[0]).toMatchObject({
      issueId: 'quetz-1',
      outcome: 'merged',
      outcomeLabel: 'Merged',
      model: 'sonnet',
    });
    expect(state.completedSessions[0].lines).toEqual([
      { text: '[Read] src/ui/App.tsx', type: 'tool', toolName: 'Read' },
      { text: 'Inspecting dashboard', type: 'first-text' },
      { text: 'Adding history panel', type: 'text' },
    ]);
  });

  it('records stderr and flushes trailing partial text on failure', () => {
    let state = createSessionHistoryState();

    state = reduceSessionHistory(state, {
      type: 'loop:issue_pickup',
      payload: { id: 'quetz-2', title: 'Handle failures', priority: 1, type: 'bug', iteration: 2, total: 3 },
    });
    state = reduceSessionHistory(state, {
      type: 'agent:text',
      payload: { text: 'Running tests...' },
    });
    state = reduceSessionHistory(state, {
      type: 'agent:stderr',
      payload: { data: 'npm ERR! broken\n' },
    });
    state = reduceSessionHistory(state, { type: 'loop:failure' });

    expect(state.completedSessions[0]).toMatchObject({
      issueId: 'quetz-2',
      outcome: 'failed',
      outcomeLabel: 'Failed',
    });
    expect(state.completedSessions[0].lines).toEqual([
      { text: 'Running tests...', type: 'first-text' },
      { text: 'npm ERR! broken', type: 'stderr' },
    ]);
  });

  it('keeps the newest completed sessions first and caps the list', () => {
    let state = createSessionHistoryState();

    for (let index = 1; index <= 3; index++) {
      state = reduceSessionHistory(state, {
        type: 'loop:issue_pickup',
        payload: { id: `quetz-${index}`, title: `Issue ${index}`, priority: 1, type: 'task', iteration: index, total: 3 },
      });
      state = reduceSessionHistory(state, { type: 'loop:merged' }, 2);
    }

    expect(state.completedSessions.map(session => session.issueId)).toEqual(['quetz-3', 'quetz-2']);
  });
});
