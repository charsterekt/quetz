import React from 'react';
import { ink } from './ink-imports.js';
import { colors, phaseIcons } from './theme.js';
import { usePhase } from './hooks.js';
import type { QuetzBus } from '../events.js';

interface StatusBarProps {
  bus: QuetzBus;
}

export const StatusBar: React.FC<StatusBarProps> = ({ bus }) => {
  const { Box, Text } = ink();
  const state = usePhase(bus);

  const icon = phaseIcons[state.phase] || ' ';
  const prLabel = state.prNumber ? `PR #${state.prNumber}` : '---';

  return (
    <Box borderStyle="single" borderColor={colors.border} paddingX={1}>
      <Text color={colors.brand} bold>{icon}</Text>
      <Text> Issue {state.iteration}/{state.total}</Text>
      <Text dimColor> | </Text>
      <Text color={colors.issue}>{state.issueId || '---'}</Text>
      <Text dimColor> | </Text>
      <Text color={state.phase === 'error' ? colors.error : colors.warning}>
        {state.phase.replace(/_/g, ' ')}
      </Text>
      <Text dimColor> | </Text>
      <Text>PR: {prLabel}</Text>
      <Text dimColor> | </Text>
      <Text dimColor>{state.elapsed}</Text>
    </Box>
  );
};
