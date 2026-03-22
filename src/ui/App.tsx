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
  cwd?: string;
  branch?: string;
  version?: string;
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const { Text } = ink();
  const width = 20;
  const filled = total > 0 ? Math.round((current / total) * width) : 0;
  const empty = width - filled;
  const bar = '\u25B0'.repeat(filled) + '\u25B1'.repeat(empty);
  return <Text dimColor>{bar} {current}/{total}</Text>;
}

export const App: React.FC<AppProps> = ({ bus, onQuit, cwd = '', branch = '', version = '' }) => {
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
    if (input === '[') (bus as any)._quetzScroll?.('up');
    if (input === ']') (bus as any)._quetzScroll?.('down');
  });

  const rows = process.stdout.rows ?? 40;
  const cols = process.stdout.columns ?? 120;

  // Hard-coded widths prevent Yoga from expanding panels when a long text line
  // is briefly rendered before truncation kicks in (the "resize flicker" bug).
  // Quetz gets ~33 % of columns, minimum 36; agent gets the rest.
  const quetzWidth = Math.max(36, Math.round(cols * 0.33));
  const agentWidth = cols - quetzWidth;

  const cwdDisplay = cwd.replace(/\\/g, '/');
  const branchSuffix = branch ? `:${branch}` : '';
  const versionLabel = version ? `◆ v${version}` : '';

  return (
    <Box flexDirection="column" height={rows}>
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

      {/* Main content — explicit widths prevent layout flicker on long lines */}
      <Box flexDirection="row" flexGrow={1}>
        <AgentPanel bus={bus} width={agentWidth} />
        <QuetzPanel bus={bus} width={quetzWidth} />
      </Box>

      {/* Status bar */}
      <StatusBar bus={bus} />

      {/* Footer — opencode style: path:branch left, hints + version right */}
      <Box paddingX={1} justifyContent="space-between">
        <Text dimColor>{cwdDisplay}<Text color={colors.brand}>{branchSuffix}</Text></Text>
        <Text dimColor>q quit  ↑↓ agent  [ ] log  {versionLabel}</Text>
      </Box>
    </Box>
  );
};
