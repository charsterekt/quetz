import React, { useCallback } from 'react';
import { ink } from './ink-imports.js';
import { colors } from './theme.js';
import { useProgress } from './hooks.js';
import { AgentPanel } from './AgentPanel.js';
import { QuetzPanel } from './QuetzPanel.js';
import { StatusBar } from './StatusBar.js';
import type { QuetzBus } from '../events.js';

interface AppProps {
  bus: QuetzBus;
  onQuit?: () => void;
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const { Text } = ink();
  const width = 20;
  const filled = total > 0 ? Math.round((current / total) * width) : 0;
  const empty = width - filled;
  const bar = '\u25B0'.repeat(filled) + '\u25B1'.repeat(empty);
  return <Text dimColor>{bar} {current}/{total}</Text>;
}

export const App: React.FC<AppProps> = ({ bus, onQuit }) => {
  const { Box, Text, useInput, useApp } = ink();
  const progress = useProgress(bus);
  const { exit } = useApp();

  const handleQuit = useCallback(() => {
    if (onQuit) onQuit();
    exit();
  }, [onQuit, exit]);

  useInput((input: string, key: { upArrow: boolean; downArrow: boolean }) => {
    if (input === 'q') handleQuit();
    if (key.upArrow) (bus as any)._agentScroll?.('up');
    if (key.downArrow) (bus as any)._agentScroll?.('down');
  });

  return (
    <Box flexDirection="column" width="100%">
      {/* Title bar */}
      <Box borderStyle="single" borderColor={colors.border} paddingX={1} justifyContent="space-between">
        <Box>
          <Text bold color={colors.brandBold}>QUETZ</Text>
          <Text dimColor> The Feathered Serpent Dev Loop</Text>
        </Box>
        <Box>
          <ProgressBar current={progress.iteration > 0 ? progress.iteration - 1 : 0} total={progress.total} />
        </Box>
      </Box>

      {/* Main content: agent (75%) + quetz log (25%) */}
      <Box flexDirection="row" flexGrow={1}>
        <AgentPanel bus={bus} />
        <QuetzPanel bus={bus} />
      </Box>

      {/* Status bar */}
      <StatusBar bus={bus} />

      {/* Keyboard hint */}
      <Box paddingX={1}>
        <Text dimColor>q quit | arrows scroll agent</Text>
      </Box>
    </Box>
  );
};
