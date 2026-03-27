import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBus } from '../events.js';
import { INITIAL_STATE, wireState, type AppState } from '../ui/state.js';

function cloneState(): AppState {
  return {
    ...INITIAL_STATE,
    issueCount: { ...INITIAL_STATE.issueCount },
    agentLines: [...INITIAL_STATE.agentLines],
    completedSessions: [...INITIAL_STATE.completedSessions],
    logLines: [...INITIAL_STATE.logLines],
    victoryData: INITIAL_STATE.victoryData,
    failureData: INITIAL_STATE.failureData,
  };
}

describe('wireState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records amend completion as a finished session with the picked issue title', () => {
    const bus = createBus();
    let state = cloneState();
    const cleanup = wireState(bus, updater => {
      state = updater(state);
    });

    bus.emit('loop:issue_pickup', {
      id: 'bd-101',
      title: 'Preserve session history labels',
      priority: 1,
      type: 'bug',
      iteration: 1,
      total: 3,
    });
    vi.advanceTimersByTime(65_000);
    bus.emit('loop:amend_complete', { issueId: 'bd-101', iteration: 1 });

    expect(state.completedSessions).toHaveLength(1);
    expect(state.completedSessions[0]).toMatchObject({
      id: 'bd-101',
      title: 'Preserve session history labels',
      duration: '1m 05s',
      outcome: 'merged',
    });
    expect(state.phase).toBe('completed');
    expect(state.sessionComplete).toEqual({ issueId: 'bd-101', elapsed: '1m 05s' });
    expect(state.bgStatus).toBe('bd-101  |  session complete  |  1m 05s');

    cleanup();
  });

  it('keeps session detail open while background phase changes continue', () => {
    const bus = createBus();
    let state = { ...cloneState(), mode: 'session_detail' as const };
    const cleanup = wireState(bus, updater => {
      state = updater(state);
    });

    bus.emit('loop:issue_pickup', {
      id: 'bd-202',
      title: 'Keep detail open during polling',
      priority: 2,
      type: 'bug',
      iteration: 2,
      total: 4,
    });
    state = { ...state, mode: 'session_detail' };
    bus.emit('loop:phase', { phase: 'pr_polling' });
    vi.advanceTimersByTime(5_000);

    expect(state.mode).toBe('session_detail');
    expect(state.phase).toBe('pr_polling');
    expect(state.bgStatus).toBe('bd-202  |  waiting for merge  |  0m 05s');

    cleanup();
  });

  it('promotes PR-found sessions into the agent summary immediately', () => {
    const bus = createBus();
    let state = cloneState();
    const cleanup = wireState(bus, updater => {
      state = updater(state);
    });

    bus.emit('loop:issue_pickup', {
      id: 'bd-222',
      title: 'Show session summary on PR detection',
      priority: 2,
      type: 'task',
      iteration: 1,
      total: 3,
    });
    bus.emit('loop:pr_found', {
      number: 42,
      title: 'feat: show session summary on PR detection',
      url: 'https://example.test/pr/42',
    });

    expect(state.sessionComplete).toEqual({
      issueId: 'bd-222',
      prNumber: 42,
      elapsed: '0m 00s',
    });

    vi.advanceTimersByTime(5_000);

    expect(state.sessionComplete).toEqual({
      issueId: 'bd-222',
      prNumber: 42,
      elapsed: '0m 05s',
    });

    bus.emit('loop:phase', { phase: 'pr_polling' });
    expect(state.mode).toBe('polling');

    cleanup();
  });

  it('reuses the picked issue title when commits land', () => {
    const bus = createBus();
    let state = cloneState();
    const cleanup = wireState(bus, updater => {
      state = updater(state);
    });

    bus.emit('loop:issue_pickup', {
      id: 'bd-303',
      title: 'Use human title in sessions panel',
      priority: 3,
      type: 'bug',
      iteration: 1,
      total: 1,
    });
    bus.emit('loop:commit_landed', { issueId: 'bd-303', hash: 'abc1234' });

    expect(state.completedSessions).toHaveLength(1);
    expect(state.completedSessions[0].title).toBe('Use human title in sessions panel');
    expect(state.phase).toBe('completed');

    cleanup();
  });

  it('records failed runs in completed session history with failed outcome', () => {
    const bus = createBus();
    let state = cloneState();
    const cleanup = wireState(bus, updater => {
      state = updater(state);
    });

    bus.emit('loop:issue_pickup', {
      id: 'bd-404',
      title: 'Capture failed runs',
      priority: 1,
      type: 'bug',
      iteration: 1,
      total: 1,
    });
    bus.emit('loop:pr_found', {
      number: 84,
      title: 'feat: capture failed runs',
      url: 'https://example.test/pr/84',
    });
    vi.advanceTimersByTime(8_000);
    bus.emit('loop:failure', {
      reason: 'CI failed',
      detail: 'tests did not pass',
      prNumber: 84,
    });

    expect(state.completedSessions).toHaveLength(1);
    expect(state.completedSessions[0]).toMatchObject({
      id: 'bd-404',
      title: 'Capture failed runs',
      prNumber: 84,
      duration: '0m 08s',
      outcome: 'failed',
    });
    expect(state.phase).toBe('error');
    expect(state.bgStatus).toBe('bd-404  |  error  |  0m 08s');

    cleanup();
  });

  it('keeps completed status context visible after the loop reaches victory', () => {
    const bus = createBus();
    let state = cloneState();
    const cleanup = wireState(bus, updater => {
      state = updater(state);
    });

    bus.emit('loop:issue_pickup', {
      id: 'bd-505',
      title: 'Keep outcome footer context',
      priority: 1,
      type: 'bug',
      iteration: 3,
      total: 3,
    });
    vi.advanceTimersByTime(9_000);
    bus.emit('loop:merged', { issueId: 'bd-505', prNumber: 77, remaining: 0 });
    bus.emit('loop:victory', {
      issuesCompleted: 3,
      totalTime: '9m 00s',
      prsMerged: 3,
      mode: 'pr',
    });

    expect(state.mode).toBe('victory');
    expect(state.phase).toBe('completed');
    expect(state.bgStatus).toBe('bd-505  |  session complete  |  0m 09s');

    cleanup();
  });

  it('clears stale agent metadata when a new issue is picked up', () => {
    const bus = createBus();
    let state = {
      ...cloneState(),
      agentModel: 'sonnet',
      agentEffort: 'high',
    };
    const cleanup = wireState(bus, updater => {
      state = updater(state);
    });

    bus.emit('loop:issue_pickup', {
      id: 'bd-404',
      title: 'Reset header metadata',
      priority: 2,
      type: 'task',
      iteration: 2,
      total: 5,
    });

    expect(state.agentModel).toBe('');
    expect(state.agentEffort).toBe('');

    cleanup();
  });

  it('does not perform re-entrant updates for loop:start, issue pickup, and phase events', () => {
    const bus = createBus();
    let state = cloneState();
    let inFlight = false;

    const cleanup = wireState(bus, updater => {
      if (inFlight) {
        throw new Error('re-entrant update');
      }

      inFlight = true;
      try {
        state = updater(state);
      } finally {
        inFlight = false;
      }
    });

    expect(() => {
      bus.emit('loop:start', { total: 3 });
      bus.emit('loop:issue_pickup', {
        id: 'mock-001',
        title: 'Create mock-output-a.txt',
        priority: 1,
        type: 'chore',
        iteration: 1,
        total: 3,
      });
      bus.emit('loop:phase', { phase: 'agent_running', agentModel: 'sonnet', agentEffort: 'medium' });
      bus.emit('loop:phase', { phase: 'pr_polling' });
    }).not.toThrow();

    expect(state.issueCount).toEqual({ current: 1, total: 3 });
    expect(state.issueId).toBe('mock-001');
    expect(state.agentModel).toBe('sonnet');
    expect(state.agentEffort).toBe('medium');
    expect(state.mode).toBe('polling');
    expect(state.logLines).toHaveLength(4);

    cleanup();
  });
});
