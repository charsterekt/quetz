import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ink } from './ink-imports.js';
import { colors } from './theme.js';
import { useEventLog, useProgress, useSessionHistory } from './hooks.js';
import { AgentPanel } from './AgentPanel.js';
import { QuetzPanel, QUETZ_EVENTS, formatQuetzEvent } from './QuetzPanel.js';
import { StatusBar } from './StatusBar.js';
import { HistoryPanel } from './HistoryPanel.js';
import { SessionDetailPanel } from './SessionDetailPanel.js';
import { FailureCard, type FailureData } from './components/FailureCard.js';
import { getRenderableRows, getVisiblePanelRows, useTerminalViewport } from './viewport.js';
import type { QuetzBus } from '../events.js';

interface AppProps {
  bus: QuetzBus;
  onQuit?: () => void;
  cwd?: string;
  branch?: string;
  version?: string;
}

type RightView = 'dashboard' | 'history' | 'detail';

const FAILURE_BANNER_ROWS = 3;

function ProgressBar({ current, total }: { current: number; total: number }) {
  const { Text } = ink();
  const width = 20;
  const filled = total > 0 ? Math.round((current / total) * width) : 0;
  const empty = width - filled;
  const bar = '■'.repeat(filled) + '□'.repeat(empty);
  return <Text dimColor>{bar} {current}/{total}</Text>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export const App: React.FC<AppProps> = ({ bus, onQuit, cwd = '', branch = '', version = '' }) => {
  const { Box, Text, useInput } = ink();
  const viewport = useTerminalViewport();
  const progress = useProgress(bus);
  const { completedSessions } = useSessionHistory(bus);
  const quetzLogFormatter = useMemo(() => formatQuetzEvent, []);
  const quetzLines = useEventLog(bus, QUETZ_EVENTS, quetzLogFormatter, 200);

  const [failureData, setFailureData] = useState<FailureData | null>(null);
  const [rightView, setRightView] = useState<RightView>('dashboard');
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(undefined);
  const [detailScrollOffset, setDetailScrollOffset] = useState(0);
  const [currentIssueId, setCurrentIssueId] = useState('');
  const failureBannerRows = failureData ? FAILURE_BANNER_ROWS : 0;
  const panelOverhead = 14 + failureBannerRows;
  const detailPanelOverhead = 16 + failureBannerRows;

  const selectedSession = useMemo(
    () => completedSessions.find(session => session.issueId === selectedSessionId),
    [completedSessions, selectedSessionId]
  );

  useEffect(() => {
    const onPickup = (p: { id: string }) => setCurrentIssueId(p.id);
    const onFailure = (payload: { reason: string; prNumber?: number }) => {
      setFailureData({
        issueId: currentIssueId,
        prNumber: payload.prNumber ?? null,
        reason: payload.reason,
      });
    };
    bus.on('loop:issue_pickup', onPickup);
    bus.on('loop:failure', onFailure);
    return () => {
      bus.off('loop:issue_pickup', onPickup);
      bus.off('loop:failure', onFailure);
    };
  }, [bus, currentIssueId]);

  useEffect(() => {
    if (completedSessions.length === 0) {
      setSelectedSessionId(undefined);
      if (rightView !== 'dashboard') setRightView('history');
      return;
    }

    if (!selectedSessionId || !completedSessions.some(session => session.issueId === selectedSessionId)) {
      setSelectedSessionId(completedSessions[0].issueId);
    }
  }, [completedSessions, selectedSessionId, rightView]);

  useEffect(() => {
    if (rightView === 'detail' && !selectedSession) {
      setRightView('history');
      setDetailScrollOffset(0);
    }
  }, [rightView, selectedSession]);

  const handleQuit = useCallback(() => {
    if (onQuit) onQuit();
  }, [onQuit]);

  const moveSelection = useCallback((delta: number) => {
    if (completedSessions.length === 0) return;
    const currentIndex = Math.max(
      0,
      completedSessions.findIndex(session => session.issueId === selectedSessionId)
    );
    const nextIndex = clamp(currentIndex + delta, 0, completedSessions.length - 1);
    setSelectedSessionId(completedSessions[nextIndex].issueId);
  }, [completedSessions, selectedSessionId]);

  useInput((input, key) => {
    const isCtrlC = input === '\x03' || (key.ctrl && input.toLowerCase() === 'c');

    if (input === 'q' || isCtrlC) {
      handleQuit();
      return;
    }

    if (input === 'h') {
      setRightView(prev => {
        if (prev === 'dashboard') return 'history';
        return prev;
      });
      if (!selectedSessionId && completedSessions[0]) {
        setSelectedSessionId(completedSessions[0].issueId);
      }
      return;
    }

    if (key.escape || input === 'b') {
      if (rightView === 'detail') {
        setRightView('history');
        setDetailScrollOffset(0);
        return;
      }
      if (rightView === 'history') {
        setRightView('dashboard');
        return;
      }
    }

    if (key.return && rightView === 'history' && selectedSessionId) {
      setRightView('detail');
      setDetailScrollOffset(0);
      return;
    }

    if (key.upArrow) {
      if (rightView === 'history') {
        moveSelection(-1);
        return;
      }
      if (rightView === 'detail') {
        const maxScroll = Math.max(0, (selectedSession?.lines.length ?? 0) - getVisiblePanelRows(viewport.rows, detailPanelOverhead));
        setDetailScrollOffset(prev => Math.min(prev + 3, maxScroll));
        return;
      }
      (bus as any)._agentScroll?.('up');
      return;
    }

    if (key.downArrow) {
      if (rightView === 'history') {
        moveSelection(1);
        return;
      }
      if (rightView === 'detail') {
        setDetailScrollOffset(prev => Math.max(0, prev - 3));
        return;
      }
      (bus as any)._agentScroll?.('down');
      return;
    }

    if (input === '[' && rightView === 'dashboard') {
      (bus as any)._quetzScroll?.('up');
      return;
    }

    if (input === ']' && rightView === 'dashboard') {
      (bus as any)._quetzScroll?.('down');
    }
  });

  const rows = getRenderableRows(viewport.rows);
  const cols = viewport.columns;
  const quetzWidth = Math.max(36, Math.round(cols * 0.33));
  const agentWidth = cols - quetzWidth;
  const panelVisibleHeight = getVisiblePanelRows(viewport.rows, panelOverhead);
  const detailVisibleHeight = getVisiblePanelRows(viewport.rows, detailPanelOverhead);

  const cwdDisplay = cwd.replace(/\\/g, '/');
  const branchSuffix = branch ? `:${branch}` : '';
  const versionLabel = version ? `◆ v${version}` : '';
  const footerHints = rightView === 'dashboard'
    ? 'q quit  ctrl+c quit  h runs  ↑↓ agent  [ ] log'
    : rightView === 'history'
      ? 'q quit  ctrl+c quit  esc dashboard  enter open  ↑↓ select'
      : 'q quit  ctrl+c quit  esc back  ↑↓ scroll';

  if (failureData) {
    const prNum = failureData.prNumber;
    const footerLine = `● ci failed  |  pr: ${prNum != null ? `#${prNum}` : '—'}  |  issue: ${failureData.issueId}  |  exit code 1`;
    return (
      <Box flexDirection="column" height={rows}>
        <Box borderStyle="single" borderColor={colors.border} paddingX={1} justifyContent="space-between">
          <Box>
            <Text bold color={colors.brandBold}>QUETZ</Text>
            <Text color={colors.error}> ✗</Text>
            <Text color={colors.border}>{' ···················'}</Text>
          </Box>
          <Box>
            <Text color={colors.error}>{progress.iteration}/{progress.total}</Text>
          </Box>
        </Box>

        <FailureCard data={failureData} termCols={cols} termRows={rows} />

        <Box paddingX={1}>
          <Text color={colors.error}>{footerLine}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={rows}>
      <Box borderStyle="single" borderColor={colors.border} paddingX={1} justifyContent="space-between">
        <Box>
          <Text bold color={colors.brandBold}>QUETZ</Text>
          <Text dimColor> The Feathered Serpent Dev Loop</Text>
        </Box>
        <Box>
          <ProgressBar current={progress.iteration > 0 ? progress.iteration - 1 : 0} total={progress.total} />
        </Box>
      </Box>

      <Box flexDirection="row" flexGrow={1}>
        <AgentPanel bus={bus} width={agentWidth} visibleHeight={panelVisibleHeight} />
        {rightView === 'dashboard' && <QuetzPanel bus={bus} lines={quetzLines} width={quetzWidth} visibleHeight={panelVisibleHeight} />}
        {rightView === 'history' && (
          <HistoryPanel
            sessions={completedSessions}
            selectedSessionId={selectedSessionId}
            width={quetzWidth}
          />
        )}
        {rightView === 'detail' && selectedSession && (
          <SessionDetailPanel
            session={selectedSession}
            width={quetzWidth}
            visibleHeight={detailVisibleHeight}
            scrollOffset={detailScrollOffset}
          />
        )}
      </Box>

      <StatusBar bus={bus} />

      <Box paddingX={1} justifyContent="space-between">
        <Text dimColor>{cwdDisplay}<Text color={colors.brand}>{branchSuffix}</Text></Text>
        <Text dimColor>{footerHints}  {versionLabel}</Text>
      </Box>
    </Box>
  );
};
