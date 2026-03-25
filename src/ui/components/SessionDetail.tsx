import React from 'react';
import { ink } from '../ink-imports.js';
import chalk from 'chalk';
import type { CompletedSession, SessionTranscriptLine } from '../session-history.js';

const c = {
  brand:   chalk.hex('#10B981'),
  accent:  chalk.hex('#F59E0B'),
  cyan:    chalk.hex('#06B6D4'),
  dim:     chalk.hex('#6B7280'),
  muted:   chalk.hex('#4B5563'),
  text:    chalk.hex('#FAFAFA'),
  border:  chalk.hex('#2a2a2a'),
  error:   chalk.hex('#EF4444'),
  sbThumb: chalk.hex('#3F3F3F'),
  sbTrack: chalk.hex('#141414'),
};

export interface SessionDetailProps {
  session: CompletedSession;
  scrollOffset: number;
  termCols: number;
  termRows: number;
  version?: string;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function formatDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

// total: total number of lines; visible: rows in log viewport; offset: first visible line index
function renderScrollbar(total: number, visible: number, offset: number): string[] {
  if (total <= visible) return Array(visible).fill(' ');
  const thumbSize = Math.max(3, Math.round((visible / total) * visible));
  const maxOffset = total - visible;
  const thumbPos = maxOffset > 0
    ? Math.round((offset / maxOffset) * (visible - thumbSize))
    : 0;
  return Array.from({ length: visible }, (_, i) =>
    (i >= thumbPos && i < thumbPos + thumbSize)
      ? c.sbThumb('█')
      : c.sbTrack('░')
  );
}

type DisplayLine =
  | { kind: 'prose'; text: string }
  | { kind: 'tool'; name: string; args: string }
  | { kind: 'error'; text: string }
  | { kind: 'summary'; text: string }
  | { kind: 'empty' };

function toDisplayLine(line: SessionTranscriptLine): DisplayLine {
  if (line.type === 'tool') {
    const match = line.text.match(/^\[([^\]]+)\]\s*(.*)$/s);
    const name = match?.[1] ?? line.toolName ?? '';
    const args = (match?.[2] ?? '').replace(/\n/g, ' ').slice(0, 200);
    return { kind: 'tool', name, args };
  }
  if (line.type === 'stderr') {
    return { kind: 'error', text: line.text };
  }
  if (!line.text.trim()) return { kind: 'empty' };
  return { kind: 'prose', text: line.text };
}

function LogLineNode({ line, idx }: { line: DisplayLine; idx: number }) {
  const { Text } = ink();
  if (line.kind === 'empty') return <Text key={idx}> </Text>;
  if (line.kind === 'tool') {
    return (
      <Text key={idx} wrap="truncate">
        {c.cyan(`▸ ${line.name.padEnd(8)}  ${line.args}`)}
      </Text>
    );
  }
  if (line.kind === 'error') {
    return (
      <Text key={idx} wrap="truncate">
        {c.error(`  ${line.text}`)}
      </Text>
    );
  }
  if (line.kind === 'summary') {
    return (
      <Text key={idx} bold wrap="truncate">
        {c.accent(line.text)}
      </Text>
    );
  }
  // prose
  return (
    <Text key={idx} wrap="truncate">
      {c.text(line.text)}
    </Text>
  );
}

function buildDisplayLines(session: CompletedSession): DisplayLine[] {
  const duration = formatDuration(session.finishedAt - session.startedAt);
  const isSuccess = session.outcome !== 'failed';
  const prNum = (session as any).prNumber as number | undefined;
  const prStr = prNum != null ? `pr #${prNum}` : '—';
  const summaryLine: DisplayLine = {
    kind: 'summary',
    text: `✓ session ${session.issueId}  |  ${duration}  |  ${prStr}  |  ${isSuccess ? 'merged' : 'failed'}`,
  };
  return [...session.lines.map(toDisplayLine), summaryLine];
}

// Layout constants (shared between full-screen and embedded content versions):
//   header(3) + infoBar(1) + logPaddingV(2) + footer(1) = 7 rows of overhead
const DETAIL_OVERHEAD_ROWS = 7;

