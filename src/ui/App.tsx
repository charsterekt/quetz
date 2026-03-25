import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ink } from './ink-imports.js';
import { colors } from './theme.js';
import { useEventLog, useProgress, useSessionHistory } from './hooks.js';
import { AgentPanel } from './AgentPanel.js';
import { QuetzPanel, QUETZ_EVENTS, formatQuetzEvent } from './QuetzPanel.js';
import { StatusBar } from './StatusBar.js';
import { HistoryPanel } from './HistoryPanel.js';
import { FailureCard, type FailureData } from './components/FailureCard.js';
import { VictoryCard, type VictoryData } from './components/VictoryCard.js';
import { SessionDetailContent, SessionDetail, formatDuration, sessionDetailMaxOffset } from './components/SessionDetail.js';
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
  const [victoryData, setVictoryData] = useState<VictoryData | null>(null);
  const [rightView, setRightView] = useState<RightView>('dashboard');
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(undefined);
  const [detailScrollOffset, setDetailScrollOffset] = useState(0);
  const [currentIssueId, setCurrentIssueId] = useState('');
  const failureBannerRows = failureData ? FAILURE_BANNER_ROWS : 0;
  const panelOverhead = 14 + failureBannerRows;

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
    const onVictory = (payload: { issuesCompleted: number; totalTime: string; prsMerged: number }) => {
      setVictoryData({
        totalSessions: payload.issuesCompleted,
        totalTime: payload.totalTime,
        prsMerged: payload.prsMerged,
        sessionDate: new Date().toISOString().slice(0, 10),
      });
    };
    bus.on('loop:issue_pickup', onPickup);
    bus.on('loop:failure', onFailure);
    bus.on('loop:victory', onVictory);
    return () => {
      bus.off('loop:issue_pickup', onPickup);
      bus.off('loop:failure', onFailure);
      bus.off('loop:victory', onVictory);
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

  const rows = getRenderableRows(viewport.rows);
  const cols = viewport.columns;
  const quetzWidth = Math.max(36, Math.round(cols * 0.33));
  const agentWidth = cols - quetzWidth;
  const panelVisibleHeight = getVisiblePanelRows(viewport.rows, panelOverhead);

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
        setDetailScrollOffset(prev => Math.max(0, prev - 3));
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
        const totalLines = (selectedSession?.lines.length ?? 0) + 1; // +1 for summary
        const maxScroll = sessionDetailMaxOffset(totalLines, rows);
        setDetailScrollOffset(prev => Math.min(prev + 3, maxScroll));
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

  const cwdDisplay = cwd.replace(/\\/g, '/');
  const branchSuffix = branch ? `:${branch}` : '';
  const versionLabel = version ? `◆ v${version}` : '';
  const footerHints = rightView === 'dashboard'
    ? 'q quit  ctrl+c quit  h runs  ↑↓ agent  [ ] log'
    : rightView === 'history'
      ? 'q quit  ctrl+c quit  esc dashboard  enter open  ↑↓ select'
      : 'q quit  ctrl+c quit  esc back  ↑↓ scroll';

  if (victoryData) {
    const snake = '~*~*~*~*~*~*~*~*~*~*~*~*~*~>';
    const total = progress.total || victoryData.totalSessions;
    const footerRight = version ? `q quit  ◆ v${version}` : 'q quit';
    return (
      <Box flexDirection="column" height={rows}>
        <Box borderStyle="single" borderColor={colors.border} paddingX={1} justifyContent="space-between">
          <Box>
            <Text bold color={colors.brandBold}>QUETZ</Text>
            <Text color={colors.brand}> {snake}</Text>
          </Box>
          <Box>
            <Text color={colors.brand} bold>{total}/{total}  [done]</Text>
          </Box>
        </Box>

        <VictoryCard data={victoryData} termCols={cols} termRows={rows} />

        <Box paddingX={1} justifyContent="space-between">
          <Text color={colors.brand}>◆ all done  |  exit code 0</Text>
          <Text dimColor>{footerRight}</Text>
        </Box>
      </Box>
    );
  }

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

  // Derive session detail display values (only relevant when rightView === 'detail')
  const detailDuration = selectedSession
    ? formatDuration(selectedSession.finishedAt - selectedSession.startedAt)
    : '';
  const detailPrNum = selectedSession ? (selectedSession as any).prNumber as number | undefined : undefined;
  const detailPrStr = detailPrNum != null ? `pr #${detailPrNum}` : '—';
  const isDetail = rightView === 'detail' && !!selectedSession;

  return (
    <Box flexDirection="column" height={rows}>
      {/* Header: session_detail variant when viewing a session, normal otherwise */}
      {isDetail ? (
        <Box borderStyle="single" borderColor="#2a2a2a" paddingX={1} justifyContent="space-between">
          <Box>
            <Text bold color="#FAFAFA">QUETZ</Text>
            <Text color="#6B7280"> The Feathered Serpent Dev Loop</Text>
          </Box>
          <Box>
            <Text color="#06B6D4">{'[ viewing session ]'}</Text>
            <Text color="#FAFAFA"> </Text>
            <Text color="#F59E0B">{`bg: ${selectedSession!.issueId}  |  agent running  |  ${detailDuration}`}</Text>
          </Box>
        </Box>
      ) : (
        <Box borderStyle="single" borderColor={colors.border} paddingX={1} justifyContent="space-between">
          <Box>
            <Text bold color={colors.brandBold}>QUETZ</Text>
            <Text dimColor> The Feathered Serpent Dev Loop</Text>
          </Box>
          <Box>
            <ProgressBar current={progress.iteration > 0 ? progress.iteration - 1 : 0} total={progress.total} />
          </Box>
        </Box>
      )}

      {/* Body: AgentPanel ALWAYS at position 0 to preserve hook state across view changes.
          In detail mode it is hidden (width=0) so SessionDetailContent fills the full width. */}
      <Box flexDirection="row" flexGrow={1}>
        <AgentPanel
          bus={bus}
          width={isDetail ? 0 : agentWidth}
          visibleHeight={isDetail ? 0 : panelVisibleHeight}
        />
        {isDetail && selectedSession && (
          <SessionDetailContent
            session={selectedSession}
            scrollOffset={detailScrollOffset}
            termRows={rows}
          />
        )}
        {!isDetail && rightView === 'dashboard' && (
          <QuetzPanel bus={bus} lines={quetzLines} width={quetzWidth} visibleHeight={panelVisibleHeight} />
        )}
        {!isDetail && rightView === 'history' && (
          <HistoryPanel
            sessions={completedSessions}
            selectedSessionId={selectedSessionId}
            width={quetzWidth}
          />
        )}
      </Box>

      {/* StatusBar: only in non-detail modes */}
      {!isDetail && <StatusBar bus={bus} />}

      {/* Footer: session_detail variant or normal */}
      {isDetail ? (
        <Box paddingX={3} justifyContent="space-between">
          <Text color="#4B5563">{`${selectedSession!.issueId}  |  ${detailPrStr}  |  ${detailDuration}`}</Text>
          <Text color="#F59E0B">{`esc back  ↑↓ scroll  ◆ v${version || '0.1.0'}`}</Text>
        </Box>
      ) : (
        <Box paddingX={1} justifyContent="space-between">
          <Text dimColor>{cwdDisplay}<Text color={colors.brand}>{branchSuffix}</Text></Text>
          <Text dimColor>{footerHints}  {versionLabel}</Text>
        </Box>
      )}
    </Box>
  );
};
