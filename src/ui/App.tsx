import React, { useCallback, useState, useEffect } from 'react';
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
  const { Box, Text, useInput } = ink();
  const progress = useProgress(bus);

  const [failureReason, setFailureReason] = useState<string | null>(null);
  useEffect(() => {
    const onFailure = (p: { reason: string }) => setFailureReason(p.reason);
    bus.on('loop:failure', onFailure);
    return () => { bus.off('loop:failure', onFailure); };
  }, [bus]);

  // Don't call Ink's exit() here — cli.ts drives the process lifecycle via
  // process.exit(). Calling exit() would trigger a double-unmount race that
  // writes Ink cleanup sequences after the alt-screen restore, causing artifacts.
  const handleQuit = useCallback(() => {
    if (onQuit) onQuit();
  }, [onQuit]);

  useInput((input: string, key: { upArrow: boolean; downArrow: boolean }) => {
    // \x03 is raw Ctrl+C (ETX) — sent when stdin is in raw mode (MINGW64).
    // In raw mode, SIGINT is suppressed so the process.once('SIGINT') handler
    // never fires; we must handle it here as a keypress instead.
    if (input === 'q' || input === '\x03') handleQuit();
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

      {/* Error bar — shown when loop:failure fires; prompts user to press q */}
      {failureReason && (
        <Box paddingX={1} borderStyle="single" borderColor={colors.error}>
          <Text color={colors.error} bold>✗ </Text>
          <Text color={colors.error}>{failureReason}</Text>
          <Text dimColor>  —  press </Text>
          <Text bold>q</Text>
          <Text dimColor> to quit</Text>
        </Box>
      )}

      {/* Footer — path:branch left, hints + version right */}
      <Box paddingX={1} justifyContent="space-between">
        <Text dimColor>{cwdDisplay}<Text color={colors.brand}>{branchSuffix}</Text></Text>
        <Text dimColor>q quit  ↑↓ agent  [ ] log  {versionLabel}</Text>
      </Box>
    </Box>
  );
};