/** Body content only (info bar + log + scrollbar). Used when App.tsx provides header/footer. */
export interface SessionDetailContentProps {
  session: CompletedSession;
  scrollOffset: number;
  termRows: number;
}

export const SessionDetailContent: React.FC<SessionDetailContentProps> = ({
  session, scrollOffset, termRows,
}) => {
  const { Box, Text } = ink();

  const duration = formatDuration(session.finishedAt - session.startedAt);
  const date = formatDate(session.finishedAt);
  const isSuccess = session.outcome !== 'failed';
  const outcomeIcon = isSuccess ? '✓' : '✗';
  const prNum = (session as any).prNumber as number | undefined;
  const prStr = prNum != null ? `pr #${prNum}` : '—';

  const allDisplayLines = buildDisplayLines(session);
  const logRows = Math.max(1, termRows - DETAIL_OVERHEAD_ROWS);
  const totalLines = allDisplayLines.length;
  const maxOffset = Math.max(0, totalLines - logRows);
  const effectiveOffset = Math.min(scrollOffset, maxOffset);
  const visibleLines = allDisplayLines.slice(effectiveOffset, effectiveOffset + logRows);
  while (visibleLines.length < logRows) visibleLines.push({ kind: 'empty' });

  const scrollbarChars = renderScrollbar(totalLines, logRows, effectiveOffset);

  const breadcrumb = `← sessions  /  ${session.issueId}`;
  const metaRight = `${outcomeIcon} ${session.issueId}  |  ${prStr}  |  ${duration}  |  ${date}`;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Info bar */}
      <Box paddingX={1} justifyContent="space-between">
        <Text>{c.dim(breadcrumb)}</Text>
        <Text>{c.dim(metaRight)}</Text>
      </Box>

      {/* Log content */}
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" flexGrow={1} paddingX={3} paddingY={1}>
          {visibleLines.map((line, i) => (
            <LogLineNode key={i} line={line} idx={i} />
          ))}
        </Box>
        <Box flexDirection="column" width={1}>
          {scrollbarChars.map((char, i) => (
            <Text key={i}>{char}</Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

/** Full-screen standalone component (all 4 zones). */
export const SessionDetail: React.FC<SessionDetailProps> = ({
  session, scrollOffset, termRows, version = '0.1.0',
}) => {
  const { Box, Text } = ink();

  const duration = formatDuration(session.finishedAt - session.startedAt);
  const isSuccess = session.outcome !== 'failed';
  const prNum = (session as any).prNumber as number | undefined;
  const prStr = prNum != null ? `pr #${prNum}` : '—';

  return (
    <Box flexDirection="column" height={termRows}>
      {/* Header — session_detail variant */}
      <Box borderStyle="single" borderColor="#2a2a2a" paddingX={1} justifyContent="space-between">
        <Box>
          <Text bold color="#FAFAFA">QUETZ</Text>
          <Text color="#6B7280"> The Feathered Serpent Dev Loop</Text>
        </Box>
        <Box>
          <Text>{c.cyan('[ viewing session ]')}</Text>
          <Text color="#FAFAFA"> </Text>
          <Text>{c.accent(`bg: ${session.issueId}  |  agent running  |  ${duration}`)}</Text>
        </Box>
      </Box>

      {/* Info bar + log (shared body content) */}
      <SessionDetailContent session={session} scrollOffset={scrollOffset} termRows={termRows} />

      {/* Footer */}
      <Box paddingX={3} justifyContent="space-between">
        <Text>{c.muted(`${session.issueId}  |  ${prStr}  |  ${duration}`)}</Text>
        <Text>{c.accent(`esc back  ↑↓ scroll  ◆ v${version}`)}</Text>
      </Box>
    </Box>
  );
};

/** Max scroll offset for the log viewport. Used by App.tsx key handler. */
export function sessionDetailMaxOffset(totalLines: number, termRows: number): number {
  const logRows = Math.max(1, termRows - DETAIL_OVERHEAD_ROWS);
  return Math.max(0, totalLines - logRows);
}
