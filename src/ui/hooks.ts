import { useState, useEffect, useRef } from 'react';
import type { QuetzBus, QuetzEventName, QuetzEvent, QuetzPhase } from '../events.js';
import { createSessionHistoryState, reduceSessionHistory, type SessionHistoryState } from './session-history.js';

export interface ProgressState {
  iteration: number;
  total: number;
}

/**
 * Lightweight hook for progress bar: only re-renders on pickup/start events,
 * never on a timer tick. Keeps the timer isolated to StatusBar only (quetz-nc4).
 */
export function useProgress(bus: QuetzBus): ProgressState {
  const [state, setState] = useState<ProgressState>({ iteration: 0, total: 0 });

  useEffect(() => {
    const onPickup = (p: QuetzEvent['loop:issue_pickup']) => {
      setState({ iteration: p.iteration, total: p.total });
    };
    const onStart = (p: QuetzEvent['loop:start']) => {
      setState(prev => ({ ...prev, total: p.total }));
    };

    bus.on('loop:issue_pickup', onPickup);
    bus.on('loop:start', onStart);

    return () => {
      bus.off('loop:issue_pickup', onPickup);
      bus.off('loop:start', onStart);
    };
  }, [bus]);

  return state;
}

export function useEventLog(
  bus: QuetzBus,
  eventNames: QuetzEventName[],
  formatter: (event: QuetzEventName, payload: any) => string,
  maxLines: number = 200
): string[] {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    const handlers: Array<{ event: QuetzEventName; fn: (p: any) => void }> = [];
    for (const event of eventNames) {
      const fn = (payload: any) => {
        const line = formatter(event, payload);
        if (line) {
          setLines(prev => {
            const next = [...prev, line];
            return next.length > maxLines ? next.slice(-maxLines) : next;
          });
        }
      };
      bus.on(event, fn);
      handlers.push({ event, fn });
    }
    return () => {
      for (const { event, fn } of handlers) bus.off(event, fn);
    };
  }, [bus, eventNames, formatter, maxLines]);

  return lines;
}

export interface PhaseState {
  phase: QuetzPhase;
  issueId: string;
  issueTitle: string;
  agentModel: string;
  iteration: number;
  total: number;
  elapsed: string;
  prNumber?: number;
  prUrl?: string;
}

export function usePhase(bus: QuetzBus): PhaseState {
  const [state, setState] = useState<PhaseState>({
    phase: 'idle',
    issueId: '',
    issueTitle: '',
    agentModel: '',
    iteration: 0,
    total: 0,
    elapsed: '0m 00s',
  });
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    const onPickup = (p: QuetzEvent['loop:issue_pickup']) => {
      startRef.current = Date.now();
      setState(prev => ({ ...prev, issueId: p.id, issueTitle: p.title, iteration: p.iteration, total: p.total, prNumber: undefined, prUrl: undefined }));
    };
    const onPhase = (p: QuetzEvent['loop:phase']) => {
      setState(prev => ({
        ...prev,
        phase: p.phase,
        ...(p.phase === 'agent_running' && p.detail ? { agentModel: p.detail } : {}),
      }));
    };
    const onPR = (p: QuetzEvent['loop:pr_found']) => {
      setState(prev => ({ ...prev, prNumber: p.number, prUrl: p.url }));
    };
    const onStart = (p: QuetzEvent['loop:start']) => {
      setState(prev => ({ ...prev, total: p.total }));
    };

    bus.on('loop:issue_pickup', onPickup);
    bus.on('loop:phase', onPhase);
    bus.on('loop:pr_found', onPR);
    bus.on('loop:start', onStart);

    const timer = setInterval(() => {
      const ms = Date.now() - startRef.current;
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      setState(prev => ({ ...prev, elapsed: `${minutes}m ${String(seconds).padStart(2, '0')}s` }));
    }, 1000);

    return () => {
      bus.off('loop:issue_pickup', onPickup);
      bus.off('loop:phase', onPhase);
      bus.off('loop:pr_found', onPR);
      bus.off('loop:start', onStart);
      clearInterval(timer);
    };
  }, [bus]);

  return state;
}

export function useSessionHistory(bus: QuetzBus, maxSessions: number = 20): SessionHistoryState {
  const [state, setState] = useState<SessionHistoryState>(() => createSessionHistoryState());

  useEffect(() => {
    const apply = (event: Parameters<typeof reduceSessionHistory>[1]) => {
      setState(prev => reduceSessionHistory(prev, event, maxSessions));
    };

    const onPickup = (payload: QuetzEvent['loop:issue_pickup']) => apply({ type: 'loop:issue_pickup', payload });
    const onPhase = (payload: QuetzEvent['loop:phase']) => apply({ type: 'loop:phase', payload });
    const onText = (payload: QuetzEvent['agent:text']) => apply({ type: 'agent:text', payload });
    const onToolDone = (payload: QuetzEvent['agent:tool_done']) => apply({ type: 'agent:tool_done', payload });
    const onStderr = (payload: QuetzEvent['agent:stderr']) => apply({ type: 'agent:stderr', payload });
    const onMerged = () => apply({ type: 'loop:merged' });
    const onCommit = () => apply({ type: 'loop:commit_landed' });
    const onAmend = () => apply({ type: 'loop:amend_complete' });
    const onFailure = () => apply({ type: 'loop:failure' });

    bus.on('loop:issue_pickup', onPickup);
    bus.on('loop:phase', onPhase);
    bus.on('agent:text', onText);
    bus.on('agent:tool_done', onToolDone);
    bus.on('agent:stderr', onStderr);
    bus.on('loop:merged', onMerged);
    bus.on('loop:commit_landed', onCommit);
    bus.on('loop:amend_complete', onAmend);
    bus.on('loop:failure', onFailure);

    return () => {
      bus.off('loop:issue_pickup', onPickup);
      bus.off('loop:phase', onPhase);
      bus.off('agent:text', onText);
      bus.off('agent:tool_done', onToolDone);
      bus.off('agent:stderr', onStderr);
      bus.off('loop:merged', onMerged);
      bus.off('loop:commit_landed', onCommit);
      bus.off('loop:amend_complete', onAmend);
      bus.off('loop:failure', onFailure);
    };
  }, [bus, maxSessions]);

  return state;
}
