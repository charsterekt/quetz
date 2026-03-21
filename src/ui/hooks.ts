import { useState, useEffect, useRef } from 'react';
import type { QuetzBus, QuetzEventName, QuetzEvent, QuetzPhase } from '../events.js';

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
      setState(prev => ({ ...prev, phase: p.phase }));
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
