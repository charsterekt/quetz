import React, { useState, useEffect, useRef } from 'react';
import { ink } from './ink-imports.js';
import { colors, phaseIcons } from './theme.js';
import { usePhase } from './hooks.js';
import type { QuetzBus } from '../events.js';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

interface StatusBarProps {
  bus: QuetzBus;
}

export const StatusBar: React.FC<StatusBarProps> = ({ bus }) => {
  const { Box, Text } = ink();
  const state = usePhase(bus);

  // Local timer: component-level setInterval guarantees Ink re-renders every second.
  const [elapsed, setElapsed] = useState('0m 00s');
  const startRef = useRef(Date.now());

  useEffect(() => {
    const onPickup = () => { startRef.current = Date.now(); setElapsed('0m 00s'); };
    bus.on('loop:issue_pickup', onPickup);
    return () => { bus.off('loop:issue_pickup', onPickup); };
  }, [bus]);

  useEffect(() => {
    const id = setInterval(() => {
      if (state.issueId) setElapsed(formatElapsed(Date.now() - startRef.current));
    }, 1000);
    return () => clearInterval(id);
  }, [state.issueId]);

  const icon = phaseIcons[state.phase] || ' ';
  const prLabel = state.prNumber ? `#${state.prNumber}` : '---';
  const modeLabel = state.mode === 'amend' ? 'AMEND' : state.mode === 'commit' ? 'COMMIT' : 'PR';

  return (
    <Box borderStyle="single" borderColor={colors.dim} paddingX={1}>
      <Text color={colors.brand} bold>{icon}</Text>
      <Text> Issue {state.iteration}/{state.total}</Text>
      <Text dimColor> | </Text>
      <Text color={colors.issue}>{state.issueId || '---'}</Text>
      <Text dimColor> | </Text>
      <Text color={state.phase === 'error' ? colors.error : colors.warning}>
        {state.phase.replace(/_/g, ' ')}
      </Text>
      <Text dimColor> | </Text>
      {state.mode === 'pr'
        ? <Text>{modeLabel}: {prLabel}</Text>
        : <Text color={colors.brand}>{modeLabel}</Text>
      }
      <Text dimColor> | </Text>
      <Text dimColor>{elapsed}</Text>
    </Box>
  );
};
