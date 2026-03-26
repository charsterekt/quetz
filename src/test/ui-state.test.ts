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
      duration: '1:05',
      outcome: 'merged',
    });
    expect(state.sessionComplete).toEqual({ issueId: 'bd-101', elapsed: '1:05' });
    expect(state.bgStatus).toBe('bd-101  |  session complete  |  1:05');

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
    expect(state.bgStatus).toBe('bd-202  |  waiting for merge  |  0:05');

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

    cleanup();
  });
});
