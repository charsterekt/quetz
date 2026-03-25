import React, { useState, useEffect, useRef } from 'react';
import { ink } from '../ink-imports.js';
import chalk from 'chalk';
import type { QuetzBus, QuetzEvent, QuetzPhase } from '../../events.js';

const c = {
  brand:  chalk.hex('#10B981'),
  accent: chalk.hex('#F59E0B'),
  error:  chalk.hex('#EF4444'),
  muted:  chalk.hex('#4B5563'),
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export type FooterVariant = 'normal' | 'victory' | 'failure' | 'detail';

export interface FooterProps {
  bus: QuetzBus;
  version?: string;
  variant?: FooterVariant;
  // failure variant
  failureIssueId?: string;
  failurePrNumber?: number | null;
  // detail variant
  detailSessionId?: string;
  detailPrStr?: string;
  detailDuration?: string;
}

interface FooterState {
  phase: QuetzPhase;
  issueId: string;
  iteration: number;
  total: number;
  prNumber?: number;
}

export const Footer: React.FC<FooterProps> = ({
  bus,
  version = '0.1.0',
  variant = 'normal',
  failureIssueId = '',
  failurePrNumber,
  detailSessionId = '',
  detailPrStr = '—',
  detailDuration = '',
}) => {
  const { Box, Text } = ink();

  const [state, setState] = useState<FooterState>({
    phase: 'idle',
    issueId: '',
    iteration: 0,
    total: 0,
  });

  const [elapsed, setElapsed] = useState('0m 00s');
  const startRef = useRef(Date.now());

  useEffect(() => {
    const onPickup = (p: QuetzEvent['loop:issue_pickup']) => {
      setState(prev => ({
        ...prev,
        issueId: p.id,
        iteration: p.iteration,
        total: p.total,
        prNumber: undefined,
      }));
      startRef.current = Date.now();
      setElapsed('0m 00s');
    };
    const onPhase = (p: QuetzEvent['loop:phase']) => {
      setState(prev => ({ ...prev, phase: p.phase }));
    };
    const onPR = (p: QuetzEvent['loop:pr_found']) => {
      setState(prev => ({ ...prev, prNumber: p.number }));
    };
    const onStart = (p: QuetzEvent['loop:start']) => {
      setState(prev => ({ ...prev, total: p.total }));
    };

    bus.on('loop:issue_pickup', onPickup);
    bus.on('loop:phase', onPhase);
    bus.on('loop:pr_found', onPR);
    bus.on('loop:start', onStart);

    return () => {
      bus.off('loop:issue_pickup', onPickup);
      bus.off('loop:phase', onPhase);
      bus.off('loop:pr_found', onPR);
      bus.off('loop:start', onStart);
    };
  }, [bus]);

  // Elapsed ticks every 1s; only this segment changes — surrounding cells are unaffected.
  useEffect(() => {
    const id = setInterval(() => {
      if (state.issueId) {
        setElapsed(formatElapsed(Date.now() - startRef.current));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [state.issueId]);

  const isPolling = state.phase === 'pr_polling';
  const versionStr = `◆ v${version}`;

  // Session detail variant
  if (variant === 'detail') {
    const leftText = `  ${detailSessionId}  |  ${detailPrStr}  |  ${detailDuration}`;
    const rightText = `esc back  ↑↓ scroll  ${versionStr}`;
    return (
      <Box paddingX={3} justifyContent="space-between">
        <Text>{c.muted(leftText)}</Text>
        <Text>{c.accent(rightText)}</Text>
      </Box>
    );
  }

  // Victory variant
  if (variant === 'victory') {
    const leftText = '◆ all done  |  exit code 0';
    const rightText = `q quit  ${versionStr}`;
    return (
      <Box paddingX={2} justifyContent="space-between">
        <Text>{c.brand(leftText)}</Text>
        <Text>{c.muted(rightText)}</Text>
      </Box>
    );
  }

  // Failure variant
  if (variant === 'failure') {
    const prStr = failurePrNumber != null ? `#${failurePrNumber}` : '—';
    const leftText = `● ci failed  |  pr: ${prStr}  |  issue: ${failureIssueId}  |  exit code 1`;
    const rightText = `q quit  ${versionStr}`;
    return (
      <Box paddingX={2} justifyContent="space-between">
        <Text>{c.error(leftText)}</Text>
        <Text>{c.muted(rightText)}</Text>
      </Box>
    );
  }

  // Normal variant: running or polling
  const rightText = `q quit  ↑↓ agent  [ ] log  ${versionStr}`;

  if (isPolling) {
    const prStr = state.prNumber != null ? `#${state.prNumber}` : '—';
    const leftText = `◐ polling  |  issue: ${state.issueId}  |  pr: ${prStr}  |  ${elapsed}`;
    return (
      <Box paddingX={2} justifyContent="space-between">
        <Text>{c.accent(leftText)}</Text>
        <Text>{c.muted(rightText)}</Text>
      </Box>
    );
  }

  const leftText = `◆ running  |  issue: ${state.issueId}  |  ${state.iteration}/${state.total}  |  ${elapsed}`;
  return (
    <Box paddingX={2} justifyContent="space-between">
      <Text>{c.brand(leftText)}</Text>
      <Text>{c.muted(rightText)}</Text>
    </Box>
  );
};
